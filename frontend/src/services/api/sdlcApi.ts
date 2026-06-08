import api, { getBaseURL } from './client';
import { getStoredAuthSession } from './authStorage';

// ── Types ─────────────────────────────────────────────────────────────────

export type GateType = 'DEV_FILE_GATE' | 'PO_CLARIFY' | 'HITL_REVIEW' | 'FINAL_RELEASE';
export type RouteType = 'UI' | 'BACKEND' | 'ANALYSIS' | 'FULLSTACK';
export type GateAction = 'approve' | 'reject';

export interface GateItem {
  id: string;
  type: GateType;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  payload: {
    action?: string;         // 'MODIFY' | 'DELETE' | 'CREATE'
    path?: string;           // file path
    reason?: string;         // risk reason
    diff?: string;           // unified diff
    questions?: string[];    // PO clarification questions (max 3)
  };
  createdAt: string;
}

export interface AuditEntry {
  timestamp: string;
  actor: 'PO' | 'UX' | 'DEV' | 'QA' | 'A2A' | 'SYSTEM' | 'USER';
  action: string;
  status: 'ok' | 'warning' | 'error' | 'pending';
}

export interface PhaseStatus {
  agent: 'PO' | 'UX' | 'DEV' | 'QA';
  status: 'pending' | 'running' | 'gate_pending' | 'completed' | 'failed' | 'skipped';
  duration?: string;
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
  workflowId: string;
  status: string;
  routeType: RouteType;
  pipelinePhases: PhaseStatus[];
  pendingGates: GateItem[];
  auditLog: AuditEntry[];
  qaResult?: QAResult | null;
  releaseStatus?: 'pending' | 'approved' | 'rejected' | null;
  repoInfo?: {
    techStack: string[];
    fileCount: number;
    components: string[];
  } | null;
}

// ── Real API Implementation ───────────────────────────────────────────────

const BASE = '/sdlc';

export const startPipelineReal = (repoUrl: string, request: string): Promise<{ workflowId: string; status: string }> =>
  api.post(`${BASE}/run-po-agent`, { repo_url: repoUrl, request }).then((r) => r.data);

export const getPipelineStatusReal = (workflowId: string): Promise<PipelineResponse> =>
  api.get(`${BASE}/pipeline/${workflowId}`).then((r) => r.data.data);

export const resolveGateReal = (gateId: string, action: 'approve' | 'reject', comment?: string): Promise<{ success: boolean }> =>
  api.post(`${BASE}/approvals/${gateId}`, { action, comment }).then((r) => r.data);

export const releaseDecisionReal = (projectId: string, action: 'approve' | 'reject'): Promise<{ success: boolean; branch?: string; finalMd?: string }> =>
  api.post(`${BASE}/projects/${projectId}/release-decision`, { action }).then((r) => r.data);

// ── Real SSE Subscription ──────────────────────────────────────────────────

export const subscribeWorkflowSSEReal = (
  workflowId: string,
  handlers: {
    onMessage?: (event: string, data: Record<string, unknown>) => void;
    onError?: (error: unknown) => void;
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
      const response = await fetch(`${baseUrl}${BASE}/stream/${workflowId}`, {
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
              handlers.onMessage?.(currentEvent, data);
            } catch { /* Ignore malformed frames */ }
            currentEvent = null;
          }
        }
      }
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        handlers.onError?.(err);
      }
    }
  })();

  return abort;
};

// ── Client-Side Mock Simulator State ────────────────────────────────────────

interface MockState {
  workflowId: string | null;
  status: string;
  routeType: RouteType;
  pipelinePhases: PhaseStatus[];
  pendingGates: GateItem[];
  gateHistory: GateItem[];
  auditLog: AuditEntry[];
  qaResult: QAResult | null;
  releaseStatus: 'pending' | 'approved' | 'rejected' | null;
  repoInfo: {
    techStack: string[];
    fileCount: number;
    components: string[];
  } | null;
}

let mockState: MockState = {
  workflowId: null,
  status: 'idle',
  routeType: 'FULLSTACK',
  pipelinePhases: [],
  pendingGates: [],
  gateHistory: [],
  auditLog: [],
  qaResult: null,
  releaseStatus: null,
  repoInfo: null
};

