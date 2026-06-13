import { useCallback, useEffect, useState } from 'react';
import { Workflow, RefreshCw } from 'lucide-react';
import { useSdlcStore } from '@/store/useSdlcStore';
import { useAppStore } from '@/store/useAppStore';
import * as sdlcApi from '@/services/api/sdlcApi';
import AuditTimeline from './components/AuditTimeline';
import WorkflowMetricsPanel from './components/WorkflowMetricsPanel';
import PhaseTransitionStrip from './components/PhaseTransitionStrip';
import CiPreflightPanel from './components/CiPreflightPanel';
import DeliveryErrorBanner from './components/DeliveryErrorBanner';
import EmptyProjectState from './components/EmptyProjectState';
import type { WorkflowMetrics } from '@/store/useSdlcStore';

/**
 * Audit & Logs page (/sdlc/audit).
 *
 * Per the HITL implementation plan (section 1.2 / 1.3) the audit trail is its
 * own page that reads from the shared run/log state (Zustand `auditEvents`) and
 * fetches independently — it must work even when the Build page was never opened.
 */
export default function AuditPage() {
  const { currentProjectId } = useAppStore();
  const {
    projectId, auditEvents, phaseTransitions, error,
    setProjectId, setAuditEvents, setPhaseTransitions, setError,
  } = useSdlcStore();

  const [loading, setLoading] = useState(false);
  const [metrics, setMetrics] = useState<WorkflowMetrics | null>(null);

  // Keep the SDLC store's projectId in sync with the globally selected project.
  useEffect(() => {
    if (currentProjectId && currentProjectId !== projectId) setProjectId(currentProjectId);
  }, [currentProjectId, projectId, setProjectId]);

  const refreshAudit = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const [trail, projectMetrics] = await Promise.all([
        sdlcApi.getAuditTrail(projectId),
        sdlcApi.getWorkflowMetrics(projectId).catch(() => null),
      ]);
      setAuditEvents(trail.events);
      setPhaseTransitions(trail.phaseTransitions || []);
      setMetrics(projectMetrics);
    } catch (requestError) {
      setError(sdlcApi.parseApiError(requestError, 'Could not load the audit trail.').message);
    } finally {
      setLoading(false);
    }
  }, [projectId, setAuditEvents, setPhaseTransitions, setError]);

  useEffect(() => {
    void Promise.resolve().then(refreshAudit);
  }, [refreshAudit]);

  if (!projectId) return <EmptyProjectState />;

  return (
    <main 
      className="flex flex-col gap-0 p-0 h-full min-h-0 overflow-y-auto bg-[#090a0f] text-[#e3e1e9] font-sans antialiased" 
      style={{ 
        maxWidth: '1000px', 
        margin: '0 auto', 
        padding: '24px 16px',
        backgroundImage: 'radial-gradient(at 0% 0%, rgba(99, 102, 241, 0.05) 0px, transparent 50%), radial-gradient(at 100% 0%, rgba(14, 165, 233, 0.05) 0px, transparent 50%)'
      }}
    >
      <header className="flex items-center justify-between gap-[18px] p-[18px_20px] border border-[#1e293b] rounded-[10px] bg-gradient-to-br from-[#6366f1]/13 to-[#0d0e13]/96 mx-[18px] mt-4 mb-6 flex-wrap sm:flex-nowrap">
        <div>
          <p className="flex items-center gap-1.5 m-0 text-[#a5b4fc] font-mono text-[10px] font-bold tracking-[0.12em] uppercase">
            <Workflow size={14} className="text-indigo-400" />
            <span>AIDLC delivery workspace</span>
          </p>
          <h1 className="mt-[5px] mb-1 text-white text-[22px] font-bold">Audit &amp; Logs</h1>
          <p className="m-0 text-[#a8a7b5] text-[13px] leading-relaxed">
            Run timeline, A2A handoffs, and every human-in-the-loop decision for this project.
          </p>
        </div>
        <button 
          className="inline-flex items-center gap-1.5 flex-shrink-0 px-3.5 py-2.5 border border-indigo-400/45 rounded-lg bg-indigo-500 text-white font-bold text-[12px] cursor-pointer hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed" 
          onClick={() => void refreshAudit()} 
          disabled={loading}
        >
          <RefreshCw size={16} className={loading ? 'spin' : ''} /> Refresh
        </button>
      </header>

      <DeliveryErrorBanner error={error} onDismiss={() => setError(null)} />

      <section className="flex flex-col border border-[#1e293b] rounded-lg bg-[#121318] p-5 mx-[18px] mb-6 overflow-hidden">
        <div className="w-full flex flex-col gap-6">
          <div>
            <h2 className="text-[13px] font-bold text-[#f8fafc] uppercase tracking-wider mb-2 mt-4">Workflow metrics</h2>
            <WorkflowMetricsPanel metrics={metrics} />
          </div>
          <div>
            <h2 className="text-[13px] font-bold text-[#f8fafc] uppercase tracking-wider mb-2 mt-4">CI preflight mock</h2>
            <CiPreflightPanel />
          </div>
          <div>
            <h2 className="text-[13px] font-bold text-[#f8fafc] uppercase tracking-wider mb-2 mt-4">Phase transitions</h2>
            <PhaseTransitionStrip transitions={phaseTransitions} />
          </div>
          <div>
            <h2 className="text-[13px] font-bold text-[#f8fafc] uppercase tracking-wider mb-2 mt-4">Run timeline</h2>
            <AuditTimeline events={auditEvents} />
          </div>
        </div>
      </section>
    </main>
  );
}
