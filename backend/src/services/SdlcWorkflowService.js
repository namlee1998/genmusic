const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const { Task, AgentArtifact, HitlDecision } = require('../models');
const FeatureBacklog = require('../models/FeatureBacklog');
const AgentService = require('./AgentService');
const MembershipService = require('./MembershipService');
const QuotaService = require('./QuotaService');
const QualityGateService = require('./QualityGateService');
const fs = require('fs/promises');
const path = require('path');
const { ApiError, ERROR_CODES } = require('../middleware/errorHandler');
const { assertOutputConforms } = require('./agentContract');
const logger = require('../config/logger');

const WORKSPACE_DIR = path.join(__dirname, '../../../workspace/projects');

// ---------------------------------------------------------------------------
// Workflow State Machine
// States: DRAFT → PO_RUNNING → PO_REVIEW → UX_RUNNING → UX_REVIEW →
//         DEV_RUNNING → DEV_REVIEW → QA_RUNNING → QA_REVIEW →
//         FINAL_REVIEW → READY / HOLD
// Rework states: PO_REWORK | UX_REWORK | DEV_REWORK | QA_FAILED
// ---------------------------------------------------------------------------

const AGENT_GATES = {
  'intent-agent': 'REQUIREMENT_GATE',
  'po-agent':  'REQUIREMENT_GATE',
  'ux-agent':  'UX_GATE',
  'dev-agent': 'DEV_GATE',
  'qa-agent':  'QA_GATE',
};

const NEXT_AGENT = {
  'intent-agent': 'po-agent',
  'po-agent':  'ux-agent',
  'ux-agent':  'dev-agent',
  'dev-agent': 'qa-agent',
  'qa-agent':  null,          // → FINAL_REVIEW
};

const NODE_TARGET = {
  'intent-agent': 'intent_node',
  'po-agent':  'po_agent',
  'ux-agent':  'ux_agent',
  'dev-agent': 'dev_agent',
  'qa-agent':  'qa_agent',
};

const REWORK_TARGETS = {
  po_agent:  { sourceType: 'intent-agent', run: 'runPOAgent' },
  ux_agent:  { sourceType: 'po-agent',     run: 'runUXAgent' },
  dev_agent: { sourceType: 'ux-agent',     run: 'runDEVAgent' },
  qa_agent:  { sourceType: 'dev-agent',    run: 'runQAAgent' },
};

// ---------------------------------------------------------------------------
// Structured HITL (plan section 2): Gate Mode, retry policy, JSON Patch
// ---------------------------------------------------------------------------
const GATE_MODE = {
  STRICT_MANUAL: 'strict_manual',     // always require a human approve
  CONFIDENCE: 'confidence_based',     // pause only on low confidence / warnings
  AUTO_SAFE: 'auto_approve_safe',     // auto-approve when validation passes AND risk low
};

// Default policy per gate. QA gate (release decision) stays strict_manual.
const DEFAULT_GATE_MODE = {
  'intent-agent': GATE_MODE.STRICT_MANUAL,
  'po-agent':  GATE_MODE.CONFIDENCE,
  'ux-agent':  GATE_MODE.CONFIDENCE,
  'dev-agent': GATE_MODE.CONFIDENCE,
  'qa-agent':  GATE_MODE.STRICT_MANUAL,
};

// ---------------------------------------------------------------------------
// Gate configuration (T2) — single, documented place for the HITL gate knobs.
// IMPORTANT: do NOT lower AUTO_APPROVE_CONFIDENCE. Existing behaviour/tests
// depend on the 0.8 threshold; the demo bad-cases are tuned against it.
// ---------------------------------------------------------------------------
const GATE_CONFIG = {
  // Outputs at or above this confidence may auto-approve; below → HOLD (human).
  AUTO_APPROVE_CONFIDENCE: 0.8,
  // Validation severity that blocks a handoff and marks the artifact INVALID.
  BLOCKING_SEVERITY: 'BLOCKER',
  // Evidence severities that lock the Final Release gate (QA blocker etc.).
  RELEASE_BLOCKING_SEVERITIES: ['BLOCKER', 'CRITICAL', 'HIGH'],
};

const AUTO_APPROVE_CONFIDENCE = GATE_CONFIG.AUTO_APPROVE_CONFIDENCE;

// ---------------------------------------------------------------------------
// Agent output contracts (I5) — the single, explicit, *versioned* source of
// truth for "what each role must produce". `_validateGateOutput` iterates these
// rules instead of hand-inlining them, so the handoff contract is visible in
// one place and a drift test (tests/integration/output-contract.test.js) fails
// if the shape changes without bumping OUTPUT_CONTRACT_VERSION.
//
// Each rule: { rule, severity, check(out, task) -> bool, detail(out)|string,
//              when?(out) -> bool }  (no Ajv — predicates stay hand-written).
// ---------------------------------------------------------------------------
const OUTPUT_CONTRACT_VERSION = 'gate-output.v1';

const _acList = (o) => (Array.isArray(o.acceptance_criteria) ? o.acceptance_criteria : []);
const _matrix = (o) => (Array.isArray(o.ac_coverage_matrix) ? o.ac_coverage_matrix : []);

const PO_RULES = [
  { rule: 'prd_present', severity: 'BLOCKER', detail: 'PRD is empty',
    check: (o) => typeof o.prd === 'string' && o.prd.trim().length > 0 },
  { rule: 'ac_present', severity: 'BLOCKER', detail: 'No acceptance criteria',
    check: (o) => _acList(o).length > 0 },
  { rule: 'ac_measurable', severity: 'WARNING',
    detail: (o) => `${_acList(o).filter((a) => String(a).trim().length < 12).length} acceptance criteria look too vague to test`,
    check: (o) => _acList(o).every((a) => String(a).trim().length >= 12) },
];

const OUTPUT_CONTRACTS = {
  version: OUTPUT_CONTRACT_VERSION,
  'intent-agent': PO_RULES,
  'po-agent': PO_RULES,
  'ux-agent': [
    { rule: 'ux_spec_present', severity: 'BLOCKER', detail: 'UX spec is empty',
      check: (o) => typeof o.ux_spec === 'string' && o.ux_spec.trim().length > 0 },
    { rule: 'screens_present', severity: 'BLOCKER', detail: 'No screens or wireframes',
      check: (o) => !!((o.screens && o.screens.length) || (o.wireframe_spec || '').trim()) },
  ],
  'dev-agent': [
    { rule: 'patch_present', severity: 'BLOCKER', detail: 'No code patch produced',
      check: (o) => (o.patch_diff || o.mock_code_diff || '').trim().length > 0 },
    { rule: 'patch_format', severity: 'WARNING', detail: 'patch_format is not defined',
      check: (o) => !!o.patch_format },
    { rule: 'build_ok', severity: 'BLOCKER', detail: 'Sandbox build did not pass',
      check: (o) => (o.sandbox_result || {}).build_ok !== false },
    { rule: 'sandbox_tests', severity: 'BLOCKER', detail: 'Sandbox test execution evidence is missing',
      check: (o) => (o.sandbox_result || {}).tests_ran === true },
    { rule: 'self_test_report', severity: 'BLOCKER', detail: 'DEV self-test report is missing',
      check: (o) => !!o.self_test_report },
    { rule: 'linked_ac', severity: 'WARNING', detail: 'Patch is not linked to any AC',
      check: (o) => Array.isArray(o.linked_ac_ids) && o.linked_ac_ids.length > 0 },
    { rule: 'security_notes', severity: 'BLOCKER', detail: 'High-risk DEV output is missing security notes',
      when: (o) => !!o.risk_classification?.required_gates?.includes('security'),
      check: (o) => !!o.security_notes },
    { rule: 'security_gate', severity: 'BLOCKER', detail: 'Security gate must PASS before DEV handoff',
      when: (o) => !!o.risk_classification?.required_gates?.includes('security'),
      check: (o) => o.security_gate?.recommendation === 'PASS' },
  ],
  'qa-agent': [
    { rule: 'coverage_present', severity: 'BLOCKER', detail: 'No AC coverage matrix',
      check: (o) => _matrix(o).length > 0 },
    { rule: 'coverage_complete', severity: 'BLOCKER',
      detail: (o) => `${_matrix(o).filter((r) => r.covered !== true).length} acceptance criteria are not covered`,
      check: (o) => _matrix(o).every((r) => r.covered === true) },
    { rule: 'tests_executed', severity: 'BLOCKER', detail: 'Tests were not actually executed',
      check: (o) => (o.test_run_report || {}).executed === true },
    { rule: 'tests_passed', severity: 'BLOCKER',
      detail: (o) => `${(o.test_run_report || {}).failed || 0} test(s) failed`,
      check: (o) => ((o.test_run_report || {}).failed || 0) === 0 },
    { rule: 'no_blockers', severity: 'BLOCKER',
      detail: (o) => `${o.blocker_count || 0} blocker(s) present`,
      check: (o) => (o.blocker_count || 0) === 0 },
    { rule: 'release_reason', severity: 'WARNING', detail: 'Release decision has no justification',
      check: (o) => !!(o.release_reason && o.release_reason.trim()) },
    { rule: 'quality_gate_pass', severity: 'BLOCKER',
      detail: (o, task) => `Quality gate is ${(task?.result?.gateRecommendation) || o.gate_evaluation?.recommendation || 'unknown'}, expected PASS`,
      check: (o, task) => ((task?.result?.gateRecommendation) || o.gate_evaluation?.recommendation) === 'PASS' },
  ],
};

const MAX_RETRY_PER_STEP = 3;
const RETRY_REASONS = ['schema_invalid', 'ac_not_measurable', 'coverage_gap', 'build_fail', 'quality_low', 'other'];

// Timeout / retry budget per agent (plan TIP-010). In mock mode timeouts are
// not enforced (the mock runner always resolves), but the budget is published
// so the orchestrator state machine, audit trail, and UI can reason about it.
const AGENT_POLICY = {
  'po-agent':  { max_attempts: MAX_RETRY_PER_STEP, timeout_seconds: 180 },
  'ux-agent':  { max_attempts: MAX_RETRY_PER_STEP, timeout_seconds: 240 },
  'dev-agent': { max_attempts: MAX_RETRY_PER_STEP, timeout_seconds: 600 },
  'qa-agent':  { max_attempts: 2,                  timeout_seconds: 600 },
};
const FINAL_GATE = 'FINAL_GATE';
const RELEASE_DECISIONS = ['APPROVE', 'REJECT'];
const MOCK_REVIEW_STAGES = ['po-agent', 'ux-agent', 'dev-agent'];
// T3: deterministic demo scenarios, selected via env `MOCK_SCENARIO`.
const MOCK_SCENARIOS = ['happy_path', 'low_confidence_hold', 'missing_evidence', 'qa_blocker', 'release_reject', 'escalation'];
const DEFAULT_MOCK_SCENARIO = 'happy_path';
const VAGUE_REVIEW_COMMENTS = new Set(['rework', 'fix', 'bad', 'wrong', 'redo', 'do again', 'lam lai', 'sua lai']);

const MOCK_SCENARIO_PROFILES = {
  happy_path: {
    title: 'Happy path release',
    outcome: 'All worker gates pass and the final release can be approved.',
    signals: ['high confidence', 'complete evidence', 'QA pass'],
  },
  low_confidence_hold: {
    title: 'Low confidence hold',
    outcome: 'The configured review stage finishes with low confidence and waits for HITL review.',
    signals: ['confidence 0.58', 'manual review required', 'no auto-commit'],
  },
  missing_evidence: {
    title: 'Missing DEV evidence',
    outcome: 'DEV omits sandbox execution evidence, artifacts become INVALID, and QA handoff is blocked.',
    signals: ['sandbox tests not run', 'self test report missing', 'DEV INVALID'],
  },
  qa_blocker: {
    title: 'QA blocker',
    outcome: 'QA finds a blocking regression and the release gate stays locked.',
    signals: ['blocker count 2', 'failed test present', 'release not eligible'],
  },
  release_reject: {
    title: 'Final release reject',
    outcome: 'All agents pass, then the final human release decision rejects the packet.',
    signals: ['QA pass', 'release packet ready', 'final gate rejects'],
  },
  escalation: {
    title: 'Max retry escalation',
    outcome: 'The target review stage remains low confidence after rework and escalates after retry budget.',
    signals: ['confidence stays 0.58', 'rework cannot recover', 'escalation_required'],
  },
};

function resolveMockScenario() {
  const rawScenario = (process.env.MOCK_SCENARIO || '').toLowerCase();
  return MOCK_SCENARIOS.includes(rawScenario) ? rawScenario : DEFAULT_MOCK_SCENARIO;
}

