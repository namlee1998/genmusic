// I5: drift guard for the versioned agent output contracts. If a role's
// required-field shape changes, this snapshot must be updated *and* the
// OUTPUT_CONTRACT_VERSION bumped — otherwise the handoff contract silently
// drifts from what downstream agents and the gate assume.

jest.mock('uuid', () => ({ v4: jest.fn(() => 'test-uuid') }));

const SdlcWorkflowService = require('../../src/services/SdlcWorkflowService');

const EXPECTED_VERSION = 'gate-output.v4';

// Frozen expectation of rule name → severity per role.
const EXPECTED = {
  'intent-agent': { intent_assumptions_present: 'BLOCKER' },
  'po-agent': {
    prd_present: 'BLOCKER', user_stories_present: 'BLOCKER', ac_present: 'BLOCKER',
    ac_testable: 'BLOCKER', ac_measurable: 'WARNING', scope_present: 'BLOCKER',
    out_of_scope_present: 'BLOCKER', risk_classification_present: 'BLOCKER',
  },
  'ux-agent': {
    ux_spec_present: 'BLOCKER', user_flow_present: 'BLOCKER', wireframe_present: 'BLOCKER',
    screens_present: 'BLOCKER', components_present: 'BLOCKER',
  },
  'dev-agent': {
    implementation_plan_present: 'BLOCKER', patch_present: 'BLOCKER', changed_files_present: 'BLOCKER',
    patch_format: 'WARNING', build_ok: 'BLOCKER',
    sandbox_tests: 'BLOCKER', self_test_report: 'BLOCKER', linked_ac: 'BLOCKER',
    risk_assessment_present: 'BLOCKER', risk_classification_present: 'BLOCKER',
    security_notes: 'BLOCKER', security_gate: 'BLOCKER',
  },
  'qa-agent': {
    test_cases_present: 'BLOCKER', coverage_present: 'BLOCKER', coverage_complete: 'BLOCKER', tests_executed: 'BLOCKER',
    test_count_consistent: 'BLOCKER', test_evidence_present: 'BLOCKER', tests_passed: 'BLOCKER',
    no_blockers: 'BLOCKER', qa_report_present: 'BLOCKER', release_decision_present: 'BLOCKER', release_reason: 'BLOCKER',
    quality_gate_pass: 'BLOCKER',
  },
};

const shapeOf = (rules) => Object.fromEntries(rules.map((r) => [r.rule, r.severity]));

describe('I5 — versioned output contract drift guard', () => {
  test('contract version is the expected version', () => {
    expect(SdlcWorkflowService.OUTPUT_CONTRACT_VERSION).toBe(EXPECTED_VERSION);
    expect(SdlcWorkflowService.OUTPUT_CONTRACTS.version).toBe(EXPECTED_VERSION);
  });

  test.each(Object.keys(EXPECTED))('%s required-field shape is unchanged', (role) => {
    const rules = SdlcWorkflowService.OUTPUT_CONTRACTS[role];
    expect(rules).toBeDefined();
    expect(shapeOf(rules)).toEqual(EXPECTED[role]);
  });

  test('validator still flags a structurally complete PO output as ok', () => {
    const res = SdlcWorkflowService._validateGateOutput(
      { type: 'po-agent' },
      {
        prd: 'A real PRD body',
        user_stories: ['As a user, I can complete the feature.'],
        acceptance_criteria: ['AC-1: something measurable and clear'],
        scope: 'Implement the requested feature.',
        out_of_scope: 'No unrelated changes.',
        risk_classification: { level: 'LOW', required_gates: ['schema', 'validation'] },
      },
    );
    expect(res.ok).toBe(true);
    expect(res.violations).toHaveLength(0);
  });

  test('validator flags BLOCKER violations for an empty PO output', () => {
    const res = SdlcWorkflowService._validateGateOutput({ type: 'po-agent' }, {});
    expect(res.ok).toBe(false);
    expect(res.violations.map((v) => v.rule)).toEqual(expect.arrayContaining(['prd_present', 'ac_present']));
  });

  test('QA report totals do not replace the required detailed test cases', () => {
    const res = SdlcWorkflowService._validateGateOutput(
      { type: 'qa-agent' },
      {
        test_cases: [],
        test_run_report: { executed: true, total: 21, failed: 0 },
        ac_coverage_matrix: [{ ac_id: 'AC-1', covered: true }],
        blocker_count: 0,
        release_reason: 'All reported checks passed.',
        gate_evaluation: { recommendation: 'PASS' },
      },
    );

    expect(res.ok).toBe(false);
    expect(res.violations).toEqual(expect.arrayContaining([
      expect.objectContaining({ rule: 'test_cases_present', severity: 'BLOCKER' }),
    ]));
  });
});
