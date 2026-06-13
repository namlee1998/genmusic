import React, { useState } from 'react';
import { useSdlcStore } from '@/store/useSdlcStore';
import DiffViewer from './DiffViewer';
import { ShieldAlert, HelpCircle, Check, X, FileText, Lock } from 'lucide-react';
import { GateItem } from '@/services/api/sdlcApi';

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
  activeGate: GateItem;
  resolveGate: (gateId: string, action: 'approve' | 'reject', comment?: string) => Promise<any>;
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
      className={`mx-[18px] my-4 p-5 rounded-lg bg-gradient-to-br from-[#30293b]/10 to-[#0d0e13]/98 border transition-all duration-300 ease-in-out ${activeGate.status !== 'PENDING' ? 'border-[#1e293b] shadow-[0_10px_30px_rgba(0,0,0,0.25)]' : 'border-red-500 shadow-[0_10px_30px_rgba(239,68,68,0.08)]'}`}
    >
      <div className="flex items-center justify-between border-b border-[#1e293b] pb-3 mb-4">
        <div className="flex items-center gap-2">
          {activeGate.type === 'DEV_FILE_GATE' ? (
            <>
              <ShieldAlert className="text-red-500" size={20} />
              <h3 className="flex items-center gap-2.5 text-white text-base font-bold m-0">Security Governance Gate</h3>
            </>
          ) : (
            <>
              <HelpCircle className="text-amber-500" size={20} />
              <h3 className="flex items-center gap-2.5 text-white text-base font-bold m-0">Product Requirements Gate</h3>
            </>
          )}
        </div>
        <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${activeGate.type === 'DEV_FILE_GATE' ? 'bg-red-500/10 border-red-500/30 text-red-300' : 'bg-amber-500/10 border-amber-500/30 text-amber-300'}`}>
          {activeGate.type === 'DEV_FILE_GATE' ? 'DEV RISK GATE (A)' : 'PO CLARIFY GATE (B)'}
        </span>
      </div>

      <div className="flex flex-col gap-3.5">
        {activeGate.type === 'DEV_FILE_GATE' ? (
          // DEV File Risk layout
          <>
            <div className="bg-red-500/3 border border-red-500/15 rounded-lg p-3 text-[13px] text-slate-300 leading-normal">
              <div className="font-bold text-white mb-1 flex items-center gap-1.5">
                <Lock size={14} className="text-red-400" />
                <span>RISK ASSESSMENT TRIGGERED</span>
              </div>
              <p style={{ margin: 0 }}>
                The agent attempted to modify <code className="text-red-300 bg-red-500/10 px-1 py-0.5 rounded">{activeGate.payload.path}</code>. 
                This action is flagged as <strong>{activeGate.payload.reason}</strong> and requires manual code review and human override approval.
              </p>
            </div>
            
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] text-[#908fa0] font-semibold flex items-center gap-1">
                <FileText size={12} />
                CODE PATCH DIFF
              </span>
              <DiffViewer diff={activeGate.payload.diff || ''} fileName={activeGate.payload.path} />
            </div>
          </>
        ) : (
          // PO Clarification layout
          <>
            <div className="bg-amber-500/3 border border-amber-500/15 rounded-lg p-3 text-[13px] text-slate-300 leading-normal">
              <div className="font-bold text-[#fbbf24] mb-1">REQUIREMENTS CLARIFICATION</div>
              <p style={{ margin: 0 }}>
                To create a comprehensive PRD, the PO agent requests choices on the assumptions. 
                Unselected options will assume default behavior.
              </p>
            </div>

            {activeGate.payload.questions?.map((question: string, qIdx: number) => {
              const options = getMockQuestionOptions(question);
              const selectedValue = poAnswers[qIdx] || options[0];

              return (
                <div key={qIdx} className="flex flex-col gap-2 border-l-2 border-slate-600 pl-3">
                  <span className="text-[13px] font-semibold text-[#f8fafc]">
                    Q{qIdx + 1}: {question}
                  </span>
                  <div className="flex flex-col gap-2.5">
                    {options.map((opt, oIdx) => {
                      const isSelected = selectedValue === opt;
                      return (
                        <div 
                          key={oIdx} 
                          className={`flex items-start gap-2.5 bg-black/30 border rounded-lg p-3 cursor-pointer transition-all duration-150 ${isSelected ? 'border-indigo-500 bg-indigo-500/6' : 'border-[#1e293b] hover:border-indigo-500/30 hover:bg-indigo-500/2'}`}
                          onClick={() => handleOptionSelect(qIdx, opt)}
                        >
                          <input 
                            type="radio" 
                            name={`q-${qIdx}`} 
                            checked={isSelected}
                            onChange={() => {}} // Controlled by parent click
                            disabled={isLoading}
                            className="mt-1"
                          />
                          <span className="text-[13px] text-slate-300 leading-snug">{opt}</span>
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
        <div className="flex flex-col gap-1.5">
          <label htmlFor="gate-comment" className="text-[12px] font-semibold text-slate-300">
            {activeGate.type === 'DEV_FILE_GATE' ? 'Review Comments / Feedback' : 'Additional Assumptions / Custom Instructions'}
          </label>
          <textarea
            id="gate-comment"
            placeholder={activeGate.type === 'DEV_FILE_GATE' ? 'Explain why you are approving or what changes need to be made if rejecting...' : 'Write custom requirements here if the choices do not match your specs...'}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            disabled={isLoading}
            className="bg-[#090a0f] border border-[#1e293b] rounded-lg text-[#e3e1e9] text-[13px] px-3 py-2.5 min-h-[70px] resize-y transition-all duration-150 focus:outline-none focus:border-indigo-500"
          />
        </div>

        {/* Action buttons */}
        <div className="flex justify-end gap-2.5 mt-2.5">
          <button
            type="button"
            className="bg-red-600/90 text-white rounded-md px-4 py-2 hover:bg-red-600 transition-colors flex items-center justify-center font-bold text-[13px] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed gap-1.5"
            onClick={() => handleResolve('reject')}
            disabled={isLoading}
          >
            <X size={14} />
            <span>{activeGate.type === 'DEV_FILE_GATE' ? 'Reject & Rerun' : 'Cancel Pipeline'}</span>
          </button>
          <button
            type="button"
            className="bg-emerald-600/90 text-white rounded-md px-4 py-2 hover:bg-emerald-600 transition-colors flex items-center justify-center font-bold text-[13px] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed gap-1.5"
            onClick={() => handleResolve('approve')}
            disabled={isLoading}
          >
            <Check size={14} />
            <span>{activeGate.type === 'DEV_FILE_GATE' ? 'Approve Override' : 'Submit Choices'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
