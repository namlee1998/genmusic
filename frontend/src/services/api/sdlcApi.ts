import api, { getBaseURL } from './client';
import { getStoredAuthSession } from './authStorage';

const BASE = '/sdlc';

export const getApiErrorMessage = (error: unknown, fallback: string) => {
  if (typeof error !== 'object' || error === null) return fallback;
  const candidate = error as { response?: { data?: { message?: string } }; message?: string };
  return candidate.response?.data?.message || candidate.message || fallback;
};

export interface SdlcError {
  message: string;
  code?: string | null;
  phase?: string | null;
  requestId?: string | null;
}

/** Parse the backend `{status, code, message, phase, requestId}` error envelope. */
export const parseApiError = (error: unknown, fallback: string): SdlcError => {
  if (typeof error !== 'object' || error === null) return { message: fallback };
  const candidate = error as {
    response?: { data?: { message?: string; code?: string; phase?: string; requestId?: string }; headers?: Record<string, string> };
    message?: string;
  };
  const data = candidate.response?.data;
  return {
    message: data?.message || candidate.message || fallback,
    code: data?.code ?? null,
    phase: data?.phase ?? null,
    requestId: data?.requestId ?? candidate.response?.headers?.['x-request-id'] ?? null,
  };
};

export interface FeatureRequest {
  title: string;
  description?: string;
  priority?: 'High' | 'Medium' | 'Low';
  target_user?: string;
  business_goal?: string;
  constraints?: string[];
}

export interface GateDecisionPayload {
  decision: 'APPROVE' | 'REJECT' | 'REQUEST_CHANGES';
  comment?: string;
}

// ── IntentGate ────────────────────────────────────────────────────────────

export const runIntentAgent = (projectId: string, featureRequest: FeatureRequest, backlogId?: string) =>
  api.post(`${BASE}/run-intent-agent`, { project_id: projectId, feature_request: featureRequest, backlog_id: backlogId })
    .then((r) => r.data);

// ── Run Agents ────────────────────────────────────────────────────────────

export const runPOAgent = (projectId: string, sourceTaskId: string, feedbackPrompt = '') =>
  api.post(`${BASE}/run-po-agent`, { project_id: projectId, source_task_id: sourceTaskId, feedback_prompt: feedbackPrompt })
    .then((r) => r.data);

export const startPOAgent = (projectId: string, featureRequest: FeatureRequest, backlogId?: string) =>
  api.post(`${BASE}/run-po-agent`, { project_id: projectId, feature_request: featureRequest, backlog_id: backlogId })
    .then((r) => r.data);

export const runUXAgent = (sourceTaskId: string, feedbackPrompt = '') =>
  api.post(`${BASE}/run-ux-agent`, { source_task_id: sourceTaskId, feedback_prompt: feedbackPrompt })
    .then((r) => r.data);

export const runDEVAgent = (sourceTaskId: string, feedbackPrompt = '') =>
  api.post(`${BASE}/run-dev-agent`, { source_task_id: sourceTaskId, feedback_prompt: feedbackPrompt })
    .then((r) => r.data);

export const runQAAgent = (sourceTaskId: string, feedbackPrompt = '') =>
  api.post(`${BASE}/run-qa-agent`, { source_task_id: sourceTaskId, feedback_prompt: feedbackPrompt })
    .then((r) => r.data);

// ── HITL ──────────────────────────────────────────────────────────────────

export const submitGateDecision = (taskId: string, payload: GateDecisionPayload) =>
  api.post(`${BASE}/tasks/${taskId}/gate-decision`, payload).then((r) => r.data);

// Structured HITL decision (plan section 2.3 / 2.8) — idempotent, optimistic-locked.
export interface StructuredDecisionBody {
  decision_id: string;
  base_output_version: number;
  action: 'approve' | 'reject' | 'edit_approve';
  comment?: string;
  payload?: {
    retry_reason?: string;
    patch?: unknown[];
    edited_output?: Record<string, unknown>;
    target_fields?: string[];
    blocking_issues?: Array<{ severity: string; issue: string; expected_fix: string }>;
    acceptance_checks?: string[];
  };
}

