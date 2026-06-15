import { useEffect, useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  Gavel, ShieldAlert, HelpCircle, Activity,
  CheckCircle, AlertTriangle, Bug, XCircle,
  FileCode, ExternalLink, RefreshCw, Check, X,
  Eye,
} from 'lucide-react';
import { useHitlStore } from '@/store/useHitlStore';
import { resolveGate, releaseDecision, type GlobalInterventionItem } from '@/services/api/sdlcApi';

/* ───── types & helpers ───── */

type GroupKey = 'DEV_FILE_GATE' | 'PO_CLARIFY' | 'FINAL_RELEASE';

interface ColumnMeta {
  key: GroupKey;
  label: string;
  icon: React.ReactNode;
  headerBg: string;
  headerText: string;
  headerBorder: string;
  cardBorder: string;
  cardAccent: string;
  dot: string;
  btnApprove: string;
}

const COLUMNS: ColumnMeta[] = [
  {
    key: 'DEV_FILE_GATE',
    label: 'Security Gates',
    icon: <ShieldAlert size={14} />,
    headerBg: 'bg-red-500/8',
    headerText: 'text-red-400',
    headerBorder: 'border-red-500/20',
    cardBorder: 'hover:border-red-500/25',
    cardAccent: 'border-t-red-500',
    dot: 'bg-red-500',
    btnApprove: 'Approve Risk',
  },
  {
    key: 'PO_CLARIFY',
    label: 'PO Clarifications',
    icon: <HelpCircle size={14} />,
    headerBg: 'bg-amber-500/8',
    headerText: 'text-amber-400',
    headerBorder: 'border-amber-500/20',
    cardBorder: 'hover:border-amber-500/25',
    cardAccent: 'border-t-amber-500',
    dot: 'bg-amber-500',
    btnApprove: 'Approve & Continue',
  },
  {
    key: 'FINAL_RELEASE',
    label: 'Release Approvals',
    icon: <CheckCircle size={14} />,
    headerBg: 'bg-blue-500/8',
    headerText: 'text-blue-400',
    headerBorder: 'border-blue-500/20',
    cardBorder: 'hover:border-blue-500/25',
    cardAccent: 'border-t-blue-500',
    dot: 'bg-blue-500',
    btnApprove: 'Approve Release',
  },
];

const COLUMN_ORDER: GroupKey[] = ['DEV_FILE_GATE', 'PO_CLARIFY', 'FINAL_RELEASE'];

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

/* ───── component ───── */