function buildScenarioBrief(scenario, task) {
  const profile = MOCK_SCENARIO_PROFILES[scenario] || MOCK_SCENARIO_PROFILES[DEFAULT_MOCK_SCENARIO];
  return {
    scenario,
    title: profile.title,
    stage: task.type,
    expected_outcome: profile.outcome,
    demo_signals: profile.signals,
  };
}

function applyScenarioNarrative(task, completedData, scenario, feedbackPrompt) {
  const profile = MOCK_SCENARIO_PROFILES[scenario] || MOCK_SCENARIO_PROFILES[DEFAULT_MOCK_SCENARIO];
  const stage = task.type.replace('-agent', '').toUpperCase();
  completedData.summary = `${profile.title}: ${stage} mock output prepared for the demo branch.`;
  completedData.scenario_brief = buildScenarioBrief(scenario, task);
  completedData.observability = {
    ...(completedData.observability || {}),
    trace_id: `mock-${scenario}-${task.type}`,
    scenario,
    feedback_received: Boolean(feedbackPrompt),
  };

  if (task.type === 'po-agent') {
    completedData.prd = `# ${profile.title}\n\nScenario intent: ${profile.outcome}\n\n${completedData.prd || ''}`;
    completedData.scope = `${completedData.scope || ''}\n\nDemo branch: ${profile.title}. Signals: ${profile.signals.join(', ')}.`;
  }

  if (task.type === 'ux-agent') {
    completedData.ux_spec = `# ${profile.title}\n\nUX focus for this branch: ${profile.outcome}\n\n${completedData.ux_spec || ''}`;
    if (Array.isArray(completedData.screens)) {
      completedData.screens = completedData.screens.map((screen) => ({
        ...screen,
        demo_scenario: scenario,
        demo_signal: profile.signals[0],
      }));
    }
  }

  if (task.type === 'dev-agent') {
    completedData.implementation_plan = `# ${profile.title}\n\nImplementation evidence expected: ${profile.signals.join(', ')}.\n\n${completedData.implementation_plan || ''}`;
    completedData.sandbox_report = `${completedData.sandbox_report || ''}\n\nDemo branch: ${profile.title}. Expected outcome: ${profile.outcome}`;
  }

  if (task.type === 'qa-agent') {
    completedData.qa_report = `# ${profile.title}\n\nQA branch result: ${profile.outcome}\n\n${completedData.qa_report || ''}`;
    completedData.release_reason = `${profile.title}: ${profile.outcome}`;
  }
}

function classifyFeatureRequest(featureRequest = {}) {
  const text = `${featureRequest.title || ''} ${featureRequest.description || ''}`.toLowerCase();
  const rules = [
    { tag: 'auth', keywords: ['login', 'signin', 'sign in', 'oauth', 'authentication', 'dang nhap'] },
    { tag: 'payment', keywords: ['payment', 'checkout', 'billing', 'refund', 'stripe'] },
    { tag: 'pii', keywords: ['profile', 'email', 'phone', 'address', 'personal data'] },
    { tag: 'admin', keywords: ['admin', 'permission', 'role', 'rbac'] },
  ];
  const riskTags = rules.filter((rule) => rule.keywords.some((keyword) => text.includes(keyword))).map((rule) => rule.tag);
  const isHighRisk = riskTags.some((tag) => ['auth', 'payment', 'pii', 'admin'].includes(tag));
  if (riskTags.includes('auth')) riskTags.push('oauth', 'session');
  return {
    level: isHighRisk ? 'HIGH' : 'LOW',
    tags: [...new Set(riskTags)],
    required_gates: isHighRisk ? ['schema', 'validation', 'evidence', 'security', 'qa'] : ['schema', 'validation', 'evidence', 'qa'],
    classifier: 'mock-rule-based.v1',
    reason: isHighRisk
      ? 'Sensitive feature keywords require evidence-based review and a security checklist.'
      : 'No sensitive feature keyword was detected by the mock classifier.',
  };
}

function firstContextValue(context, key) {
  const item = Array.isArray(context?.[key]) ? context[key][0] : null;
  return item?.content ?? null;
}

function normalizeStructuredFeedback(payload = {}, comment = '') {
  return {
    decision: 'reject_and_rerun',
    comment: String(comment || '').trim(),
    target_fields: Array.isArray(payload.target_fields) ? payload.target_fields.filter(Boolean) : [],
    blocking_issues: Array.isArray(payload.blocking_issues)
      ? payload.blocking_issues.map((issue) => ({
        severity: issue.severity || 'HIGH',
        issue: String(issue.issue || '').trim(),
        expected_fix: String(issue.expected_fix || '').trim(),
      })).filter((issue) => issue.issue || issue.expected_fix)
      : [],
    acceptance_checks: Array.isArray(payload.acceptance_checks) ? payload.acceptance_checks.filter(Boolean) : [],
    rerun_scope: 'same_agent_only',
  };
}

function validateStructuredFeedback(feedback) {
  if (feedback.comment.length < 10 || VAGUE_REVIEW_COMMENTS.has(feedback.comment.toLowerCase())) {
    throw new ApiError(422, 'Reviewer feedback must explain the requested direction in at least 10 characters.');
  }
  if (!feedback.blocking_issues.length || feedback.blocking_issues.some((issue) => !issue.issue || !issue.expected_fix)) {
    throw new ApiError(422, 'Add at least one blocking issue and the expected fix before rerunning the worker.');
  }
  if (!feedback.acceptance_checks.length) {
    throw new ApiError(422, 'Add at least one acceptance check so the rerun can be verified.');
  }
}

/** Resolve an RFC 6902 JSON Pointer to its parent container + final key. */
function _resolvePointer(doc, pointer) {
  if (pointer === '') return { parent: null, key: null, target: doc };
  const parts = pointer.split('/').slice(1).map((p) => p.replace(/~1/g, '/').replace(/~0/g, '~'));
  let parent = doc;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = Array.isArray(parent) ? Number(parts[i]) : parts[i];
    if (parent[key] === undefined) parent[key] = {};
    parent = parent[key];
  }
  const lastRaw = parts[parts.length - 1];
  const key = Array.isArray(parent) ? (lastRaw === '-' ? parent.length : Number(lastRaw)) : lastRaw;
  return { parent, key };
}

/** Minimal RFC 6902 JSON Patch applier (add / replace / remove). Returns a new doc. */
function applyJsonPatch(source, operations = []) {
  const doc = JSON.parse(JSON.stringify(source || {}));
  for (const op of operations) {
    if (!op || typeof op.path !== 'string') continue;
    const { parent, key } = _resolvePointer(doc, op.path);
    if (parent === null) continue; // replacing whole doc unsupported here
    if (op.op === 'add' || op.op === 'replace') {
      if (Array.isArray(parent) && op.op === 'add') parent.splice(key, 0, op.value);
      else parent[key] = op.value;
    } else if (op.op === 'remove') {
      if (Array.isArray(parent)) parent.splice(key, 1);
      else delete parent[key];
    }
  }
  return doc;
}

/** SHA-256 content hash */
function contentHash(value) {
  const json = typeof value === 'string' ? value : JSON.stringify(value);
  return crypto.createHash('sha256').update(json, 'utf8').digest('hex');
}

/** Build task result from artifacts for client consumption */
function buildTaskResult(task, artifacts = []) {
  const byType = {};
  for (const art of artifacts) {
    const artifactType = art.artifactType || art.type;
    if (!byType[artifactType]) byType[artifactType] = [];
    byType[artifactType].push(art);
  }

  return {
    agentType: task.type,
    artifacts: artifacts.map((a) => ({
      id: a.id,
      phase: a.phase || a.agentType,
      type: a.type || a.artifactType,
      key: a.key || a.artifactKey,
      title: a.title,
      contentText: a.contentText,
      contentJson: a.contentJson,
    })),
    ...task.result,
  };
}

async function resolveArtifactContent(artifact) {
  let contentText = artifact.contentText;
  let contentJson = artifact.contentJson;

  if (typeof contentText === 'string' && contentText.startsWith('FILE:')) {
    try {
      contentText = await fs.readFile(contentText.slice(5), 'utf8');
    } catch (_) {
      contentText = 'File not found';
    }
  }

  if (!contentText && contentJson?.file_path) {
    try {
      const raw = await fs.readFile(contentJson.file_path, 'utf8');
      try {
        contentJson = JSON.parse(raw);
      } catch (_) {
        contentText = raw;
        contentJson = null;
      }
    } catch (_) {
      contentText = 'File not found';
    }
  }

  return { contentText, contentJson };
}

async function formatArtifactForClient(artifact) {
  const { contentText, contentJson } = await resolveArtifactContent(artifact);
  return {
    id: artifact.id,
    taskId: artifact.taskId,
    projectId: artifact.projectId,
    phase: artifact.agentType,
    agentType: artifact.agentType,
    type: artifact.artifactType,
    artifactType: artifact.artifactType,
    key: artifact.artifactKey,
    artifactKey: artifact.artifactKey,
    title: artifact.title,
    contentText,
    contentJson,
    ordinal: artifact.ordinal,
    sourceArtifactId: artifact.sourceArtifactId,
    contentHash: artifact.contentHash,
    createdAt: artifact.createdAt,
    updatedAt: artifact.updatedAt,
  };
}

class SdlcWorkflowService {
  // =========================================================================
  // Run Agents
  // =========================================================================

  /**
   * Start an Intent Agent run — generates AI assumptions from raw request.
   */
  async runIntentAgent({ projectId, featureRequest, feedbackPrompt = '', backlogId = null, user }) {
    if (user) {
      await MembershipService.requireProjectRole(user.id, projectId, ['owner', 'admin', 'editor']);
    }

    const inputHash = contentHash({ featureRequest, feedbackPrompt });
    const task = await Task.create({
      id: uuidv4(),
      projectId,
      type: 'intent-agent',
      status: 'pending',
      inputContentHash: inputHash,
      versionStatus: 'draft',
    });

    if (backlogId) {
      try {
        await FeatureBacklog.linkTask(backlogId, task.id, projectId);
      } catch (error) {
        await Task.deleteById(task.id);
        throw new ApiError(409, error.message);
      }
    }

    this._runAgent(task, {
      featureRequest,
      feedbackPrompt,
    }, user?.id).catch((err) => console.error('[SDLC] Intent Agent failed:', err));

    return task;
  }

  /**
   * Start a PO Agent run — reads intent assumptions, produces PRD artifacts.
   */
  async runPOAgent({ projectId, sourceTaskId = null, featureRequest = null, feedbackPrompt = '', backlogId = null, user }) {
    const sourceTask = sourceTaskId
      ? await this._requireApprovedTask(sourceTaskId, 'intent-agent', user)
      : null;
    const effectiveProjectId = projectId || sourceTask?.projectId;
    if (!effectiveProjectId) throw new ApiError(400, 'projectId is required');
    if (user) {
      await MembershipService.requireProjectRole(user.id, effectiveProjectId, ['owner', 'admin', 'editor']);
    }

    const sourceArtifacts = sourceTask ? await AgentArtifact.findByTaskId(sourceTask.id) : [];
    const inputHash = contentHash({
      featureRequest,
      artifacts: sourceArtifacts.map((a) => a.contentHash),
      feedbackPrompt,
    });

    const task = await Task.create({
      id: uuidv4(),
      projectId: effectiveProjectId,
      type: 'po-agent',
      status: 'pending',
      inputContentHash: inputHash,
      sourceRunId: sourceTask?.id || null,
      versionStatus: 'draft',
    });

    if (backlogId) {
      try {
        await FeatureBacklog.linkTask(backlogId, task.id, effectiveProjectId);
      } catch (error) {
        await Task.deleteById(task.id);
        throw new ApiError(409, error.message);
      }
    }

    const context = await this._buildContextFromArtifacts(sourceArtifacts, {
      feedbackPrompt,
      ...(featureRequest ? { featureRequest } : {}),
    });

    this._runAgent(task, context, user?.id).catch((err) => console.error('[SDLC] PO Agent failed:', err));

    return task;
  }

  /**
   * Start a UX Agent run — reads approved PRD artifacts, produces UX spec.
   */
  async runUXAgent({ projectId, sourceTaskId, feedbackPrompt = '', user }) {
    const sourceTask = await this._requireApprovedTask(sourceTaskId, 'po-agent', user);

    const sourceArtifacts = await AgentArtifact.findByTaskId(sourceTask.id);
    const inputHash = contentHash({
      artifacts: sourceArtifacts.map((a) => a.contentHash),
      feedbackPrompt,
    });

    const task = await Task.create({
      id: uuidv4(),
      projectId: sourceTask.projectId,
      type: 'ux-agent',
      status: 'pending',
      inputContentHash: inputHash,
      sourceRunId: sourceTask.id,
      versionStatus: 'draft',
    });

    const context = await this._buildContextFromArtifacts(sourceArtifacts, { feedbackPrompt });
    this._runAgent(task, context, user?.id).catch((err) => console.error('[SDLC] UX Agent failed:', err));

    return task;
  }

