import React from 'react';
import { useSdlcStore } from '@/store/useSdlcStore';
import { Check, Loader2, AlertCircle, Clock, PlayCircle, SkipForward } from 'lucide-react';

interface AgentDetails {
  title: string;
  description: string;
}

const AGENT_META: Record<'PO' | 'UX' | 'DEV' | 'QA', AgentDetails> = {
  PO: { title: 'Product Phase (PO)', description: 'Requirement classification, PRD, and risk profiling' },
  UX: { title: 'Design Phase (UX)', description: 'Design layouts, component markup, and wireframe specs' },
  DEV: { title: 'Development Phase (DEV)', description: 'Code modifications, security checks, and sandbox testing' },
  QA: { title: 'Verification Phase (QA)', description: 'Coverage metrics validation, regression test audit, and compliance' }
};

export default function PipelineStepper() {
  const { pipelinePhases, routeType, status } = useSdlcStore();

  const getStepIcon = (phaseStatus: string) => {
    switch (phaseStatus) {
      case 'completed':
        return <Check size={16} className="text-emerald-500" />;
      case 'running':
        return <Loader2 size={16} className="animate-spin text-blue-500" />;
      case 'gate_pending':
        return <Clock size={16} className="text-amber-500" />;
      case 'failed':
        return <AlertCircle size={16} className="text-rose-500" />;
      case 'skipped':
        return <SkipForward size={16} className="text-slate-500" />;
      default:
        return <PlayCircle size={16} className="text-gray-500" />;
    }
  };

  const getStepClass = (phaseStatus: string) => {
    switch (phaseStatus) {
      case 'completed':
        return 'is-complete';
      case 'running':
        return 'is-running';
      case 'gate_pending':
        return 'is-awaiting-approval';
      case 'failed':
        return 'is-failed';
      case 'skipped':
        return 'is-skipped';
      default:
        return 'is-pending';
    }
  };

  if (status === 'idle') return null;

  return (
    <div className="pipeline-stepper-card">
      <div className="pipeline-stepper-card__header" style={{ justifyContent: 'space-between' }}>
        <div>
          <h3>AIFA Execution Route</h3>
          {routeType && (
            <span style={{ fontSize: '11px', color: '#a5b4fc', fontWeight: 600, display: 'block', marginTop: '2px' }}>
              ROUTE TYPE: {routeType}
            </span>
          )}
        </div>
        <span className={`status-badge status-badge--${status}`}>
          {status.replace('_', ' ').toUpperCase()}
        </span>
      </div>
      <div className="pipeline-stepper-card__body">
        <div className="stepper-timeline">
          {pipelinePhases.map((phase, index) => {
            const meta = AGENT_META[phase.agent];
            const stepClass = getStepClass(phase.status);
            
            return (
              <div key={phase.agent} className={`stepper-node ${stepClass}`}>
                <div className="stepper-node__icon-container">
                  {getStepIcon(phase.status)}
                </div>
                <div className="stepper-node__content" style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className="stepper-node__title" style={{ textDecoration: phase.status === 'skipped' ? 'line-through' : 'none' }}>
                      {meta?.title || phase.agent}
                    </span>
                    {phase.duration && (
                      <span style={{ fontSize: '10px', color: '#64748b', fontFamily: 'JetBrains Mono, monospace' }}>
                        ({phase.duration})
                      </span>
                    )}
                  </div>
                  <p className="stepper-node__desc" style={{ color: phase.status === 'skipped' ? '#475569' : '#908fa0' }}>
                    {phase.status === 'skipped' ? 'Skipped for backend routes.' : meta?.description}
                  </p>
                </div>
                {index < pipelinePhases.length - 1 && (
                  <div 
                    className="stepper-node__connector" 
                    style={{ 
                      opacity: phase.status === 'skipped' ? 0.3 : 1,
                      borderStyle: phase.status === 'skipped' ? 'dashed' : 'solid'
                    }} 
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
