import { useEffect, useMemo, useState } from 'react';
import {
  Activity, Terminal, MessageCircle, FileCheck2, FileCode2, History,
  Loader2, AlertTriangle, CheckCircle2, X,
} from 'lucide-react';
import { useUiStore, type InspectorTab } from '@/store/useUiStore';
import { useWorkflowStore } from '@/store/useWorkflowStore';
import {
  selectRuntimeExecution,
  type RuntimeArtifact,
  type RuntimeTimelineEntry,
  type RuntimeExecution,
} from '@/store/workflowSelectors';
import { ClarificationPanel } from './ClarificationPanel';
import { getSdlcTaskStatus, type GateItem } from '@/services/api/sdlcApi';

const TABS: Array<{ id: InspectorTab; label: string; icon: React.ReactNode }> = [
  { id: 'runtime', label: 'Runtime log', icon: <Activity size={12} /> },
  { id: 'tools', label: 'Tool calls', icon: <Terminal size={12} /> },
  { id: 'questions', label: 'Human questions', icon: <MessageCircle size={12} /> },
  { id: 'review', label: 'Output review', icon: <FileCheck2 size={12} /> },
  { id: 'artifact', label: 'Artifact preview', icon: <FileCode2 size={12} /> },
  { id: 'decisions', label: 'Decision history', icon: <History size={12} /> },
];

interface InspectorPanelProps {
  onReviewResolved?: () => void;
}

