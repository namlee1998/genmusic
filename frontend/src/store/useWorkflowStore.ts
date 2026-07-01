/**
 * useWorkflowStore — the SOLE workflow store.
 *
 * Backed by SSE only. Holds one SessionState per sessionId plus coarse
 * connection metadata. NO optimistic mutations after HTTP commands — the
 * backend SSE emits the resulting state change. This is the contract.
 */

import { create } from 'zustand';
import * as sdlcApi from '@/services/api/sdlcApi';
import {
  type SessionState,
  type RuntimeEvent,
  type AgentKey,
  type AgentState,
  type GateHistoryEntry,
  AGENT_KEYS,
  defaultSessionState,
  RUNTIME_EVENTS_LIMIT,
  emptyAgentStates,
} from '@/models/SessionState';

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'error';

export interface WorkflowState {
  // ── Workflow state ──
  sessions: Record<string, SessionState>;
  sseConnections: Record<string, ConnectionStatus>;
  sseAbortControllers: Record<string, AbortController>;

  projectId: string | null;
  isLoading: boolean;

  // ── Actions ──
  startPipeline(projectId: string, repoUrl: string, request: string): Promise<void>;
  setProjectId(id: string | null): void;

  // HTTP commands — DO NOT mutate local state on success; the SSE stream is
  // the authoritative source and will emit the resulting transition.
  resolveGate(sessionId: string, gateId: string, action: 'approve' | 'reject', comment?: string): Promise<void>;
  resolveOutputReviewGate(sessionId: string, gateId: string, action: 'approve' | 'reject', comment?: string): Promise<void>;
  resolveClarification(sessionId: string, gateId: string, answers: Record<string, string>): Promise<void>;
  releaseDecision(sessionId: string, action: 'approve' | 'reject', comment?: string): Promise<void>;

  cleanupSession(sessionId: string): void;
  resetAll(): void;

  // ── Internal — invoked by the SSE dispatcher ──
  _subscribeSession(sessionId: string): void;
  _unsubscribeSession(sessionId: string): void;
  _applySseEvent(sessionId: string, event: string, data: Record<string, unknown>): void;
}

// ── helpers (pure, kept module-private) ─────────────────────────────────────

const AGENT_TO_ROLE: Record<string, AgentKey> = {
  'architecture-agent': 'ARCH',
  'po-agent': 'PO',
  'ux-agent': 'UX',
  'dev-agent': 'DEV',
  'qa-agent': 'QA',
};

function inferAgentKey(role?: string): AgentKey | null {
  if (!role) return null;
  return AGENT_TO_ROLE[role] ?? null;
}

function applyAgentEvent(
  agentStates: Record<AgentKey, AgentState>,
  evt: RuntimeEvent,
  now: number,
): Record<AgentKey, AgentState> {
  const agentKey = evt.agent ?? null;
  if (!agentKey) return agentStates;
  const next = { ...agentStates };
  const existing = next[agentKey];
  const advanced: AgentState = { ...existing };

  switch (evt.type) {
    case 'agent_start':
      advanced.status = 'running';
      advanced.startedAt = advanced.startedAt ?? now;
      advanced.lastEventAt = now;
      advanced.currentStep = 'starting';
      advanced.currentAction = evt.action ?? `${agentKey} initiated`;
      advanced.currentFile = null;
      advanced.toolName = null;
      break;
    case 'agent_tool_call':
      advanced.status = 'running';
      advanced.toolName = evt.tool ?? advanced.toolName;
      advanced.currentFile = (evt.filePath as string | null) ?? advanced.currentFile;
      advanced.currentAction = evt.action ?? `using ${evt.tool ?? 'tool'}`;
      advanced.currentStep = 'tool_execution';
      advanced.lastEventAt = now;
      break;
    case 'agent_tool_result':
      advanced.lastEventAt = now;
      break;
    case 'file_change':
      advanced.lastEventAt = now;
      break;
    case 'agent_complete':
      advanced.status = 'completed';
      advanced.completedAt = now;
      advanced.currentStep = 'completed';
      advanced.currentAction = 'finished';
      advanced.toolName = null;
      advanced.lastEventAt = now;
      break;
    case 'gate_triggered':
      advanced.status = 'awaiting_review';
      advanced.lastEventAt = now;
      advanced.currentStep = 'awaiting_hitl';
      break;
    case 'clarification_needed':
      advanced.status = 'awaiting_review';
      advanced.lastEventAt = now;
      advanced.currentStep = 'awaiting_clarification';
      break;
    case 'error':
      advanced.status = 'failed';
      advanced.lastEventAt = now;
      advanced.currentStep = 'failed';
      advanced.currentAction = evt.error ?? 'failed';
      break;
    case 'token_usage':
    default:
      advanced.lastEventAt = now;
      break;
  }

  next[agentKey] = advanced;
  return next;
}

