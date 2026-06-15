import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useSdlcStore } from '@/store/useSdlcStore';
import { useAppStore } from '@/store/useAppStore';
import * as sdlcApi from '@/services/api/sdlcApi';
import type { WorkflowMetrics } from '@/store/useSdlcStore';
import {
  Bot,
  FileText,
  Palette,
  Code2,
  ShieldCheck,
  Rocket,
  ShieldAlert,
  Search,
  Grid,
  List,
  ChevronDown,
  X,
  CheckCircle2,
  ArrowRight,
  RefreshCw,
  Terminal,
  AlertCircle,
  FileCode,
} from 'lucide-react';
import EmptyProjectState from './components/EmptyProjectState';

interface AgentInfo {
  key: 'PO' | 'UX' | 'DEV' | 'QA' | 'SEC' | 'RELEASE';
  name: string;
  badge: string;
  role: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  glowColor: string;
  agentId: string;
  status: 'running' | 'waiting' | 'blocked' | 'idle';
  currentTask?: string;
  lastTask?: string;
  progress?: number;
  progressLabel?: string;
  input?: string;
  output?: string;
  waitingFor?: string;
  idleTime?: string;
  blockedReason?: string;
  startedTime?: string;
  lastRunTime?: string;
  failuresCount?: number;
  testSuite?: string;
}

