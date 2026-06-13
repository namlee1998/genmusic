import type { WorkflowMetrics } from '@/store/useSdlcStore';
import { Clock, CheckCircle2, AlertTriangle, ShieldCheck, PlayCircle, BarChart3, FileText } from 'lucide-react';

interface Props { metrics: WorkflowMetrics | null; }

function formatDuration(seconds: number | null): string {
  if (seconds == null) return '—';
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return s ? `${m}m ${s}s` : `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

const STAGE_LABELS: Record<string, string> = {
  'po-agent': 'PO', 'ux-agent': 'UX', 'dev-agent': 'DEV', 'qa-agent': 'QA',
};

export default function WorkflowMetricsPanel({ metrics }: Props) {
  if (!metrics) {
    return (
      <div className="bg-[#11131a]/40 border border-[#1e293b]/60 rounded-xl p-6 text-center text-slate-400 italic text-xs">
        <p>No metrics yet. Run a feature through the workflow to populate these signals.</p>
      </div>
    );
  }

  const failureReasons = Object.entries(metrics.gate_failure_reason_distribution || {});
  const rerunStages = Object.entries(metrics.rerun_count_per_stage || {});

  return (
    <div className="flex flex-col gap-6 w-full">
      {/* Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Cycle Time */}
        <div className="bg-[#11131a]/60 border border-[#1e293b] rounded-xl p-4 flex flex-col gap-1 shadow-md hover:border-indigo-500/30 transition-all">
          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 flex items-center gap-1.5">
            <Clock size={12} className="text-indigo-400" /> Cycle time
          </span>
          <span className="text-xl font-bold text-white font-mono mt-1">
            {formatDuration(metrics.cycle_time_seconds)}
          </span>
          <span className="text-[10px] text-slate-400 mt-0.5">request → release</span>
        </div>

        {/* Auto Approval */}
        <div className="bg-[#11131a]/60 border border-[#1e293b] rounded-xl p-4 flex flex-col gap-1 shadow-md hover:border-indigo-500/30 transition-all">
          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 flex items-center gap-1.5">
            <CheckCircle2 size={12} className="text-[#10b981]" /> Auto-approval
          </span>
          <span className="text-xl font-bold text-white font-mono mt-1">
            {metrics.auto_approval_rate}%
          </span>
          <span className="text-[10px] text-slate-400 mt-0.5">
            {metrics.counts.auto_approvals}/{metrics.counts.auto_approvals + metrics.counts.human_approvals} approvals
          </span>
        </div>

        {/* Human Rejection */}
        <div className="bg-[#11131a]/60 border border-[#1e293b] rounded-xl p-4 flex flex-col gap-1 shadow-md hover:border-indigo-500/30 transition-all">
          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 flex items-center gap-1.5">
            <AlertTriangle size={12} className="text-[#f59e0b]" /> Human rejection
          </span>
          <span className="text-xl font-bold text-white font-mono mt-1">
            {metrics.human_rejection_rate}%
          </span>
          <span className="text-[10px] text-slate-400 mt-0.5">{metrics.counts.rejections} rejections</span>
        </div>

        {/* False Auto-Approval */}
        <div className={`border rounded-xl p-4 flex flex-col gap-1 shadow-md transition-all ${
          metrics.false_auto_approval_rate > 0 
            ? 'bg-red-500/5 border-red-500/30 hover:border-red-500/50' 
            : 'bg-[#11131a]/60 border-[#1e293b] hover:border-indigo-500/30'
        }`}>
          <span className={`text-[10px] uppercase font-bold tracking-wider flex items-center gap-1.5 ${
            metrics.false_auto_approval_rate > 0 ? 'text-red-400' : 'text-slate-500'
          }`}>
            <ShieldCheck size={12} /> False auto-approval
          </span>
          <span className={`text-xl font-bold font-mono mt-1 ${
            metrics.false_auto_approval_rate > 0 ? 'text-red-400' : 'text-white'
          }`}>
            {metrics.false_auto_approval_rate}%
          </span>
          <span className="text-[10px] text-slate-400 mt-0.5">auto-approved then rejected</span>
        </div>

        {/* Requirement Coverage */}
        <div className="bg-[#11131a]/60 border border-[#1e293b] rounded-xl p-4 flex flex-col gap-1 shadow-md hover:border-indigo-500/30 transition-all">
          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 flex items-center gap-1.5">
            <FileText size={12} className="text-cyan-400" /> Coverage
          </span>
          <span className="text-xl font-bold text-white font-mono mt-1">
            {metrics.requirement_coverage_percentage ?? '—'}{metrics.requirement_coverage_percentage != null ? '%' : ''}
          </span>
          <span className="text-[10px] text-slate-400 mt-0.5">QA coverage matrix</span>
        </div>

        {/* Sandbox */}
        <div className="bg-[#11131a]/60 border border-[#1e293b] rounded-xl p-4 flex flex-col gap-1 shadow-md hover:border-indigo-500/30 transition-all">
          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 flex items-center gap-1.5">
            <PlayCircle size={12} className="text-indigo-400" /> Sandbox
          </span>
          <span className="text-xl font-bold text-white font-mono mt-1">
            {metrics.sandbox_pass == null ? '—' : metrics.sandbox_pass ? 'PASS' : 'FAIL'}
          </span>
          <span className="text-[10px] text-slate-400 mt-0.5">QA gate {metrics.qa_gate || '—'}</span>
        </div>

        {/* Dead Letter */}
        <div className={`border rounded-xl p-4 flex flex-col gap-1 shadow-md transition-all ${
          metrics.dead_letter_count > 0 
            ? 'bg-amber-500/5 border-amber-500/30 hover:border-amber-500/50' 
            : 'bg-[#11131a]/60 border-[#1e293b] hover:border-indigo-500/30'
        }`}>
          <span className={`text-[10px] uppercase font-bold tracking-wider flex items-center gap-1.5 ${
            metrics.dead_letter_count > 0 ? 'text-amber-400' : 'text-slate-500'
          }`}>
            <AlertTriangle size={12} /> Dead-letter
          </span>
          <span className={`text-xl font-bold font-mono mt-1 ${
            metrics.dead_letter_count > 0 ? 'text-amber-400' : 'text-white'
          }`}>
            {metrics.dead_letter_count}
          </span>
          <span className="text-[10px] text-slate-400 mt-0.5">max-retry escalations</span>
        </div>

        {/* Total Runs */}
        <div className="bg-[#11131a]/60 border border-[#1e293b] rounded-xl p-4 flex flex-col gap-1 shadow-md hover:border-indigo-500/30 transition-all">
          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 flex items-center gap-1.5">
            <BarChart3 size={12} className="text-purple-400" /> Total runs
          </span>
          <span className="text-xl font-bold text-white font-mono mt-1">
            {metrics.counts.total_runs}
          </span>
          <span className="text-[10px] text-slate-400 mt-0.5">{metrics.counts.escalations} escalation{metrics.counts.escalations === 1 ? '' : 's'}</span>
        </div>
      </div>

      {/* Breakdown Lists */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-2">
        {/* Time per Agent */}
        <div className="bg-[#11131a]/40 border border-[#1e293b]/70 rounded-xl p-5 flex flex-col gap-4">
          <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider border-b border-[#1e293b] pb-2 m-0">
            Time per agent
          </h4>
          <ul className="flex flex-col gap-2.5 p-0 m-0 list-none">
            {['po-agent', 'ux-agent', 'dev-agent', 'qa-agent'].map((stage) => (
              <li key={stage} className="flex items-center justify-between text-xs py-1">
                <span className="font-semibold text-slate-300 bg-slate-900 border border-[#1e293b] px-2 py-0.5 rounded font-mono">
                  {STAGE_LABELS[stage]}
                </span>
                <div className="flex items-center gap-3">
                  <span className="font-bold text-white font-mono">
                    {formatDuration(metrics.time_per_agent?.[stage]?.avg_seconds ?? null)}
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">
                    ({metrics.time_per_agent?.[stage]?.runs ?? 0} run)
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Rerun Count per Stage */}
        <div className="bg-[#11131a]/40 border border-[#1e293b]/70 rounded-xl p-5 flex flex-col gap-4">
          <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider border-b border-[#1e293b] pb-2 m-0">
            Rerun count per stage
          </h4>
          {rerunStages.length ? (
            <ul className="flex flex-col gap-2.5 p-0 m-0 list-none">
              {rerunStages.map(([stage, count]) => (
                <li key={stage} className="flex items-center justify-between text-xs py-1">
                  <span className="font-semibold text-slate-300 bg-slate-900 border border-[#1e293b] px-2 py-0.5 rounded font-mono">
                    {STAGE_LABELS[stage] || stage}
                  </span>
                  <span className="font-bold text-white font-mono">{count}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-slate-500 italic m-0 py-2">No reruns recorded.</p>
          )}
        </div>

        {/* Gate Failure Reasons */}
        <div className="bg-[#11131a]/40 border border-[#1e293b]/70 rounded-xl p-5 flex flex-col gap-4">
          <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider border-b border-[#1e293b] pb-2 m-0">
            Gate failure reasons
          </h4>
          {failureReasons.length ? (
            <ul className="flex flex-col gap-2.5 p-0 m-0 list-none">
              {failureReasons.map(([reason, count]) => (
                <li key={reason} className="flex items-center justify-between text-xs py-1">
                  <span className="text-slate-300 bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded font-mono capitalize">
                    {reason.replace(/_/g, ' ')}
                  </span>
                  <span className="font-bold text-white font-mono">{count}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-slate-500 italic m-0 py-2">No gate failures.</p>
          )}
        </div>
      </div>
    </div>
  );
}
