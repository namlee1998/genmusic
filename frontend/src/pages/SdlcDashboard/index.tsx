import './sdlc.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { FileText, History, Plus, Workflow } from 'lucide-react';
import { useSdlcStore } from '@/store/useSdlcStore';
import * as sdlcApi from '@/services/api/sdlcApi';
import { useAppStore } from '@/store/useAppStore';
import StageInspector from './components/StageInspector';
import HumanGatePanel, { type StructuredDecision } from './components/HumanGatePanel';
import FeatureRequestForm from './components/FeatureRequestForm';
import EmptyProjectState from './components/EmptyProjectState';
import ReleaseGatePanel from './components/ReleaseGatePanel';
import McpActivityPanel from './components/McpActivityPanel';
import DeliveryErrorBanner from './components/DeliveryErrorBanner';
import WorkflowStatusBanner from './components/WorkflowStatusBanner';
import ScenarioSwitcher from './components/ScenarioSwitcher';

type Phase = 'po' | 'ux' | 'dev' | 'qa';

export default function SdlcDashboard() {
  const navigate = useNavigate();
  const { currentProjectId, treeLoaded, fetchTree } = useAppStore();
  const {
    projectId, workflowStatus, activePhase, sseLogs, sseActive,
    error,
    setProjectId, setWorkflowStatus, setWorkflowLoading, setActiveTask,
    appendSseLog, setSseActive, setAuditEvents,
    setError, isFeatureRequestFormOpen, setFeatureRequestFormOpen,
  } = useSdlcStore();

  const [gateTaskId, setGateTaskId] = useState<string | null>(null);
  const [gateEvaluation, setGateEvaluation] = useState<{
    complexity?: string;
    gateType?: string;
    score?: number;
    recommendation?: string;
    summary?: string;
    issues?: Array<{
      code: string;
      severity: string;
      detail: string;
      suggestedAction?: string;
    }>;
  } | null>(null);
  const [gateAgentOutput, setGateAgentOutput] = useState<Record<string, unknown> | null>(null);
  const [gateOutputVersion, setGateOutputVersion] = useState(0);
  const [gateRetryCount, setGateRetryCount] = useState(0);
  const [sseAbort, setSseAbort] = useState<AbortController | null>(null);
  const [submittedRequest, setSubmittedRequest] = useState<sdlcApi.FeatureRequest | null>(null);
  const [dismissedGateTaskId, setDismissedGateTaskId] = useState<string | null>(null);
  const autoOpeningGateTaskId = useRef<string | null>(null);

  useEffect(() => {
    if (currentProjectId && currentProjectId !== projectId) setProjectId(currentProjectId);
  }, [currentProjectId, projectId, setProjectId]);

  useEffect(() => {
    if (!treeLoaded) void fetchTree();
  }, [treeLoaded, fetchTree]);

  const refreshStatus = useCallback(async () => {
    if (!projectId) return;
    setWorkflowLoading(true);
    try {
      setWorkflowStatus(await sdlcApi.getWorkflowStatus(projectId));
      const trail = await sdlcApi.getAuditTrail(projectId);
      setAuditEvents(trail.events);
    } catch (requestError) {
      setError(sdlcApi.parseApiError(requestError, 'Could not load the delivery workflow.'));
    } finally {
      setWorkflowLoading(false);
    }
  }, [projectId, setAuditEvents, setError, setWorkflowLoading, setWorkflowStatus]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    const hasRunningWorker = Object.values(workflowStatus?.phases || {}).some(
      (phase) => phase?.status === 'pending' || phase?.status === 'processing',
    );
    const orchestratorIsAdvancing = workflowStatus?.currentPhase?.endsWith('_RUNNING');
    if (!hasRunningWorker && !orchestratorIsAdvancing) return;
    const interval = window.setInterval(() => void refreshStatus(), 1000);
    return () => window.clearInterval(interval);
  }, [refreshStatus, workflowStatus]);

  const startSSE = useCallback((taskId: string, phase: Phase) => {
    sseAbort?.abort();
    setActiveTask(taskId, phase);
    const abort = sdlcApi.subscribeTaskSSE(taskId, {
      onProgress: (data) => appendSseLog((data.log as string) || (data.token as string) || ''),
      onCompleted: async () => {
        setSseActive(false);
        await sdlcApi.getSdlcTaskStatus(taskId);
        await refreshStatus();
      },
      onError: (data) => {
        setSseActive(false);
        const raw = (data.message as string) || 'Agent execution failed.';
        // Backend persists task errors as "[CODE] message" (T4); split them out.
        const match = raw.match(/^\[([A-Z_]+)\]\s*(.*)$/);
        setError(match ? { message: match[2], code: match[1], phase } : { message: raw });
      },
    });
    setSseAbort(abort);
  }, [appendSseLog, refreshStatus, setActiveTask, setError, setSseActive, sseAbort]);

  const startPO = async (request: sdlcApi.FeatureRequest) => {
    if (!projectId) return;
    setError(null);
    setSubmittedRequest(request);
    try {
      const task = await sdlcApi.startPOAgent(projectId, request);
      setFeatureRequestFormOpen(false);
      startSSE(task.task_id, 'po');
      await refreshStatus();
    } catch (requestError) {
      setSubmittedRequest(null);
      setError(sdlcApi.parseApiError(requestError, 'Could not send the feature request to PO Agent.'));
    }
  };

  const runNext = async (phase: string, sourceTaskId: string, feedbackPrompt = '') => {
    const runners = {
      ux: sdlcApi.runUXAgent,
      dev: sdlcApi.runDEVAgent,
      qa: sdlcApi.runQAAgent,
    };
    const runner = runners[phase as keyof typeof runners];
    if (!runner) return;
    setError(null);
    const task = await runner(sourceTaskId, feedbackPrompt);
    startSSE(task.task_id, phase as Phase);
  };

  const openArtifacts = (taskId: string) => navigate(`/sdlc/outputs?task=${taskId}`);

  const openGate = useCallback(async (taskId: string) => {
    if (autoOpeningGateTaskId.current === taskId) return;
    autoOpeningGateTaskId.current = taskId;
    try {
      const task = await sdlcApi.getSdlcTaskStatus(taskId);
      setGateEvaluation(task.gate_evaluation || null);
      setGateAgentOutput((task.agent_output as Record<string, unknown>) || null);
      setGateOutputVersion(task.output_version ?? 0);
      setGateRetryCount(task.retry_count ?? 0);
      setDismissedGateTaskId(null);
      setGateTaskId(taskId);
    } catch (requestError) {
      setError(sdlcApi.parseApiError(requestError, 'Could not open the human review output.'));
    } finally {
      autoOpeningGateTaskId.current = null;
    }
  }, [setError]);

  const closeGate = () => {
    setDismissedGateTaskId(gateTaskId);
    setGateTaskId(null);
    setGateEvaluation(null);
    setGateAgentOutput(null);
    setGateOutputVersion(0);
    setGateRetryCount(0);
  };

  useEffect(() => {
    const reviewPhase = workflowStatus?.currentPhase?.match(/^(PO|UX|DEV|QA)_REVIEW$/)?.[1]?.toLowerCase() as Phase | undefined;
    if (!reviewPhase) return;
    const reviewTaskId = workflowStatus?.phases[reviewPhase]?.taskId;
    if (!reviewTaskId || gateTaskId === reviewTaskId || dismissedGateTaskId === reviewTaskId) return;
    const timeout = window.setTimeout(() => void openGate(reviewTaskId), 0);
    return () => window.clearTimeout(timeout);
  }, [dismissedGateTaskId, gateTaskId, openGate, workflowStatus]);

  // Structured HITL decision (plan 2.3/2.8): idempotency key + optimistic lock.
  const submitGate = async (d: StructuredDecision) => {
    if (!gateTaskId) return;
    const response = await sdlcApi.submitStructuredDecision(gateTaskId, {
      decision_id: crypto.randomUUID(),
      base_output_version: gateOutputVersion,
      action: d.action,
      comment: d.comment,
      payload: {
        ...(d.retryReason ? { retry_reason: d.retryReason } : {}),
        ...(d.editedOutput ? { edited_output: d.editedOutput } : {}),
        ...(d.targetFields ? { target_fields: d.targetFields } : {}),
        ...(d.blockingIssues ? { blocking_issues: d.blockingIssues } : {}),
        ...(d.acceptanceChecks ? { acceptance_checks: d.acceptanceChecks } : {}),
      },
    });
    closeGate();
    const rerunTaskId = response.data?.rerun_task_id;
    const rerunPhase = response.data?.rerun_task_type?.replace('-agent', '') as Phase | undefined;
    if (rerunTaskId && rerunPhase) startSSE(rerunTaskId, rerunPhase);
    await refreshStatus();
  };

  const submitReleaseDecision = async (decision: 'APPROVE' | 'REJECT', comment: string) => {
    if (!projectId) return;
    await sdlcApi.submitReleaseDecision(projectId, {
      decision_id: crypto.randomUUID(),
      decision,
      comment,
    });
    await refreshStatus();
  };

  if (!projectId) return <EmptyProjectState />;

  return (
    <main className="sdlc-dashboard">
      <header className="delivery-header">
        <div>
          <p className="delivery-header__eyebrow"><Workflow size={14} /> AIDLC delivery workspace</p>
          <h1>Build a feature with four AI workers</h1>
          <p>Submit once to PO. Workers continue automatically and pause only when human direction is needed.</p>
        </div>
        <div className="delivery-subnav">
          <button className="delivery-subnav__btn is-active">
            <Workflow size={15} /> Build
          </button>
          <button className="delivery-subnav__btn" onClick={() => navigate('/sdlc/audit')}>
            <History size={15} /> Audit
          </button>
          <button className="delivery-subnav__btn" onClick={() => navigate('/sdlc/outputs')}>
            <FileText size={15} /> Outputs
          </button>
          <button className="delivery-header__cta" onClick={() => setFeatureRequestFormOpen(true)}>
            <Plus size={16} /> New feature request
          </button>
        </div>
      </header>

      <ScenarioSwitcher onChanged={refreshStatus} />

      <DeliveryErrorBanner error={error} onDismiss={() => setError(null)} />

      {workflowStatus && <WorkflowStatusBanner workflowStatus={workflowStatus} />}

      <StageInspector
        featureRequest={submittedRequest || workflowStatus?.featureRequest}
        onStartPO={() => setFeatureRequestFormOpen(true)}
        onRunNext={runNext}
        onOpenGate={openGate}
        onViewArtifacts={openArtifacts}
        sseLogs={sseLogs}
        activePhase={activePhase}
        sseActive={sseActive}
      />

      {workflowStatus && !workflowStatus.releaseGate?.eligible && (
        <McpActivityPanel phases={workflowStatus.phases} />
      )}

      {workflowStatus?.releaseGate?.eligible && (
        <ReleaseGatePanel releaseGate={workflowStatus.releaseGate} onDecide={submitReleaseDecision} />
      )}

      <AnimatePresence>
        {isFeatureRequestFormOpen && (
          <motion.div className="sdlc-modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="sdlc-modal" initial={{ scale: .96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: .96, opacity: 0 }}>
              <FeatureRequestForm onSubmit={startPO} onCancel={() => setFeatureRequestFormOpen(false)} />
            </motion.div>
          </motion.div>
        )}
        {gateTaskId && (
          <motion.div className="sdlc-modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="sdlc-modal" initial={{ scale: .96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: .96, opacity: 0 }}>
              <HumanGatePanel
                taskId={gateTaskId}
                gateEvaluation={gateEvaluation}
                agentOutput={gateAgentOutput}
                outputVersion={gateOutputVersion}
                retryCount={gateRetryCount}
                onSubmit={submitGate}
                onClose={closeGate}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
