import React, { useState, useEffect } from 'react';
import { useSdlcStore } from '@/store/useSdlcStore';
import DiffViewer from './DiffViewer';
import { ShieldAlert, HelpCircle, Check, X, FileText, Lock } from 'lucide-react';

export default function GatePanel() {
  const { pendingGates, resolveGate, isLoading } = useSdlcStore();
  const activeGate = pendingGates[0];

  if (!activeGate) return null;

  return (
    <GateForm
      key={activeGate.id}
      activeGate={activeGate}
      resolveGate={resolveGate}
      isLoading={isLoading}
    />
  );
}

interface GateFormProps {
  activeGate: any;
  resolveGate: any;
  isLoading: boolean;
}

function GateForm({ activeGate, resolveGate, isLoading }: GateFormProps) {
  const [comment, setComment] = useState('');
  
  // State for PO Clarification answers
  const [poAnswers, setPoAnswers] = useState<Record<number, string>>({});

  const handleResolve = async (action: 'approve' | 'reject') => {
    if (action === 'reject' && !comment.trim()) {
      alert('Please provide a comment explaining the rejection reason.');
      return;
    }

    let finalComment = comment;
    if (activeGate.type === 'PO_CLARIFY') {
      const answersList = Object.entries(poAnswers).map(([idx, val]) => `Q${Number(idx) + 1}: ${val}`);
      finalComment = answersList.length > 0 
        ? `Clarified Questions:\n${answersList.join('\n')}\n\nUser Notes: ${comment}` 
        : comment;
    }

    await resolveGate(activeGate.id, action, finalComment);
  };

  const handleOptionSelect = (qIdx: number, val: string) => {
    setPoAnswers(prev => ({ ...prev, [qIdx]: val }));
  };

  // Pre-configured options based on the mock questions to make it look premium
  const getMockQuestionOptions = (qText: string): string[] => {
    if (qText.includes('branding')) {
      return ['Follow standard Google branding instructions (Default)', 'Implement custom dark branding styling'];
    }
    if (qText.includes('persist')) {
      return ['Persist auth state locally across sessions (Default)', 'Temporary session-only state persistence'];
    }
    if (qText.includes('fallback')) {
      return ['Google OAuth only (Default)', 'Include email & password fallback auth options'];
    }
    return ['Accept default recommendation', 'Request alternative design'];
  };

  return (
    <div 
      data-gate-id={activeGate.id}
      className={`gate-panel-card ${activeGate.status !== 'PENDING' ? 'gate-panel-card--resolved' : ''}`}
    >
      <div className="gate-panel-card__header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {activeGate.type === 'DEV_FILE_GATE' ? (
            <>
              <ShieldAlert className="text-red-500" size={20} />
              <h3 className="gate-panel-card__title">Security Governance Gate</h3>
            </>
          ) : (
            <>
              <HelpCircle className="text-amber-500" size={20} />
              <h3 className="gate-panel-card__title">Product Requirements Gate</h3>
            </>
          )}
        </div>
        <span className={`gate-badge ${activeGate.type === 'DEV_FILE_GATE' ? 'gate-badge--approval' : 'gate-badge--clarify'}`}>
          {activeGate.type === 'DEV_FILE_GATE' ? 'DEV RISK GATE (A)' : 'PO CLARIFY GATE (B)'}
        </span>
      </div>

      <div className="gate-panel-card__body">
        {activeGate.type === 'DEV_FILE_GATE' ? (
          // DEV File Risk layout
          <>
            <div className="gate-info-box">
              <div className="gate-info-box__title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Lock size={14} className="text-red-400" />
                <span>RISK ASSESSMENT TRIGGERED</span>
              </div>
              <p style={{ margin: 0, fontSize: '12px', color: '#cbd5e1' }}>
                The agent attempted to modify <code style={{ color: '#fca5a5', background: 'rgba(239, 68, 68, 0.1)', padding: '2px 4px', borderRadius: '3px' }}>{activeGate.payload.path}</code>. 
                This action is flagged as <strong>{activeGate.payload.reason}</strong> and requires manual code review and human override approval.
              </p>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span style={{ fontSize: '11px', color: '#908fa0', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                <FileText size={12} />
                CODE PATCH DIFF
              </span>
              <DiffViewer diff={activeGate.payload.diff || ''} fileName={activeGate.payload.path} />
            </div>
          </>
        ) : (
          // PO Clarification layout
          <>
            <div className="gate-info-box" style={{ background: 'rgba(245, 158, 11, 0.03)', borderColor: 'rgba(245, 158, 11, 0.15)' }}>
              <div className="gate-info-box__title" style={{ color: '#fbbf24' }}>REQUIREMENTS CLARIFICATION</div>
              <p style={{ margin: 0, fontSize: '12px', color: '#cbd5e1' }}>
                To create a comprehensive PRD, the PO agent requests choices on the assumptions. 
                Unselected options will assume default behavior.
              </p>
            </div>

            {activeGate.payload.questions?.map((question: string, qIdx: number) => {
              const options = getMockQuestionOptions(question);
              const selectedValue = poAnswers[qIdx] || options[0];

              return (
                <div key={qIdx} style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderLeft: '2px solid #334155', paddingLeft: '12px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#f8fafc' }}>
                    Q{qIdx + 1}: {question}
                  </span>
                  <div className="gate-options-container">
                    {options.map((opt, oIdx) => {
                      const isSelected = selectedValue === opt;
                      return (
                        <div 
                          key={oIdx} 
                          className={`gate-option ${isSelected ? 'gate-option--selected' : ''}`}
                          onClick={() => handleOptionSelect(qIdx, opt)}
                        >
                          <input 
                            type="radio" 
                            name={`q-${qIdx}`} 
                            checked={isSelected}
                            onChange={() => {}} // Controlled by parent click
                            disabled={isLoading}
                          />
                          <span className="gate-option__text">{opt}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </>
        )}

        {/* Comment field */}
        <div className="gate-comment-field">
          <label htmlFor="gate-comment">
            {activeGate.type === 'DEV_FILE_GATE' ? 'Review Comments / Feedback' : 'Additional Assumptions / Custom Instructions'}
          </label>
          <textarea
            id="gate-comment"
            placeholder={activeGate.type === 'DEV_FILE_GATE' ? 'Explain why you are approving or what changes need to be made if rejecting...' : 'Write custom requirements here if the choices do not match your specs...'}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            disabled={isLoading}
          />
        </div>

        {/* Action buttons */}
        <div className="gate-actions-row">
          <button
            type="button"
            className="btn-danger"
            onClick={() => handleResolve('reject')}
            disabled={isLoading}
            style={{ gap: '6px' }}
          >
            <X size={14} />
            <span>{activeGate.type === 'DEV_FILE_GATE' ? 'Reject & Rerun' : 'Cancel Pipeline'}</span>
          </button>
          <button
            type="button"
            className="btn-success"
            onClick={() => handleResolve('approve')}
            disabled={isLoading}
            style={{ gap: '6px' }}
          >
            <Check size={14} />
            <span>{activeGate.type === 'DEV_FILE_GATE' ? 'Approve Override' : 'Submit Choices'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
