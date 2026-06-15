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
    evidence?: any;
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
  sandbox_pass: boolean | null;
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

export interface SdlcState {
  // ── Input ─────────────────────────────────────────────────────────────
  repoUrl: string;
  featureRequest: string;

  // ── Pipeline State ─────────────────────────────────────────────────────
  workflowId: string | null;
  routeType: sdlcApi.RouteType | null;
  pipelinePhases: sdlcApi.PhaseStatus[];
  status: string; // cloning, analyzing, dev_running, awaiting_approval, etc.
  isLoading: boolean;
  error: string | null;

  // ── Gates ──────────────────────────────────────────────────────────────
  pendingGates: sdlcApi.GateItem[];
  gateHistory: sdlcApi.GateItem[];

  // ── Audit Log ──────────────────────────────────────────────────────────
  auditLog: sdlcApi.AuditEntry[];

  // ── Output ─────────────────────────────────────────────────────────────
  qaResult: sdlcApi.QAResult | null;
  releaseStatus: 'pending' | 'approved' | 'rejected' | null;
  repoInfo: sdlcApi.PipelineResponse['repoInfo'] | null;

  // ── SSE Controller ─────────────────────────────────────────────────────
  sseAbortController: AbortController | null;

  projectId: string | null;
  isFeatureRequestFormOpen: boolean;
  auditEvents: AuditEvent[];
  phaseTransitions: PhaseTransition[];

  // ── Actions ────────────────────────────────────────────────────────────
  startPipeline: (repoUrl: string, request: string) => Promise<void>;
  resolveGate: (gateId: string, action: 'approve' | 'reject', comment?: string) => Promise<void>;
  releaseDecision: (action: 'approve' | 'reject') => Promise<void>;
  pollStatus: () => Promise<void>;
  setError: (msg: string | null) => void;
  resetState: () => void;
  cleanupConnections: () => void;
  setProjectId: (id: string | null) => void;
  setFeatureRequestFormOpen: (isOpen: boolean) => void;
  setAuditEvents: (events: AuditEvent[]) => void;
  setPhaseTransitions: (transitions: PhaseTransition[]) => void;
}

const DEFAULT_PHASES: sdlcApi.PhaseStatus[] = [
  { agent: 'PO', status: 'pending' },
  { agent: 'UX', status: 'pending' },
  { agent: 'DEV', status: 'pending' },
  { agent: 'QA', status: 'pending' }
];

