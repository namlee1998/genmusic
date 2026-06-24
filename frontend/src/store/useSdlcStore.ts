import { create } from 'zustand';
import * as sdlcApi from '@/services/api/sdlcApi';

// ── Legacy Types & Interfaces ──────────────────────────────────────────────

export type AgentPhase = 'po' | 'ux' | 'dev' | 'qa';
export type GateDecision = 'APPROVE' | 'REJECT' | 'REQUEST_CHANGES';

export interface Artifact {
  id: string;
  taskId?: string;
  phase: string;
  type: string;
  key: string;
  title: string;
  contentText: string | null;
  contentJson: unknown | null;
}

export interface HitlDecision {
  gate: string;
  decision: GateDecision;
  comment: string;
  createdAt: string;
}

export interface PhaseStatus {
  taskId: string | null;
  status: string | null;
  versionStatus: string | null;
  gate: string | null;
  hitlDecision: HitlDecision | null;
  awaitingReview?: boolean;
  invalid?: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface WorkflowStatus {
  projectId: string;
  featureRequest?: {
    title?: string;
    description?: string;
    priority?: string;
  } | null;
  phases: {
    po: PhaseStatus | null;
    ux: PhaseStatus | null;
    dev: PhaseStatus | null;
    qa: PhaseStatus | null;
  };
  releaseGate?: {
    eligible: boolean;
    canDecide: boolean;
    reviewerRole: string | null;
    decision: HitlDecision | null;
    status: 'pending' | 'released' | 'rejected';
    approvalBlocked?: boolean;
    evidence?: unknown;
  };
  currentPhase: string;
}

export interface AuditEvent {
  timestamp: string;
  actor: string;
  action: string;
  taskId?: string;
  agent?: string | null;
  gate?: string;
  decision?: string;
  comment?: string | null;
  phase?: string | null;
  artifact_version?: string | null;
  stateFrom?: string | null;
  stateTo?: string | null;
  attempt?: number | null;
  outputVersion?: number | null;
  versionTag?: string | null;
  fromAgent?: string | null;
  toAgent?: string | null;
  severity?: string | null;
  retryReason?: string | null;
  blockingIssueCount?: number;
  status?: string | null;
  handoffId?: string | null;
  artifactHash?: string | null;
  type: 'agent_run' | 'agent_complete' | 'hitl_decision' | 'a2a_handoff' | 'escalation' | 'release_decision' | 'failure';
}

export interface PhaseTransition {
  type: 'PHASE_TRANSITION';
  from: string;
  to: string;
  cause: string;
  at: string;
  agent?: string | null;
  taskId?: string | null;
  requestId?: string | null;
}

export interface SdlcError {
  message: string;
  code?: string | null;
  phase?: string | null;
  requestId?: string | null;
}

export interface WorkflowMetrics {
  projectId: string;
  generatedAt: string;
  cycle_time_seconds: number | null;
  time_per_agent: Record<string, { runs: number; avg_seconds: number | null }>;
  auto_approval_rate: number;
  human_rejection_rate: number;
  rerun_count_per_stage: Record<string, number>;
  gate_failure_reason_distribution: Record<string, number>;
  build_pass: boolean | null;
  qa_gate: string | null;
  requirement_coverage_percentage: number | null;
  false_auto_approval_rate: number;
  dead_letter_count: number;
  counts: {
    total_runs: number;
    auto_approvals: number;
    human_approvals: number;
    rejections: number;
    escalations: number;
    total_decisions: number;
  };
  agent_policy: Record<string, { max_attempts: number; timeout_seconds: number }>;
}

// ── Multi-Session State ─────────────────────────────────────────────────────
export interface SessionData {
  sessionId: string;
  status: 'pending' | 'running' | 'awaiting_approval' | 'completed' | 'failed';
  routeType: sdlcApi.RouteType | null;
  pipelinePhases: sdlcApi.PhaseStatus[];
  pendingGates: sdlcApi.GateItem[];
  gateHistory: sdlcApi.GateItem[];
  auditLog: sdlcApi.AuditEntry[];
  qaResult: sdlcApi.QAResult | null;
  releaseStatus: 'pending' | 'approved' | 'rejected' | null;
  repoInfo: sdlcApi.PipelineResponse['repoInfo'] | null;
  error: string | null;
  sseAbortController: AbortController | null;
  pollTimeout: NodeJS.Timeout | null;
  featureRequest: string;
  repoUrl: string;
  createdAt: number;
  updatedAt: number;
}

export interface SdlcState {
  // ── Multi-Session Management ───────────────────────────────────────────
  sessions: Record<string, SessionData>;
  activeSessionId: string | null;
  projectId: string | null;

