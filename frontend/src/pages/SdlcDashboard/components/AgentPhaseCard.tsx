import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
  onGateDecision?: (decision: 'APPROVE' | 'REJECT' | 'REQUEST_CHANGES', comment: string) => Promise<void>;
}

// ── Real-time Elapsed Timer for Quality Gates ─────────────────────────────
function ElapsedTimer({ startTime }: { startTime: string }) {
  const [elapsed, setElapsed] = useState('');

  useEffect(() => {
    const start = new Date(startTime).getTime();
    const update = () => {
      const diff = Math.max(0, Date.now() - start);
      const secs = Math.floor(diff / 1000) % 60;
      const mins = Math.floor(diff / 60000) % 60;
      const hours = Math.floor(diff / 3600000);
      let str = '';
      if (hours > 0) str += `${hours}h `;
      if (mins > 0 || hours > 0) str += `${mins}m `;
      str += `${secs}s`;
      setElapsed(str);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  return <span>{elapsed}</span>;
}

function statusBadge(status: string | null, isWaitingGate: boolean) {
  if (isWaitingGate) {
    return (
      <span className="badge badge-waiting-gate flex items-center gap-1">
        <span className="animate-pulse">⏳</span> Awaiting Gate
      </span>
    );
  }
  if (!status) return <span className="badge badge-idle">Idle</span>;
  const map: Record<string, string> = {
    pending: 'badge-pending',
    processing: 'badge-running',
    completed: 'badge-done',
    failed: 'badge-error',
  };
  return <span className={`badge ${map[status] || 'badge-idle'}`}>{status}</span>;
}

export default function AgentPhaseCard({
  phase,
  phaseData,
  isUnlocked,
  isActive,
  sseLogs,
  onRun,
  onOpenGate,
  onViewArtifacts,
  onGateDecision,
}: Props) {
  const decision = phaseData?.hitlDecision?.decision;
  const isCompleted = phaseData?.status === 'completed';
  const isApproved = decision === 'APPROVE';
  const isRejected = decision === 'REJECT' || decision === 'REQUEST_CHANGES';
  const canRun = isUnlocked && !isActive;

  // Trạng thái chờ Quality Gate (đã hoàn thành nhưng chưa được duyệt hoặc từ chối)
  const isWaitingGate = isCompleted && !isApproved && !isRejected;

  // Trạng thái cho inline HITL action panel
  const [inlineAction, setInlineAction] = useState<'APPROVE' | 'REJECT' | 'REQUEST_CHANGES' | null>(null);
  const [commentText, setCommentText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset inline action panel when phaseData changes (run during rendering to avoid useEffect setState warning)
  const [prevStatus, setPrevStatus] = useState(phaseData?.status);
  const [prevUpdatedAt, setPrevUpdatedAt] = useState(phaseData?.updatedAt);
  if (phaseData?.status !== prevStatus || phaseData?.updatedAt !== prevUpdatedAt) {
    setPrevStatus(phaseData?.status);
    setPrevUpdatedAt(phaseData?.updatedAt);
    setInlineAction(null);
    setCommentText('');
    setIsSubmitting(false);
  }

  const handleInlineSubmit = async () => {
    if (!inlineAction || !onGateDecision) return;
    setIsSubmitting(true);
    try {
      await onGateDecision(inlineAction, commentText);
      setInlineAction(null);
      setCommentText('');
    } catch (err) {
      console.error('Failed to submit inline gate decision:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <motion.div
      className={`phase-card ${isActive ? 'phase-card--active' : ''} ${
        isApproved ? 'phase-card--approved' : ''
      } ${isRejected ? 'phase-card--rejected' : ''} ${
        !isUnlocked ? 'phase-card--locked' : ''
      } ${isWaitingGate ? 'phase-card--waiting' : ''}`}
      style={{ '--phase-color': phase.color } as React.CSSProperties}
      whileHover={isUnlocked ? { y: -2 } : {}}
      transition={{ type: 'spring', stiffness: 300 }}
    >
      {/* Header */}
      <div className="phase-card__header">
        <div className="phase-card__icon">{!isUnlocked ? '🔒' : phase.icon}</div>
        <div>
          <div className="phase-card__label">{phase.label}</div>
          <div className="phase-card__gate">
            <span style={{ color: '#a5b4fc', fontWeight: 'bold' }}>
              {phase.key === 'intent' || phase.key === 'po'
                ? 'G1'
                : phase.key === 'ux'
                ? 'G2'
                : phase.key === 'dev'
                ? 'G3'
                : 'G4'}
            </span>{' '}
            {phase.gate.replace('_', ' ')}
          </div>
        </div>
        <div className="phase-card__status">
          {statusBadge(phaseData?.status || null, isWaitingGate)}
          {isApproved && <span className="badge badge-approved">✓ Approved</span>}
          {isRejected && <span className="badge badge-rejected">↩ Rework</span>}
        </div>
      </div>

      {/* SSE Log stream */}
      {isActive && sseLogs.length > 0 && (
        <div className="phase-card__log">
          <div className="phase-card__log-inner">
            {sseLogs.slice(-5).map((log, i) => (
              <div key={i} className="phase-card__log-line">
                {typeof log === 'string' && log.length > 0 ? log : '...'}
              </div>
            ))}
            <div className="phase-card__log-cursor" />
          </div>
        </div>
      )}

      {/* Running pulse indicator */}
      {isActive && (
        <div className="phase-card__running">
          <motion.div
            className="phase-card__pulse"
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ duration: 1.2, repeat: Infinity }}
          />
          <span>Agent running…</span>
        </div>
      )}

      {/* Elapsed wait time when waiting gate */}
      {isWaitingGate && phaseData?.updatedAt && (
        <div className="phase-card__waiting-timer text-[10px] text-on-surface-variant flex items-center gap-1 px-3 py-1 bg-surface-container/60 border border-outline-variant/10 rounded mt-2">
          <span className="material-symbols-outlined text-[12px]">schedule</span>
          <span>Waiting duration:</span>
          <span className="font-semibold text-primary">
            <ElapsedTimer startTime={phaseData.updatedAt} />
          </span>
        </div>
      )}

      {/* HITL decision indicator (saved) */}
      {phaseData?.hitlDecision && !isWaitingGate && (
        <div className="phase-card__decision">
          <span>{decision === 'APPROVE' ? '✅' : decision === 'REJECT' ? '❌' : '🔄'}</span>
          <span>{decision}</span>
          {phaseData.hitlDecision.comment && (
            <span className="phase-card__comment">&quot;{phaseData.hitlDecision.comment}&quot;</span>
          )}
        </div>
      )}

      {/* Inline HITL Panel (Task 2.1) */}
      <AnimatePresence>
        {isWaitingGate && inlineAction && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="inline-hitl-panel bg-surface-container border border-outline-variant/30 rounded p-3 mt-3 flex flex-col gap-2"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
                Confirm {inlineAction.replace('_', ' ')}
              </span>
              <button
                onClick={() => setInlineAction(null)}
                className="text-[10px] text-on-surface-variant hover:text-on-surface"
              >
                Cancel
              </button>
            </div>
            
            {inlineAction === 'REQUEST_CHANGES' ? (
              <textarea
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="Nhập feedback chi tiết (bắt buộc)..."
                rows={2}
                className="text-[11px] w-full bg-[#050505] border border-outline-variant/30 rounded p-1.5 text-on-surface focus:outline-none focus:border-primary"
              />
            ) : (
              <input
                type="text"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="Nhập ghi chú hoặc lý do (không bắt buộc)..."
                className="text-[11px] w-full bg-[#050505] border border-outline-variant/30 rounded p-1.5 text-on-surface focus:outline-none focus:border-primary"
              />
            )}

            <button
              onClick={handleInlineSubmit}
              disabled={isSubmitting || (inlineAction === 'REQUEST_CHANGES' && !commentText.trim())}
              className={`w-full py-1 text-xs font-semibold text-white rounded transition-opacity disabled:opacity-40 ${
                inlineAction === 'APPROVE'
                  ? 'bg-success'
                  : inlineAction === 'REQUEST_CHANGES'
                  ? 'bg-warning'
                  : 'bg-error'
              }`}
            >
              {isSubmitting ? 'Submitting...' : 'Confirm'}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Actions */}
      <div className="phase-card__actions">
        {canRun && !isCompleted && (
          <button className="phase-card__btn phase-card__btn--run" onClick={onRun}>
            ▶ Run {phase.label}
          </button>
        )}
        
        {isWaitingGate && !inlineAction && onGateDecision && (
          <div className="inline-hitl-triggers grid grid-cols-3 gap-1 w-full mt-1.5 mb-1.5">
            <button
              onClick={() => setInlineAction('APPROVE')}
              className="px-1 py-1 rounded bg-success/15 hover:bg-success/25 border border-success/30 text-success text-[10px] font-bold flex items-center justify-center gap-0.5"
              title="Phê duyệt nhanh"
            >
              ✓ Approve
            </button>
            <button
              onClick={() => setInlineAction('REQUEST_CHANGES')}
              className="px-1 py-1 rounded bg-warning/15 hover:bg-warning/25 border border-warning/30 text-warning text-[10px] font-bold flex items-center justify-center gap-0.5"
              title="Yêu cầu thay đổi"
            >
              🔄 Changes
            </button>
            <button
              onClick={() => setInlineAction('REJECT')}
              className="px-1 py-1 rounded bg-error/15 hover:bg-error/25 border border-error/30 text-error text-[10px] font-bold flex items-center justify-center gap-0.5"
              title="Từ chối nhanh"
            >
              ❌ Reject
            </button>
          </div>
        )}

        {isCompleted && !isApproved && (
          <button className="phase-card__btn phase-card__btn--gate" onClick={onOpenGate}>
            🔍 Review & Gate
          </button>
        )}
        {isCompleted && (
          <button className="phase-card__btn phase-card__btn--view" onClick={onViewArtifacts}>
            📄 View Artifacts
          </button>
        )}
        {isApproved && !isActive && (
          <button className="phase-card__btn phase-card__btn--rerun" onClick={onRun} title="Run again">
            🔄 Re-run
          </button>
        )}
        {isRejected && !isActive && (
          <button className="phase-card__btn phase-card__btn--rerun" onClick={onRun} title="Apply fixes and re-run">
            ↺ Rework
          </button>
        )}
      </div>
    </motion.div>
  );
}