  /**
   * Start a DEV Agent run — reads approved UX artifacts, produces implementation plan.
   */
  async runDEVAgent({ projectId, sourceTaskId, feedbackPrompt = '', user }) {
    const sourceTask = await this._requireApprovedTask(sourceTaskId, 'ux-agent', user);
    const effectiveProjectId = projectId || sourceTask.projectId;

    // Also load PO artifacts for DEV context
    const poTask = await Task.findLatestByProject(effectiveProjectId, 'po-agent', 'completed', 'committed');
    const [uxArtifacts, poArtifacts] = await Promise.all([
      AgentArtifact.findByTaskId(sourceTask.id),
      poTask ? AgentArtifact.findByTaskId(poTask.id) : Promise.resolve([]),
    ]);

    const inputHash = contentHash({
      artifacts: [...uxArtifacts, ...poArtifacts].map((a) => a.contentHash),
      feedbackPrompt,
    });

    const task = await Task.create({
      id: uuidv4(),
      projectId: sourceTask.projectId,
      type: 'dev-agent',
      status: 'pending',
      inputContentHash: inputHash,
      sourceRunId: sourceTask.id,
      versionStatus: 'draft',
    });

    const context = await this._buildContextFromArtifacts([...poArtifacts, ...uxArtifacts], { feedbackPrompt });
    this._runAgent(task, context, user?.id).catch((err) => console.error('[SDLC] DEV Agent failed:', err));

    return task;
  }

  /**
   * Start a QA Agent run — reads DEV artifacts + all upstream, produces test cases.
   */
  async runQAAgent({ projectId, sourceTaskId, feedbackPrompt = '', user }) {
    const sourceTask = await this._requireApprovedTask(sourceTaskId, 'dev-agent', user);
    const effectiveProjectId = projectId || sourceTask.projectId;

    const [poTask, uxTask] = await Promise.all([
      Task.findLatestByProject(effectiveProjectId, 'po-agent', 'completed', 'committed'),
      Task.findLatestByProject(effectiveProjectId, 'ux-agent', 'completed', 'committed'),
    ]);

    const allArtifacts = (
      await Promise.all([
        poTask ? AgentArtifact.findByTaskId(poTask.id) : Promise.resolve([]),
        uxTask ? AgentArtifact.findByTaskId(uxTask.id) : Promise.resolve([]),
        AgentArtifact.findByTaskId(sourceTask.id),
      ])
    ).flat();

    const inputHash = contentHash({
      artifacts: allArtifacts.map((a) => a.contentHash),
      feedbackPrompt,
    });

    const task = await Task.create({
      id: uuidv4(),
      projectId: sourceTask.projectId,
      type: 'qa-agent',
      status: 'pending',
      inputContentHash: inputHash,
      sourceRunId: sourceTask.id,
      versionStatus: 'draft',
    });

    const context = await this._buildContextFromArtifacts(allArtifacts, { feedbackPrompt });
    this._runAgent(task, context, user?.id).catch((err) => console.error('[SDLC] QA Agent failed:', err));

    return task;
  }

  // =========================================================================
  // HITL Gate
  // =========================================================================

  /**
   * Human submits a gate decision: APPROVE | REJECT | REQUEST_CHANGES
   */
  async submitGateDecision({ taskId, decision, comment, user }) {
    const task = await Task.findById(taskId);
    if (!task) throw new ApiError(404, 'Task not found');
    if (user) await MembershipService.requireProjectRole(user.id, task.projectId, ['owner', 'admin', 'editor']);
    if (task.status !== 'completed') throw new ApiError(400, 'Task must be completed before gate decision');

    const gate = AGENT_GATES[task.type];
    if (!gate) throw new ApiError(400, `Task type ${task.type} has no gate`);

    if (!['APPROVE', 'REJECT', 'REQUEST_CHANGES'].includes(decision)) {
      throw new ApiError(400, 'Decision must be APPROVE | REJECT | REQUEST_CHANGES');
    }
    if (task.type === 'qa-agent' && decision === 'APPROVE' && task.result?.gateRecommendation !== 'PASS') {
      throw new ApiError(409, 'QA quality gate must PASS before final approval');
    }
    const gateEvaluation = this._evaluateGatePolicy(task);
    if (decision === 'APPROVE'
        && gateEvaluation.recommendation === 'HOLD'
        && task.gateMode === GATE_MODE.CONFIDENCE) {
      throw new ApiError(409, 'Low-confidence output must be sent back to the owning worker with reviewer feedback');
    }

    const hitlRecord = await HitlDecision.create({
      id: uuidv4(),
      workflowRunId: task.projectId, // use projectId as workflow scope
      taskId: task.id,
      projectId: task.projectId,
      gate,
      decision,
      comment: comment || '',
      reviewerId: user?.id || null,
    });

    if (decision === 'APPROVE') {
      await Task.commitTask(taskId);
      await this._recordApprovedHandoff(task, hitlRecord);
      const refreshed = await Task.findById(taskId);
      await this._startNextAgentIfAvailable(refreshed, user?.id);
    } else if (decision === 'REQUEST_CHANGES' && comment) {
      // Trigger targeted rework automatically in the background
      this.triggerRework({
        projectId: task.projectId,
        sourceTaskId: taskId,
        feedbackPrompt: comment,
        user
      }).catch(err => console.error('[SDLC] Rework triggered by gate decision failed:', err));
    }

    return { task, hitlDecision: hitlRecord };
  }

  // =========================================================================
  // Structured HITL gate (plan section 2): real validation, gate mode, the
  // three actions, idempotency, optimistic lock, max-retry + escalation,
  // and field-level JSON Patch edits.
  // =========================================================================

  /**
   * Real gate validation (plan 2.2): the output must be structurally complete
   * and measurable before a human may approve. Returns { ok, violations }.
   */
  _validateGateOutput(task, output) {
    const out = output || {};
    const rules = OUTPUT_CONTRACTS[task.type] || [];
    const violations = [];

    for (const rule of rules) {
      if (rule.when && !rule.when(out, task)) continue;
      if (rule.check(out, task)) continue;
      const detail = typeof rule.detail === 'function' ? rule.detail(out, task) : rule.detail;
      violations.push({ rule: rule.rule, detail, severity: rule.severity });
    }

    const blockers = violations.filter((v) => v.severity === 'BLOCKER');
    return { ok: blockers.length === 0, violations };
  }

  _evaluateGatePolicy(task) {
    const output = task.agentOutput || {};
    const validation = this._validateGateOutput(task, output);
    const confidence = Number(output.confidence_score ?? 0.95);
    const lowConfidence = !Number.isFinite(confidence) || confidence < AUTO_APPROVE_CONFIDENCE;
    const warnings = validation.violations.filter((violation) => violation.severity === 'WARNING');
    const securityIssues = Array.isArray(output.security_gate?.issues) ? output.security_gate.issues : [];
    const needsHuman = task.gateMode === GATE_MODE.STRICT_MANUAL || !validation.ok || warnings.length > 0 || lowConfidence || securityIssues.length > 0;
    const reasons = [];
    const issues = [];
    if (task.gateMode === GATE_MODE.STRICT_MANUAL) reasons.push('This gate always requires a human decision.');
    if (lowConfidence) {
      reasons.push(`Confidence ${confidence.toFixed(2)} is below the ${AUTO_APPROVE_CONFIDENCE.toFixed(2)} threshold.`);
      issues.push({
        code: 'low_confidence',
        severity: 'WARNING',
        detail: `The ${task.type.replace('-agent', '').toUpperCase()} worker returned confidence ${confidence.toFixed(2)}. The required threshold is ${AUTO_APPROVE_CONFIDENCE.toFixed(2)}.`,
        suggestedAction: 'Tell the worker what to improve and send the output back for a new run.',
      });
    }
    if (!validation.ok) reasons.push('Validation found blocking issues.');
    if (warnings.length > 0) reasons.push(`Validation found ${warnings.length} warning(s).`);
    for (const violation of validation.violations) {
      issues.push({
        code: violation.rule,
        severity: violation.severity,
        detail: violation.detail,
        suggestedAction: 'Include this issue in the reviewer feedback before rerunning the worker.',
      });
    }
    for (const issue of securityIssues) {
      issues.push({
        code: issue.code || 'security_review',
        severity: issue.severity || 'HIGH',
        detail: issue.detail || 'Security evidence requires human review.',
        suggestedAction: issue.expected_fix || 'Send the security requirement back to DEV and rerun the sandbox checks.',
      });
    }

    return {
      complexity: task.type.replace('-agent', ''),
      gateType: task.gateMode,
      score: Math.round(confidence * 100),
      confidence,
      recommendation: needsHuman ? 'HOLD' : 'PASS',
      summary: reasons.join(' ') || 'Confidence and validation checks passed. Safe to auto-approve.',
      issues,
      validation,
    };
  }

  /**
   * Structured HITL decision with the three actions (approve / reject /
   * edit_approve), idempotency, optimistic locking, bounded retries with
   * escalation, and JSON-Patch field edits. Coexists with submitGateDecision.
   */
  async submitStructuredDecision({ taskId, decisionId, baseOutputVersion, action, payload = {}, comment = '', user }) {
    const task = await Task.findById(taskId);
    if (!task) throw new ApiError(404, 'Task not found');
    if (user) await MembershipService.requireProjectRole(user.id, task.projectId, ['owner', 'admin', 'editor']);
    if (task.status !== 'completed') throw new ApiError(400, 'Task must be completed before a gate decision');

    const gate = AGENT_GATES[task.type];
    if (!gate) throw new ApiError(400, `Task type ${task.type} has no gate`);
    if (!['approve', 'reject', 'edit_approve'].includes(action)) {
      throw new ApiError(400, 'action must be approve | reject | edit_approve');
    }
    if (!decisionId) throw new ApiError(400, 'decision_id is required (idempotency key)');

    // 1. Idempotency (plan 2.8): replay the prior result, never re-process.
    const existing = await HitlDecision.findByDecisionId(decisionId);
    if (existing) return { task, hitlDecision: existing, idempotentReplay: true };

    // 2. Optimistic lock (plan 2.8): reject stale decisions.
    if (baseOutputVersion !== undefined && baseOutputVersion !== null
        && Number(baseOutputVersion) !== Number(task.outputVersion || 0)) {
      throw new ApiError(409, `Stale output version (current ${task.outputVersion || 0}, got ${baseOutputVersion}). Reload the latest output.`);
    }

    const currentOutput = task.approvedOutput || task.agentOutput || {};
    const gateEvaluation = this._evaluateGatePolicy(task);

    if (gateEvaluation.recommendation === 'HOLD'
        && task.gateMode === GATE_MODE.CONFIDENCE
        && action !== 'reject') {
      throw new ApiError(409, 'Low-confidence output must be sent back to the owning worker with reviewer feedback');
    }

    // ----- REJECT: bounded re-run with feedback, escalate past max retry -----
    if (action === 'reject') {
      const retryReason = RETRY_REASONS.includes(payload.retry_reason) ? payload.retry_reason : 'other';
      const structuredFeedback = normalizeStructuredFeedback(payload, comment);
      validateStructuredFeedback(structuredFeedback);
      const nextRetry = (task.retryCount || 0) + 1;

      if (nextRetry > MAX_RETRY_PER_STEP) {
        await Task.update(task.id, { retryCount: nextRetry, lastRetryReason: retryReason });
        const escalation = await HitlDecision.create({
          id: uuidv4(), taskId: task.id, projectId: task.projectId, workflowRunId: task.projectId,
          gate, decision: 'REJECT', action: 'escalation_required', decisionId,
          baseOutputVersion: task.outputVersion || 0, retryReason,
          comment: comment || 'Exceeded max retries — needs human resolution',
          payload: { retry_count: nextRetry, status: 'needs_human_resolution', feedback: structuredFeedback },
        });
        return { task, hitlDecision: escalation, escalated: true };
      }

      const record = await HitlDecision.create({
        id: uuidv4(), taskId: task.id, projectId: task.projectId, workflowRunId: task.projectId,
        gate, decision: 'REJECT', action: 'reject', decisionId,
        baseOutputVersion: task.outputVersion || 0, retryReason, comment,
        payload: { retry_count: nextRetry, feedback: structuredFeedback },
      });
      await Task.update(task.id, { retryCount: nextRetry, lastRetryReason: retryReason });
      const rerunTask = await this._rerunOwningWorker({
        rejectedTask: task,
        feedbackPrompt: JSON.stringify(structuredFeedback),
        user,
      });
      await Task.update(rerunTask.id, { retryCount: nextRetry, lastRetryReason: retryReason });
      return { task, hitlDecision: record, rerunTask };
    }

    // ----- EDIT_APPROVE: apply JSON Patch, then validate + approve -----
    let approvedOutput = currentOutput;
    let jsonPatch = null;
    if (action === 'edit_approve') {
      jsonPatch = Array.isArray(payload.patch) ? payload.patch : [];
      approvedOutput = (payload.edited_output && typeof payload.edited_output === 'object')
        ? payload.edited_output
        : applyJsonPatch(currentOutput, jsonPatch);
    }

    // ----- Gate validation before approve (plan 2.2) -----
    const validation = this._validateGateOutput(task, approvedOutput);
    if (!validation.ok) {
      const blockers = validation.violations.filter((v) => v.severity === 'BLOCKER').map((v) => v.rule).join(', ');
      throw new ApiError(422, `Gate validation failed: ${blockers}`);
    }

    // ----- Commit approved output; A2A handoff uses approved_output (plan 2.4) -----
    const newVersion = (task.outputVersion || 0) + (action === 'edit_approve' ? 1 : 0);
    await Task.update(task.id, { approvedOutput, outputVersion: newVersion, version_status: 'committed' });
    await Task.commitTask(taskId);

    const record = await HitlDecision.create({
      id: uuidv4(), taskId: task.id, projectId: task.projectId, workflowRunId: task.projectId,
      gate, decision: 'APPROVE', action, decisionId,
      baseOutputVersion: task.outputVersion || 0, comment, jsonPatch,
      payload: { validation },
    });

    const refreshed = await Task.findById(taskId);
    await this._recordApprovedHandoff(refreshed, record);
    await this._startNextAgentIfAvailable(refreshed, user?.id);
    return { task: refreshed, hitlDecision: record, validation };
  }

