/**
 * Agent Tasks page (formerly "Agent Gate"). Three-column layout:
 *  - LEFT:   SessionRail (session browser)
 *  - CENTER: 5 agent columns (ARCH/PO/UX/DEV/QA) with task lists
 *  - RIGHT:  InspectorPanel (Runtime Log / Tool Calls / Human Questions / …)
 *
 * Workflow data source: useWorkflowStore (SSE-driven). UI source: useUiStore.
 * No polling, no mirrors. Click an agent column → opens Output Review in the
 * right inspector; pending PO_CLARIFY gates auto-switch the inspector to the
 * Human Questions tab via selectRuntimeExecution + ClarificationPanel.
 */
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Check, Loader2, Clock, AlertCircle, SkipForward, PlayCircle,
  User, Palette, Code, ShieldCheck, Bug, Network,
} from 'lucide-react';
import { useUiStore, type InspectorTab } from '@/store/useUiStore';
import { useWorkflowStore, type ConnectionStatus } from '@/store/useWorkflowStore';
import { selectRuntimeExecution } from '@/store/workflowSelectors';
import type { AgentKey } from '@/models/SessionState';
import { AGENT_KEYS } from '@/models/SessionState';
import EmptyProjectState from './components/EmptyProjectState';
import FeatureRequestChatbox from './components/FeatureRequestChatbox';
import { SessionRail } from './components/SessionRail';
import { InspectorPanel } from './components/InspectorPanel';
import { useAppStore } from '@/store/useAppStore';

const AGENT_META: Record<AgentKey, { title: string; desc: string; icon: React.ReactNode }> = {
  ARCH: { title: 'Architecture (ARCH)', desc: 'System Design & Routing', icon: <Network size={18} className="text-cyan-400" /> },
  PO:   { title: 'Product Owner (PO)', desc: 'Requirements & Risk', icon: <User size={18} className="text-indigo-400" /> },
  UX:   { title: 'UI/UX Designer (UX)', desc: 'User Flows & Mockups', icon: <Palette size={18} className="text-pink-400" /> },
  DEV:  { title: 'Developer (DEV)', desc: 'Code & Build', icon: <Code size={18} className="text-emerald-400" /> },
  QA:   { title: 'Quality Assurance (QA)', desc: 'Validation', icon: <ShieldCheck size={18} className="text-amber-400" /> },
};

interface TaskItem {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'running' | 'gate_pending' | 'completed' | 'skipped' | 'failed';
}

const TASK_ICON: Record<TaskItem['status'], React.ReactNode> = {
  completed: <Check size={14} className="text-emerald-500" />,
  running: <Loader2 size={14} className="animate-spin text-blue-500" />,
  gate_pending: <Clock size={14} className="text-amber-500" />,
  failed: <AlertCircle size={14} className="text-error" />,
  skipped: <SkipForward size={14} className="text-on-surface-variant/60" />,
  pending: <PlayCircle size={14} className="text-on-surface-variant" />,
};

const TASK_LIST: Record<AgentKey, Array<{ id: string; title: string; description: string }>> = {
  ARCH: [
    { id: 'arch-1', title: 'Detect Architecture', description: 'Read repo tree, config files & detect tech stack.' },
    { id: 'arch-2', title: 'Generate Architecture_Brief.md', description: 'Output routing, modules & constraints.' },
  ],
  PO: [{ id: 'po-1', title: 'Generate PRD', description: 'Create product requirements document.' }],
  UX: [{ id: 'ux-1', title: 'Create HTML Mockup', description: 'Design interactive HTML interface.' }],
  DEV: [
    { id: 'dev-1', title: 'Generate Code Diff', description: 'Create and review code changes.' },
    { id: 'dev-2', title: 'Execute Build', description: 'Run compiler, linter, and tests.' },
  ],
  QA: [{ id: 'qa-1', title: 'Test & Verify', description: 'Create and auto-execute test cases.' }],
};

const STATUS_DOT_COLOR: Record<TaskItem['status'], string> = {
  pending: 'border-outline-variant/10 bg-transparent',
  running: 'border-blue-500/30 bg-blue-500/5',
  gate_pending: 'border-amber-500/30 bg-amber-500/5',
  completed: 'border-emerald-500/15 bg-emerald-500/5',
  failed: 'border-red-500/30 bg-red-500/5',
  skipped: 'border-dashed border-outline-variant/10 opacity-50',
};

const COLUMN_BORDER: Record<TaskItem['status'] | 'pending', string> = {
  pending: 'border-outline-variant/20',
  running: 'border-blue-500/30',
  gate_pending: 'border-amber-500/30',
  completed: 'border-emerald-500/20',
  skipped: 'border-dashed border-outline-variant/20',
  failed: 'border-red-500/30',
};

