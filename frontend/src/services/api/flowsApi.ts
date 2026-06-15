import api, { getBaseURL } from './client';
import type {
  ExtractFlowsRequest,
  ExtractFlowsResponse,
  ResolveUnknownsRequest,
  ResolveUnknownsResponse,
  SSECompletedEvent,
  SSEErrorEvent,
  SSEPartialEvent,
  SSEProgressEvent,
  SessionState,
  TaskItem,
  TaskStatus,
  TaskType,
  WorkflowTaskSummary,
} from './types';

/**
 * Start Agent 1 to extract UX flows from a document.
 * Returns immediately; listen to SSE for progress.
 * POST /api/v1/workflows/extract-flows
 */
async function extractFlows(payload: ExtractFlowsRequest): Promise<ExtractFlowsResponse> {
  const { data } = await api.post<ExtractFlowsResponse>('/workflows/extract-flows', payload);
  return data;
}

/**
 * Send BA/QC resolutions for unknowns from Agent 1 output.
 * POST /api/v1/workflows/resolve-unknowns
 */
async function resolveUnknowns(
  payload: ResolveUnknownsRequest,
): Promise<ResolveUnknownsResponse> {
  const { data } = await api.post<ResolveUnknownsResponse>('/workflows/resolve-unknowns', payload);
  return data;
}

/**
 * Get task status as a one-time JSON response.
 * GET /api/v1/workflows/tasks/:task_id
 */
export async function getTaskStatus(taskId: string): Promise<TaskItem> {
  const { data } = await api.get<{ status: string; data: TaskItem }>(`/workflows/tasks/${taskId}`);
  return data.data;
}

/**
 * DELETE /api/v1/workflows/tasks/:taskId
 */
export async function deleteTask(taskId: string): Promise<void> {
  await api.delete(`/workflows/tasks/${taskId}`);
}

/**
 * List tasks with optional filters.
 * GET /api/v1/workflows/tasks
 */
export async function listWorkflowTasks(params?: {
  type?: TaskType;
  status?: TaskStatus;
  limit?: number;
  projectId?: string;
}): Promise<WorkflowTaskSummary[]> {
  const { data } = await api.get<{ status: string; data: WorkflowTaskSummary[] }>(
    '/workflows/tasks',
    {
      params: {
        type: params?.type,
        status: params?.status,
        limit: params?.limit ?? 50,
        project_id: params?.projectId,
      },
    },
  );
  return data.data;
}

/**
 * Get the latest completed task for a document.
 * GET /api/v1/workflows/latest/:documentId
 */
async function getLatestTask(documentId: string): Promise<TaskItem | null> {
  const { data } = await api.get<{ status: string; data: TaskItem | null }>(
    `/workflows/latest/${documentId}`,
  );
  return data.data;
}

/**
 * Subscribe to task status via Server-Sent Events (SSE).
 * GET /api/v1/workflows/status/:task_id
 *
 * Returns an EventSource for streaming. The caller should attach
 * `onmessage`, `addEventListener('progress')`, etc.
 *
 * For programmatic parsing, use `subscribeTaskSSE()` below which
 * returns an AbortController + callback.
 */
export function createTaskEventSource(taskId: string): EventSource {
  const baseURL = getBaseURL();
  const url = `${baseURL}/workflows/status/${taskId}`;
  return new EventSource(url);
}

/**
 * Subscribe to task SSE stream with a callback.
 * Returns an AbortController - call `.abort()` to unsubscribe.
 *
 * Usage:
 *   const ctrl = subscribeTaskSSE(taskId, {
 *     onProgress: (e) => console.log(e.data.step, e.data.log),
 *     onCompleted: (e) => console.log('Done', e.data),
 *     onError: (e) => console.error(e.data.message),
 *   });
 *   // later: ctrl.abort();
 */