export const submitStructuredDecision = (taskId: string, body: StructuredDecisionBody) =>
  api.post(`${BASE}/tasks/${taskId}/decision`, body).then((r) => r.data);

// ── Status ────────────────────────────────────────────────────────────────

export const getSdlcTaskStatus = (taskId: string) =>
  api.get(`${BASE}/tasks/${taskId}`).then((r) => r.data.data);

export const getWorkflowStatus = (projectId: string) =>
  api.get(`${BASE}/workflow-status`, { params: { project_id: projectId } }).then((r) => r.data.data);

export const getFinalReviewPacket = (projectId: string) =>
  api.get(`${BASE}/final-review-packet/${projectId}`).then((r) => r.data.data);

export const submitReleaseDecision = (
  projectId: string,
  body: { decision_id: string; decision: 'APPROVE' | 'REJECT'; comment?: string },
) => api.post(`${BASE}/projects/${projectId}/release-decision`, body).then((r) => r.data);

export const getAuditTrail = (projectId: string) =>
  api.get(`${BASE}/audit-trail/${projectId}`).then((r) => r.data.data);

// ── AIFA v3: repo-aware workflow start + onGate approvals (T1.4 / T2.4) ────

/**
 * Start a repo-aware, PO-first workflow (applies the 429 cap).
 * Pass `repoUrl` to clone a remote repo, or `repoPath` to use an already-cloned
 * local folder ("Open folder" flow). Both are optional — omit for a repo-less run.
 */
export const runWorkflow = (
  projectId: string,
  request: string,
  repoUrl?: string,
  branch = 'main',
  repoPath?: string,
) => api.post(`${BASE}/run-po-agent`, {
  project_id: projectId,
  feature_request: { title: request, description: request, priority: 'High' },
  request,
  repo_url: repoUrl || undefined,
  repo_path: repoPath || undefined,
  branch,
}).then((r) => r.data);

/**
 * Upload a whole local folder (chosen anywhere on the user's machine) as the
 * workflow repo. Browsers can't expose an absolute path, so we stream the files
 * with their relative paths; the backend writes them into the project workspace
 * and git-inits a repo, returning the server-side `repo_path`.
 */
export const uploadRepoFolder = (
  projectId: string,
  files: Array<File & { relativePath?: string }>,
  request = '',
  onProgress?: (pct: number) => void,
) => {
  const form = new FormData();
  form.append('project_id', projectId);
  if (request) form.append('request', request);
  for (const f of files) {
    form.append('files', f);
    form.append('paths', f.relativePath || (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name);
  }
  return api.post(`${BASE}/upload-repo`, form, {
    timeout: 10 * 60 * 1000,
    onUploadProgress: (e) => {
      if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100));
    },
  }).then((r) => r.data.data as { repo_path: string; base_branch: string; file_count: number });
};

export interface PendingGate {
  approvalId: string;
  taskId: string;
  projectId?: string | null;
  role: string;
  kind: 'tool' | 'question';
  status?: 'pending' | 'interrupted';
  payload: {
    tool?: string;
    file_path?: string | null;
    diff?: string | null;
    reason?: string;
    category?: string;
    questions?: Array<{ question: string; header?: string; options?: Array<{ label: string; description?: string }> }>;
  };
  createdAt?: string;
}

export const listPendingApprovals = (params: { taskId?: string; projectId?: string }) =>
  api.get(`${BASE}/approvals`, { params: { task_id: params.taskId, project_id: params.projectId } })
    .then((r) => r.data.data.pending as PendingGate[]);

/** Resolve a tool gate (approve/reject) or a question gate (answers). */
export const resolveApproval = (
  approvalId: string,
  body: { action?: 'approve' | 'reject'; comment?: string; answers?: string[] },
) => api.post(`${BASE}/approvals/${approvalId}`, body).then((r) => r.data.data);

export const getWorkflowMetrics = (projectId: string) =>
  api.get(`${BASE}/projects/${projectId}/metrics`).then((r) => r.data.data);

export const getProjectArtifacts = (projectId: string) =>
  api.get(`${BASE}/projects/${projectId}/artifacts`).then((r) => r.data.data);

