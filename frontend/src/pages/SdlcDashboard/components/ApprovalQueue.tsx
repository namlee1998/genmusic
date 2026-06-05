import React from 'react';
import { useSdlcStore } from '@/store/useSdlcStore';
import { Shield, CheckCircle, XCircle, Eye, AlertTriangle } from 'lucide-react';

interface ApprovalQueueProps {
  onViewDetail: (type: 'prd' | 'ux_spec' | 'code_diff' | 'qa_report') => void;
}

export default function ApprovalQueue({ onViewDetail }: ApprovalQueueProps) {
  const { approvals, approveItem, isLoading } = useSdlcStore();

  const pendingItems = approvals.filter(item => !item.approved);

  if (pendingItems.length === 0) return null;

  const getConfidenceColor = (score: number) => {
    if (score >= 80) return 'text-emerald-500';
    if (score >= 60) return 'text-amber-500';
    return 'text-rose-500';
  };

  return (
    <div className="approval-queue-card">
      <div className="approval-queue-card__header">
        <Shield size={20} className="text-blue-500" />
        <h3>Pending Approvals Queue ({pendingItems.length})</h3>
      </div>
      <div className="approval-queue-card__body">
        {pendingItems.map((item) => (
          <div key={item.id} className="approval-item-card">
            <div className="approval-item-card__title-row">
              <span className="agent-badge">🤖 {item.agentName} Agent</span>
              <span className="artifact-type-badge">{item.artifactType.toUpperCase()}</span>
            </div>
            
            <div className="approval-item-card__confidence-row">
              <div className="confidence-label">
                <span>Confidence Score:</span>
                <strong className={getConfidenceColor(item.confidence)}>{item.confidence}%</strong>
              </div>
              {item.confidence < 80 && (
                <span className="confidence-warning">
                  <AlertTriangle size={14} className="text-amber-500" /> Confidence &lt; 80% (Requires human audit)
                </span>
              )}
            </div>

            <p className="approval-item-card__summary">{item.summary}</p>

            <div className="approval-item-card__actions">
              <button
                onClick={() => onViewDetail(item.artifactType)}
                className="btn-secondary"
                disabled={isLoading}
              >
                <Eye size={14} /> View Details
              </button>
              <div className="approval-item-card__decision-buttons">
                <button
                  onClick={() => approveItem(item.id, 'approve')}
                  className="btn-success"
                  disabled={isLoading}
                >
                  <CheckCircle size={14} /> Approve
                </button>
                <button
                  onClick={() => approveItem(item.id, 'reject')}
                  className="btn-danger"
                  disabled={isLoading}
                >
                  <XCircle size={14} /> Reject
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