  // ── UI State ────────────────────────────────────────────────────────────
  isLoading: boolean;
  isFeatureRequestFormOpen: boolean;
  auditEvents: AuditEvent[];
  phaseTransitions: PhaseTransition[];

  // ── Active-Session Derived Fields ─────────────────────────────────────
  pipelinePhases: sdlcApi.PhaseStatus[];
  auditLog: sdlcApi.AuditEntry[];
  pendingGates: sdlcApi.GateItem[];
  error: string | null;

  // ── Actions ────────────────────────────────────────────────────────────
  startPipeline: (projectId: string, repoUrl: string, request: string) => Promise<void>;
  setActiveSession: (sessionId: string | null) => void;
  resolveGate: (sessionId: string, gateId: string, action: 'approve' | 'reject', comment?: string) => Promise<void>;
  resolveOutputReviewGate: (sessionId: string, gateId: string, action: 'approve' | 'reject', comment?: string) => Promise<void>;
  releaseDecision: (sessionId: string, action: 'approve' | 'reject') => Promise<void>;
  pollStatus: (sessionId: string) => Promise<void>;
  cleanupSession: (sessionId: string) => void;
  setError: (sessionId: string, msg: string | null) => void;
  resetState: () => void;
  cleanupConnections: () => void;
  setProjectId: (id: string | null) => void;
  setFeatureRequestFormOpen: (isOpen: boolean) => void;
  setAuditEvents: (events: AuditEvent[]) => void;
  setPhaseTransitions: (transitions: PhaseTransition[]) => void;
  getActiveSession: () => SessionData | null;
  getAllSessions: () => SessionData[];
}

const DEFAULT_PHASES: sdlcApi.PhaseStatus[] = [
  { agent: 'PO', status: 'pending' },
  { agent: 'UX', status: 'pending' },
  { agent: 'DEV', status: 'pending' },
  { agent: 'QA', status: 'pending' }
];

export const useSdlcStore = create<SdlcState>((set, get) => {
  // Closes existing connections for all sessions
  const cleanupConnections = () => {
    const { sessions } = get();
    Object.values(sessions).forEach(session => {
      if (session.sseAbortController) {
        session.sseAbortController.abort();
      }
      if (session.pollTimeout) {
        clearTimeout(session.pollTimeout);
      }
    });
  };

  // Start polling for a specific session (fallback only)
  const startPollingForSession = (sessionId: string) => {
    const session = get().sessions[sessionId];
    if (!session) return;

    // Clear existing timeout
    if (session.pollTimeout) {
      clearTimeout(session.pollTimeout);
    }

    const pollFn = async () => {
      const currentSession = get().sessions[sessionId];
      if (!currentSession) return;

      if (currentSession.status === 'completed' || currentSession.status === 'failed') {
        return;
      }

      await get().pollStatus(sessionId);

      // Schedule next poll
      const nextTimeout = setTimeout(pollFn, 4000);
      set(s => ({
        sessions: {
          ...s.sessions,
          [sessionId]: { ...s.sessions[sessionId], pollTimeout: nextTimeout }
        }
      }));
    };

    const timeout = setTimeout(pollFn, 4000);
    set(s => ({
      sessions: {
        ...s.sessions,
        [sessionId]: { ...s.sessions[sessionId], pollTimeout: timeout }
      }
    }));
  };

  return {
    sessions: {},
    activeSessionId: null,
    projectId: 'default-project',
    isLoading: false,
    isFeatureRequestFormOpen: false,
    auditEvents: [],
    phaseTransitions: [],
    pipelinePhases: [],
    auditLog: [],
    pendingGates: [],
    error: null,

    cleanupConnections,
    setProjectId: (id) => set({ projectId: id }),
    setFeatureRequestFormOpen: (isOpen) => set({ isFeatureRequestFormOpen: isOpen }),
    setAuditEvents: (events) => set({ auditEvents: events }),
    setPhaseTransitions: (transitions) => set({ phaseTransitions: transitions }),
    setActiveSession: (sessionId) => {
      const session = sessionId ? get().sessions[sessionId] : null;
      set({
        activeSessionId: sessionId,
        pipelinePhases: session?.pipelinePhases ?? [],
        auditLog: session?.auditLog ?? [],
        pendingGates: session?.pendingGates ?? [],
        error: session?.error ?? null,
      });
    },

    setError: (sessionId, msg) => {
      set(s => ({
        sessions: {
          ...s.sessions,
          [sessionId]: { ...s.sessions[sessionId], error: msg }
        }
      }));
    },

    getActiveSession: () => {
      const { sessions, activeSessionId } = get();
      return activeSessionId ? sessions[activeSessionId] || null : null;
    },

    getAllSessions: () => {
      return Object.values(get().sessions);
    },

    resetState: () => {
      cleanupConnections();
      set({
        sessions: {},
        activeSessionId: null
      });
    },

    cleanupSession: (sessionId) => {
      const session = get().sessions[sessionId];
      if (session?.sseAbortController) {
        session.sseAbortController.abort();
      }
      if (session?.pollTimeout) {
        clearTimeout(session.pollTimeout);
      }
      set(s => {
        const newSessions = { ...s.sessions };
        delete newSessions[sessionId];
        return {
          sessions: newSessions,
          activeSessionId: s.activeSessionId === sessionId ? null : s.activeSessionId
        };
      });
    },

    startPipeline: async (projectId, repoUrl, request) => {
      set({ isLoading: true });

      try {
        const { workflowId } = await sdlcApi.startPipeline(projectId, repoUrl, request);
        // Note: workflowId from API is actually the sessionId from backend
        const sessionId = workflowId;

        const initialSession: SessionData = {
          sessionId,
          status: 'pending',
          routeType: null,
          pipelinePhases: request.toLowerCase().includes('backend')
            ? [
                { agent: 'PO', status: 'pending' },
                { agent: 'UX', status: 'skipped' },
                { agent: 'DEV', status: 'pending' },
                { agent: 'QA', status: 'pending' }
              ]
            : DEFAULT_PHASES,
          pendingGates: [],
          gateHistory: [],
          auditLog: [],
          qaResult: null,
          releaseStatus: 'pending',
          repoInfo: null,
          error: null,
          sseAbortController: null,
          pollTimeout: null,
          featureRequest: request,
          repoUrl,
          createdAt: Date.now(),
          updatedAt: Date.now()
        };

        set(s => ({
          sessions: { ...s.sessions, [sessionId]: initialSession },
          activeSessionId: sessionId,
          pipelinePhases: initialSession.pipelinePhases,
          auditLog: initialSession.auditLog,
          pendingGates: initialSession.pendingGates,
          error: initialSession.error,
        }));

        // Connect SSE stream (polling starts only on error)
        const abort = sdlcApi.subscribeWorkflowSSE(sessionId, {
          onMessage: (event, data) => {
            const session = get().sessions[sessionId];
            if (!session) return;

            if (event === 'progress') {
              const activeSessionId = get().activeSessionId;
              const newPipelinePhases = (data.pipelinePhases as sdlcApi.PhaseStatus[]) || session.pipelinePhases;
              const newAuditLog = (data.auditLog as sdlcApi.AuditEntry[]) || session.auditLog;
              const newStatus = (data.status as SessionData['status']) || session.status;
              set(s => {
                const isActive = sessionId === activeSessionId;
                return {
                  sessions: {
                    ...s.sessions,
                    [sessionId]: {
                      ...s.sessions[sessionId],
                      status: newStatus,
                      pipelinePhases: newPipelinePhases,
                      auditLog: newAuditLog,
                      updatedAt: Date.now()
                    }
                  },
                  ...(isActive ? { pipelinePhases: newPipelinePhases, auditLog: newAuditLog } : {}),
                };
              });
            } else if (event === 'gate_pending') {
              const newGate = data.gate as sdlcApi.GateItem;
              set(s => {
                const existingSession = s.sessions[sessionId];
                const exists = existingSession?.pendingGates.some(g => g.id === newGate.id);
                const updatedGates = exists ? existingSession.pendingGates : [...existingSession.pendingGates, newGate];
                return {
                  sessions: {
                    ...s.sessions,
                    [sessionId]: {
                      ...existingSession,
                      pendingGates: updatedGates,
                      status: 'awaiting_approval' as const,
                      updatedAt: Date.now()
                    }
                  }
                };
              });
            } else if (event === 'gate_resolved') {
              const gateId = data.gateId as string;
              const activeSessionId = get().activeSessionId;
              set(s => {
                const updatedGates = s.sessions[sessionId].pendingGates.filter(g => g.id !== gateId);
                return {
                  sessions: {
                    ...s.sessions,
                    [sessionId]: {
                      ...s.sessions[sessionId],
                      pendingGates: updatedGates,
                      updatedAt: Date.now()
                    }
                  },
                  pendingGates: sessionId === activeSessionId ? updatedGates : s.pendingGates,
                };
              });
            } else if (event === 'completed') {
              const activeSessionId = get().activeSessionId;
              set(s => ({
                sessions: {
                  ...s.sessions,
                  [sessionId]: {
                    ...s.sessions[sessionId],
                    status: 'completed' as const,
                    qaResult: (data.qaResult as sdlcApi.QAResult) || null,
                    updatedAt: Date.now()
                  }
                },
                ...(sessionId === activeSessionId ? { error: null } : {}),
              }));
            } else if (event === 'error') {
              const activeSessionId = get().activeSessionId;
              const errorMsg = (data.message as string) || 'An error occurred during execution';
              set(s => ({
                sessions: {
                  ...s.sessions,
                  [sessionId]: {
                    ...s.sessions[sessionId],
                    status: 'failed' as const,
                    error: errorMsg,
                    updatedAt: Date.now()
                  }
                },
                ...(sessionId === activeSessionId ? { error: errorMsg } : {}),
              }));
            }
          },
          onError: (err) => {
            console.error('SSE Error for session', sessionId, err);
            // Only start polling on SSE error (FIX for redundant polling bug)
            startPollingForSession(sessionId);
          }
        });

        set(s => ({
          sessions: {
            ...s.sessions,
            [sessionId]: { ...s.sessions[sessionId], sseAbortController: abort }
          }
        }));

      } catch (err: unknown) {
        const errorMsg = (err as any)?.response?.data?.message || err instanceof Error ? (err as Error).message : 'Failed to start SDLC pipeline workflow';
        console.error('startPipeline error:', errorMsg);
        set({ error: errorMsg });
      } finally {
        set({ isLoading: false });
      }
    },

    resolveGate: async (sessionId, gateId, action, comment) => {
      const session = get().sessions[sessionId];
      if (!session) return;

      set(s => ({
        sessions: {
          ...s.sessions,
          [sessionId]: {
            ...s.sessions[sessionId],
            pendingGates: s.sessions[sessionId].pendingGates.filter(g => g.id !== gateId)
          }
        },
        isLoading: true
      }));

      try {
        await sdlcApi.resolveGate(gateId, action, comment);
        await get().pollStatus(sessionId);
      } catch (err: unknown) {
        set(s => ({
          sessions: {
            ...s.sessions,
            [sessionId]: { ...s.sessions[sessionId], error: err instanceof Error ? err.message : 'Failed to resolve risk control gate' }
          }
        }));
      } finally {
        set({ isLoading: false });
      }
    },

    resolveOutputReviewGate: async (sessionId, gateId, action, comment) => {
      const session = get().sessions[sessionId];
      if (!session) return;

      set(s => ({
        sessions: {
          ...s.sessions,
          [sessionId]: {
            ...s.sessions[sessionId],
            pendingGates: s.sessions[sessionId].pendingGates.filter(g => g.id !== gateId)
          }
        },
        isLoading: true
      }));

      try {
        await sdlcApi.resolveOutputReviewGate(gateId, action, comment);
        await get().pollStatus(sessionId);
      } catch (err: unknown) {
        set(s => ({
          sessions: {
            ...s.sessions,
            [sessionId]: { ...s.sessions[sessionId], error: err instanceof Error ? err.message : 'Failed to resolve output review gate' }
          }
        }));
      } finally {
        set({ isLoading: false });
      }
    },

    releaseDecision: async (sessionId, action) => {
      const session = get().sessions[sessionId];
      if (!session) return;

      set({ isLoading: true });
      try {
        const res = await sdlcApi.releaseDecision(session.sessionId, action);
        set(s => ({
          sessions: {
            ...s.sessions,
            [sessionId]: {
              ...s.sessions[sessionId],
              releaseStatus: res.success ? (action === 'approve' ? 'approved' : 'rejected') : 'rejected'
            }
          }
        }));
        await get().pollStatus(sessionId);
      } catch (err: unknown) {
        set(s => ({
          sessions: {
            ...s.sessions,
            [sessionId]: { ...s.sessions[sessionId], error: err instanceof Error ? err.message : 'Failed to submit final release decision' }
          }
        }));
      } finally {
        set({ isLoading: false });
      }
    },

    pollStatus: async (sessionId) => {
      const session = get().sessions[sessionId];
      if (!session) return;

      try {
        const res = await sdlcApi.getPipelineStatus(session.sessionId);
        const activeSessionId = get().activeSessionId;
        set(s => {
          const isActive = sessionId === activeSessionId;
          return {
            sessions: {
              ...s.sessions,
              [sessionId]: {
                ...s.sessions[sessionId],
                status: res.status as SessionData['status'],
                routeType: res.routeType,
                pipelinePhases: res.pipelinePhases,
                pendingGates: res.pendingGates,
                auditLog: res.auditLog,
                qaResult: res.qaResult || null,
                releaseStatus: res.releaseStatus || 'pending',
                repoInfo: res.repoInfo || null,
                updatedAt: Date.now()
              }
            },
            ...(isActive ? {
              pipelinePhases: res.pipelinePhases,
              auditLog: res.auditLog,
              pendingGates: res.pendingGates,
            } : {}),
          };
        });
      } catch (err: unknown) {
        set(s => ({
          sessions: {
            ...s.sessions,
            [sessionId]: { ...s.sessions[sessionId], error: err instanceof Error ? err.message : 'Failed to check status updates' }
          }
        }));
      }
    }
  };
});