export const useSdlcStore = create<SdlcState>((set, get) => {
  let pollInterval: any = null;

  // Closes existing connections
  const cleanupConnections = () => {
    const { sseAbortController } = get();
    if (sseAbortController) {
      sseAbortController.abort();
    }
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
  };

  const startPolling = () => {
    if (pollInterval) clearInterval(pollInterval);
    pollInterval = setInterval(async () => {
      const { status } = get();
      if (status === 'qa_complete' || status === 'failed') {
        if (pollInterval) {
          clearInterval(pollInterval);
          pollInterval = null;
        }
        return;
      }
      await get().pollStatus();
    }, 4000);
  };

  return {
    repoUrl: '',
    featureRequest: '',
    workflowId: null,
    routeType: null,
    pipelinePhases: DEFAULT_PHASES,
    status: 'idle',
    isLoading: false,
    error: null,
    cleanupConnections,
    pendingGates: [],
    gateHistory: [],
    auditLog: [],
    qaResult: null,
    releaseStatus: null,
    repoInfo: null,
    sseAbortController: null,

    projectId: 'default-project',
    isFeatureRequestFormOpen: false,
    auditEvents: [],
    phaseTransitions: [],

    setProjectId: (id) => set({ projectId: id }),
    setError: (msg) => set({ error: msg }),
    setFeatureRequestFormOpen: (isOpen) => set({ isFeatureRequestFormOpen: isOpen }),
    setAuditEvents: (events) => set({ auditEvents: events }),
    setPhaseTransitions: (transitions) => set({ phaseTransitions: transitions }),

    resetState: () => {
      cleanupConnections();
      set({
        workflowId: null,
        routeType: null,
        pipelinePhases: DEFAULT_PHASES,
        status: 'idle',
        isLoading: false,
        error: null,
        pendingGates: [],
        gateHistory: [],
        auditLog: [],
        qaResult: null,
        releaseStatus: null,
        repoInfo: null
      });
    },

    startPipeline: async (repoUrl, request) => {
      cleanupConnections();
      set({
        isLoading: true,
        error: null,
        repoUrl,
        featureRequest: request,
        status: 'cloning',
        pipelinePhases: request.toLowerCase().includes('backend')
          ? [
              { agent: 'PO', status: 'pending' },
              { agent: 'UX', status: 'skipped' },
              { agent: 'DEV', status: 'pending' },
              { agent: 'QA', status: 'pending' }
            ]
          : DEFAULT_PHASES,
        pendingGates: [],
        auditLog: [],
        qaResult: null,
        releaseStatus: 'pending'
      });

      try {
        const { workflowId, status } = await sdlcApi.startPipeline(repoUrl, request);
        set({ workflowId, status, projectId: workflowId });

        // Connect SSE stream
        const abort = sdlcApi.subscribeWorkflowSSE(workflowId, {
          onMessage: (event, data) => {
            if (event === 'progress') {
              set({
                status: (data.status as string) || get().status,
                pipelinePhases: (data.pipelinePhases as sdlcApi.PhaseStatus[]) || get().pipelinePhases,
                auditLog: (data.auditLog as sdlcApi.AuditEntry[]) || get().auditLog
              });
            } else if (event === 'gate_pending') {
              const newGate = data.gate as sdlcApi.GateItem;
              set(s => {
                const exists = s.pendingGates.some(g => g.id === newGate.id);
                const updatedGates = exists ? s.pendingGates : [...s.pendingGates, newGate];
                return {
                  pendingGates: updatedGates,
                  status: 'awaiting_approval'
                };
              });
            } else if (event === 'gate_resolved') {
              const gateId = data.gateId as string;
              set(s => ({
                pendingGates: s.pendingGates.filter(g => g.id !== gateId)
              }));
            } else if (event === 'completed') {
              set({
                status: 'qa_complete',
                qaResult: (data.qaResult as sdlcApi.QAResult) || null
              });
            } else if (event === 'error') {
              set({
                status: 'failed',
                error: (data.message as string) || 'An error occurred during execution'
              });
            }
          },
          onError: (err) => {
            console.error('SSE Error:', err);
            if (get().workflowId) {
              startPolling();
            }
          }
        });

        set({ sseAbortController: abort });
        startPolling();

      } catch (err: any) {
        set({ error: err.message || 'Failed to start SDLC pipeline workflow', status: 'failed' });
      } finally {
        set({ isLoading: false });
      }
    },

    resolveGate: async (gateId, action, comment) => {
      const { workflowId } = get();
      if (!workflowId) return;

      set(s => ({
        pendingGates: s.pendingGates.filter(g => g.id !== gateId),
        isLoading: true
      }));

      try {
        await sdlcApi.resolveGate(gateId, action, comment);
        await get().pollStatus();
      } catch (err: any) {
        set({ error: err.message || 'Failed to resolve risk control gate' });
      } finally {
        set({ isLoading: false });
      }
    },

    releaseDecision: async (action) => {
      const { workflowId } = get();
      if (!workflowId) return;

      set({ isLoading: true });
      try {
        const res = await sdlcApi.releaseDecision(workflowId, action);
        if (res.success) {
          set({ releaseStatus: action === 'approve' ? 'approved' : 'rejected' });
        } else {
          set({ releaseStatus: 'rejected' });
        }
        await get().pollStatus();
      } catch (err: any) {
        set({ error: err.message || 'Failed to submit final release decision' });
      } finally {
        set({ isLoading: false });
      }
    },

    pollStatus: async () => {
      const { workflowId } = get();
      if (!workflowId) return;
      try {
        const res = await sdlcApi.getPipelineStatus(workflowId);
        set({
          status: res.status,
          routeType: res.routeType,
          pipelinePhases: res.pipelinePhases,
          pendingGates: res.pendingGates,
          auditLog: res.auditLog,
          qaResult: res.qaResult || null,
          releaseStatus: res.releaseStatus || 'pending',
          repoInfo: res.repoInfo || null
        });
      } catch (err: any) {
        set({ error: err.message || 'Failed to check status updates' });
      }
    }
  };
});


