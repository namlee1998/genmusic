// Primary /aifa workflow board.
//
// Beginner reading guide:
// - refetch() polls the backend board view-model every 2.5 seconds.
// - uploadAndSeed() copies the selected folder to the backend and starts a board.
// - review/release handlers call sdlcApi and then refresh the board.
// - real_single mode shows one interactive run; staged demo mode can show three
//   independent review flows.
//
// Self-contained inline styles (light theme) so the board never collides with
// the dashboard CSS. Route: /aifa.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createProject } from '@/services/api/documentsApi';
import {
  seedDemoBoard,
  getDemoBoard,
  getDemoUxDoc,
  retryDemoFlow,
  getWorkflowTimeline,
  getProjectArtifacts,
  uploadRepoFolder,
  submitGateDecision,
  submitReleaseDecision,
  downloadReleaseFile,
  resolveApproval,
  type DemoBoard,
  type BoardFlow,
  type PendingGate,
  type WorkflowTimelineEvent,
} from '@/services/api/sdlcApi';

const uuid = () => (crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
const FEATURE_SLUG = 'add-google-login';

// Heavy / generated folders we never upload — keeps the repo payload small.
const IGNORE_UPLOAD = /(^|\/)(node_modules|\.git|dist|build|out|\.next|\.turbo|\.cache|coverage|\.venv|__pycache__)(\/|$)/;
const MAX_UPLOAD_FILE_SIZE = 25 * 1024 * 1024;

interface LocalFileHandle {
  kind: 'file';
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<{ write(data: Blob | string): Promise<void>; close(): Promise<void> }>;
}
interface LocalDirectoryHandle {
  kind: 'directory';
  name: string;
  values(): AsyncIterableIterator<LocalFileHandle | LocalDirectoryHandle>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<LocalFileHandle>;
}

const collectDirectoryFiles = async (
  directory: LocalDirectoryHandle,
  rootName = directory.name,
  prefix = '',
): Promise<Array<File & { relativePath?: string }>> => {
  const files: Array<File & { relativePath?: string }> = [];
  for await (const entry of directory.values()) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.kind === 'directory') {
      if (!IGNORE_UPLOAD.test(`/${relativePath}/`)) {
        files.push(...await collectDirectoryFiles(entry, rootName, relativePath));
      }
      continue;
    }
    const file = await entry.getFile() as File & { relativePath?: string };
    file.relativePath = `${rootName}/${relativePath}`;
    files.push(file);
  }
  return files;
};

// Per-agent accent colour (matches the FE design: PO purple, DEV blue, QA green).
const ACCENT: Record<string, { solid: string; soft: string; text: string }> = {
  po:  { solid: '#7c3aed', soft: '#f3effe', text: '#6d28d9' },
  ux:  { solid: '#0891b2', soft: '#ecfeff', text: '#0e7490' },
  dev: { solid: '#2563eb', soft: '#eff4ff', text: '#1d4ed8' },
  qa:  { solid: '#16a34a', soft: '#effaf1', text: '#15803d' },
};
const accentFor = (stage?: string | null) => ACCENT[stage || ''] || ACCENT.po;

// Quick-fill templates for the "Request changes" dialog (stage-aware).
const QUICK_FIXES: Record<string, string[]> = {
  po: [
    'User stories are missing acceptance criteria — please add them.',
    'Scope is too broad; trim it to the core Google login flow.',
    'Clarify which Google account types are allowed (personal vs workspace).',
  ],
  dev: [
    'Add a unit test for the OAuth callback / CSRF state check.',
    'The diff touches files outside the agreed scope — narrow it.',
    'Document the session-persistence approach in the implementation plan.',
  ],
  qa: [
    'Increase coverage for the OAuth error and edge paths.',
    'A blocking risk is unaddressed — re-run after fixing it.',
    'Attach the full test-run evidence before this can be approved.',
  ],
};
const quickFixesFor = (stage?: string | null) => QUICK_FIXES[stage || ''] || [
  'Please revise this output and address the gaps before approval.',
  'Add the missing details and regenerate.',
  'Align the output with the agreed scope and acceptance criteria.',
];

const unavailableFlow = (flowNo: number, target: string): BoardFlow => ({
  flowNo,
  target,
  active: false,
  status: 'unavailable',
  repo: 'local · add google login',
  branch: 'main',
  progress: { done: 0, total: 4 },
  currentPhase: 'TEMPORARY_NOT_AVAILABLE',
  waitingFor: null,
  reviewStage: null,
  phases: [],
  card: null,
  failure: null,
  pendingGates: [],
  releaseGate: { eligible: false, status: 'locked', canDecide: false, approvalBlocked: true },
  released: null,
});

interface ReviewDialog { flowNo: number; taskId: string; stage: string; comment: string }
interface ArtifactReview {
  flowNo: number;
  stage: string;
  loading: boolean;
  error?: string | null;
  artifacts: Array<{ type?: string; artifactType?: string; contentText?: string | null; contentJson?: unknown }>;
}
interface TimelineState {
  loading: boolean;
  error?: string | null;
  events: WorkflowTimelineEvent[];
}

