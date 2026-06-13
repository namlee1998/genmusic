import React from 'react';
import { useSdlcStore } from '@/store/useSdlcStore';
import { CheckCircle2, XCircle, ShieldCheck, GitPullRequest, ShieldAlert } from 'lucide-react';

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
    <div 
      data-gate-id="gate-release-mock"
      className={`mx-[18px] my-4 p-5 rounded-lg bg-gradient-to-br from-[#10b981]/3 to-[#0d0e13]/98 border shadow-[0_10px_30px_rgba(0,0,0,0.25)] flex flex-col gap-4 ${isApproved ? 'border-emerald-500/35 shadow-[0_10px_30px_rgba(16,185,129,0.05)]' : isRejected ? 'border-red-500' : 'border-[#1e293b]'}`} 
    >
      <div className="flex items-center gap-2.5 border-b border-[#1e293b] pb-3">
        <GitPullRequest className={isApproved ? "text-emerald-500" : isRejected ? "text-red-500" : "text-indigo-400"} size={20} />
        <h3 className="text-base font-bold text-white m-0">
          {isApproved ? 'Release Deployment Active' : isRejected ? 'Release Deployment Rejected' : 'Final Production Release Decision'}
        </h3>
      </div>

      <div className="flex flex-col gap-4">
        {isApproved && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-emerald-400 text-[13px] font-bold">
              <CheckCircle2 size={16} />
              <span>RELEASE MERGED & DEPLOYED SUCCESSFUL</span>
            </div>
            <p className="m-0 text-[12px] text-slate-300">
              The release branch has been merged into <code>main</code> and deployed to target staging environment.
            </p>
            <div className="bg-black/40 border border-[#1e293b] rounded-lg p-3 mt-2">
              <div className="flex justify-between text-[12px] py-1">
                <span className="text-slate-400">Target Release Branch:</span>
                <span className="text-white font-mono">aifa/google-oauth-release</span>
              </div>
              <div className="flex justify-between text-[12px] py-1">
                <span className="text-slate-400">Commit Head:</span>
                <span className="text-white font-mono">{qaResult?.commitSha || '9ef34ddf7e8a91b'}</span>
              </div>
            </div>
          </div>
        )}

        {isRejected && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-red-300 text-[13px] font-bold">
              <XCircle size={16} />
              <span>RELEASE PIPELINE CANCELED</span>
            </div>
            <p className="m-0 text-[12px] text-slate-300">
              This release was rejected by the project manager. The codebase has rolled back and temporary resources were cleaned up.
            </p>
          </div>
        )}

        {isPending && (
          <>
            <div className="text-[13px] text-slate-300 leading-normal">
              <p className="m-0 mb-2.5">
                All agent pipelines and code checks completed. Please review the final quality ledger before merging:
              </p>
              
              <div className="bg-black/40 border border-[#1e293b] rounded-lg p-3">
                <div className="flex justify-between text-[12px] py-1">
                  <span className="text-slate-400">QA Audit Status:</span>
                  <span className="text-white font-mono font-bold" style={{ color: qaPassed ? '#34d399' : '#fca5a5' }}>
                    {qaPassed ? 'PASSED ✅' : 'FAILED ❌'}
                  </span>
                </div>
                <div className="flex justify-between text-[12px] py-1">
                  <span className="text-slate-400">Unit Code Coverage:</span>
                  <span className="text-white font-mono text-emerald-400 font-bold">{qaResult?.coverage || 0}%</span>
                </div>
                <div className="flex justify-between text-[12px] py-1">
                  <span className="text-slate-400">Vulnerability Blockers:</span>
                  <span className="text-white font-mono font-bold" style={{ color: hasBlockers ? '#fca5a5' : '#ffffff' }}>
                    {qaResult?.blockers || 0} critical blockers
                  </span>
                </div>
                <div className="flex justify-between text-[12px] py-1">
                  <span className="text-slate-400">Build Commit SHA:</span>
                  <span className="text-white font-mono">{qaResult?.commitSha.slice(0, 7)}</span>
                </div>
              </div>
            </div>

            {hasBlockers && (
              <div className="flex items-center gap-2 bg-red-500/8 border border-red-500/20 rounded-md p-2.5 text-[11px] text-red-300">
                <ShieldAlert size={16} />
                <span>Approval blocked due to outstanding critical QA blockers or failed security checks.</span>
              </div>
            )}

            <div className="flex justify-end gap-2.5">
              <button
                type="button"
                className="bg-red-600/90 text-white rounded-md px-4 py-2 hover:bg-red-600 transition-colors flex items-center justify-center font-bold text-[13px] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed gap-1.5"
                disabled={isLoading}
                onClick={() => handleDecision('reject')}
              >
                <XCircle size={14} />
                <span>Reject & Rollback</span>
              </button>
              <button
                type="button"
                className="bg-emerald-600/90 text-white rounded-md px-4 py-2 hover:bg-emerald-600 transition-colors flex items-center justify-center font-bold text-[13px] disabled:opacity-50 disabled:cursor-not-allowed gap-1.5"
                disabled={!canApprove}
                onClick={() => handleDecision('approve')}
                style={{ cursor: canApprove ? 'pointer' : 'not-allowed' }}
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
