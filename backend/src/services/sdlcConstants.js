// ── Shared constants for the SDLC workflow modules ──────────────────────────
const path = require('path');
const { hasContent } = require('./agentContract');

const WORKSPACE_DIR = path.join(__dirname, '../../../workspace/projects');

// ── Agent Gates ──────────────────────────────────────────────────────────────
const AGENT_GATES = {
  'architecture-agent': 'ARCHITECTURE_GATE',
  'intent-agent': 'REQUIREMENT_GATE',
  'po-agent': 'REQUIREMENT_GATE',
  'ux-agent': 'UX_GATE',
  'dev-agent': 'DEV_GATE',
  'qa-agent': 'QA_GATE',
};

const OUTPUT_REVIEW_GATE_TYPE = {
  'architecture-agent': 'ARCH_OUTPUT_REVIEW',
  'po-agent': 'PO_OUTPUT_REVIEW',
  'ux-agent': 'UX_OUTPUT_REVIEW',
  'dev-agent': 'DEV_OUTPUT_REVIEW',
  'qa-agent': 'QA_OUTPUT_REVIEW',
};

const NEXT_AGENT = {
  'architecture-agent': 'po-agent',
  'intent-agent': 'po-agent',
  'po-agent': 'ux-agent',
  'ux-agent': 'dev-agent',
  'dev-agent': 'qa-agent',
  'qa-agent': null,
};

const NODE_TARGET = {
  'intent-agent': 'intent_node',
  'po-agent': 'po_agent',
  'ux-agent': 'ux_agent',
  'dev-agent': 'dev_agent',
  'qa-agent': 'qa_agent',
};

const REWORK_TARGETS = {
  po_agent: { sourceType: 'intent-agent', run: 'runPOAgent' },
  ux_agent: { sourceType: 'po-agent', run: 'runUXAgent' },
  dev_agent: { sourceType: 'ux-agent', run: 'runDEVAgent' },
  qa_agent: { sourceType: 'dev-agent', run: 'runQAAgent' },
};

// ── Gate Modes ───────────────────────────────────────────────────────────────
const GATE_MODE = {
  STRICT_MANUAL: 'strict_manual',
  CONFIDENCE: 'confidence_based',
  AUTO_SAFE: 'auto_approve_safe',
};

const DEFAULT_GATE_MODE = {
  'intent-agent': GATE_MODE.STRICT_MANUAL,
  'po-agent': GATE_MODE.STRICT_MANUAL,
  'ux-agent': GATE_MODE.STRICT_MANUAL,
  'dev-agent': GATE_MODE.STRICT_MANUAL,
  'qa-agent': GATE_MODE.STRICT_MANUAL,
};

const REVIEW_HOLDS = new Map();

// ── Gate Configuration ───────────────────────────────────────────────────────
const GATE_CONFIG = {
  AUTO_APPROVE_CONFIDENCE: 0.8,
  BLOCKING_SEVERITY: 'BLOCKER',
  RELEASE_BLOCKING_SEVERITIES: ['BLOCKER', 'CRITICAL', 'HIGH'],
};

const AUTO_APPROVE_CONFIDENCE = GATE_CONFIG.AUTO_APPROVE_CONFIDENCE;

// ── Output Contract ──────────────────────────────────────────────────────────
const OUTPUT_CONTRACT_VERSION = 'gate-output.v4';

const _acList = (o) => (Array.isArray(o.acceptance_criteria) ? o.acceptance_criteria : []);
const _matrix = (o) => (Array.isArray(o.ac_coverage_matrix) ? o.ac_coverage_matrix : []);

