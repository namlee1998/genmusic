import { useCallback, useEffect, useState } from 'react';
import { Workflow, RefreshCw, GitCompare, History } from 'lucide-react';
import { useSdlcStore } from '@/store/useSdlcStore';
import { useAppStore } from '@/store/useAppStore';
import * as sdlcApi from '@/services/api/sdlcApi';
import AuditTimeline from './components/AuditTimeline';
import A2aHandoffTimeline from './components/A2aHandoffTimeline';
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
  const [activeView, setActiveView] = useState<'a2a' | 'all'>('a2a');

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
      className="flex flex-col gap-0 p-0 w-full bg-[#090a0f] text-[#e3e1e9] font-sans antialiased" 
      style={{ 
        maxWidth: '100%', 
        padding: '24px 32px',
        backgroundImage: 'radial-gradient(at 0% 0%, rgba(99, 102, 241, 0.05) 0px, transparent 50%), radial-gradient(at 100% 0%, rgba(14, 165, 233, 0.05) 0px, transparent 50%)'
      }}
    >
      <DeliveryErrorBanner error={error} onDismiss={() => setError(null)} />

      {/* Control Bar: View Switcher & Refresh Button */}
      <div className="flex items-center justify-between mx-[18px] mb-6 flex-wrap gap-3">
        {/* View Switcher Pills */}
        <div className="flex bg-[#11131a]/60 border border-[#1e293b] rounded-lg p-1">
          <button
            onClick={() => setActiveView('a2a')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-md transition-all cursor-pointer ${
              activeView === 'a2a'
                ? 'bg-indigo-500 text-white shadow-[0_2px_8px_rgba(99,102,241,0.2)]'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <GitCompare size={14} />
            <span>A2A Handoff Flow</span>
          </button>
          <button
            onClick={() => setActiveView('all')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-md transition-all cursor-pointer ${
              activeView === 'all'
                ? 'bg-indigo-500 text-white shadow-[0_2px_8px_rgba(99,102,241,0.2)]'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <History size={14} />
            <span>Full Run Timeline</span>
          </button>
        </div>

        {/* Refresh Button */}
        <button 
          className="inline-flex items-center gap-1.5 flex-shrink-0 px-3.5 py-2.5 border border-indigo-400/45 rounded-lg bg-indigo-500 text-white font-bold text-[12px] cursor-pointer hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all" 
          onClick={() => void refreshAudit()} 
          disabled={loading}
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      <section className="flex flex-col border border-[#1e293b] rounded-lg bg-[#121318] p-5 mx-[18px] mb-6">
        <div className="w-full flex flex-col gap-6">
          {activeView === 'all' && (
            <>
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
            </>
          )}

          {activeView === 'a2a' && (
            <div>
              <h2 className="text-[13px] font-bold text-[#f8fafc] uppercase tracking-wider mb-4 mt-2">
                Agent-to-Agent Handoff Contracts
              </h2>
              <A2aHandoffTimeline events={auditEvents} />
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
