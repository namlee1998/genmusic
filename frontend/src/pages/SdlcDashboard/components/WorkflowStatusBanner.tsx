import { AlertTriangle, PauseCircle, Lock, CheckCircle2, XCircle } from 'lucide-react';
import type { WorkflowStatus } from '@/store/useSdlcStore';

type Tone = 'danger' | 'warn' | 'info' | 'success';

const PHASE_LABEL: Record<string, string> = { po: 'PO', ux: 'UX', dev: 'DEV', qa: 'QA' };

interface Banner {
  tone: Tone;
  icon: React.ReactNode;
  title: string;
  detail?: string;
}

function deriveBanner(ws: WorkflowStatus): Banner | null {
  const phases = ws.phases || {};
  const entries = Object.entries(phases) as Array<[string, WorkflowStatus['phases']['po']]>;

  // 1. A failed worker is the most urgent.
  const failed = entries.find(([, p]) => p?.status === 'failed');
  if (failed) {
    return { tone: 'danger', icon: <XCircle size={16} />, title: `${PHASE_LABEL[failed[0]]} worker failed`, detail: 'Open the worker error for the code and requestId.' };
  }

  // 2. An INVALID output blocks the handoff.
  const invalid = entries.find(([, p]) => p?.invalid);
  if (invalid) {
    return {
      tone: 'danger',
      icon: <AlertTriangle size={16} />,
      title: `${PHASE_LABEL[invalid[0]]} output is INVALID`,
      detail: 'Blocking validation issues — no handoff is emitted and the phase will not advance until they are fixed.',
    };
  }

  // 3. Release locked by open blockers.
  if (ws.releaseGate?.approvalBlocked) {
    return { tone: 'danger', icon: <Lock size={16} />, title: 'Release is LOCKED', detail: 'Resolve the critical / high-severity blockers before the release can be approved.' };
  }

  // 4. Terminal release states.
  if (ws.currentPhase === 'RELEASED') {
    return { tone: 'success', icon: <CheckCircle2 size={16} />, title: 'Released', detail: 'The final release gate was approved.' };
  }
  if (ws.currentPhase === 'RELEASE_REJECTED') {
    return { tone: 'danger', icon: <XCircle size={16} />, title: 'Release rejected', detail: 'The final release gate was rejected.' };
  }

  // 5. A worker is on HOLD waiting for human review.
  const review = ws.currentPhase?.match(/^(PO|UX|DEV|QA)_REVIEW$/)?.[1]?.toLowerCase();
  if (review && phases[review as keyof typeof phases]?.awaitingReview) {
    return { tone: 'warn', icon: <PauseCircle size={16} />, title: `${PHASE_LABEL[review]} is on HOLD`, detail: 'Confidence or validation needs a human decision. Review the output, then approve or send feedback.' };
  }

  return null;
}

export default function WorkflowStatusBanner({ workflowStatus }: { workflowStatus: WorkflowStatus }) {
  const banner = deriveBanner(workflowStatus);
  if (!banner) return null;
  return (
    <div className={`wf-banner wf-banner--${banner.tone}`} role="status">
      <span className="wf-banner__icon">{banner.icon}</span>
      <div className="wf-banner__text">
        <strong>{banner.title}</strong>
        {banner.detail && <span>{banner.detail}</span>}
      </div>
    </div>
  );
}