// Simulated callbacks for SSE emulation
interface SSEListener {
  onMessage?: (event: string, data: Record<string, unknown>) => void;
}
let activeSSEListener: SSEListener | null = null;
let simulationTimeout: any = null;

const addAudit = (actor: AuditEntry['actor'], action: string, status: AuditEntry['status'] = 'ok') => {
  const timestamp = new Date().toLocaleTimeString();
  const entry: AuditEntry = { timestamp, actor, action, status };
  mockState.auditLog = [entry, ...mockState.auditLog];
  
  // Emit progress update via mock SSE
  if (activeSSEListener) {
    activeSSEListener.onMessage?.('progress', {
      status: mockState.status,
      pipelinePhases: mockState.pipelinePhases,
      auditLog: mockState.auditLog
    });
  }
};

const emitGatePending = (gate: GateItem) => {
  if (activeSSEListener) {
    activeSSEListener.onMessage?.('gate_pending', { gate });
  }
};

const triggerStateTransition = (nextIdx: number, steps: Array<{ status: string; delay: number; action: () => void }>) => {
  if (nextIdx >= steps.length) return;
  const step = steps[nextIdx];
  simulationTimeout = setTimeout(() => {
    step.action();
    triggerStateTransition(nextIdx + 1, steps);
  }, step.delay);
};

// Start simulation
const startMockSimulation = (repoUrl: string, request: string) => {
  if (simulationTimeout) clearTimeout(simulationTimeout);

  mockState = {
    workflowId: 'wf-mock-aifa-' + Math.random().toString(36).substring(2, 9),
    status: 'cloning',
    routeType: request.toLowerCase().includes('backend') ? 'BACKEND' : 'FULLSTACK',
    pipelinePhases: [
      { agent: 'PO', status: 'pending' },
      { agent: 'UX', status: 'pending' },
      { agent: 'DEV', status: 'pending' },
      { agent: 'QA', status: 'pending' }
    ],
    pendingGates: [],
    gateHistory: [],
    auditLog: [],
    qaResult: null,
    releaseStatus: 'pending',
    repoInfo: null
  };

  if (mockState.routeType === 'BACKEND') {
    mockState.pipelinePhases = [
      { agent: 'PO', status: 'pending' },
      { agent: 'UX', status: 'skipped' },
      { agent: 'DEV', status: 'pending' },
      { agent: 'QA', status: 'pending' }
    ];
  }

  addAudit('SYSTEM', `Cloning target repository: ${repoUrl}`);

  const steps = [
    {
      status: 'analyzing',
      delay: 2500,
      action: () => {
        mockState.status = 'analyzing';
        mockState.repoInfo = {
          techStack: ['React 19', 'Zustand', 'TypeScript', 'Tailwind CSS v4'],
          fileCount: 88,
          components: ['RepoInput', 'PipelineStepper', 'ApprovalQueue', 'QAResultCard']
        };
        addAudit('SYSTEM', 'Repository cloned successfully to local workspace. Found 88 files.');
        addAudit('SYSTEM', 'Analyzing tech stack: React 19, TypeScript, Tailwind v4 detected.');
      }
    },
    {
      status: 'po_running',
      delay: 3000,
      action: () => {
        mockState.status = 'po_running';
        mockState.pipelinePhases[0].status = 'running';
        addAudit('PO', 'PO Agent active. Classifying development route requirements...');
        addAudit('PO', `Route classification: ${mockState.routeType}. Generating Product Requirements (PRD) and acceptance criteria.`);
      }
    },
    {
      status: 'gate_pending_po',
      delay: 3000,
      action: () => {
        mockState.status = 'awaiting_approval';
        mockState.pipelinePhases[0].status = 'gate_pending';
        
        const poGate: GateItem = {
          id: 'gate-po-clarify',
          type: 'PO_CLARIFY',
          status: 'PENDING',
          payload: {
            questions: [
              'Do we need custom branding style for OAuth login panels or follow standard Google instructions?',
              'Should authentication state persist locally across browser sessions using localStorage?',
              'Is fallback auth (email/password) required alongside Google Login?'
            ]
          },
          createdAt: new Date().toISOString()
        };
        
        mockState.pendingGates = [poGate];
        addAudit('PO', '🔔 Human Gate Required: PO Clarification on requirements. Waiting for user input.', 'warning');
        emitGatePending(poGate);
      }
    }
  ];

  triggerStateTransition(0, steps);
};

