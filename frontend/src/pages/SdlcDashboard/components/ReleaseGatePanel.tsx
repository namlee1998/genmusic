import { useState } from 'react';
import type { WorkflowStatus } from '@/store/useSdlcStore';

type ReleaseDecision = 'APPROVE' | 'REJECT';

interface Props {
  releaseGate: NonNullable<WorkflowStatus['releaseGate']>;
  onDecide: (decision: ReleaseDecision, comment: string) => Promise<void>;
}

const STATUS_COPY = {
  released: {
    title: 'Released',
    description: 'The final reviewer approved this QA result. The release is ready.',
  },
  rejected: {
    title: 'Rejected',
    description: 'The final reviewer rejected this release. The QA output remains available in Outputs and Audit.',
  },
} as const;

export default function ReleaseGatePanel({ releaseGate, onDecide }: Props) {
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState<ReleaseDecision | null>(null);
  const [error, setError] = useState<string | null>(null);
  const settled = releaseGate.status === 'released' || releaseGate.status === 'rejected';
  const statusCopy = releaseGate.status === 'pending' ? null : STATUS_COPY[releaseGate.status];
  const evidence = releaseGate.evidence;

  const submit = async (decision: ReleaseDecision) => {
    setLoading(decision);
    setError(null);
    try {
      await onDecide(decision, comment);
      setComment('');
    } catch (requestError) {
      const message = (requestError as { response?: { data?: { message?: string } } })?.response?.data?.message
        || (requestError as Error).message
        || 'Could not save the release decision.';
      setError(message);
    } finally {
      setLoading(null);
    }
  };

  return (
    <section className={`release-gate release-gate--${releaseGate.status}`}>
      <div className="release-gate__copy">
        <p>Final human-in-the-loop gate</p>
        <h2>{statusCopy?.title || 'All done! Please accept to release.'}</h2>
        <span>{statusCopy?.description || 'QA passed. Review the final result and choose the release outcome.'}</span>
      </div>

      {evidence && (
        <div className="release-evidence">
          <strong>Release evidence review</strong>
          {(() => {
            const feature = typeof evidence.feature === 'string'
              ? evidence.feature
              : evidence.feature?.title;
            return feature ? <p className="release-evidence__feature">{feature}</p> : null;
          })()}
          <div className="release-evidence__grid">
            <span>Risk</span><b>{evidence.risk?.level || 'N/A'} {(evidence.risk?.tags || []).join(', ')}</b>
            <span>Sandbox</span><b>{evidence.sandbox_result?.build_ok && evidence.sandbox_result?.tests_ran ? 'PASS' : 'HOLD'}</b>
            <span>Security gate</span><b>{evidence.security_gate?.recommendation || 'N/A'}</b>
            <span>QA gate</span><b>{evidence.qa_gate || 'N/A'}</b>
            <span>Coverage</span><b>{evidence.coverage_percentage ?? 'N/A'}%</b>
            <span>Open blockers</span><b>{evidence.open_blockers?.length || 0}</b>
          </div>

          {evidence.versions && (
            <div className="release-evidence__versions">
              {(['po', 'ux', 'dev', 'qa'] as const).map((stage) => {
                const v = evidence.versions?.[stage];
                return (
                  <span key={stage} className="release-evidence__version">
                    {stage.toUpperCase()} {v ? `v${v.output_version ?? 0}` : '—'}
                  </span>
                );
              })}
            </div>
          )}

          {!!evidence.open_blockers?.length && (
            <ul className="release-evidence__blockers">
              {evidence.open_blockers.map((blocker, i) => (
                <li key={`${blocker.code || 'blocker'}:${i}`} className={`release-evidence__blocker release-evidence__blocker--${(blocker.severity || 'high').toLowerCase()}`}>
                  <span>{blocker.severity || 'HIGH'}</span>
                  <small>{blocker.detail || blocker.code}</small>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {!settled && (
        <>
          <textarea
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder="Optional final review note"
            rows={2}
          />
          <div className="release-gate__actions">
            <button className="release-gate__approve" disabled={!releaseGate.canDecide || !!loading || releaseGate.approvalBlocked} onClick={() => void submit('APPROVE')}>
              {loading === 'APPROVE' ? 'Releasing...' : 'Approve release'}
            </button>
            <button className="release-gate__reject" disabled={!releaseGate.canDecide || !!loading} onClick={() => void submit('REJECT')}>
              {loading === 'REJECT' ? 'Rejecting...' : 'Reject'}
            </button>
          </div>
          {!releaseGate.canDecide && <small>Your role is {releaseGate.reviewerRole || 'viewer'}. Ask a project owner or admin to make the final release decision.</small>}
          {releaseGate.approvalBlocked && <small>Approve is locked until critical and high-risk evidence blockers are resolved.</small>}
        </>
      )}

      {error && <div className="release-gate__error">{error}</div>}
    </section>
  );
}