  // =========================================================================
  // Targeted Rework Logic
  // =========================================================================

  /**
   * Evaluates the feedback via Python agents and triggers the appropriate agent.
   */
  async triggerRework({ projectId, sourceTaskId, feedbackPrompt, user }) {
    console.log(`[SDLC] Triggering Rework for project ${projectId}. Feedback: "${feedbackPrompt}"`);

    const rejectedTask = await Task.findById(sourceTaskId);
    if (!rejectedTask) throw new ApiError(404, 'Source task not found');
    if (user) await MembershipService.requireProjectRole(user.id, rejectedTask.projectId, ['owner', 'admin', 'editor']);

    if (rejectedTask.type === 'intent-agent') {
      const featureRequest = await this._getFeatureRequestFromIntentTask(rejectedTask);
      return this.runIntentAgent({
        projectId: rejectedTask.projectId,
        featureRequest,
        feedbackPrompt,
        user,
      });
    }
    if (rejectedTask.type === 'po-agent') {
      const featureRequest = await this._getFeatureRequestFromTask(rejectedTask);
      return this.runPOAgent({
        projectId: rejectedTask.projectId,
        featureRequest,
        feedbackPrompt,
        user,
      });
    }

    // 1. Ask python Agent Server to analyze the feedback and route it
    const targetAgent = await AgentService.routeRework(feedbackPrompt);
    console.log(`[SDLC] Agent Server routed rework to: ${targetAgent}`);

    const reworkTarget = REWORK_TARGETS[targetAgent] || REWORK_TARGETS.dev_agent;
    if (!REWORK_TARGETS[targetAgent]) {
      console.warn(`[SDLC] Unrecognized rework target: ${targetAgent}. Defaulting to DEV.`);
    }

    const upstream = await Task.findLatestByProject(
      projectId || rejectedTask.projectId,
      reworkTarget.sourceType,
      'completed',
      'committed',
    );
    if (!upstream) {
      throw new ApiError(400, `Cannot rework ${targetAgent}: no committed ${reworkTarget.sourceType} source found`);
    }

    return this[reworkTarget.run]({
      projectId: projectId || rejectedTask.projectId,
      sourceTaskId: upstream.id,
      feedbackPrompt,
      user,
    });
  }

  // =========================================================================
  // Final Review Packet
  // =========================================================================

  async getFinalReviewPacket(projectId, user) {
    if (user) {
      await MembershipService.requireProjectRole(user.id, projectId, ['owner', 'admin', 'editor', 'viewer']);
    }

    const [intentTask, poTask, uxTask, devTask, qaTask] = await Promise.all([
      Task.findLatestByProject(projectId, 'intent-agent', 'completed', 'committed'),
      Task.findLatestByProject(projectId, 'po-agent', 'completed', 'committed'),
      Task.findLatestByProject(projectId, 'ux-agent', 'completed', 'committed'),
      Task.findLatestByProject(projectId, 'dev-agent', 'completed', 'committed'),
      Task.findLatestByProject(projectId, 'qa-agent', 'completed'),
    ]);

    const allArtifacts = (
      await Promise.all([
        intentTask ? AgentArtifact.findByTaskId(intentTask.id) : Promise.resolve([]),
        poTask ? AgentArtifact.findByTaskId(poTask.id) : Promise.resolve([]),
        uxTask ? AgentArtifact.findByTaskId(uxTask.id) : Promise.resolve([]),
        devTask ? AgentArtifact.findByTaskId(devTask.id) : Promise.resolve([]),
        qaTask ? AgentArtifact.findByTaskId(qaTask.id) : Promise.resolve([]),
      ])
    ).flat();

    const hitlDecisions = await HitlDecision.findByProjectId(projectId);

    return {
      phases: {
        intent: intentTask ? { taskId: intentTask.id, status: intentTask.status, versionStatus: intentTask.versionStatus } : null,
        po: poTask ? { taskId: poTask.id, status: poTask.status, versionStatus: poTask.versionStatus } : null,
        ux: uxTask ? { taskId: uxTask.id, status: uxTask.status, versionStatus: uxTask.versionStatus } : null,
        dev: devTask ? { taskId: devTask.id, status: devTask.status, versionStatus: devTask.versionStatus } : null,
        qa: qaTask ? { taskId: qaTask.id, status: qaTask.status, versionStatus: qaTask.versionStatus } : null,
      },
      artifacts: await Promise.all(allArtifacts.map((a) => formatArtifactForClient(a))),
      hitlDecisions,
      generatedAt: new Date().toISOString(),
    };
  }

  // =========================================================================
  // Audit Trail
  // =========================================================================

  async getAuditTrail(projectId, user) {
    if (user) {
      await MembershipService.requireProjectRole(user.id, projectId, ['owner', 'admin', 'editor', 'viewer']);
    }

    const [tasks, hitlDecisions] = await Promise.all([
      Task.findByProjectId(projectId),
      HitlDecision.findByProjectId(projectId),
    ]);

    const sdlcTasks = tasks.filter((t) => ['intent-agent', 'po-agent', 'ux-agent', 'dev-agent', 'qa-agent'].includes(t.type));
    const handoffArtifacts = (
      await Promise.all(sdlcTasks.map((task) => AgentArtifact.findByTaskIdAndType(task.id, 'a2a_handoff')))
    ).flat();
    const taskById = Object.fromEntries(sdlcTasks.map((t) => [t.id, t]));
    const label = (type) => (type || '').replace('-agent', '').toUpperCase();
    // version tag for an agent task, e.g. "DEV v2" (attempt = retryCount + 1)
    const vtag = (t) => `${label(t.type)} v${(t.retryCount || 0) + 1}`;

    // Map a structured HITL decision onto an explicit lifecycle state name
    // (plan TIP-002 state machine + Scenario D audit chain).
    const decisionState = (d, task) => {
      const attempt = (task?.retryCount || 0) + 1;
      if (d.action === 'auto_approve') return { state: 'AUTO_APPROVED', actor: 'ORCHESTRATOR', type: 'hitl_decision' };
      if (d.action === 'escalation_required') return { state: 'MAX_RETRY_EXCEEDED', actor: 'ORCHESTRATOR', type: 'escalation' };
      if (d.decision === 'REJECT' && d.gate !== FINAL_GATE) return { state: 'HUMAN_REJECTED', actor: 'HUMAN', type: 'hitl_decision' };
      if (d.gate === FINAL_GATE) return { state: d.decision === 'APPROVE' ? 'RELEASED' : 'RELEASE_REJECTED', actor: 'HUMAN', type: 'release_decision' };
      if (d.decision === 'APPROVE') return { state: attempt > 1 ? 'APPROVED_AFTER_RERUN' : 'HUMAN_APPROVED', actor: 'HUMAN', type: 'hitl_decision' };
      return { state: (d.action || d.decision || 'DECISION').toUpperCase(), actor: 'HUMAN', type: 'hitl_decision' };
    };

    const events = [
      ...sdlcTasks.map((t) => ({
        timestamp: t.createdAt,
        actor: t.type.toUpperCase().replace('-', '_'),
        action: `START_${label(t.type)}_AGENT`,
        taskId: t.id,
        agent: t.type,
        status: t.status,
        attempt: (t.retryCount || 0) + 1,
        outputVersion: t.outputVersion ?? 0,
        stateFrom: (t.retryCount || 0) > 0 ? 'RERUNNING' : 'PENDING',
        stateTo: 'RUNNING',
        versionTag: vtag(t),
        type: 'agent_run',
      })),
      ...sdlcTasks
        .filter((t) => t.status === 'completed')
        .map((t) => ({
          timestamp: t.updatedAt,
          actor: t.type.toUpperCase().replace('-', '_'),
          action: `OUTPUT_DRAFTED_${label(t.type)}`,
          taskId: t.id,
          agent: t.type,
          status: 'completed',
          attempt: (t.retryCount || 0) + 1,
          outputVersion: t.outputVersion ?? 0,
          stateFrom: 'RUNNING',
          stateTo: 'OUTPUT_DRAFTED',
          versionTag: vtag(t),
          type: 'agent_complete',
        })),
      ...sdlcTasks
        .filter((t) => t.status === 'failed')
        .map((t) => ({
          timestamp: t.updatedAt,
          actor: t.type.toUpperCase().replace('-', '_'),
          action: `FAILED_${label(t.type)}`,
          taskId: t.id,
          agent: t.type,
          status: 'failed',
          comment: t.error || null,
          stateTo: 'FAILED',
          severity: 'HIGH',
          versionTag: vtag(t),
          type: 'failure',
        })),
      ...hitlDecisions.map((d) => {
        const task = taskById[d.taskId];
        const mapped = decisionState(d, task);
        const blockingIssues = d.payload?.feedback?.blocking_issues || [];
        return {
          timestamp: d.createdAt,
          actor: mapped.actor,
          action: `${mapped.state}_${d.gate}`,
          taskId: d.taskId,
          agent: task?.type || null,
          gate: d.gate,
          decision: d.decision,
          comment: d.comment,
          stateTo: mapped.state,
          attempt: (task?.retryCount || 0) + 1,
          outputVersion: task?.outputVersion ?? d.baseOutputVersion ?? null,
          versionTag: task ? vtag(task) : null,
          severity: mapped.type === 'escalation' ? 'HIGH' : null,
          // T2: make the gate decision auditable — why it fired and which rule.
          reason: d.comment || null,
          ruleHit: d.retryReason
            || (d.action === 'auto_approve' ? 'confidence_and_validation_passed' : null)
            || (d.payload?.feedback?.blocking_issues?.[0]?.issue || null),
          // Structured HITL detail (plan section 3): replayable audit record.
          hitlAction: d.action || null,
          retryReason: d.retryReason || null,
          blockingIssueCount: Array.isArray(blockingIssues) ? blockingIssues.length : 0,
          jsonPatch: d.jsonPatch || null,
          baseOutputVersion: d.baseOutputVersion ?? null,
          type: mapped.type,
        };
      }),
      ...handoffArtifacts.map((artifact) => {
        const envelope = artifact.contentJson || {};
        const sourceTask = taskById[artifact.taskId];
        return {
          timestamp: artifact.createdAt,
          actor: 'ORCHESTRATOR',
          action: `HANDOFF_EMITTED_${label(envelope.from_agent)}_TO_${label(envelope.to_agent)}`,
          taskId: artifact.taskId,
          fromAgent: envelope.from_agent || null,
          toAgent: envelope.to_agent || null,
          attempt: envelope.attempt ?? ((sourceTask?.retryCount || 0) + 1),
          handoffId: envelope.handoff_id || null,
          artifactHash: envelope.output_artifact?.hash || null,
          stateFrom: 'APPROVED',
          stateTo: 'HANDOFF_EMITTED',
          versionTag: sourceTask ? vtag(sourceTask) : null,
          type: 'a2a_handoff',
        };
      }),
    ].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    // I3: synthesize a consistent PHASE_TRANSITION chain from the existing
    // ordered events (no new table, no Workflow model). Each event already
    // carries stateFrom/stateTo; we fill any missing `from` from the previous
    // `to` so the chain is continuous. requestId stays null for now (I2 keeps
    // request correlation in logs/error responses, not in the persisted audit).
    let prevTo = 'PENDING';
    const phaseTransitions = events
      .filter((e) => e.stateTo)
      .map((e) => {
        const from = e.stateFrom || prevTo;
        prevTo = e.stateTo;
        return {
          type: 'PHASE_TRANSITION',
          from,
          to: e.stateTo,
          cause: e.action,
          at: e.timestamp,
          agent: e.agent || e.fromAgent || null,
          taskId: e.taskId || null,
          requestId: null,
        };
      });

    return { projectId, events, phaseTransitions };
  }

