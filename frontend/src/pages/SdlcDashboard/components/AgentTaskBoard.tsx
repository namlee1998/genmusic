import React from 'react';
import { useSdlcStore } from '@/store/useSdlcStore';
import { 
  Check, 
  Loader2, 
  AlertCircle, 
  Clock, 
  PlayCircle, 
  SkipForward, 
  User, 
  Palette, 
  Code, 
  ShieldCheck, 
  ExternalLink,
  FileText
} from 'lucide-react';

interface AgentTaskBoardProps {
  setActiveDetailType: (type: 'prd' | 'ux_spec' | 'code_diff' | 'qa_report' | null) => void;
}

interface TaskItem {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'running' | 'gate_pending' | 'completed' | 'skipped' | 'failed';
  actionType?: 'artifact' | 'gate';
  artifactType?: 'prd' | 'ux_spec' | 'code_diff' | 'qa_report';
}

const AGENT_META = {
  PO: {
    title: 'Product Owner (PO)',
    description: 'Requirements & Risk Analysis',
    icon: <User className="agent-icon text-indigo-400" size={18} />
  },
  UX: {
    title: 'UI/UX Designer (UX)',
    description: 'User Flows & Wireframes',
    icon: <Palette className="agent-icon text-pink-400" size={18} />
  },
  DEV: {
    title: 'Developer (DEV)',
    description: 'Code & Sandbox Execution',
    icon: <Code className="agent-icon text-emerald-400" size={18} />
  },
  QA: {
    title: 'Quality Assurance (QA)',
    description: 'Validation & Compliance',
    icon: <ShieldCheck className="agent-icon text-amber-400" size={18} />
  }
};

