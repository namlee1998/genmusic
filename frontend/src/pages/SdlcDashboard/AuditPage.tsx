import { useCallback, useEffect, useState, useMemo } from 'react';
import { RefreshCw, ShieldAlert, Info } from 'lucide-react';
import { useSdlcStore, type AuditEvent } from '@/store/useSdlcStore';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@/store/useAppStore';
import * as sdlcApi from '@/services/api/sdlcApi';
import { useApi } from '@/hooks/useApi';
import DeliveryErrorBanner from './components/DeliveryErrorBanner';
import EmptyProjectState from './components/EmptyProjectState';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';

export default function AuditPage() {
  const { currentProjectId } = useAppStore();
  const {
    projectId, auditEvents, error,
    setProjectId, setAuditEvents, setError,
  } = useSdlcStore(
    useShallow((state) => ({
      projectId: state.projectId,
      auditEvents: state.auditEvents,
      error: state.error,
      setProjectId: state.setProjectId,
      setAuditEvents: state.setAuditEvents,
      setError: state.setError,
    }))
  );

  const [selectedEvent, setSelectedEvent] = useState<AuditEvent | null>(null);

  const { loading, execute: fetchAuditTrail } = useApi(sdlcApi.getAuditTrail, {
    onSuccess: (trail) => {
      setAuditEvents(trail.events);
      if (trail.events && trail.events.length > 0) {
        setSelectedEvent(trail.events[trail.events.length - 1]);
      }
    },
    onError: (errMessage) => setError(errMessage)
  });

  const reversedAuditEvents = useMemo(() => {
    return [...auditEvents].reverse();
  }, [auditEvents]);

  const refreshAudit = useCallback(() => {
    if (projectId) {
      // Using catch just to swallow unhandled promise rejection since error is handled via callback
      fetchAuditTrail(projectId).catch(() => {});
    }
  }, [projectId, fetchAuditTrail]);

  // Sync project
  useEffect(() => {
    if (currentProjectId && currentProjectId !== projectId) setProjectId(currentProjectId);
  }, [currentProjectId, projectId, setProjectId]);

  useEffect(() => {
    refreshAudit();
  }, [refreshAudit]);

  if (!projectId) return <EmptyProjectState />;

  const getStepStatusDot = (ev: AuditEvent) => {
    if (ev.type === 'failure' || ev.status === 'error' || ev.severity?.toLowerCase() === 'high') {
      return 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)] animate-pulse';
    }
    if (ev.type === 'hitl_decision' || ev.status === 'warning' || ev.severity?.toLowerCase() === 'medium') {
      return 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]';
    }
    if (ev.type === 'agent_run') {
      return 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)] animate-pulse';
    }
    return 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]';
  };

  const getSeverityBadgeColor = (sev?: string | null) => {
    if (!sev) return 'bg-slate-800 text-slate-400 border-slate-700';
    switch (sev.toLowerCase()) {
      case 'high':
      case 'danger':
        return 'bg-red-500/10 border-red-500/20 text-red-400';
      case 'medium':
      case 'warning':
        return 'bg-amber-500/10 border-amber-500/20 text-amber-400';
      default:
        return 'bg-blue-500/10 border-blue-500/20 text-blue-400';
    }
  };

  return (
    <main
      className="flex flex-col gap-0 p-0 w-full min-h-full bg-background text-on-surface font-sans antialiased"
      style={{
        maxWidth: '100%',
        padding: '24px 32px',
        backgroundImage: 'radial-gradient(at 0% 0%, rgba(99, 102, 241, 0.05) 0px, transparent 50%), radial-gradient(at 100% 0%, rgba(14, 165, 233, 0.05) 0px, transparent 50%)'
      }}
    >
      <DeliveryErrorBanner error={error} onDismiss={() => setError(null)} />

      {/* Header */}
      <div className="flex items-center justify-between mx-[18px] mb-6 flex-wrap gap-3">
        <h1 className="text-xl font-bold text-white tracking-tight">Audit Trail</h1>

        <Button
          variant="primary"
          size="sm"
          className="gap-1.5"
          onClick={() => void refreshAudit()}
          disabled={loading}
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
        </Button>
      </div>

      {/* Error banner */}
      {error && !loading && (
        <div className="mx-[18px] mb-6 flex items-center gap-3 p-3.5 bg-red-500/10 border border-red-500/20 rounded-xl text-red-300 text-[12px]">
          <ShieldAlert size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Main two-panel layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6 mx-[18px] mb-6 items-start">
        {/* Left: Audit event list */}
        <aside className="bg-surface-container border border-outline-variant/40 rounded-lg p-4 flex flex-col gap-3 max-h-[600px] overflow-y-auto custom-scrollbar">
          <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 pb-2 border-b border-[#1e293b]/60">
            Request Runs
          </h2>

          {loading && auditEvents.length === 0 ? (
            <div className="flex flex-col gap-2.5">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-14 rounded-lg bg-slate-800/40 animate-pulse" />
              ))}
            </div>
          ) : auditEvents.length === 0 ? (
            <p className="text-xs text-slate-500 py-6 text-center">No audit events found.</p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {reversedAuditEvents.map((ev, idx) => {
                const isSelected = selectedEvent?.timestamp === ev.timestamp && selectedEvent?.action === ev.action;
                return (
                  <div
                    key={idx}
                    onClick={() => setSelectedEvent(ev)}
                    className={`group flex items-start gap-3 p-2.5 rounded-lg border cursor-pointer transition-all duration-200 select-none ${
                      isSelected
                        ? 'bg-indigo-500/10 border-indigo-500/40 text-white shadow-sm'
                        : 'border-transparent hover:bg-slate-800/40 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${getStepStatusDot(ev)}`} />

                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between gap-1 mb-0.5">
                        <span className="font-bold text-[11px] truncate leading-none">
                          {ev.actor || 'System'}
                        </span>
                        <span className="text-[9px] font-mono text-slate-500 leading-none">
                          {new Date(ev.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="m-0 text-[10px] text-slate-500 group-hover:text-slate-400 truncate transition-colors leading-tight">
                        {ev.action.replace(/_/g, ' ')}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </aside>

        {/* Right: Event detail */}
        <section className="bg-surface-container border border-outline-variant/40 rounded-lg p-5 flex flex-col min-h-[400px]">
          {selectedEvent ? (
            <div className="space-y-5">
              {/* Title and timestamp */}
              <div className="flex items-center justify-between pb-3 border-b border-[#1e293b]/60 flex-wrap gap-2">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-7 h-7 rounded-md bg-indigo-500/10 text-indigo-400">
                    <Info size={15} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white leading-tight">Event Details</h3>
                    <p className="text-[10px] text-slate-400 mt-0.5 leading-none">
                      {new Date(selectedEvent.timestamp).toLocaleString()}
                    </p>
                  </div>
                </div>

                {selectedEvent.severity && (
                  <Badge variant={selectedEvent.severity.toLowerCase() === 'high' ? 'danger' : selectedEvent.severity.toLowerCase() === 'medium' ? 'warning' : 'info'}>
                    {selectedEvent.severity}
                  </Badge>
                )}
              </div>

              {/* Details fields */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-3 bg-[#0d0e13]/40 border border-[#1e293b]/50 rounded-lg">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Actor</span>
                  <span className="text-xs text-white font-bold">{selectedEvent.actor || 'System'}</span>
                </div>

                <div className="p-3 bg-[#0d0e13]/40 border border-[#1e293b]/50 rounded-lg">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Status</span>
                  <span className="text-xs text-white font-bold uppercase tracking-wider font-mono">
                    {selectedEvent.status || 'Success'}
                  </span>
                </div>

                {selectedEvent.type && (
                  <div className="p-3 bg-[#0d0e13]/40 border border-[#1e293b]/50 rounded-lg">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Event Type</span>
                    <span className="text-xs text-white font-bold font-mono">{selectedEvent.type.replace(/_/g, ' ')}</span>
                  </div>
                )}

                {selectedEvent.gate && (
                  <div className="p-3 bg-[#0d0e13]/40 border border-[#1e293b]/50 rounded-lg">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Gate</span>
                    <span className="text-xs text-white font-bold font-mono">{selectedEvent.gate}</span>
                  </div>
                )}
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Description</span>
                <div className="p-3 bg-[#0d0e13]/40 border border-[#1e293b]/50 rounded-lg text-xs leading-relaxed text-slate-300 select-text">
                  {selectedEvent.action.replace(/_/g, ' ')}
                </div>
              </div>

              {/* Comment */}
              {selectedEvent.comment && (
                <div className="space-y-1.5">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Comment</span>
                  <div className="p-3 bg-[#0d0e13]/40 border border-[#1e293b]/50 rounded-lg text-xs leading-relaxed text-slate-400 italic">
                    &quot;{selectedEvent.comment}&quot;
                  </div>
                </div>
              )}

              {/* State transition */}
              {(selectedEvent.stateFrom || selectedEvent.stateTo) && (
                <div className="space-y-1.5">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">State Transition</span>
                  <div className="flex items-center gap-2 p-2.5 bg-[#050508] border border-[#1e293b]/50 rounded-lg font-mono text-[11px] text-indigo-400">
                    {selectedEvent.stateFrom && <span className="bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800 text-slate-300">{selectedEvent.stateFrom}</span>}
                    {selectedEvent.stateFrom && selectedEvent.stateTo && <span className="text-slate-600">→</span>}
                    {selectedEvent.stateTo && <span className="bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800 text-slate-300">{selectedEvent.stateTo}</span>}
                  </div>
                </div>
              )}

              {/* Handoff info */}
              {selectedEvent.type === 'a2a_handoff' && (selectedEvent.fromAgent || selectedEvent.toAgent) && (
                <div className="p-3 rounded-lg border border-indigo-500/10 bg-indigo-500/5 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs text-indigo-300 font-semibold">
                    <span>{selectedEvent.fromAgent} → {selectedEvent.toAgent}</span>
                  </div>
                  {selectedEvent.attempt != null && (
                    <span className="font-mono text-[10px] text-slate-400">
                      Attempt {selectedEvent.attempt}
                    </span>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center flex-1 text-center py-12">
              <Info size={36} className="text-slate-600 mb-2" />
              <h3 className="text-sm font-bold text-slate-400">No Event Selected</h3>
              <p className="text-[11.5px] text-slate-500 max-w-xs leading-relaxed mt-1">
                Click a request run from the list to view its details.
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
