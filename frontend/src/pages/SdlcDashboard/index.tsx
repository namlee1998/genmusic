import { useEffect, useMemo, useState } from 'react';
import { useSdlcStore } from '@/store/useSdlcStore';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@/store/useAppStore';
import { useSearchParams } from 'react-router-dom';
import {
  Check, Loader2, Clock, AlertCircle, SkipForward, PlayCircle,
  User, Palette, Code, ShieldCheck, Bug, Plus, CheckCircle2
} from 'lucide-react';
import EmptyProjectState from './components/EmptyProjectState';
import FeatureRequestChatbox from './components/FeatureRequestChatbox';
import SessionCard from './components/SessionCard';
import AgentOutputPanel from './components/AgentOutputPanel';
import { Badge } from '@/components/ui/Badge';

const AGENT_TO_ROLE: Record<'PO' | 'UX' | 'DEV' | 'QA', string> = {
  PO: 'po-agent', UX: 'ux-agent', DEV: 'dev-agent', QA: 'qa-agent',
};

interface TaskItem {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'running' | 'gate_pending' | 'completed' | 'skipped' | 'failed';
}

const AGENT_META = {
  PO: { title: 'Product Owner (PO)', desc: 'Requirements & Risk Analysis', icon: <User size={18} className="text-indigo-400" /> },
  UX: { title: 'UI/UX Designer (UX)', desc: 'User Flows & Wireframes', icon: <Palette size={18} className="text-pink-400" /> },
  DEV: { title: 'Developer (DEV)', desc: 'Code & Build Execution', icon: <Code size={18} className="text-emerald-400" /> },
  QA: { title: 'Quality Assurance (QA)', desc: 'Validation & Compliance', icon: <ShieldCheck size={18} className="text-amber-400" /> },
};

const getBadgeVariant = (status: string): "default" | "success" | "warning" | "danger" | "info" | "outline" => {
  switch (status) {
    case 'running': return 'info';
    case 'gate_pending': return 'warning';
    case 'completed': return 'success';
    case 'failed': return 'danger';
    default: return 'default';
  }
};

const TASK_ICON: Record<string, React.ReactNode> = {
  completed: <Check size={14} className="text-emerald-500" />,
  running: <Loader2 size={14} className="animate-spin text-blue-500" />,
  gate_pending: <Clock size={14} className="text-amber-500" />,
  failed: <AlertCircle size={14} className="text-error" />,
  skipped: <SkipForward size={14} className="text-on-surface-variant/60" />,
};

const translateError = (err: string | null): string | null => {
  if (!err) return null;
  const errStr = typeof err === 'string' ? err : (err as any).message || String(err);
  
  if (errStr.includes('project_id with feature_request.title')) return 'Vui lòng chọn một Dự án trước khi gửi yêu cầu tính năng mới.';
  if (errStr.includes('Failed to start SDLC')) return 'Có lỗi xảy ra khi khởi động Agent Pipeline. Vui lòng thử lại.';
  if (errStr.includes('Failed to check status')) return 'Không thể cập nhật trạng thái từ hệ thống. Đang kết nối lại...';
  if (errStr.includes('Failed to resolve risk')) return 'Không thể phản hồi yêu cầu phê duyệt cổng bảo mật.';
  if (errStr.includes('Failed to submit final release')) return 'Không thể gửi quyết định phê duyệt tính năng.';
  if (errStr.includes('Network Error') || errStr.includes('Failed to fetch')) return 'Lỗi mạng: Không thể kết nối đến máy chủ Backend.';
  if (errStr.includes('this._routeSkipsUx is not a function')) return 'Lỗi hệ thống: Cấu hình luồng UX bị lỗi (Đã được khắc phục).';
  
  return errStr;
};