export default function HitlDashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const store = useHitlStore();

  const interventions = store.interventions;
  const isLoading = store.isLoading;
  const error = store.error;
  const fetchInterventions = store.fetchInterventions;

  const [acting, setActing] = useState<Record<string, boolean>>({});
  const [results, setResults] = useState<Record<string, { ok: boolean; msg: string }>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const grouped = useMemo(() => {
    const map: Record<GroupKey, GlobalInterventionItem[]> = {
      DEV_FILE_GATE: [], PO_CLARIFY: [], FINAL_RELEASE: [],
    };
    for (const item of interventions) {
      if (map[item.type as GroupKey]) map[item.type as GroupKey].push(item);
    }
    return map;
  }, [interventions]);

  const totalCount = interventions.length;
  const poCount = grouped.PO_CLARIFY.length;
  const securityCount = grouped.DEV_FILE_GATE.length;
  const releaseCount = grouped.FINAL_RELEASE.length;

  useEffect(() => {
    void fetchInterventions();
    const timer = setInterval(() => void fetchInterventions(), 30000);
    return () => clearInterval(timer);
  }, [fetchInterventions]);

  const handleAction = useCallback(async (item: GlobalInterventionItem, action: 'approve' | 'reject') => {
    const id = item.id;
    setActing(prev => ({ ...prev, [id]: true }));
    setResults(prev => { const r = { ...prev }; delete r[id]; return r; });
    try {
      if (item.type === 'FINAL_RELEASE') {
        const res = await releaseDecision(item.projectId, action);
        setResults(prev => ({ ...prev, [id]: { ok: res.success, msg: action === 'approve' ? 'Release approved' : 'Release rejected' } }));
      } else {
        const comment = comments[id] || undefined;
        const res = await resolveGate(id, action, comment);
        setResults(prev => ({ ...prev, [id]: { ok: res.success, msg: action === 'approve' ? 'Gate approved — pipeline continues' : 'Gate rejected — pipeline halted' } }));
      }
      await fetchInterventions();
    } catch (err: any) {
      setResults(prev => ({ ...prev, [id]: { ok: false, msg: err?.message || 'Action failed' } }));
    } finally {
      setActing(prev => ({ ...prev, [id]: false }));
    }
  }, [comments, fetchInterventions]);

  const handleReview = (item: GlobalInterventionItem) => {
    navigate(`/sdlc/build?highlightGate=${item.id}`);
  };

  /* ───── render ───── */

  return (
    <main
      className="flex flex-col gap-0 p-0 h-full min-h-0 overflow-y-auto bg-background text-on-surface font-sans antialiased"
      style={{ padding: '24px 32px' }}
    >
      {/* ── Header ── */}
      <div className="flex items-center justify-between mx-[18px] mb-5 flex-wrap gap-3">
        <div className="flex items-center gap-2.5">
          <Gavel size={20} className="text-amber-500" />
          <h1 className="text-xl font-bold text-on-surface tracking-tight">Intervention Center</h1>
        </div>
        <button
          className="inline-flex items-center gap-1.5 px-3.5 py-2 border border-primary/45 rounded-lg bg-primary text-white font-bold text-[12px] cursor-pointer hover:bg-primary-container disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          onClick={() => void fetchInterventions()}
          disabled={isLoading}
        >
          <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
          <span>Refresh</span>
        </button>
      </div>

      {/* ── Stats row ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mx-[18px] mb-6">
        {[
          { label: 'Total Pending', value: totalCount, icon: <Activity size={15} />, color: 'text-indigo-400', bg: 'bg-indigo-500/10' },
          { label: 'Security Gates', value: securityCount, icon: <ShieldAlert size={15} />, color: 'text-red-400', bg: 'bg-red-500/10' },
          { label: 'PO Clarifications', value: poCount, icon: <HelpCircle size={15} />, color: 'text-amber-400', bg: 'bg-amber-500/10' },
          { label: 'Release Approvals', value: releaseCount, icon: <CheckCircle size={15} />, color: 'text-blue-400', bg: 'bg-blue-500/10' },
        ].map(s => (
          <div key={s.label} className="flex items-center gap-2.5 p-3 rounded-lg border border-outline-variant/20 bg-surface-container/40 shadow-sm">
            <div className={`flex items-center justify-center w-8 h-8 rounded-lg shrink-0 ${s.bg} ${s.color}`}>{s.icon}</div>
            <div>
              <div className="text-[8px] font-bold uppercase tracking-widest text-on-surface-variant">{s.label}</div>
              <div className={`text-base font-bold leading-none mt-0.5 ${s.color}`}>{s.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="flex items-center gap-3 p-3 mx-[18px] mb-4 bg-error/10 border border-error/20 rounded-xl text-error text-[12px]">
          <Bug size={16} />
          <span className="flex-1">{error}</span>
          <button onClick={() => void fetchInterventions()} className="bg-error/20 border border-error/30 text-white text-[10px] font-bold px-2.5 py-1 rounded cursor-pointer hover:bg-error/30 transition-all">Retry</button>
        </div>
      )}

      {/* ── Loading ── */}
      {isLoading && totalCount === 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mx-[18px]">
          {[1, 2, 3].map(i => (
            <div key={i} className="animate-pulse flex flex-col gap-3 p-4 rounded-xl bg-surface-container/60 border border-outline-variant/20">
              <div className="w-24 h-3 bg-surface-container-high rounded" />
              <div className="w-full h-20 bg-surface-container-high rounded" />
              <div className="w-full h-8 bg-surface-container-high rounded" />
            </div>
          ))}
        </div>
      )}

      {/* ── Empty ── */}
      {!isLoading && totalCount === 0 && (
        <div className="flex flex-col items-center justify-center text-center p-10 mx-[18px] bg-surface-container/40 border border-dashed border-surface-container-high rounded-xl min-h-[300px]">
          <CheckCircle size={44} className="text-emerald-500" />
          <h2 className="text-sm font-bold text-on-surface m-0 mt-4 mb-2">All clear! No pending interventions.</h2>
          <p className="text-on-surface-variant text-[11.5px] max-w-sm leading-relaxed">
            Your AI Agents are executing pipelines. Interventions will appear here when human decisions are needed.
          </p>
        </div>
      )}

      {/* ── Kanban grid ── */}
      {!isLoading && totalCount > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mx-[18px] items-start">
          {COLUMN_ORDER.map(colKey => {
            const items = grouped[colKey];
            const col = COLUMNS.find(c => c.key === colKey)!;

            return (
              <div key={colKey} className={`flex flex-col rounded-xl border ${col.headerBorder} ${col.headerBg} overflow-hidden`}>
                {/* Column header */}
                <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-outline-variant/20">
                  <div className="flex items-center gap-2">
                    <span className={`${col.headerText}`}>{col.icon}</span>
                    <h3 className="text-[10px] font-bold uppercase tracking-wider text-on-surface">{col.label}</h3>
                  </div>
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${col.headerText} ${col.headerBorder}`}>{items.length}</span>
                </div>

                {/* Cards */}
                <div className="flex flex-col gap-2 p-2.5 min-h-[120px]">
                  {items.length === 0 && (
                    <div className="flex items-center justify-center h-20 text-[10px] text-on-surface-variant/60 italic">No items</div>
                  )}

                  {items.map(item => {
                    const isActing = acting[item.id];
                    const result = results[item.id];
                    const isExpanded = expanded[item.id] || false;
                    const comment = comments[item.id] || '';

                    return (
                      <div
                        key={item.id}
                        className={`flex flex-col rounded-lg border bg-surface-container/80 shadow-sm transition-all duration-200 ${col.cardBorder} ${
                          result
                            ? result.ok ? 'border-emerald-500/40' : 'border-red-500/40'
                            : 'border-outline-variant/20'
                        }`}
                      >
                        {/* Card header — always visible */}
                        <div
                          className={`flex items-start gap-2.5 px-3 pt-3 pb-2 cursor-pointer select-none ${col.cardAccent}`}
                          style={{ borderTopWidth: '2px' }}
                          onClick={() => !result && setExpanded(prev => ({ ...prev, [item.id]: !prev[item.id] }))}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <span className="text-[11px] font-bold text-on-surface truncate">{item.projectName}</span>
                              <span className="text-[8px] font-mono text-on-surface-variant/60 bg-inverse-surface/20 px-1 py-0.5 rounded shrink-0">{item.currentPhase}</span>
                            </div>

                            {/* Key info line */}
                            {colKey === 'DEV_FILE_GATE' && (
                              <div className="flex items-center gap-1 text-[9.5px] text-red-400 font-mono truncate">
                                <FileCode size={9} />
                                {item.payload.path}
                              </div>
                            )}
                            {colKey === 'PO_CLARIFY' && item.payload.questions && (
                              <div className="text-[9.5px] text-on-surface-variant line-clamp-2 leading-relaxed">
                                <span className="text-amber-500 font-bold">Q: </span>
                                {item.payload.questions[0]}
                              </div>
                            )}
                            {colKey === 'FINAL_RELEASE' && (
                              <div className="text-[9.5px] text-on-surface-variant truncate">
                                {item.payload.reason || 'Awaiting final approval'}
                              </div>
                            )}
                          </div>

                          {/* Time + expand */}
                          <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
                            <span className="text-[8px] text-on-surface-variant/60 font-mono">{timeAgo(item.createdAt)}</span>
                            {!result && (
                              <span className="text-on-surface-variant/40">{isExpanded ? '−' : '+'}</span>
                            )}
                          </div>
                        </div>

                        {/* Expanded detail — inline actions */}
                        {isExpanded && !result && (
                          <div className="px-3 pb-3 border-t border-outline-variant/20 pt-2.5 mt-0.5">
                            {/* Payload */}
                            {colKey === 'PO_CLARIFY' && item.payload.questions && (
                              <div className="mb-2.5 bg-inverse-surface/20 rounded-lg p-2.5">
                                <div className="text-[8px] font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">
                                  {item.payload.questions.length} question{item.payload.questions.length > 1 ? 's' : ''}
                                </div>
                                <ul className="list-none p-0 m-0 flex flex-col gap-1">
                                  {item.payload.questions.map((q, idx) => (
                                    <li key={idx} className="flex gap-1.5 text-[10px] text-on-surface">
                                      <span className="text-amber-500 font-bold shrink-0">Q{idx + 1}.</span>
                                      <span>{q}</span>
                                    </li>
                                  ))}
                                </ul>
                                <textarea
                                  placeholder="Instructions for AI (optional)..."
                                  value={comment}
                                  onChange={e => setComments(prev => ({ ...prev, [item.id]: e.target.value }))}
                                  rows={2}
                                  className="w-full mt-2 bg-inverse-surface/30 border border-outline-variant/10 rounded-lg px-2.5 py-1.5 text-[10px] text-on-surface placeholder:text-on-surface-variant/40 resize-none outline-none focus:border-amber-500/40 transition-colors"
                                />
                              </div>
                            )}

                            {colKey === 'DEV_FILE_GATE' && (
                              <div className="mb-2.5 bg-inverse-surface/20 rounded-lg p-2.5">
                                <div className="flex items-center gap-1.5 mb-1">
                                  <AlertTriangle size={10} className="text-red-400" />
                                  <span className="text-[9px] text-red-300 font-semibold">{item.payload.action || 'MODIFY'}</span>
                                  <span className="text-[9px] text-on-surface-variant">— {item.payload.reason}</span>
                                </div>
                                {item.payload.diff && (
                                  <details className="group">
                                    <summary className="text-[8.5px] text-on-surface-variant/60 cursor-pointer hover:text-on-surface transition-colors select-none">View diff</summary>
                                    <pre className="mt-1.5 p-2 bg-inverse-surface/30 rounded text-[8px] font-mono text-on-surface-variant overflow-x-auto max-h-[120px] leading-relaxed">{item.payload.diff}</pre>
                                  </details>
                                )}
                              </div>
                            )}

                            {colKey === 'FINAL_RELEASE' && (
                              <div className="mb-2.5 bg-inverse-surface/20 rounded-lg p-2.5">
                                <p className="text-[10px] text-on-surface-variant leading-normal m-0">{item.payload.reason || 'All tests passed. Awaiting final approval.'}</p>
                                <div className="flex items-center gap-1.5 mt-1 text-[9px] text-on-surface-variant">
                                  <ExternalLink size={9} />
                                  <span className="truncate">{item.repoUrl}</span>
                                </div>
                              </div>
                            )}

                            {/* Action buttons */}
                            <div className="flex flex-col gap-1.5">
                              <button
                                onClick={() => handleAction(item, 'approve')}
                                disabled={isActing}
                                className="w-full flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-surface-container-high text-white text-[10px] font-bold px-3 py-2 rounded-lg cursor-pointer transition-all disabled:cursor-not-allowed"
                              >
                                {isActing ? <RefreshCw size={11} className="animate-spin" /> : <Check size={11} />}
                                {col.btnApprove}
                              </button>
                              <div className="flex gap-1.5">
                                <button
                                  onClick={() => handleAction(item, 'reject')}
                                  disabled={isActing}
                                  className="flex-1 flex items-center justify-center gap-1 bg-red-600/80 hover:bg-red-500 disabled:bg-surface-container-high text-white text-[10px] font-bold px-2 py-1.5 rounded-lg cursor-pointer transition-all disabled:cursor-not-allowed"
                                >
                                  {isActing ? <RefreshCw size={10} className="animate-spin" /> : <X size={10} />}
                                  Reject
                                </button>
                                <button
                                  onClick={() => handleReview(item)}
                                  className="flex items-center justify-center gap-1 bg-primary/10 hover:bg-primary/30 border border-primary/20 text-primary/80 text-[10px] font-bold px-2 py-1.5 rounded-lg cursor-pointer transition-all"
                                >
                                  <Eye size={10} />
                                  Review
                                </button>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Collapsed action row — quick actions */}
                        {!isExpanded && !result && (
                          <div className="flex gap-1.5 px-3 pb-3 pt-0.5">
                            <button
                              onClick={() => handleAction(item, 'approve')}
                              disabled={isActing}
                              className="flex-1 flex items-center justify-center gap-1 bg-emerald-600/80 hover:bg-emerald-500 disabled:bg-surface-container-high text-white text-[9px] font-bold px-2 py-1.5 rounded-lg cursor-pointer transition-all disabled:cursor-not-allowed"
                            >
                              {isActing ? <RefreshCw size={9} className="animate-spin" /> : <Check size={9} />}
                              Approve
                            </button>
                            <button
                              onClick={() => handleAction(item, 'reject')}
                              disabled={isActing}
                              className="flex-1 flex items-center justify-center gap-1 bg-red-600/60 hover:bg-red-500 disabled:bg-surface-container-high text-white text-[9px] font-bold px-2 py-1.5 rounded-lg cursor-pointer transition-all disabled:cursor-not-allowed"
                            >
                              {isActing ? <RefreshCw size={9} className="animate-spin" /> : <X size={9} />}
                              Reject
                            </button>
                            <button
                              onClick={() => handleReview(item)}
                              className="flex items-center justify-center gap-1 bg-surface-container-high hover:bg-surface-container-high/80 border border-outline-variant/10 text-on-surface-variant hover:text-on-surface text-[9px] px-2 py-1.5 rounded-lg cursor-pointer transition-all"
                            >
                              <Eye size={9} />
                            </button>
                          </div>
                        )}

                        {/* Result banner */}
                        {result && (
                          <div className={`mx-3 mb-3 flex items-center gap-1.5 p-2 rounded-lg text-[10px] font-medium ${
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
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