  // =========================================================================
  // Workflow Metrics (plan TIP-011)
  // =========================================================================

  /**
   * Compute workflow health metrics for a project from the persisted tasks and
   * HITL decisions. All values are derived (no separate metrics store), so the
   * audit trail remains the single source of truth.
   */
  async getWorkflowMetrics(projectId, user) {
    if (user) {
      await MembershipService.requireProjectRole(user.id, projectId, ['owner', 'admin', 'editor', 'viewer']);
    }

    const [tasks, hitlDecisions] = await Promise.all([
      Task.findByProjectId(projectId),
      HitlDecision.findByProjectId(projectId),
    ]);
    const sdlcTasks = tasks.filter((t) => ['intent-agent', 'po-agent', 'ux-agent', 'dev-agent', 'qa-agent'].includes(t.type));
    const taskById = Object.fromEntries(sdlcTasks.map((t) => [t.id, t]));
    const gateDecisions = hitlDecisions.filter((d) => d.gate !== FINAL_GATE);

    // ----- Cycle time: first agent start → release decision (or latest task update) -----
    const startTs = sdlcTasks.length ? Math.min(...sdlcTasks.map((t) => new Date(t.createdAt).getTime())) : null;
    const releaseDecision = [...hitlDecisions].reverse().find((d) => d.gate === FINAL_GATE) || null;
    const endTs = releaseDecision
      ? new Date(releaseDecision.createdAt).getTime()
      : (sdlcTasks.length ? Math.max(...sdlcTasks.map((t) => new Date(t.updatedAt).getTime())) : null);
    const cycleTimeSeconds = startTs && endTs ? Math.max(0, Math.round((endTs - startTs) / 1000)) : null;

    // ----- Time per agent (average wall time of completed runs, in seconds) -----
    const timePerAgent = {};
    for (const stage of ['po-agent', 'ux-agent', 'dev-agent', 'qa-agent']) {
      const runs = sdlcTasks.filter((t) => t.type === stage && t.status === 'completed');
      const durations = runs.map((t) => Math.max(0, (new Date(t.updatedAt).getTime() - new Date(t.createdAt).getTime()) / 1000));
      timePerAgent[stage] = {
        runs: runs.length,
        avg_seconds: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null,
      };
    }

    // ----- Approval / rejection / rerun distribution -----
    const autoApprovals = gateDecisions.filter((d) => d.action === 'auto_approve').length;
    const humanApprovals = gateDecisions.filter((d) => d.decision === 'APPROVE' && d.action !== 'auto_approve').length;
    const rejections = gateDecisions.filter((d) => d.decision === 'REJECT' && d.action !== 'escalation_required').length;
    const escalations = gateDecisions.filter((d) => d.action === 'escalation_required').length;
    const totalApprovals = autoApprovals + humanApprovals;
    const totalDecisions = totalApprovals + rejections + escalations;
    const pct = (num, den) => (den > 0 ? Math.round((num / den) * 1000) / 10 : 0);

    const rerunCountPerStage = {};
    const gateFailureReasons = {};
    for (const d of gateDecisions) {
      if (d.decision === 'REJECT' || d.action === 'escalation_required') {
        const stage = taskById[d.taskId]?.type || 'unknown';
        rerunCountPerStage[stage] = (rerunCountPerStage[stage] || 0) + 1;
        const reason = d.retryReason || 'other';
        gateFailureReasons[reason] = (gateFailureReasons[reason] || 0) + 1;
      }
    }

    // ----- False auto-approval: auto-approved task later rejected by a human -----
    const rejectedTaskIds = new Set(gateDecisions.filter((d) => d.decision === 'REJECT').map((d) => d.taskId));
    const falseAutoApprovals = gateDecisions.filter((d) => d.action === 'auto_approve' && rejectedTaskIds.has(d.taskId)).length;

    // ----- Sandbox / QA / coverage from the latest committed outputs -----
    const devTask = await Task.findLatestByProject(projectId, 'dev-agent', 'completed', 'committed');
    const qaTask = await Task.findLatestByProject(projectId, 'qa-agent', 'completed');
    const sandbox = devTask?.approvedOutput?.sandbox_result || devTask?.agentOutput?.sandbox_result || null;
    const qaOutput = qaTask?.approvedOutput || qaTask?.agentOutput || {};
    const deadLetterTasks = sdlcTasks.filter((t) => (t.retryCount || 0) > MAX_RETRY_PER_STEP).length + escalations;

    return {
      projectId,
      generatedAt: new Date().toISOString(),
      cycle_time_seconds: cycleTimeSeconds,
      time_per_agent: timePerAgent,
      auto_approval_rate: pct(autoApprovals, totalApprovals),
      human_rejection_rate: pct(rejections, totalDecisions),
      rerun_count_per_stage: rerunCountPerStage,
      gate_failure_reason_distribution: gateFailureReasons,
      sandbox_pass: sandbox ? (sandbox.build_ok !== false && sandbox.tests_ran === true) : null,
      qa_gate: qaTask?.result?.gateRecommendation || null,
      requirement_coverage_percentage: qaOutput.coverage_summary?.percentage ?? null,
      false_auto_approval_rate: pct(falseAutoApprovals, autoApprovals),
      dead_letter_count: deadLetterTasks,
      counts: {
        total_runs: sdlcTasks.length,
        auto_approvals: autoApprovals,
        human_approvals: humanApprovals,
        rejections,
        escalations,
        total_decisions: totalDecisions,
      },
      agent_policy: AGENT_POLICY,
    };
  }

  async submitReleaseDecision({ projectId, decisionId, decision, comment = '', user }) {
    if (!RELEASE_DECISIONS.includes(decision)) {
      throw new ApiError(400, 'decision must be APPROVE | REJECT');
    }
    if (!decisionId) throw new ApiError(400, 'decision_id is required (idempotency key)');

    const membership = user
      ? await MembershipService.requireProjectRole(user.id, projectId, ['owner', 'admin', 'editor', 'viewer'])
      : null;
    if (membership && !['owner', 'admin'].includes(membership.role)) {
      throw new ApiError(403, 'Only project owners and admins may approve or reject a release.');
    }

    const existing = await HitlDecision.findByDecisionId(decisionId);
    if (existing) return { hitlDecision: existing, idempotentReplay: true };
    const priorDecisions = await HitlDecision.findByProjectId(projectId);
    const priorReleaseDecision = [...priorDecisions].reverse().find((record) => record.gate === FINAL_GATE);
    if (priorReleaseDecision && ['APPROVE', 'REJECT'].includes(priorReleaseDecision.decision)) {
      throw new ApiError(409, `Release already finalized as ${priorReleaseDecision.decision}`);
    }

    const qaTask = await Task.findLatestByProject(projectId, 'qa-agent', 'completed', 'committed');
    if (!qaTask) throw new ApiError(409, 'Release gate is unavailable until QA is approved');
    if (qaTask.result?.gateRecommendation !== 'PASS') {
      throw new ApiError(409, 'Release gate is unavailable until QA quality gate returns PASS');
    }
    const evidence = await this._buildReleaseEvidenceSummary(projectId);
    if (decision === 'APPROVE' && evidence.open_blockers.some((blocker) => GATE_CONFIG.RELEASE_BLOCKING_SEVERITIES.includes(blocker.severity))) {
      throw new ApiError(409, 'Release approval is blocked until all critical and high-risk evidence issues are resolved');
    }

    const releaseComment = comment || {
      APPROVE: 'Release approved by authorized reviewer',
      REJECT: 'Release rejected by authorized reviewer',
    }[decision];
    const record = await HitlDecision.create({
      id: uuidv4(),
      workflowRunId: projectId,
      taskId: qaTask.id,
      projectId,
      gate: FINAL_GATE,
      decision,
      action: `release_${decision.toLowerCase()}`,
      decisionId,
      comment: releaseComment,
      reviewerId: user?.id || null,
      payload: {
        release_status: {
          APPROVE: 'released',
          REJECT: 'rejected',
        }[decision],
        reviewer_role: membership?.role || null,
        evidence,
      },
    });

    return { hitlDecision: record };
  }

  async _buildReleaseEvidenceSummary(projectId) {
    const [poTask, uxTask, devTask, qaTask] = await Promise.all([
      Task.findLatestByProject(projectId, 'po-agent', 'completed', 'committed'),
      Task.findLatestByProject(projectId, 'ux-agent', 'completed', 'committed'),
      Task.findLatestByProject(projectId, 'dev-agent', 'completed', 'committed'),
      Task.findLatestByProject(projectId, 'qa-agent', 'completed', 'committed'),
    ]);
    const risk = poTask?.approvedOutput?.risk_classification || poTask?.agentOutput?.risk_classification || null;
    const securityGate = devTask?.approvedOutput?.security_gate || devTask?.agentOutput?.security_gate || null;
    const qaOutput = qaTask?.approvedOutput || qaTask?.agentOutput || {};
    const openBlockers = [
      ...(securityGate?.issues || []),
      ...((qaOutput.blocker_count || 0) > 0 ? [{ severity: 'BLOCKER', code: 'qa_blockers', detail: `${qaOutput.blocker_count} QA blocker(s) remain.` }] : []),
    ];
    return {
      feature: poTask?.approvedOutput?.feature_request || poTask?.agentOutput?.feature_request || null,
      risk,
      versions: {
        po: poTask ? { task_id: poTask.id, output_version: poTask.outputVersion } : null,
        ux: uxTask ? { task_id: uxTask.id, output_version: uxTask.outputVersion } : null,
        dev: devTask ? { task_id: devTask.id, output_version: devTask.outputVersion } : null,
        qa: qaTask ? { task_id: qaTask.id, output_version: qaTask.outputVersion } : null,
      },
      sandbox_result: devTask?.approvedOutput?.sandbox_result || devTask?.agentOutput?.sandbox_result || null,
      security_gate: securityGate,
      qa_gate: qaTask?.result?.gateRecommendation || null,
      coverage_percentage: qaOutput.coverage_summary?.percentage ?? null,
      open_blockers: openBlockers,
    };
  }

  async _rerunOwningWorker({ rejectedTask, feedbackPrompt, user }) {
    if (rejectedTask.type === 'intent-agent') {
      const featureRequest = await this._getFeatureRequestFromIntentTask(rejectedTask);
      return this.runIntentAgent({ projectId: rejectedTask.projectId, featureRequest, feedbackPrompt, user });
    }
    if (rejectedTask.type === 'po-agent') {
      const featureRequest = await this._getFeatureRequestFromTask(rejectedTask);
      return this.runPOAgent({ projectId: rejectedTask.projectId, featureRequest, feedbackPrompt, user });
    }

    const ownerTarget = {
      'ux-agent': REWORK_TARGETS.ux_agent,
      'dev-agent': REWORK_TARGETS.dev_agent,
      'qa-agent': REWORK_TARGETS.qa_agent,
    }[rejectedTask.type];
    if (!ownerTarget) throw new ApiError(400, `Cannot rerun unsupported task type: ${rejectedTask.type}`);

    const upstream = await Task.findLatestByProject(
      rejectedTask.projectId,
      ownerTarget.sourceType,
      'completed',
      'committed',
    );
    if (!upstream) {
      throw new ApiError(400, `Cannot rerun ${rejectedTask.type}: no committed ${ownerTarget.sourceType} source found`);
    }

    return this[ownerTarget.run]({
      projectId: rejectedTask.projectId,
      sourceTaskId: upstream.id,
      feedbackPrompt,
      user,
    });
  }

  async getProjectArtifacts(projectId, user) {
    if (user) {
      await MembershipService.requireProjectRole(user.id, projectId, ['owner', 'admin', 'editor', 'viewer']);
    }
    const artifacts = await AgentArtifact.findByProjectId(projectId);
    return {
      projectId,
      artifacts: await Promise.all(artifacts.map((artifact) => formatArtifactForClient(artifact))),
    };
  }

  // =========================================================================
  // Task status (SSE-compatible, reuses base WorkflowService pattern)
  // =========================================================================