export default function AifaDemo() {
  const [board, setBoard] = useState<DemoBoard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [dialog, setDialog] = useState<ReviewDialog | null>(null);
  const [artifactReview, setArtifactReview] = useState<ArtifactReview | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [folderLabel, setFolderLabel] = useState('');
  const [savedFiles, setSavedFiles] = useState<Record<number, string>>({});
  const [timelineOpen, setTimelineOpen] = useState<Record<number, boolean>>({});
  const [timelines, setTimelines] = useState<Record<string, TimelineState>>({});
  const [gateAnswers, setGateAnswers] = useState<Record<string, string>>({});
  const dirHandleRef = useRef<LocalDirectoryHandle | null>(null);
  const stagingProjectRef = useRef<string | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const uxDocWrittenRef = useRef<Set<string>>(new Set()); // UX task ids already written to the folder

  const refetch = useCallback(async () => {
    try {
      const b = await getDemoBoard();
      setBoard(b);
      return b;
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Could not load the board');
      return null;
    }
  }, []);

  const loadTimeline = useCallback(async (projectId: string) => {
    setTimelines((current) => ({
      ...current,
      [projectId]: { events: current[projectId]?.events || [], loading: true, error: null },
    }));
    try {
      const timeline = await getWorkflowTimeline(projectId);
      setTimelines((current) => ({
        ...current,
        [projectId]: { events: timeline.events || [], loading: false, error: null },
      }));
    } catch (e: any) {
      setTimelines((current) => ({
        ...current,
        [projectId]: {
          events: current[projectId]?.events || [],
          loading: false,
          error: e?.response?.data?.message || e?.message || 'Could not load timeline',
        },
      }));
    }
  }, []);

  // Poll live state only (NO auto-seed — the board is created from an opened repo).
  useEffect(() => {
    let stop = false;
    refetch();
    const id = setInterval(() => { if (!stop) refetch(); }, 2500);
    return () => { stop = true; clearInterval(id); };
  }, [refetch]);

  useEffect(() => {
    for (const flow of board?.flows || []) {
      if (timelineOpen[flow.flowNo] && flow.projectId) {
        loadTimeline(flow.projectId);
      }
    }
  }, [board, timelineOpen, loadTimeline]);

  const mark = (key: string, on: boolean) => setBusy((b) => ({ ...b, [key]: on }));

  // ── Open folder → upload cloned repo → seed the 3 flows on it ──────────────
  const uploadAndSeed = async (selected: Array<File & { relativePath?: string }>, folderName: string) => {
    const files = selected.filter((f) => {
      const rel = (f.relativePath || (f as any).webkitRelativePath || f.name).replace(/\\/g, '/');
      return !IGNORE_UPLOAD.test(rel) && f.size <= MAX_UPLOAD_FILE_SIZE;
    });
    if (!files.length) { setError('That folder has no uploadable files.'); return; }
    setError(null);
    setSavedFiles({});
    uxDocWrittenRef.current.clear();
    setTimelineOpen({});
    setTimelines({});
    setUploading(true);
    setUploadPct(0);
    setFolderLabel(`${folderName} (${files.length} files)`);
    try {
      const stagingId = stagingProjectRef.current
        || (await createProject(`AIFA Board Repo ${new Date().toISOString().slice(0, 10)}`)).data.project_id;
      stagingProjectRef.current = stagingId;
      const up = await uploadRepoFolder(stagingId, files, FEATURE_SLUG, setUploadPct);
      setUploading(false);
      await seedDemoBoard(true, up.repo_path, 'real_single');
      await refetch();
    } catch (e: any) {
      setUploading(false);
      setError(e?.response?.data?.message || e?.message || 'Could not open the folder / start the board');
    }
  };

  const onOpenFolder = async () => {
    setError(null);
    const picker = (window as Window & {
      showDirectoryPicker?: (o?: { mode?: 'read' | 'readwrite' }) => Promise<LocalDirectoryHandle>;
    }).showDirectoryPicker;
    if (!picker) {
      // No File System Access API — fall back to upload-only (no write-back).
      dirHandleRef.current = null;
      folderInputRef.current?.click();
      return;
    }
    let dir: LocalDirectoryHandle;
    try {
      dir = await picker({ mode: 'readwrite' });
    } catch (e: any) {
      if (e?.name !== 'AbortError') setError(e?.message || 'Could not open folder with write access');
      return;
    }
    dirHandleRef.current = dir;
    await uploadAndSeed(await collectDirectoryFiles(dir), dir.name);
  };

  const onFolderPicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    dirHandleRef.current = null; // input upload can't write back
    const selected = Array.from(e.target.files || []) as Array<File & { relativePath?: string }>;
    e.target.value = '';
    if (selected.length) {
      const top = ((selected[0] as any).webkitRelativePath || selected[0].name).split('/')[0] || 'folder';
      await uploadAndSeed(selected, top);
    }
  };

  // Write the released run report (4 agents + audit) back into the opened folder,
  // one distinct file per flow. Returns the file name written, or null.
  const writeResultToFolder = async (flow: BoardFlow): Promise<string | null> => {
    const dir = dirHandleRef.current;
    if (!dir || !flow.projectId) return null;
    const blob = await downloadReleaseFile(flow.projectId, 'final.md');
    const name = `aifa-flow-${flow.flowNo}-${FEATURE_SLUG}.md`;
    const handle = await dir.getFileHandle(name, { create: true });
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return name;
  };

  // When UX finishes, write its Markdown design (the Google login page) as a .md
  // file into the opened folder — once per UX task. Falls back to a browser
  // download when there is no writable folder handle (input-upload path).
  const writeUxDocToFolder = useCallback(async (flow: BoardFlow) => {
    const taskId = flow.card?.taskId;
    if (!flow.projectId || !taskId || uxDocWrittenRef.current.has(taskId)) return;
    uxDocWrittenRef.current.add(taskId); // mark first so polling doesn't re-enter
    try {
      const doc = await getDemoUxDoc(flow.projectId);
      if (!doc?.markdown) { uxDocWrittenRef.current.delete(taskId); return; }
      const name = `aifa-flow-${flow.flowNo}-${doc.fileName}`;
      const dir = dirHandleRef.current;
      if (dir) {
        const handle = await dir.getFileHandle(name, { create: true });
        const writable = await handle.createWritable();
        await writable.write(new Blob([doc.markdown], { type: 'text/markdown' }));
        await writable.close();
      } else {
        const url = URL.createObjectURL(new Blob([doc.markdown], { type: 'text/markdown' }));
        const a = document.createElement('a');
        a.href = url; a.download = name; a.click();
        URL.revokeObjectURL(url);
      }
      setSavedFiles((s) => ({ ...s, [flow.flowNo]: name }));
    } catch {
      uxDocWrittenRef.current.delete(taskId); // allow a retry on the next poll
    }
  }, []);

  // Auto-write the UX design doc the moment a flow parks at its UX review.
  useEffect(() => {
    for (const flow of board?.flows || []) {
      if (flow.reviewStage === 'ux' && flow.card?.taskId) void writeUxDocToFolder(flow as BoardFlow);
    }
  }, [board, writeUxDocToFolder]);

  // Browser-download fallback for the combined report (no folder handle / re-grab).
  const downloadAndSave = async (flow: BoardFlow) => {
    if (!flow.projectId) return;
    try {
      const blob = await downloadReleaseFile(flow.projectId, 'final.md');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `aifa-flow-${flow.flowNo}-${FEATURE_SLUG}.md`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Download failed');
    }
  };

  const retryFlow = async (flow: BoardFlow) => {
    if (!flow.projectId) return;
    const key = `retry-${flow.flowNo}`;
    mark(key, true);
    try {
      const res = await retryDemoFlow(flow.projectId);
      if (!res.retried) setError(res.reason || 'Nothing to retry on this flow');
      await refetch();
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Retry failed');
    } finally { mark(key, false); }
  };

  const approveReview = async (flow: BoardFlow) => {
    if (!flow.card) return;
    const key = `rev-${flow.flowNo}`;
    mark(key, true);
    try {
      await submitGateDecision(flow.card.taskId, { decision: 'APPROVE' });
      await refetch();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to approve');
    } finally { mark(key, false); }
  };

  const submitDialog = async () => {
    if (!dialog || !dialog.comment.trim()) return;
    const key = `rev-${dialog.flowNo}`;
    mark(key, true);
    try {
      await submitGateDecision(dialog.taskId, { decision: 'REQUEST_CHANGES', comment: dialog.comment.trim() });
      setDialog(null);
      await refetch();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to submit');
    } finally { mark(key, false); }
  };

  const approveRelease = async (flow: BoardFlow) => {
    if (!flow.projectId) return;
    const key = `rel-${flow.flowNo}`;
    mark(key, true);
    try {
      await submitReleaseDecision(flow.projectId, { decision_id: uuid(), decision: 'APPROVE' });
      // Write the combined run report back into the opened folder (distinct name).
      try {
        const name = await writeResultToFolder(flow);
        if (name) setSavedFiles((s) => ({ ...s, [flow.flowNo]: name }));
      } catch (e: any) {
        setError(`Released, but writing the report into the folder failed: ${e?.message || e}`);
      }
      await refetch();
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Release failed');
    } finally { mark(key, false); }
  };

  const rejectRelease = async (flow: BoardFlow) => {
    if (!flow.projectId) return;
    const key = `rel-${flow.flowNo}`;
    mark(key, true);
    try {
      // Final human gate only — a release reject needs no extra reason.
      await submitReleaseDecision(flow.projectId, { decision_id: uuid(), decision: 'REJECT' });
      await refetch();
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Reject failed');
    } finally { mark(key, false); }
  };

  const toggleTimeline = (flow: BoardFlow) => {
    if (!flow.projectId) return;
    setTimelineOpen((current) => {
      const nextOpen = !current[flow.flowNo];
      if (nextOpen) void loadTimeline(flow.projectId!);
      return { ...current, [flow.flowNo]: nextOpen };
    });
  };

  const openArtifactReview = async (flow: BoardFlow) => {
    if (!flow.projectId || !flow.reviewStage) return;
    const stage = flow.reviewStage;
    setArtifactReview({ flowNo: flow.flowNo, stage, loading: true, artifacts: [] });
    try {
      const result = await getProjectArtifacts(flow.projectId);
      const artifacts = (result.artifacts || []).filter((item: any) =>
        item.phase === `${stage}-agent` || item.agentType === `${stage}-agent`);
      setArtifactReview({ flowNo: flow.flowNo, stage, loading: false, artifacts });
    } catch (e: any) {
      setArtifactReview({
        flowNo: flow.flowNo,
        stage,
        loading: false,
        error: e?.response?.data?.message || e?.message || 'Could not load artifacts',
        artifacts: [],
      });
    }
  };

  const resolveLiveGate = async (gate: PendingGate, action: 'approve' | 'reject' | 'answer') => {
    const key = `gate-${gate.approvalId}`;
    mark(key, true);
    setError(null);
    try {
      if (action === 'answer') {
        const answer = (gateAnswers[gate.approvalId] || '').trim();
        if (!answer) return;
        await resolveApproval(gate.approvalId, { answers: [answer] });
      } else {
        await resolveApproval(gate.approvalId, {
          action,
          ...(action === 'reject' ? { comment: 'Rejected by user from the live Claude Code gate.' } : {}),
        });
      }
      setGateAnswers((current) => {
        const next = { ...current };
        delete next[gate.approvalId];
        return next;
      });
      await refetch();
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Could not resolve Claude gate');
    } finally {
      mark(key, false);
    }
  };

  const rawFlows = board?.flows || [];
  const activeFlow = rawFlows.find((flow) => flow.flowNo === 1)
    || { flowNo: 1, status: 'seeding' as const, target: 'po' };
  const flows = rawFlows.length
    ? [activeFlow as BoardFlow, unavailableFlow(2, 'dev'), unavailableFlow(3, 'qa')]
    : [];
  const hasBoard = flows.length > 0 && board?.status !== 'empty';
  const seeding = activeFlow.status === 'seeding' || (board?.status === 'seeding' && !(activeFlow as BoardFlow).projectId);

  return (
    <div style={S.shell}>
      <style>{'@keyframes aifaspin{to{transform:rotate(360deg)}}'}</style>
      {/* Sidebar (minimal) */}
      <aside style={S.sidebar}>
        <div style={S.brand}>
          <span style={S.brandMark}>◆</span>
          <span style={S.brandName}>AIFA</span>
        </div>
        <nav style={S.nav}>
          <div style={{ ...S.navItem, ...S.navItemActive }}>
            <span style={S.navIcon}>❏</span> Workflows
          </div>
        </nav>
        <div style={S.sidebarFoot}>local Claude Code</div>
      </aside>

      {/* Main */}
      <main style={S.main}>
        <header style={S.header}>
          <div>
            <h1 style={S.title}>Multi-Agent Workflows</h1>
            <p style={S.subtitle}>Overview of all active workflows and approval status</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {folderLabel && <span style={S.folderTag}>📂 {folderLabel}</span>}
            <button style={S.openBtn} onClick={onOpenFolder} disabled={uploading}>
              {uploading ? `Uploading… ${uploadPct}%` : hasBoard ? '📂 Open another folder' : '📂 Open folder'}
            </button>
          </div>
          {/* Hidden native directory picker (fallback when File System Access API is absent). */}
          <input
            ref={folderInputRef}
            type="file"
            multiple
            style={{ display: 'none' }}
            onChange={onFolderPicked}
            {...({ webkitdirectory: '', directory: '' } as any)}
          />
        </header>

        {error && <div style={S.error}>{error}</div>}
        {seeding && (
          <div style={S.banner}>Claude Code is running one real workflow. Questions and tool approvals appear here.</div>
        )}

        {!hasBoard && !seeding ? (
          <div style={S.empty}>
            <div style={S.emptyIcon}>📂</div>
            <h2 style={{ margin: '4px 0 6px' }}>Open a cloned repo to start</h2>
            <p style={{ margin: 0, color: '#64748b', fontSize: 13.5, maxWidth: 460, lineHeight: 1.5 }}>
              Pick a local folder (a git repo you've already cloned). AIFA runs three
              workflows on it — parked at PO, DEV and QA — and writes each flow's
              combined report (4 agents + audit trail) back into the folder on release.
            </p>
            <button style={{ ...S.openBtn, marginTop: 16 }} onClick={onOpenFolder} disabled={uploading}>
              {uploading ? `Uploading… ${uploadPct}%` : '📂 Open folder'}
            </button>
            <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 10 }}>
              Chrome/Edge can write the report straight back into your folder · node_modules/.git are skipped.
            </div>
          </div>
        ) : (
          <div style={S.boardRow}>
            {(flows.length ? flows : [activeFlow as BoardFlow, unavailableFlow(2, 'dev'), unavailableFlow(3, 'qa')]).map((flow) => (
              <FlowColumn
                key={flow.flowNo}
                flow={flow as BoardFlow}
                busy={busy}
                savedFile={savedFiles[(flow as BoardFlow).flowNo]}
                timelineOpen={!!timelineOpen[(flow as BoardFlow).flowNo]}
                timeline={(flow as BoardFlow).projectId ? timelines[(flow as BoardFlow).projectId!] : undefined}
                onApproveReview={approveReview}
                onApproveRelease={approveRelease}
                onRejectRelease={rejectRelease}
                onRetry={retryFlow}
                onDownload={(f) => downloadAndSave(f)}
                onReviewArtifacts={openArtifactReview}
                gateAnswers={gateAnswers}
                onGateAnswerChange={(approvalId, value) => setGateAnswers((current) => ({ ...current, [approvalId]: value }))}
                onResolveGate={resolveLiveGate}
                onToggleTimeline={toggleTimeline}
                onRequestChanges={(f) => setDialog({ flowNo: f.flowNo, taskId: f.card!.taskId, stage: f.reviewStage || '', comment: '' })}
              />
            ))}
          </div>
        )}

        <div style={S.footNote}>
          <span style={S.shield}>⛉</span> Audit trail is available in the system (hidden from this view)
        </div>
      </main>

      {/* Review dialog (Request changes / Reject) */}
      {dialog && (
        <div style={S.modalBackdrop} onClick={() => setDialog(null)}>
          <div style={S.modal} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 4px' }}>Request changes · Workflow {dialog.flowNo}</h3>
            <p style={{ margin: '0 0 12px', fontSize: 13, color: '#64748b' }}>
              Pick a quick reason or write your own. The flow goes back to the agent with this feedback.
            </p>
            <div style={S.quickRow}>
              {quickFixesFor(dialog.stage).map((fix, i) => (
                <button
                  key={i}
                  style={{ ...S.quickChip, ...(dialog.comment === fix ? S.quickChipActive : null) }}
                  onClick={() => setDialog({ ...dialog, comment: fix })}
                >
                  {fix}
                </button>
              ))}
            </div>
            <textarea
              style={S.textarea}
              autoFocus
              value={dialog.comment}
              placeholder="e.g. Tighten the OAuth callback validation and add a test for the mismatched-state case."
              onChange={(e) => setDialog({ ...dialog, comment: e.target.value })}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
              <button style={S.btnGhost} onClick={() => setDialog(null)}>Cancel</button>
              <button style={S.btnDanger} disabled={!dialog.comment.trim()} onClick={submitDialog}>Submit</button>
            </div>
          </div>
        </div>
      )}

      {artifactReview && (
        <div style={S.modalBackdrop} onClick={() => setArtifactReview(null)}>
          <div style={{ ...S.modal, width: 720 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 4px' }}>Review artifacts · Workflow {artifactReview.flowNo}</h3>
            <p style={{ margin: '0 0 12px', fontSize: 13, color: '#64748b' }}>
              {artifactReview.stage.toUpperCase()} output saved by AIFA
            </p>
            <div style={S.artifactList}>
              {artifactReview.loading ? (
                <div style={S.timelineEmpty}>Loading artifacts...</div>
              ) : artifactReview.error ? (
                <div style={S.timelineError}>{artifactReview.error}</div>
              ) : artifactReview.artifacts.length === 0 ? (
                <div style={S.timelineEmpty}>No saved artifacts found for this stage.</div>
              ) : artifactReview.artifacts.map((artifact, index) => (
                <div key={`${artifact.type || artifact.artifactType}-${index}`} style={S.artifactItem}>
                  <div style={S.artifactTitle}>{artifact.type || artifact.artifactType || 'artifact'}</div>
                  <pre style={S.artifactContent}>
                    {artifact.contentText || JSON.stringify(artifact.contentJson ?? {}, null, 2)}
                  </pre>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
              <button style={S.btnGhost} onClick={() => setArtifactReview(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const TIMELINE_LABELS: Record<string, string> = {
  agent_run: 'Agent started',
  agent_complete: 'Output drafted',
  hitl_decision: 'Human review',
  release_decision: 'Release decision',
  a2a_handoff: 'Agent handoff',
  gate_audit: 'Tool gate',
  escalation: 'Escalation',
  failure: 'Failure',
};

const timelineLabel = (event: WorkflowTimelineEvent) =>
  TIMELINE_LABELS[event.type] || event.action.replace(/_/g, ' ').toLowerCase();

const timelineDetail = (event: WorkflowTimelineEvent) => {
  if (event.decision) return event.decision.replace(/_/g, ' ');
  if (event.stateFrom || event.stateTo) return [event.stateFrom, event.stateTo].filter(Boolean).join(' -> ');
  if (event.fromAgent || event.toAgent) return [event.fromAgent, event.toAgent].filter(Boolean).join(' -> ');
  return event.reason || event.comment || event.status || '';
};

const timelineTime = (timestamp: string) =>
  new Date(timestamp).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

// ── Flow column ─────────────────────────────────────────────────────────────
function LiveGateCard({
  gate,
  busy,
  answer,
  onAnswerChange,
  onResolve,
}: {
  gate: PendingGate;
  busy: boolean;
  answer: string;
  onAnswerChange: (value: string) => void;
  onResolve: (action: 'approve' | 'reject' | 'answer') => void;
}) {
  const question = gate.payload?.questions?.[0];
  const isQuestion = gate.kind === 'question';
  return (
    <div style={S.liveGateCard}>
      <span style={S.liveGateChip}>{isQuestion ? 'Claude question' : 'Claude tool approval'}</span>
      <div style={S.liveGateTitle}>
        {isQuestion
          ? (question?.question || gate.payload?.display?.prompt || 'Claude needs your input')
          : (gate.payload?.display?.prompt || `${gate.payload?.tool || gate.payload?.toolName || 'Tool'} requested`)}
      </div>
      {!isQuestion && (
        <>
          {(gate.payload?.file_path || gate.payload?.reason) && (
            <div style={S.liveGateMeta}>{gate.payload.file_path || gate.payload.reason}</div>
          )}
          {gate.payload?.diff && <pre style={S.liveGateDiff}>{gate.payload.diff}</pre>}
          <div style={S.actionRow}>
            <button style={S.btnApprove} disabled={busy} onClick={() => onResolve('approve')}>Approve</button>
            <button style={S.btnDangerSoft} disabled={busy} onClick={() => onResolve('reject')}>Reject</button>
          </div>
        </>
      )}
      {isQuestion && (
        <>
          {!!question?.options?.length && (
            <div style={S.quickRow}>
              {question.options.map((option, index) => (
                <button
                  key={`${option.label}-${index}`}
                  style={{ ...S.quickChip, ...(answer === option.label ? S.quickChipActive : null) }}
                  onClick={() => onAnswerChange(option.label)}
                >
                  <strong>{option.label}</strong>{option.description ? ` - ${option.description}` : ''}
                </button>
              ))}
            </div>
          )}
          <textarea
            style={S.textarea}
            value={answer}
            placeholder="Answer Claude so it can continue..."
            onChange={(event) => onAnswerChange(event.target.value)}
          />
          <div style={S.actionRow}>
            <button style={S.btnApprove} disabled={busy || !answer.trim()} onClick={() => onResolve('answer')}>
              Send answer
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function FlowColumn({
  flow, busy, savedFile, timelineOpen, timeline, onApproveReview, onApproveRelease, onRejectRelease, onRetry, onDownload, onToggleTimeline, onRequestChanges, onReviewArtifacts, gateAnswers, onGateAnswerChange, onResolveGate,
}: {
  flow: BoardFlow;
  busy: Record<string, boolean>;
  savedFile?: string;
  timelineOpen: boolean;
  timeline?: TimelineState;
  gateAnswers: Record<string, string>;
  onApproveReview: (f: BoardFlow) => void;
  onApproveRelease: (f: BoardFlow) => void;
  onRejectRelease: (f: BoardFlow) => void;
  onRetry: (f: BoardFlow) => void;
  onDownload: (f: BoardFlow) => void;
  onToggleTimeline: (f: BoardFlow) => void;
  onRequestChanges: (f: BoardFlow) => void;
  onReviewArtifacts: (f: BoardFlow) => void;
  onGateAnswerChange: (approvalId: string, value: string) => void;
  onResolveGate: (gate: PendingGate, action: 'approve' | 'reject' | 'answer') => void;
}) {
  const accent = accentFor(flow.reviewStage || flow.target);
  const unavailable = flow.status === 'unavailable' || flow.active === false;
  const seeding = !unavailable && (flow.status === 'seeding' || !flow.progress);
  const released = flow.released;
  const isReleased = released === 'RELEASED';
  const isRejected = released === 'RELEASE_REJECTED';
  const failed = flow.status === 'error' ? flow.failure : null;
  const card = flow.card;
  const relGate = flow.releaseGate;
  const relReady = !!relGate?.eligible && !relGate?.approvalBlocked;
  const revBusy = busy[`rev-${flow.flowNo}`];
  const relBusy = busy[`rel-${flow.flowNo}`];
  const done = flow.progress?.done ?? 0;
  const total = flow.progress?.total ?? 4;
  const liveGate = (flow.pendingGates || []).find((gate) => gate.status !== 'interrupted') || null;

  const statusLine = failed
    ? `${failed.stage.toUpperCase()} worker failed`
    : unavailable ? 'Temporary not available'
    : released
    ? (released === 'RELEASED' ? '🚀 Released' : '🛑 Release rejected')
    : seeding ? '⏳ Seeding…'
    : card ? `⏱ Waiting for approval — ${card.agent}`
    : '⚙ Agent running…';

  return (
    <section style={S.col}>
      {/* Header */}
      <div style={S.colHead}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ ...S.flowIcon, background: accent.soft, color: accent.text }}>⤳</span>
          <div>
            <div style={S.colTitle}>Workflow {flow.flowNo}</div>
            <div style={{ ...S.colStatus, color: released ? '#15803d' : accent.text }}>{statusLine}</div>
          </div>
        </div>
        <span style={S.kebab}>⋮</span>
      </div>

      {/* Repo + progress */}
      <div style={S.repoRow}>
        <span style={S.repoIcon}>⎇</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={S.repoName}>{flow.repo || 'local · add google login'}</div>
          <div style={S.repoBranch}>{flow.branch || 'main'}</div>
        </div>
        <div style={S.progressWrap}>
          <div style={S.progressTrack}>
            <div style={{ ...S.progressFill, width: `${(done / total) * 100}%`, background: accent.solid }} />
          </div>
          <span style={S.progressText}>{done}/{total}</span>
        </div>
        {!seeding && card && (
          <span style={{ ...S.agentBadge, background: accent.soft, color: accent.text }}>{card.agent}</span>
        )}
      </div>

      {/* Approval card */}
      <div style={{ flex: 1 }}>
        {unavailable ? (
          <div style={S.unavailableCard}>
            <div style={S.unavailableTitle}>Temporary not available</div>
            <div style={S.unavailableText}>
              This lane is intentionally paused for the real Claude Code demo. Only Workflow 1 runs live so questions and approvals stay easy to inspect.
            </div>
          </div>
        ) : seeding ? (
          <div style={S.skeleton}>
            <div style={S.spinner} />
            <span>Provisioning workflow…</span>
          </div>
        ) : liveGate ? (
          <LiveGateCard
            gate={liveGate}
            busy={!!busy[`gate-${liveGate.approvalId}`]}
            answer={gateAnswers[liveGate.approvalId] || ''}
            onAnswerChange={(value) => onGateAnswerChange(liveGate.approvalId, value)}
            onResolve={(action) => onResolveGate(liveGate, action)}
          />
        ) : card ? (
          <div style={{ ...S.approvalCard, borderColor: accent.soft }}>
            <span style={{ ...S.chip, background: accent.soft, color: accent.text }}>{card.label}</span>
            <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
              <span style={{ ...S.cardIcon, background: accent.soft, color: accent.text }}>◷</span>
              <div>
                <div style={S.cardTitle}>{card.title}</div>
                <div style={S.cardDesc}>{card.description}</div>
              </div>
            </div>
            {card.whatsIncluded.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={S.includedLabel}>What's included:</div>
                <ul style={S.bullets}>
                  {card.whatsIncluded.map((b, i) => <li key={i}>{b}</li>)}
                </ul>
              </div>
            )}
            {card.invalid && (
              <div style={S.invalidNote}>Output is INVALID — request changes instead of approving.</div>
            )}
            <div style={S.actionRow}>
              <button style={S.btnOutline} disabled={revBusy} onClick={() => onReviewArtifacts(flow)}>
                Review details
              </button>
              <button
                style={{ ...S.btnApprove, background: accent.solid }}
                disabled={card.invalid || revBusy}
                onClick={() => onApproveReview(flow)}
              >
                ✓ Approve
              </button>
              <button style={S.btnOutline} disabled={revBusy} onClick={() => onRequestChanges(flow)}>
                ↻ Request changes
              </button>
            </div>
          </div>
        ) : (
          <div style={S.betweenState}>
            {failed ? (
              <div style={S.failureCard}>
                <div style={S.failureTitle}>{failed.code || 'WORKER_FAILED'}</div>
                <div style={S.failureMessage}>{failed.error}</div>
                <div style={S.failureHint}>
                  {failed.recoverable === false
                    ? 'This failure requires a code or configuration change before rerunning.'
                    : 'Re-run this agent from its approved upstream step — earlier stages are kept.'}
                </div>
                <button
                  style={{ ...S.btnApprove, background: accent.solid, marginTop: 12 }}
                  disabled={!!busy[`retry-${flow.flowNo}`] || !flow.projectId}
                  onClick={() => onRetry(flow)}
                >
                  {busy[`retry-${flow.flowNo}`] ? '↻ Re-running…' : `↻ Retry ${failed.stage.toUpperCase()} Agent`}
                </button>
              </div>
            ) : released ? (released === 'RELEASED' ? 'This workflow has been released.' : 'This release was rejected.')
              : `${flow.currentPhase || 'Working'} — the next agent is running…`}
          </div>
        )}
      </div>

      {/* Final release — the ONLY place a reject is offered (post-QA human gate). */}
      <div style={S.timelinePanel}>
        <button
          style={S.timelineToggle}
          disabled={!flow.projectId}
          onClick={() => onToggleTimeline(flow)}
        >
          <span>{timelineOpen ? '-' : '+'} Timeline</span>
          <span style={S.timelineCount}>
            {timeline?.loading ? 'loading' : `${timeline?.events.length || 0} events`}
          </span>
        </button>
        {timelineOpen && (
          <div style={S.timelineBody}>
            {timeline?.error ? (
              <div style={S.timelineError}>{timeline.error}</div>
            ) : !timeline || (timeline.loading && timeline.events.length === 0) ? (
              <div style={S.timelineEmpty}>Loading timeline...</div>
            ) : timeline.events.length === 0 ? (
              <div style={S.timelineEmpty}>No events recorded yet.</div>
            ) : (
              timeline.events.map((event, index) => (
                <div key={`${event.taskId || event.type}-${event.timestamp}-${index}`} style={S.timelineItem}>
                  <div style={S.timelineDotWrap}>
                    <span style={{ ...S.timelineDot, background: event.type === 'failure' ? '#dc2626' : accent.solid }} />
                    {index < timeline.events.length - 1 && <span style={S.timelineLine} />}
                  </div>
                  <div style={S.timelineEventBody}>
                    <div style={S.timelineEventHead}>
                      <span style={S.timelineEventTitle}>{timelineLabel(event)}</span>
                      <span style={S.timelineEventTime}>{timelineTime(event.timestamp)}</span>
                    </div>
                    <div style={S.timelineEventMeta}>
                      <span>{event.actor}</span>
                      {event.versionTag && <span>{event.versionTag}</span>}
                      {event.gate && <span>{event.gate}</span>}
                    </div>
                    {timelineDetail(event) && <div style={S.timelineEventDetail}>{timelineDetail(event)}</div>}
                    {event.comment && <div style={S.timelineComment}>{event.comment}</div>}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      <div style={{ ...S.releaseCard, ...(isReleased || (relReady && !isRejected) ? S.releaseReady : null), ...(isRejected ? S.releaseRejected : null) }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16 }}>{isRejected ? '🛑' : isReleased || relReady ? '🚀' : '🔒'}</span>
          <span style={S.releaseTitle}>Final Release Approval</span>
          <span style={{
            ...S.releaseBadge,
            ...(isReleased ? S.badgeReady : isRejected ? S.badgeRejected : relReady ? S.badgeReady : S.badgeLocked),
          }}>
            {isReleased ? 'Done' : isRejected ? 'Rejected' : relReady ? 'Ready' : 'Locked'}
          </span>
        </div>
        <div style={S.releaseDesc}>
          {isRejected ? 'The release was rejected at the final review.'
            : relReady ? 'All stages complete. Ready for production deployment.'
            : 'Approve the completed release for production deployment.'}
        </div>
        {isReleased ? (
          <div>
            <div style={S.savedNote}>
              {savedFile ? <>✍ Saved <code>{savedFile}</code> into your folder</> : 'Report ready — download the combined report.'}
            </div>
            <button style={S.btnDownload} onClick={() => onDownload(flow)}>⬇ Download report</button>
          </div>
        ) : isRejected ? (
          <button style={{ ...S.btnRelease, ...S.btnRejectedState }} disabled>🛑 Release rejected</button>
        ) : relReady ? (
          <div style={S.releaseActions}>
            <button style={{ ...S.btnRelease, flex: 1 }} disabled={relBusy} onClick={() => onApproveRelease(flow)}>
              {relBusy ? 'Working…' : '🚀 Approve Final Release'}
            </button>
            <button style={S.btnRejectRelease} disabled={relBusy} onClick={() => onRejectRelease(flow)}>
              ✕ Reject
            </button>
          </div>
        ) : (
          <button style={{ ...S.btnRelease, ...S.btnReleaseDisabled }} disabled>🚀 Approve Final Release</button>
        )}
      </div>
    </section>
  );
}

const S: Record<string, React.CSSProperties> = {
  shell: { display: 'flex', minHeight: '100vh', background: '#f1f5f9', color: '#0f172a', fontFamily: 'ui-sans-serif, system-ui, -apple-system, sans-serif' },
  // Sidebar
  sidebar: { width: 180, background: '#0f172a', color: '#cbd5e1', display: 'flex', flexDirection: 'column', padding: '18px 14px', position: 'sticky', top: 0, height: '100vh' },
  brand: { display: 'flex', alignItems: 'center', gap: 9, padding: '4px 8px 18px' },
  brandMark: { color: '#60a5fa', fontSize: 18 },
  brandName: { fontWeight: 700, fontSize: 18, color: '#fff', letterSpacing: 0.5 },
  nav: { display: 'flex', flexDirection: 'column', gap: 4, flex: 1 },
  navItem: { display: 'flex', alignItems: 'center', gap: 9, padding: '9px 11px', borderRadius: 8, fontSize: 14, cursor: 'default' },
  navItemActive: { background: '#1e293b', color: '#fff', fontWeight: 600 },
  navIcon: { fontSize: 14 },
  sidebarFoot: { fontSize: 11, opacity: 0.5, padding: '8px' },
  // Main
  main: { flex: 1, padding: '22px 28px', maxWidth: 1280, margin: '0 auto', width: '100%' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 },
  title: { margin: 0, fontSize: 22, fontWeight: 700 },
  subtitle: { margin: '4px 0 0', fontSize: 13, color: '#64748b' },
  openBtn: { padding: '9px 16px', borderRadius: 8, border: 'none', background: '#0f172a', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 13 },
  folderTag: { fontSize: 12, color: '#475569', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 10px', maxWidth: 260, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  empty: { background: '#fff', border: '1px dashed #cbd5e1', borderRadius: 14, padding: '48px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' },
  emptyIcon: { fontSize: 40, marginBottom: 6 },
  savedNote: { fontSize: 12, color: '#15803d', marginBottom: 8, lineHeight: 1.4 },
  btnDownload: { width: '100%', padding: '9px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', color: '#334155', fontWeight: 600, cursor: 'pointer', fontSize: 12.5 },
  error: { background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', padding: '10px 14px', borderRadius: 8, marginBottom: 14, fontSize: 13 },
  banner: { background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1d4ed8', padding: '10px 14px', borderRadius: 8, marginBottom: 14, fontSize: 13 },
  boardRow: { display: 'flex', gap: 18, alignItems: 'stretch' },
  footNote: { textAlign: 'center', color: '#94a3b8', fontSize: 12, marginTop: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 },
  shield: { color: '#94a3b8' },
  // Column
  col: { flex: 1, minWidth: 0, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 14, boxShadow: '0 1px 2px rgba(15,23,42,0.04)' },
  colHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
  flowIcon: { width: 34, height: 34, borderRadius: 9, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 },
  colTitle: { fontWeight: 700, fontSize: 15 },
  colStatus: { fontSize: 12, marginTop: 2, fontWeight: 600 },
  kebab: { color: '#94a3b8', fontSize: 18, cursor: 'default' },
  repoRow: { display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 12, borderBottom: '1px solid #f1f5f9' },
  repoIcon: { width: 26, height: 26, borderRadius: 7, background: '#f1f5f9', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: '#475569' },
  repoName: { fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  repoBranch: { fontSize: 11, color: '#94a3b8' },
  progressWrap: { display: 'flex', alignItems: 'center', gap: 6 },
  progressTrack: { width: 46, height: 6, borderRadius: 999, background: '#e2e8f0', overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 999, transition: 'width .3s' },
  progressText: { fontSize: 11, color: '#64748b', fontWeight: 600 },
  agentBadge: { fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 999, whiteSpace: 'nowrap' },
  // Approval card
  approvalCard: { border: '1px solid', borderRadius: 11, padding: 14, background: '#fcfcfd' },
  liveGateCard: { border: '1px solid #bfdbfe', borderRadius: 11, padding: 14, background: '#eff6ff' },
  liveGateChip: { fontSize: 10, fontWeight: 800, letterSpacing: 0.6, padding: '3px 8px', borderRadius: 6, textTransform: 'uppercase', background: '#dbeafe', color: '#1d4ed8' },
  liveGateTitle: { marginTop: 10, fontWeight: 800, fontSize: 14, color: '#0f172a', lineHeight: 1.35 },
  liveGateMeta: { marginTop: 7, fontSize: 12, color: '#475569', overflowWrap: 'anywhere' },
  liveGateDiff: { margin: '10px 0 0', padding: 10, maxHeight: 220, overflow: 'auto', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', borderRadius: 8, background: '#0f172a', color: '#e2e8f0', fontSize: 11.5, lineHeight: 1.45 },
  chip: { fontSize: 10, fontWeight: 700, letterSpacing: 0.6, padding: '3px 8px', borderRadius: 6, textTransform: 'uppercase' },
  cardIcon: { width: 30, height: 30, borderRadius: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, flexShrink: 0 },
  cardTitle: { fontWeight: 700, fontSize: 14 },
  cardDesc: { fontSize: 12.5, color: '#64748b', marginTop: 3, lineHeight: 1.4 },
  includedLabel: { fontSize: 12, fontWeight: 700, marginBottom: 5 },
  bullets: { margin: 0, paddingLeft: 18, fontSize: 12.5, color: '#475569', lineHeight: 1.7 },
  invalidNote: { fontSize: 11.5, color: '#b91c1c', marginTop: 8 },
  actionRow: { display: 'flex', gap: 7, marginTop: 14, flexWrap: 'wrap' },
  btnApprove: { padding: '8px 12px', borderRadius: 8, border: 'none', background: '#2563eb', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 12.5 },
  btnDangerSoft: { padding: '8px 12px', borderRadius: 8, border: '1px solid #fecaca', background: '#fff', color: '#dc2626', fontWeight: 700, cursor: 'pointer', fontSize: 12.5 },
  btnOutline: { padding: '8px 11px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', color: '#334155', fontWeight: 600, cursor: 'pointer', fontSize: 12.5 },
  skeleton: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '34px 0', color: '#94a3b8', fontSize: 13 },
  spinner: { width: 26, height: 26, borderRadius: 999, border: '3px solid #e2e8f0', borderTopColor: '#94a3b8', animation: 'aifaspin 0.8s linear infinite' },
  betweenState: { padding: '28px 12px', textAlign: 'center', color: '#94a3b8', fontSize: 13 },
  unavailableCard: { padding: 18, border: '1px dashed #cbd5e1', borderRadius: 11, background: '#f8fafc', color: '#64748b', textAlign: 'left' },
  unavailableTitle: { fontSize: 13, fontWeight: 800, color: '#334155', marginBottom: 7 },
  unavailableText: { fontSize: 12.5, lineHeight: 1.5 },
  failureCard: { padding: 12, textAlign: 'left', color: '#991b1b', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8 },
  failureTitle: { fontSize: 11, fontWeight: 800, marginBottom: 5 },
  failureMessage: { fontSize: 12, lineHeight: 1.45, overflowWrap: 'anywhere' },
  failureHint: { fontSize: 11, color: '#b45309', marginTop: 8, lineHeight: 1.4 },
  artifactList: { maxHeight: '60vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 },
  artifactItem: { border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' },
  artifactTitle: { padding: '8px 10px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontSize: 12, fontWeight: 800, color: '#334155' },
  artifactContent: { margin: 0, padding: 10, fontSize: 11.5, lineHeight: 1.5, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', color: '#334155', background: '#fff' },
  // Timeline
  timelinePanel: { border: '1px solid #e2e8f0', borderRadius: 11, background: '#fff' },
  timelineToggle: { width: '100%', padding: '9px 10px', border: 'none', background: '#f8fafc', color: '#334155', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', borderRadius: 10 },
  timelineCount: { color: '#64748b', fontSize: 11, fontWeight: 600 },
  timelineBody: { maxHeight: 250, overflowY: 'auto', padding: '10px 10px 12px', borderTop: '1px solid #e2e8f0' },
  timelineEmpty: { color: '#94a3b8', fontSize: 12, textAlign: 'center', padding: '14px 4px' },
  timelineError: { color: '#b91c1c', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontSize: 12, padding: 8 },
  timelineItem: { display: 'flex', gap: 9, position: 'relative' },
  timelineDotWrap: { width: 12, display: 'flex', justifyContent: 'center', position: 'relative', flexShrink: 0, paddingTop: 4 },
  timelineDot: { width: 8, height: 8, borderRadius: 999, display: 'block', position: 'relative', zIndex: 1 },
  timelineLine: { position: 'absolute', top: 14, bottom: -2, width: 1, background: '#e2e8f0' },
  timelineEventBody: { flex: 1, minWidth: 0, paddingBottom: 10 },
  timelineEventHead: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  timelineEventTitle: { fontSize: 12, fontWeight: 700, color: '#0f172a' },
  timelineEventTime: { fontSize: 10.5, color: '#94a3b8', whiteSpace: 'nowrap' },
  timelineEventMeta: { display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 3, color: '#64748b', fontSize: 10.5 },
  timelineEventDetail: { marginTop: 4, color: '#475569', fontSize: 11.5, lineHeight: 1.35 },
  timelineComment: { marginTop: 5, color: '#334155', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 7, padding: '6px 7px', fontSize: 11.5, lineHeight: 1.35 },
  // Release
  releaseCard: { borderRadius: 11, padding: 14, background: '#f8fafc', border: '1px solid #e2e8f0' },
  releaseReady: { background: '#f0fdf4', border: '1px solid #bbf7d0' },
  releaseRejected: { background: '#fef2f2', border: '1px solid #fecaca' },
  releaseTitle: { fontWeight: 700, fontSize: 13.5, flex: 1 },
  releaseBadge: { fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999 },
  badgeLocked: { background: '#e2e8f0', color: '#64748b' },
  badgeReady: { background: '#16a34a', color: '#fff' },
  badgeRejected: { background: '#dc2626', color: '#fff' },
  releaseDesc: { fontSize: 12, color: '#64748b', margin: '8px 0 12px', lineHeight: 1.4 },
  releaseActions: { display: 'flex', gap: 8 },
  btnRelease: { width: '100%', padding: '10px', borderRadius: 8, border: 'none', background: '#16a34a', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 13 },
  btnReleaseDisabled: { background: '#e2e8f0', color: '#94a3b8', cursor: 'not-allowed' },
  btnRejectedState: { background: '#fee2e2', color: '#b91c1c', cursor: 'default' },
  btnRejectRelease: { padding: '10px 14px', borderRadius: 8, border: '1px solid #fca5a5', background: '#fff', color: '#dc2626', fontWeight: 700, cursor: 'pointer', fontSize: 13, whiteSpace: 'nowrap' },
  // Quick-fill chips in the Request-changes dialog
  quickRow: { display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 },
  quickChip: { textAlign: 'left', padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#334155', fontSize: 12.5, cursor: 'pointer', lineHeight: 1.35 },
  quickChipActive: { border: '1px solid #93c5fd', background: '#eff6ff', color: '#1d4ed8' },
  // Modal
  modalBackdrop: { position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 },
  modal: { background: '#fff', borderRadius: 14, padding: 22, width: 460, maxWidth: '90vw', boxShadow: '0 20px 60px rgba(15,23,42,0.25)' },
  textarea: { width: '100%', minHeight: 96, padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' },
  btnGhost: { padding: '8px 14px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', color: '#334155', fontWeight: 600, cursor: 'pointer' },
  btnDanger: { padding: '8px 14px', borderRadius: 8, border: 'none', background: '#dc2626', color: '#fff', fontWeight: 600, cursor: 'pointer' },
};