export default function AgentTaskBoard({ setActiveDetailType }: AgentTaskBoardProps) {
  const { pipelinePhases, routeType, status } = useSdlcStore();

  // Find phase status with defensive checks
  const getPhaseStatus = (agent: 'PO' | 'UX' | 'DEV' | 'QA') => {
    if (!pipelinePhases || !Array.isArray(pipelinePhases)) return 'pending';
    const phase = pipelinePhases.find(p => p && p.agent === agent);
    return phase && phase.status ? phase.status : 'pending';
  };

  const getPhaseDuration = (agent: 'PO' | 'UX' | 'DEV' | 'QA') => {
    if (!pipelinePhases || !Array.isArray(pipelinePhases)) return undefined;
    const phase = pipelinePhases.find(p => p && p.agent === agent);
    return phase?.duration;
  };

  // Helper to resolve task state based on phase state
  const getTaskStatus = (
    agent: 'PO' | 'UX' | 'DEV' | 'QA',
    taskIndex: 1 | 2 | 3
  ): 'pending' | 'running' | 'gate_pending' | 'completed' | 'skipped' | 'failed' => {
    const phaseStatus = getPhaseStatus(agent);

    if (phaseStatus === 'skipped') {
      return 'skipped';
    }
    if (phaseStatus === 'failed') {
      if (taskIndex === 3) return 'failed';
      return 'completed';
    }

    switch (phaseStatus) {
      case 'pending':
        return 'pending';
      case 'running':
        if (taskIndex === 1) return 'running';
        return 'pending';
      case 'gate_pending':
        if (taskIndex === 3) return 'gate_pending';
        return 'completed';
      case 'completed':
        return 'completed';
      default:
        return 'pending';
    }
  };

  // Build tasks lists programmatically
  const getTasksForAgent = (agent: 'PO' | 'UX' | 'DEV' | 'QA'): TaskItem[] => {
    switch (agent) {
      case 'PO':
        return [
          {
            id: 'po-task-1',
            title: 'Requirement Classification',
            description: 'Classify feature scope & determine execution route constraints.',
            status: getTaskStatus('PO', 1)
          },
          {
            id: 'po-task-2',
            title: 'PRD Generation',
            description: 'Generate product requirements document markdown artifact.',
            status: getTaskStatus('PO', 2),
            actionType: 'artifact',
            artifactType: 'prd'
          },
          {
            id: 'po-task-3',
            title: 'Requirements Gate',
            description: 'Awaiting human review/override for specified questions.',
            status: getTaskStatus('PO', 3),
            actionType: 'gate'
          }
        ];
      case 'UX':
        return [
          {
            id: 'ux-task-1',
            title: 'User Flow Design',
            description: 'Outline key interaction paths and navigation patterns.',
            status: getTaskStatus('UX', 1)
          },
          {
            id: 'ux-task-2',
            title: 'Wireframes & UI Specs',
            description: 'Draft the visual specs and layout components document.',
            status: getTaskStatus('UX', 2),
            actionType: 'artifact',
            artifactType: 'ux_spec'
          },
          {
            id: 'ux-task-3',
            title: 'Component Inventory',
            description: 'Finalize component elements and annotations properties.',
            status: getTaskStatus('UX', 3)
          }
        ];
      case 'DEV':
        return [
          {
            id: 'dev-task-1',
            title: 'Implementation Plan',
            description: 'Draft file modifications list and sandbox test plans.',
            status: getTaskStatus('DEV', 1)
          },
          {
            id: 'dev-task-2',
            title: 'Code Modification',
            description: 'Apply unified changes to files and check security rules.',
            status: getTaskStatus('DEV', 2),
            actionType: 'artifact',
            artifactType: 'code_diff'
          },
          {
            id: 'dev-task-3',
            title: 'Sandbox Execution & Gate',
            description: 'Run compiler, linter, tests, and handle risk-based gates.',
            status: getTaskStatus('DEV', 3),
            actionType: 'gate'
          }
        ];
      case 'QA':
        return [
          {
            id: 'qa-task-1',
            title: 'Test Cases Execution',
            description: 'Verify coverage metrics, regression test outcomes & logs.',
            status: getTaskStatus('QA', 1)
          },
          {
            id: 'qa-task-2',
            title: 'Security Scan & Compliance',
            description: 'Check OWASP rules and dependency security audit.',
            status: getTaskStatus('QA', 2)
          },
          {
            id: 'qa-task-3',
            title: 'Release Recommendation',
            description: 'Provide final QA.md audit report and gate checklist.',
            status: getTaskStatus('QA', 3),
            actionType: getPhaseStatus('QA') === 'completed' ? 'artifact' : 'gate',
            artifactType: 'qa_report'
          }
        ];
    }
  };

  const getTaskIcon = (taskStatus: TaskItem['status']) => {
    switch (taskStatus) {
      case 'completed':
        return <Check size={14} className="text-emerald-500" />;
      case 'running':
        return <Loader2 size={14} className="animate-spin text-blue-500" />;
      case 'gate_pending':
        return <Clock size={14} className="text-amber-500" />;
      case 'failed':
        return <AlertCircle size={14} className="text-rose-500" />;
      case 'skipped':
        return <SkipForward size={14} className="text-slate-500" />;
      default:
        return <PlayCircle size={14} className="text-gray-500" />;
    }
  };

  const scrollToGate = (agent: 'PO' | 'UX' | 'DEV' | 'QA') => {
    let selector = '';
    if (agent === 'PO' || agent === 'DEV') {
      selector = '.gate-panel-card';
    } else if (agent === 'QA') {
      selector = '[data-gate-id="gate-release-mock"]';
    }
    
    if (selector) {
      const el = document.querySelector(selector);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('hitl-highlight-pulse');
        setTimeout(() => {
          el.classList.remove('hitl-highlight-pulse');
        }, 3000);
      }
    }
  };

  const handleCardClick = (task: TaskItem, agent: 'PO' | 'UX' | 'DEV' | 'QA') => {
    if (task.status === 'skipped' || task.status === 'pending') return;

    if (task.actionType === 'artifact' && task.artifactType) {
      // Completed artifact card -> open detail modal
      setActiveDetailType(task.artifactType);
    } else if (task.actionType === 'gate' && task.status === 'gate_pending') {
      // Active gate card -> scroll to manual review section
      scrollToGate(agent);
    }
  };

  const statusBadgeClasses = {
    idle: 'bg-white/3 border-[#1e293b] text-slate-300',
    cloning: 'bg-blue-500/10 border-blue-500/30 text-blue-300',
    analyzing: 'bg-blue-500/10 border-blue-500/30 text-blue-300',
    po_running: 'bg-[#6366f1]/10 border-[#6366f1]/30 text-indigo-300',
    ux_running: 'bg-[#6366f1]/10 border-[#6366f1]/30 text-indigo-300',
    dev_running: 'bg-[#6366f1]/10 border-[#6366f1]/30 text-indigo-300',
    sandbox_testing: 'bg-[#6366f1]/10 border-[#6366f1]/30 text-indigo-300',
    qa_running: 'bg-[#6366f1]/10 border-[#6366f1]/30 text-indigo-300',
    awaiting_approval: 'bg-amber-500/15 border-amber-500/40 text-amber-400',
    qa_complete: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400',
    failed: 'bg-red-500/15 border-red-500/40 text-red-300'
  }[status || 'idle'] || 'bg-white/3 border-[#1e293b] text-slate-300';

  return (
    <div className="pipeline-stepper-card bg-[#0d0e13]/80 backdrop-blur-xl border border-white/5 shadow-[0_8px_32px_0_rgba(0,0,0,0.3)] rounded-lg">
      {/* Header section (retains text and structure for tests) */}
      <div className="pipeline-stepper-card__header flex items-center justify-between p-5 border-b border-white/5">
        <div>
          <h3 className="font-bold text-base text-[#f8fafc]">AIFA Execution Route</h3>
          {routeType && (
            <span style={{ fontSize: '11px', color: '#a5b4fc', fontWeight: 600, display: 'block', marginTop: '2px' }}>
              ROUTE TYPE: {routeType}
            </span>
          )}
        </div>
        <span className={`status-badge inline-flex items-center px-2.5 py-1 rounded text-[10px] font-bold font-mono tracking-wider border ${statusBadgeClasses}`}>
          {(status || 'idle').replace('_', ' ').toUpperCase()}
        </span>
      </div>

      <div className="pipeline-stepper-card__body p-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 w-full">
          {(['PO', 'UX', 'DEV', 'QA'] as const).map(agentKey => {
            const meta = AGENT_META[agentKey];
            const tasks = getTasksForAgent(agentKey);
            const phaseStatus = getPhaseStatus(agentKey);
            const duration = getPhaseDuration(agentKey);

            const columnStatusClasses = {
              pending: 'border-white/3',
              running: 'border-blue-500/30 shadow-[0_0_15px_rgba(59,130,246,0.05)]',
              gate_pending: 'border-amber-500/30 shadow-[0_0_15px_rgba(245,158,11,0.05)]',
              completed: 'border-emerald-500/15',
              skipped: 'opacity-55 border-dashed border-white/5',
              failed: 'border-red-500/30'
            }[phaseStatus] || 'border-white/3';

            const badgeStatusClasses = {
              pending: 'bg-white/3 text-slate-400 border-white/5',
              running: 'bg-blue-500/15 text-blue-400 border-blue-500/30 animate-glow-pulse-blue',
              gate_pending: 'bg-amber-500/15 text-amber-400 border-amber-500/30 animate-glow-pulse-orange',
              completed: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
              skipped: 'bg-white/2 text-slate-500 border-white/4',
              failed: 'bg-red-500/15 text-red-400 border-red-500/30'
            }[phaseStatus] || 'bg-white/3 text-slate-400 border-white/5';

            return (
              <div 
                key={agentKey} 
                className={`flex flex-col gap-3 p-3.5 rounded-lg bg-[#1e293b]/15 border transition-all duration-300 ease-in-out ${columnStatusClasses}`}
              >
                {/* Column Header */}
                <div className="flex flex-col gap-1.5 pb-2.5 border-b border-white/5">
                  <div className="flex items-center gap-2">
                    {meta.icon}
                    <span className="font-bold text-[13px] text-[#f8fafc]">{meta.title}</span>
                  </div>
                  <div className="flex items-center justify-between gap-1.5 mt-0.5">
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-bold font-mono uppercase tracking-wider border ${badgeStatusClasses}`}>
                      {phaseStatus.replace('_', ' ').toUpperCase()}
                    </span>
                    {duration && (
                      <span className="font-mono text-[9px] text-slate-500 font-medium">
                        {duration}
                      </span>
                    )}
                  </div>
                </div>

                {/* Column Tasks */}
                <div className="flex flex-col gap-2.5">
                  {tasks.map(task => {
                    const isClickable = 
                      (task.actionType === 'artifact' && (task.status === 'completed' || task.status === 'gate_pending')) || 
                      (task.actionType === 'gate' && task.status === 'gate_pending');

                    const cardStatusClasses = {
                      pending: 'opacity-75 border-white/3 bg-slate-900/40',
                      completed: `border-emerald-500/20 bg-emerald-500/2 ${isClickable ? 'hover:border-emerald-500/55 hover:bg-emerald-500/4 hover:-translate-y-0.5 hover:shadow-[0_4px_16px_rgba(16,185,129,0.12)]' : ''}`,
                      running: 'border-blue-500/45 bg-blue-500/4 shadow-[0_0_12px_rgba(59,130,246,0.08)] animate-border-pulse-blue',
                      gate_pending: `border-amber-500/45 bg-amber-500/4 shadow-[0_0_12px_rgba(245,158,11,0.08)] animate-border-pulse-orange ${isClickable ? 'hover:border-amber-500/75 hover:bg-amber-500/8 hover:-translate-y-0.5 hover:shadow-[0_4px_16px_rgba(245,158,11,0.16)]' : ''}`,
                      skipped: 'border-dashed border-white/5 opacity-45 bg-transparent',
                      failed: 'border-red-500/40 bg-red-500/4'
                    }[task.status] || 'border-white/3 bg-slate-900/40';

                    return (
                      <div
                        key={task.id}
                        onClick={() => handleCardClick(task, agentKey)}
                        className={`group flex flex-col gap-1.5 p-3 rounded-md border transition-all duration-200 ease-in-out relative overflow-hidden ${cardStatusClasses} ${isClickable ? 'cursor-pointer' : ''}`}
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="inline-flex flex-shrink-0">
                            {getTaskIcon(task.status)}
                          </span>
                          <span className="font-semibold text-[11.5px] text-slate-200 leading-tight">
                            {task.title}
                          </span>
                          {isClickable && (
                            <span className="ml-auto inline-flex items-center justify-center">
                              {task.actionType === 'artifact' ? (
                                <FileText size={10} className="text-blue-400" />
                              ) : (
                                <Clock size={10} className="text-amber-400" />
                              )}
                            </span>
                          )}
                        </div>
                        <p className="m-0 text-[10.5px] text-slate-400 leading-relaxed">
                          {task.status === 'skipped' ? 'Skipped for this execution path.' : task.description}
                        </p>
                        
                        {/* Interactive Hint */}
                        {isClickable && (
                          <div className="mt-1 pt-1.5 border-t border-white/5 flex items-center gap-1 text-[8.5px] text-indigo-400 font-bold uppercase tracking-wider transition-colors duration-150 group-hover:text-indigo-200">
                            {task.actionType === 'artifact' ? (
                              <>
                                <ExternalLink size={10} />
                                <span>Click to view Artifact</span>
                              </>
                            ) : (
                              <>
                                <ExternalLink size={10} />
                                <span>Click to go to review gate</span>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
