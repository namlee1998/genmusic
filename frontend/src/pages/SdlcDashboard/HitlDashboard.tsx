import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bug, RefreshCw, CheckCircle } from 'lucide-react';
import { useHitlStore } from '@/store/useHitlStore';
import { useSdlcStore } from '@/store/useSdlcStore';
import { useAppStore } from '@/store/useAppStore';
import type { GlobalInterventionItem } from '@/services/api/sdlcApi';
import SessionHitlBlock from './components/SessionHitlBlock';

const MAX_SESSIONS = 4;

export default function HitlDashboard() {
  const navigate = useNavigate();
  const store = useHitlStore();
  const getAllSessions = useSdlcStore((s) => s.getAllSessions);
  const currentProjectId = useAppStore((s) => s.currentProjectId);

  const interventions = store.interventions;
  const isLoading = store.isLoading;
  const error = store.error;
  const fetchInterventions = store.fetchInterventions;

  const sessions = getAllSessions().slice(0, MAX_SESSIONS);

  useEffect(() => {
    void fetchInterventions(currentProjectId || undefined);
    const timer = setInterval(() => void fetchInterventions(currentProjectId || undefined), 30000);
    return () => clearInterval(timer);
  }, [fetchInterventions, currentProjectId]);

  const interventionsBySession = useMemo(() => {
    const map = new Map<string, GlobalInterventionItem[]>();
    for (const item of interventions) {
      if (!item.sessionId) continue;
      const list = map.get(item.sessionId) || [];
      list.push(item);
      map.set(item.sessionId, list);
    }
    return map;
  }, [interventions]);

  const handleReview = (item: GlobalInterventionItem) => {
    const sessionId = item.sessionId;
    const params = new URLSearchParams({ highlightGate: item.id, agentKey: item.currentPhase });
    if (sessionId) params.set('sessionId', sessionId);
    navigate(`/sdlc/build?${params.toString()}`);
  };

  return (
    <main
      className="flex flex-col gap-0 p-0 h-full min-h-0 overflow-y-auto bg-background text-on-surface font-sans antialiased"
      style={{ padding: '24px 32px' }}
    >
      {/* ── Header ── */}
      <div className="flex items-center justify-between mx-[18px] mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-on-surface tracking-tight">AIFA Dashboard</h1>
          <p className="text-[11.5px] text-on-surface-variant mt-0.5">Real-time overview of your AI Factory — {sessions.length} active session{sessions.length === 1 ? '' : 's'}</p>
        </div>
        <div className="flex items-center gap-4 text-xs font-semibold">
          <div className="flex items-center gap-1.5 text-emerald-400">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Live</span>
          </div>
          <button
            className="flex items-center gap-1.5 text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer"
            onClick={() => void fetchInterventions(currentProjectId || undefined)}
            disabled={isLoading}
          >
            <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
            <span>Last updated: {store.lastFetchedAt ? store.lastFetchedAt : 'now'}</span>
          </button>
        </div>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="flex items-center gap-3 p-3 mx-[18px] mb-4 bg-error/10 border border-error/20 rounded-xl text-error text-[12px]">
          <Bug size={16} />
          <span className="flex-1">{error}</span>
          <button onClick={() => void fetchInterventions(currentProjectId || undefined)} className="bg-error/20 border border-error/30 text-white text-[10px] font-bold px-2.5 py-1 rounded cursor-pointer hover:bg-error/30 transition-all">Retry</button>
        </div>
      )}

      {/* ── Per-session bottleneck/action/status boards ── */}
      {sessions.length === 0 ? (
        <div className="mx-[18px] flex flex-col items-center justify-center text-center py-16 px-4 bg-surface-container/30 border border-dashed border-outline-variant/15 rounded-xl">
          <CheckCircle size={36} className="text-emerald-500" />
          <span className="text-[13px] font-bold text-on-surface mt-3">No active sessions</span>
          <p className="text-[10.5px] text-on-surface-variant/80 mt-1 max-w-[260px] leading-relaxed">
            Start a feature request to see its bottlenecks, pending approvals, and agent status here.
          </p>
        </div>
      ) : (
        <div className="mx-[18px] flex flex-col gap-5 pb-6">
          {sessions.map((session, idx) => (
            <SessionHitlBlock
              key={session.sessionId}
              sessionId={session.sessionId}
              sessionLabel={`Session ${idx + 1} — ${session.featureRequest || session.sessionId}`}
              pipelinePhases={session.pipelinePhases}
              interventions={interventionsBySession.get(session.sessionId) || []}
              isLoading={isLoading}
              onChanged={() => void fetchInterventions(currentProjectId || undefined)}
              onReview={handleReview}
              onManageAgents={() => navigate('/sdlc/build')}
            />
          ))}
        </div>
      )}
    </main>
  );
}