export default function SdlcDashboard() {
  const {
    sessions, activeSessionId, getActiveSession, getAllSessions, setActiveSession, cleanupSession,
    cleanupConnections, pollStatus
  } = useSdlcStore(
    useShallow((state) => ({
      sessions: state.sessions,
      activeSessionId: state.activeSessionId,
      getActiveSession: state.getActiveSession,
      getAllSessions: state.getAllSessions,
      setActiveSession: state.setActiveSession,
      cleanupSession: state.cleanupSession,
      cleanupConnections: state.cleanupConnections,
      pollStatus: state.pollStatus,
    }))
  );

  const activeSession = getActiveSession();
  const allSessions = getAllSessions();
  const status = activeSession?.status || 'idle';
  const error = activeSession?.error || null;
  const pipelinePhases = useMemo(
    () => activeSession?.pipelinePhases ?? [],
    // eslint-disable-next-line react-hooks/preserve-manual-memoization
    [activeSession?.pipelinePhases]
  );

  const currentProjectId = useAppStore((s) => s.currentProjectId);
  const [searchParams, setSearchParams] = useSearchParams();
  const focusRequest = searchParams.get('focusRequest') === 'true';
  const highlightGate = searchParams.get('highlightGate');
  const deepLinkSessionId = searchParams.get('sessionId');
  const deepLinkAgentKey = searchParams.get('agentKey') as 'PO' | 'UX' | 'DEV' | 'QA' | null;

  const [openAgentPanel, setOpenAgentPanel] = useState<'PO' | 'UX' | 'DEV' | 'QA' | null>(() =>
    deepLinkAgentKey && ['PO', 'UX', 'DEV', 'QA'].includes(deepLinkAgentKey) ? deepLinkAgentKey : null
  );

  // Jump to the session a HITL gate came from (e.g. navigated from the
  // Intervention Center's "Review" action) before auto-opening its panel.
  useEffect(() => {
    if (deepLinkSessionId && deepLinkSessionId !== activeSessionId && sessions[deepLinkSessionId]) {
      setActiveSession(deepLinkSessionId);
    }
  }, [deepLinkSessionId, activeSessionId, sessions, setActiveSession]);

  useEffect(() => {
    if (deepLinkAgentKey && ['PO', 'UX', 'DEV', 'QA'].includes(deepLinkAgentKey)) {
      const params = new URLSearchParams(searchParams);
      params.delete('agentKey');
      params.delete('sessionId');
      setSearchParams(params, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkAgentKey]);

  const pendingGateForAgent = (agent: 'PO' | 'UX' | 'DEV' | 'QA') =>
    activeSession?.pendingGates.find((g) => g.role === AGENT_TO_ROLE[agent]) || null;

  useEffect(() => {
    return () => cleanupConnections();
  }, [cleanupConnections]);

  useEffect(() => {
    if (activeSessionId && status !== 'idle' && status !== 'failed' && status !== 'completed') {
      void pollStatus(activeSessionId);
    }
  }, [activeSessionId, status, pollStatus]);

  // Highlight gate when navigated from Intervention Center
  useEffect(() => {
    if (!highlightGate) return;
    const timer = setTimeout(() => {
      // Map gate type to agent column via data attributes
      const el = document.querySelector(`[data-agent]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        el.classList.add('ring-2', 'ring-indigo-500/50', 'rounded-xl');
        setTimeout(() => el.classList.remove('ring-2', 'ring-indigo-500/50', 'rounded-xl'), 2500);
      }
      // Clear the param so refresh doesn't re-trigger
      const params = new URLSearchParams(searchParams);
      params.delete('highlightGate');
      setSearchParams(params, { replace: true });
    }, 500);
    return () => clearTimeout(timer);
  }, [highlightGate, searchParams, setSearchParams]);

  const taskStatuses = ['pending', 'running', 'gate_pending', 'completed', 'skipped', 'failed'] as const;
  const statusCounts = useMemo(() => {
    const counts = { pending: 0, running: 0, gate_pending: 0, completed: 0, skipped: 0, failed: 0 };
    pipelinePhases.forEach(p => { if (p.status in counts) counts[p.status as keyof typeof counts]++; });
    return counts;
  }, [pipelinePhases]);

  // Derive phase status from pipelinePhases
  const phaseStatus = (agent: 'PO' | 'UX' | 'DEV' | 'QA') =>
    pipelinePhases.find(p => p.agent === agent)?.status ?? 'pending';

  const phaseDuration = (agent: 'PO' | 'UX' | 'DEV' | 'QA') =>
    pipelinePhases.find(p => p.agent === agent)?.duration;

  const getTaskStatus = (agent: 'PO' | 'UX' | 'DEV' | 'QA', idx: number): TaskItem['status'] => {
    const ps = phaseStatus(agent);
    if (ps === 'skipped') return 'skipped';
    if (ps === 'failed') return 'failed';
    if (ps === 'pending') return 'pending';
    if (ps === 'running') return idx === 1 ? 'running' : 'pending';
    if (ps === 'gate_pending') return 'gate_pending';
    if (ps === 'completed') return 'completed';
    return 'pending';
  };

  const tasksFor = (agent: 'PO' | 'UX' | 'DEV' | 'QA'): TaskItem[] => {
    const lists: Record<string, TaskItem[]> = {
      PO: [
        { id: 'po-1', title: 'Generate PRD', description: 'Create product requirements document.', status: getTaskStatus('PO', 1) },
      ],
      UX: [
        { id: 'ux-1', title: 'Create HTML Mockup', description: 'Design interactive HTML interface.', status: getTaskStatus('UX', 1) },
      ],
      DEV: [
        { id: 'dev-1', title: 'Generate Code Diff', description: 'Create and review code changes.', status: getTaskStatus('DEV', 1) },
        { id: 'dev-2', title: 'Execute Build', description: 'Run compiler, linter, and tests.', status: getTaskStatus('DEV', 2) },
      ],
      QA: [
        { id: 'qa-1', title: 'Test & Verify', description: 'Create and auto-execute test cases.', status: getTaskStatus('QA', 1) },
      ],
    };
    return lists[agent];
  };

  if (!currentProjectId) {
    return (
      <main className="flex flex-col gap-0 p-0 h-full min-h-0 overflow-y-auto bg-background text-on-surface font-sans antialiased"
        style={{ padding: '24px 32px' }}>
        <EmptyProjectState />
      </main>
    );
  }

  return (
    <main className="flex flex-col gap-0 p-0 h-full min-h-0 overflow-y-auto bg-background text-on-surface font-sans antialiased"
      style={{ padding: '24px 32px' }}>
      {error && (
        <div className="mx-[18px] mb-4 p-3 bg-error/10 border border-error/25 rounded-lg text-error text-[13px] flex items-center gap-2">
          <Bug size={14} /> {translateError(error)}
        </div>
      )}

      <div className="flex flex-col gap-5">
        {focusRequest && <FeatureRequestChatbox onClose={() => {
        searchParams.delete('focusRequest');
        setSearchParams(searchParams);
      }} />}

        {/* Session Grid */}
        {Object.keys(sessions).length > 0 && (
          <div className="mx-[18px] space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-on-surface">Active Sessions ({allSessions.length})</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {allSessions.map(session => (
                <SessionCard
                  key={session.sessionId}
                  session={session}
                  isActive={session.sessionId === activeSessionId}
                  onSelect={setActiveSession}
                  onClose={cleanupSession}
                />
              ))}
              {allSessions.length < 4 && (
                <div className="border-2 border-dashed border-outline-variant/40 rounded-lg p-4 flex items-center justify-center text-center hover:bg-surface-container/30 transition-colors cursor-pointer"
                  onClick={() => {
                    const params = new URLSearchParams(searchParams);
                    params.set('focusRequest', 'true');
                    setSearchParams(params);
                  }}>
                  <div className="flex flex-col items-center gap-2">
                    <Plus size={20} className="text-on-surface-variant" />
                    <span className="text-xs text-on-surface-variant font-medium">New Session</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Header */}
        <div className="mx-[18px] flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-on-surface tracking-tight">Build Dashboard</h1>
            <p className="text-[11.5px] text-on-surface-variant mt-0.5">Real-time agent task status and pipeline progress</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={getBadgeVariant(status || 'idle')} className="px-2.5 py-1 text-[10px]">
              {(status || 'idle').replace('_', ' ').toUpperCase()}
            </Badge>
            {status === 'awaiting_approval' && (
              <button
                onClick={() => {
                  const blocked = (['PO', 'UX', 'DEV', 'QA'] as const).find((a) => phaseStatus(a) === 'gate_pending');
                  if (blocked) setOpenAgentPanel(blocked);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-400 hover:bg-amber-500/30 transition-colors text-xs font-semibold"
              >
                <CheckCircle2 size={14} />
                View & Approve
              </button>
            )}
          </div>

          {/* Feature Request Boxes - Horizontal Layout */}
          {allSessions.length > 0 && (
            <div className="mx-[18px] mb-4">
              <div className="flex gap-3 overflow-x-auto pb-2">
                {/* Existing feature request boxes */}
                {allSessions.map((session) => {
                  const completedPhases = (session.pipelinePhases || []).filter(p => p.status === 'completed').length;
                  const progressPercent = (completedPhases / 4) * 100;
                  
                  return (
                    <div
                      key={session.sessionId}
                      className="flex-shrink-0 w-72 rounded-xl border border-outline-variant/20 bg-surface-container/60 p-4 cursor-pointer hover:border-primary/20 transition-all"
                      onClick={() => setActiveSession(session.sessionId)}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-semibold text-on-surface truncate">
                          {session.featureRequest || 'Untitled Session'}
                        </h3>
                        <Badge variant={getBadgeVariant(session.status || 'idle')} className="text-[10px] px-1.5 py-0.5">
                          {session.status?.replace('_', ' ').toUpperCase()}
                        </Badge>
                      </div>
                      
                      <div className="mb-3">
                        <div className="w-full bg-surface-container-high/40 rounded-full h-1.5">
                          <div
                            className="bg-primary h-1.5 rounded-full transition-all duration-300"
                            style={{ width: `${progressPercent}%` }}
                          />
                        </div>
                        <p className="text-[10px] text-on-surface-variant mt-1 font-medium">
                          {completedPhases}/4 phases completed
                        </p>
                      </div>
                      
                      <div className="grid grid-cols-4 gap-1">
                        {(session.pipelinePhases || []).map((phase, idx) => {
                          const isActive = phase.status === 'running' || phase.status === 'gate_pending';
                          const isCompleted = phase.status === 'completed';
                          const isFailed = phase.status === 'failed';
                          const isSkipped = phase.status === 'skipped';
                          
                          return (
                            <div
                              key={idx}
                              className={`flex flex-col items-center gap-0.5 p-1 rounded ${isActive ? 'bg-blue-500/20' : isCompleted ? 'bg-emerald-500/20' : isFailed ? 'bg-red-500/20' : isSkipped ? 'bg-outline-variant/20 opacity-50' : ''}
                            `}
                            >
                              <div className={`w-5 h-5 rounded flex items-center justify-center text-[9px] font-semibold
                                ${isActive ? 'bg-blue-500 text-white' : isCompleted ? 'bg-emerald-500 text-white' : isFailed ? 'bg-red-500 text-white' : isSkipped ? 'bg-on-surface-variant/30 text-on-surface-variant' : 'bg-surface-container-high/60 text-on-surface-variant'}
                              `}
                              >
                                {phase.agent}
                              </div>
                              <span className={`text-[8px] ${isActive ? 'text-blue-400' : isCompleted ? 'text-emerald-400' : isFailed ? 'text-red-400' : isSkipped ? 'text-on-surface-variant/60' : 'text-on-surface-variant'}
                              `}
                              >
                                {phase.status === 'running' ? 'RUN' : phase.status === 'gate_pending' ? 'GATE' : phase.status === 'completed' ? 'OK' : phase.status === 'failed' ? 'FAIL' : phase.status === 'skipped' ? 'SKIP' : 'PEND'}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
                
                {/* Add Feature Request box */}
                <div
                  className="flex-shrink-0 w-72 rounded-xl border-2 border-dashed border-outline-variant/40 bg-surface-container/20 p-4 cursor-pointer hover:border-primary/30 hover:bg-surface-container/40 transition-all"
                  onClick={() => {
                    const params = new URLSearchParams(searchParams);
                    params.set('focusRequest', 'true');
                    setSearchParams(params);
                  }}
                >
                  <div className="flex flex-col items-center justify-center h-full gap-2">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <Plus size={20} className="text-primary" />
                    </div>
                    <span className="text-xs font-medium text-on-surface-variant">Request a new feature</span>
                    <span className="text-[10px] text-on-surface-variant/60">Click to add</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Status counters */}
        <div className="mx-[18px] grid grid-cols-3 sm:grid-cols-6 gap-3">
          {taskStatuses.map(s => {
            const count = statusCounts[s] || 0;
            const dotColor = {
              pending: 'bg-outline', running: 'bg-blue-500', gate_pending: 'bg-amber-500',
              completed: 'bg-emerald-500', skipped: 'bg-outline/50', failed: 'bg-red-500',
            }[s];
            return (
              <div key={s} className="flex items-center gap-2 p-2.5 rounded-lg bg-surface-container/40 border border-outline-variant/20">
                <span className={`w-2 h-2 rounded-full ${dotColor}`} />
                <span className="text-[10px] text-on-surface-variant capitalize font-medium">{s.replace('_', ' ')}</span>
                <span className="text-xs font-bold text-on-surface ml-auto">{count}</span>
              </div>
            );
          })}
        </div>

        {/* Agent Task Grid */}
        <div className="mx-[18px] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {(['PO', 'UX', 'DEV', 'QA'] as const).map(agent => {
            const ps = phaseStatus(agent);
            const tasks = tasksFor(agent);
            const meta = AGENT_META[agent];
            const duration = phaseDuration(agent);

            const isCompletedOrFailed = ps === 'completed' || ps === 'failed' || ps === 'gate_pending';
            const canOpenPanel = isCompletedOrFailed && tasks.length > 0;

            const columnBorder = {
              pending: 'border-outline-variant/20', running: 'border-blue-500/30',
              gate_pending: 'border-amber-500/30', completed: 'border-emerald-500/20',
              skipped: 'border-dashed border-outline-variant/20', failed: 'border-red-500/30',
            }[ps] || 'border-outline-variant/20';

            return (
              <div
                key={agent}
                data-agent={agent}
                onClick={() => canOpenPanel && setOpenAgentPanel(agent)}
                className={`flex flex-col gap-3 p-4 rounded-xl bg-surface-container/60 border transition-all ${columnBorder} ${canOpenPanel ? 'cursor-pointer hover:border-white/20' : ''}`}
              >
                {/* Agent header */}
                <div className="flex items-center gap-2.5 pb-3 border-b border-outline-variant/20">
                  <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-surface-container-high/60">
                    {meta.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-xs font-bold text-on-surface truncate">{meta.title}</h3>
                    <p className="text-[9px] text-on-surface-variant">{meta.desc}</p>
                  </div>
                  <Badge variant={getBadgeVariant(ps)} className="text-[8px] px-1.5 py-0.5 shrink-0">
                    {ps.replace('_', ' ')}
                  </Badge>
                </div>

                {/* Duration */}
                {duration && (
                  <div className="text-[9px] text-primary font-mono font-semibold -mt-1">
                    {duration}
                  </div>
                )}

                {/* Task list */}
                <div className="flex flex-col gap-2">
                  {tasks.map(task => (
                    <div key={task.id} className={`flex items-start gap-2.5 p-2.5 rounded-lg border transition-all ${
                      task.status === 'completed' ? 'border-emerald-500/15 bg-emerald-500/5' :
                      task.status === 'running' ? 'border-blue-500/30 bg-blue-500/5' :
                      task.status === 'gate_pending' ? 'border-amber-500/30 bg-amber-500/5' :
                      task.status === 'failed' ? 'border-red-500/30 bg-red-500/5' :
                      task.status === 'skipped' ? 'border-dashed border-outline-variant/10 opacity-50' :
                      'border-outline-variant/10 bg-transparent'
                    }`}>
                      <span className="mt-0.5 shrink-0">{TASK_ICON[task.status] || <PlayCircle size={14} className="text-on-surface-variant" />}</span>
                      <div className="flex-1 min-w-0">
                        <span className="text-[11px] font-semibold text-on-surface block truncate">{task.title}</span>
                        <p className="text-[9.5px] text-on-surface-variant leading-relaxed mt-0.5">
                          {task.status === 'skipped' ? 'Skipped for this execution path.' : task.description}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {openAgentPanel && activeSession && tasksFor(openAgentPanel).length > 0 && (
        <AgentOutputPanel
          agent={openAgentPanel}
          gate={pendingGateForAgent(openAgentPanel) || undefined}
          taskId={pipelinePhases.find(p => p.agent === openAgentPanel)?.taskId || tasksFor(openAgentPanel)[0].id}
          onClose={() => setOpenAgentPanel(null)}
          onResolved={() => activeSessionId && void pollStatus(activeSessionId)}
        />
      )}
    </main>
  );
}
