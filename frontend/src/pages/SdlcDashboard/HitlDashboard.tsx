import React, { useEffect } from 'react';
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
} from 'lucide-react';
import { useHitlStore } from '@/store/useHitlStore';
import { useAppStore } from '@/store/useAppStore';
import { useSdlcStore } from '@/store/useSdlcStore';
import { type GlobalInterventionItem } from '@/services/api/sdlcApi';

export default function HitlDashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { interventions, isLoading, error, fetchInterventions } = useHitlStore();
  const { setCurrentProject } = useAppStore();
  const { resetState } = useSdlcStore();

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

  // Mock global audit events for the sidebar timeline
  const mockAuditTrail = [
    {
      id: 1,
      actor: 'Owner (User)',
      action: 'Approved Final Release on Payment Service API',
      time: '15m ago',
      type: 'success',
    },
    {
      id: 2,
      actor: 'PO Agent',
      action: 'Requested PO Clarification on recurring subscription payment service logic',
      time: '1h ago',
      type: 'warning',
    },
    {
      id: 3,
      actor: 'DEV Agent',
      action: 'Bypassed authentication validation rule override in Auth Middleware Server',
      time: '2h ago',
      type: 'danger',
    },
    {
      id: 4,
      actor: 'QA Agent',
      action: 'Completed regression validation tests. Sandbox passed: 12/12 scenarios',
      time: '4h ago',
      type: 'info',
    },
  ];

  return (
    <main 
      className="flex flex-col gap-0 p-0 h-full min-h-0 overflow-y-auto bg-[#090a0f] text-[#e3e1e9] font-sans antialiased" 
      style={{ 
        maxWidth: '100%', 
        padding: '24px 32px',
        backgroundImage: 'radial-gradient(at 0% 0%, rgba(99, 102, 241, 0.05) 0px, transparent 50%), radial-gradient(at 100% 0%, rgba(14, 165, 233, 0.05) 0px, transparent 50%)'
      }}
    >
      {/* Header section */}
      <header className="flex items-center justify-between gap-[18px] p-[18px_20px] border border-[#1e293b] rounded-[10px] bg-gradient-to-br from-[#6366f1]/13 to-[#0d0e13]/96 mx-[18px] mt-4 mb-0 flex-wrap sm:flex-nowrap">
        <div>
          <p className="flex items-center gap-1.5 m-0 text-[#a5b4fc] font-mono text-[10px] font-bold tracking-[0.12em] uppercase">
            <Gavel size={14} className="text-amber-500" /> {t('dashboard.workspace', 'AIDLC delivery workspace')}
          </p>
          <h1 className="mt-[5px] mb-1 text-white text-[22px] font-bold">{t('hitl.title', 'Intervention Center')}</h1>
          <p className="m-0 text-[#a8a7b5] text-[13px] leading-relaxed">
            Centralized overview of pending security gates, product manager inputs, and release approvals across active repositories.
          </p>
        </div>
        <div>
          <button
            className="inline-flex items-center gap-1.5 flex-shrink-0 px-3.5 py-2.5 border border-indigo-400/45 rounded-lg bg-indigo-500 text-white font-bold text-[12px] cursor-pointer hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={() => void fetchInterventions()}
            disabled={isLoading}
          >
            <RefreshCw size={14} className={isLoading ? 'spin' : ''} />
            <span>{t('common.refresh', 'Refresh')}</span>
          </button>
        </div>
      </header>

      {/* Stats Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-5 mb-6">
        <div className="flex items-center gap-4 p-[18px_20px] rounded-xl border border-white/4 bg-gradient-to-br from-[#1e293b]/45 to-[#0f172a]/80 backdrop-blur-lg shadow-[0_4px_30px_rgba(0,0,0,0.2)] transition-all duration-250 hover:-translate-y-0.5 hover:border-indigo-500/20">
          <div className="flex items-center justify-center w-11 h-11 rounded-lg flex-shrink-0 bg-indigo-500/12 text-indigo-400">
            <Activity size={18} />
          </div>
          <div>
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 m-0 mb-1">{t('hitl.totalPending', 'Total Pending')}</h3>
            <p className="text-2xl font-black m-0 leading-none text-white">{totalCount}</p>
          </div>
        </div>

        <div className="flex items-center gap-4 p-[18px_20px] rounded-xl border border-white/4 bg-gradient-to-br from-[#1e293b]/45 to-[#0f172a]/80 backdrop-blur-lg shadow-[0_4px_30px_rgba(0,0,0,0.2)] transition-all duration-250 hover:-translate-y-0.5 hover:border-indigo-500/20">
          <div className="flex items-center justify-center w-11 h-11 rounded-lg flex-shrink-0 bg-red-500/12 text-red-400">
            <ShieldAlert size={18} />
          </div>
          <div>
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 m-0 mb-1">{t('hitl.securityRisks', 'Security Risks')}</h3>
            <p className="text-2xl font-black m-0 leading-none text-red-500">{securityCount}</p>
          </div>
        </div>

        <div className="flex items-center gap-4 p-[18px_20px] rounded-xl border border-white/4 bg-gradient-to-br from-[#1e293b]/45 to-[#0f172a]/80 backdrop-blur-lg shadow-[0_4px_30px_rgba(0,0,0,0.2)] transition-all duration-250 hover:-translate-y-0.5 hover:border-indigo-500/20">
          <div className="flex items-center justify-center w-11 h-11 rounded-lg flex-shrink-0 bg-amber-500/12 text-amber-400">
            <HelpCircle size={18} />
          </div>
          <div>
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 m-0 mb-1">{t('hitl.poQuestions', 'PO Questions')}</h3>
            <p className="text-2xl font-black m-0 leading-none text-amber-500">{poCount}</p>
          </div>
        </div>

        <div className="flex items-center gap-4 p-[18px_20px] rounded-xl border border-white/4 bg-gradient-to-br from-[#1e293b]/45 to-[#0f172a]/80 backdrop-blur-lg shadow-[0_4px_30px_rgba(0,0,0,0.2)] transition-all duration-250 hover:-translate-y-0.5 hover:border-indigo-500/20">
          <div className="flex items-center justify-center w-11 h-11 rounded-lg flex-shrink-0 bg-emerald-500/12 text-emerald-400">
            <Clock size={18} />
          </div>
          <div>
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 m-0 mb-1">{t('hitl.avgResolution', 'Avg Resolution')}</h3>
            <p className="text-2xl font-black m-0 leading-none text-white">~12 min</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">
        {/* Main grid of pending gates */}
        <section className="flex flex-col gap-4 min-h-[400px]">
          {error && (
            <div className="flex items-center gap-3 p-[12px_16px] bg-red-500/8 border border-red-500/25 rounded-lg text-red-300 text-[12.5px]">
              <ShieldAlert size={16} />
              <span>{t('hitl.errorFetch', 'Failed to load interventions.')} {error}</span>
              <button onClick={() => void fetchInterventions()} className="bg-red-500/16 border border-red-500/30 text-white text-[11px] font-bold px-2.5 py-1 rounded cursor-pointer ml-auto hover:bg-red-500/30 transition-colors">
                {t('hitl.retry', 'Retry')}
              </button>
            </div>
          )}

          {isLoading && totalCount === 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="hitl-card--skeleton flex flex-col p-5 rounded-xl border border-[#1e293b] bg-[#0d0e13] min-h-[280px] shadow-[0_4px_20px_rgba(0,0,0,0.15)] pointer-events-none animate-pulse">
                  <div className="w-[90px] h-4 bg-slate-800/60 rounded mb-4"></div>
                  <div className="w-[160px] h-5 bg-slate-800/60 rounded mb-2"></div>
                  <div className="w-[200px] h-3 bg-slate-800/60 rounded mb-6"></div>
                  <div className="w-full h-[70px] bg-slate-800/60 rounded mb-5"></div>
                  <div className="w-full h-8 bg-slate-800/60 rounded"></div>
                </div>
              ))}
            </div>
          ) : totalCount === 0 ? (
            <div className="flex flex-col items-center justify-center text-center p-8 bg-[#0d0e13] border border-dashed border-[#1e293b] rounded-xl min-h-[350px]">
              <CheckCircle size={48} className="text-green-500 animate-bounce" />
              <h2 className="text-base font-bold text-white m-0 mt-4 mb-2">{t('hitl.emptyState', 'All clear! No pending interventions.')}</h2>
              <p className="text-slate-400 text-sm max-w-sm m-0 leading-relaxed">
                Your AI Agents are executing pipelines seamlessly. New approvals will pop up here when security overrides or PO clarifications are needed.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {interventions.map((item) => {
                const cardHoverClass: Record<string, string> = {
                  PO_CLARIFY: 'hover:border-amber-500/35 hover:shadow-[0_8px_30px_rgba(245,158,11,0.08)]',
                  DEV_FILE_GATE: 'hover:border-red-500/35 hover:shadow-[0_8px_30px_rgba(239,68,68,0.08)]',
                  FINAL_RELEASE: 'hover:border-blue-500/35 hover:shadow-[0_8px_30px_rgba(59,130,246,0.08)]',
                  HITL_REVIEW: 'hover:border-purple-500/35 hover:shadow-[0_8px_30px_rgba(168,85,247,0.08)]'
                };

                const badgeClasses: Record<string, string> = {
                  PO_CLARIFY: 'bg-amber-500/10 border-amber-500/25 text-amber-300',
                  DEV_FILE_GATE: 'bg-red-500/10 border-red-500/25 text-red-300',
                  FINAL_RELEASE: 'bg-blue-500/10 border-blue-500/25 text-blue-300',
                  HITL_REVIEW: 'bg-purple-500/10 border-purple-500/25 text-purple-300'
                };

                const hoverClass = cardHoverClass[item.type] || '';
                const badgeClass = badgeClasses[item.type] || '';

                return (
                  <div key={item.id} className={`flex flex-col p-5 rounded-xl border border-[#1e293b] bg-[#0d0e13] transition-all duration-200 min-h-[280px] shadow-[0_4px_20px_rgba(0,0,0,0.15)] ${hoverClass}`}>
                    <div className="flex items-center justify-between mb-3">
                      <span className={`font-mono text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${badgeClass}`}>
                        {getGateTypeLabel(item.type)}
                      </span>
                      <span className="text-[10px] text-slate-500 font-medium">
                        {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    <h2 className="text-base font-bold text-white m-0 mb-1.5">{item.projectName}</h2>
                    <div className="flex items-center gap-1.5 font-mono text-[10px] text-slate-500 mb-4">
                      <ExternalLink size={12} className="text-on-surface-variant/50" />
                      <span className="overflow-hidden text-overflow-ellipsis white-space-nowrap">{item.repoUrl}</span>
                    </div>

                    <div className="flex-1 flex flex-col mb-5">
                      {item.type === 'PO_CLARIFY' && item.payload.questions && (
                        <div className="bg-[#050505] border border-[#1e293b] rounded-lg p-3 flex-1 flex flex-col">
                          <p className="text-[11px] text-slate-400 m-0 mb-2">
                            {t('hitl.phaseLabel', 'Phase:')} <span className="font-semibold text-amber-500">PO Requirements Grooming</span>
                          </p>
                          <ul className="list-none p-0 m-0 flex flex-col gap-1.5 text-[11.5px] text-slate-300">
                            {item.payload.questions.slice(0, 2).map((q, idx) => (
                              <li key={idx} className="truncate">
                                • {q}
                              </li>
                            ))}
                            {item.payload.questions.length > 2 && (
                              <li className="text-[10px] text-on-surface-variant/60 font-semibold italic pl-3">
                                + {item.payload.questions.length - 2} more clarification questions
                              </li>
                            )}
                          </ul>
                        </div>
                      )}

                      {item.type === 'DEV_FILE_GATE' && (
                        <div className="bg-[#050505] border border-[#1e293b] rounded-lg p-3 flex-1 flex flex-col">
                          <p className="text-[11px] text-slate-400 m-0 mb-2">
                            {t('hitl.phaseLabel', 'Phase:')} <span className="font-semibold text-red-500">Development Bypass Gate</span>
                          </p>
                          <div className="flex items-center gap-1.5 bg-red-500/5 border border-red-500/15 rounded px-2 py-1 mb-2">
                            <FileCode size={13} className="text-red-500" />
                            <span className="font-mono text-xs text-red-400 truncate">{item.payload.path}</span>
                          </div>
                          <p className="text-[11.5px] text-slate-400 leading-normal m-0 truncate mt-1.5">
                            {item.payload.reason}
                          </p>
                        </div>
                      )}

                      {item.type === 'FINAL_RELEASE' && (
                        <div className="bg-[#050505] border border-[#1e293b] rounded-lg p-3 flex-1 flex flex-col">
                          <p className="text-[11px] text-slate-400 m-0 mb-2">
                            {t('hitl.phaseLabel', 'Phase:')} <span className="font-semibold text-blue-500">Final Release Acceptance Gate</span>
                          </p>
                          <p className="text-[11.5px] text-slate-400 leading-normal m-0 line-clamp-2 mt-1">
                            {item.payload.reason}
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="mt-auto">
                      <button
                        onClick={() => handleResolve(item)}
                        className="bg-indigo-500/10 border border-indigo-500/25 text-indigo-200 text-[12px] font-bold px-3.5 py-2 rounded-lg cursor-pointer transition-all duration-200 hover:bg-indigo-500 hover:border-indigo-500 hover:text-white flex items-center justify-between w-full"
                      >
                        <span>{t('hitl.navigateResolve', 'Navigate to Resolve')}</span>
                        <ArrowRight size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Global timeline of manual override events */}
        <aside className="bg-[#0d0e13] border border-[#1e293b] rounded-xl p-5">
          <h2 className="text-[12px] font-bold uppercase tracking-wider text-slate-300 m-0 mb-4 pb-2.5 border-b border-[#1e293b]">{t('hitl.timelineTitle', 'Audit Logs & Override Events')}</h2>
          <div className="flex flex-col gap-4">
            {mockAuditTrail.map((event, idx) => {
              const dotColorClass = {
                success: 'bg-emerald-500 shadow-[0_0_6px_#10b981]',
                warning: 'bg-amber-500 shadow-[0_0_6px_#fbbf24]',
                danger: 'bg-red-500 shadow-[0_0_6px_#ef4444]',
                info: 'bg-blue-500 shadow-[0_0_6px_#3b82f6]'
              }[event.type] || 'bg-slate-600';

              return (
                <div key={event.id} className="flex gap-3 relative">
                  {/* Line connector */}
                  {idx < mockAuditTrail.length - 1 && (
                    <div className="absolute left-[5px] top-[18px] bottom-[-14px] w-[1px] bg-[#1e293b]" />
                  )}
                  <div className={`w-3 h-3 rounded-full mt-1 flex-shrink-0 z-10 ${dotColorClass}`}></div>
                  <div className="flex-1 text-[11.5px]">
                    <div className="flex justify-between gap-2 mb-0.5">
                      <span className="font-bold text-white">{event.actor}</span>
                      <span className="text-slate-500 text-[10px]">{event.time}</span>
                    </div>
                    <p className="text-slate-400 m-0 leading-normal">{event.action}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </aside>
      </div>
    </main>
  );
}
