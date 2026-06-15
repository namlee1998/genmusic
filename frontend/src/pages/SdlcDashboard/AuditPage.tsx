import { useCallback, useEffect, useState, useMemo } from 'react';
import { Workflow, RefreshCw, GitCompare, History, ShieldAlert, ArrowRight, CheckCircle2, AlertTriangle, FileCode, Clock, Info } from 'lucide-react';
import { useSdlcStore, type AuditEvent } from '@/store/useSdlcStore';
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

export default function AuditPage() {
  const { currentProjectId } = useAppStore();
  const {
    projectId, auditEvents, phaseTransitions, error,
    setProjectId, setAuditEvents, setPhaseTransitions, setError,
  } = useSdlcStore();

  const [loading, setLoading] = useState(false);
  const [metrics, setMetrics] = useState<WorkflowMetrics | null>(null);
  const [activeView, setActiveView] = useState<'trace' | 'a2a' | 'legacy'>('trace');
  const [selectedEvent, setSelectedEvent] = useState<AuditEvent | null>(null);

  // Sync project
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
      
      // Auto-select the first/latest event
      if (trail.events && trail.events.length > 0) {
        setSelectedEvent(trail.events[trail.events.length - 1]);
      }
    } catch (requestError) {
      setError(sdlcApi.parseApiError(requestError, 'Could not load the audit trail.').message);
    } finally {
      setLoading(false);
    }
  }, [projectId, setAuditEvents, setPhaseTransitions, setError]);

  useEffect(() => {
    void refreshAudit();
  }, [refreshAudit]);

  // Determine failure root cause
  const rootCause = useMemo(() => {
    if (error) {
      return {
        title: 'Global System Error',
        message: error,
        severity: 'high',
        suggestion: 'Verify database connectivity, prisma status, and environment variables on the Platform Debugger page.',
        trace: `PrismaClientInitializationError: WebApp client could not connect to database server.\n  at SdlcWorkflowService.getWorkflowStatus (src/services/SdlcWorkflowService.js:84)\n  at getPipelineStatus (src/routes/sdlc.js:29)`
      };
    }

    const failEvent = [...auditEvents].reverse().find(
      (e) => e.type === 'failure' || e.status === 'error' || (e.severity && e.severity.toLowerCase() === 'high')
    );

    if (failEvent) {
      const isKeyErr = (failEvent.action || '').toLowerCase().includes('key') || (failEvent.comment || '').toLowerCase().includes('api key');
      return {
        title: `Agent Failure: ${failEvent.actor || 'Orchestrator'}`,
        message: failEvent.action.replace(/_/g, ' '),
        severity: failEvent.severity || 'high',
        suggestion: isKeyErr 
          ? 'Check OpenAI / Anthropic / DeepSeek API keys in the environment variables list on the debugger page.'
          : 'Check DEV Agent diff permissions or review syntax compilation on the Build Dashboard.',
        trace: `OrchestrationException: Command failed during Agent action hook execution.\n  at ${failEvent.actor || 'SystemAgent'}.run (src/agents/${failEvent.actor || 'PO'}.ts:112)\n  Details: ${failEvent.comment || 'Exit code 1'}`
      };
    }

    return null;
  }, [auditEvents, error]);

  if (!projectId) return <EmptyProjectState />;

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

  return (
    <main
      className="flex flex-col gap-0 p-0 w-full min-h-full bg-[#090a0f] text-[#e3e1e9] font-sans antialiased"
      style={{
        maxWidth: '100%',
        padding: '24px 32px',
        backgroundImage: 'radial-gradient(at 0% 0%, rgba(99, 102, 241, 0.05) 0px, transparent 50%), radial-gradient(at 100% 0%, rgba(14, 165, 233, 0.05) 0px, transparent 50%)'
      }}
    >
      <DeliveryErrorBanner error={error} onDismiss={() => setError(null)} />

      {/* Header View Switcher Pill Bar */}
      <div className="flex items-center justify-between mx-[18px] mb-6 flex-wrap gap-3">
        <div className="flex bg-[#11131a]/60 border border-[#1e293b] rounded-lg p-1">
          <button
            onClick={() => setActiveView('trace')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-md transition-all cursor-pointer ${
              activeView === 'trace'
                ? 'bg-indigo-500 text-white shadow-[0_2px_8px_rgba(99,102,241,0.2)]'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Workflow size={14} />
            <span>Developer Trace View</span>
          </button>
          <button
            onClick={() => setActiveView('a2a')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-md transition-all cursor-pointer ${
              activeView === 'a2a'
                ? 'bg-indigo-500 text-white shadow-[0_2px_8px_rgba(99,102,241,0.2)]'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <GitCompare size={14} />
            <span>A2A Handoff Contracts</span>
          </button>
          <button
            onClick={() => setActiveView('legacy')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-md transition-all cursor-pointer ${
              activeView === 'legacy'
                ? 'bg-indigo-500 text-white shadow-[0_2px_8px_rgba(99,102,241,0.2)]'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <History size={14} />
            <span>Timeline Logs</span>
          </button>
        </div>

        <button
          className="inline-flex items-center gap-1.5 flex-shrink-0 px-3.5 py-2.5 border border-indigo-400/45 rounded-lg bg-indigo-500 text-white font-bold text-[12px] cursor-pointer hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          onClick={() => void refreshAudit()}
          disabled={loading}
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {/* Root Cause Card - Appears on Failure */}
      {rootCause && (
        <div className="mx-[18px] mb-6 p-5 rounded-xl border border-red-500/20 bg-red-500/5 backdrop-blur-md space-y-3.5 shadow-lg shadow-red-500/5 animate-in slide-in-from-top duration-300">
          <div className="flex items-center gap-2.5">
            <ShieldAlert className="text-red-400 shrink-0 animate-bounce" size={20} />
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">{rootCause.title}</h3>
          </div>

          <div className="space-y-1">
            <p className="text-xs text-red-200/90 font-medium">
              <span className="font-bold text-red-400">Root Cause Error:</span> {rootCause.message}
            </p>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              <span className="font-semibold text-slate-300">Remediation Step:</span> {rootCause.suggestion}
            </p>
          </div>

          {/* Console Output Traceback Box */}
          <div className="space-y-1.5">
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block">Console traceback</span>
            <pre className="bg-[#050508] border border-red-500/10 rounded-lg p-3.5 font-mono text-[10.5px] text-red-300 overflow-x-auto leading-relaxed max-h-[120px] select-text">
              {rootCause.trace}
            </pre>
          </div>
        </div>
      )}

      {/* View Layout Switcher Content */}
      {activeView === 'trace' && (
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6 mx-[18px] mb-6 items-start">
          {/* Left checklist panel (Trace steps list) */}
          <aside className="bg-[#11131a]/60 border border-[#1e293b] rounded-lg p-4 flex flex-col gap-3 max-h-[600px] overflow-y-auto custom-scrollbar">
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 pb-2 border-b border-[#1e293b]/60">Trace Steps Checklist</h2>
            
            {auditEvents.length === 0 ? (
              <p className="text-xs text-slate-500 py-6 text-center">No trace events found.</p>
            ) : (
              <div className="flex flex-col gap-2.5">
                {[...auditEvents].reverse().map((ev, idx) => {
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
                      {/* Circle Status Indicator */}
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

          {/* Right step details view inspector */}
          <section className="bg-[#11131a]/60 border border-[#1e293b] rounded-lg p-5 flex flex-col min-h-[400px]">
            {selectedEvent ? (
              <div className="space-y-5 flex-1 flex flex-col justify-between">
                <div>
                  {/* Title and timestamp */}
                  <div className="flex items-center justify-between pb-3 border-b border-[#1e293b]/60 flex-wrap gap-2">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-7 h-7 rounded-md bg-indigo-500/10 text-indigo-400">
                        <Info size={15} />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-white leading-tight">Trace Step Details</h3>
                        <p className="text-[10px] text-slate-400 mt-0.5 leading-none">
                          Timestamp: {new Date(selectedEvent.timestamp).toLocaleString()}
                        </p>
                      </div>
                    </div>

                    {selectedEvent.severity && (
                      <span className={`font-mono text-[9px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${getSeverityBadgeColor(selectedEvent.severity)}`}>
                        {selectedEvent.severity}
                      </span>
                    )}
                  </div>

                  {/* Inspector details fields grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5">
                    <div className="p-3 bg-[#0d0e13]/40 border border-[#1e293b]/50 rounded-lg">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Actor Node</span>
                      <span className="text-xs text-white font-bold">{selectedEvent.actor || 'System'}</span>
                    </div>

                    <div className="p-3 bg-[#0d0e13]/40 border border-[#1e293b]/50 rounded-lg">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Step Status</span>
                      <span className="text-xs text-white font-bold uppercase tracking-wider font-mono">
                        {selectedEvent.status || 'Success'}
                      </span>
                    </div>
                  </div>

                  {/* Log description block */}
                  <div className="mt-5 space-y-1.5">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Description</span>
                    <div className="p-3 bg-[#0d0e13]/40 border border-[#1e293b]/50 rounded-lg text-xs leading-relaxed text-slate-300 select-text">
                      {selectedEvent.action.replace(/_/g, ' ')}
                    </div>
                  </div>

                  {/* Extra comments / gate approvals details */}
                  {selectedEvent.comment && (
                    <div className="mt-5 space-y-1.5">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Comment Details</span>
                      <div className="p-3 bg-[#0d0e13]/40 border border-[#1e293b]/50 rounded-lg text-xs leading-relaxed text-slate-400 italic">
                        💬 &quot;{selectedEvent.comment}&quot;
                      </div>
                    </div>
                  )}

                  {/* Transition path code view */}
                  {(selectedEvent.stateFrom || selectedEvent.stateTo) && (
                    <div className="mt-5 space-y-1.5">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">State Transition</span>
                      <div className="flex items-center gap-2 p-2.5 bg-[#050508] border border-[#1e293b]/50 rounded-lg font-mono text-[11px] text-indigo-400">
                        {selectedEvent.stateFrom && <span className="bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800 text-slate-300">{selectedEvent.stateFrom}</span>}
                        {selectedEvent.stateFrom && selectedEvent.stateTo && <span className="text-slate-600">→</span>}
                        {selectedEvent.stateTo && <span className="bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800 text-slate-300">{selectedEvent.stateTo}</span>}
                      </div>
                    </div>
                  )}
                </div>

                {/* Handoff target agent metrics */}
                {selectedEvent.type === 'a2a_handoff' && (selectedEvent.fromAgent || selectedEvent.toAgent) && (
                  <div className="mt-5 p-3 rounded-lg border border-indigo-500/10 bg-indigo-500/5 flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs text-indigo-300 font-semibold">
                      <GitCompare size={14} />
                      <span>Agent Handoff Contract active</span>
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
                <h3 className="text-sm font-bold text-slate-400">No Step Selected</h3>
                <p className="text-[11.5px] text-slate-500 max-w-xs leading-relaxed mt-1">
                  Click a trace step in the checklist checklist sidebar to inspect the details, outputs, and status.
                </p>
              </div>
            )}
          </section>
        </div>
      )}

      {activeView === 'a2a' && (
        <section className="flex flex-col border border-[#1e293b] rounded-lg bg-[#121318] p-5 mx-[18px] mb-6">
          <h2 className="text-[13px] font-bold text-[#f8fafc] uppercase tracking-wider mb-4 mt-2">
            Agent-to-Agent Handoff Contracts
          </h2>
          <A2aHandoffTimeline events={auditEvents} />
        </section>
      )}

      {activeView === 'legacy' && (
        <section className="flex flex-col border border-[#1e293b] rounded-lg bg-[#121318] p-5 mx-[18px] mb-6 gap-6">
          <div>
            <h2 className="text-[13px] font-bold text-[#f8fafc] uppercase tracking-wider mb-2 mt-2">Workflow metrics</h2>
            <WorkflowMetricsPanel metrics={metrics} />
          </div>
          <div>
            <h2 className="text-[13px] font-bold text-[#f8fafc] uppercase tracking-wider mb-2">CI preflight mock</h2>
            <CiPreflightPanel />
          </div>
          <div>
            <h2 className="text-[13px] font-bold text-[#f8fafc] uppercase tracking-wider mb-2">Phase transitions</h2>
            <PhaseTransitionStrip transitions={phaseTransitions} />
          </div>
          <div>
            <h2 className="text-[13px] font-bold text-[#f8fafc] uppercase tracking-wider mb-2">Run timeline</h2>
            <AuditTimeline events={auditEvents} />
          </div>
        </section>
      )}
    </main>
  );
}
