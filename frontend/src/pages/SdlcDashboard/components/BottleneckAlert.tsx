import { useSdlcStore } from '@/store/useSdlcStore';
import { AlertTriangle, ShieldAlert, ArrowRight, CheckCircle2, Clock } from 'lucide-react';

export default function BottleneckAlert() {
  const { status, error, pendingGates, pipelinePhases } = useSdlcStore();

  // Determine active bottlenecks
  const hasError = status === 'failed' || !!error;
  const hasPendingGates = pendingGates && pendingGates.length > 0;
  const devGatePending = pipelinePhases.find((p) => p.agent === 'DEV')?.status === 'gate_pending';
  const poGatePending = pipelinePhases.find((p) => p.agent === 'PO')?.status === 'gate_pending';
  const qaGatePending = pipelinePhases.find((p) => p.agent === 'QA')?.status === 'gate_pending';

  if (!hasError && !hasPendingGates && !devGatePending && !poGatePending && !qaGatePending) {
    return null;
  }

  const scrollToSection = (selector: string) => {
    const el = document.querySelector(selector);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('hitl-highlight-pulse');
      setTimeout(() => {
        el.classList.remove('hitl-highlight-pulse');
      }, 3000);
    }
  };

  return (
    <div className="mx-[18px] mb-1 animate-in fade-in duration-200">
      {hasError && (
        <div className="p-4 rounded-xl border border-red-500/25 bg-red-500/5 backdrop-blur-md flex items-start gap-3.5 shadow-lg shadow-red-500/5">
          <ShieldAlert className="text-red-400 shrink-0 mt-0.5 animate-bounce" size={18} />
          <div className="flex-1">
            <h4 className="text-xs font-bold text-red-300 uppercase tracking-wider mb-0.5">Pipeline Execution Blocked</h4>
            <p className="text-[11.5px] text-red-200/80 leading-relaxed m-0">
              An error occurred during agent execution. {error || 'Developer Agent failed sandbox tests or compilation check.'} Check the logs on the Platform Debugger or visit the Audit Trail for a Root Cause analysis.
            </p>
          </div>
          <button
            onClick={() => scrollToSection('.audit-log-card')}
            className="shrink-0 inline-flex items-center gap-1 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 hover:border-red-500/30 text-red-300 text-[10px] font-bold px-2.5 py-1.5 rounded transition-all cursor-pointer"
          >
            <span>View Logs</span>
            <ArrowRight size={10} />
          </button>
        </div>
      )}

      {!hasError && hasPendingGates && (
        <div className="p-4 rounded-xl border border-amber-500/25 bg-amber-500/5 backdrop-blur-md flex items-start gap-3.5 shadow-lg shadow-amber-500/5">
          <AlertTriangle className="text-amber-400 shrink-0 mt-0.5 animate-pulse" size={18} />
          <div className="flex-1">
            <h4 className="text-xs font-bold text-amber-300 uppercase tracking-wider mb-0.5">Action Required: Manual Override Pending</h4>
            <p className="text-[11.5px] text-amber-200/80 leading-relaxed m-0">
              Risk control gates have interrupted the automated workflow pipeline. A developer or product owner decision is required to proceed with implementation.
            </p>
            <div className="flex gap-4 mt-2 text-[10px] text-slate-400">
              {poGatePending && (
                <span className="flex items-center gap-1">
                  <Clock size={10} className="text-amber-500" />
                  PO Requirements Review
                </span>
              )}
              {devGatePending && (
                <span className="flex items-center gap-1">
                  <Clock size={10} className="text-amber-500" />
                  Developer Code Gate
                </span>
              )}
              {qaGatePending && (
                <span className="flex items-center gap-1">
                  <Clock size={10} className="text-amber-500" />
                  Release Gate Approval
                </span>
              )}
            </div>
          </div>
          <button
            onClick={() => scrollToSection('.gate-panel-card')}
            className="shrink-0 inline-flex items-center gap-1 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 hover:border-amber-500/30 text-amber-300 text-[10px] font-bold px-2.5 py-1.5 rounded transition-all cursor-pointer"
          >
            <span>Inspect Gate</span>
            <ArrowRight size={10} />
          </button>
        </div>
      )}
    </div>
  );
}
