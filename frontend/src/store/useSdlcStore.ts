import { create } from 'zustand';
import type { TaskStatus } from '@/services/api';

// ── Types ─────────────────────────────────────────────────────────────────

export type AgentPhase = 'intent' | 'po' | 'ux' | 'dev' | 'qa';
export type GateDecision = 'APPROVE' | 'REJECT' | 'REQUEST_CHANGES';

export interface Artifact {
  id: string;
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
  phases: {
    po: PhaseStatus | null;
    ux: PhaseStatus | null;
    dev: PhaseStatus | null;
    qa: PhaseStatus | null;
  };
  currentPhase: string;
}

export interface AuditEvent {
  timestamp: string;
  actor: string;
  action: string;
  taskId?: string;
  gate?: string;
  decision?: string;
  comment?: string;
  type: 'agent_run' | 'agent_complete' | 'hitl_decision';
  phase?: string;
  artifact_version?: string;
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
  isAuditSidebarOpen: boolean;

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
  updateArtifactContent: (artifactId: string, contentText?: string, contentJson?: unknown) => void;
  setAuditEvents: (events: AuditEvent[]) => void;
  setFeatureRequestFormOpen: (isOpen: boolean) => void;
  setAuditSidebarOpen: (isOpen: boolean) => void;
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
  isAuditSidebarOpen: false,
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
  updateArtifactContent: (artifactId, contentText, contentJson) =>
    set((s) => ({
      artifacts: s.artifacts.map((a) =>
        a.id === artifactId
          ? {
              ...a,
              ...(contentText !== undefined ? { contentText } : {}),
              ...(contentJson !== undefined ? { contentJson } : {}),
            }
          : a
      ),
      selectedArtifact:
        s.selectedArtifact?.id === artifactId
          ? {
              ...s.selectedArtifact,
              ...(contentText !== undefined ? { contentText } : {}),
              ...(contentJson !== undefined ? { contentJson } : {}),
            }
          : s.selectedArtifact,
    })),
  setAuditEvents: (events) => set({ auditEvents: events }),
  setFeatureRequestFormOpen: (isOpen) => set({ isFeatureRequestFormOpen: isOpen }),
  setAuditSidebarOpen: (isOpen) => set({ isAuditSidebarOpen: isOpen }),
  setError: (msg) => set({ error: msg }),
  clearTask: () => set({ activeTaskId: null, activePhase: null, taskStatus: null, sseLogs: [], sseActive: false }),
}));
