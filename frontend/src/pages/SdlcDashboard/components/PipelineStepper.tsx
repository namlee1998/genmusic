import React from 'react';
import { useSdlcStore, type PipelineStatus } from '@/store/useSdlcStore';
import { Check, Loader2, AlertCircle, Clock, PlayCircle } from 'lucide-react';

interface StepInfo {
  index: number;
  title: string;
  description: string;
}

const STEPS: StepInfo[] = [
  { index: 1, title: 'Clone & Analyze', description: 'Repository source retrieval and scanning' },
  { index: 2, title: 'Product (PO)', description: 'PRD document and user stories generation' },
  { index: 3, title: 'Design (UX)', description: 'Design assets and layout specification' },
  { index: 4, title: 'Build (DEV)', description: 'Code implementation and unified patching' },
  { index: 5, title: 'Sandbox Gate', description: 'Docker local sandbox automated testing' },
  { index: 6, title: 'QA Audit', description: 'Agent validation and final QA report creation' }
];

export default function PipelineStepper() {
  const { pipelineStatus, currentStep } = useSdlcStore();

  const getStepState = (stepIndex: number): 'pending' | 'running' | 'awaiting_approval' | 'complete' | 'failed' => {
    if (pipelineStatus === 'idle') return 'pending';
    if (pipelineStatus === 'failed' && stepIndex === currentStep) return 'failed';
    if (pipelineStatus === 'qa_complete') return 'complete';

    if (stepIndex < currentStep) return 'complete';
    if (stepIndex === currentStep) {
      if (pipelineStatus === 'awaiting_approval') return 'awaiting_approval';
      return 'running';
    }
    return 'pending';
  };

  const getStepIcon = (state: string) => {
    switch (state) {
      case 'complete':
        return <Check size={16} className="text-emerald-500" />;
      case 'running':
        return <Loader2 size={16} className="animate-spin text-blue-500" />;
      case 'awaiting_approval':
        return <Clock size={16} className="text-amber-500" />;
      case 'failed':
        return <AlertCircle size={16} className="text-rose-500" />;
      default:
        return <PlayCircle size={16} className="text-gray-500" />;
    }
  };

  const getStepClass = (state: string) => {
    switch (state) {
      case 'complete':
        return 'is-complete';
      case 'running':
        return 'is-running';
      case 'awaiting_approval':
        return 'is-awaiting-approval';
      case 'failed':
        return 'is-failed';
      default:
        return 'is-pending';
    }
  };

  if (pipelineStatus === 'idle') return null;

  return (
    <div className="pipeline-stepper-card">
      <div className="pipeline-stepper-card__header">
        <h3>SDLC Execution Pipeline</h3>
        <span className={`status-badge status-badge--${pipelineStatus}`}>
          {pipelineStatus.replace('_', ' ').toUpperCase()}
        </span>
      </div>
      <div className="pipeline-stepper-card__body">
        <div className="stepper-timeline">
          {STEPS.map((step) => {
            const state = getStepState(step.index);
            return (
              <div key={step.index} className={`stepper-node ${getStepClass(state)}`}>
                <div className="stepper-node__icon-container">
                  {getStepIcon(state)}
                </div>
                <div className="stepper-node__content">
                  <span className="stepper-node__title">{step.title}</span>
                  <p className="stepper-node__desc">{step.description}</p>
                </div>
                {step.index < STEPS.length && <div className="stepper-node__connector" />}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