// Resumes simulation after PO gate is resolved
const resumeSimulationAfterPO = () => {
  addAudit('SYSTEM', 'Handoff integrity verified. Initializing A2A contract between PO and developmental stages.');
  addAudit('A2A', '🔗 Handoff PO → UX contract verified. Hashes match, upstream commit hash: a8b9c10.');
  
  if (mockState.routeType === 'FULLSTACK') {
    mockState.status = 'ux_running';
    mockState.pipelinePhases[1].status = 'running';
    addAudit('UX', 'UX Agent active. Generating layout layouts and interactive flow definitions.');

    setTimeout(() => {
      mockState.pipelinePhases[1].status = 'completed';
      mockState.pipelinePhases[1].duration = '1m 20s';
      addAudit('UX', 'UX Specification and Penpot mockup specs generated successfully.');
      addAudit('A2A', '🔗 Handoff UX → DEV contract verified. Hashes match, upstream commit hash: c5d6e7f.');
      startDevPhase();
    }, 4000);
  } else {
    // Skip UX for BACKEND route
    startDevPhase();
  }
};

const startDevPhase = () => {
  mockState.status = 'dev_running';
  mockState.pipelinePhases[2].status = 'running';
  addAudit('DEV', 'DEV Agent active (Mock Claude Code). Analyzing existing structure and writing code changes...');

  setTimeout(() => {
    mockState.status = 'awaiting_approval';
    mockState.pipelinePhases[2].status = 'gate_pending';

    const devGate: GateItem = {
      id: 'gate-dev-risk',
      type: 'DEV_FILE_GATE',
      status: 'PENDING',
      payload: {
        action: 'MODIFY',
        path: 'src/middleware/auth.js',
        reason: 'auth/security file modification (High Risk Level)',
        diff: `diff --git a/src/middleware/auth.js b/src/middleware/auth.js
index f3b91a2..9e2c4c8 100644
--- a/src/middleware/auth.js
+++ b/src/middleware/auth.js
@@ -10,6 +10,12 @@ const checkAuth = (req, res, next) => {
   if (!token) {
     return res.status(401).json({ message: 'Unauthorized access' });
   }
+  
+  // Google OAuth validation branch
+  if (token.startsWith('g_oauth_')) {
+    req.user = { provider: 'google', id: token.slice(8) };
+    return next();
+  }
 
   try {
     const decoded = jwt.verify(token, process.env.JWT_SECRET);`
      },
      createdAt: new Date().toISOString()
    };

    mockState.pendingGates = [devGate];
    addAudit('DEV', '🔔 Human Gate Required: Security file modification in src/middleware/auth.js detected.', 'warning');
    emitGatePending(devGate);
  }, 4000);
};

// Resumes simulation after DEV gate is resolved
const resumeSimulationAfterDev = () => {
  mockState.status = 'sandbox_testing';
  addAudit('SYSTEM', 'Deploying patch to Docker Sandboxed local container (--network=none)...');

  setTimeout(() => {
    addAudit('SYSTEM', 'Docker Sandbox testing completed successfully. 12 / 12 tests passed.');
    addAudit('A2A', '🔗 Handoff DEV → QA contract verified. Hashes match, upstream commit hash: d9e8f7a.');
    
    mockState.status = 'qa_running';
    mockState.pipelinePhases[3].status = 'running';
    addAudit('QA', 'QA Agent active. Running regression testing suite and auditing code coverage metrics...');

    setTimeout(() => {
      mockState.status = 'qa_complete';
      mockState.pipelinePhases[2].status = 'completed';
      mockState.pipelinePhases[2].duration = '2m 15s';
      mockState.pipelinePhases[3].status = 'completed';
      mockState.pipelinePhases[3].duration = '1m 05s';
      
      mockState.qaResult = {
        status: 'passed',
        coverage: 94.2,
        blockers: 0,
        warnings: 1,
        reportUrl: 'http://localhost/reports/qa-report.html',
        commitSha: '9ef34ddf7e8a91b'
      };

      addAudit('QA', 'QA regression suite completed. Coverage rate: 94.2%. 0 blockers found.');
      addAudit('SYSTEM', 'Pipeline execution completed. Release branch aifa/google-oauth ready for deployment. Final Approval Required.');
    }, 4000);

  }, 3000);
};