export function subscribeTaskSSE(
  taskId: string,
  handlers: {
    onProgress?: (event: SSEProgressEvent) => void;
    onPartial?: (event: SSEPartialEvent) => void;
    onCompleted?: (event: SSECompletedEvent) => void;
    onError?: (event: SSEErrorEvent) => void;
  },
): AbortController {
  const es = createTaskEventSource(taskId);
  const ctrl = new AbortController();
  let isTerminal = false;
  let isAborted = false;

  es.addEventListener('progress', (raw) => {
    try {
      const data = JSON.parse((raw as MessageEvent).data);
      handlers.onProgress?.({ event: 'progress', data });
    } catch {
      /* skip malformed */
    }
  });

  es.addEventListener('partial', (raw) => {
    try {
      const data = JSON.parse((raw as MessageEvent).data);
      handlers.onPartial?.({ event: 'partial', data });
    } catch {
      /* skip malformed */
    }
  });

  es.addEventListener('completed', (raw) => {
    if (isTerminal || isAborted) return;
    try {
      const data = JSON.parse((raw as MessageEvent).data);
      isTerminal = true;
      handlers.onCompleted?.({ event: 'completed', data });
      es.close();
    } catch {
      /* skip malformed */
    }
  });

  es.addEventListener('error', (raw) => {
    if (isTerminal || isAborted) return;
    try {
      const data = JSON.parse((raw as MessageEvent).data);
      isTerminal = true;
      handlers.onError?.({ event: 'error', data });
    } catch {
      /* skip malformed */
    }
    es.close();
  });

  es.onerror = async () => {
    if (isTerminal || isAborted) return;

    // Transient network/proxy issues can trigger onerror while EventSource is reconnecting.
    // Let native auto-reconnect continue instead of force-closing.
    if (es.readyState === EventSource.CONNECTING) {
      return;
    }

    // Only treat as fatal when browser has fully closed the connection.
    if (es.readyState === EventSource.CLOSED) {
      try {
        const task = await getTaskStatus(taskId);
        if (task.status === 'completed') {
          isTerminal = true;
          handlers.onCompleted?.({
            event: 'completed',
            data: task.result ?? {},
          });
          return;
        }

        if (task.status === 'failed') {
          isTerminal = true;
          handlers.onError?.({
            event: 'error',
            data: { message: task.error ?? 'Task failed' },
          });
          return;
        }
      } catch {
        // Ignore status lookup errors and fallback to generic message below.
      }

      isTerminal = true;
      handlers.onError?.({
        event: 'error',
        data: { message: 'SSE connection closed unexpectedly' },
      });
    }
  };

  ctrl.signal.addEventListener(
    'abort',
    () => {
      isAborted = true;
      es.close();
    },
    { once: true },
  );

  return ctrl;
}

// =============================================================================
// Polling helper (fallback when SSE is not available)
// =============================================================================

/**
 * Poll task status until it reaches a terminal state.
 * Returns the final task or rejects on timeout/error.
 */
async function pollTaskStatus(
  taskId: string,
  options?: {
    intervalMs?: number;
    timeoutMs?: number;
    terminalStates?: TaskStatus[];
  },
): Promise<TaskItem> {
  const interval = options?.intervalMs ?? 3_000;
  const timeout = options?.timeoutMs ?? 5 * 60 * 1_000; // 5 min default
  const terminals = options?.terminalStates ?? ['completed', 'failed'];

  const start = Date.now();

  while (Date.now() - start < timeout) {
    const task = await getTaskStatus(taskId);

    if (terminals.includes(task.status)) {
      if (task.status === 'failed') {
        throw new Error(task.error ?? 'Task failed with unknown error');
      }
      return task;
    }

    await new Promise((r) => setTimeout(r, interval));
  }

  throw new Error(`Task ${taskId} timed out after ${timeout}ms`);
}

/**
 * Save session state
 * POST /api/v1/sessions/:page
 */
export async function saveSessionState(
  page: string,
  data: {
    selectedDocIds: string[];
    taskId?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<SessionState> {
  const { data: response } = await api.post<{ status: string; data: SessionState }>(
    `/sessions/${page}`,
    data,
  );
  return response.data;
}

/**
 * Get session state
 * GET /api/v1/sessions/:page
 */
export async function getSessionState(
  page: string,
  projectId?: string | null,
): Promise<SessionState | null> {
  const { data: response } = await api.get<{ status: string; data: SessionState | null }>(
    `/sessions/${page}`,
    { params: { project_id: projectId || undefined } },
  );
  return response.data;
}

/**
 * Delete session state
 * DELETE /api/v1/sessions/:page
 */
export async function deleteSessionState(page: string, projectId?: string | null): Promise<void> {
  await api.delete(`/sessions/${page}`, { params: { project_id: projectId || undefined } });
}
