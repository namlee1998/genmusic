import React, { useState } from 'react';
import { useSdlcStore } from '@/store/useSdlcStore';
import { CheckCircle2, AlertTriangle, Eye, ShieldAlert, Award, ArrowRight } from 'lucide-react';

interface QAResultCardProps {
  onViewDetail: (type: 'prd' | 'ux_spec' | 'code_diff' | 'qa_report') => void;
}

export default function QAResultCard({ onViewDetail }: QAResultCardProps) {
  const { qaResult, pipelineStatus } = useSdlcStore();
  const [released, setReleased] = useState(false);

  if (pipelineStatus !== 'qa_complete' || !qaResult) return null;

  const handleRelease = () => {
    setReleased(true);
  };

  return (
    <div className="qa-result-card">
      <div className="qa-result-card__header">
        <Award size={20} className="text-emerald-500" />
        <h3>Quality Assurance Verification</h3>
      </div>
      
      <div className="qa-result-card__content">
        <div className="qa-result-status-row">
          <div className="qa-status-indicator">
            <CheckCircle2 className="text-emerald-500" size={36} />
            <div>
              <span className="status-title text-emerald-500">AUDIT PASSED</span>
              <span className="status-subtext">Commit: {qaResult.commitSha}</span>
            </div>
          </div>
          
          <div className="qa-coverage-gauge">
            <span className="coverage-value">{qaResult.coverage}%</span>
            <span className="coverage-label">Code Coverage</span>
          </div>
        </div>

        <div className="qa-metrics-grid">
          <div className="qa-metric-box">
            <ShieldAlert size={18} className="text-emerald-500" />
            <div className="metric-details">
              <span className="label">Blockers</span>
              <strong className="value">{qaResult.blockers}</strong>
            </div>
          </div>
          
          <div className="qa-metric-box">
            <AlertTriangle size={18} className="text-amber-500" />
            <div className="metric-details">
              <span className="label">Warnings</span>
              <strong className="value text-amber-500">{qaResult.warnings}</strong>
            </div>
          </div>
        </div>

        <div className="qa-artifact-banner">
          <CheckCircle2 size={16} className="text-emerald-500" />
          <p>
            <strong>QA.md</strong> report was compiled and committed into target repository local workspace.
          </p>
        </div>

        <div className="qa-result-card__actions">
          <button
            onClick={() => onViewDetail('qa_report')}
            className="btn-secondary"
          >
            <Eye size={14} /> View QA.md Report
          </button>
          
          {released ? (
            <div className="release-success-message">
              <CheckCircle2 size={16} className="text-emerald-500" />
              <span>Project successfully released!</span>
            </div>
          ) : (
            <button
              onClick={handleRelease}
              className="btn-success"
            >
              Approve Release <ArrowRight size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