// Exported mock controls
export const startPipelineMock = (repoUrl: string, request: string): Promise<{ workflowId: string; status: string }> => {
  startMockSimulation(repoUrl, request);
  return Promise.resolve({
    workflowId: mockState.workflowId!,
    status: mockState.status
  });
};

export const getPipelineStatusMock = (workflowId: string): Promise<PipelineResponse> => {
  return Promise.resolve({
    workflowId: mockState.workflowId || workflowId,
    status: mockState.status,
    routeType: mockState.routeType,
    pipelinePhases: mockState.pipelinePhases,
    pendingGates: mockState.pendingGates,
    auditLog: mockState.auditLog,
    qaResult: mockState.qaResult,
    releaseStatus: mockState.releaseStatus,
    repoInfo: mockState.repoInfo
  });
};

export const resolveGateMock = (gateId: string, action: 'approve' | 'reject', comment?: string): Promise<{ success: boolean }> => {
  const gateIdx = mockState.pendingGates.findIndex(g => g.id === gateId);
  if (gateIdx !== -1) {
    const gate = mockState.pendingGates[gateIdx];
    gate.status = action === 'approve' ? 'APPROVED' : 'REJECTED';
    
    // Move to history
    mockState.gateHistory.push(gate);
    mockState.pendingGates.splice(gateIdx, 1);

    addAudit('USER', `Resolved gate ${gateId}: ${action.toUpperCase()}${comment ? ' - ' + comment : ''}`);

    if (activeSSEListener) {
      activeSSEListener.onMessage?.('gate_resolved', { gateId, action, comment });
    }

    if (action === 'approve') {
      if (gateId === 'gate-po-clarify') {
        resumeSimulationAfterPO();
      } else if (gateId === 'gate-dev-risk') {
        resumeSimulationAfterDev();
      }
    } else {
      mockState.status = 'failed';
      mockState.pipelinePhases.forEach(p => {
        if (p.status === 'running' || p.status === 'gate_pending') {
          p.status = 'failed';
        }
      });
      addAudit('SYSTEM', `Pipeline halted because gate ${gateId} was rejected.`, 'error');
    }
  }

  return Promise.resolve({ success: true });
};

export const releaseDecisionMock = (projectId: string, action: 'approve' | 'reject'): Promise<{ success: boolean; branch?: string; finalMd?: string }> => {
  mockState.releaseStatus = action === 'approve' ? 'approved' : 'rejected';
  
  if (action === 'approve') {
    mockState.status = 'idle'; // Finished
    addAudit('USER', 'Owner approved release deployment.');
    addAudit('SYSTEM', 'Successfully merged features/google-oauth into main. Released branch created.', 'ok');
    return Promise.resolve({
      success: true,
      branch: 'aifa/google-oauth-release',
      finalMd: '# AIFA Build Release Documentation\n- Merge completed successfully\n- QA code verified'
    });
  } else {
    mockState.status = 'failed';
    addAudit('USER', 'Owner rejected release deployment.');
    return Promise.resolve({ success: false });
  }
};

export const subscribeWorkflowSSEMock = (
  workflowId: string,
  handlers: {
    onMessage?: (event: string, data: Record<string, unknown>) => void;
    onError?: (error: unknown) => void;
  }
): AbortController => {
  const abort = new AbortController();
  activeSSEListener = handlers;
  
  abort.signal.addEventListener('abort', () => {
    activeSSEListener = null;
  });

  return abort;
};

// ── Environment Routing Wrapper ───────────────────────────────────────────

const isMockMode = () => {
  return import.meta.env.VITE_USE_MOCK === 'true';
};

export const startPipeline = (repoUrl: string, request: string): Promise<{ workflowId: string; status: string }> => {
  return isMockMode() ? startPipelineMock(repoUrl, request) : startPipelineReal(repoUrl, request);
};

