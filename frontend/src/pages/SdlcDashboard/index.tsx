import { useEffect, useMemo } from 'react';
import { useSdlcStore } from '@/store/useSdlcStore';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@/store/useAppStore';
import { useSearchParams } from 'react-router-dom';
import {
  Check, Loader2, Clock, AlertCircle, SkipForward, PlayCircle,
  User, Palette, Code, ShieldCheck, Bug
} from 'lucide-react';
import EmptyProjectState from './components/EmptyProjectState';
import FeatureRequestChatbox from './components/FeatureRequestChatbox';
import { Badge } from '@/components/ui/Badge';

interface TaskItem {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'running' | 'gate_pending' | 'completed' | 'skipped' | 'failed';
}

const AGENT_META = {
  PO: { title: 'Product Owner (PO)', desc: 'Requirements & Risk Analysis', icon: <User size={18} className="text-indigo-400" /> },
  UX: { title: 'UI/UX Designer (UX)', desc: 'User Flows & Wireframes', icon: <Palette size={18} className="text-pink-400" /> },
  DEV: { title: 'Developer (DEV)', desc: 'Code & Sandbox Execution', icon: <Code size={18} className="text-emerald-400" /> },
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
    status, error, pollStatus, workflowId, cleanupConnections,
    pipelinePhases,
  } = useSdlcStore(
    useShallow((state) => ({
      status: state.status,
      error: state.error,
      pollStatus: state.pollStatus,
      workflowId: state.workflowId,
      cleanupConnections: state.cleanupConnections,
      pipelinePhases: state.pipelinePhases,
    }))
  );
  const currentProjectId = useAppStore((s) => s.currentProjectId);
  const [searchParams, setSearchParams] = useSearchParams();
  const focusRequest = searchParams.get('focusRequest') === 'true';
  const highlightGate = searchParams.get('highlightGate');

  useEffect(() => {
    return () => cleanupConnections();
  }, [cleanupConnections]);

  useEffect(() => {
    if (workflowId && status !== 'idle' && status !== 'failed') {
      void pollStatus();
    }
  }, [workflowId, status, pollStatus]);

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
    pipelinePhases?.forEach(p => { if (p.status in counts) counts[p.status as keyof typeof counts]++; });
    return counts;
  }, [pipelinePhases]);

  // Derive phase status from pipelinePhases
  const phaseStatus = (agent: 'PO' | 'UX' | 'DEV' | 'QA') =>
    pipelinePhases?.find(p => p.agent === agent)?.status ?? 'pending';

  const phaseDuration = (agent: 'PO' | 'UX' | 'DEV' | 'QA') =>
    pipelinePhases?.find(p => p.agent === agent)?.duration;

  const getTaskStatus = (agent: 'PO' | 'UX' | 'DEV' | 'QA', idx: 1 | 2 | 3): TaskItem['status'] => {
    const ps = phaseStatus(agent);
    if (ps === 'skipped') return 'skipped';
    if (ps === 'failed') return idx === 3 ? 'failed' : 'completed';
    if (ps === 'pending') return 'pending';
    if (ps === 'running') return idx === 1 ? 'running' : 'pending';
    if (ps === 'gate_pending') return idx === 3 ? 'gate_pending' : 'completed';
    if (ps === 'completed') return 'completed';
    return 'pending';
  };

  const tasksFor = (agent: 'PO' | 'UX' | 'DEV' | 'QA'): TaskItem[] => {
    const lists: Record<string, TaskItem[]> = {
      PO: [
        { id: 'po-1', title: 'Requirement Classification', description: 'Classify feature scope & execution route.', status: getTaskStatus('PO', 1) },
        { id: 'po-2', title: 'PRD Generation', description: 'Generate product requirements document.', status: getTaskStatus('PO', 2) },
        { id: 'po-3', title: 'Requirements Gate', description: 'Awaiting human review for clarification.', status: getTaskStatus('PO', 3) },
      ],
      UX: [
        { id: 'ux-1', title: 'User Flow Design', description: 'Outline interaction paths and navigation.', status: getTaskStatus('UX', 1) },
        { id: 'ux-2', title: 'Wireframes & UI Specs', description: 'Draft visual specs and layout.', status: getTaskStatus('UX', 2) },
        { id: 'ux-3', title: 'Component Inventory', description: 'Finalize component elements.', status: getTaskStatus('UX', 3) },
      ],
      DEV: [
        { id: 'dev-1', title: 'Implementation Plan', description: 'Draft file modifications and test plans.', status: getTaskStatus('DEV', 1) },
        { id: 'dev-2', title: 'Code Modification', description: 'Apply changes and check security rules.', status: getTaskStatus('DEV', 2) },
        { id: 'dev-3', title: 'Sandbox Execution & Gate', description: 'Run compiler, linter, tests.', status: getTaskStatus('DEV', 3) },
      ],
      QA: [
        { id: 'qa-1', title: 'Test Cases Execution', description: 'Verify coverage and regression tests.', status: getTaskStatus('QA', 1) },
        { id: 'qa-2', title: 'Security Scan & Compliance', description: 'Check OWASP and dependency audit.', status: getTaskStatus('QA', 2) },
        { id: 'qa-3', title: 'Release Recommendation', description: 'Provide final QA audit report.', status: getTaskStatus('QA', 3) },
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
        {focusRequest && <FeatureRequestChatbox />}

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
          </div>
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

            const columnBorder = {
              pending: 'border-outline-variant/20', running: 'border-blue-500/30',
              gate_pending: 'border-amber-500/30', completed: 'border-emerald-500/20',
              skipped: 'border-dashed border-outline-variant/20', failed: 'border-red-500/30',
            }[ps] || 'border-outline-variant/20';

            return (
              <div key={agent} data-agent={agent} className={`flex flex-col gap-3 p-4 rounded-xl bg-surface-container/60 border transition-all ${columnBorder}`}>
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
    </main>
  );
}
