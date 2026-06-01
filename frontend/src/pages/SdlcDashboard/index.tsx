import './sdlc.css';
import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSdlcStore } from '@/store/useSdlcStore';
import * as sdlcApi from '@/services/api/sdlcApi';
import { useAppStore } from '@/store/useAppStore';

import StageInspector from './components/StageInspector';
import HumanGatePanel from './components/HumanGatePanel';
import ArtifactViewer from './components/ArtifactViewer';
import AuditTimeline from './components/AuditTimeline';
import { AuditSidebar } from './components/AuditSidebar';
import FinalReviewPacket from './components/FinalReviewPacket';
import FeatureRequestForm from './components/FeatureRequestForm';
import EmptyProjectState from './components/EmptyProjectState';
import KanbanBoard from './components/KanbanBoard';


// eslint-disable-next-line @typescript-eslint/no-unused-vars
const PHASES = [
  { key: 'intent', label: 'Intent Agent', icon: '🧠', gate: 'REQUIREMENT_GATE', color: '#f59e0b' },
  { key: 'po',  label: 'PO Agent',  icon: '📋', gate: 'REQUIREMENT_GATE', color: '#6366f1' },
  { key: 'ux',  label: 'UX Agent',  icon: '🎨', gate: 'UX_GATE',          color: '#8b5cf6' },
  { key: 'dev', label: 'DEV Agent', icon: '⚙️',  gate: 'DEV_GATE',         color: '#3b82f6' },
  { key: 'qa',  label: 'QA Agent',  icon: '🧪', gate: 'QA_GATE',          color: '#10b981' },
] as const;

