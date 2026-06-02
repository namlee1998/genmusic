import React from 'react';
import { useSdlcStore } from '@/store/useSdlcStore';
import AgentPhaseCard from './AgentPhaseCard';

const PHASES = [
  {
    key: 'po',
    label: 'PO Agent',
    icon: 'PO',
    gate: 'REQUIREMENT_GATE',
    color: '#6366f1',
    engine: 'Claude via LangChain',
    tools: 'Confluence MCP',
    input: 'Feature request from user',
    output: 'PRD, user stories, acceptance criteria',
  },
  {
    key: 'ux',
    label: 'UX Agent',
    icon: 'UX',
    gate: 'UX_GATE',
    color: '#8b5cf6',
    engine: 'GPT via LangChain',
    tools: 'Penpot MCP',
    input: 'Approved PO handoff',
    output: 'UX spec, user flow, wireframes',
  },
  {
    key: 'dev',
    label: 'DEV Agent',
    icon: 'DEV',
    gate: 'DEV_GATE',
    color: '#3b82f6',
    engine: 'Claude Agent SDK',
    tools: 'GitHub MCP, E2B sandbox',
    input: 'Approved UX handoff',
    output: 'Implementation plan, patch, sandbox report',
  },
  {
    key: 'qa',
    label: 'QA Agent',
    icon: 'QA',
    gate: 'QA_GATE',
    color: '#10b981',
    engine: 'DeepSeek via LangChain',
    tools: 'Jira MCP, TestRail MCP',
    input: 'Approved DEV handoff',
    output: 'Test cases, coverage matrix, release decision',
  },
] as const;

interface Props {
  featureRequest?: {
    title?: string;
    description?: string;
    priority?: string;
  } | null;
  onStartPO: () => void;
  onRunNext: (phase: string, sourceTaskId: string, feedbackPrompt?: string) => void;
  onOpenGate: (taskId: string) => void;
  onViewArtifacts: (taskId: string) => void;
  sseLogs: string[];
  activePhase: string | null;
  sseActive: boolean;
}

export default function StageInspector({ featureRequest, onStartPO, onRunNext, onOpenGate, onViewArtifacts, sseLogs, activePhase, sseActive }: Props) {
  const { workflowStatus } = useSdlcStore();
  const phases = workflowStatus?.phases;

  return (
    <section className="delivery-flow">
      <div className="delivery-flow__header">
        <div>
          <p className="delivery-flow__eyebrow">Direct LangChain workflow</p>
          <h2>Four workers, one visible path</h2>
          <p>Workers hand off automatically while confidence stays high. Review only the outputs that need human direction.</p>
        </div>
        <span className="delivery-flow__status">{workflowStatus?.currentPhase || 'READY FOR REQUEST'}</span>
      </div>

      <div className={`delivery-request ${featureRequest?.title ? 'delivery-request--received' : ''}`}>
        <div>
          <span>{featureRequest?.title ? 'Feature request received' : 'No feature request yet'}</span>
          <strong>{featureRequest?.title || 'Submit a request to start PO Agent'}</strong>
          {featureRequest?.description && <p>{featureRequest.description}</p>}
        </div>
        {featureRequest?.priority && <b>{featureRequest.priority}</b>}
      </div>

      <div className="delivery-flow__steps">
        {PHASES.map((phase, index) => {
          const phaseData = phases?.[phase.key] ?? null;
          const previous = index > 0 ? phases?.[PHASES[index - 1].key] : null;
          const unlocked = index === 0 || previous?.hitlDecision?.decision === 'APPROVE';

          return (
            <React.Fragment key={phase.key}>
              <article className={`worker-step ${unlocked ? '' : 'worker-step--locked'}`}>
                <div className="worker-step__number">0{index + 1}</div>
                <div className="worker-step__contract">
                  <strong>{phase.input}</strong>
                  <span>{phase.engine}</span>
                  <span>MCP: {phase.tools}</span>
                  <span>Output: {phase.output}</span>
                </div>
                <AgentPhaseCard
                  phase={phase}
                  phaseData={phaseData}
                  isUnlocked={unlocked}
                  isActive={activePhase === phase.key && sseActive}
                  sseLogs={activePhase === phase.key ? sseLogs : []}
                  onRun={() => {
                    if (index === 0) onStartPO();
                    else if (previous?.taskId) onRunNext(phase.key, previous.taskId, phaseData?.hitlDecision?.comment);
                  }}
                  onOpenGate={() => { if (phaseData?.taskId) onOpenGate(phaseData.taskId); }}
                  onViewArtifacts={() => { if (phaseData?.taskId) onViewArtifacts(phaseData.taskId); }}
                />
              </article>
              {index < PHASES.length - 1 && (
                <div className={`a2a-link ${previous?.hitlDecision?.decision === 'APPROVE' ? 'a2a-link--active' : ''}`}>
                  <span>A2A</span>
                  <b>→</b>
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </section>
  );
}