const TRANSLATED_ERROR: Array<[RegExp, string]> = [
  [/project_id with feature_request\.title/, 'Please select a Project before submitting a new feature request.'],
  [/Failed to start SDLC/, 'Could not start the agent pipeline. Please retry.'],
  [/Failed to check status/, 'Could not refresh status from the server. Reconnecting…'],
  [/Failed to resolve risk/, 'Could not respond to the security gate.'],
  [/Failed to submit final release/, 'Could not submit the release decision.'],
  [/Network Error|Failed to fetch/, 'Network error: cannot reach the backend.'],
];

function translateError(err: string | null): string | null {
  if (!err) return null;
  for (const [re, msg] of TRANSLATED_ERROR) {
    if (re.test(err)) return msg;
  }
  return err;
}

export default function SdlcDashboard() {
  const currentProjectId = useAppStore((s) => s.currentProjectId);
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const sessionsMap = useWorkflowStore((s) => s.sessions);
  const connection = useWorkflowStore((s) => {
    const conns = Object.values(s.sseConnections) as ConnectionStatus[];
    if (conns.length === 0) return 'idle' as ConnectionStatus;
    if (conns.some((c) => c === 'error')) return 'error' as ConnectionStatus;
    if (conns.every((c) => c === 'connected')) return 'connected' as ConnectionStatus;
    if (conns.some((c) => c === 'connecting')) return 'connecting' as ConnectionStatus;
    return 'idle' as ConnectionStatus;
  });
  const activeSessionId = useUiStore((s) => s.activeSessionId);
  const setActiveSession = useUiStore((s) => s.setActiveSession);
  const setInspectorTab = useUiStore((s) => s.setInspectorTab);
  const setSelectedGateId = useUiStore((s) => s.setSelectedGateId);

  const sessions = useMemo(() => Object.values(sessionsMap), [sessionsMap]);

  // Project RuntimeExecution outside the Zustand selector — the selector
  // allocates a fresh object per call and would otherwise create an
  // infinite-render loop.
  const runtime = useMemo(
    () => (activeSessionId ? selectRuntimeExecution({ sessions: sessionsMap } as never, activeSessionId) : null),
    [sessionsMap, activeSessionId],
  );
  const activeSession = activeSessionId ? sessionsMap[activeSessionId] ?? null : null;

  const focusRequest = searchParams.get('focusRequest') === 'true';
  const deepLinkSessionId = searchParams.get('sessionId');

  // Deep-link: when navigated from elsewhere with ?sessionId=…, switch into it.
  useEffect(() => {
    if (deepLinkSessionId && deepLinkSessionId !== activeSessionId && sessions.find((s) => s.sessionId === deepLinkSessionId)) {
      setActiveSession(deepLinkSessionId);
    }
  }, [deepLinkSessionId, activeSessionId, sessions, setActiveSession]);

  // Open the questions tab when a clarification gate is the only thing waiting.
  // T2 (B1) — every agent can raise a clarification gate (PO/UX/DEV/QA + ARCH
  // emits AGENT_CLARIFY). Match all of them so ARCH/UX/DEV/QA questions also
  // auto-route to the inspector.
  const CLARIFICATION_TYPES = new Set(['PO_CLARIFY', 'UX_CLARIFY', 'DEV_CLARIFY', 'QA_CLARIFY', 'AGENT_CLARIFY']);
  const clarificationGateId = activeSession?.pendingGates.find((g) => CLARIFICATION_TYPES.has(g.type))?.id ?? null;
  useEffect(() => {
    if (clarificationGateId) {
      setInspectorTab('questions');
      setSelectedGateId(clarificationGateId);
    }
  }, [clarificationGateId, setInspectorTab, setSelectedGateId]);

  // ── Task status derivation per agent column ──
  const tasksForAgent = (agent: AgentKey, phaseStatus: string): TaskItem[] => {
    const map: Record<TaskItem['status'], TaskItem['status']> = {
      pending: 'pending',
      running: 'running',
      gate_pending: 'gate_pending',
      completed: 'completed',
      skipped: 'skipped',
      failed: 'failed',
    };
    const list = TASK_LIST[agent];
    return list.map((t, idx) => {
      let status: TaskItem['status'] = 'pending';
      if (phaseStatus === 'pending') status = 'pending';
      else if (phaseStatus === 'running') status = idx === 0 ? 'running' : 'pending';
      else if (phaseStatus === 'gate_pending') status = 'gate_pending';
      else if (phaseStatus === 'completed') status = 'completed';
      else if (phaseStatus === 'skipped') status = 'skipped';
      else if (phaseStatus === 'failed') status = 'failed';
      return { ...t, status: map[status] ?? 'pending' };
    });
  };

  const phaseStatusFor = (agent: AgentKey): string => {
    if (!runtime) return 'pending';
    return runtime.phases.find((p) => p.agent === agent)?.status ?? 'pending';
  };

  const onColumnClick = (agent: AgentKey) => {
    const reviewGate = activeSession?.pendingGates.find((g) => g.type === `${agent}_OUTPUT_REVIEW`);
    if (reviewGate) {
      setSelectedGateId(reviewGate.id);
      setInspectorTab('review');
      return;
    }
    // No pending review gate — drop back to the runtime log (artifact is now
    // embedded in the Output Review panel per spec §6.3).
    setInspectorTab('runtime');
  };

  const translatedError = translateError(activeSession?.error ?? null);
  const sessionStatus = activeSession?.status ?? 'idle';

  if (!currentProjectId) {
    return (
      <main className="flex h-full min-h-0 flex-col overflow-y-auto bg-background p-6 text-on-surface">
        <EmptyProjectState />
      </main>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full">
      {/* ─────────────────────────── LEFT RAIL ─────────────────────────── */}
      <SessionRail onNewSession={() => {
        const params = new URLSearchParams(searchParams);
        params.set('focusRequest', 'true');
        setSearchParams(params);
      }} />

      {/* ─────────────────────────── CENTER ─────────────────────────── */}
      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-background text-on-surface">
        {/* header */}
        <header className="flex items-center justify-between border-b border-outline-variant/20 px-6 py-3">
          <div className="flex items-center gap-3">
            <h1 className="text-sm font-bold uppercase tracking-[0.14em] text-on-surface">Agent Tasks</h1>
            <SessionPill status={sessionStatus} connection={connection} />
          </div>
          <div className="flex items-center gap-2">
            {/* T4 (B3): Audit Trail button removed per spec §8.2. Runtime Log is
                the single timeline; the inspector already exposes it. */}
            <button
              onClick={() => {
                const params = new URLSearchParams(searchParams);
                params.set('focusRequest', 'true');
                setSearchParams(params);
              }}
              className="rounded-md bg-primary px-3 py-1 text-[11px] font-bold text-on-primary hover:bg-primary/90"
            >
              New session
            </button>
          </div>
        </header>

        {translatedError && (
          <div className="mx-6 mb-3 mt-3 flex items-center gap-2 rounded-lg border border-error/25 bg-error/10 p-3 text-[12px] text-error">
            <Bug size={13} />
            {translatedError}
          </div>
        )}

        {focusRequest && <FeatureRequestChatbox onClose={() => {
          const params = new URLSearchParams(searchParams);
          params.delete('focusRequest');
          setSearchParams(params);
        }} />}

        {/* center workspace */}
        <div className="flex min-h-0 flex-1 flex-col gap-4 p-6">
          {!activeSession && sessions.length === 0 && <NoSessionEmptyState onNew={() => {
            const params = new URLSearchParams(searchParams);
            params.set('focusRequest', 'true');
            setSearchParams(params);
          }} />}

          {sessions.length > 0 && !activeSession && (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-outline-variant/40 py-16 text-center">
              <Loader2 size={28} className="text-primary/60" />
              <p className="text-sm font-semibold text-on-surface">Pick a session from the left rail</p>
              <p className="text-[11px] text-on-surface-variant/70">Or start a new feature request.</p>
            </div>
          )}

          {activeSession && (
            <>
              <SessionSummaryBar session={activeSession} runtime={runtime} />

              {/* 5 agent columns */}
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-5">
                {AGENT_KEYS.map((agent) => {
                  const ps = phaseStatusFor(agent);
                  const tasks = tasksForAgent(agent, ps);
                  const meta = AGENT_META[agent];
                  const phase = activeSession.pipelinePhases.find((p) => p.agent === agent);
                  const canOpenPanel = ps === 'completed' || ps === 'gate_pending' || ps === 'failed';
                  const borderClass = COLUMN_BORDER[ps as keyof typeof COLUMN_BORDER] ?? COLUMN_BORDER.pending;

                  return (
                    <div
                      key={agent}
                      onClick={() => canOpenPanel && onColumnClick(agent)}
                      className={`flex flex-col gap-2.5 rounded-xl border bg-surface-container/60 p-4 transition-all ${borderClass} ${canOpenPanel ? 'cursor-pointer hover:border-white/30' : ''}`}
                    >
                      <div className="flex items-start justify-between gap-2 border-b border-outline-variant/20 pb-3">
                        <div className="flex items-center gap-2">
                          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-container-high/60">
                            {meta.icon}
                          </div>
                          <div className="min-w-0">
                            <h3 className="truncate text-[11px] font-bold uppercase tracking-wider text-on-surface">{agent}</h3>
                            <p className="truncate text-[9px] text-on-surface-variant">{meta.desc}</p>
                          </div>
                        </div>
                        <PhaseChip status={ps} />
                      </div>

                      {phase?.duration && (
                        <div className="font-mono text-[9px] font-semibold text-primary">⏱ {phase.duration}</div>
                      )}

                      <div className="flex flex-col gap-1.5">
                        {tasks.map((task) => (
                          <div
                            key={task.id}
                            className={`flex items-start gap-2 rounded-lg border p-2 ${STATUS_DOT_COLOR[task.status]}`}
                          >
                            <span className="mt-0.5 shrink-0">{TASK_ICON[task.status]}</span>
                            <div className="min-w-0 flex-1">
                              <span className="block truncate text-[11px] font-semibold text-on-surface">{task.title}</span>
                              <p className="mt-0.5 text-[9.5px] leading-relaxed text-on-surface-variant">
                                {task.status === 'skipped' ? 'Skipped for this execution path.' : task.description}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </main>

      {/* ─────────────────────────── RIGHT INSPECTOR ─────────────────────────── */}
      {activeSession && <InspectorPanel />}
    </div>
  );
}

// ── Subcomponents ──

function SessionPill({ status, connection }: { status: string; connection: ConnectionStatus }) {
  const color =
    status === 'completed' ? 'bg-emerald-500/15 text-emerald-400'
    : status === 'failed' ? 'bg-red-500/15 text-red-400'
    : status === 'awaiting_approval' ? 'bg-amber-500/15 text-amber-400'
    : status === 'running' ? 'bg-blue-500/15 text-blue-300'
    : 'bg-surface-container text-on-surface-variant/70';
  const connColor =
    connection === 'connected' ? 'bg-emerald-500'
    : connection === 'connecting' ? 'bg-blue-500 animate-pulse'
    : connection === 'error' ? 'bg-red-500'
    : 'bg-on-surface-variant/30';
  return (
    <div className="flex items-center gap-2">
      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${color}`}>{status.replace('_', ' ')}</span>
      <span className="flex items-center gap-1 text-[10px] text-on-surface-variant/70">
        <span className={`h-1.5 w-1.5 rounded-full ${connColor}`} />
        {connection}
      </span>
    </div>
  );
}

function SessionSummaryBar({
  session,
  runtime,
}: {
  session: NonNullable<ReturnType<typeof useWorkflowStore.getState>['sessions'][string]>;
  runtime: ReturnType<typeof selectRuntimeExecution>;
}) {
  const completed = session.pipelinePhases.filter((p) => p.status === 'completed').length;
  const percent = Math.round((completed / 5) * 100);
  const gateCount = session.pendingGates.length;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-outline-variant/30 bg-surface-container-lowest px-4 py-2.5 text-[11px]">
      <div className="flex items-center gap-2 text-on-surface">
        <span className="font-bold">「{session.featureRequest || 'Untitled'}」</span>
        <code className="rounded bg-surface-container px-1.5 py-0.5 font-mono text-[10px] text-on-surface-variant">{session.sessionId.slice(0, 8)}</code>
      </div>
      <div className="flex items-center gap-3 text-on-surface-variant">
        <span>{completed}/5 phases · {percent}%</span>
        {runtime?.currentAgent && (
          <span className="flex items-center gap-1">
            <Loader2 size={10} className="animate-spin text-blue-400" />
            <b className="text-on-surface">{runtime.currentAgent}</b>
          </span>
        )}
        <span className={`flex items-center gap-1 ${gateCount > 0 ? 'text-amber-400' : ''}`}>
          <Clock size={10} />
          {gateCount} pending
        </span>
      </div>
    </div>
  );
}

function PhaseChip({ status }: { status: string }) {
  const cfg =
    status === 'completed' ? 'bg-emerald-500/20 text-emerald-400'
    : status === 'running' ? 'bg-blue-500/20 text-blue-300'
    : status === 'gate_pending' ? 'bg-amber-500/20 text-amber-400'
    : status === 'failed' ? 'bg-red-500/20 text-red-400'
    : status === 'skipped' ? 'bg-outline-variant/30 text-on-surface-variant'
    : 'bg-surface-container text-on-surface-variant/70';
  return (
    <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider ${cfg}`}>
      {status.replace('_', ' ')}
    </span>
  );
}

function NoSessionEmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-outline-variant/40 py-16 text-center">
      <Network size={28} className="text-on-surface-variant/40" />
      <p className="text-sm font-semibold text-on-surface">Start your first workflow</p>
      <p className="text-[11px] text-on-surface-variant/70">Submit a feature request to begin.</p>
      <button onClick={onNew} className="mt-2 rounded-md bg-primary px-3 py-1.5 text-[11px] font-bold text-on-primary hover:bg-primary/90">
        New session
      </button>
    </div>
  );
}
