import { create } from 'zustand';
import type { TaskStatus } from '@/services/api';

// ── Types ─────────────────────────────────────────────────────────────────

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
    evidence?: {
      feature?: { title?: string; description?: string } | string | null;
      risk?: { level?: string; tags?: string[] } | null;
      versions?: {
        po?: { task_id?: string; output_version?: number } | null;
        ux?: { task_id?: string; output_version?: number } | null;
        dev?: { task_id?: string; output_version?: number } | null;
        qa?: { task_id?: string; output_version?: number } | null;
      } | null;
      sandbox_result?: { build_ok?: boolean; tests_ran?: boolean; tests_passed?: number; tests_failed?: number } | null;
      security_gate?: { recommendation?: string } | null;
      qa_gate?: string | null;
      coverage_percentage?: number | null;
      open_blockers?: Array<{ severity?: string; code?: string; detail?: string }>;
    };
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
  // Granular state-machine detail (plan TIP-002 / Scenario D).
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
  type: 'agent_run' | 'agent_complete' | 'hitl_decision' | 'a2a_handoff' | 'escalation' | 'release_decision' | 'failure';
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

interface SdlcState {
  // ── Active project ────────────────────────────────────────────────────
  projectId: string | null;

  // ── Workflow overview ─────────────────────────────────────────────────
  workflowStatus: WorkflowStatus | null;
  workflowLoading: boolean;

  // ── Active task (SSE stream) ──────────────────────────────────────────
  activeTaskId: string | null;
  activePhase: AgentPhase | null;
  taskStatus: TaskStatus | null;
  sseLogs: string[];
  sseActive: boolean;

  // ── Artifacts ─────────────────────────────────────────────────────────
  artifacts: Artifact[];
  selectedArtifact: Artifact | null;

  // ── Audit Trail ───────────────────────────────────────────────────────
  auditEvents: AuditEvent[];
  isFeatureRequestFormOpen: boolean;

  // ── Error ─────────────────────────────────────────────────────────────
  error: string | null;

  // ── Actions ───────────────────────────────────────────────────────────
  setProjectId: (id: string | null) => void;
  setWorkflowStatus: (ws: WorkflowStatus) => void;
  setWorkflowLoading: (v: boolean) => void;
  setActiveTask: (taskId: string | null, phase: AgentPhase | null) => void;
  appendSseLog: (log: string) => void;
  setSseActive: (v: boolean) => void;
  setTaskStatus: (status: TaskStatus | null) => void;
  setArtifacts: (artifacts: Artifact[]) => void;
  selectArtifact: (artifact: Artifact | null) => void;
  setAuditEvents: (events: AuditEvent[]) => void;
  setFeatureRequestFormOpen: (isOpen: boolean) => void;
  setError: (msg: string | null) => void;
  clearTask: () => void;
}

export const useSdlcStore = create<SdlcState>((set) => ({
  projectId: localStorage.getItem('sdlc_projectId'),
  workflowStatus: null,
  workflowLoading: false,
  activeTaskId: null,
  activePhase: null,
  taskStatus: null,
  sseLogs: [],
  sseActive: false,
  artifacts: [],
  selectedArtifact: null,
  auditEvents: [],
  isFeatureRequestFormOpen: false,
  error: null,

  setProjectId: (id) => {
    if (id) localStorage.setItem('sdlc_projectId', id);
    else localStorage.removeItem('sdlc_projectId');
    set({ projectId: id, workflowStatus: null, activeTaskId: null, activePhase: null });
  },
  setWorkflowStatus: (ws) => set({ workflowStatus: ws }),
  setWorkflowLoading: (v) => set({ workflowLoading: v }),
  setActiveTask: (taskId, phase) => set({ activeTaskId: taskId, activePhase: phase, sseLogs: [], sseActive: true }),
  appendSseLog: (log) => set((s) => ({ sseLogs: [...s.sseLogs.slice(-200), log] })),
  setSseActive: (v) => set({ sseActive: v }),
  setTaskStatus: (status) => set({ taskStatus: status }),
  setArtifacts: (artifacts) => set({ artifacts }),
  selectArtifact: (artifact) => set({ selectedArtifact: artifact }),
  setAuditEvents: (events) => set({ auditEvents: events }),
  setFeatureRequestFormOpen: (isOpen) => set({ isFeatureRequestFormOpen: isOpen }),
  setError: (msg) => set({ error: msg }),
  clearTask: () => set({ activeTaskId: null, activePhase: null, taskStatus: null, sseLogs: [], sseActive: false }),
}));