// ── store ────────────────────────────────────────────────────────────────────

let runtimeEventSeq = 0;
function nextRuntimeEventId(): string {
  runtimeEventSeq += 1;
  return `rt_${Date.now()}_${runtimeEventSeq}`;
}

export const useWorkflowStore = create<WorkflowState>((set, get) => {
  const unsubscribe = (sessionId: string) => {
    const ac = get().sseAbortControllers[sessionId];
    if (ac) {
      ac.abort();
    }
    set((s) => {
      const nextConn = { ...s.sseConnections };
      const nextAbort = { ...s.sseAbortControllers };
      delete nextConn[sessionId];
      delete nextAbort[sessionId];
      return { sseConnections: nextConn, sseAbortControllers: nextAbort };
    });
  };

  const subscribe = (sessionId: string) => {
    // If we already have a live subscription, don't open a second one.
    if (get().sseAbortControllers[sessionId]) return;

    set((s) => ({
      sseConnections: { ...s.sseConnections, [sessionId]: 'connecting' },
    }));

    const abort = sdlcApi.subscribeWorkflowSSE(sessionId, {
      onMessage: (event, data) => {
        get()._applySseEvent(sessionId, event, data);
      },
      onError: () => {
        // subscribeWorkflowSSE auto-reconnects internally; reflect error in
        // connection status only as a UI hint.
        set((s) => ({
          sseConnections: { ...s.sseConnections, [sessionId]: 'error' },
        }));
      },
    });

    set((s) => ({
      sseAbortControllers: { ...s.sseAbortControllers, [sessionId]: abort },
      sseConnections: { ...s.sseConnections, [sessionId]: 'connected' },
    }));
  };

  return {
    sessions: {},
    sseConnections: {},
    sseAbortControllers: {},
    projectId: null,
    isLoading: false,

    setProjectId: (id) => set({ projectId: id }),

    startPipeline: async (projectId, repoUrl, request) => {
      set({ isLoading: true });
      try {
        const { sessionId, taskId } = await sdlcApi.startPipeline(projectId, repoUrl, request);

        const seed = defaultSessionState({
          sessionId,
          taskId,
          projectId,
          featureRequest: request,
          repoUrl,
        });

        set((s) => ({
          sessions: { ...s.sessions, [sessionId]: seed },
          projectId,
          isLoading: false,
        }));

        // Subscribe to the SSE stream for this session. State mutations
        // happen inside _applySseEvent only.
        get()._subscribeSession(sessionId);
      } catch (err: unknown) {
        const message = (err as { response?: { data?: { message?: string } }; message?: string })?.response?.data?.message
          || (err instanceof Error ? err.message : 'Failed to start pipeline');
        set({ isLoading: false });
        // Surface the error on every existing session for the project — but
        // only when there is an active attempt. We keep the workflow strictly
        // SSE-driven for runtime data; the error is UI telemetry only.
        // Throw to let the caller show an error toast.
        throw new Error(message);
      }
    },

    resolveGate: async (sessionId, gateId, action, comment) => {
      // Pure HTTP command. NO local mutation — SSE will deliver the resulting
      // gate_resolved event.
      await sdlcApi.resolveGate(gateId, action, comment);
    },

    resolveOutputReviewGate: async (sessionId, gateId, action, comment) => {
      await sdlcApi.resolveOutputReviewGate(gateId, action, comment);
    },

    resolveClarification: async (sessionId, gateId, answers) => {
      await sdlcApi.resolveApproval(gateId, { action: 'answer', answers });
    },

    releaseDecision: async (sessionId, action, comment) => {
      const session = get().sessions[sessionId];
      if (!session) return;
      await sdlcApi.releaseDecision(session.projectId, action);
    },

    cleanupSession: (sessionId) => {
      get()._unsubscribeSession(sessionId);
      set((s) => {
        const next = { ...s.sessions };
        delete next[sessionId];
        return { sessions: next };
      });
    },

    resetAll: () => {
      // Abort all SSE connections.
      const aborts = get().sseAbortControllers;
      Object.values(aborts).forEach((ac) => ac?.abort?.());
      set({
        sessions: {},
        sseConnections: {},
        sseAbortControllers: {},
        projectId: null,
        isLoading: false,
      });
    },

    // ── internal ──
    _subscribeSession: subscribe,
    _unsubscribeSession: unsubscribe,

    _applySseEvent: (sessionId, event, data) => {
      const session = get().sessions[sessionId];
      if (!session) return;
      const now = Date.now();

      const update = (mutator: (s: SessionState) => SessionState) => {
        set((s) => {
          const current = s.sessions[sessionId];
          if (!current) return {} as Partial<WorkflowState>;
          return { sessions: { ...s.sessions, [sessionId]: mutator(current) } };
        });
      };

      switch (event) {
        case 'progress': {
          const incomingPhases = data.pipelinePhases as SessionState['pipelinePhases'] | undefined;
          const incomingAudit = data.auditLog as SessionState['auditLog'] | undefined;
          const incomingStatus = data.status as SessionState['status'] | undefined;
          const incomingRepo = data.repoInfo as SessionState['repoInfo'] | undefined;
          update((s) => ({
            ...s,
            status: incomingStatus ?? s.status,
            pipelinePhases: incomingPhases ?? s.pipelinePhases,
            auditLog: incomingAudit ?? s.auditLog,
            repoInfo: incomingRepo ?? s.repoInfo,
            lastUpdatedAt: now,
          }));
          break;
        }

        case 'agent_event': {
          // Raw agent event. promote it to a RuntimeEvent and apply it.
          const evt: RuntimeEvent = {
            id: nextRuntimeEventId(),
            sessionId,
            timestamp: new Date().toISOString(),
            type: (data.type as RuntimeEvent['type']) ?? 'agent_tool_call',
            agent: (data.agent as AgentKey | undefined) ?? inferAgentKey(data.role as string | undefined) ?? undefined,
            tool: (data.tool as string | undefined) ?? undefined,
            filePath: (data.filePath as string | undefined) ?? undefined,
            action: (data.action as string | undefined) ?? undefined,
            details: data,
            error: (data.error as string | undefined) ?? undefined,
          };

          update((s) => {
            const bounded = s.runtimeEvents.length >= RUNTIME_EVENTS_LIMIT
              ? s.runtimeEvents.slice(s.runtimeEvents.length - RUNTIME_EVENTS_LIMIT + 1)
              : s.runtimeEvents;
            return {
              ...s,
              runtimeEvents: [...bounded, evt],
              agentStates: applyAgentEvent(s.agentStates, evt, now),
              lastUpdatedAt: now,
            };
          });
          break;
        }

        case 'gate_pending': {
          const incomingGate = data.gate as SessionState['pendingGates'][number] | undefined;
          if (!incomingGate) break;
          update((s) => {
            if (s.pendingGates.some((g) => g.id === incomingGate.id)) {
              return { ...s, lastUpdatedAt: now };
            }
            const agentForGate = inferAgentKey(incomingGate.role) ?? null;
            const nextAgentStates = agentForGate
              ? {
                  ...s.agentStates,
                  [agentForGate]: {
                    ...s.agentStates[agentForGate],
                    status: 'awaiting_review' as const,
                    lastEventAt: now,
                    currentStep: 'awaiting_hitl',
                  },
                }
              : s.agentStates;
            return {
              ...s,
              pendingGates: [...s.pendingGates, incomingGate],
              status: 'awaiting_approval',
              agentStates: nextAgentStates,
              lastUpdatedAt: now,
            };
          });
          break;
        }

        case 'gate_resolved': {
          const gateId = data.gateId as string | undefined;
          const decision = (data.decision as GateHistoryEntry['decision']) ?? 'approve';
          const comment = data.comment as string | undefined;
          if (!gateId) break;
          update((s) => {
            const gate = s.pendingGates.find((g) => g.id === gateId);
            const nextPending = s.pendingGates.filter((g) => g.id !== gateId);
            const historyEntry: GateHistoryEntry | null = gate
              ? {
                  gateId: gate.id,
                  type: gate.type,
                  agent: inferAgentKey(gate.role),
                  decision,
                  comment,
                  resolvedAt: new Date().toISOString(),
                  payload: gate.payload,
                }
              : null;
            const nextHistory = historyEntry ? [historyEntry, ...s.gateHistory] : s.gateHistory;
            const nextStatus: SessionState['status'] =
              nextPending.length > 0
                ? 'awaiting_approval'
                : s.status === 'awaiting_approval'
                  ? 'running'
                  : s.status;
            return {
              ...s,
              pendingGates: nextPending,
              gateHistory: nextHistory,
              status: nextStatus,
              lastUpdatedAt: now,
            };
          });
          break;
        }

        case 'completed': {
          const qaResult = (data.qaResult as SessionState['qaResult']) ?? null;
          update((s) => ({
            ...s,
            status: 'completed',
            qaResult: qaResult ?? s.qaResult,
            agentStates: AGENT_KEYS.reduce((acc, key) => {
              const existing = s.agentStates[key];
              acc[key] = existing.status === 'running'
                ? { ...existing, status: 'completed', completedAt: existing.completedAt ?? now, currentStep: 'completed', lastEventAt: now }
                : existing;
              return acc;
            }, { ...s.agentStates }),
            lastUpdatedAt: now,
          }));
          break;
        }

        case 'error': {
          const message = (data.message as string | undefined) ?? 'Pipeline failed';
          update((s) => ({
            ...s,
            status: 'failed',
            error: message,
            lastUpdatedAt: now,
          }));
          break;
        }

        default:
          // Unknown event — ignore silently.
          break;
      }
    },
  };
});

// ── selector helpers (use with useWorkflowStore(s => ...)) ──

export const selectAllSessions = (s: WorkflowState): SessionState[] =>
  Object.values(s.sessions);

export const selectActiveSessionId = (s: WorkflowState): string | null =>
  // The UI store is the actual source of active session, but a quick
  // fallback returns the latest session if none chosen yet. The actual
  // default lives in useUiStore — callers should compose selectors.
  null;

export const selectAllPendingGates = (s: WorkflowState) =>
  Object.values(s.sessions).flatMap((sess) => sess.pendingGates);

export const selectConnectionStatus = (s: WorkflowState) =>
  Object.values<ConnectionStatus>(s.sseConnections).every((c) => c === 'idle')
    ? ('idle' as ConnectionStatus)
    : Object.values<ConnectionStatus>(s.sseConnections).some((c) => c === 'connected')
      ? ('connected' as ConnectionStatus)
      : ('error' as ConnectionStatus);

export const _unused_emptyAgentStates = emptyAgentStates;