export const getPipelineStatus = (workflowId: string): Promise<PipelineResponse> => {
  return isMockMode() ? getPipelineStatusMock(workflowId) : getPipelineStatusReal(workflowId);
};

export const resolveGate = (gateId: string, action: 'approve' | 'reject', comment?: string): Promise<{ success: boolean }> => {
  return isMockMode() ? resolveGateMock(gateId, action, comment) : resolveGateReal(gateId, action, comment);
};

export const releaseDecision = (projectId: string, action: 'approve' | 'reject'): Promise<{ success: boolean; branch?: string; finalMd?: string }> => {
  return isMockMode() ? releaseDecisionMock(projectId, action) : releaseDecisionReal(projectId, action);
};

export const subscribeWorkflowSSE = (
  workflowId: string,
  handlers: {
    onMessage?: (event: string, data: Record<string, unknown>) => void;
    onError?: (error: unknown) => void;
  }
): AbortController => {
  return isMockMode() ? subscribeWorkflowSSEMock(workflowId, handlers) : subscribeWorkflowSSEReal(workflowId, handlers);
};

// Backward-compatibility adapters for existing components if any
export const startFromRepo = (projectId: string, repoUrl: string): Promise<any> => {
  return startPipeline(repoUrl, 'add google login').then(res => ({
    projectId: workflowIdToProjectId(res.workflowId),
    status: res.status
  }));
};

export const getPipelineStatusLegacy = (projectId: string): Promise<any> => {
  const workflowId = projectIdToWorkflowId(projectId);
  return getPipelineStatus(workflowId).then(res => ({
    projectId,
    status: res.status,
    currentStep: phaseToStep(res.status),
    repoInfo: res.repoInfo,
    approvals: res.pendingGates.map(g => ({
      id: g.id,
      agentName: g.type === 'PO_CLARIFY' ? 'PO' : 'DEV',
      artifactType: g.type === 'PO_CLARIFY' ? 'prd' : 'code_diff',
      confidence: 90,
      summary: g.type === 'PO_CLARIFY' ? 'PO Clarifications' : g.payload.reason || 'Code changes',
      createdAt: g.createdAt,
      approved: g.status === 'APPROVED'
    })),
    qaResult: res.qaResult
  }));
};

export const approveItemLegacy = (projectId: string, approvalId: string, action: 'approve' | 'reject', comment?: string): Promise<any> => {
  return resolveGate(approvalId, action, comment);
};

export const getArtifactContent = (projectId: string, type: string): Promise<{ content: string }> => {
  const contentMap: Record<string, string> = {
    prd: `# PRD for target repository\n- Authentication feature integration.`,
    ux_spec: `# UX Spec for authentication flow\n- Interactive Google button widget.`,
    code_diff: `diff --git a/auth.js b/auth.js\n+ // auth codes`,
    qa_report: `# QA Report\n- All validation assertions passed successfully.`
  };
  return Promise.resolve({ content: contentMap[type] || 'No content found' });
};

// Utilities to map legacy parameters
const workflowIdToProjectId = (wfId: string) => wfId;
const projectIdToWorkflowId = (pId: string) => pId;
const phaseToStep = (status: string): number => {
  switch (status) {
    case 'cloning': return 1;
    case 'analyzing': return 1;
    case 'po_running': return 2;
    case 'awaiting_approval': return 2;
    case 'ux_running': return 3;
    case 'dev_running': return 4;
    case 'sandbox_testing': return 5;
    case 'qa_running': return 6;
    case 'qa_complete': return 6;
    default: return 0;
  }
};

// ── Restored Legacy API Functions ──

export interface FeatureRequest {
  title: string;
  description?: string;
  priority?: 'High' | 'Medium' | 'Low';
  target_user?: string;
  business_goal?: string;
  constraints?: string[];
}

export const getWorkflowStatus = (projectId: string): Promise<any> =>
  api.get(`${BASE}/workflow-status`, { params: { project_id: projectId } }).then((r) => r.data.data);

export const getAuditTrail = (projectId: string): Promise<any> =>
  api.get(`${BASE}/audit-trail/${projectId}`).then((r) => r.data.data);

export const getWorkflowMetrics = (projectId: string): Promise<any> =>
  api.get(`${BASE}/projects/${projectId}/metrics`).then((r) => r.data.data);