// AIFA v2.1 §3: the architecture-agent output is validated against the
// versioned output contract in gateManager.validateGateOutput. The
// contract iterates rules and calls rule.check(o, task) — so every entry
// here must expose a `check` function. Earlier revisions put
// ARCHITECTURE_RULES in the artifact-manifest shape ({key, required})
// which crashed the validator with "rule.check is not a function". Each
// rule below asserts the corresponding architecture artifact key is
// present and non-empty.
const ARCHITECTURE_RULES = [
  {
    rule: 'repository_summary_present',
    severity: 'BLOCKER',
    detail: 'repository_summary is missing or empty',
    check: (o) => hasContent(o.repository_summary),
  },
  {
    rule: 'technology_stack_present',
    severity: 'BLOCKER',
    detail: 'technology_stack is missing or empty',
    check: (o) => hasContent(o.technology_stack),
  },
  {
    rule: 'technical_decisions_present',
    severity: 'BLOCKER',
    detail: 'technical_decisions is missing or empty',
    check: (o) => {
      const d = o.technical_decisions;
      if (Array.isArray(d)) return d.length > 0 && d.some((x) => hasContent(x));
      return hasContent(d);
    },
  },
  {
    rule: 'constraints_present',
    severity: 'BLOCKER',
    detail: 'constraints is missing or empty',
    check: (o) => {
      const c = o.constraints;
      if (Array.isArray(c)) return c.length > 0 && c.some((x) => hasContent(x));
      return hasContent(c);
    },
  },
  {
    rule: 'repository_routing_present',
    severity: 'BLOCKER',
    detail: 'repository_routing is missing or empty',
    check: (o) => hasContent(o.repository_routing),
  },
  {
    rule: 'repository_routing_has_target',
    severity: 'BLOCKER',
    detail: 'repository_routing.target_module is missing',
    check: (o) => hasContent(o.repository_routing?.target_module),
  },
  {
    rule: 'repository_routing_has_framework',
    severity: 'BLOCKER',
    detail: 'repository_routing.framework is missing',
    check: (o) => hasContent(o.repository_routing?.framework),
  },
  {
    rule: 'repository_routing_has_language',
    severity: 'BLOCKER',
    detail: 'repository_routing.language is missing',
    check: (o) => hasContent(o.repository_routing?.language),
  },
  {
    rule: 'architecture_brief_present',
    severity: 'BLOCKER',
    detail: 'architecture_brief is missing or empty (expected: Markdown string at top-level of agent output)',
    check: (o) => hasContent(o.architecture_brief),
    inspect: (o) => {
      const v = o?.architecture_brief;
      if (v === undefined) return 'received: undefined (field not produced by agent)';
      if (v === null) return 'received: null';
      if (typeof v === 'string') return `received: empty string (length=${v.length})`;
      return `received: ${typeof v} (non-string value)`;
    },
  },
];

const PO_RULES = [
  {
    rule: 'prd_present', severity: 'BLOCKER', detail: 'PRD is empty',
    check: (o) => typeof o.prd === 'string' && o.prd.trim().length > 0
  },
  {
    rule: 'user_stories_present', severity: 'BLOCKER', detail: 'No user stories',
    check: (o) => Array.isArray(o.user_stories) && o.user_stories.length > 0
  },
  {
    rule: 'ac_present', severity: 'BLOCKER', detail: 'No acceptance criteria',
    check: (o) => _acList(o).length > 0
  },
  {
    rule: 'ac_testable', severity: 'BLOCKER',
    detail: 'Acceptance criteria are present but none are concrete/testable enough',
    check: (o) => _acList(o).length === 0 || _acList(o).some((a) => String(a).trim().length >= 15)
  },
  {
    rule: 'ac_measurable', severity: 'WARNING',
    detail: (o) => `${_acList(o).filter((a) => String(a).trim().length < 12).length} acceptance criteria look too vague to test`,
    check: (o) => _acList(o).every((a) => String(a).trim().length >= 12)
  },
  {
    rule: 'scope_present', severity: 'BLOCKER', detail: 'Scope is empty',
    check: (o) => hasContent(o.scope)
  },
  {
    rule: 'out_of_scope_present', severity: 'BLOCKER', detail: 'Out-of-scope boundaries are empty',
    check: (o) => hasContent(o.out_of_scope)
  },
  {
    rule: 'risk_classification_present', severity: 'BLOCKER', detail: 'Risk classification is incomplete',
    check: (o) => hasContent(o.risk_classification?.level) && Array.isArray(o.risk_classification?.required_gates) && o.risk_classification.required_gates.length > 0
  },
];

const UX_RULES = [
  {
    rule: 'ux_spec_present', severity: 'BLOCKER', detail: 'UX spec is empty',
    check: (o) => typeof o.ux_spec === 'string' && o.ux_spec.trim().length > 0
  },
  {
    rule: 'user_flow_present', severity: 'BLOCKER', detail: 'User flow is empty',
    check: (o) => hasContent(o.user_flow)
  },
  {
    rule: 'wireframe_present', severity: 'BLOCKER', detail: 'Wireframe specification is empty',
    check: (o) => hasContent(o.wireframe_spec)
  },
  {
    rule: 'screens_present', severity: 'BLOCKER', detail: 'No screens supplied',
    check: (o) => Array.isArray(o.screens) && o.screens.length > 0
  },
  {
    rule: 'components_present', severity: 'BLOCKER', detail: 'Component inventory is empty',
    check: (o) => hasContent(o.component_inventory)
  },
];

