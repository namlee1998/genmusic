import { useCallback, useMemo, useState } from 'react';
import {
  ShieldAlert, HelpCircle,
  CheckCircle, AlertTriangle, XCircle,
  ExternalLink, RefreshCw, Check, X,
  Eye, User, Palette, Code, ShieldCheck
} from 'lucide-react';
import {
  resolveGate, resolveOutputReviewGate, releaseDecision,
  type GlobalInterventionItem, type PhaseStatus,
} from '@/services/api/sdlcApi';

/* ───── helper functions ───── */

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function getBlockedFor(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMins = Math.max(1, Math.floor(diffMs / 60000));
  if (isNaN(diffMins)) return '47m';
  if (diffMins > 60) return `${Math.floor(diffMins / 60)}h`;
  return `${diffMins}m`;
}

const isOutputReviewType = (type: string) => type.endsWith('_OUTPUT_REVIEW');

interface SessionHitlBlockProps {
  sessionId: string;
  sessionLabel: string;
  pipelinePhases: PhaseStatus[];
  interventions: GlobalInterventionItem[];
  isLoading: boolean;
  onChanged: () => void;
  onReview: (item: GlobalInterventionItem) => void;
  onManageAgents: () => void;
}

export default function SessionHitlBlock({
  sessionLabel, pipelinePhases, interventions, isLoading,
  onChanged, onReview, onManageAgents,
}: SessionHitlBlockProps) {
  const [acting, setActing] = useState<Record<string, boolean>>({});
  const [results, setResults] = useState<Record<string, { ok: boolean; msg: string }>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const handleAction = useCallback(async (item: GlobalInterventionItem, action: 'approve' | 'reject') => {
    const id = item.id;
    const comment = (comments[id] || '').trim();

    if (action === 'reject' && isOutputReviewType(item.type) && !comment) {
      setResults(prev => ({ ...prev, [id]: { ok: false, msg: 'A reason is required to reject this output.' } }));
      return;
    }

    setActing(prev => ({ ...prev, [id]: true }));
    setResults(prev => { const r = { ...prev }; delete r[id]; return r; });
    try {
      if (item.type === 'FINAL_RELEASE') {
        const res = await releaseDecision(item.projectId, action);
        setResults(prev => ({ ...prev, [id]: { ok: res.success, msg: action === 'approve' ? 'Release approved' : 'Release rejected' } }));
      } else if (isOutputReviewType(item.type)) {
        await resolveOutputReviewGate(id, action, comment || undefined);
        setResults(prev => ({ ...prev, [id]: { ok: true, msg: action === 'approve' ? 'Output approved — next agent starting' : 'Output rejected — agent re-running with your feedback' } }));
      } else {
        const res = await resolveGate(id, action, comment || undefined);
        setResults(prev => ({ ...prev, [id]: { ok: res.success, msg: action === 'approve' ? 'Gate approved — pipeline continues' : 'Gate rejected — pipeline halted' } }));
      }
      onChanged();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Action failed';
      setResults(prev => ({ ...prev, [id]: { ok: false, msg: message } }));
    } finally {
      setActing(prev => ({ ...prev, [id]: false }));
    }
  }, [comments, onChanged]);

  // Card 1 Bottleneck computation
  const bottleneckItem = useMemo(() => interventions[0] || null, [interventions]);

  const bottleneckDetails = useMemo(() => {
    if (!bottleneckItem) return null;
    const phase = bottleneckItem.currentPhase;
    const agentName = phase === 'QA' ? 'QA Agent' : phase === 'DEV' ? 'DEV Agent' : phase === 'PO' ? 'PO Agent' : phase === 'UX' ? 'UX Agent' : 'Agent';

    let description = 'Waiting for human intervention review';
    if (bottleneckItem.type === 'PO_CLARIFY') {
      description = 'Waiting for test case clarification from Product Owner';
    } else if (bottleneckItem.type === 'DEV_FILE_GATE') {
      description = 'Waiting for file change approval / security review';
    } else if (bottleneckItem.type === 'FINAL_RELEASE') {
      description = 'Waiting for final release decision approval';
    } else if (isOutputReviewType(bottleneckItem.type)) {
      description = `Waiting for human approve/reject of the ${agentName} output`;
    }

    const blockedFor = getBlockedFor(bottleneckItem.createdAt);

    return { agentName, description, blockedFor, impact: 'Pipeline Stopped', id: bottleneckItem.id };
  }, [bottleneckItem]);

  const handleViewBottleneckDetails = (id: string) => {
    setExpanded(prev => ({ ...prev, [id]: true }));
    setTimeout(() => {
      const el = document.getElementById(`action-item-${id}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 100);
  };

  // Card 5 Agent Status computation
  const agentStatusList = useMemo(() => {
    const agents = [
      { key: 'PO', name: 'PO Agent', icon: <User size={16} /> },
      { key: 'UX', name: 'UX Agent', icon: <Palette size={16} /> },
      { key: 'DEV', name: 'DEV Agent', icon: <Code size={16} /> },
      { key: 'QA', name: 'QA Agent', icon: <ShieldCheck size={16} /> }
    ];

    return agents.map(agent => {
      let status = 'Idle';
      const isBlocked = interventions.some(item => item.currentPhase === agent.key);

      if (isBlocked) {
        status = 'Blocked';
      } else {
        const phase = pipelinePhases?.find(p => p.agent === agent.key);
        if (phase) {
          if (phase.status === 'running') status = 'Running';
          else if (phase.status === 'gate_pending') status = 'Blocked';
          else if (phase.status === 'failed') status = 'Failed';
        }
      }

      return { ...agent, status };
    });
  }, [interventions, pipelinePhases]);

  return (
    <div className="rounded-2xl border border-outline-variant/15 bg-surface-container/20 p-4">
      <div className="flex items-center justify-between mb-3 px-1">
        <h2 className="text-xs font-bold text-on-surface truncate">{sessionLabel}</h2>
        {interventions.length > 0 && (
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-500 border border-amber-500/25 shrink-0">
            {interventions.length} pending
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">

        {/* ── Card 1: CURRENT BOTTLENECK ── */}
        <div className="flex flex-col rounded-xl border border-outline-variant/20 bg-surface-container/40 p-5 shadow-sm transition-all duration-300 hover:border-primary/20 hover:shadow-[0_0_15px_rgba(99,102,241,0.05)]">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-5 h-5 rounded-full bg-[#6366f1] text-white flex items-center justify-center text-[10px] font-bold">1</span>
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-red-400">CURRENT BOTTLENECK</h3>
          </div>

          {bottleneckDetails ? (
            <div className="flex flex-col gap-4">
              <div className="flex items-start gap-3 p-3 bg-red-500/5 border border-red-500/10 rounded-xl">
                <span className="mt-0.5 shrink-0 text-red-500"><ShieldAlert size={20} /></span>
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-bold text-on-surface block leading-tight">{bottleneckDetails.agentName} Blocked</span>
                  <p className="text-[10px] text-on-surface-variant leading-relaxed mt-1">{bottleneckDetails.description}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-surface-container-low border border-outline-variant/10 rounded-xl p-3 flex flex-col justify-center">
                  <span className="text-[8px] font-bold uppercase tracking-wider text-on-surface-variant/70">Blocked For</span>
                  <span className="text-base font-bold text-red-400 mt-1 leading-none">{bottleneckDetails.blockedFor}</span>
                </div>
                <div className="bg-surface-container-low border border-outline-variant/10 rounded-xl p-3 flex flex-col justify-center">
                  <span className="text-[8px] font-bold uppercase tracking-wider text-on-surface-variant/70">Impact</span>
                  <span className="text-xs font-bold text-on-surface mt-1 leading-none">{bottleneckDetails.impact}</span>
                </div>
              </div>

              <button
                onClick={() => handleViewBottleneckDetails(bottleneckDetails.id)}
                className="w-full py-2 border border-outline-variant/15 hover:border-outline-variant/30 hover:bg-surface-container-low rounded-lg text-center text-[11px] font-semibold text-on-surface-variant hover:text-on-surface transition-all cursor-pointer"
              >
                View Details &gt;
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex items-start gap-3 p-3 bg-emerald-500/5 border border-emerald-500/10 rounded-xl">
                <span className="mt-0.5 shrink-0 text-emerald-500"><CheckCircle size={20} /></span>
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-bold text-on-surface block leading-tight">No Bottlenecks</span>
                  <p className="text-[10px] text-on-surface-variant leading-relaxed mt-1">This session is running smoothly or completed.</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-surface-container-low border border-outline-variant/10 rounded-xl p-3 flex flex-col justify-center">
                  <span className="text-[8px] font-bold uppercase tracking-wider text-on-surface-variant/70">Blocked For</span>
                  <span className="text-base font-bold text-emerald-400 mt-1 leading-none">0m</span>
                </div>
                <div className="bg-surface-container-low border border-outline-variant/10 rounded-xl p-3 flex flex-col justify-center">
                  <span className="text-[8px] font-bold uppercase tracking-wider text-on-surface-variant/70">Impact</span>
                  <span className="text-xs font-bold text-on-surface mt-1 leading-none">None</span>
                </div>
              </div>

              <span className="w-full py-2 border border-outline-variant/5 bg-surface-container-low/20 rounded-lg text-center text-[11px] font-semibold text-on-surface-variant/40 select-none">
                All Clear
              </span>
            </div>
          )}
        </div>

        {/* ── Card 2: ACTION REQUIRED ── */}
        <div className="flex flex-col rounded-xl border border-outline-variant/20 bg-surface-container/40 p-5 shadow-sm transition-all duration-300 hover:border-primary/20 hover:shadow-[0_0_15px_rgba(99,102,241,0.05)]">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-[#6366f1] text-white flex items-center justify-center text-[10px] font-bold">2</span>
              <h3 className="text-[10px] font-bold uppercase tracking-wider text-amber-500">ACTION REQUIRED</h3>
            </div>
            {interventions.length > 0 && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-500 border border-amber-500/25">
                {interventions.length}
              </span>
            )}
          </div>

          <div className="flex flex-col gap-3 max-h-[480px] overflow-y-auto pr-1 custom-scrollbar">
            {isLoading && interventions.length === 0 && (
              <div className="animate-pulse flex flex-col gap-3 py-2">
                <div className="w-full h-14 bg-surface-container-high rounded-xl" />
                <div className="w-full h-14 bg-surface-container-high rounded-xl" />
              </div>
            )}

            {!isLoading && interventions.length === 0 && (
              <div className="flex flex-col items-center justify-center text-center py-10 px-4 bg-surface-container-low/30 border border-dashed border-outline-variant/10 rounded-xl">
                <CheckCircle size={32} className="text-emerald-500" />
                <span className="text-[11px] font-bold text-on-surface mt-3">All clear! No actions pending.</span>
                <p className="text-[9.5px] text-on-surface-variant/80 mt-1 max-w-[200px] leading-relaxed">
                  This session is running autonomously.
                </p>
              </div>
            )}

            {interventions.map(item => {
              const isActing = acting[item.id];
              const result = results[item.id];
              const isExpanded = expanded[item.id] || false;
              const comment = comments[item.id] || '';
              const isOutputReview = isOutputReviewType(item.type);

              let typeIcon = <HelpCircle size={14} />;
              let typeColorClass = 'text-amber-500 bg-amber-500/10 border-amber-500/20';
              let badgeColorClass = 'bg-amber-500/10 text-amber-400 border border-amber-500/25';
              let badgeText = 'PO';
              let actionTitle = 'PO Clarification';
              let actionSubtitle = item.payload.questions?.[0] || 'Payment logic edge case';

              if (item.type === 'DEV_FILE_GATE') {
                typeIcon = <ShieldAlert size={14} />;
                typeColorClass = 'text-orange-500 bg-orange-500/10 border-orange-500/20';
                badgeColorClass = 'bg-orange-500/10 text-orange-400 border border-orange-500/25';
                badgeText = 'SEC';
                actionTitle = 'Security Review';
                actionSubtitle = item.payload.reason || item.payload.path || 'OAuth middleware change';
              } else if (item.type === 'FINAL_RELEASE') {
                typeIcon = <CheckCircle size={14} />;
                typeColorClass = 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20';
                badgeColorClass = 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/25';
                badgeText = 'REL';
                actionTitle = 'Release Approval';
                actionSubtitle = item.payload.reason || 'v1.4.2 to Production';
              } else if (isOutputReview) {
                typeIcon = <Eye size={14} />;
                typeColorClass = 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20';
                badgeColorClass = 'bg-indigo-500/10 text-indigo-300 border border-indigo-500/25';
                badgeText = item.currentPhase;
                actionTitle = `${item.currentPhase} Output Review`;
                actionSubtitle = item.payload.outputSummary || 'Agent finished — awaiting your approve/reject';
              }

              return (
                <div
                  key={item.id}
                  id={`action-item-${item.id}`}
                  className={`flex flex-col rounded-xl border bg-[#11131a]/60 hover:bg-[#161822] shadow-sm transition-all duration-200 ${
                    result
                      ? result.ok ? 'border-emerald-500/40' : 'border-red-500/40'
                      : isExpanded
                        ? 'border-primary/40 shadow-[0_0_12px_rgba(99,102,241,0.06)]'
                        : 'border-outline-variant/15 hover:border-outline-variant/35'
                  }`}
                >
                  <div
                    className="flex items-start gap-3 p-3.5 cursor-pointer select-none"
                    onClick={() => !result && setExpanded(prev => ({ ...prev, [item.id]: !prev[item.id] }))}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${typeColorClass}`}>
                      {typeIcon}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-[11px] font-bold text-on-surface truncate">{actionTitle}</span>
                        <span className="text-[8px] text-on-surface-variant/50 font-mono">{timeAgo(item.createdAt)}</span>
                      </div>
                      <p className="text-[9.5px] text-on-surface-variant/80 truncate leading-relaxed">{actionSubtitle}</p>
                    </div>

                    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[8px] uppercase tracking-wider font-semibold ml-2 ${badgeColorClass}`}>
                      {badgeText}
                    </span>
                  </div>

                  {isExpanded && !result && (
                    <div className="px-3.5 pb-3.5 border-t border-outline-variant/10 pt-3">
                      {item.type === 'PO_CLARIFY' && item.payload.questions && (
                        <div className="mb-3 bg-surface-container-low/60 rounded-lg p-2.5 border border-outline-variant/5">
                          <div className="text-[8px] font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">
                            Questions ({item.payload.questions.length})
                          </div>
                          <ul className="list-none p-0 m-0 flex flex-col gap-1.5">
                            {item.payload.questions.map((q, idx) => (
                              <li key={idx} className="flex gap-1.5 text-[10px] text-on-surface leading-normal">
                                <span className="text-amber-500 font-bold shrink-0">Q{idx + 1}.</span>
                                <span>{q}</span>
                              </li>
                            ))}
                          </ul>
                          <textarea
                            placeholder="Type instructions or answers here..."
                            value={comment}
                            onChange={e => setComments(prev => ({ ...prev, [item.id]: e.target.value }))}
                            rows={2}
                            className="w-full mt-2.5 bg-black/40 border border-outline-variant/15 rounded-lg px-2.5 py-1.5 text-[10px] text-on-surface placeholder:text-on-surface-variant/30 resize-none outline-none focus:border-amber-500/40 transition-colors"
                          />
                        </div>
                      )}

                      {item.type === 'DEV_FILE_GATE' && (
                        <div className="mb-3 bg-surface-container-low/60 rounded-lg p-2.5 border border-outline-variant/5">
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <AlertTriangle size={11} className="text-red-400 shrink-0" />
                            <span className="text-[9px] text-red-300 font-semibold uppercase">{item.payload.action || 'MODIFY'}</span>
                            <span className="text-[9.5px] text-on-surface-variant truncate">— {item.payload.path}</span>
                          </div>
                          {item.payload.diff && (
                            <details className="group mb-2">
                              <summary className="text-[8.5px] text-on-surface-variant/60 cursor-pointer hover:text-on-surface transition-colors select-none font-semibold">View Diff Details</summary>
                              <pre className="mt-1.5 p-2 bg-black/50 border border-outline-variant/10 rounded text-[8px] font-mono text-on-surface-variant overflow-x-auto max-h-[120px] leading-normal">{item.payload.diff}</pre>
                            </details>
                          )}
                          <textarea
                            placeholder="Approval or rejection notes..."
                            value={comment}
                            onChange={e => setComments(prev => ({ ...prev, [item.id]: e.target.value }))}
                            rows={2}
                            className="w-full mt-2 bg-black/40 border border-outline-variant/15 rounded-lg px-2.5 py-1.5 text-[10px] text-on-surface placeholder:text-on-surface-variant/30 resize-none outline-none focus:border-orange-500/40 transition-colors"
                          />
                        </div>
                      )}

                      {item.type === 'FINAL_RELEASE' && (
                        <div className="mb-3 bg-surface-container-low/60 rounded-lg p-2.5 border border-outline-variant/5">
                          <p className="text-[10px] text-on-surface-variant leading-relaxed m-0">{item.payload.reason || 'All tests passed. Awaiting final approval.'}</p>
                          <div className="flex items-center gap-1.5 mt-2 font-mono text-[9px] text-on-surface-variant/60">
                            <ExternalLink size={10} className="shrink-0" />
                            <span className="truncate">{item.repoUrl}</span>
                          </div>
                          <textarea
                            placeholder="Release comments (optional)..."
                            value={comment}
                            onChange={e => setComments(prev => ({ ...prev, [item.id]: e.target.value }))}
                            rows={2}
                            className="w-full mt-2.5 bg-black/40 border border-outline-variant/15 rounded-lg px-2.5 py-1.5 text-[10px] text-on-surface placeholder:text-on-surface-variant/30 resize-none outline-none focus:border-blue-500/40 transition-colors"
                          />
                        </div>
                      )}

                      {isOutputReview && (
                        <div className="mb-3 bg-surface-container-low/60 rounded-lg p-2.5 border border-outline-variant/5">
                          <p className="text-[10px] text-on-surface-variant leading-relaxed m-0">
                            {item.payload.outputSummary || `The ${item.currentPhase} agent finished its output. Review it on the Build Dashboard, then approve or reject here.`}
                          </p>
                          {item.payload.validationIssues && item.payload.validationIssues.length > 0 && (
                            <div className="mt-2 flex flex-col gap-1">
                              {item.payload.validationIssues.map((issue, idx) => (
                                <div key={idx} className="flex items-start gap-1.5 text-[9.5px] text-red-300">
                                  <AlertTriangle size={10} className="shrink-0 mt-0.5" />
                                  <span>{issue.message || issue.rule}</span>
                                </div>
                              ))}
                            </div>
                          )}
                          <textarea
                            placeholder="Reason for rejection (required to reject)..."
                            value={comment}
                            onChange={e => setComments(prev => ({ ...prev, [item.id]: e.target.value }))}
                            rows={2}
                            className="w-full mt-2.5 bg-black/40 border border-outline-variant/15 rounded-lg px-2.5 py-1.5 text-[10px] text-on-surface placeholder:text-on-surface-variant/30 resize-none outline-none focus:border-indigo-500/40 transition-colors"
                          />
                        </div>
                      )}

                      <div className="flex flex-col gap-2 mt-1">
                        <button
                          onClick={() => handleAction(item, 'approve')}
                          disabled={isActing}
                          className="w-full relative overflow-hidden group flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 disabled:from-surface-container-high disabled:to-surface-container-high text-white text-[10.5px] font-bold px-3 py-2.5 rounded-lg cursor-pointer transition-all duration-300 shadow-[0_0_15px_rgba(16,185,129,0.2)] hover:shadow-[0_0_20px_rgba(16,185,129,0.4)] disabled:shadow-none disabled:cursor-not-allowed disabled:text-on-surface-variant/40"
                        >
                          <div className="absolute inset-0 bg-white/20 translate-y-[-100%] group-hover:translate-y-[100%] transition-transform duration-500 ease-in-out"></div>
                          {isActing ? <RefreshCw size={12} className="animate-spin relative z-10" /> : <Check size={12} className="relative z-10" />}
                          <span className="relative z-10 tracking-wide uppercase">{item.type.includes('CLARIFY') ? 'Submit Answer' : 'Approve & Continue'}</span>
                        </button>
                        
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleAction(item, 'reject')}
                            disabled={isActing || (isOutputReview && !comment.trim())}
                            className="flex-1 flex items-center justify-center gap-1.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 hover:border-red-500/40 disabled:bg-surface-container-low disabled:border-transparent text-red-400 disabled:text-on-surface-variant/40 text-[10px] font-bold px-2 py-2 rounded-lg cursor-pointer transition-all duration-300 disabled:cursor-not-allowed uppercase tracking-wider"
                          >
                            {isActing ? <RefreshCw size={11} className="animate-spin" /> : <X size={11} />}
                            Reject
                          </button>
                          
                          <button
                            onClick={() => onReview(item)}
                            className="flex items-center justify-center gap-1.5 bg-primary/10 hover:bg-primary/20 border border-primary/30 hover:border-primary/50 text-primary text-[10px] font-bold px-4 py-2 rounded-lg cursor-pointer transition-all duration-300 shadow-[0_0_10px_rgba(99,102,241,0.1)] hover:shadow-[0_0_15px_rgba(99,102,241,0.2)] uppercase tracking-wider"
                          >
                            <Eye size={11} />
                            Review
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {result && (
                    <div className={`mx-3.5 mb-3.5 flex items-center gap-1.5 p-2 rounded-lg text-[10px] font-semibold ${
                      result.ok
                        ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                        : 'bg-error/10 border border-error/20 text-error'
                    }`}>
                      {result.ok ? <CheckCircle size={12} /> : <XCircle size={12} />}
                      {result.msg}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {interventions.length > 0 && (
            <span className="w-full mt-4 py-2 border border-outline-variant/15 bg-surface-container-low/20 rounded-lg text-center text-[11px] font-semibold text-on-surface-variant/60 select-none">
              View All ({interventions.length}) &gt;
            </span>
          )}
        </div>

        {/* ── Card 5: AGENT STATUS ── */}
        <div className="flex flex-col rounded-xl border border-outline-variant/20 bg-surface-container/40 p-5 shadow-sm transition-all duration-300 hover:border-primary/20 hover:shadow-[0_0_15px_rgba(99,102,241,0.05)]">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-5 h-5 rounded-full bg-[#6366f1] text-white flex items-center justify-center text-[10px] font-bold">5</span>
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">AGENT STATUS</h3>
          </div>

          <div className="flex flex-col gap-3">
            {agentStatusList.map(agent => {
              const isRunning = agent.status === 'Running';
              const isBlocked = agent.status === 'Blocked' || agent.status === 'Failed';
              const dotBgColor = isBlocked ? 'bg-red-500' : 'bg-emerald-500';

              return (
                <div key={agent.key} className="flex items-center justify-between p-3 rounded-xl bg-[#11131a]/60 border border-outline-variant/10">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-surface-container-high/40 flex items-center justify-center text-on-surface-variant/80">
                      {agent.icon}
                    </div>
                    <span className="text-[11px] font-bold text-on-surface">{agent.name}</span>
                  </div>

                  <div className="flex items-center gap-1.5 text-[10px] font-semibold text-on-surface-variant/90">
                    <span className={`w-1.5 h-1.5 rounded-full ${dotBgColor} ${isRunning ? 'animate-pulse' : ''}`} />
                    <span>{agent.status}</span>
                  </div>
                </div>
              );
            })}
          </div>

          <button
            onClick={onManageAgents}
            className="w-full mt-4 py-2 border border-outline-variant/15 hover:border-outline-variant/30 hover:bg-surface-container-low rounded-lg text-center text-[11px] font-semibold text-on-surface-variant hover:text-on-surface transition-all cursor-pointer"
          >
            Manage Agents &gt;
          </button>
        </div>

      </div>
    </div>
  );
}
