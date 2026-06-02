import api, { getBaseURL } from './client';
import { getStoredAuthSession } from './authStorage';

const BASE = '/sdlc';

export const getApiErrorMessage = (error: unknown, fallback: string) => {
  if (typeof error !== 'object' || error === null) return fallback;
  const candidate = error as { response?: { data?: { message?: string } }; message?: string };
  return candidate.response?.data?.message || candidate.message || fallback;
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

export const getWorkflowMetrics = (projectId: string) =>
  api.get(`${BASE}/projects/${projectId}/metrics`).then((r) => r.data.data);

export const getProjectArtifacts = (projectId: string) =>
  api.get(`${BASE}/projects/${projectId}/artifacts`).then((r) => r.data.data);

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