const DEV_RULES = [
  {
    rule: 'implementation_plan_present', severity: 'BLOCKER', detail: 'Implementation plan is empty',
    check: (o) => hasContent(o.implementation_plan)
  },
  {
    rule: 'patch_present', severity: 'BLOCKER', detail: 'No code patch produced',
    check: (o) => (o.patch_diff || o.mock_code_diff || '').trim().length > 0
  },
  {
    rule: 'changed_files_present', severity: 'BLOCKER', detail: 'No changed files supplied',
    check: (o) => Array.isArray(o.changed_files) && o.changed_files.length > 0
  },
  {
    rule: 'patch_format', severity: 'WARNING', detail: 'patch_format is not defined',
    check: (o) => !!o.patch_format
  },
  {
    rule: 'build_ok', severity: 'BLOCKER', detail: 'Build did not pass',
    check: (o) => (o.build_result || {}).build_ok !== false
  },
  {
    rule: 'build_tests', severity: 'BLOCKER', detail: 'Test execution evidence is missing',
    check: (o) => (o.build_result || {}).tests_ran === true
  },
  {
    rule: 'self_test_report', severity: 'BLOCKER', detail: 'DEV self-test report is missing',
    check: (o) => hasContent(o.self_test_report)
  },
  {
    rule: 'linked_ac', severity: 'BLOCKER', detail: 'Patch is not linked to any AC',
    check: (o) => Array.isArray(o.linked_ac_ids) && o.linked_ac_ids.length > 0
  },
  {
    rule: 'risk_assessment_present', severity: 'BLOCKER', detail: 'Risk assessment is empty',
    check: (o) => hasContent(o.risk_assessment)
  },
  {
    rule: 'risk_classification_present', severity: 'BLOCKER', detail: 'Risk classification is incomplete',
    check: (o) => hasContent(o.risk_classification?.level) && Array.isArray(o.risk_classification?.required_gates) && o.risk_classification.required_gates.length > 0
  },
  {
    rule: 'security_notes', severity: 'BLOCKER', detail: 'High-risk DEV output is missing security notes',
    when: (o) => !!o.risk_classification?.required_gates?.includes('security'),
    check: (o) => !!o.security_notes
  },
  {
    rule: 'security_gate', severity: 'BLOCKER', detail: 'Security gate must PASS before DEV handoff',
    when: (o) => !!o.risk_classification?.required_gates?.includes('security'),
    check: (o) => o.security_gate?.recommendation === 'PASS'
  },
];

