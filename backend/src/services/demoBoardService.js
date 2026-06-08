// AIFA Demo Board — provisions 3 independent happy_path workflows, each PARKED at
// a different agent's review (Flow 1 → PO, Flow 2 → DEV, Flow 3 → QA), so opening
// the product shows the multi-agent approval board immediately.
//
// Design (FE mockup + 1-week roadmap):
//  - All 3 flows run the SAME feature ("Add Google login") through the real engine.
//  - PO & DEV are forced to STRICT_MANUAL (svc.setReviewHolds) so every flow parks
//    at a UNIFORM stage review, never a raw diff/question. A background gate drainer
//    silently resolves the in-execution gates (PO clarifying question, DEV tool
//    writes) so the human only ever sees the uniform "needs your approval" card.
//  - Seeding drives each flow to its target stage then stops; the human then walks
//    each flow review-by-review to the final release.
//  - Board membership persists to a JSON file so a page refresh / backend restart
//    re-attaches without re-seeding. Parked state itself is DB-backed (task review).

const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { Project, Task } = require('../models');
const svc = require('./SdlcWorkflowService');
const repoService = require('./repoService');
const logger = require('../config/logger');

const WORKSPACE_DIR = path.join(__dirname, '../../../workspace');
const BOARD_FILE = path.join(WORKSPACE_DIR, 'demo-board.json');
const FEATURE = {
  title: 'Add Google login',
  description: 'Allow users to sign in with their Google account via OAuth 2.0.',
  priority: 'High',
};
// qa-agent is STRICT_MANUAL by default; PO/DEV must be forced so each flow parks
// at a stage review. UX stays auto (kept transparent — only 3 agents are shown).
const REVIEW_HOLD_ROLES = ['po-agent', 'dev-agent'];
const STAGES = ['po', 'ux', 'dev', 'qa'];
const REVIEW_ORDER = ['po', 'dev', 'qa']; // the human-reviewed stages, in order
const FLOW_TARGETS = [
  { flowNo: 1, target: 'po' },
  { flowNo: 2, target: 'dev' },
  { flowNo: 3, target: 'qa' },
];
const REAL_SINGLE_TARGETS = [
  { flowNo: 1, target: 'po', active: true },
  { flowNo: 2, target: 'dev', active: false },
  { flowNo: 3, target: 'qa', active: false },
];

const STAGE_META = {
  po:  { agent: 'PO Agent',  title: 'PO Agent needs your approval',  desc: 'Please review the product requirements and user stories for this release.' },
  ux:  { agent: 'UX Agent',  title: 'UX Agent needs your approval',  desc: 'Please review the proposed screens and user flow.' },
  dev: { agent: 'Dev Agent', title: 'Dev Agent needs your approval', desc: 'Please review the implementation plan and code changes.' },
  qa:  { agent: 'QA Agent',  title: 'QA Agent needs your approval',  desc: 'Please review the test results and quality assurance summary.' },
};

let board = null;      // in-memory board { id, status, flows: [{ flowNo, target, projectId, parked }] }
let seeding = false;   // guard against concurrent provisioning
let drainTimer = null; // background gate drainer interval

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const realInteractiveMode = () => process.env.USE_MOCK_CLAUDE_CODE === 'false';
const normalizeRealSingleFlows = (flows = []) => REAL_SINGLE_TARGETS.map((target) => {
  const existing = flows.find((flow) => flow.flowNo === target.flowNo) || {};
  return {
    ...target,
    projectId: target.active ? (existing.projectId || null) : null,
    parked: target.active ? !!existing.parked : false,
  };
});

function enforceRealSingleBoard() {
  if (!board || !realInteractiveMode()) return;
  const shouldNormalize = board.mode !== 'real_single'
    || (board.flows || []).length !== REAL_SINGLE_TARGETS.length
    || (board.flows || []).some((flow) => {
      const target = REAL_SINGLE_TARGETS.find((item) => item.flowNo === flow.flowNo);
      return !target || flow.active !== target.active || (target.active === false && flow.projectId);
    });
  if (!shouldNormalize) return;
  logger.warn('normalizing board to real single-flow mode', { id: board.id, flows: board.flows?.length });
  board.mode = 'real_single';
  board.flows = normalizeRealSingleFlows(board.flows || []);
  if (drainTimer) {
    clearInterval(drainTimer);
    drainTimer = null;
  }
  persist();
}

