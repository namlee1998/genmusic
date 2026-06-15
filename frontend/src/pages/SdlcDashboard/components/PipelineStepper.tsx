import { useSdlcStore } from '@/store/useSdlcStore';
import {
  Check,
  Loader2,
  Clock,
  AlertCircle,
  Database,
  FileText,
  Palette,
  Code2,
  ShieldCheck,
  Rocket,
  ArrowRight,
} from 'lucide-react';

interface StepItem {
  id: number;
  label: string;
  sublabel: string;
  icon: React.ReactNode;
  status: 'pending' | 'running' | 'gate_pending' | 'completed' | 'skipped' | 'failed';
  duration?: string;
}

export default function PipelineStepper() {
  const { status, pipelinePhases, releaseStatus } = useSdlcStore();

  // 1. Resolve phase status helpers
  const getPhaseStatus = (agent: 'PO' | 'UX' | 'DEV' | 'QA') => {
    const phase = pipelinePhases.find((p) => p.agent === agent);
    return phase ? phase.status : 'pending';
  };

  const getPhaseDuration = (agent: 'PO' | 'UX' | 'DEV' | 'QA') => {
    const phase = pipelinePhases.find((p) => p.agent === agent);
    return phase?.duration;
  };

  // 2. Map Steps
  const cloneStatus = () => {
    if (status === 'cloning' || status === 'analyzing') return 'running';
    if (status === 'failed' && pipelinePhases.every((p) => p.status === 'pending')) return 'failed';
    if (status === 'idle') return 'pending';
    return 'completed';
  };

  const releaseStatusResolved = () => {
    if (releaseStatus === 'approved') return 'completed';
    if (releaseStatus === 'rejected') return 'failed';
    const qaStatus = getPhaseStatus('QA');
    if (qaStatus === 'completed') return 'gate_pending';
    return 'pending';
  };

  const steps: StepItem[] = [
    {
      id: 1,
      label: 'Clone & Setup',
      sublabel: 'Workspace init',
      icon: <Database size={16} />,
      status: cloneStatus(),
    },
    {
      id: 2,
      label: 'PO Requirements',
      sublabel: 'PRD synthesis',
      icon: <FileText size={16} />,
      status: getPhaseStatus('PO'),
      duration: getPhaseDuration('PO'),
    },
    {
      id: 3,
      label: 'UX Design Specs',
      sublabel: 'UI Wireframes',
      icon: <Palette size={16} />,
      status: getPhaseStatus('UX'),
      duration: getPhaseDuration('UX'),
    },
    {
      id: 4,
      label: 'Code Generation',
      sublabel: 'DEV Code synth',
      icon: <Code2 size={16} />,
      status: getPhaseStatus('DEV'),
      duration: getPhaseDuration('DEV'),
    },
    {
      id: 5,
      label: 'Sandbox Verification',
      sublabel: 'QA Sandbox run',
      icon: <ShieldCheck size={16} />,
      status: getPhaseStatus('QA'),
      duration: getPhaseDuration('QA'),
    },
    {
      id: 6,
      label: 'Staging Release',
      sublabel: 'Final Release',
      icon: <Rocket size={16} />,
      status: releaseStatusResolved(),
    },
  ];

  const getStepIcon = (step: StepItem) => {
    if (step.status === 'completed') {
      return <Check size={14} className="text-white" />;
    }
    if (step.status === 'running') {
      return <Loader2 size={14} className="animate-spin text-white" />;
    }
    if (step.status === 'failed') {
      return <AlertCircle size={14} className="text-white" />;
    }
    return step.icon;
  };

  const getNodeStyles = (status: StepItem['status']) => {
    switch (status) {
      case 'completed':
        return 'bg-emerald-500 border-emerald-400 text-white shadow-[0_0_15px_rgba(16,185,129,0.3)]';
      case 'running':
        return 'bg-blue-500 border-blue-400 text-white shadow-[0_0_15px_rgba(59,130,246,0.4)] animate-pulse border-2';
      case 'gate_pending':
        return 'bg-amber-500 border-amber-400 text-white shadow-[0_0_15px_rgba(245,158,11,0.3)] animate-pulse';
      case 'failed':
        return 'bg-red-500 border-red-400 text-white shadow-[0_0_15px_rgba(239,68,68,0.3)]';
      case 'skipped':
        return 'bg-slate-800/40 border-slate-700/50 text-slate-500 border-dashed';
      default:
        return 'bg-[#121318] border-[#1e293b] text-slate-400';
    }
  };

  const getLineStyles = (status: StepItem['status']) => {
    switch (status) {
      case 'completed':
        return 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.2)]';
      case 'running':
      case 'gate_pending':
        return 'bg-gradient-to-r from-emerald-500 to-indigo-500 animate-pulse';
      case 'failed':
        return 'bg-red-500';
      case 'skipped':
        return 'bg-slate-800 border-t border-dashed border-slate-700';
      default:
        return 'bg-[#1e293b]';
    }
  };

  return (
    <div className="mx-[18px] mb-6 p-5 rounded-xl border border-white/5 bg-[#0d0e13]/80 backdrop-blur-xl shadow-lg">
      <div className="flex items-center justify-between mb-5">
        <h3 className="font-bold text-sm text-[#f8fafc] uppercase tracking-wider">Pipeline Progress Stepper</h3>
        <span className="text-[10px] text-slate-500 font-mono font-medium">Node view</span>
      </div>

      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 md:gap-2 overflow-x-auto pb-2 custom-scrollbar">
        {steps.map((step, idx) => {
          const isLast = idx === steps.length - 1;
          return (
            <div key={step.id} className="flex-1 flex items-center w-full min-w-[150px] relative group">
              {/* Stepper Node Container */}
              <div className="flex items-center gap-3">
                {/* Node Circle */}
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center border transition-all duration-300 select-none ${getNodeStyles(
                    step.status
                  )}`}
                >
                  {getStepIcon(step)}
                </div>

                {/* Labels */}
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-slate-200 group-hover:text-white transition-colors whitespace-nowrap">
                    {step.label}
                  </span>
                  <span className="text-[9.5px] text-slate-500 font-medium whitespace-nowrap">
                    {step.status === 'skipped' ? 'Skipped' : step.sublabel}
                  </span>
                  {step.duration && (
                    <span className="font-mono text-[9px] text-indigo-400 font-semibold leading-none mt-0.5">
                      {step.duration}
                    </span>
                  )}
                </div>
              </div>

              {/* Connecting line to next step */}
              {!isLast && (
                <div className="hidden md:block flex-1 h-[2px] mx-4 rounded-full overflow-hidden bg-slate-800">
                  <div className={`h-full transition-all duration-500 ${getLineStyles(steps[idx + 1].status)}`} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
