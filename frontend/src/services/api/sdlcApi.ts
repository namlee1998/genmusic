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

export const getWorkflowMetrics = (projectId: string) =>
  api.get(`${BASE}/projects/${projectId}/metrics`).then((r) => r.data.data);

export const getProjectArtifacts = (projectId: string) =>
  api.get(`${BASE}/projects/${projectId}/artifacts`).then((r) => r.data.data);

// ── Dev-only demo scenario selector (MOCK_SCENARIO) ───────────────────────

export interface MockScenarioState {
  scenario: string;
  mockEnabled: boolean;
  available: string[];
}

export const getMockScenario = (): Promise<MockScenarioState> =>
  api.get(`${BASE}/dev/mock-scenario`).then((r) => r.data.data);

export const setMockScenario = (scenario: string) =>
  api.post(`${BASE}/dev/mock-scenario`, { scenario }).then((r) => r.data.data);

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

// Client-side mock simulation state
let mockPipeline: PipelineResponse | null = null;
let mockTimer: any = null;

const MOCK_ARTIFACTS: Record<string, string> = {
  prd: `# Product Requirements Document (PRD)

## 1. Overview
This is a generated PRD for the repository analysis. The agent has identified the core stack is React and Node.js.

## 2. Features
- User Auth & Session Management
- Interactive Dashboard Layout
- Dark/Light Mode support
- Repository Integration & Analysis

## 3. Tech Stack Requirements
- React 19 + TypeScript
- Zustand for lightweight state management
- Vite for building and hot-reload
`,
  ux_spec: `# UI/UX Specification

## 1. Design System
- Primary: HSL 220 90% 56% (Vibrant Blue)
- Dark Background: HSL 224 71% 4% (Premium Sleek Dark)
- Accent: HSL 142 70% 45% (Vibrant Emerald)

## 2. Page Hierarchy
- /auth: Simplified login
- /sdlc: Single-page delivery dashboard with 3 primary panes
- /sdlc/audit: Interactive audit trail
- /sdlc/outputs: Detailed artifact list
`,
  code_diff: `diff --git a/src/App.tsx b/src/App.tsx
index 1a2b3c4..5d6e7f8 100644
--- a/src/App.tsx
+++ b/src/App.tsx
@@ -10,6 +10,12 @@ export default function App() {
   return (
     <div className="app-container">
       <header>
-        <h1>SDLC Platform</h1>
+        <h1>End-to-End Autonomous Software Factory</h1>
       </header>
+      <main>
+        <RepoInput />
+        <PipelineStepper />
+      </main>
     </div>
   );
 }
`,
  qa_report: `# 🧪 QA Report Summary

## 1. Unit Tests
- Passed: 45 / 45 (100%)
- Failed: 0 (0%)
- Warnings: 2

## 2. Code Coverage
- Statements: 92.5%
- Branches: 88.0%
- Functions: 94.1%
- Lines: 92.5%

## 3. Security Audits
- 0 critical vulnerabilities found.
- 1 low severity dependency warning (npm audit).
`
};

const startMockSimulation = (projectId: string, repoUrl: string) => {
  if (mockTimer) clearTimeout(mockTimer);

  mockPipeline = {
    projectId,
    status: 'cloning',
    currentStep: 1,
    repoInfo: {
      techStack: ['React 19', 'Zustand', 'TypeScript', 'Vite'],
      fileCount: 124,
      components: ['RepoInput', 'PipelineStepper', 'ApprovalQueue', 'QAResultCard']
    },
    approvals: []
  };

  const steps = [
    { status: 'cloning', step: 1, delay: 3000 },
    { status: 'analyzing', step: 1, delay: 3000 },
    { status: 'po_running', step: 2, delay: 4000 },
    { status: 'awaiting_po_approval', step: 2, delay: 0 },
    { status: 'ux_running', step: 3, delay: 4000 },
    { status: 'dev_running', step: 4, delay: 4000 },
    { status: 'sandbox_testing', step: 5, delay: 3000 },
    { status: 'awaiting_dev_approval', step: 5, delay: 0 },
    { status: 'qa_running', step: 6, delay: 4000 },
    { status: 'qa_complete', step: 6, delay: 0 }
  ];

  let currentIdx = 0;

  const runNext = () => {
    if (!mockPipeline) return;
    if (currentIdx >= steps.length) return;

    const nextStep = steps[currentIdx];

    if (nextStep.status === 'awaiting_po_approval') {
      mockPipeline.status = 'awaiting_approval';
      mockPipeline.approvals.push({
        id: 'po-prd',
        agentName: 'PO',
        artifactType: 'prd',
        confidence: 78,
        summary: 'Generated high-fidelity PRD for the repository. Requires verification of core tech stack.',
        createdAt: new Date().toISOString()
      });
      currentIdx++; // point to next state for when resumed
      return;
    }

    if (nextStep.status === 'awaiting_dev_approval') {
      mockPipeline.status = 'awaiting_approval';
      mockPipeline.approvals.push({
        id: 'dev-code',
        agentName: 'DEV',
        artifactType: 'code_diff',
        confidence: 65,
        summary: 'Integrated Tailwind configuration and main components. Please verify changes to index.tsx.',
        createdAt: new Date().toISOString()
      });
      currentIdx++; // point to next state for when resumed
      return;
    }

    mockPipeline.status = nextStep.status;
    mockPipeline.currentStep = nextStep.step;

    if (nextStep.status === 'qa_complete') {
      mockPipeline.qaResult = {
        status: 'passed',
        coverage: 92.5,
        blockers: 0,
        warnings: 2,
        reportUrl: 'QA.md',
        commitSha: 'a7b8c9d'
      };
      return;
    }

    currentIdx++;
    mockTimer = setTimeout(runNext, nextStep.delay);
  };

  mockTimer = setTimeout(runNext, 3000);
};

