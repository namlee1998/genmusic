import { CheckCircle2, GitPullRequest, Play, RotateCcw, ShieldCheck, Loader2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

type StepStatus = 'queued' | 'running' | 'passed';

interface CiStep {
  id: string;
  label: string;
  command: string;
  detail: string;
  durationMs: number;
}

const CI_STEPS: CiStep[] = [
  {
    id: 'install',
    label: 'Install dependencies',
    command: 'npm ci',
    detail: 'Clean install from backend/package-lock.json.',
    durationMs: 700,
  },
  {
    id: 'prisma-generate',
    label: 'Generate Prisma client',
    command: 'npx prisma generate',
    detail: 'Regenerates the client before DB checks.',
    durationMs: 650,
  },
  {
    id: 'db-push',
    label: 'Push schema to ci.db',
    command: 'npx prisma db push --skip-generate --accept-data-loss',
    detail: 'Uses isolated SQLite DATABASE_URL=file:./ci.db.',
    durationMs: 800,
  },
  {
    id: 'drift',
    label: 'Schema drift guard',
    command: 'npx prisma migrate diff --exit-code',
    detail: 'Fails the build if the schema and database drift apart.',
    durationMs: 900,
  },
  {
    id: 'tests',
    label: 'Unit & integration tests',
    command: 'npm test',
    detail: 'Runs backend Jest tests in CI order.',
    durationMs: 900,
  },
  {
    id: 'smoke',
    label: 'Demo scenario preflight',
    command: 'npm run demo:smoke',
    detail: 'Verifies all six deterministic happy/bad-case branches.',
    durationMs: 950,
  },
];

const statusFor = (index: number, activeIndex: number, complete: boolean): StepStatus => {
  if (complete || index < activeIndex) return 'passed';
  if (index === activeIndex) return 'running';
  return 'queued';
};

export default function CiPreflightPanel() {
  const [runKey, setRunKey] = useState(1);
  const [activeIndex, setActiveIndex] = useState(0);
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    if (complete) return undefined;
    const step = CI_STEPS[activeIndex];
    const timer = window.setTimeout(() => {
      if (activeIndex >= CI_STEPS.length - 1) {
        setComplete(true);
      } else {
        setActiveIndex((current) => current + 1);
      }
    }, step.durationMs);
    return () => window.clearTimeout(timer);
  }, [activeIndex, complete, runKey]);

  const totalDuration = useMemo(
    () => Math.round(CI_STEPS.reduce((sum, step) => sum + step.durationMs, 0) / 100) / 10,
    [],
  );

  const rerun = () => {
    setRunKey((key) => key + 1);
    setActiveIndex(0);
    setComplete(false);
  };

  return (
    <div className="bg-[#11131a]/60 border border-[#1e293b] rounded-xl p-5 flex flex-col gap-4 w-full shadow-md">
      {/* Header Info */}
      <div className="flex items-center justify-between border-b border-[#1e293b] pb-4 flex-wrap gap-3">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-indigo-500/10 border border-indigo-500/20 rounded-lg text-indigo-400">
            <GitPullRequest size={20} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white m-0">GitHub Actions Mock Preflight</h3>
            <p className="text-xs text-slate-400 m-0 mt-0.5">
              Pull request pipeline for backend orchestration, schema validation, and smoke tests.
            </p>
          </div>
        </div>
        <button 
          type="button" 
          onClick={rerun} 
          className="inline-flex items-center gap-1.5 px-3.5 py-2 border border-indigo-400/40 rounded-lg bg-indigo-500/10 text-indigo-300 font-semibold text-xs cursor-pointer hover:bg-indigo-500/20 transition-all"
        >
          {complete ? <RotateCcw size={14} /> : <Loader2 size={14} className="animate-spin" />}
          {complete ? 'Rerun mock CI' : 'Running...'}
        </button>
      </div>

      {/* Summary status banner */}
      <div className={`p-4 rounded-xl border flex gap-3 ${
        complete 
          ? 'bg-[#10b981]/5 border-[#10b981]/25 text-[#10b981]' 
          : 'bg-[#f59e0b]/5 border-[#f59e0b]/25 text-[#f59e0b] animate-pulse'
      }`}>
        <ShieldCheck size={18} className="shrink-0 mt-0.5" />
        <div className="flex flex-col gap-0.5">
          <strong className="text-xs uppercase tracking-wide">
            {complete ? 'Merge Gate Passed' : 'CI Preflight Running'}
          </strong>
          <span className="text-xs text-slate-300 font-mono mt-0.5">
            {complete
              ? `All checks passed in ${totalDuration}s. Target branch would be mergeable.`
              : 'Checking schema drift, tests, and scenario mocks before final build approval...'}
          </span>
        </div>
      </div>

      {/* Step checklist cards */}
      <ol className="grid grid-cols-1 md:grid-cols-2 gap-3 p-0 m-0 list-none">
        {CI_STEPS.map((step, index) => {
          const status = statusFor(index, activeIndex, complete);
          return (
            <li 
              key={`${runKey}-${step.id}`} 
              className={`flex items-start gap-3 p-3 rounded-lg border transition-all duration-200 ${
                status === 'passed' ? 'bg-[#10b981]/5 border-[#10b981]/20' :
                status === 'running' ? 'bg-indigo-500/5 border-indigo-500/40 shadow-[0_0_8px_rgba(99,102,241,0.1)]' :
                'bg-slate-950/20 border-[#1e293b]/50 opacity-60'
              }`}
            >
              {/* Status indicator badge */}
              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5 border ${
                status === 'passed' ? 'bg-[#10b981]/10 border-[#10b981] text-[#10b981]' :
                status === 'running' ? 'bg-indigo-500/10 border-indigo-500 text-indigo-400 animate-pulse' :
                'bg-slate-900 border-slate-700 text-slate-500'
              }`}>
                {status === 'passed' ? <CheckCircle2 size={12} /> : index + 1}
              </div>

              {/* Step body */}
              <div className="flex-1 flex flex-col gap-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <strong className="text-xs text-slate-200 truncate">{step.label}</strong>
                  <span className={`text-[9px] uppercase font-bold tracking-wider font-mono px-1.5 py-0.5 rounded ${
                    status === 'passed' ? 'bg-[#10b981]/10 text-[#10b981]' :
                    status === 'running' ? 'bg-indigo-500/10 text-indigo-400 animate-pulse' :
                    'bg-slate-900 text-slate-500'
                  }`}>
                    {status}
                  </span>
                </div>
                <code className="bg-slate-950 px-2 py-1 rounded text-indigo-300 text-[10px] font-mono select-all truncate border border-[#1e293b]/40 w-fit max-w-full">
                  $ {step.command}
                </code>
                <p className="text-[11px] text-slate-400 m-0 leading-relaxed font-sans">{step.detail}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
