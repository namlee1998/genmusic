import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Gavel,
  ShieldAlert,
  HelpCircle,
  Clock,
  Activity,
  ArrowRight,
  RefreshCw,
  ExternalLink,
  CheckCircle,
  FileCode,
  AlertTriangle,
} from 'lucide-react';
import { useHitlStore } from '@/store/useHitlStore';
import { useAppStore } from '@/store/useAppStore';
import { useSdlcStore } from '@/store/useSdlcStore';
import { type GlobalInterventionItem } from '@/services/api/sdlcApi';
import * as sdlcApi from '@/services/api/sdlcApi';

export default function HitlDashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { interventions, isLoading, error, fetchInterventions } = useHitlStore();
  const { setCurrentProject, currentProjectId } = useAppStore();
  const { resetState } = useSdlcStore();

  const [auditEvents, setAuditEvents] = useState<any[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  const activeProjectId = currentProjectId || (interventions.length > 0 ? interventions[0].projectId : null);

  const getEventType = (ev: any) => {
    if (ev.type === 'failure' || ev.status === 'error' || ev.severity?.toLowerCase() === 'high') return 'danger';
    if (ev.type === 'hitl_decision' || ev.status === 'warning' || ev.severity?.toLowerCase() === 'medium') return 'warning';
    if (ev.type === 'agent_run') return 'info';
    return 'success';
  };

  useEffect(() => {
    let active = true;
    if (!activeProjectId) {
      setAuditEvents([]);
      return;
    }
    setLogsLoading(true);
    sdlcApi.getAuditTrail(activeProjectId)
      .then((res) => {
        if (active) setAuditEvents(res?.events || []);
      })
      .catch((err) => {
        console.error('Failed to fetch audit events for HITL Dashboard:', err);
        if (active) setAuditEvents([]);
      })
      .finally(() => {
        if (active) setLogsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [activeProjectId, interventions]);

  useEffect(() => {
    void fetchInterventions();
    const timer = setInterval(() => {
      void fetchInterventions();
    }, 30000); // 30s auto polling
    return () => clearInterval(timer);
  }, [fetchInterventions]);

  // Derived counts
  const totalCount = interventions.length;
  const securityCount = interventions.filter((item) => item.type === 'DEV_FILE_GATE').length;
  const poCount = interventions.filter((item) => item.type === 'PO_CLARIFY').length;
  const releaseCount = interventions.filter((item) => item.type === 'FINAL_RELEASE').length;

  const handleResolve = (item: GlobalInterventionItem) => {
    // 1. Clear any stale store state from prior project
    resetState();
    // 2. Select the current project
    setCurrentProject(item.projectId);
    // 3. Navigate with the highlight query parameter
    navigate(`/sdlc?highlightGate=${item.id}`);
  };

  const getGateTypeLabel = (type: string) => {
    switch (type) {
      case 'PO_CLARIFY':
        return t('hitl.poQuestions', 'PO Clarification');
      case 'DEV_FILE_GATE':
        return t('hitl.securityRisks', 'Security Gate');
      case 'FINAL_RELEASE':
        return 'Final Release';
      default:
        return type;
    }
  };

  const renderCardStepper = (item: GlobalInterventionItem) => {
    const steps = [
      { label: 'PO', phase: 'PO' },
      { label: 'UX', phase: 'UX' },
      { label: 'DEV', phase: 'DEV' },
      { label: 'QA', phase: 'QA' },
      { label: 'Release', phase: 'RELEASE' },
    ];

    // Determine active step index
    let activeIndex = 0;
    if (item.type === 'PO_CLARIFY') activeIndex = 0;
    else if (item.type === 'DEV_FILE_GATE') activeIndex = 2;
    else if (item.type === 'FINAL_RELEASE') activeIndex = 4;
    else {
      const phaseMap: Record<string, number> = { PO: 0, UX: 1, DEV: 2, QA: 3, RELEASE: 4 };
      activeIndex = phaseMap[item.currentPhase?.toUpperCase()] ?? 0;
    }

    const getStepColor = (idx: number) => {
      if (idx < activeIndex) return 'bg-emerald-500 text-white border-emerald-400';
      if (idx === activeIndex) {
        if (item.type === 'DEV_FILE_GATE') return 'bg-red-500 text-white border-red-400 animate-pulse';
        if (item.type === 'PO_CLARIFY') return 'bg-amber-500 text-white border-amber-400 animate-pulse';
        return 'bg-blue-500 text-white border-blue-400 animate-pulse';
      }
      return 'bg-slate-800/40 text-slate-500 border-slate-700/50';
    };

    const getLineColor = (idx: number) => {
      if (idx < activeIndex) return 'bg-emerald-500';
      if (idx === activeIndex) return 'bg-slate-800';
      return 'bg-slate-900';
    };

    return (
      <div className="flex items-center gap-1.5 w-full my-4 py-2 border-t border-b border-[#1e293b]/40">
        {steps.map((step, idx) => (
          <React.Fragment key={step.label}>
            <div className="flex flex-col items-center gap-1 shrink-0">
              <div className={`w-5 h-5 rounded-full flex items-center justify-center border text-[8.5px] font-bold ${getStepColor(idx)}`}>
                {idx < activeIndex ? '✓' : idx + 1}
              </div>
              <span className="text-[8px] font-bold text-slate-500">{step.label}</span>
            </div>
            {idx < steps.length - 1 && (
              <div className="flex-1 h-[1.5px] rounded bg-slate-800 self-center mb-3">
                <div className={`h-full transition-all duration-300 ${getLineColor(idx)}`} />
              </div>
            )}
          </React.Fragment>
        ))}
      </div>
    );
  };

  // Audit logs are fetched dynamically based on selected/active project.

  return (
    <main
      className="flex flex-col gap-0 p-0 h-full min-h-0 overflow-y-auto bg-[#090a0f] text-[#e3e1e9] font-sans antialiased"
      style={{
        maxWidth: '100%',
        padding: '24px 32px',
        backgroundImage: 'radial-gradient(at 0% 0%, rgba(99, 102, 241, 0.05) 0px, transparent 50%), radial-gradient(at 100% 0%, rgba(14, 165, 233, 0.05) 0px, transparent 50%)'
      }}
    >
      {/* Control Bar */}
      <div className="flex items-center justify-between mx-[18px] mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-2.5">
          <Gavel size={20} className="text-amber-500" />
          <h1 className="text-xl font-bold text-white tracking-tight">
            {t('hitl.title', 'Intervention Center')}
          </h1>
        </div>

        <button
          className="inline-flex items-center gap-1.5 flex-shrink-0 px-3.5 py-2.5 border border-indigo-400/45 rounded-lg bg-indigo-500 text-white font-bold text-[12px] cursor-pointer hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          onClick={() => void fetchInterventions()}
          disabled={isLoading}
        >
          <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
          <span>{t('common.refresh', 'Refresh')}</span>
        </button>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mx-[18px] mb-6">
        <div className="flex items-center gap-3 p-4 rounded-xl border border-white/5 bg-[#11131a]/60 shadow-lg hover:border-indigo-500/20 transition-all">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg flex-shrink-0 bg-indigo-500/10 text-indigo-400 shadow-sm border border-indigo-500/20">
            <Activity size={16} />
          </div>
          <div>
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 m-0 mb-0.5">{t('hitl.totalPending', 'Total Pending')}</h3>
            <p className="text-lg font-bold m-0 leading-none text-white">{totalCount}</p>
          </div>
        </div>

        <div className="flex items-center gap-3 p-4 rounded-xl border border-white/5 bg-[#11131a]/60 shadow-lg hover:border-red-500/20 transition-all">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg flex-shrink-0 bg-red-500/10 text-red-400 shadow-sm border border-red-500/20">
            <ShieldAlert size={16} />
          </div>
          <div>
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 m-0 mb-0.5">{t('hitl.securityRisks', 'Security Risks')}</h3>
            <p className="text-lg font-bold m-0 leading-none text-red-400">{securityCount}</p>
          </div>
        </div>

        <div className="flex items-center gap-3 p-4 rounded-xl border border-white/5 bg-[#11131a]/60 shadow-lg hover:border-amber-500/20 transition-all">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg flex-shrink-0 bg-amber-500/10 text-amber-400 shadow-sm border border-amber-500/20">
            <HelpCircle size={16} />
          </div>
          <div>
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 m-0 mb-0.5">{t('hitl.poQuestions', 'PO Questions')}</h3>
            <p className="text-lg font-bold m-0 leading-none text-amber-400">{poCount}</p>
          </div>
        </div>

        <div className="flex items-center gap-3 p-4 rounded-xl border border-white/5 bg-[#11131a]/60 shadow-lg hover:border-emerald-500/20 transition-all">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg flex-shrink-0 bg-emerald-500/10 text-emerald-400 shadow-sm border border-emerald-500/20">
            <CheckCircle size={16} />
          </div>
          <div>
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 m-0 mb-0.5">{t('hitl.releaseApprovals', 'Release Gates')}</h3>
            <p className="text-lg font-bold m-0 leading-none text-emerald-400">{releaseCount}</p>
          </div>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start mx-[18px] mb-6">
        <section className="flex flex-col gap-4 min-h-[400px]">
          {error && (
            <div className="flex items-center gap-3 p-3.5 bg-red-500/10 border border-red-500/20 rounded-xl text-red-300 text-[12px]">
              <ShieldAlert size={16} />
              <span>{t('hitl.errorFetch', 'Failed to load interventions.')} {error}</span>
              <button onClick={() => void fetchInterventions()} className="bg-red-500/20 border border-red-500/30 text-white text-[10px] font-bold px-2.5 py-1 rounded cursor-pointer ml-auto hover:bg-red-500/30 transition-all">
                {t('hitl.retry', 'Retry')}
              </button>
            </div>
          )}

          {isLoading && totalCount === 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="hitl-card--skeleton flex flex-col p-5 rounded-xl border border-white/5 bg-[#11131a]/60 shadow-lg pointer-events-none animate-pulse">
                  <div className="w-[80px] h-3 bg-slate-800 rounded mb-3"></div>
                  <div className="w-[140px] h-4 bg-slate-800 rounded mb-2"></div>
                  <div className="w-[180px] h-3 bg-slate-800 rounded mb-4"></div>
                  <div className="w-full h-[50px] bg-slate-800 rounded mb-4"></div>
                  <div className="w-full h-8 bg-slate-800 rounded"></div>
                </div>
              ))}
            </div>
          ) : totalCount === 0 ? (
            <div className="flex flex-col items-center justify-center text-center p-8 bg-[#11131a]/60 border border-dashed border-[#1e293b] rounded-xl min-h-[300px]">
              <CheckCircle size={48} className="text-emerald-500 animate-bounce" />
              <h2 className="text-sm font-bold text-white m-0 mt-4 mb-2">{t('hitl.emptyState', 'All clear! No pending interventions.')}</h2>
              <p className="text-slate-400 text-[11.5px] max-w-sm m-0 leading-relaxed">
                Your AI Agents are executing pipelines seamlessly. New approvals will pop up here when security overrides or PO clarifications are needed.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {interventions.map((item) => {
                const cardHoverClass: Record<string, string> = {
                  PO_CLARIFY: 'hover:border-amber-500/30 hover:shadow-[0_8px_30px_rgba(245,158,11,0.06)]',
                  DEV_FILE_GATE: 'hover:border-red-500/30 hover:shadow-[0_8px_30px_rgba(239,68,68,0.06)]',
                  FINAL_RELEASE: 'hover:border-blue-500/30 hover:shadow-[0_8px_30px_rgba(59,130,246,0.06)]',
                  HITL_REVIEW: 'hover:border-purple-500/30 hover:shadow-[0_8px_30px_rgba(168,85,247,0.06)]'
                };

                const badgeClasses: Record<string, string> = {
                  PO_CLARIFY: 'bg-amber-500/10 border-amber-500/20 text-amber-300',
                  DEV_FILE_GATE: 'bg-red-500/10 border-red-500/20 text-red-300',
                  FINAL_RELEASE: 'bg-blue-500/10 border-blue-500/20 text-blue-300',
                  HITL_REVIEW: 'bg-purple-500/10 border-purple-500/20 text-purple-300'
                };

                const hoverClass = cardHoverClass[item.type] || '';
                const badgeClass = badgeClasses[item.type] || '';

                return (
                  <div key={item.id} className={`flex flex-col justify-between p-5 rounded-xl border border-white/5 bg-[#11131a]/60 shadow-lg transition-all duration-300 ${hoverClass}`}>
                    <div>
                      {/* Badge Header Row */}
                      <div className="flex items-center justify-between mb-3.5">
                        <span className={`font-mono text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${badgeClass}`}>
                          {getGateTypeLabel(item.type)}
                        </span>
                        <span className="text-[10px] text-slate-500 font-medium font-mono">
                          {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>

                      {/* Project Name and Repo Link */}
                      <h2 className="text-xs font-bold text-white m-0 mb-1">{item.projectName}</h2>
                      <div className="flex items-center gap-1.5 font-mono text-[9px] text-slate-400 mb-4 select-text">
                        <ExternalLink size={11} className="text-slate-500" />
                        <span className="truncate">{item.repoUrl}</span>
                      </div>

                      {/* Mini Pipeline Stepper inside each card */}
                      {renderCardStepper(item)}

                      {/* Payload detail message block */}
                      <div className="flex flex-col mb-4">
                        {item.type === 'PO_CLARIFY' && item.payload.questions && (
                          <div className="bg-black/30 border border-white/5 rounded-lg p-2.5 flex-1 flex flex-col gap-1.5">
                            <span className="text-[9.5px] font-bold text-slate-400">PO Clarifications Questions</span>
                            <ul className="list-none p-0 m-0 flex flex-col gap-1 text-[10.5px] text-slate-300">
                              {item.payload.questions.slice(0, 2).map((q, idx) => (
                                <li key={idx} className="truncate">
                                  • {q}
                                </li>
                              ))}
                              {item.payload.questions.length > 2 && (
                                <li className="text-[9.5px] text-slate-500 italic pl-3">
                                  + {item.payload.questions.length - 2} more questions
                                </li>
                              )}
                            </ul>
                          </div>
                        )}

                        {item.type === 'DEV_FILE_GATE' && (
                          <div className="bg-black/30 border border-white/5 rounded-lg p-2.5 flex-1 flex flex-col gap-1.5">
                            <span className="text-[9.5px] font-bold text-slate-400">Modified Security File</span>
                            <div className="flex items-center gap-1.5 bg-red-500/5 border border-red-500/15 rounded px-2 py-0.5 text-[9.5px] text-red-400 font-mono truncate">
                              <FileCode size={11} className="text-red-500" />
                              <span>{item.payload.path}</span>
                            </div>
                            <p className="text-[10.5px] text-slate-400 leading-normal m-0 line-clamp-2">
                              {item.payload.reason}
                            </p>
                          </div>
                        )}

                        {item.type === 'FINAL_RELEASE' && (
                          <div className="bg-black/30 border border-white/5 rounded-lg p-2.5 flex-1 flex flex-col gap-1.5">
                            <span className="text-[9.5px] font-bold text-slate-400">Final Staging Release</span>
                            <p className="text-[10.5px] text-slate-400 leading-normal m-0 line-clamp-2">
                              {item.payload.reason || 'All sandbox tests passed successfully. Awaiting final override decision.'}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Action Button */}
                    <div>
                      <button
                        onClick={() => handleResolve(item)}
                        className="w-full flex items-center justify-between gap-1 bg-indigo-500/10 hover:bg-indigo-500 border border-indigo-500/20 hover:border-indigo-500 text-indigo-200 hover:text-white text-[11px] font-bold px-3 py-2 rounded-lg cursor-pointer transition-all duration-200"
                      >
                        <span>{t('hitl.navigateResolve', 'Navigate to Resolve')}</span>
                        <ArrowRight size={12} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Global timeline sidebar */}
        <aside className="bg-[#11131a]/60 border border-white/5 rounded-xl p-4 shadow-lg backdrop-blur-md">
          <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-300 m-0 mb-4 pb-2.5 border-b border-white/5">
            {t('hitl.timelineTitle', 'Audit Logs & Override Events')}
          </h2>
          <div className="flex flex-col gap-4">
            {logsLoading ? (
              <p className="text-xs text-slate-500 animate-pulse text-center py-6">Loading audit trail...</p>
            ) : auditEvents.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-6">No override events recorded.</p>
            ) : (
              [...auditEvents].reverse().slice(0, 10).map((event, idx) => {
                const eventType = getEventType(event);
                const dotColorClass = {
                  success: 'bg-emerald-500 shadow-[0_0_6px_#10b981]',
                  warning: 'bg-amber-500 shadow-[0_0_6px_#fbbf24]',
                  danger: 'bg-red-500 shadow-[0_0_6px_#ef4444]',
                  info: 'bg-blue-500 shadow-[0_0_6px_#3b82f6]'
                }[eventType] || 'bg-slate-600';

                return (
                  <div key={idx} className="flex gap-3 relative">
                    {/* Line connector */}
                    {idx < Math.min(auditEvents.length, 10) - 1 && (
                      <div className="absolute left-[5px] top-[18px] bottom-[-14px] w-[1px] bg-slate-800" />
                    )}
                    <div className={`w-3 h-3 rounded-full mt-1 flex-shrink-0 z-10 ${dotColorClass}`}></div>
                    <div className="flex-1 text-[11px]">
                      <div className="flex justify-between gap-2 mb-0.5">
                        <span className="font-bold text-white leading-none">{event.actor || 'System'}</span>
                        <span className="text-slate-500 text-[9px] font-mono">
                          {new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-slate-400 m-0 leading-normal mt-1">{event.action.replace(/_/g, ' ')}</p>
                      {event.comment && (
                        <p className="text-slate-500 text-[10px] italic m-0 mt-0.5">💬 &quot;{event.comment}&quot;</p>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </aside>
      </div>
    </main>
  );
}