export const getProjectArtifacts = (projectId: string): Promise<any> =>
  api.get(`${BASE}/projects/${projectId}/artifacts`).then((r) => r.data.data);

export const getBacklogs = (projectId: string): Promise<any> =>
  api.get(`${BASE}/projects/${projectId}/backlog`).then((r) => r.data.data);

// ── Global HITL Interventions ──

export interface GlobalInterventionItem extends GateItem {
  projectId: string;
  projectName: string;
  repoUrl: string;
  pipelineStatus: string;   // e.g. 'awaiting_approval', 'qa_complete'
  currentPhase: string;     // e.g. 'PO', 'DEV', 'QA'
  updatedAt: string;        // ISO timestamp for sorting
}

export const getAllInterventionsReal = (): Promise<GlobalInterventionItem[]> =>
  api.get(`${BASE}/interventions`).then((r) => r.data.data);

export const getAllInterventionsMock = (): Promise<GlobalInterventionItem[]> => {
  const mockInterventions: GlobalInterventionItem[] = [
    {
      id: 'gate-po-clarify-mock',
      type: 'PO_CLARIFY',
      status: 'PENDING',
      payload: {
        questions: [
          'Should we support recurring subscription models in the payment service, or just one-off charges for now?',
          'Is payment status webhook verification mandatory for the initial sandbox release?',
          'What is the threshold limit for transaction alerts (e.g. flag transactions > $500)?'
        ]
      },
      createdAt: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
      updatedAt: new Date(Date.now() - 3600000).toISOString(),
      projectId: 'proj-pay-001',
      projectName: 'Payment Service API',
      repoUrl: 'https://github.com/aifa-workspace/payment-service-api',
      pipelineStatus: 'awaiting_approval',
      currentPhase: 'PO'
    },
    {
      id: 'gate-dev-risk-mock',
      type: 'DEV_FILE_GATE',
      status: 'PENDING',
      payload: {
        action: 'MODIFY',
        path: 'src/auth/jwt.py',
        reason: 'auth/security file modification (High Risk Level)',
        diff: `diff --git a/src/auth/jwt.py b/src/auth/jwt.py
index a2d8c3b..f4e9d1a 100644
--- a/src/auth/jwt.py
+++ b/src/auth/jwt.py
@@ -12,4 +12,10 @@ def generate_token(user_id):
-    payload = {"sub": user_id, "exp": datetime.utcnow() + timedelta(minutes=30)}
+    # DEV Bypass override check
+    if user_id == "admin_override":
+        payload = {"sub": user_id, "exp": datetime.utcnow() + timedelta(days=365), "role": "superuser"}
+    else:
+        payload = {"sub": user_id, "exp": datetime.utcnow() + timedelta(minutes=30)}
     return jwt.encode(payload, SECRET_KEY, algorithm="HS256")`
      },
      createdAt: new Date(Date.now() - 7200000).toISOString(), // 2 hours ago
      updatedAt: new Date(Date.now() - 7200000).toISOString(),
      projectId: 'proj-auth-002',
      projectName: 'Auth Middleware Server',
      repoUrl: 'https://github.com/aifa-workspace/auth-middleware-server',
      pipelineStatus: 'awaiting_approval',
      currentPhase: 'DEV'
    },
    {
      id: 'gate-release-mock',
      type: 'FINAL_RELEASE',
      status: 'PENDING',
      payload: {
        reason: 'SaaS Dashboard Portal Release merging features/google-oauth into main. Regression suite passed: 94.2% coverage.'
      },
      createdAt: new Date(Date.now() - 10800000).toISOString(), // 3 hours ago
      updatedAt: new Date(Date.now() - 10800000).toISOString(),
      projectId: 'proj-dash-003',
      projectName: 'SaaS Dashboard Portal',
      repoUrl: 'https://github.com/aifa-workspace/saas-dashboard-portal',
      pipelineStatus: 'qa_complete',
      currentPhase: 'QA'
    }
  ];
  return Promise.resolve(mockInterventions);
};

export const getAllInterventions = (): Promise<GlobalInterventionItem[]> => {
  return isMockMode() ? getAllInterventionsMock() : getAllInterventionsReal();
};


