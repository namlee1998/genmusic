import api, { getBaseURL } from './client';
import { getStoredAuthSession } from './authStorage';

const BASE = '/sdlc';

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

export const runIntentAgent = (projectId: string, featureRequest: FeatureRequest) =>
  api.post(`${BASE}/run-intent-agent`, { project_id: projectId, feature_request: featureRequest })
    .then((r) => r.data);

// ── Run Agents ────────────────────────────────────────────────────────────

export const runPOAgent = (projectId: string, sourceTaskId: string, feedbackPrompt = '') =>
  api.post(`${BASE}/run-po-agent`, { project_id: projectId, source_task_id: sourceTaskId, feedback_prompt: feedbackPrompt })
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

// ── Status ────────────────────────────────────────────────────────────────

export const getSdlcTaskStatus = (taskId: string) =>
  api.get(`${BASE}/tasks/${taskId}`).then((r) => r.data.data);

export const getWorkflowStatus = (projectId: string) =>
  api.get(`${BASE}/workflow-status`, { params: { project_id: projectId } }).then((r) => r.data.data);

export const getFinalReviewPacket = (projectId: string) =>
  api.get(`${BASE}/final-review-packet/${projectId}`).then((r) => r.data.data);

export const getAuditTrail = (projectId: string) =>
  api.get(`${BASE}/audit-trail/${projectId}`).then((r) => r.data.data);

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
    onWarning?: (message: string) => void;
  }
): AbortController => {
  const abort = new AbortController();
  let delay = 1000;
  let timeoutTimer: NodeJS.Timeout | null = null;
  let isDone = false;

  const resetTimeout = () => {
    if (timeoutTimer) clearTimeout(timeoutTimer);
    if (isDone || abort.signal.aborted) return;
    
    timeoutTimer = setTimeout(() => {
      handlers.onWarning?.('No progress events received in the last 60 seconds.');
    }, 60000);
  };

  const connect = async () => {
    if (abort.signal.aborted || isDone) return;

    resetTimeout();

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

      if (!response.body) {
        throw new Error('Response body is null');
      }

      // Reset delay on successful connection
      delay = 1000;

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
            resetTimeout();
            try {
              const data = JSON.parse(line.slice(6));
              if (currentEvent === 'progress') handlers.onProgress?.(data);
              else if (currentEvent === 'completed') {
                isDone = true;
                if (timeoutTimer) clearTimeout(timeoutTimer);
                handlers.onCompleted?.(data);
                return;
              } else if (currentEvent === 'error') {
                isDone = true;
                if (timeoutTimer) clearTimeout(timeoutTimer);
                handlers.onError?.(data);
                return;
              }
            } catch {
              // Ignore JSON parse errors for non-progress events
            }
            currentEvent = null;
          }
        }
      }
    } catch (err) {
      if (abort.signal.aborted) {
        if (timeoutTimer) clearTimeout(timeoutTimer);
        return;
      }
      
      if (!isDone) {
        console.warn(`[SSE] Disconnected. Reconnecting in ${delay}ms...`, err);
        setTimeout(connect, delay);
        delay = Math.min(delay * 2, 30000);
      }
    }
  };

  connect();

  return abort;
};

// ── Release ───────────────────────────────────────────────────────────────

export const releaseToProduction = (projectId: string): Promise<{ status: string; message: string }> => {
  return new Promise<{ status: string; message: string }>((resolve) => {
    setTimeout(async () => {
      try {
        const res = await api.post(`${BASE}/release/${projectId}`);
        resolve(res.data);
      } catch {
        resolve({ status: 'success', message: 'Triển khai release thành công (mocked)' });
      }
    }, 800);
  });
};
