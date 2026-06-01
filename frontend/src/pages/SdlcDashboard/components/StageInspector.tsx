import React from 'react';

import { useSdlcStore } from '@/store/useSdlcStore';
import AgentPhaseCard from './AgentPhaseCard';


const PHASES = [
  { key: 'po',  label: 'PO Agent',  icon: '📋', gate: 'REQUIREMENT_GATE', color: '#6366f1' },
  { key: 'ux',  label: 'UX Agent',  icon: '🎨', gate: 'UX_GATE',          color: '#8b5cf6' },
  { key: 'dev', label: 'DEV Agent', icon: '⚙️', gate: 'DEV_GATE',         color: '#3b82f6' },
  { key: 'qa',  label: 'QA Agent',  icon: '🧪', gate: 'QA_GATE',          color: '#10b981' },
] as const;

interface Props {
  onRunIntent: () => void;
  onRunNext: (phase: string, sourceTaskId: string, feedbackPrompt?: string) => void;
  onOpenGate: (taskId: string) => void;
  onViewArtifacts: (taskId: string) => void;
  onGateDecision?: (taskId: string, decision: 'APPROVE' | 'REJECT' | 'REQUEST_CHANGES', comment: string) => Promise<void>;
  sseLogs: string[];
  activePhase: string | null;
  sseActive: boolean;
}

export default function StageInspector({ onRunIntent, onRunNext, onOpenGate, onViewArtifacts, onGateDecision, sseLogs, activePhase, sseActive }: Props) {
  const { workflowStatus } = useSdlcStore();
  const phases = workflowStatus?.phases;

  // The intent agent is like the "User Feature Request / Supervisor" in this graph
  const phasesMap = phases as Record<string, unknown> | undefined;
  const intentData = (phasesMap?.['intent'] as NonNullable<typeof phases>[keyof NonNullable<typeof phases>]) ?? null;
  const isIntentDone = intentData?.status === 'completed';
  const isIntentApproved = intentData?.hitlDecision?.decision === 'APPROVE' || intentData?.versionStatus === 'committed';

  return (
    <div className="arch-shell">
      <div className="arch-panel">
        <div className="arch-top">
          <div className="arch-title">LangGraph Supervisor / Worker Runtime</div>
          <div className="arch-sub">Hybrid MCP-Enabled Agents</div>
        </div>
        
        <div className="arch-canvas">
          <div className="arch-flow">
            
            {/* User Input / Intent */}
            <div className="arch-node arch-user" onClick={onRunIntent} style={{ cursor: 'pointer' }}>
              <div className="node-title">User Feature Request</div>
              <div className="node-sub">Natural-language business request</div>
              <div style={{ marginTop: 8 }}>
                <span className={`badge ${isIntentDone ? 'badge-done' : 'badge-idle'}`}>
                  {isIntentApproved ? 'Approved' : isIntentDone ? 'Review required' : 'Click to start'}
                </span>
              </div>
            </div>
            
            <div className="arch-connect"></div>
            
            {/* Supervisor */}
            <div className={`ph-card ph-supervisor arch-supervisor ${activePhase === 'supervisor' ? 'ph-active' : ''}`} style={{ '--pc': '#533AB7', '--pc2': '#7F77DD' } as React.CSSProperties}>
              <div className="ph-hdr">
                <div className="ph-icon">S</div>
                <div className="ph-meta">
                  <div className="ph-label">Supervisor Node</div>
                  <div className="ph-gate" style={{ color: '#c4b5fd', fontSize: '9px' }}>Intent analysis, routing, retry policy</div>
                </div>
                <div className="ph-badges">
                  <span className={`badge ${isIntentDone ? 'badge-done' : 'badge-idle'}`}>
                    {isIntentApproved ? 'Approved' : isIntentDone ? 'Waiting gate' : 'Idle'}
                  </span>
                </div>
              </div>
            </div>
            
            <div className="arch-connect fanout"></div>
            
            {/* Workers */}
            <div className="arch-workers">
              {PHASES.map((phase, idx) => {
                const phaseData = phases?.[phase.key] ?? null;
                const prevPhaseData = idx === 0 ? intentData : phases?.[PHASES[idx - 1].key];
                const isUnlocked = idx === 0 ? isIntentApproved : (prevPhaseData?.hitlDecision?.decision === 'APPROVE');
                
                return (
                  <div className="arch-worker" key={phase.key}>
                    <AgentPhaseCard
                      phase={phase}
                      phaseData={phaseData}
                      isUnlocked={!!isUnlocked}
                      isActive={activePhase === phase.key && sseActive}
                      sseLogs={activePhase === phase.key ? sseLogs : []}
                      onRun={() => { if (prevPhaseData?.taskId) onRunNext(phase.key, prevPhaseData.taskId, phaseData?.hitlDecision?.comment); }}
                      onOpenGate={() => { if (phaseData?.taskId) onOpenGate(phaseData.taskId); }}
                      onViewArtifacts={() => { if (phaseData?.taskId) onViewArtifacts(phaseData.taskId); }}
                      onGateDecision={onGateDecision ? (decision, comment) => {
                        if (phaseData?.taskId) {
                          return onGateDecision(phaseData.taskId, decision, comment);
                        }
                        return Promise.resolve();
                      } : undefined}
                    />
                  </div>
                );
              })}
            </div>

            {/* MCP Bus */}
            <div className="mcp-bus" style={{ marginTop: '16px' }}>
              <div className="mcp-title">MCP Tool Bus</div>
              <div className="mcp-chip">Figma MCP</div>
              <div className="mcp-chip">GitHub MCP</div>
              <div className="mcp-chip">Jira MCP</div>
              <div className="mcp-chip">Notion MCP</div>
              <div className="mcp-chip">Slack MCP</div>
            </div>

            {/* Outputs */}
            <div className="arch-outputs" style={{ marginTop: '16px' }}>
              <div className="arch-node arch-output"><div className="node-title">PRD / Stories</div><div className="node-sub">Notion / DB</div></div>
              <div className="arch-node arch-output"><div className="node-title">UX Spec</div><div className="node-sub">Figma / DB</div></div>
              <div className="arch-node arch-output"><div className="node-title">Source Code</div><div className="node-sub">GitHub / DB</div></div>
              <div className="arch-node arch-output"><div className="node-title">QA Report</div><div className="node-sub">TestRail / DB</div></div>
            </div>
            
          </div>
        </div>
      </div>
    </div>
  );
}
