import React from 'react';
import { useSdlcStore } from '@/store/useSdlcStore';
import { CheckCircle2, XCircle, ShieldCheck, GitPullRequest, ArrowRight, ShieldAlert } from 'lucide-react';

export default function FinalApproval() {
  const { status, qaResult, releaseStatus, releaseDecision, isLoading } = useSdlcStore();

  // Show only when QA has completed or final decision is made
  const showApprovalCard = status === 'qa_complete' || qaResult || releaseStatus === 'approved' || releaseStatus === 'rejected';

  if (!showApprovalCard) return null;

  const handleDecision = async (action: 'approve' | 'reject') => {
    if (confirm(`Are you sure you want to ${action} this release branch for deployment?`)) {
      await releaseDecision(action);
    }
  };

  const isApproved = releaseStatus === 'approved';
  const isRejected = releaseStatus === 'rejected';
  const isPending = !isApproved && !isRejected;

  // Final validation checks
  const hasBlockers = qaResult ? qaResult.blockers > 0 : false;
  const qaPassed = qaResult ? qaResult.status === 'passed' : false;
  const canApprove = qaPassed && !hasBlockers && !isLoading;

  return (
    <div className={`final-approval-card ${isApproved ? 'final-approval-card--active' : ''}`} style={{
      borderColor: isApproved ? '#10b981' : isRejected ? '#ef4444' : '#1e293b'
    }}>
      <div className="final-approval-card__header">
        <GitPullRequest className={isApproved ? "text-emerald-500" : isRejected ? "text-red-500" : "text-indigo-400"} size={20} />
        <h3 className="final-approval-card__title">
          {isApproved ? 'Release Deployment Active' : isRejected ? 'Release Deployment Rejected' : 'Final Production Release Decision'}
        </h3>
      </div>

      <div className="final-approval-card__body">
        {isApproved && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#34d399', fontSize: '13px', fontWeight: 700 }}>
              <CheckCircle2 size={16} />
              <span>RELEASE MERGED & DEPLOYED SUCCESSFUL</span>
            </div>
            <p style={{ margin: 0, fontSize: '12px', color: '#cbd5e1' }}>
              The release branch has been merged into <code>main</code> and deployed to target staging environment.
            </p>
            <div className="final-approval-card__details" style={{ marginTop: '8px' }}>
              <div className="final-approval-card__detail-row">
                <span className="label">Target Release Branch:</span>
                <span className="value">aifa/google-oauth-release</span>
              </div>
              <div className="final-approval-card__detail-row">
                <span className="label">Commit Head:</span>
                <span className="value">{qaResult?.commitSha || '9ef34ddf7e8a91b'}</span>
              </div>
            </div>
          </div>
        )}

        {isRejected && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#fca5a5', fontSize: '13px', fontWeight: 700 }}>
              <XCircle size={16} />
              <span>RELEASE PIPELINE CANCELED</span>
            </div>
            <p style={{ margin: 0, fontSize: '12px', color: '#cbd5e1' }}>
              This release was rejected by the project manager. The codebase has rolled back and temporary resources were cleaned up.
            </p>
          </div>
        )}

        {isPending && (
          <>
            <div className="final-approval-card__info">
              <p style={{ margin: '0 0 10px 0', fontSize: '13px' }}>
                All agent pipelines and code checks completed. Please review the final quality ledger before merging:
              </p>
              
              <div className="final-approval-card__details">
                <div className="final-approval-card__detail-row">
                  <span className="label">QA Audit Status:</span>
                  <span className="value" style={{ color: qaPassed ? '#34d399' : '#fca5a5', fontWeight: 700 }}>
                    {qaPassed ? 'PASSED ✅' : 'FAILED ❌'}
                  </span>
                </div>
                <div className="final-approval-card__detail-row">
                  <span className="label">Unit Code Coverage:</span>
                  <span className="value" style={{ color: '#6ee7b7' }}>{qaResult?.coverage || 0}%</span>
                </div>
                <div className="final-approval-card__detail-row">
                  <span className="label">Vulnerability Blockers:</span>
                  <span className="value" style={{ color: hasBlockers ? '#fca5a5' : '#ffffff' }}>
                    {qaResult?.blockers || 0} critical blockers
                  </span>
                </div>
                <div className="final-approval-card__detail-row">
                  <span className="label">Build Commit SHA:</span>
                  <span className="value">{qaResult?.commitSha.slice(0, 7)}</span>
                </div>
              </div>
            </div>

            {hasBlockers && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                borderRadius: '6px',
                padding: '10px',
                fontSize: '11px',
                color: '#fca5a5'
              }}>
                <ShieldAlert size={16} />
                <span>Approval blocked due to outstanding critical QA blockers or failed security checks.</span>
              </div>
            )}

            <div className="final-approval-card__actions">
              <button
                type="button"
                className="btn-danger"
                disabled={isLoading}
                onClick={() => handleDecision('reject')}
                style={{ gap: '6px' }}
              >
                <XCircle size={14} />
                <span>Reject & Rollback</span>
              </button>
              <button
                type="button"
                className="btn-success"
                disabled={!canApprove}
                onClick={() => handleDecision('approve')}
                style={{ gap: '6px', opacity: canApprove ? 1 : 0.5, cursor: canApprove ? 'pointer' : 'not-allowed' }}
              >
                <ShieldCheck size={14} />
                <span>Approve Release & Deploy</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