  async getTaskStatus(taskId, user) {
    const task = await Task.findById(taskId);
    if (!task) return null;
    if (user) {
      await MembershipService.requireProjectRole(user.id, task.projectId, ['owner', 'admin', 'editor', 'viewer']);
    }

    const [artifacts, hitlDecision] = await Promise.all([
      AgentArtifact.findByTaskId(taskId),
      HitlDecision.findByTaskId(taskId),
    ]);

    task.artifacts = await Promise.all(artifacts.map((a) => formatArtifactForClient(a)));
    task.result = buildTaskResult(task, task.artifacts);
    task.hitlDecision = hitlDecision;
    task.gate = AGENT_GATES[task.type] || null;
    task.nextAgent = NEXT_AGENT[task.type];

    // Attach Quality Gate evaluation for QA tasks
    if (task.type === 'qa-agent') {
      const gateArtifact = artifacts.find((a) => a.artifactType === 'gate_evaluation');
      if (gateArtifact) {
        const resolved = await resolveArtifactContent(gateArtifact);
        task.gateEvaluation = resolved.contentJson
          ? { ...resolved.contentJson, gateType: 'qa_quality_gate' }
          : null;
      }
      // Surface gate metadata from result
      if (task.result) {
        task.gateScore = task.result.gateScore;
        task.gateRecommendation = task.result.gateRecommendation;
        task.gateComplexity = task.result.gateComplexity;
        task.minApproversRequired = task.result.minApproversRequired;
      }
    } else if (task.status === 'completed') {
      task.gateEvaluation = this._evaluateGatePolicy(task);
    }

    return task;
  }

  async getWorkflowStatus(projectId, user) {
    if (user) {
      await MembershipService.requireProjectRole(user.id, projectId, ['owner', 'admin', 'editor', 'viewer']);
    }

    const [intentTask, poTask, uxTask, devTask, qaTask] = await Promise.all([
      Task.findLatestByProject(projectId, 'intent-agent', null),
      Task.findLatestByProject(projectId, 'po-agent', null),
      Task.findLatestByProject(projectId, 'ux-agent', null),
      Task.findLatestByProject(projectId, 'dev-agent', null),
      Task.findLatestByProject(projectId, 'qa-agent', null),
    ]);

    const hitlDecisions = await HitlDecision.findByProjectId(projectId);
    // T5: pick the most-recent non-final decision per task deterministically
    // (createdAt, then id). This keeps a rerun from getting stuck on an older
    // decision and makes parallel reruns derive the same phase every time.
    const isNewer = (a, b) => {
      const ta = new Date(a.createdAt).getTime();
      const tb = new Date(b.createdAt).getTime();
      if (ta !== tb) return ta > tb;
      return String(a.id) > String(b.id);
    };
    const decisionsByTaskId = {};
    for (const d of hitlDecisions) {
      if (d.gate === FINAL_GATE) continue;
      const current = decisionsByTaskId[d.taskId];
      if (!current || isNewer(d, current)) decisionsByTaskId[d.taskId] = d;
    }
    const releaseDecision = [...hitlDecisions]
      .filter((decision) => decision.gate === FINAL_GATE)
      .sort((a, b) => (isNewer(a, b) ? 1 : -1))
      .pop() || null;
    const membership = user
      ? await MembershipService.requireProjectRole(user.id, projectId, ['owner', 'admin', 'editor', 'viewer'])
      : null;

    // T1/T6: surface which completed tasks have INVALID artifacts so the UI can
    // badge the worker card and explain why the phase did not advance.
    const phaseTasks = [intentTask, poTask, uxTask, devTask, qaTask].filter(Boolean);
    const invalidByTaskId = {};
    await Promise.all(phaseTasks.map(async (t) => {
      invalidByTaskId[t.id] = t.status === 'completed' ? await AgentArtifact.hasInvalid(t.id) : false;
    }));

    const mapPhase = (task) => {
      if (!task) return null;
      return {
        taskId: task.id,
        status: task.status,
        versionStatus: task.versionStatus,
        gate: AGENT_GATES[task.type],
        hitlDecision: decisionsByTaskId[task.id] || null,
        // T5: derived (no stored column) — true when the step finished but has
        // not been approved yet, so the frontend can open the review modal.
        awaitingReview: task.status === 'completed'
          && task.versionStatus !== 'committed'
          && decisionsByTaskId[task.id]?.decision !== 'APPROVE',
        // T1: the output failed role validation (blocking) — no handoff possible.
        invalid: !!invalidByTaskId[task.id],
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
      };
    };
    let featureRequest = null;
    if (poTask) {
      const requestArtifacts = await AgentArtifact.findByTaskIdAndType(poTask.id, 'feature_request');
      if (requestArtifacts.length > 0) {
        const resolved = await resolveArtifactContent(requestArtifacts[0]);
        featureRequest = resolved.contentJson || resolved.contentText || null;
      }
    }
    const releaseEvidence = await this._buildReleaseEvidenceSummary(projectId);

    return {
      projectId,
      featureRequest,
      phases: {
        intent: mapPhase(intentTask),
        po: mapPhase(poTask),
        ux: mapPhase(uxTask),
        dev: mapPhase(devTask),
        qa: mapPhase(qaTask),
      },
      releaseGate: {
        eligible: qaTask?.status === 'completed'
          && qaTask.versionStatus === 'committed'
          && qaTask.result?.gateRecommendation === 'PASS'
          && decisionsByTaskId[qaTask.id]?.decision === 'APPROVE',
        canDecide: ['owner', 'admin'].includes(membership?.role),
        reviewerRole: membership?.role || null,
        decision: releaseDecision,
        status: {
          APPROVE: 'released',
          REJECT: 'rejected',
        }[releaseDecision?.decision] || 'pending',
        evidence: releaseEvidence,
        approvalBlocked: releaseEvidence.open_blockers.some((blocker) => GATE_CONFIG.RELEASE_BLOCKING_SEVERITIES.includes(blocker.severity)),
      },
      currentPhase: this._deriveCurrentPhase(poTask, uxTask, devTask, qaTask, decisionsByTaskId, releaseDecision),
    };
  }

  // =========================================================================
  // Internals
  // =========================================================================

  _deriveCurrentPhase(poTask, uxTask, devTask, qaTask, decisionsByTaskId, releaseDecision = null) {
    if (!poTask) return 'BACKLOG';
    if (!poTask || poTask.status === 'pending' || poTask.status === 'processing') return 'PO_RUNNING';
    if (poTask.status === 'failed') return 'PO_FAILED';
    if (!decisionsByTaskId[poTask?.id] || decisionsByTaskId[poTask?.id]?.decision !== 'APPROVE') return 'PO_REVIEW';
    if (!uxTask || uxTask.status === 'pending' || uxTask.status === 'processing') return 'UX_RUNNING';
    if (uxTask.status === 'failed') return 'UX_FAILED';
    if (!decisionsByTaskId[uxTask?.id] || decisionsByTaskId[uxTask?.id]?.decision !== 'APPROVE') return 'UX_REVIEW';
    if (!devTask || devTask.status === 'pending' || devTask.status === 'processing') return 'DEV_RUNNING';
    if (devTask.status === 'failed') return 'DEV_FAILED';
    if (!decisionsByTaskId[devTask?.id] || decisionsByTaskId[devTask?.id]?.decision !== 'APPROVE') return 'DEV_REVIEW';
    if (!qaTask || qaTask.status === 'pending' || qaTask.status === 'processing') return 'QA_RUNNING';
    if (qaTask.status === 'failed') return 'QA_FAILED';
    if (!decisionsByTaskId[qaTask?.id]) return 'QA_REVIEW';
    if (releaseDecision?.decision === 'APPROVE') return 'RELEASED';
    if (releaseDecision?.decision === 'REJECT') return 'RELEASE_REJECTED';
    return 'FINAL_REVIEW';
  }

  async _requireApprovedTask(taskId, expectedType, user) {
    const task = await Task.findById(taskId);
    if (!task) throw new ApiError(404, 'Source task not found');
    if (user) await MembershipService.requireProjectRole(user.id, task.projectId, ['owner', 'admin', 'editor']);
    if (task.type !== expectedType) throw new ApiError(400, `Source task must be type: ${expectedType}`);
    if (task.status !== 'completed') throw new ApiError(400, 'Source task must be completed');
    if (task.versionStatus !== 'committed') {
      throw new ApiError(400, 'Source task must be approved (committed) before running next agent');
    }
    // T6: never hand off from an output that the role validator marked INVALID.
    if (await AgentArtifact.hasInvalid(task.id)) {
      throw new ApiError(409, `Source ${expectedType} output is INVALID — fix the blocking issues before running the downstream agent`);
    }
    if (NEXT_AGENT[task.type]) {
      const handoffs = await AgentArtifact.findByTaskIdAndType(task.id, 'a2a_handoff');
      const envelope = handoffs.find((artifact) => artifact.contentJson?.schema_version === 'a2a_handoff.v1')?.contentJson;
      if (!envelope) throw new ApiError(409, 'Approved source task is missing its A2A handoff envelope');
      if (envelope.output_artifact?.hash !== task.outputContentHash) {
        throw new ApiError(409, 'A2A handoff integrity check failed: approved output hash does not match');
      }
    }
    return task;
  }

  async _buildContextFromArtifacts(artifacts, extras = {}) {
    const context = { ...extras };
    for (const art of artifacts) {
      if (!context[art.artifactType]) context[art.artifactType] = [];
      const resolved = await resolveArtifactContent(art);
      const content = resolved.contentText ?? resolved.contentJson ?? '';
      context[art.artifactType].push({
        key: art.artifactKey,
        title: art.title,
        content,
      });
    }
    return context;
  }

  async _getFeatureRequestFromIntentTask(task) {
    const featureArtifacts = await AgentArtifact.findByTaskIdAndType(task.id, 'feature_request');
    if (featureArtifacts.length > 0) {
      const resolved = await resolveArtifactContent(featureArtifacts[0]);
      const featureRequest = resolved.contentJson || resolved.contentText;
      if (featureRequest && typeof featureRequest === 'object' && featureRequest.title) {
        return featureRequest;
      }
      if (typeof featureRequest === 'string' && featureRequest.trim()) {
        return { title: 'Rework feature request', description: featureRequest };
      }
    }

    const assumptions = await AgentArtifact.findByTaskIdAndType(task.id, 'intent_assumptions');
    if (assumptions.length > 0) {
      const resolved = await resolveArtifactContent(assumptions[0]);
      if (resolved.contentText && resolved.contentText.trim()) {
        return {
          title: 'Rework feature request',
          description: resolved.contentText,
        };
      }
    }

    throw new ApiError(400, 'Cannot rework intent task: original feature request artifact is missing');
  }

  async _getFeatureRequestFromTask(task) {
    const featureArtifacts = await AgentArtifact.findByTaskIdAndType(task.id, 'feature_request');
    if (featureArtifacts.length > 0) {
      const resolved = await resolveArtifactContent(featureArtifacts[0]);
      if (resolved.contentJson?.title) return resolved.contentJson;
    }
    throw new ApiError(400, 'Cannot rework PO task: original feature request artifact is missing');
  }

  async _recordApprovedHandoff(task, approval) {
    const nextAgent = NEXT_AGENT[task.type];
    if (!nextAgent) return;

    const artifacts = await AgentArtifact.findByTaskId(task.id);
    const outputArtifacts = artifacts.filter((artifact) => artifact.artifactType !== 'a2a_handoff');
    const envelope = {
      handoff_id: uuidv4(),
      schema_version: 'a2a_handoff.v1',
      project_id: task.projectId,
      from_agent: task.type,
      to_agent: nextAgent,
      source_task_id: task.id,
      target_task_id: null,
      attempt: (task.retryCount || 0) + 1,
      input_artifacts: outputArtifacts.map((artifact) => ({ key: artifact.artifactKey, hash: artifact.contentHash })),
      output_artifact: { task_id: task.id, hash: task.outputContentHash },
      approval: {
        approval_id: approval.id,
        type: approval.action || approval.decision,
        confidence: task.agentOutput?.confidence_score ?? null,
        validation_result_id: `validation:${task.id}`,
      },
      contract: {
        required_downstream_inputs: {
          'ux-agent': ['prd', 'acceptance_criteria', 'risk_classification'],
          'dev-agent': ['ux_spec', 'wireframe_spec', 'risk_classification'],
          'qa-agent': ['patch_diff', 'sandbox_result', 'self_test_report', 'security_gate'],
        }[nextAgent] || [],
      },
      integrity: {
        artifact_hash: contentHash(outputArtifacts.map((artifact) => artifact.contentHash)),
        created_at: new Date().toISOString(),
      },
      created_at: new Date().toISOString(),
    };

    await AgentArtifact.bulkUpsert([{
      id: uuidv4(),
      taskId: task.id,
      projectId: task.projectId,
      agentType: task.type,
      artifactType: 'a2a_handoff',
      artifactKey: `a2a_handoff:${task.id}:${nextAgent}`,
      title: `${envelope.from_agent} to ${envelope.to_agent} Handoff`,
      contentJson: envelope,
      ordinal: 999,
      contentHash: contentHash(envelope),
    }]);
  }