const QA_RULES = [
  {
    rule: 'test_cases_present', severity: 'BLOCKER',
    detail: (o) => `${Array.isArray(o.test_cases) ? o.test_cases.length : 0} detailed test cases supplied`,
    check: (o) => Array.isArray(o.test_cases) && o.test_cases.length > 0
  },
  {
    rule: 'coverage_present', severity: 'BLOCKER', detail: 'No AC coverage matrix',
    check: (o) => _matrix(o).length > 0
  },
  {
    rule: 'coverage_complete', severity: 'BLOCKER',
    detail: (o) => `${_matrix(o).filter((r) => r.covered !== true).length} acceptance criteria are not covered`,
    check: (o) => _matrix(o).every((r) => r.covered === true)
  },
  {
    rule: 'tests_executed', severity: 'BLOCKER', detail: 'Tests were not actually executed',
    check: (o) => (o.test_run_report || {}).executed === true
  },
  {
    rule: 'test_count_consistent', severity: 'BLOCKER', detail: 'Detailed test case count does not match the test run total',
    check: (o) => Array.isArray(o.test_cases) && Number(o.test_run_report?.total) === o.test_cases.length
  },
  {
    rule: 'test_evidence_present', severity: 'BLOCKER', detail: 'Test execution evidence/logs are empty',
    check: (o) => hasContent(o.test_run_report?.logs || o.test_run_report?.evidence)
  },
  {
    rule: 'tests_passed', severity: 'BLOCKER',
    detail: (o) => `${(o.test_run_report || {}).failed || 0} test(s) failed`,
    check: (o) => ((o.test_run_report || {}).failed || 0) === 0
  },
  {
    rule: 'no_blockers', severity: 'BLOCKER',
    detail: (o) => `${o.blocker_count || 0} blocker(s) present`,
    check: (o) => (o.blocker_count || 0) === 0
  },
  {
    rule: 'qa_report_present', severity: 'BLOCKER', detail: 'QA report is empty',
    check: (o) => hasContent(o.qa_report)
  },
  {
    rule: 'release_decision_present', severity: 'BLOCKER', detail: 'Release decision is empty or invalid',
    check: (o) => ['approve', 'reject', 'needs_changes'].includes(String(o.release_decision || '').toLowerCase())
  },
  {
    rule: 'release_reason', severity: 'BLOCKER', detail: 'Release decision has no justification',
    check: (o) => !!(o.release_reason && o.release_reason.trim())
  },
  {
    rule: 'quality_gate_pass', severity: 'BLOCKER',
    detail: (o, task) => `Quality gate is ${(task?.result?.gateRecommendation) || o.gate_evaluation?.recommendation || 'unknown'}, expected PASS`,
    check: (o, task) => {
      const recommendation = (task?.result?.gateRecommendation) || o.gate_evaluation?.recommendation;
      if (recommendation === 'PASS') return true;
      const tr = o.test_run_report || {};
      return tr.executed === true && typeof tr.failed === 'number' && tr.failed === 0 && (tr.total || 0) > 0;
    }
  },
];

const OUTPUT_CONTRACTS = {
  version: OUTPUT_CONTRACT_VERSION,
  'architecture-agent': ARCHITECTURE_RULES,
  'po-agent': PO_RULES,
  'ux-agent': UX_RULES,
  'dev-agent': DEV_RULES,
  'qa-agent': QA_RULES,
};

// ── Retry / Policy ───────────────────────────────────────────────────────────
const MAX_RETRY_PER_STEP = 3;
const RETRY_REASONS = ['schema_invalid', 'ac_not_measurable', 'coverage_gap', 'build_fail', 'quality_low', 'other'];

const AGENT_POLICY = {
  'po-agent': { max_attempts: MAX_RETRY_PER_STEP, timeout_seconds: 180 },
  'ux-agent': { max_attempts: MAX_RETRY_PER_STEP, timeout_seconds: 240 },
  'dev-agent': { max_attempts: MAX_RETRY_PER_STEP, timeout_seconds: 1800 },
  'qa-agent': { max_attempts: 2, timeout_seconds: 900 },
};

const FINAL_GATE = 'FINAL_GATE';
const RELEASE_DECISIONS = ['APPROVE', 'REJECT'];
const MOCK_REVIEW_STAGES = ['po-agent', 'ux-agent', 'dev-agent'];
const DEFAULT_MOCK_SCENARIO = 'happy_path';
const VAGUE_REVIEW_COMMENTS = new Set(['rework', 'fix', 'bad', 'wrong', 'redo', 'do again', 'lam lai', 'sua lai']);

const MOCK_SCENARIO_PROFILES = {
  happy_path: {
    title: 'Happy path release',
    outcome: 'All worker gates pass and the final release can be approved.',
    signals: ['high confidence', 'complete evidence', 'QA pass'],
  },
};

module.exports = {
  WORKSPACE_DIR,
  AGENT_GATES,
  OUTPUT_REVIEW_GATE_TYPE,
  NEXT_AGENT,
  NODE_TARGET,
  REWORK_TARGETS,
  GATE_MODE,
  DEFAULT_GATE_MODE,
  REVIEW_HOLDS,
  GATE_CONFIG,
  AUTO_APPROVE_CONFIDENCE,
  OUTPUT_CONTRACT_VERSION,
  OUTPUT_CONTRACTS,
  _acList,
  _matrix,
  MAX_RETRY_PER_STEP,
  RETRY_REASONS,
  AGENT_POLICY,
  FINAL_GATE,
  RELEASE_DECISIONS,
  MOCK_REVIEW_STAGES,
  DEFAULT_MOCK_SCENARIO,
  VAGUE_REVIEW_COMMENTS,
  MOCK_SCENARIO_PROFILES,
};