export const downloadReleaseFile = (projectId: string, fileName: 'final.md' | 'qa-report.md') =>
  api.get(`${BASE}/projects/${projectId}/release-files/${fileName}`, { responseType: 'blob' })
    .then((r) => r.data as Blob);

// ── Dev-only demo scenario selector (MOCK_SCENARIO) ───────────────────────

export interface MockScenarioState {
  scenario: string;
  mockEnabled: boolean;
  executionPath: string;
  mockClaudeCode: boolean;
  available: string[];
}

export const getMockScenario = (): Promise<MockScenarioState> =>
  api.get(`${BASE}/dev/mock-scenario`).then((r) => r.data.data);

// ── Demo board: 3 independent flows parked at PO / DEV / QA ────────────────

export interface BoardCard {
  label: string;
  agent: string;
  title: string;
  description: string;
  whatsIncluded: string[];
  taskId: string;
  invalid: boolean;
}
export interface BoardPhase {
  stage: string;
  status: string;
  committed: boolean;
  awaitingReview: boolean;
  invalid: boolean;
  error?: string | null;
}
export interface BoardReleaseGate {
  eligible: boolean;
  status: string;
  canDecide: boolean;
  approvalBlocked: boolean;
}
export interface BoardFlow {
  flowNo: number;
  target: string;
  projectId?: string;
  active?: boolean;
  status: 'seeding' | 'ready' | 'error' | 'unavailable';
  repo?: string;
  branch?: string;
  progress?: { done: number; total: number };
  currentPhase?: string;
  waitingFor?: string | null;
  reviewStage?: string | null;
  phases?: BoardPhase[];
  card?: BoardCard | null;
  failure?: {
    stage: string;
    error: string;
    code?: string | null;
    recoverable?: boolean | null;
  } | null;
  pendingGates?: PendingGate[];
  releaseGate?: BoardReleaseGate | null;
  released?: string | null;
}
export interface DemoBoard {
  id?: string;
  mode?: 'three_flow' | 'real_single';
  status: string;
  error?: string | null;
  flows: BoardFlow[];
}

export interface WorkflowTimelineEvent {
  timestamp: string;
  actor: string;
  action: string;
  type: string;
  taskId?: string | null;
  agent?: string | null;
  status?: string | null;
  decision?: string | null;
  comment?: string | null;
  reason?: string | null;
  gate?: string | null;
  stateFrom?: string | null;
  stateTo?: string | null;
  fromAgent?: string | null;
  toAgent?: string | null;
  versionTag?: string | null;
  severity?: string | null;
}

export interface WorkflowTimeline {
  projectId: string;
  events: WorkflowTimelineEvent[];
  phaseTransitions?: Array<Record<string, unknown>>;
}

export const seedDemoBoard = (
  reset = false,
  sourceRepoPath?: string,
  mode: 'three_flow' | 'real_single' = 'three_flow',
): Promise<DemoBoard> =>
  api.post(`${BASE}/demo/seed-board`, { reset, sourceRepoPath, mode }).then((r) => r.data.data);

export const getDemoBoard = (): Promise<DemoBoard> =>
  api.get(`${BASE}/demo/board`).then((r) => r.data.data);

export const getWorkflowTimeline = (projectId: string): Promise<WorkflowTimeline> =>
  api.get(`${BASE}/workflow/${projectId}/timeline`).then((r) => r.data.data);

// ── Backlog ───────────────────────────────────────────────────────────────

export const getBacklogs = (projectId: string) =>
  api.get(`${BASE}/projects/${projectId}/backlog`).then((r) => r.data.data);

export const createBacklog = (projectId: string, payload: Partial<FeatureRequest>) =>
  api.post(`${BASE}/projects/${projectId}/backlog`, payload).then((r) => r.data.data);

export const moveBacklog = (backlogId: string, status: string) =>
  api.patch(`${BASE}/backlog/${backlogId}/move`, { status }).then((r) => r.data.data);

// ── SSE subscription (reuses same pattern as original API) ────────────────

