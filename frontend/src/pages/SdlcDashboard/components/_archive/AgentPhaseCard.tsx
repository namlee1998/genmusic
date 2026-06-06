import { motion } from 'framer-motion';
import type { PhaseStatus } from '@/store/useSdlcStore';

interface PhaseConfig {
  key: string;
  label: string;
  icon: string;
  gate: string;
  color: string;
}

interface Props {
  phase: PhaseConfig;
  phaseData: PhaseStatus | null;
  isUnlocked: boolean;
  isActive: boolean;
  sseLogs: string[];
  onRun: () => void;
  onOpenGate: () => void;
  onViewArtifacts: () => void;
}

function statusBadge(status: string | null) {
  if (!status) return <span className="badge badge-idle">Waiting</span>;
  const classes: Record<string, string> = {
    pending: 'badge-pending',
    processing: 'badge-running',
    completed: 'badge-done',
    failed: 'badge-error',
  };
  return <span className={`badge ${classes[status] || 'badge-idle'}`}>{status}</span>;
}

export default function AgentPhaseCard({ phase, phaseData, isUnlocked, isActive, sseLogs, onRun, onOpenGate, onViewArtifacts }: Props) {
  const decision = phaseData?.hitlDecision?.decision;
  const completed = phaseData?.status === 'completed';
  const approved = decision === 'APPROVE';
  const rework = decision === 'REJECT' || decision === 'REQUEST_CHANGES';
  const canStartRequest = phase.key === 'po' && !phaseData;

  return (
    <motion.div
      className={`phase-card ${isActive ? 'phase-card--active' : ''} ${approved ? 'phase-card--approved' : ''} ${rework ? 'phase-card--rejected' : ''} ${!isUnlocked ? 'phase-card--locked' : ''}`}
      style={{ '--phase-color': phase.color } as React.CSSProperties}
      whileHover={isUnlocked ? { y: -2 } : {}}
    >
      <div className="phase-card__header">
        <div className="phase-card__icon">{isUnlocked ? phase.icon : 'LOCK'}</div>
        <div>
          <div className="phase-card__label">{phase.label}</div>
          <div className="phase-card__gate">{phase.gate.replace('_', ' ')}</div>
        </div>
        <div className="phase-card__status">
          {statusBadge(phaseData?.status || null)}
          {approved && <span className="badge badge-approved">Approved</span>}
          {rework && <span className="badge badge-rejected">Rework</span>}
        </div>
      </div>

      {isActive && (
        <div className="phase-card__running">
          <motion.div className="phase-card__pulse" animate={{ opacity: [1, .3, 1] }} transition={{ duration: 1.2, repeat: Infinity }} />
          <span>Worker is running...</span>
        </div>
      )}

      {isActive && sseLogs.length > 0 && (
        <div className="phase-card__log">
          {sseLogs.slice(-3).map((log, index) => <div key={index} className="phase-card__log-line">{log || '...'}</div>)}
        </div>
      )}

      {phaseData?.hitlDecision && (
        <div className="phase-card__decision">
          <strong>{decision}</strong>
          {phaseData.hitlDecision.comment && <span className="phase-card__comment">&quot;{phaseData.hitlDecision.comment}&quot;</span>}
        </div>
      )}

      <div className="phase-card__actions">
        {isUnlocked && !isActive && !completed && canStartRequest && <button className="phase-card__btn phase-card__btn--run" onClick={onRun}>Submit feature request</button>}
        {completed && !approved && <button className="phase-card__btn phase-card__btn--gate" onClick={onOpenGate}>Review output</button>}
        {completed && <button className="phase-card__btn phase-card__btn--view" onClick={onViewArtifacts}>View outputs</button>}
      </div>
    </motion.div>
  );
}