export default function SdlcDashboard() {
  const { currentProjectId, treeLoaded, fetchTree } = useAppStore();
  const {
    projectId, workflowStatus, workflowLoading, activePhase,
    sseLogs, sseActive, artifacts, selectedArtifact, auditEvents,
    setProjectId, setWorkflowStatus, setWorkflowLoading,
    setActiveTask, appendSseLog, setSseActive, setArtifacts,
    selectArtifact, setAuditEvents, setError,
    isFeatureRequestFormOpen, setFeatureRequestFormOpen,
    isAuditSidebarOpen, setAuditSidebarOpen,
  } = useSdlcStore();

  const [gateTaskId, setGateTaskId]     = useState<string | null>(null);
  const [sseAbort, setSseAbort]         = useState<AbortController | null>(null);
  const [panel, setPanel]               = useState<'artifacts' | 'audit'>('artifacts');
  const [viewMode, setViewMode]         = useState<'kanban' | 'pipeline' | 'release'>('kanban');

  useEffect(() => {
    if (currentProjectId && currentProjectId !== projectId) setProjectId(currentProjectId);
  }, [currentProjectId, projectId, setProjectId]);

  // Load project if visited directly
  useEffect(() => {
    if (!treeLoaded) void fetchTree();
  }, [treeLoaded, fetchTree]);

  // Load workflow status on mount / projectId change
  const refreshStatus = useCallback(async () => {
    if (!projectId) return;
    setWorkflowLoading(true);
    try {
      const ws = await sdlcApi.getWorkflowStatus(projectId);
      setWorkflowStatus(ws);
    } catch { setError('Failed to load workflow status'); }
    finally { setWorkflowLoading(false); }
  }, [projectId, setError, setWorkflowLoading, setWorkflowStatus]);

  useEffect(() => { refreshStatus(); }, [refreshStatus]);

  // Load audit trail
  useEffect(() => {
    if (!projectId) return;
    sdlcApi.getAuditTrail(projectId).then((d) => setAuditEvents(d.events)).catch(() => {});
  }, [projectId, workflowStatus, setAuditEvents]);

  // SSE subscription
  const startSSE = useCallback((taskId: string, phase: typeof PHASES[number]['key']) => {
    sseAbort?.abort();
    setActiveTask(taskId, phase);
    const abort = sdlcApi.subscribeTaskSSE(taskId, {
      onProgress: (d) => appendSseLog((d.log as string) || (d.token as string) || ''),
      onCompleted: async () => {
        setSseActive(false);
        await refreshStatus();
        // Refresh artifacts
        const task = await sdlcApi.getSdlcTaskStatus(taskId);
        setArtifacts(task.artifacts || []);
      },
      onError: (d) => { setSseActive(false); setError((d.message as string) || 'Agent error'); },
      onWarning: (msg) => { appendSseLog(`⚠️ ${msg}`); }
    });
    setSseAbort(abort);
  }, [sseAbort, refreshStatus, appendSseLog, setActiveTask, setArtifacts, setError, setSseActive]);

  // Clean up SSE subscription on unmount
  useEffect(() => {
    return () => {
      sseAbort?.abort();
    };
  }, [sseAbort]);

  // Run handlers
  const handleRunIntent = async (fr: sdlcApi.FeatureRequest) => {
    setFeatureRequestFormOpen(false);
    if (!projectId) return;
    const res = await sdlcApi.runIntentAgent(projectId, fr);
    startSSE(res.task_id, 'intent');
    setViewMode('pipeline');
  };

  const handleRunNext = async (phase: typeof PHASES[number]['key'], sourceTaskId: string, feedbackPrompt?: string) => {
    const runners: Record<string, (id: string, fp?: string) => Promise<{ task_id: string }>> = {
      po:  (id, fp) => sdlcApi.runPOAgent(projectId!, id, fp),
      ux:  (id, fp) => sdlcApi.runUXAgent(id, fp),
      dev: (id, fp) => sdlcApi.runDEVAgent(id, fp),
      qa:  (id, fp) => sdlcApi.runQAAgent(id, fp),
    };
    const runner = runners[phase];
    if (!runner) return;
    const res = await runner(sourceTaskId, feedbackPrompt);
    startSSE(res.task_id, phase);
  };

  const handleGateDecisionWithId = async (taskId: string, decision: sdlcApi.GateDecisionPayload['decision'], comment: string) => {
    await sdlcApi.submitGateDecision(taskId, { decision, comment });
    await refreshStatus();
  };

  const handleGateDecision = async (decision: sdlcApi.GateDecisionPayload['decision'], comment: string) => {
    if (!gateTaskId) return;
    await handleGateDecisionWithId(gateTaskId, decision, comment);
    setGateTaskId(null);
  };

  // Artifact viewer
  const handleViewArtifacts = async (taskId: string) => {
    const task = await sdlcApi.getSdlcTaskStatus(taskId);
    setArtifacts(task.artifacts || []);
    setPanel('artifacts');
  };

  return (
    <div className="sdlc-dashboard">
      {!projectId ? (
        <EmptyProjectState />
      ) : (
        <>
          <div className="flex bg-surface-container border-b border-outline-variant/30 px-6 py-2 gap-4 items-center shrink-0">
            <button
              onClick={() => setViewMode('kanban')}
              className={`px-4 py-1.5 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors ${viewMode === 'kanban' ? 'bg-primary text-on-primary' : 'hover:bg-surface-container-high text-on-surface-variant'}`}
            >
              📋 Backlog Board
            </button>
            <button
              onClick={() => setViewMode('pipeline')}
              className={`px-4 py-1.5 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors ${viewMode === 'pipeline' ? 'bg-primary text-on-primary' : 'hover:bg-surface-container-high text-on-surface-variant'}`}
            >
              ⚙️ Pipeline Inspector
            </button>
            <button
              onClick={() => setViewMode('release')}
              className={`px-4 py-1.5 rounded-lg text-sm font-bold flex items-center gap-2 relative transition-colors ${viewMode === 'release' ? 'bg-primary text-on-primary' : 'hover:bg-surface-container-high text-on-surface-variant'}`}
            >
              📦 Final Release Packet
              {workflowStatus?.currentPhase === 'FINAL_REVIEW' && (
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-error rounded-full animate-ping" />
              )}
            </button>
            
            <button
              onClick={() => setAuditSidebarOpen(!isAuditSidebarOpen)}
              className={`ml-auto px-4 py-1.5 border border-outline-variant/30 rounded-lg text-xs font-bold flex items-center gap-2 transition-colors ${
                isAuditSidebarOpen
                  ? 'bg-primary/20 border-primary/50 text-primary'
                  : 'bg-surface-container-high hover:bg-surface-container-highest text-on-surface'
              }`}
            >
              <span className="material-symbols-outlined text-sm">history</span>
              Lịch sử duyệt
            </button>
          </div>

          <div className="flex-1 flex flex-col min-h-0 relative">
            {workflowLoading && (
              <div className="absolute inset-0 z-20 bg-background/60 backdrop-blur-[1px] flex items-center justify-center">
                <div className="flex flex-col items-center gap-3 bg-surface-container-high/80 border border-outline-variant/30 px-6 py-4 rounded-xl shadow-xl">
                  <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent"></div>
                  <span className="text-xs text-on-surface font-semibold">Đang tải dữ liệu SDLC...</span>
                </div>
              </div>
            )}

            {viewMode === 'kanban' ? (
              <div className="absolute inset-0 z-10 bg-background">
                <KanbanBoard onRunIntent={handleRunIntent} />
              </div>
            ) : null}

            {viewMode === 'release' ? (
              <div className="absolute inset-0 z-10 bg-background overflow-hidden flex flex-col">
                <FinalReviewPacket projectId={projectId} />
              </div>
            ) : null}

            {/* ── Architecture Pipeline (Stage Inspector) ────────────────── */}
            <div className="sdlc-pipeline" style={{ paddingTop: '10px' }}>
              <StageInspector
                onRunIntent={() => setFeatureRequestFormOpen(true)}
                onRunNext={handleRunNext as unknown as (phase: string, sourceTaskId: string, feedbackPrompt?: string) => void}
                onOpenGate={(taskId) => setGateTaskId(taskId)}
                onViewArtifacts={handleViewArtifacts}
                onGateDecision={handleGateDecisionWithId}
                sseLogs={sseLogs}
                activePhase={activePhase}
                sseActive={sseActive}
              />
            </div>
          </div>

          {/* ── Bottom panel ─────────────────────────────────────────────── */}
          <div className="sdlc-bottom">
            <div className="sdlc-panel-tabs">
              <button className={`sdlc-tab ${panel === 'artifacts' ? 'active' : ''}`} onClick={() => setPanel('artifacts')}>📄 Artifacts</button>
              <button className={`sdlc-tab ${panel === 'audit' ? 'active' : ''}`} onClick={() => setPanel('audit')}>📜 Audit Trail</button>
            </div>

            <AnimatePresence mode="wait">
              {panel === 'artifacts' ? (
                <motion.div key="artifacts" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="sdlc-panel-content">
                  <ArtifactViewer
                    artifacts={artifacts}
                    selected={selectedArtifact}
                    onSelect={selectArtifact}
                  />
                </motion.div>
              ) : (
                <motion.div key="audit" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="sdlc-panel-content">
                  <AuditTimeline events={auditEvents} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </>
      )}

      {/* ── Feature Request Modal ────────────────────────────────────── */}
      <AnimatePresence>
        {isFeatureRequestFormOpen && projectId && (
          <motion.div className="sdlc-modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ zIndex: 100 }}>
            <motion.div className="sdlc-modal" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}>
              <FeatureRequestForm 
                onSubmit={async (fr) => {
                  setFeatureRequestFormOpen(false);
                  try {
                    await sdlcApi.createBacklog(projectId, fr);
                    // Switch to kanban to see it
                    setViewMode('kanban');
                  } catch (e) {
                    console.error('Failed to create backlog', e);
                  }
                }} 
                onCancel={() => setFeatureRequestFormOpen(false)} 
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Human Gate Modal ─────────────────────────────────────────── */}
      <AnimatePresence>
        {gateTaskId && (
          <motion.div className="sdlc-modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="sdlc-modal sdlc-modal--large" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}>
              <HumanGatePanel
                taskId={gateTaskId}
                onDecision={handleGateDecision}
                onClose={() => setGateTaskId(null)}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Audit Sidebar Drawer ────────────────────────────────────── */}
      <AuditSidebar />
    </div>
  );
}