export function InspectorPanel({ onReviewResolved }: InspectorPanelProps) {
  const tab = useUiStore((s) => s.inspectorTab);
  const setTab = useUiStore((s) => s.setInspectorTab);
  const sessionId = useUiStore((s) => s.activeSessionId);
  const selectedGateId = useUiStore((s) => s.selectedGateId);
  const setSelectedGateId = useUiStore((s) => s.setSelectedGateId);

  const sessionsMap = useWorkflowStore((s) => s.sessions);
  // Project RuntimeExecution outside the Zustand selector — the selector
  // allocates a fresh object per call and would otherwise create an
  // infinite-render loop.
  const runtime: RuntimeExecution | null = useMemo(
    () => (sessionId ? selectRuntimeExecution({ sessions: sessionsMap } as never, sessionId) : null),
    [sessionsMap, sessionId],
  );

  const gates: GateItem[] = runtime?.session.pendingGates ?? [];
  const activeGate: GateItem | null = useMemo(() => {
    if (!selectedGateId) return null;
    return gates.find((g) => g.id === selectedGateId) ?? null;
  }, [selectedGateId, gates]);

  // Auto-jump to "questions" when a clarification gate lands.
  useEffect(() => {
    if (activeGate?.type === 'PO_CLARIFY' && tab !== 'questions') {
      setTab('questions');
    }
  }, [activeGate?.id, tab, setTab]);

  return (
    <aside className="flex h-full min-h-0 flex-col border-l border-outline-variant/40 bg-surface-container-lowest">
      <nav className="flex shrink-0 flex-wrap items-center gap-1 border-b border-outline-variant/30 px-2 py-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[10.5px] font-semibold transition-colors ${
              tab === t.id
                ? 'bg-primary/15 text-primary'
                : 'text-on-surface-variant/80 hover:bg-surface-container hover:text-on-surface'
            }`}
          >
            {t.icon}
            <span>{t.label}</span>
            {t.id === 'questions' && gates.filter((g) => g.type === 'PO_CLARIFY').length > 0 && (
              <span className="ml-1 rounded-full bg-amber-500/30 px-1.5 text-[9px] font-bold text-amber-400">
                {gates.filter((g) => g.type === 'PO_CLARIFY').length}
              </span>
            )}
            {t.id === 'review' && gates.filter((g) => g.type.endsWith('_OUTPUT_REVIEW')).length > 0 && (
              <span className="ml-1 rounded-full bg-indigo-500/30 px-1.5 text-[9px] font-bold text-indigo-300">
                {gates.filter((g) => g.type.endsWith('_OUTPUT_REVIEW')).length}
              </span>
            )}
          </button>
        ))}
      </nav>

      <div className="flex-1 overflow-y-auto p-4">
        {!sessionId && <EmptyState />}
        {sessionId && tab === 'runtime' && <RuntimeLogTab events={runtime?.events ?? []} />}
        {sessionId && tab === 'tools' && <ToolCallsTab tools={runtime?.runtimeEvents ?? []} />}
        {sessionId && tab === 'questions' && (
          <QuestionsTab
            sessionId={sessionId}
            gates={gates}
            activeGate={activeGate}
            onSelectGate={(id) => setSelectedGateId(id)}
          />
        )}
        {sessionId && tab === 'review' && (
          <OutputReviewTab
            sessionId={sessionId}
            gates={gates.filter((g) => g.type.endsWith('_OUTPUT_REVIEW') || g.type === 'FINAL_RELEASE')}
            activeGate={gates.find((g) => g.id === selectedGateId && (g.type.endsWith('_OUTPUT_REVIEW') || g.type === 'FINAL_RELEASE')) ?? null}
            onSelectGate={(id) => setSelectedGateId(id)}
            onResolved={() => { setSelectedGateId(null); onReviewResolved?.(); }}
          />
        )}
        {sessionId && tab === 'artifact' && <ArtifactTab artifact={runtime?.artifact ?? null} />}
        {sessionId && tab === 'decisions' && <DecisionsTab history={runtime?.session.gateHistory ?? []} />}
      </div>
    </aside>
  );
}

// ── Empty State ──

function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center text-on-surface-variant/60">
      <Activity size={28} />
      <p className="mt-2 text-xs">Select a session to inspect its runtime.</p>
    </div>
  );
}

// ── Runtime Log ──

function RuntimeLogTab({ events }: { events: RuntimeTimelineEntry[] }) {
  if (events.length === 0) {
    return <div className="text-[11px] text-on-surface-variant/60">Waiting for runtime events…</div>;
  }
  return (
    <div className="space-y-1.5">
      {events.slice().reverse().map((evt) => (
        <div
          key={evt.id}
          className="flex items-start gap-2 rounded-lg border border-outline-variant/20 bg-surface-container/60 px-3 py-2"
        >
          <span
            className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${
              evt.status === 'error'
                ? 'bg-red-500'
                : evt.status === 'warning'
                  ? 'bg-amber-500'
                  : evt.status === 'pending'
                    ? 'bg-blue-500'
                    : 'bg-emerald-500'
            }`}
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between text-[10px] text-on-surface-variant/70">
              <span className="font-bold uppercase tracking-wider text-on-surface">{evt.actor}</span>
              <span className="font-mono">
                {new Date(evt.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            </div>
            <p className="text-[11px] text-on-surface">{evt.action}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Tool Calls (from runtimeEvents of type agent_tool_call / file_change) ──

function ToolCallsTab({ tools }: { tools: import('@/models/SessionState').RuntimeEvent[] }) {
  const toolEvents = tools.filter((t) => t.type === 'agent_tool_call' || t.type === 'file_change');
  if (toolEvents.length === 0) {
    return <div className="text-[11px] text-on-surface-variant/60">No tool calls yet.</div>;
  }
  return (
    <div className="space-y-1.5">
      {toolEvents.slice().reverse().map((evt) => (
        <div key={evt.id} className="rounded-lg border border-outline-variant/20 bg-surface-container/60 p-2.5">
          <div className="flex items-center justify-between text-[10px] text-on-surface-variant/80">
            <span className="font-bold uppercase tracking-wider">{evt.agent ?? 'system'}</span>
            <span className="font-mono">
              {new Date(evt.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          </div>
          <div className="mt-1 text-[11px]">
            <span className="font-bold text-cyan-300">{evt.tool ?? evt.type}</span>
            {evt.filePath && (
              <code className="ml-1.5 rounded bg-black/30 px-1.5 py-0.5 text-[10px] text-on-surface">{evt.filePath}</code>
            )}
            {evt.action && <p className="mt-0.5 text-on-surface-variant">{evt.action}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Human Questions ──

function QuestionsTab({
  sessionId,
  gates,
  activeGate,
  onSelectGate,
}: {
  sessionId: string;
  gates: GateItem[];
  activeGate: GateItem | null;
  onSelectGate: (id: string) => void;
}) {
  const questionGates = gates.filter((g) => g.type === 'PO_CLARIFY');
  if (questionGates.length === 0) {
    return <div className="text-[11px] text-on-surface-variant/60">No pending questions. Agents are running autonomously.</div>;
  }
  return (
    <div className="flex flex-col gap-3">
      {questionGates.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {questionGates.map((g) => (
            <button
              key={g.id}
              onClick={() => onSelectGate(g.id)}
              className={`rounded-md px-2 py-1 text-[10px] font-bold ${
                activeGate?.id === g.id
                  ? 'bg-cyan-500/20 text-cyan-300'
                  : 'bg-surface-container text-on-surface-variant/70 hover:text-on-surface'
              }`}
            >
              {g.id.slice(0, 8)}
            </button>
          ))}
        </div>
      )}
      {activeGate && activeGate.type === 'PO_CLARIFY' ? (
        <ClarificationPanel sessionId={sessionId} gate={activeGate} />
      ) : (
        <div className="text-[11px] text-on-surface-variant/60">Select a question to answer.</div>
      )}
    </div>
  );
}

// ── Output Review ──

function OutputReviewTab({
  sessionId,
  gates,
  activeGate,
  onSelectGate,
  onResolved,
}: {
  sessionId: string;
  gates: GateItem[];
  activeGate: GateItem | null;
  onSelectGate: (id: string) => void;
  onResolved: () => void;
}) {
  if (gates.length === 0) {
    return <div className="text-[11px] text-on-surface-variant/60">No output review requested yet.</div>;
  }
  if (!activeGate && gates.length > 0) {
    onSelectGate(gates[0].id);
    return null;
  }
  if (!activeGate) return null;

  // For per-agent output_review gates, render a slim inline panel that calls
  // the workflow store action directly (no AgentOutputPanel modal needed —
  // the value is showing the gate payload and a quick approve/reject).
  return (
    <OutputReviewInline
      sessionId={sessionId}
      gate={activeGate}
      onResolved={onResolved}
    />
  );
}

function OutputReviewInline({
  sessionId,
  gate,
  onResolved,
}: {
  sessionId: string;
  gate: GateItem;
  onResolved: () => void;
}) {
  const resolveOutputReviewGate = useWorkflowStore((s) => s.resolveOutputReviewGate);
  const releaseDecision = useWorkflowStore((s) => s.releaseDecision);
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const summary = (gate.payload?.outputSummary as string | null) ?? null;
  const issues = gate.payload?.validationIssues ?? [];
  const isRelease = gate.type === 'FINAL_RELEASE';

  const submit = async (action: 'approve' | 'reject') => {
    setBusy(action);
    setError(null);
    try {
      if (isRelease) {
        await releaseDecision(sessionId, action, comment.trim() || undefined);
      } else {
        await resolveOutputReviewGate(sessionId, gate.id, action, comment.trim() || undefined);
      }
      onResolved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-4">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-indigo-300">
          <FileCheck2 size={12} />
          {gate.type === 'FINAL_RELEASE' ? 'Release decision' : `${gate.type.replace('_OUTPUT_REVIEW', '')} output review`}
        </span>
        {issues.length > 0 && (
          <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-[9px] font-bold text-red-400">
            {issues.length} issue{issues.length > 1 ? 's' : ''}
          </span>
        )}
      </div>

      {summary && (
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant">
            Output summary
          </label>
          <div className="rounded-lg bg-surface-container/60 px-3 py-2 text-[12px] leading-relaxed text-on-surface">{summary}</div>
        </div>
      )}

      {issues.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {issues.map((issue, idx) => (
            <div key={idx} className="flex items-start gap-1.5 rounded-lg border border-red-500/15 bg-red-500/5 p-2 text-[11px] text-red-300">
              <AlertTriangle size={11} className="mt-0.5 shrink-0" />
              <span>{issue.message || issue.rule}</span>
            </div>
          ))}
        </div>
      )}

      <textarea
        rows={2}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Reason for rejection (required to reject)…"
        className="resize-none rounded-lg border border-outline-variant/30 bg-surface-container/60 px-2.5 py-1.5 text-[11px] text-on-surface outline-none focus:border-red-500/40"
      />

      {error && <div className="rounded-md bg-error/10 px-2 py-1 text-[10px] text-error">{error}</div>}

      <div className="flex gap-2">
        <button
          onClick={() => submit('reject')}
          disabled={busy !== null || (!isRelease && !comment.trim())}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-red-600/10 px-2 py-2 text-[11px] font-bold text-red-400 transition-colors hover:bg-red-600/20 disabled:opacity-40"
        >
          <X size={12} />
          Reject
        </button>
        <button
          onClick={() => submit('approve')}
          disabled={busy !== null}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-2 py-2 text-[11px] font-bold text-white transition-colors hover:bg-emerald-500 disabled:opacity-40"
        >
          {busy === 'approve' ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
          Approve
        </button>
      </div>
    </div>
  );
}

// ── Artifact Preview ──

function ArtifactTab({ artifact }: { artifact: RuntimeArtifact | null }) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!artifact?.taskId) {
      setContent(null);
      return;
    }
    setLoading(true);
    getSdlcTaskStatus(artifact.taskId)
      .then((task) => {
        if (cancelled) return;
        const summary = task?.result?.summary ?? task?.artifacts?.[0]?.contentText ?? '';
        const agentOutputJson = task?.artifacts?.find((a: { type: string }) => a.type === 'agent_output')?.contentJson;
        const jsonSummary = agentOutputJson ? JSON.stringify(agentOutputJson, null, 2) : '';
        setContent([summary, jsonSummary].filter(Boolean).join('\n\n') || 'No content available for this artifact yet.');
      })
      .catch(() => {
        if (!cancelled) setContent('Failed to load artifact content.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [artifact?.taskId]);

  if (!artifact) {
    return (
      <div className="flex flex-col items-center gap-2 text-[11px] text-on-surface-variant/60">
        <FileCode2 size={24} className="opacity-50" />
        <span>No artifact available for the current run.</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <FileCode2 size={14} className="text-cyan-400" />
        <div>
          <h3 className="text-[12px] font-bold text-on-surface">{artifact.title}</h3>
          <p className="text-[10px] uppercase tracking-wider text-on-surface-variant">{artifact.type} · {artifact.agent}</p>
        </div>
      </div>
      {loading ? (
        <div className="flex items-center gap-2 text-[11px] text-on-surface-variant"><Loader2 size={12} className="animate-spin" /> Loading…</div>
      ) : (
        <pre className="max-h-[420px] overflow-y-auto whitespace-pre-wrap rounded-lg border border-outline-variant/20 bg-black/30 p-3 font-mono text-[10.5px] leading-relaxed text-on-surface">
{content ?? 'No content available for this artifact yet.'}
        </pre>
      )}
    </div>
  );
}

// ── Decision History ──

function DecisionsTab({ history }: { history: import('@/models/SessionState').GateHistoryEntry[] }) {
  if (history.length === 0) {
    return <div className="text-[11px] text-on-surface-variant/60">No decisions made yet.</div>;
  }
  return (
    <ol className="flex flex-col gap-2">
      {history.map((entry, idx) => (
        <li key={`${entry.gateId}_${idx}`} className="rounded-lg border border-outline-variant/20 bg-surface-container/60 p-3">
          <div className="flex items-center justify-between text-[10px]">
            <span className="font-bold uppercase tracking-wider text-on-surface">{entry.agent ?? 'system'}</span>
            <span className="font-mono text-on-surface-variant">
              {new Date(entry.resolvedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-[11px]">
            <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
              entry.decision === 'approve'
                ? 'bg-emerald-500/15 text-emerald-400'
                : entry.decision === 'reject'
                  ? 'bg-red-500/15 text-red-400'
                  : 'bg-blue-500/15 text-blue-400'
            }`}>{entry.decision}</span>
            <span className="text-on-surface-variant">{entry.type}</span>
          </div>
          {entry.comment && <p className="mt-1 text-[11px] italic text-on-surface-variant">“{entry.comment}”</p>}
        </li>
      ))}
    </ol>
  );
}
