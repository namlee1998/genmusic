/**
 * AuditPage — read-only audit trail for the active session.
 *
 * Per AIFA v2.1 the audit log is part of SessionState and arrives over SSE.
 * This page has no HTTP call of its own, no manual refresh button, no polling.
 * It renders the slice `state.sessions[activeSessionId].auditLog`.
 */
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Info, ShieldAlert, History as HistoryIcon, ChevronLeft, Layers } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { useUiStore } from '@/store/useUiStore';
import { useWorkflowStore, selectAllSessions } from '@/store/useWorkflowStore';
import EmptyProjectState from './components/EmptyProjectState';
import DeliveryErrorBanner from './components/DeliveryErrorBanner';
import { Badge } from '@/components/ui/Badge';
import type { AuditEntry } from '@/services/api/sdlcApi';

function stepDotStyle(ev: AuditEntry): string {
  if (ev.status === 'error') {
    return 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)] animate-pulse';
  }
  if (ev.status === 'warning') {
    return 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]';
  }
  if (ev.status === 'pending') {
    return 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)] animate-pulse';
  }
  return 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]';
}

export default function AuditPage() {
  const navigate = useNavigate();
  const currentProjectId = useAppStore((s) => s.currentProjectId);
  const activeSessionId = useUiStore((s) => s.activeSessionId);
  const setActiveSession = useUiStore((s) => s.setActiveSession);
  const sessions = useWorkflowStore(selectAllSessions);
  const auditLog = useWorkflowStore((s) =>
    activeSessionId ? s.sessions[activeSessionId]?.auditLog ?? [] : [],
  );
  const [searchParams] = useSearchParams();
  const sessionParam = searchParams.get('sessionId');

  // Cold-start: if the page is hit with ?sessionId= but no active session
  // is set, hydrate from URL.
  useEffect(() => {
    if (sessionParam && sessionParam !== activeSessionId && sessions.find((s) => s.sessionId === sessionParam)) {
      setActiveSession(sessionParam);
    }
  }, [sessionParam, activeSessionId, sessions, setActiveSession]);

  const reversed = useMemo(() => [...auditLog].reverse(), [auditLog]);
  const [selectedEvent, setSelectedEvent] = useState<AuditEntry | null>(null);

  useEffect(() => {
    if (reversed.length > 0 && !selectedEvent) {
      setSelectedEvent(reversed[0]);
    }
  }, [reversed, selectedEvent]);

  if (!currentProjectId) return <EmptyProjectState />;

  if (sessions.length === 0) {
    return (
      <main className="flex h-full min-h-0 flex-col items-center justify-center gap-3 bg-background px-6 py-12 text-center">
        <Layers size={36} className="text-on-surface-variant/40" />
        <h2 className="text-sm font-bold text-on-surface">No sessions in this project yet</h2>
        <p className="text-[11px] text-on-surface-variant/70">Start a feature request to generate an audit trail.</p>
        <button
          onClick={() => navigate('/sdlc/build')}
          className="rounded-md bg-primary px-3 py-1.5 text-[11px] font-bold text-on-primary hover:bg-primary/90"
        >
          Go to Agent Tasks
        </button>
      </main>
    );
  }

  if (!activeSessionId) {
    return (
      <main className="flex h-full min-h-0 flex-col items-center justify-center gap-3 bg-background px-6 py-12 text-center">
        <ShieldAlert size={36} className="text-amber-500" />
        <h2 className="text-sm font-bold text-on-surface">Pick a session to inspect its audit log</h2>
        <button
          onClick={() => navigate('/sdlc/build')}
          className="rounded-md bg-primary px-3 py-1.5 text-[11px] font-bold text-on-primary hover:bg-primary/90"
        >
          Choose from session rail
        </button>
      </main>
    );
  }

  return (
    <main
      className="flex h-full min-h-0 w-full flex-col gap-0 overflow-hidden bg-background text-on-surface"
      style={{
        maxWidth: '100%',
        padding: '24px 32px',
        backgroundImage: 'radial-gradient(at 0% 0%, rgba(99, 102, 241, 0.05) 0px, transparent 50%), radial-gradient(at 100% 0%, rgba(14, 165, 233, 0.05) 0px, transparent 50%)',
      }}
    >
      <DeliveryErrorBanner error={null} onDismiss={() => {}} />

      {/* Header */}
      <header className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1 rounded-md bg-surface-container px-2 py-1 text-[10px] font-bold text-on-surface-variant hover:bg-surface-container/80"
          >
            <ChevronLeft size={11} /> Back
          </button>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
              <HistoryIcon size={16} className="text-primary" />
              Audit Trail
            </h1>
            <p className="mt-0.5 text-[10px] text-on-surface-variant/70">
              Reading from <code className="font-mono text-primary">session.auditLog</code> · no polling, no refresh.
            </p>
          </div>
        </div>
        <SessionPicker
          currentSessionId={activeSessionId}
          sessions={sessions.map((s) => ({
            id: s.sessionId,
            label: s.featureRequest || 'Untitled',
            status: s.status,
          }))}
          onSelect={setActiveSession}
        />
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6 mb-6 items-start">
        {/* Left: event list */}
        <aside className="bg-surface-container border border-outline-variant/40 rounded-lg p-4 flex flex-col gap-3 max-h-[600px] overflow-y-auto custom-scrollbar">
          <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 pb-2 border-b border-[#1e293b]/60">
            Request Runs ({reversed.length})
          </h2>

          {reversed.length === 0 ? (
            <p className="text-xs text-slate-500 py-6 text-center">
              No audit events yet — waiting for the first SSE event…
            </p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {reversed.map((ev, idx) => {
                const isSelected = selectedEvent?.timestamp === ev.timestamp && selectedEvent?.action === ev.action;
                return (
                  <div
                    key={`${ev.timestamp}_${idx}`}
                    onClick={() => setSelectedEvent(ev)}
                    className={`group flex items-start gap-3 p-2.5 rounded-lg border cursor-pointer transition-all duration-200 select-none ${
                      isSelected
                        ? 'bg-indigo-500/10 border-indigo-500/40 text-white shadow-sm'
                        : 'border-transparent hover:bg-slate-800/40 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${stepDotStyle(ev)}`} />
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

        {/* Right: detail */}
        <section className="bg-surface-container border border-outline-variant/40 rounded-lg p-5 flex flex-col min-h-[400px]">
          {selectedEvent ? (
            <EventDetail event={selectedEvent} />
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

function EventDetail({ event }: { event: AuditEntry }) {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between pb-3 border-b border-[#1e293b]/60 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-7 h-7 rounded-md bg-indigo-500/10 text-indigo-400">
            <Info size={15} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white leading-tight">Event Details</h3>
            <p className="text-[10px] text-slate-400 mt-0.5 leading-none">{new Date(event.timestamp).toLocaleString()}</p>
          </div>
        </div>
        {event.status && (
          <Badge variant={event.status === 'error' ? 'danger' : event.status === 'warning' ? 'warning' : event.status === 'pending' ? 'info' : 'success'}>
            {event.status}
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Actor" value={event.actor || 'System'} mono />
        <Field label="Status" value={event.status || 'ok'} mono />
      </div>

      <div className="space-y-1.5">
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Description</span>
        <div className="p-3 bg-[#0d0e13]/40 border border-[#1e293b]/50 rounded-lg text-xs leading-relaxed text-slate-300 select-text">
          {event.action.replace(/_/g, ' ')}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="p-3 bg-[#0d0e13]/40 border border-[#1e293b]/50 rounded-lg">
      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">{label}</span>
      <span className={`text-xs text-white font-bold ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}

function SessionPicker({
  currentSessionId,
  sessions,
  onSelect,
}: {
  currentSessionId: string;
  sessions: Array<{ id: string; label: string; status: string }>;
  onSelect: (id: string) => void;
}) {
  return (
    <select
      value={currentSessionId}
      onChange={(e) => onSelect(e.target.value)}
      className="rounded-md border border-outline-variant/40 bg-surface-container px-2 py-1 text-[11px] text-on-surface focus:border-primary/40 focus:outline-none"
    >
      {sessions.map((s) => (
        <option key={s.id} value={s.id}>
          「{s.label}」 · {s.status}
        </option>
      ))}
    </select>
  );
}

// Final blank line.