// Helper: format timestamp as relative time ("3m ago", "2h ago")
const timeAgo = (ts: string): string => {
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 0) return 'just now';
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ${mins % 60}m ago`;
  return `${Math.floor(hours / 24)}d ago`;
};

const idleTimeAgo = (ts: string): string => {
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 0) return '<1m';
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '<1m';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  return `${hours}h ${mins % 60}m`;
};

export default function AgentsPage() {
  const { currentProjectId } = useAppStore();
  const { projectId, pipelinePhases, auditLog, pendingGates, setProjectId } = useSdlcStore();

  const [loading, setLoading] = useState(false);
  const [metrics, setMetrics] = useState<WorkflowMetrics | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<AgentInfo | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'tasks' | 'artifacts' | 'logs' | 'handoffs'>('overview');
  const [customLogs, setCustomLogs] = useState<string[]>([]);
  
  // Filters state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'running' | 'waiting' | 'blocked' | 'idle'>('ALL');
  const [workflowFilter, setWorkflowFilter] = useState('All Workflows');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Keep project ID in sync
  useEffect(() => {
    if (currentProjectId && currentProjectId !== projectId) {
      setProjectId(currentProjectId);
    }
  }, [currentProjectId, projectId, setProjectId]);

  const loadData = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const data = await sdlcApi.getWorkflowMetrics(projectId);
      setMetrics(data);
    } catch (err) {
      console.error('Failed to fetch metrics:', err);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Map backend phase status into UI statuses dynamically
  const resolveStatus = useCallback((key: string, defaultStatus: AgentInfo['status']): AgentInfo['status'] => {
    const phase = pipelinePhases.find((p) => p.agent.toUpperCase() === key);
    if (!phase) return defaultStatus;
    
    switch (phase.status) {
      case 'running': return 'running';
      case 'gate_pending': return 'waiting';
      case 'failed': return 'blocked';
      case 'completed': return 'idle';
      default: return defaultStatus;
    }
  }, [pipelinePhases]);

  // Derive agent display data from real pipeline state, audit log, and pending gates
  const agentsList: AgentInfo[] = useMemo(() => {
    const lastAuditFor = (key: string) => {
      const entries = auditLog.filter(e =>
        e.actor === key || e.actor === `${key} AGENT` || e.actor === `${key}-agent`
      );
      return entries.length > 0 ? entries[entries.length - 1] : null;
    };

    const firstAuditFor = (key: string) => {
      const entries = auditLog.filter(e =>
        e.actor === key || e.actor === `${key} AGENT` || e.actor === `${key}-agent`
      );
      return entries.length > 0 ? entries[0] : null;
    };

    const phaseFor = (key: string) => pipelinePhases.find(p => p.agent === key);

    const relatedGate = (key: string) => {
      if (key === 'PO') return pendingGates.find(g => g.type === 'PO_CLARIFY');
      if (key === 'DEV') return pendingGates.find(g => g.type === 'DEV_FILE_GATE');
      return undefined;
    };

    const taskLabel = (key: string, status: AgentInfo['status']): string | undefined => {
      if (status === 'running') {
        if (key === 'PO') return 'PRD Generation';
        if (key === 'UX') return 'UX Specification';
        if (key === 'DEV') return 'Code Implementation';
        if (key === 'QA') return 'QA Verification';
      }
      if (status === 'waiting') return 'Awaiting upstream artifacts';
      if (status === 'blocked') return 'Blocked';
      if (status === 'idle') return undefined;
      return undefined;
    };

    const inputFile = (key: string): string | undefined => {
      if (key === 'PO') return 'feature_request.md';
      if (key === 'UX') return 'PRD.md';
      if (key === 'DEV') return 'UX_Spec.md';
      if (key === 'QA') return 'Implementation.md';
      return undefined;
    };

    const outputFile = (key: string): string | undefined => {
      if (key === 'PO') return 'PRD.md';
      if (key === 'UX') return 'UX_Spec.md';
      if (key === 'DEV') return 'Code_Patch.md';
      if (key === 'QA') return 'QA_Report.md';
      return undefined;
    };

    const waitingFor = (key: string, status: AgentInfo['status']): string | undefined => {
      const gate = relatedGate(key);
      if (gate?.payload?.reason) return gate.payload.reason;
      if (status === 'waiting') {
        const upstream = { PO: undefined, UX: 'PRD from PO Agent', DEV: 'UX Spec from UX Agent', QA: 'Implementation from DEV Agent' }[key];
        return upstream;
      }
      if (status === 'blocked') {
        const upstream = { PO: undefined, UX: 'PRD from PO Agent', DEV: 'UX Spec from UX Agent', QA: 'Implementation from DEV Agent' }[key];
        return upstream;
      }
      return undefined;
    };

    const agentTimeAgo = (key: string): string | undefined => {
      const first = firstAuditFor(key);
      return first ? `started ${timeAgo(first.timestamp)}` : undefined;
    };

    const agentIdle = (key: string, status: AgentInfo['status']): string | undefined => {
      const last = lastAuditFor(key);
      if (!last) return undefined;
      if (status === 'idle' || status === 'waiting') return idleTimeAgo(last.timestamp);
      return undefined;
    };

    const agentLastTask = (key: string): string | undefined => {
      const last = lastAuditFor(key);
      return last?.action || undefined;
    };

    const blockedReason = (key: string, status: AgentInfo['status']): string | undefined => {
      if (status !== 'blocked') return undefined;
      const gate = relatedGate(key);
      return gate?.payload?.reason || 'Pipeline blocked';
    };

    // Human-readable phase label from phase status
    const phaseLabel = (key: string): string => {
      const labels: Record<string, string> = {
        PO: 'Requirements Analysis',
        UX: 'UI/UX Visual Design',
        DEV: 'Code Synthesis & Implementation',
        QA: 'Sandbox Verification',
      };
      return labels[key] || key;
    };

    const phaseDescription = (key: string): string => {
      const descs: Record<string, string> = {
        PO: 'Responsible for understanding requirements, generating PRD and ensuring regulatory quality.',
        UX: 'Responsible for user journey mapping, visual wireframes design, and exporting Penpot assets.',
        DEV: 'Generates and merges code edits, drafts implementation plans, and solves compilation warnings.',
        QA: 'Maintains verification sandbox suites, measures code coverage, and checks OWASP compliance.',
      };
      return descs[key] || '';
    };

    const agentIcons: Record<string, React.ReactNode> = {
      PO: <FileText size={18} />,
      UX: <Palette size={18} />,
      DEV: <Code2 size={18} />,
      QA: <ShieldCheck size={18} />,
    };

    const agentColors: Record<string, string> = {
      PO: 'from-indigo-500 to-purple-600',
      UX: 'from-pink-500 to-rose-600',
      DEV: 'from-amber-500 to-orange-600',
      QA: 'from-emerald-500 to-teal-600',
    };

    const agentGlow: Record<string, string> = {
      PO: 'rgba(99, 102, 241, 0.12)',
      UX: 'rgba(244, 63, 94, 0.12)',
      DEV: 'rgba(245, 158, 11, 0.12)',
      QA: 'rgba(16, 185, 129, 0.12)',
    };

    const agentIds: Record<string, string> = {
      PO: 'agt_po_001',
      UX: 'agt_ux_002',
      DEV: 'agt_dev_003',
      QA: 'agt_qa_004',
    };

    return (['PO', 'UX', 'DEV', 'QA'] as const).map(key => {
      const status = resolveStatus(key, 'idle');
      return {
        key,
        name: `${key === 'PO' ? 'Product Owner' : key === 'UX' ? 'UI/UX Designer' : key === 'DEV' ? 'Developer' : 'Quality Assurance'} Agent`,
        badge: key,
        role: phaseLabel(key),
        description: phaseDescription(key),
        icon: agentIcons[key],
        color: agentColors[key],
        glowColor: agentGlow[key],
        agentId: agentIds[key],
        status,
        currentTask: taskLabel(key, status),
        input: inputFile(key),
        output: outputFile(key),
        waitingFor: waitingFor(key, status),
        idleTime: agentIdle(key, status),
        blockedReason: blockedReason(key, status),
        lastTask: agentLastTask(key),
        startedTime: agentTimeAgo(key),
      };
    });
  }, [pipelinePhases, auditLog, pendingGates, resolveStatus]);

  // Compute status counts
  const statusCounts = useMemo(() => {
    const counts = { running: 0, waiting: 0, blocked: 0, idle: 0 };
    agentsList.forEach((a) => {
      counts[a.status]++;
    });
    return counts;
  }, [agentsList]);

  // Filtered List
  const filteredAgents = useMemo(() => {
    return agentsList.filter((a) => {
      const matchesSearch = a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        a.role.toLowerCase().includes(searchQuery.toLowerCase()) ||
        a.description.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === 'ALL' || a.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [agentsList, searchQuery, statusFilter]);

  if (!projectId) {
    return (
      <main className="flex flex-col gap-0 p-0 h-full min-h-0 overflow-y-auto bg-[#090a0f] text-[#e3e1e9] font-sans antialiased" style={{ padding: '24px 32px' }}>
        <EmptyProjectState />
      </main>
    );
  }

  const getStatusDotColor = (status: AgentInfo['status']) => {
    switch (status) {
      case 'running': return 'bg-emerald-500 shadow-[0_0_8px_#10b981]';
      case 'waiting': return 'bg-amber-500 shadow-[0_0_8px_#fbbf24]';
      case 'blocked': return 'bg-red-500 shadow-[0_0_8px_#ef4444] animate-pulse';
      default: return 'bg-slate-500';
    }
  };

  const getStatusText = (status: AgentInfo['status']) => {
    switch (status) {
      case 'running': return 'Running';
      case 'waiting': return 'Waiting';
      case 'blocked': return 'Blocked';
      default: return 'Idle';
    }
  };

  // Inspect specific agent
  const handleOpenDetails = (agent: AgentInfo) => {
    setSelectedAgent(agent);
    setActiveTab('overview');
    
    // Filter actual logs
    const filteredEvents = auditLog.filter(
      (e) => e.actor && e.actor.toUpperCase().replace(' AGENT', '') === agent.key
    );

    if (filteredEvents.length > 0) {
      const logs = filteredEvents.map(
        (e) => `[${new Date(e.timestamp).toLocaleTimeString()}] [${e.status?.toUpperCase() || 'INFO'}] ${e.action.replace(/_/g, ' ')}`
      );
      setCustomLogs(logs);
    } else {
      setCustomLogs([]);
    }
  };

  return (
    <main
      className="flex-1 flex flex-col gap-0 p-0 h-full min-h-0 overflow-y-auto bg-[#090a0f] text-[#e3e1e9] font-sans antialiased relative"
      style={{
        maxWidth: '100%',
        padding: '24px 32px',
        backgroundImage: 'radial-gradient(at 0% 0%, rgba(99, 102, 241, 0.03) 0px, transparent 50%), radial-gradient(at 100% 0%, rgba(14, 165, 233, 0.03) 0px, transparent 50%)'
      }}
    >
      {/* 1. Header Title Block */}
      <div className="mx-[18px] mb-5 flex flex-col gap-1">
        <h1 className="text-xl font-bold text-white tracking-tight">Agents</h1>
        <p className="text-[11.5px] text-slate-400">Real-time status of all AI agents in your project</p>
      </div>

      {/* 2. Top Filter and Layout Bar */}
      <div className="flex items-center justify-between mx-[18px] mb-6 flex-wrap gap-3 pb-4 border-b border-[#1e293b]/40">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Search */}
          <div className="relative shrink-0 w-64">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Search agents, tasks, artifacts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8.5 pr-8 py-2 bg-[#11131a]/60 border border-white/5 rounded-lg text-[11px] focus:outline-none focus:border-indigo-500/50 text-white placeholder:text-slate-500"
            />
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 px-1 py-0.5 rounded bg-slate-900 border border-white/10 text-[8px] font-bold text-slate-500 select-none">
              ⌘K
            </span>
          </div>

          {/* All Workflows dropdown */}
          <button className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-white/5 bg-[#11131a]/60 hover:bg-[#181b24] text-[11px] text-slate-300 transition-all cursor-pointer">
            <span>{workflowFilter}</span>
            <ChevronDown size={12} className="text-slate-500" />
          </button>

          {/* Status filter dropdown */}
          <button className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-white/5 bg-[#11131a]/60 hover:bg-[#181b24] text-[11px] text-slate-300 transition-all cursor-pointer">
            <span className="capitalize">Status: {statusFilter.toLowerCase()}</span>
            <ChevronDown size={12} className="text-slate-500" />
          </button>
        </div>

        {/* Layout controls */}
        <div className="flex items-center gap-1.5 bg-[#11131a]/60 border border-white/5 p-1 rounded-lg">
          <button
            onClick={() => setViewMode('grid')}
            className={`p-1.5 rounded transition-all cursor-pointer ${viewMode === 'grid' ? 'bg-indigo-500/15 text-indigo-400' : 'text-slate-500 hover:text-white'}`}
          >
            <Grid size={13} />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`p-1.5 rounded transition-all cursor-pointer ${viewMode === 'list' ? 'bg-indigo-500/15 text-indigo-400' : 'text-slate-500 hover:text-white'}`}
          >
            <List size={13} />
          </button>
        </div>
      </div>

      {/* 3. Status KPI counters row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mx-[18px] mb-6">
        <div 
          onClick={() => setStatusFilter(statusFilter === 'running' ? 'ALL' : 'running')}
          className={`p-4 rounded-xl border border-white/5 bg-[#11131a]/60 flex items-center justify-between cursor-pointer transition-all hover:border-emerald-500/10 ${statusFilter === 'running' ? 'border-emerald-500/20 bg-emerald-500/2 shadow-inner' : ''}`}
        >
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Running</span>
          </div>
          <span className="text-lg font-bold text-white leading-none">{statusCounts.running}</span>
        </div>

        <div 
          onClick={() => setStatusFilter(statusFilter === 'waiting' ? 'ALL' : 'waiting')}
          className={`p-4 rounded-xl border border-white/5 bg-[#11131a]/60 flex items-center justify-between cursor-pointer transition-all hover:border-amber-500/10 ${statusFilter === 'waiting' ? 'border-amber-500/20 bg-amber-500/2 shadow-inner' : ''}`}
        >
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-[0_0_8px_#fbbf24]" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Waiting</span>
          </div>
          <span className="text-lg font-bold text-white leading-none">{statusCounts.waiting}</span>
        </div>

        <div 
          onClick={() => setStatusFilter(statusFilter === 'blocked' ? 'ALL' : 'blocked')}
          className={`p-4 rounded-xl border border-white/5 bg-[#11131a]/60 flex items-center justify-between cursor-pointer transition-all hover:border-red-500/10 ${statusFilter === 'blocked' ? 'border-red-500/20 bg-red-500/2 shadow-inner' : ''}`}
        >
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-[0_0_8px_#ef4444]" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Blocked</span>
          </div>
          <span className="text-lg font-bold text-white leading-none">{statusCounts.blocked}</span>
        </div>

        <div 
          onClick={() => setStatusFilter(statusFilter === 'idle' ? 'ALL' : 'idle')}
          className={`p-4 rounded-xl border border-white/5 bg-[#11131a]/60 flex items-center justify-between cursor-pointer transition-all hover:border-slate-500/10 ${statusFilter === 'idle' ? 'border-slate-500/20 bg-slate-500/2 shadow-inner' : ''}`}
        >
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-500" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Idle</span>
          </div>
          <span className="text-lg font-bold text-white leading-none">{statusCounts.idle}</span>
        </div>
      </div>

      {/* 4. Agents grid list */}
      <div className="mx-[18px] mb-6 flex-1">
        {filteredAgents.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 bg-[#11131a]/60 border border-[#1e293b] rounded-xl text-center min-h-[250px]">
            <Bot size={36} className="text-slate-600 mb-2" />
            <h3 className="text-sm font-bold text-white m-0">No Agents Match</h3>
            <p className="text-[11.5px] text-slate-400 max-w-xs leading-relaxed mt-1">
              Try adjusting your filters or query text to find the appropriate agent cards.
            </p>
          </div>
        ) : (
          <div className={viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5' : 'flex flex-col gap-3'}>
            {filteredAgents.map((agent) => {
              const bgGlow = {
                boxShadow: `inset 0 0 20px ${agent.glowColor}`,
              };

              return (
                <div
                  key={agent.key}
                  className={`group p-5 rounded-xl border border-white/5 bg-[#11131a]/60 backdrop-blur-md transition-all duration-300 hover:-translate-y-0.5 hover:border-indigo-500/20 ${viewMode === 'list' ? 'flex items-center justify-between gap-5' : ''}`}
                  style={viewMode === 'grid' ? bgGlow : undefined}
                >
                  <div className={viewMode === 'list' ? 'flex items-center gap-6 flex-1 min-w-0' : 'space-y-4'}>
                    {/* Card Title Row */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className={`flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br ${agent.color} text-white shadow-md`}>
                          {agent.icon}
                        </div>
                        <div>
                          <h3 className="text-[12px] font-bold text-white leading-tight flex items-center gap-1.5">
                            <span>{agent.name}</span>
                            <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-white/10 text-[8px] font-bold text-slate-400">
                              {agent.badge}
                            </span>
                          </h3>
                        </div>
                      </div>

                      {/* Status indicator */}
                      {viewMode === 'grid' && (
                        <div className="flex items-center gap-1.5">
                          <span className={`w-1.5 h-1.5 rounded-full ${getStatusDotColor(agent.status)}`} />
                          <span className={`text-[9px] font-bold uppercase tracking-wider ${
                            agent.status === 'running' ? 'text-emerald-400' :
                            agent.status === 'waiting' ? 'text-amber-400' :
                            agent.status === 'blocked' ? 'text-red-400' :
                            'text-slate-400'
                          }`}>{getStatusText(agent.status)}</span>
                        </div>
                      )}
                    </div>

                    {/* Agent Status Context Block */}
                    <div className={`flex-1 min-w-0 ${viewMode === 'grid' ? 'mt-3.5' : ''}`}>
                      {agent.status === 'running' && (
                        <div className="space-y-3">
                          <div>
                            <span className="text-slate-500 font-bold uppercase tracking-wider text-[8px] block mb-1">Current Task</span>
                            <div className="flex items-center gap-1.5 text-xs text-[#ececf1] font-medium truncate">
                              {agent.key === 'PO' && <FileText size={12} className="text-slate-400 shrink-0" />}
                              {agent.key === 'QA' && <CheckCircle2 size={12} className="text-slate-400 shrink-0" />}
                              <span>{agent.currentTask}</span>
                            </div>
                          </div>

                          {/* Columns for Inputs/Outputs or test stats */}
                          {agent.key === 'PO' && (
                            <div className="grid grid-cols-2 gap-4 mt-1 pt-2.5 border-t border-[#1e293b]/30">
                              <div>
                                <span className="text-slate-500 block uppercase tracking-wider text-[8px] font-bold mb-1">Input</span>
                                <span className="text-[11px] text-slate-300 truncate block font-mono">📄 {agent.input}</span>
                              </div>
                              <div>
                                <span className="text-slate-500 block uppercase tracking-wider text-[8px] font-bold mb-1">Output</span>
                                <span className="text-[11px] text-emerald-400 truncate block font-mono">📄 {agent.output}</span>
                              </div>
                            </div>
                          )}

                          {agent.key === 'QA' && (
                            <div className="grid grid-cols-2 gap-4 mt-1 pt-2.5 border-t border-[#1e293b]/30">
                              <div>
                                <span className="text-slate-500 block uppercase tracking-wider text-[8px] font-bold mb-1">Artifact</span>
                                <div className="flex items-center gap-1 text-[11px] text-slate-300 font-mono truncate">
                                  <Terminal size={11} className="text-slate-400" />
                                  <span>{agent.output || 'QA Report'}</span>
                                </div>
                              </div>
                              <div>
                                <span className="text-slate-500 block uppercase tracking-wider text-[8px] font-bold mb-1">Status</span>
                                <span className="text-xs text-emerald-500 font-bold font-mono">In Progress</span>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {agent.status === 'waiting' && (
                        <div className="space-y-3">
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <span className="text-slate-500 font-bold uppercase tracking-wider text-[8px] block mb-1">Waiting For</span>
                              <div className="flex items-center gap-1.5 text-xs text-[#ececf1] font-medium truncate">
                                <FileText size={12} className="text-slate-400 shrink-0" />
                                <span>{agent.waitingFor}</span>
                              </div>
                            </div>
                            <div className="text-right">
                              <span className="text-slate-500 font-bold uppercase tracking-wider text-[8px] block mb-1">Idle Time</span>
                              <span className="text-xs text-white font-bold font-mono">{agent.idleTime}</span>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-4 mt-1 pt-2.5 border-t border-[#1e293b]/30">
                            <div>
                              <span className="text-slate-500 block uppercase tracking-wider text-[8px] font-bold mb-1">Expected Input</span>
                              <span className="text-[11px] text-slate-300 truncate block font-mono">📄 {agent.input}</span>
                            </div>
                            <div>
                              <span className="text-slate-500 block uppercase tracking-wider text-[8px] font-bold mb-1">Expected Output</span>
                              <span className="text-[11px] text-amber-500 truncate block font-mono">📄 {agent.output}</span>
                            </div>
                          </div>
                        </div>
                      )}

                      {agent.status === 'blocked' && (
                        <div className="space-y-3">
                          <div>
                            <span className="text-slate-500 font-bold uppercase tracking-wider text-[8px] block mb-1">Blocked Reason</span>
                            <div className="flex items-center gap-1.5 text-xs text-red-400 font-bold truncate">
                              <ShieldAlert size={13} className="shrink-0 text-red-500" />
                              <span>{agent.blockedReason}</span>
                            </div>
                          </div>
                          <div>
                            <span className="text-slate-500 font-bold uppercase tracking-wider text-[8px] block mb-1">Waiting For</span>
                            <div className="flex items-center gap-1.5 text-xs text-indigo-400 truncate">
                              <RefreshCw size={12} className="shrink-0 animate-spin" />
                              <span>{agent.waitingFor}</span>
                            </div>
                          </div>
                        </div>
                      )}

                      {agent.status === 'idle' && (
                        <div className="space-y-3">
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <span className="text-slate-500 font-bold uppercase tracking-wider text-[8px] block mb-1">Last Task</span>
                              <div className="flex items-center gap-1.5 text-xs text-[#ececf1] font-medium truncate">
                                <Rocket size={12} className="text-slate-400 shrink-0" />
                                <span>{agent.lastTask}</span>
                              </div>
                            </div>
                            <div className="text-right">
                              <span className="text-slate-500 font-bold uppercase tracking-wider text-[8px] block mb-1">Idle Time</span>
                              <span className="text-xs text-white font-bold font-mono">{agent.idleTime}</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Card Actions Row */}
                  <div className={`flex items-center justify-between border-t border-white/5 pt-3.5 ${viewMode === 'grid' ? 'mt-4' : 'shrink-0 gap-3'}`}>
                    <span className="text-[10px] text-slate-500 font-medium font-mono">
                      {agent.startedTime || agent.lastRunTime || 'Idle'}
                    </span>
                    <button
                      onClick={() => handleOpenDetails(agent)}
                      className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-400 hover:text-indigo-300 hover:translate-x-0.5 transition-all cursor-pointer"
                    >
                      <span>View Details</span>
                      <ArrowRight size={10} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination Bar */}
        {filteredAgents.length > 0 && (
          <div className="flex items-center justify-between mt-6 pt-4 border-t border-[#1e293b]/40 text-slate-400 text-xs">
            <div>
              Showing <span className="text-white font-medium">1</span> to <span className="text-white font-medium">{filteredAgents.length}</span> of <span className="text-white font-medium">{filteredAgents.length}</span> agents
            </div>
            <div className="flex items-center gap-1">
              <button className="p-1.5 rounded border border-white/5 bg-[#11131a]/60 text-slate-500 transition-all cursor-not-allowed opacity-30" disabled>
                &lt;
              </button>
              <button className="px-3 py-1 rounded bg-indigo-600 text-white font-bold text-xs transition-all cursor-pointer">
                1
              </button>
              <button className="p-1.5 rounded border border-white/5 bg-[#11131a]/60 text-slate-500 transition-all cursor-not-allowed opacity-30" disabled>
                &gt;
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 5. Right slide-over detailed panel */}
      {selectedAgent && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm transition-opacity duration-300"
            onClick={() => setSelectedAgent(null)}
          />

          {/* Slide-over panel */}
          <div className="fixed top-0 right-0 bottom-0 w-full max-w-md z-[101] bg-[#0c0d12] border-l border-white/5 shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
            {/* Header info */}
            <div className="p-4 border-b border-[#1e293b]/50 flex items-center justify-between bg-[#11131a]/60">
              <div className="flex items-center gap-3">
                <div className={`flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br ${selectedAgent.color} text-white shadow-md`}>
                  {selectedAgent.icon}
                </div>
                <div>
                  <h3 className="text-xs font-bold text-white leading-tight flex items-center gap-1.5">
                    <span>{selectedAgent.name}</span>
                    <span className="px-1 py-0.5 rounded bg-slate-900 border border-white/10 text-[8px] font-bold text-slate-400">
                      {selectedAgent.badge}
                    </span>
                  </h3>
                  <p className="text-[8.5px] text-slate-500 font-mono mt-0.5">
                    {selectedAgent.startedTime ? `Since ${selectedAgent.startedTime.replace('started ', '')} | ` : ''}Agent ID: {selectedAgent.agentId}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 bg-[#1e293b]/40 rounded border border-white/5 px-2 py-0.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${getStatusDotColor(selectedAgent.status)}`} />
                  <span className="text-[9px] font-mono text-slate-300 uppercase">{getStatusText(selectedAgent.status)}</span>
                </div>
                <button
                  onClick={() => setSelectedAgent(null)}
                  className="text-slate-500 hover:text-white p-1 rounded-lg transition-all"
                >
                  <X size={15} />
                </button>
              </div>
            </div>

            {/* Sidebar Tabs control */}
            <div className="flex border-b border-[#1e293b]/40 bg-[#11131a]/30 px-2.5">
              {(['overview', 'tasks', 'artifacts', 'logs', 'handoffs'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-3 py-2 text-[10px] font-bold uppercase tracking-wider border-b-2 transition-all cursor-pointer ${
                    activeTab === tab
                      ? 'border-indigo-500 text-white'
                      : 'border-transparent text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Panel Tab Panels */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar">
              {activeTab === 'overview' && (
                <div className="space-y-4">
                  {/* Current execution stats card */}
                  <div className="p-4 rounded-lg bg-[#11131a]/40 border border-white/5 space-y-3 shadow-inner">
                    <span className="text-[8px] uppercase font-bold text-slate-500 tracking-wider block">Current Execution</span>
                    
                    {selectedAgent.status === 'running' && selectedAgent.currentTask ? (
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <span className="text-slate-500 font-bold uppercase tracking-wider text-[8px] block mb-1">Current Task</span>
                            <div className="flex items-center gap-1.5 text-xs text-white font-medium truncate">
                              <FileText size={12} className="text-slate-400 shrink-0" />
                              <span>{selectedAgent.currentTask}</span>
                            </div>
                          </div>
                          <div className="text-right">
                            <span className="text-slate-500 font-bold uppercase tracking-wider text-[8px] block mb-1">Started</span>
                            <span className="text-xs text-slate-300 font-medium">{selectedAgent.startedTime || 'N/A'}</span>
                          </div>
                        </div>
                      </div>
                    ) : selectedAgent.status === 'blocked' ? (
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <span className="text-slate-500 font-bold uppercase tracking-wider text-[8px] block mb-1">Blocked Reason</span>
                            <div className="flex items-center gap-1.5 text-xs text-red-400 font-bold truncate">
                              <ShieldAlert size={12} className="shrink-0 text-red-500" />
                              <span>{selectedAgent.blockedReason}</span>
                            </div>
                          </div>
                          <div className="text-right">
                            <span className="text-slate-500 font-bold uppercase tracking-wider text-[8px] block mb-1">Waiting For</span>
                            <span className="text-xs text-indigo-400 font-medium truncate block">{selectedAgent.waitingFor}</span>
                          </div>
                        </div>
                        <div className="p-2 bg-red-500/10 border border-red-500/20 rounded text-[11px] text-slate-400 leading-relaxed">
                          Pipeline execution is blocked. Waiting for upstream dependencies to be resolved.
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <span className="text-slate-500 font-bold uppercase tracking-wider text-[8px] block mb-1">Last Task</span>
                            <div className="flex items-center gap-1.5 text-xs text-white font-medium truncate">
                              <Rocket size={12} className="text-slate-400 shrink-0" />
                              <span>{selectedAgent.lastTask || 'Idle — no recent activity'}</span>
                            </div>
                          </div>
                          <div className="text-right">
                            <span className="text-slate-500 font-bold uppercase tracking-wider text-[8px] block mb-1">Idle Time</span>
                            <span className="text-xs text-slate-300 font-mono font-bold">{selectedAgent.idleTime || 'N/A'}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Inputs card details */}
                  {selectedAgent.input && (
                    <div className="p-4 rounded-lg bg-[#11131a]/40 border border-white/5 space-y-3">
                      <span className="text-[8px] uppercase font-bold text-slate-500 tracking-wider block">Expected Input</span>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between p-2 rounded bg-black/40 border border-white/5 text-xs">
                          <span className="text-slate-300 font-mono flex items-center gap-1.5">
                            <FileText size={12} className="text-slate-400" />
                            {selectedAgent.input}
                          </span>
                          <span className="text-[9.5px] text-slate-500 font-bold font-mono">
                            Artifact
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Outputs card details */}
                  {selectedAgent.output && (
                    <div className="p-4 rounded-lg bg-[#11131a]/40 border border-white/5 space-y-3">
                      <span className="text-[8px] uppercase font-bold text-slate-500 tracking-wider block">Expected Output</span>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between p-2 rounded bg-black/40 border border-white/5 text-xs">
                          <span className="text-slate-300 font-mono flex items-center gap-1.5">
                            <FileText size={12} className="text-slate-400" />
                            {selectedAgent.output}
                          </span>
                          {selectedAgent.status === 'running' ? (
                            <span className="text-[9.5px] text-indigo-400 font-bold font-mono flex items-center gap-1.5">
                              Generating... <span className="w-2.5 h-2.5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                            </span>
                          ) : selectedAgent.status === 'idle' || selectedAgent.status === 'waiting' ? (
                            <span className="text-[9.5px] text-emerald-400 font-bold font-mono flex items-center gap-1">
                              Completed <CheckCircle2 size={12} className="text-emerald-400" />
                            </span>
                          ) : (
                            <span className="text-[9.5px] text-slate-500 font-mono flex items-center gap-1.5">
                              Pending <span className="w-2.5 h-2.5 rounded-full border border-slate-600" />
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Last Handoff Card */}
                  {(() => {
                    const handoffEvents = auditLog.filter(e => e.action.toLowerCase().includes('handoff'));
                    const lastHandoff = handoffEvents.length > 0 ? handoffEvents[handoffEvents.length - 1] : null;
                    const handoffTime = lastHandoff ? timeAgo(lastHandoff.timestamp) : undefined;
                    return lastHandoff ? (
                      <div className="p-4 rounded-lg bg-[#11131a]/40 border border-white/5 space-y-3">
                        <span className="text-[8px] uppercase font-bold text-slate-500 tracking-wider block">Last Handoff</span>
                        <div className="flex items-center justify-between p-3 rounded bg-black/40 border border-[#1e293b]/40 text-xs">
                          <div className="flex flex-col">
                            <span className="text-[8px] uppercase font-bold text-slate-500 tracking-wider">Event</span>
                            <span className="text-white font-bold leading-none mt-1.5 flex items-center gap-1 truncate max-w-[180px]">
                              {lastHandoff.action}
                            </span>
                            <span className="text-[9px] text-slate-500 mt-1">{handoffTime}</span>
                          </div>
                          <ArrowRight size={14} className="text-slate-600 shrink-0 mx-2" />
                          <div className="flex flex-col">
                            <span className="text-[8px] uppercase font-bold text-slate-500 tracking-wider">Actor</span>
                            <span className="text-white font-bold leading-none mt-1.5 flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" /> {selectedAgent.name}
                            </span>
                            <span className="text-[9px] text-slate-500 mt-1">{lastHandoff.status}</span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="p-4 rounded-lg bg-[#11131a]/40 border border-white/5 space-y-3">
                        <span className="text-[8px] uppercase font-bold text-slate-500 tracking-wider block">Handoff</span>
                        <p className="text-xs text-slate-500">No handoff events recorded yet.</p>
                      </div>
                    );
                  })()}

                  {/* Description Card */}
                  <div className="p-4 rounded-lg bg-indigo-500/5 border border-indigo-500/10 space-y-2">
                    <span className="text-[8px] uppercase font-bold text-indigo-400 tracking-wider block">Description</span>
                    <p className="text-xs text-slate-400 leading-relaxed m-0">{selectedAgent.description}</p>
                  </div>
                </div>
              )}

              {activeTab === 'tasks' && (
                <div className="p-4 rounded-lg bg-[#11131a]/40 border border-white/5 space-y-3">
                  <span className="text-[9.5px] uppercase font-bold text-slate-500 tracking-wider block">Activity Log</span>
                  <div className="space-y-3 text-xs max-h-[400px] overflow-y-auto">
                    {auditLog
                      .filter(e =>
                        e.actor === selectedAgent.key ||
                        e.actor === `${selectedAgent.key} AGENT` ||
                        e.actor === `${selectedAgent.key}-agent`
                      )
                      .slice(-10)
                      .reverse()
                      .map((entry, idx) => (
                        <div key={idx} className="flex items-start gap-2.5">
                          {entry.status === 'error' ? (
                            <AlertCircle size={14} className="text-red-500 shrink-0 mt-0.5" />
                          ) : entry.status === 'warning' ? (
                            <ShieldAlert size={14} className="text-amber-500 shrink-0 mt-0.5" />
                          ) : (
                            <CheckCircle2 size={14} className="text-emerald-500 shrink-0 mt-0.5" />
                          )}
                          <div className="flex-1 min-w-0">
                            <span className="text-slate-300 block truncate">{entry.action}</span>
                            <span className="text-[9px] text-slate-500 font-mono">{entry.timestamp}</span>
                          </div>
                        </div>
                      ))}
                    {auditLog.filter(e =>
                      e.actor === selectedAgent.key ||
                      e.actor === `${selectedAgent.key} AGENT` ||
                      e.actor === `${selectedAgent.key}-agent`
                    ).length === 0 && (
                      <div className="text-slate-500 text-center py-4">No activity recorded yet.</div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'artifacts' && (
                <div className="p-4 rounded-lg bg-[#11131a]/40 border border-white/5 space-y-3">
                  <span className="text-[9.5px] uppercase font-bold text-slate-500 tracking-wider block">Generated Artifact Files</span>
                  <div className="flex items-center justify-between p-2.5 rounded bg-black/40 border border-white/5 text-xs">
                    <div className="flex items-center gap-2">
                      <FileCode size={14} className="text-indigo-400" />
                      <span className="text-slate-300 font-semibold font-mono">{selectedAgent.output || 'No output yet'}</span>
                    </div>
                    {selectedAgent.output && (
                      <span className="text-[9px] uppercase font-mono px-1.5 py-0.5 bg-slate-800 text-slate-400 rounded">
                        {selectedAgent.key.toLowerCase()}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'logs' && (
                <div className="space-y-3 flex flex-col">
                  <span className="text-[9.5px] uppercase font-bold text-slate-500 tracking-wider block">Logs Output Console</span>
                  <div className="w-full bg-[#050508] border border-white/5 rounded-lg p-3.5 font-mono text-[10px] text-slate-300 overflow-y-auto space-y-2 min-h-[300px]">
                    {customLogs.length > 0 ? customLogs.map((log, idx) => (
                      <div key={idx} className="whitespace-pre-wrap leading-normal border-l-2 border-indigo-500/20 pl-2">
                        {log}
                      </div>
                    )) : selectedAgent.status === 'running' ? (
                      <div className="flex items-center gap-2 text-indigo-400 font-semibold animate-pulse pl-2">
                        <RefreshCw size={11} className="animate-spin" />
                        <span>Processing workflow...</span>
                      </div>
                    ) : (
                      <div className="text-slate-600 text-center py-8 text-xs">
                        No logs available for this agent yet.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'handoffs' && (
                <div className="p-4 rounded-lg bg-[#11131a]/40 border border-white/5 space-y-3">
                  <span className="text-[9.5px] uppercase font-bold text-slate-500 tracking-wider block">Audit Trail</span>
                  <div className="space-y-4 relative pl-3.5 border-l border-white/5 max-h-[400px] overflow-y-auto">
                    {auditLog
                      .filter(e =>
                        e.actor === selectedAgent.key ||
                        e.actor === `${selectedAgent.key} AGENT` ||
                        e.actor === `${selectedAgent.key}-agent` ||
                        e.action.toLowerCase().includes('handoff')
                      )
                      .slice(-15)
                      .reverse()
                      .map((entry, idx) => (
                        <div key={idx} className="relative">
                          <span className={`absolute -left-[19.5px] top-1 w-2.5 h-2.5 rounded-full ${
                            entry.status === 'error' ? 'bg-red-500' :
                            entry.status === 'warning' ? 'bg-amber-500' :
                            'bg-emerald-500'
                          }`} />
                          <span className="text-[10px] text-slate-500 block font-mono">{entry.timestamp}</span>
                          <span className="text-xs text-white font-bold block mt-0.5">{entry.actor}</span>
                          <p className="text-[10.5px] text-slate-400 leading-normal mt-0.5">{entry.action}</p>
                        </div>
                      ))}
                    {auditLog.filter(e =>
                      e.actor === selectedAgent.key ||
                      e.actor === `${selectedAgent.key} AGENT` ||
                      e.actor === `${selectedAgent.key}-agent` ||
                      e.action.toLowerCase().includes('handoff')
                    ).length === 0 && (
                      <div className="text-slate-500 text-center py-4">No audit events recorded yet.</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </main>
  );
}