// ── Persistence (membership only; parked state lives in the DB) ──────────────
function persist() {
  try {
    fs.mkdirSync(WORKSPACE_DIR, { recursive: true });
    fs.writeFileSync(BOARD_FILE, JSON.stringify(board, null, 2));
  } catch (e) {
    logger.warn('demo board persist failed', { error: e.message });
  }
}

function loadFromDisk() {
  try {
    if (!fs.existsSync(BOARD_FILE)) return;
    board = JSON.parse(fs.readFileSync(BOARD_FILE, 'utf8'));
    enforceRealSingleBoard();
    for (const f of board.flows || []) {
      if (f.projectId) svc.setReviewHolds(f.projectId, REVIEW_HOLD_ROLES);
    }
    if (board.mode !== 'real_single') ensureDrainer();
    logger.info('demo board re-attached from disk', { id: board.id, flows: board.flows?.length });
  } catch (e) {
    logger.warn('demo board load failed', { error: e.message });
    board = null;
  }
}

// ── Background drainer: silently resolve in-execution gates so the human only
//    ever sees uniform stage reviews (tool writes → approve, questions → default).
function ensureDrainer() {
  if (drainTimer || !board || board.mode === 'real_single') return;
  drainTimer = setInterval(async () => {
    if (!board) return;
    for (const f of board.flows) {
      if (!f.projectId) continue;
      let gates = [];
      try { gates = await svc.listPendingGates({ projectId: f.projectId }); } catch { continue; }
      for (const g of gates) {
        if (g.status === 'interrupted') continue;
        try {
          if (g.kind === 'question') {
            const opt = g.payload?.questions?.[0]?.options?.[0]?.label || 'Any Google account';
            await svc.resolveApproval({ approvalId: g.approvalId, answers: [opt], user: null });
          } else {
            await svc.resolveApproval({ approvalId: g.approvalId, action: 'approve', comment: 'auto-approved (demo board)', user: null });
          }
        } catch { /* already resolved / racing the human — ignore */ }
      }
    }
  }, 400);
  if (typeof drainTimer.unref === 'function') drainTimer.unref();
}

// ── Seeding ─────────────────────────────────────────────────────────────────
async function seedBoard({ reset = false, sourceRepoPath = null, mode = 'three_flow' } = {}) {
  mode = realInteractiveMode() ? 'real_single' : mode;
  enforceRealSingleBoard();
  if (board && board.mode && board.mode !== mode) reset = true;
  if (board && board.status === 'ready' && !reset) return getBoard();
  if (seeding && !reset) return getBoard();

  if (reset) await teardown();
  seeding = true;
  board = {
    id: uuidv4(),
    mode,
    status: 'seeding',
    startedAt: new Date().toISOString(),
    // The uploaded cloned-repo (server staging path). Each flow gets its own
    // copy so the agents run repo-aware and the release bundle commits/diffs it.
    sourceRepoPath: sourceRepoPath || null,
    flows: (mode === 'real_single' ? REAL_SINGLE_TARGETS : FLOW_TARGETS)
      .map((f) => ({ ...f, projectId: null, parked: false })),
  };
  persist();
  if (mode !== 'real_single') ensureDrainer();
  // Provision in the background and return immediately; the UI polls getBoard().
  provision().catch((e) => {
    logger.error('demo board seeding failed', { error: e.message });
    if (board) { board.status = 'error'; board.error = e.message; persist(); }
    seeding = false;
  });
  return getBoard();
}

