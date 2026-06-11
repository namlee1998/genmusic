import { ArrowRight } from 'lucide-react';
import type { PhaseTransition } from '@/store/useSdlcStore';

const fmtTime = (iso: string) => {
  try { return new Date(iso).toLocaleTimeString(); } catch { return iso; }
};

const toneFor = (to: string): string => {
  if (/FAILED|REJECTED|INVALID|MAX_RETRY/.test(to)) return 'danger';
  if (/RELEASED|APPROVED|HANDOFF/.test(to)) return 'success';
  if (/REVIEW|HOLD|DRAFTED/.test(to)) return 'warn';
  return 'info';
};

/**
 * I3: renders the synthesized PHASE_TRANSITION chain (from → to, with cause)
 * from the audit trail, so the run's state changes are visible at a glance.
 */
export default function PhaseTransitionStrip({ transitions }: { transitions: PhaseTransition[] }) {
  if (!transitions?.length) {
    return <div className="phase-strip__empty">No phase transitions recorded yet.</div>;
  }
  return (
    <ol className="phase-strip">
      {transitions.map((t, i) => (
        <li key={`${t.at}-${i}`} className={`phase-strip__item phase-strip__item--${toneFor(t.to)}`}>
          <div className="phase-strip__states">
            <span className="phase-strip__from">{t.from}</span>
            <ArrowRight size={13} className="phase-strip__arrow" />
            <span className="phase-strip__to">{t.to}</span>
          </div>
          <div className="phase-strip__meta">
            <span className="phase-strip__cause">{t.cause}</span>
            {t.agent && <span className="phase-strip__agent">{t.agent}</span>}
            <span className="phase-strip__time">{fmtTime(t.at)}</span>
          </div>
        </li>
      ))}
    </ol>
  );
}