export const subscribeTaskSSE = (
  taskId: string,
  handlers: {
    onProgress?: (data: Record<string, unknown>) => void;
    onCompleted?: (data: Record<string, unknown>) => void;
    onError?: (data: Record<string, unknown>) => void;
    onGatePending?: (data: Record<string, unknown>) => void;
    onGateResolved?: (data: Record<string, unknown>) => void;
  }
): AbortController => {
  const abort = new AbortController();

  (async () => {
    try {
      const session = getStoredAuthSession();
      const headers: Record<string, string> = {};
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      const baseUrl = getBaseURL().replace(/\/$/, '');
      const response = await fetch(`${baseUrl}${BASE}/status/${taskId}`, {
        signal: abort.signal,
        headers
      });
      if (!response.body) return;
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let currentEvent: string | null = null;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith('data: ') && currentEvent) {
            try {
              const data = JSON.parse(line.slice(6));
              if (currentEvent === 'progress') handlers.onProgress?.(data);
              else if (currentEvent === 'completed') handlers.onCompleted?.(data);
              else if (currentEvent === 'gate_pending') handlers.onGatePending?.(data);
              else if (currentEvent === 'gate_resolved') handlers.onGateResolved?.(data);
              else if (currentEvent === 'error') handlers.onError?.(data);
            } catch { /* Ignore malformed SSE frames and continue streaming. */ }
            currentEvent = null;
          }
        }
      }
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        handlers.onError?.({ message: 'SSE connection error' });
      }
    }
  })();

  return abort;
};

// ── New Multica Pipeline / Mock API Layer ────────────────────────────────

export interface RepoAnalysis {
  techStack: string[];
  fileCount: number;
  components: string[];
}

export interface ApprovalItem {
  id: string;
  agentName: 'PO' | 'UX' | 'DEV' | 'QA';
  artifactType: 'prd' | 'ux_spec' | 'code_diff' | 'qa_report';
  confidence: number;
  summary: string;
  createdAt: string;
  approved?: boolean;
}

export interface QAResult {
  status: 'passed' | 'failed';
  coverage: number;
  blockers: number;
  warnings: number;
  reportUrl: string;
  commitSha: string;
}

export interface PipelineResponse {
  projectId: string;
  status: string;
  currentStep: number;
  repoInfo?: RepoAnalysis;
  approvals: ApprovalItem[];
  qaResult?: QAResult;
}

// Legacy dashboard compatibility adapters. These call real backend routes;
// client-side pipeline simulation is intentionally not supported.
export const startFromRepo = (projectId: string, repoUrl: string): Promise<any> =>
  runWorkflow(projectId, 'Analyze and improve this repository', repoUrl);

export const getPipelineStatus = (projectId: string): Promise<PipelineResponse> =>
  Promise.all([getWorkflowStatus(projectId), listPendingApprovals({ projectId })])
    .then(([status, pending]) => ({
      projectId,
      status: String(status.currentPhase || 'idle').toLowerCase(),
      currentStep: Math.max(0, ['po', 'ux', 'dev', 'qa'].findIndex((stage) => status.phases?.[stage]) + 1),
      approvals: pending.map((gate) => ({
        id: gate.approvalId,
        agentName: gate.role.replace('-agent', '').toUpperCase() as ApprovalItem['agentName'],
        artifactType: gate.kind === 'tool' ? 'code_diff' : 'prd',
        confidence: 0,
        summary: gate.payload.reason || 'Human input required',
        createdAt: gate.createdAt || new Date().toISOString(),
      })),
    }));

export const approveItem = (projectId: string, approvalId: string, action: 'approve' | 'reject', comment?: string): Promise<any> => {
  void projectId;
  return resolveApproval(approvalId, { action, comment });
};

export const getArtifactContent = (projectId: string, type: string): Promise<{ content: string }> =>
  getProjectArtifacts(projectId).then((result) => {
    const artifact = (result.artifacts || []).find((item: any) => item.type === type);
    const content = artifact?.contentText
      || (artifact?.contentJson ? JSON.stringify(artifact.contentJson, null, 2) : 'No content found');
    return { content };
  });