async function provision() {
  enforceRealSingleBoard();
  const sourceRepoPath = board.sourceRepoPath || null;
  for (const flow of board.flows) {
    if (flow.active === false) {
      flow.projectId = null;
      flow.parked = false;
      persist();
      continue;
    }
    const projectId = uuidv4();
    await Project.create({ id: projectId, name: `AIFA Board · Flow ${flow.flowNo}` });
    flow.projectId = projectId;
    svc.setReviewHolds(projectId, REVIEW_HOLD_ROLES);
    persist();

    // Give each flow its own copy of the uploaded repo so they don't clobber a
    // shared work-tree; runPOAgent then opens it in-place (repo-aware run).
    let repoPath = null;
    if (sourceRepoPath) {
      try {
        repoPath = repoService.repoPathFor(projectId);
        await fsp.cp(sourceRepoPath, repoPath, { recursive: true });
      } catch (e) {
        logger.warn('demo board: repo copy failed — running repo-less', { flowNo: flow.flowNo, error: e.message });
        repoPath = null;
      }
    }

    await svc.runPOAgent({ projectId, featureRequest: FEATURE, request: FEATURE.title, repoPath, newWorkflow: true, user: null });
    await driveToTarget(flow);
    flow.parked = true;
    persist();
    logger.info('demo board flow parked', { flowNo: flow.flowNo, target: flow.target, projectId, repoAware: !!repoPath });
  }
  board.status = 'ready';
  persist();
  seeding = false;
}

// Auto-approve the review stages BEFORE the target so the flow advances, then
// stop once the target stage is awaiting its review. In-execution gates are
// handled by the background drainer.
async function driveToTarget(flow, { timeoutMs = 150000 } = {}) {
  const approveBefore = REVIEW_ORDER.slice(0, REVIEW_ORDER.indexOf(flow.target));
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    let ws;
    try { ws = await svc.getWorkflowStatus(flow.projectId, null); } catch { await sleep(500); continue; }
    for (const stage of approveBefore) {
      const p = ws.phases?.[stage];
      if (p?.awaitingReview && !p.invalid) {
        try {
          await svc.submitStructuredDecision({ taskId: p.taskId, decisionId: uuidv4(), action: 'approve', user: null });
        } catch { /* racing the drainer / already decided */ }
      }
    }
    if (ws.phases?.[flow.target]?.awaitingReview) return;
    await sleep(500);
  }
  logger.warn('demo board flow did not reach target in time', { flowNo: flow.flowNo, target: flow.target });
}

// ── Read model ──────────────────────────────────────────────────────────────
async function getBoard() {
  if (!board) return null;
  enforceRealSingleBoard();
  const flows = [];
  for (const f of board.flows) {
    if (f.active === false) {
      flows.push({
        flowNo: f.flowNo,
        target: f.target,
        active: false,
        status: 'unavailable',
        repo: 'local · add google login',
        branch: 'main',
        progress: { done: 0, total: STAGES.length },
        currentPhase: 'TEMPORARY_NOT_AVAILABLE',
        waitingFor: null,
        reviewStage: null,
        phases: [],
        card: null,
        pendingGates: [],
        releaseGate: { eligible: false, status: 'locked', canDecide: false, approvalBlocked: true },
        released: null,
      });
      continue;
    }
    if (!f.projectId) { flows.push({ flowNo: f.flowNo, target: f.target, status: 'seeding' }); continue; }
    flows.push(await buildFlowCard(f));
  }
  return { id: board.id, mode: board.mode || 'three_flow', status: board.status, error: board.error || null, flows };
}

async function buildFlowCard(f) {
  const ws = await svc.getWorkflowStatus(f.projectId, null).catch(() => null);
  if (!ws) return { flowNo: f.flowNo, target: f.target, projectId: f.projectId, status: 'error' };

  const completed = STAGES.filter((s) => ws.phases?.[s]?.versionStatus === 'committed').length;
  const reviewStage = STAGES.find((s) => ws.phases?.[s]?.awaitingReview) || null;
  const failedStage = STAGES.find((s) => ws.phases?.[s]?.status === 'failed') || null;
  const failedPhase = failedStage ? ws.phases[failedStage] : null;
  const card = reviewStage ? await buildReviewCard(reviewStage, ws.phases[reviewStage]) : null;
  const released = ['RELEASED', 'RELEASE_REJECTED'].includes(ws.currentPhase) ? ws.currentPhase : null;
  const pendingGates = await svc.listPendingGates({ projectId: f.projectId }).catch(() => []);

  return {
    flowNo: f.flowNo,
    target: f.target,
    projectId: f.projectId,
    repo: 'local · add google login',
    branch: 'main',
    progress: { done: completed, total: STAGES.length },
    currentPhase: ws.currentPhase,
    waitingFor: card ? STAGE_META[reviewStage].agent : null,
    reviewStage,
    phases: STAGES.map((s) => {
      const p = ws.phases?.[s];
      return {
        stage: s,
        status: p ? p.status : 'pending',
        committed: p?.versionStatus === 'committed',
        awaitingReview: !!p?.awaitingReview,
        invalid: !!p?.invalid,
      };
    }),
    card,
    pendingGates,
    failure: failedStage ? {
      stage: failedStage,
      error: failedPhase?.error || `${STAGE_META[failedStage]?.agent || failedStage} failed`,
      code: failedPhase?.failure?.code || null,
      recoverable: failedPhase?.failure?.recoverable ?? null,
    } : null,
    releaseGate: ws.releaseGate || null,
    released,
    status: failedStage ? 'error' : ((!f.parked && board.status === 'seeding') ? 'seeding' : 'ready'),
  };
}