  async _writeArtifactToFile(projectId, taskId, filename, content) {
    const dir = path.join(WORKSPACE_DIR, projectId, taskId);
    await fs.mkdir(dir, { recursive: true });
    const filepath = path.join(dir, filename);
    const data = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
    await fs.writeFile(filepath, data, 'utf8');
    return `FILE:${filepath}`;
  }

  /**
   * I4: the mock implementation of the agent contract `run({task, context}) ->
   * output`. Pure builder — reads mock-data, applies the role/scenario shaping,
   * and returns the agent output WITHOUT touching the DB. Both `_runAgent`
   * (mock branch) and the agent-contract conformance suite call this, so the
   * mock is held to the same output contract a real agent will be.
   */
  async _buildMockOutput(task, context) {
    const mockDir = path.join(__dirname, '../../../mock-data', task.type);
    const files = await fs.readdir(mockDir).catch(() => []);

    const completedData = {
      summary: "Mock execution completed via Hybrid Mock Mode.",
      token_usage: { input: 1250, output: 450 },
      observability: { trace_id: "mock-trace-123" }
    };

    for (const file of files) {
      if (!file.endsWith('.md') && !file.endsWith('.json')) continue;
      const key = file.replace(/\.(md|json)$/, '');
      const ext = path.extname(file);
      const content = await fs.readFile(path.join(mockDir, file), 'utf8');
      if (ext === '.json') {
        // T4: a malformed mock file must surface a clear MOCK_PARSE_ERROR,
        // not crash the loop or produce a half-built output.
        try {
          completedData[key] = JSON.parse(content);
        } catch (parseErr) {
          throw new ApiError(
            500,
            `Malformed mock JSON in ${task.type}/${file}: ${parseErr.message}`,
            ERROR_CODES.MOCK_PARSE_ERROR,
            `${task.type.replace('-agent', '').toUpperCase()}_RUNNING`,
          );
        }
      } else {
        completedData[key] = content;
      }
    }
    if (['intent-agent', 'po-agent'].includes(task.type) && context.featureRequest) {
      completedData.feature_request = context.featureRequest;
    }
    const feedbackPrompt = context.feedbackPrompt?.trim();
    const inheritedRisk = firstContextValue(context, 'risk_classification');
    const riskClassification = task.type === 'po-agent'
      ? classifyFeatureRequest(context.featureRequest)
      : (inheritedRisk || { level: 'LOW', tags: [], required_gates: ['schema', 'validation', 'evidence', 'qa'], classifier: 'mock-rule-based.v1' });
    if (task.type !== 'intent-agent') {
      completedData.risk_classification = riskClassification;
      completedData.workflow_policy = {
        auto_approve_threshold: AUTO_APPROVE_CONFIDENCE,
        required_gates: riskClassification.required_gates,
        max_retry_per_step: MAX_RETRY_PER_STEP,
      };
    }
    if (task.type === 'dev-agent') {
      completedData.patch_diff = completedData.mock_code_diff;
      completedData.self_test_report = {
        executed: true,
        passed: completedData.sandbox_result?.tests_passed || 0,
        failed: completedData.sandbox_result?.tests_failed || 0,
        evidence: 'Mock sandbox run: npm test and npm run lint',
      };
      const securityRequired = riskClassification.required_gates.includes('security');
      const securityPassed = !securityRequired || !!feedbackPrompt;
      completedData.security_notes = securityPassed ? {
        oauth_state_csrf: 'PASS',
        pkce: 'PASS',
        client_secret_frontend: 'PASS - no client secret is exposed',
        redirect_uri_allow_list: 'PASS',
        session_cookie: 'PASS - HttpOnly, Secure, SameSite=Lax',
        account_linking: 'PASS',
        logout_and_error_paths: 'PASS',
        audit_logging: 'PASS',
      } : null;
      completedData.security_gate = securityPassed ? {
        recommendation: 'PASS',
        checklist_version: 'oauth-security.mock.v1',
        issues: [],
      } : {
        recommendation: 'HOLD',
        checklist_version: 'oauth-security.mock.v1',
        issues: [{
          code: 'oauth_state_csrf_missing',
          severity: 'HIGH',
          detail: 'Google OAuth callback evidence does not show state validation against the login session.',
          expected_fix: 'Add state generation and callback validation, rerun sandbox tests, and attach the updated security notes.',
        }],
      };
    }
    if (task.type === 'qa-agent') {
      completedData.ac_coverage_matrix = (completedData.ac_coverage_matrix || []).map((row) => ({
        requirement_id: row.requirement_id || row.ac_id,
        requirement: row.requirement || row.ac,
        ux_covered: true,
        dev_implemented: true,
        test_exists: (row.test_case_ids || []).length > 0,
        test_result: row.covered ? 'PASS' : 'FAIL',
        evidence_ref: `DEV:${task.sourceRunId || 'approved'}:${firstContextValue(context, 'patch_diff') ? 'patch_diff' : 'mock_code_diff'}`,
        ...row,
      }));
      completedData.coverage_summary = {
        covered: completedData.ac_coverage_matrix.filter((row) => row.covered).length,
        total: completedData.ac_coverage_matrix.length,
        percentage: completedData.ac_coverage_matrix.length
          ? Math.round((completedData.ac_coverage_matrix.filter((row) => row.covered).length / completedData.ac_coverage_matrix.length) * 100)
          : 0,
      };
      completedData.dev_evidence_ref = {
        task_id: task.sourceRunId,
        patch_diff_present: !!firstContextValue(context, 'patch_diff'),
        sandbox_result_present: !!firstContextValue(context, 'sandbox_result'),
        security_gate: firstContextValue(context, 'security_gate'),
      };
    }
    // T3: scenario-driven mock shaping (confidence + bad-case overrides),
    // selected via the existing env mechanism (MOCK_SCENARIO / MOCK_LOW_CONFIDENCE_STAGE).
    this._applyMockScenario(task, completedData, feedbackPrompt);
    return completedData;
  }

