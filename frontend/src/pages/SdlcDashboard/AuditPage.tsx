import './sdlc.css';
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
    <main className="sdlc-dashboard" style={{ maxWidth: '1000px', margin: '0 auto', padding: '24px 16px' }}>
      <header className="delivery-header" style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <p className="delivery-header__eyebrow" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Workflow size={14} className="text-indigo-400" />
            <span>AIDLC delivery workspace</span>
          </p>
          <h1>Audit &amp; Logs</h1>
          <p style={{ margin: '4px 0 0 0', color: '#908fa0', fontSize: '13px' }}>
            Run timeline, A2A handoffs, and every human-in-the-loop decision for this project.
          </p>
        </div>
        <button className="delivery-header__cta" onClick={() => void refreshAudit()} disabled={loading}>
          <RefreshCw size={16} className={loading ? 'spin' : ''} /> Refresh
        </button>
      </header>

      <DeliveryErrorBanner error={error} onDismiss={() => setError(null)} />

      <section className="delivery-output delivery-output--fullpage">
        <div className="delivery-output__body">
          <h2 className="delivery-section-title">Workflow metrics</h2>
          <WorkflowMetricsPanel metrics={metrics} />
          <h2 className="delivery-section-title">CI preflight mock</h2>
          <CiPreflightPanel />
          <h2 className="delivery-section-title">Phase transitions</h2>
          <PhaseTransitionStrip transitions={phaseTransitions} />
          <h2 className="delivery-section-title">Run timeline</h2>
          <AuditTimeline events={auditEvents} />
        </div>
      </section>
    </main>
  );
}