async function buildReviewCard(stage, phase) {
  const meta = STAGE_META[stage];
  const output = (await Task.findById(phase.taskId).catch(() => null))?.agentOutput || {};
  return {
    label: stage === 'qa' ? 'CURRENT REVIEW' : 'APPROVAL NEEDED',
    agent: meta.agent,
    title: meta.title,
    description: meta.desc,
    whatsIncluded: buildBullets(output, stage),
    taskId: phase.taskId,
    invalid: !!phase.invalid,
  };
}

// Build mockup-style "What's included" bullets from the real agent output. The
// full structured output lives on Task.agentOutput (artifacts only keep file
// refs). Best-effort: any unavailable item is simply skipped.
function buildBullets(o, stage) {
  const len = (v) => (Array.isArray(v) ? v.length : null);
  const out = [];

  if (stage === 'po') {
    if (len(o.user_stories) != null) out.push(`${len(o.user_stories)} user stories`);
    if (len(o.acceptance_criteria) != null) out.push(`${len(o.acceptance_criteria)} acceptance criteria`);
    if (o.prd) out.push('Product requirements (PRD)');
    if (o.scope) out.push('Release scope defined');
  } else if (stage === 'ux') {
    if (len(o.screens) != null) out.push(`${len(o.screens)} screens`);
    if (o.user_flow) out.push('User flow documented');
    if (o.penpot_mock) out.push('Penpot mock generated');
  } else if (stage === 'dev') {
    if (len(o.changed_files) != null) out.push(`${len(o.changed_files)} files changed`);
    const sb = o.sandbox_result || {};
    if (sb.tests_passed != null) out.push(`${sb.tests_passed} tests passed`);
    if (o.implementation_plan) out.push('Implementation plan');
    if (o.patch_diff || o.mock_code_diff) out.push('Code diff attached');
  } else if (stage === 'qa') {
    const tr = o.test_run_report || {};
    if (tr.total != null) out.push(`${tr.total} test cases executed`);
    else if (len(o.test_cases) != null) out.push(`${len(o.test_cases)} test cases executed`);
    if (tr.failed != null) out.push(`${tr.failed} failing test(s)`);
    if (len(o.ac_coverage_matrix) != null) out.push(`${len(o.ac_coverage_matrix)} AC coverage rows`);
    if (o.qa_report) out.push('QA report');
  }
  return out.slice(0, 4);
}

// ── Reset / teardown ────────────────────────────────────────────────────────
async function teardown() {
  if (drainTimer) { clearInterval(drainTimer); drainTimer = null; }
  if (board) {
    for (const f of board.flows) {
      if (f.projectId) svc.clearReviewHolds(f.projectId);
    }
  }
  board = null;
  seeding = false;
  try { if (fs.existsSync(BOARD_FILE)) fs.unlinkSync(BOARD_FILE); } catch { /* ignore */ }
}

async function resetBoard() {
  return seedBoard({ reset: true });
}

// Re-attach an existing board on module load (survives backend restart).
loadFromDisk();

module.exports = {
  seedBoard,
  getBoard,
  resetBoard,
  FLOW_TARGETS,
  // exposed for tests
  _internal: { driveToTarget, buildBullets },
};