  /**
   * Core runner — calls AgentService and parses SSE stream, saves artifacts.
   * @private
   */
  async _runAgent(task, context, userId = null) {
    await Task.update(task.id, { status: 'processing' });

    // Hybrid Mock Mode Bypass
    if (process.env.USE_MOCK_AGENTS === 'true') {
      try {
        console.log(`[SDLC] Running in MOCK mode for agent ${task.type}`);
        const completedData = await this._buildMockOutput(task, context);

        // Simulate processing delay
        await new Promise(r => setTimeout(r, 2000));

        await this._saveAgentData(task, completedData, userId);
        return; // Bypass the real agent completely
      } catch (err) {
        console.error(`[SDLC._runAgent] Mock mode failed for task ${task.id}:`, err);
        // T4: a malformed mock file is a demo-config error — fail the task
        // clearly (with the MOCK_PARSE_ERROR code) instead of silently falling
        // back to the real agent, which needs API keys and confuses the demo.
        if (err.code === ERROR_CODES.MOCK_PARSE_ERROR) {
          await this._markTaskFailed(task, err);
          return;
        }
        // Otherwise fall back to the real agent.
      }
    }

    try {
      const response = await AgentService.runAgent({
        sessionId: task.id,
        nodeTarget: NODE_TARGET[task.type],
        userId,
        projectId: task.projectId,
        context,
      });

      let buffer = '';
      let completedData = null;
      let agentError = null;

      response.data.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        let currentEvent = null;

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith('data: ') && currentEvent) {
            try {
              const data = JSON.parse(line.slice(6));
              if (currentEvent === 'error') {
                agentError = data.message || 'Agent error';
              } else if (currentEvent === 'completed') {
                completedData = data;
              }
            } catch (_) {}
          }
        }
      });

      response.data.on('end', async () => {
        try {
          if (agentError) throw new Error(agentError);
          if (!completedData) throw new Error('Agent returned no data');
          if (['intent-agent', 'po-agent'].includes(task.type) && context.featureRequest) {
            completedData.feature_request = context.featureRequest;
          }

          // I4: warn (non-fatal) if a real agent output diverges from the
          // contract the mock satisfies. Surfaces drift the moment a real agent
          // is wired, without blocking the run.
          const conformance = assertOutputConforms(task.type, completedData);
          if (!conformance.ok) {
            logger.warn('agent output missing contract keys', {
              taskId: task.id,
              phase: task.type,
              missing: conformance.missing,
            });
          }

          await this._saveAgentData(task, completedData, userId);
        } catch (err) {
          console.error(`[SDLC._runAgent] Failed for task ${task.id}:`, err);
          await this._markTaskFailed(task, err);
        }
      });

      response.data.on('error', async (err) => {
        await this._markTaskFailed(task, new Error(`Stream error: ${err.message}`));
      });
    } catch (err) {
      await this._markTaskFailed(task, err);
    }
  }

  async _markTaskFailed(task, error) {
    // T4: keep the structured error code visible in the persisted error so the
    // SSE error event / UI can render a precise error state.
    const errMsg = error.code ? `[${error.code}] ${error.message}` : error.message;
    logger.error('task failed', { taskId: task.id, phase: task.type, code: error.code || null, error: error.message });
    await Task.update(task.id, { status: 'failed', error: errMsg });
    await FeatureBacklog.updateStatusByTaskId(task.id, 'TODO');
  }

  /**
   * T3: shape a mock agent output for a chosen demo scenario. Selected via the
   * existing env mechanism (`MOCK_SCENARIO`, defaulting to `happy_path`).
   * All overrides are deterministic so the
   * preflight smoke test (T9) can assert the expected branch every run.
   *
   * Scenarios (each is a full PO→UX→DEV→QA run, the override fires on the
   * relevant stage only):
   *   - happy_path         : every stage high-confidence + valid → reaches Final Release.
   *   - low_confidence_hold : target stage returns 0.58 → HOLD (human review).
   *   - missing_evidence    : DEV drops sandbox test evidence → BLOCKER → INVALID, no handoff.
   *   - qa_blocker          : QA reports a blocker + a failed test → QA gate fails, release LOCKED.
   *   - release_reject      : outputs all pass; the smoke test rejects at the Final gate.
   *   - escalation          : target stage stays at 0.58 even after feedback → repeated reject → escalation.
   */
  _applyMockScenario(task, completedData, feedbackPrompt) {
    const lowStage = MOCK_REVIEW_STAGES.includes(process.env.MOCK_LOW_CONFIDENCE_STAGE)
      ? process.env.MOCK_LOW_CONFIDENCE_STAGE
      : 'dev-agent';
    const scenario = resolveMockScenario();
    applyScenarioNarrative(task, completedData, scenario, feedbackPrompt);

    const markRework = () => {
      completedData.summary = `Mock ${task.type.replace('-agent', '').toUpperCase()} rework completed after applying reviewer feedback.`;
      completedData.rework_response = {
        worker: task.type,
        feedback_received: feedbackPrompt,
        changes_applied: [
          `Revisited the ${task.type.replace('-agent', '').toUpperCase()} output using the reviewer direction.`,
          'Regenerated the structured output and reran the applicable validation checks.',
        ],
        confidence_before: 0.58,
        confidence_after: 0.92,
      };
    };

    // Base confidence for the three review stages.
    if (MOCK_REVIEW_STAGES.includes(task.type)) {
      completedData.confidence_score = feedbackPrompt ? 0.92 : 0.95;
      if (feedbackPrompt) markRework();
    }

    // DEV security passes in scenario mode so each branch isolates its own
    // variable (confidence / evidence / QA / release).
    if (task.type === 'dev-agent') {
      completedData.security_notes = completedData.security_notes || {
        oauth_state_csrf: 'PASS', pkce: 'PASS', client_secret_frontend: 'PASS',
        redirect_uri_allow_list: 'PASS', session_cookie: 'PASS', account_linking: 'PASS',
        logout_and_error_paths: 'PASS', audit_logging: 'PASS',
      };
      completedData.security_gate = { recommendation: 'PASS', checklist_version: 'oauth-security.mock.v1', issues: [] };
    }

    switch (scenario) {
      case 'happy_path':
        // every stage already high-confidence + valid; nothing to override.
        break;

      case 'low_confidence_hold':
        if (task.type === lowStage && !feedbackPrompt) completedData.confidence_score = 0.58;
        break;

      case 'missing_evidence':
        // DEV self-test / sandbox evidence is missing → _validateGateOutput BLOCKER.
        if (task.type === 'dev-agent' && !feedbackPrompt) {
          completedData.sandbox_result = { ...(completedData.sandbox_result || {}), tests_ran: false };
          completedData.self_test_report = null;
        } else if (task.type === 'dev-agent') {
          completedData.sandbox_result = {
            ...(completedData.sandbox_result || {}),
            build_ok: true,
            tests_ran: true,
            tests_passed: Math.max(Number(completedData.sandbox_result?.tests_passed || 0), 12),
            tests_failed: 0,
          };
          completedData.self_test_report = completedData.self_test_report || {
            executed: true,
            passed: completedData.sandbox_result.tests_passed,
            failed: 0,
            evidence: 'Reviewer-requested rerun: sandbox and self-test evidence attached.',
          };
          completedData.sandbox_report = `${completedData.sandbox_report || ''}\n\nReviewer feedback applied: sandbox execution and self-test evidence are now attached.`;
        }
        break;

      case 'qa_blocker':
        // QA finds a blocking defect and a failed test → QA gate fails, release locked.
        if (task.type === 'qa-agent' && !feedbackPrompt) {
          completedData.blocker_count = 2;
          completedData.pass_count = Math.max(Number(completedData.pass_count || 0) - 1, 0);
          completedData.fail_count = 1;
          completedData.test_run_report = {
            ...(completedData.test_run_report || {}),
            executed: true,
            passed: Math.max(Number(completedData.test_run_report?.passed || 0) - 1, 0),
            failed: 1,
            logs: 'Test runner: OAuth happy path passed, callback hardening failed. BLOCKER: CSRF state mismatch accepted in one regression case.',
          };
          completedData.qa_report = `${completedData.qa_report || ''}\n\nBLOCKER: OAuth callback accepted a mismatched state token in TC-015. Release is locked until DEV evidence is regenerated.`;
          completedData.release_decision = 'LOCKED';
          completedData.release_recommendation = 'DO_NOT_RELEASE';
          completedData.release_reason = 'QA blocker: failed CSRF callback regression keeps the release gate locked.';
        } else if (task.type === 'qa-agent') {
          completedData.blocker_count = 0;
          completedData.fail_count = 0;
          completedData.pass_count = Number(completedData.test_run_report?.total || completedData.pass_count || 18);
          completedData.test_run_report = {
            ...(completedData.test_run_report || {}),
            executed: true,
            passed: Number(completedData.test_run_report?.total || completedData.pass_count || 18),
            failed: 0,
            logs: 'Reviewer-requested QA rerun: OAuth callback regression passed, blockers resolved.',
          };
          completedData.qa_report = `${completedData.qa_report || ''}\n\nREWORK VERIFIED: OAuth callback regression now rejects mismatched state tokens. No blockers remain.`;
          completedData.release_decision = 'READY_FOR_REVIEW';
          completedData.release_recommendation = 'RELEASE_WITH_REVIEW';
          completedData.release_reason = 'QA rerun passed after blocker remediation; release can proceed to final review.';
        }
        break;

      case 'release_reject':
        // All agent outputs pass; the reject happens at the human Final gate (driven by the smoke test).
        if (task.type === 'qa-agent') {
          completedData.release_decision = 'READY_FOR_REVIEW';
          completedData.release_recommendation = 'RELEASE_WITH_REVIEW';
          completedData.release_reason = 'All automated gates pass; this branch expects the final human gate to reject the release packet.';
        }
        break;

      case 'escalation':
        // Target stage never recovers, even after reviewer feedback → repeated reject → escalation.
        if (task.type === lowStage) {
          completedData.confidence_score = 0.58;
          delete completedData.rework_response;
        }
        break;

      default:
        break;
    }
  }

  async _saveAgentData(task, completedData, userId) {
    // Save each artifact returned by the agent
    const artifactRows = [];
    const artifactTypes = ['feature_request', 'scenario_brief', 'intent_assumptions', 'clarifying_questions',
      'prd', 'user_stories', 'acceptance_criteria', 'scope', 'out_of_scope', 'mcp_activity',
      'ux_spec', 'user_flow', 'wireframe_spec', 'component_inventory', 'screens',
      'architecture_ledger_update', 'implementation_plan', 'mock_code_diff', 'changed_files',
      'patch_diff', 'patch_format', 'linked_ac_ids', 'sandbox_result', 'self_test_report',
      'risk_assessment', 'risk_level', 'sandbox_report', 'patch_branch', 'patch_commit',
      'risk_classification', 'workflow_policy', 'security_notes', 'security_gate',
      'test_cases', 'qa_report', 'ac_coverage_matrix', 'pass_count', 'fail_count',
      'blocker_count', 'release_recommendation',
      'test_run_report', 'regression_risks', 'security_findings', 'release_decision', 'release_reason',
      'coverage_summary', 'dev_evidence_ref',
      'confidence_score',
      'rework_response',
      // Quality Gate result (populated below for qa-agent tasks)
      'gate_evaluation'];

    // -------------------------------------------------------------------------
    // Quality Gate evaluation — runs after QA Agent completes
    // -------------------------------------------------------------------------
    if (task.type === 'qa-agent' && !completedData.gate_evaluation) {
      try {
        // Fetch DEV artifacts for code diff context
        const devTask = await Task.findLatestByProject(task.projectId, 'dev-agent', 'completed', 'committed').catch(() => null);
        let mockCodeDiff = '';
        let implementationPlan = '';

        if (devTask) {
          const devArtifacts = await AgentArtifact.findByTaskId(devTask.id);
          for (const art of devArtifacts) {
            if (art.artifactType === 'mock_code_diff') {
              const resolved = await resolveArtifactContent(art);
              mockCodeDiff = resolved.contentText || '';
            }
            if (art.artifactType === 'implementation_plan') {
              const resolved = await resolveArtifactContent(art);
              implementationPlan = resolved.contentText || '';
            }
          }
        }

        // Fetch PO artifacts for feature title & AC
        const poTask = await Task.findLatestByProject(task.projectId, 'po-agent', 'completed', 'committed').catch(() => null);
        let featureTitle = '';
        let featureDescription = '';
        let acceptanceCriteria = completedData.acceptance_criteria || [];

        if (poTask) {
          const poArtifacts = await AgentArtifact.findByTaskId(poTask.id);
          for (const art of poArtifacts) {
            if (art.artifactType === 'prd') {
              const resolved = await resolveArtifactContent(art);
              featureDescription = (resolved.contentText || '').slice(0, 500);
            }
            if (art.artifactType === 'acceptance_criteria') {
              const resolved = await resolveArtifactContent(art);
              if (Array.isArray(resolved.contentJson)) {
                acceptanceCriteria = resolved.contentJson;
              }
            }
          }
        }

        const gateResult = await QualityGateService.evaluate({
          featureTitle,
          featureDescription,
          acceptanceCriteria: Array.isArray(acceptanceCriteria) ? acceptanceCriteria : [],
          testCases: completedData.test_cases || [],
          acCoverageMatrix: completedData.ac_coverage_matrix || [],
          blockerCount: completedData.blocker_count || 0,
          riskLevel: completedData.risk_level || 'LOW',
          mockCodeDiff,
          implementationPlan,
        });

        completedData.gate_evaluation = gateResult;

        console.log(
          `[QualityGate] Task ${task.id}: ${gateResult.complexity.toUpperCase()} | ` +
          `Score: ${gateResult.score}/100 | Recommendation: ${gateResult.recommendation} | ` +
          `Approvers required: ${gateResult.minApproversRequired}`
        );
      } catch (gateErr) {
        console.error(`[QualityGate] Evaluation failed for task ${task.id}:`, gateErr.message);
        // Non-fatal — continue saving without gate result
      }
    }

    for (const artType of artifactTypes) {
      if (completedData[artType] !== undefined && completedData[artType] !== null) {
        const content = completedData[artType];
        let fileRef = null;

        if (typeof content === 'string') {
          fileRef = await this._writeArtifactToFile(task.projectId, task.id, `${artType}.md`, content);
        } else {
          fileRef = await this._writeArtifactToFile(task.projectId, task.id, `${artType}.json`, content);
        }

        artifactRows.push({
          id: uuidv4(),
          taskId: task.id,
          projectId: task.projectId,
          agentType: task.type,
          artifactType: artType,
          artifactKey: `${artType}:${task.id}`,
          title: artType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
          contentText: typeof content === 'string' ? fileRef : null,
          contentJson: typeof content === 'object' ? { file_path: fileRef.slice(5) } : null,
          ordinal: artifactTypes.indexOf(artType),
          contentHash: contentHash(content),
        });
      }
    }

    if (artifactRows.length > 0) {
      await AgentArtifact.bulkUpsert(artifactRows);
    }

    // Build enriched result — include gate info for QA tasks
    const taskResult = {
      artifactCount: artifactRows.length,
      agentType: task.type,
      ...(completedData.summary ? { summary: completedData.summary } : {}),
    };
    if (task.type === 'qa-agent' && completedData.gate_evaluation) {
      taskResult.gateScore = completedData.gate_evaluation.score;
      taskResult.gateRecommendation = completedData.gate_evaluation.recommendation;
      taskResult.gateComplexity = completedData.gate_evaluation.complexity;
      taskResult.minApproversRequired = completedData.gate_evaluation.minApproversRequired;
    }

    const outputHash = contentHash(artifactRows.map((a) => a.contentHash));
    await Task.update(task.id, {
      status: 'completed',
      output_content_hash: outputHash,
      result: taskResult,
      observability: completedData.observability || {},
      // Structured HITL (plan 2.4): keep the raw agent output distinct from the
      // human-approved output. approvedOutput is only set on approve/edit.
      agentOutput: completedData,
      gateMode: DEFAULT_GATE_MODE[task.type] || GATE_MODE.STRICT_MANUAL,
    });
    await FeatureBacklog.updateStatusByTaskId(task.id, 'REVIEW');

    // T1: persist role-validation status onto this run's artifacts. A BLOCKER
    // means the output is structurally incomplete → mark INVALID, emit no
    // handoff, and do not advance the phase (derive stays at *_REVIEW).
    const validation = this._validateGateOutput(task, completedData);
    const blockers = validation.violations.filter((v) => v.severity === 'BLOCKER');
    await AgentArtifact.setStatusByTaskId(task.id, blockers.length ? 'INVALID' : 'VALID')
      .catch((e) => console.error('[SDLC] setStatusByTaskId failed:', e.message));

    if (blockers.length) {
      logger.warn('agent output INVALID — no handoff, phase will not advance', {
        taskId: task.id,
        phase: task.type,
        blockers: blockers.map((b) => b.rule),
      });
    } else {
      await this._autoApproveSafeOutput(task.id, userId);
    }

    if (userId) {
      QuotaService.recordUsage({
        userId,
        projectId: task.projectId,
        taskId: task.id,
        agentType: task.type,
        tokenInput: completedData.token_usage?.input || 0,
        tokenOutput: completedData.token_usage?.output || 0,
      }).catch(() => {});
    }
  }

  async _autoApproveSafeOutput(taskId, userId = null) {
    const task = await Task.findById(taskId);
    if (!task || task.gateMode === GATE_MODE.STRICT_MANUAL) return false;

    const output = task.agentOutput || {};
    const evaluation = this._evaluateGatePolicy(task);
    if (evaluation.recommendation !== 'PASS') return false;
    const { confidence, validation } = evaluation;

    await Task.update(task.id, { approvedOutput: output, version_status: 'committed' });
    await Task.commitTask(task.id);
    const approval = await HitlDecision.create({
      id: uuidv4(),
      taskId: task.id,
      projectId: task.projectId,
      workflowRunId: task.projectId,
      gate: AGENT_GATES[task.type],
      decision: 'APPROVE',
      action: 'auto_approve',
      decisionId: uuidv4(),
      baseOutputVersion: task.outputVersion || 0,
      comment: `Auto-approved: confidence ${confidence.toFixed(2)}, validation passed`,
      payload: { confidence, threshold: AUTO_APPROVE_CONFIDENCE, validation },
    });
    const refreshed = await Task.findById(task.id);
    await this._recordApprovedHandoff(refreshed, approval);
    await this._startNextAgentIfAvailable(refreshed, userId);
    return true;
  }

  async _startNextAgentIfAvailable(task, userId = null) {
    const nextAgent = NEXT_AGENT[task.type];
    if (!nextAgent) return null;

    const tasks = await Task.findByProjectId(task.projectId);
    const existing = tasks.find((candidate) => candidate.type === nextAgent && candidate.sourceRunId === task.id);
    if (existing) return existing;

    const args = {
      projectId: task.projectId,
      sourceTaskId: task.id,
      user: userId ? { id: userId } : null,
    };
    if (nextAgent === 'po-agent') return this.runPOAgent(args);
    if (nextAgent === 'ux-agent') return this.runUXAgent(args);
    if (nextAgent === 'dev-agent') return this.runDEVAgent(args);
    if (nextAgent === 'qa-agent') return this.runQAAgent(args);
    return null;
  }
}

const sdlcWorkflowService = new SdlcWorkflowService();
// I5: expose the versioned output contracts for the drift test (read-only use).
sdlcWorkflowService.OUTPUT_CONTRACTS = OUTPUT_CONTRACTS;
sdlcWorkflowService.OUTPUT_CONTRACT_VERSION = OUTPUT_CONTRACT_VERSION;
module.exports = sdlcWorkflowService;