const approveMockItem = (approvalId: string) => {
  if (!mockPipeline) return;
  const item = mockPipeline.approvals.find(a => a.id === approvalId);
  if (item) {
    item.approved = true;

    if (approvalId === 'po-prd') {
      mockPipeline.status = 'ux_running';
      mockPipeline.currentStep = 3;
      setTimeout(() => {
        if (!mockPipeline) return;
        mockPipeline.status = 'dev_running';
        mockPipeline.currentStep = 4;
        setTimeout(() => {
          if (!mockPipeline) return;
          mockPipeline.status = 'sandbox_testing';
          mockPipeline.currentStep = 5;
          setTimeout(() => {
            if (!mockPipeline) return;
            mockPipeline.status = 'awaiting_approval';
            mockPipeline.approvals.push({
              id: 'dev-code',
              agentName: 'DEV',
              artifactType: 'code_diff',
              confidence: 65,
              summary: 'Integrated Tailwind configuration and main components. Please verify changes to index.tsx.',
              createdAt: new Date().toISOString()
            });
          }, 3000);
        }, 4000);
      }, 4000);
    } else if (approvalId === 'dev-code') {
      mockPipeline.status = 'qa_running';
      mockPipeline.currentStep = 6;
      setTimeout(() => {
        if (!mockPipeline) return;
        mockPipeline.status = 'qa_complete';
        mockPipeline.currentStep = 6;
        mockPipeline.qaResult = {
          status: 'passed',
          coverage: 92.5,
          blockers: 0,
          warnings: 2,
          reportUrl: 'QA.md',
          commitSha: 'a7b8c9d'
        };
      }, 4000);
    }
  }
};

export const startFromRepo = (projectId: string, repoUrl: string): Promise<any> => {
  if (import.meta.env.VITE_USE_MOCK === 'true') {
    startMockSimulation(projectId, repoUrl);
    return Promise.resolve({ projectId, status: 'cloning' });
  }
  return api.post(`${BASE}/start-from-repo`, { project_id: projectId, repo_url: repoUrl }).then(r => r.data);
};

export const getPipelineStatus = (projectId: string): Promise<PipelineResponse> => {
  if (import.meta.env.VITE_USE_MOCK === 'true') {
    if (!mockPipeline) {
      return Promise.resolve({
        projectId,
        status: 'idle',
        currentStep: 0,
        approvals: []
      });
    }
    return Promise.resolve(mockPipeline);
  }
  return api.get(`${BASE}/pipeline-status/${projectId}`).then(r => r.data.data);
};

export const approveItem = (projectId: string, approvalId: string, action: 'approve' | 'reject', comment?: string): Promise<any> => {
  if (import.meta.env.VITE_USE_MOCK === 'true') {
    if (action === 'approve') {
      approveMockItem(approvalId);
    } else {
      if (mockPipeline) {
        mockPipeline.status = 'failed';
      }
    }
    return Promise.resolve({ success: true });
  }
  return api.post(`${BASE}/pipeline/${projectId}/approve`, { approval_id: approvalId, action, comment }).then(r => r.data);
};

export const getArtifactContent = (projectId: string, type: string): Promise<{ content: string }> => {
  if (import.meta.env.VITE_USE_MOCK === 'true') {
    return Promise.resolve({ content: MOCK_ARTIFACTS[type] || 'No content found' });
  }
  return api.get(`${BASE}/pipeline/${projectId}/artifacts/${type}`).then(r => r.data);
};

