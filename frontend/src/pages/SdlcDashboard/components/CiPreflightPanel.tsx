import { CheckCircle2, GitPullRequest, Play, RotateCcw, ShieldCheck } from 'lucide-react';
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
    <section className="ci-panel" aria-label="Mock CI preflight">
      <div className="ci-panel__header">
        <div>
          <p><GitPullRequest size={14} /> GitHub Actions mock</p>
          <h3>backend tests + demo preflight</h3>
          <span>Pull request gate for backend orchestration, schema drift, and demo smoke.</span>
        </div>
        <button type="button" onClick={rerun} className="ci-panel__run">
          {complete ? <RotateCcw size={15} /> : <Play size={15} />}
          {complete ? 'Rerun mock CI' : 'Running'}
        </button>
      </div>

      <div className={`ci-panel__summary ${complete ? 'ci-panel__summary--pass' : ''}`}>
        <ShieldCheck size={16} />
        <div>
          <strong>{complete ? 'Merge gate passed' : 'CI gate is running'}</strong>
          <span>
            {complete
              ? `All checks passed in ${totalDuration}s. This branch would be mergeable.`
              : 'A failing step would turn the workflow red and block merge.'}
          </span>
        </div>
      </div>

      <ol className="ci-steps">
        {CI_STEPS.map((step, index) => {
          const status = statusFor(index, activeIndex, complete);
          return (
            <li key={`${runKey}-${step.id}`} className={`ci-step ci-step--${status}`}>
              <div className="ci-step__marker">
                {status === 'passed' ? <CheckCircle2 size={14} /> : index + 1}
              </div>
              <div className="ci-step__body">
                <div className="ci-step__top">
                  <strong>{step.label}</strong>
                  <span>{status}</span>
                </div>
                <code>{step.command}</code>
                <p>{step.detail}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
