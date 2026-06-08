// I5: drift guard for the versioned agent output contracts. If a role's
// required-field shape changes, this snapshot must be updated *and* the
// OUTPUT_CONTRACT_VERSION bumped — otherwise the handoff contract silently
// drifts from what downstream agents and the gate assume.

jest.mock('uuid', () => ({ v4: jest.fn(() => 'test-uuid') }));

const SdlcWorkflowService = require('../../src/services/SdlcWorkflowService');

const EXPECTED_VERSION = 'gate-output.v2';

// Frozen expectation of rule name → severity per role.
const EXPECTED = {
  'intent-agent': { prd_present: 'BLOCKER', ac_present: 'BLOCKER', ac_testable: 'BLOCKER', ac_measurable: 'WARNING' },
  'po-agent': { prd_present: 'BLOCKER', ac_present: 'BLOCKER', ac_testable: 'BLOCKER', ac_measurable: 'WARNING' },
  'ux-agent': { ux_spec_present: 'BLOCKER', screens_present: 'BLOCKER' },
  'dev-agent': {
    patch_present: 'BLOCKER', patch_format: 'WARNING', build_ok: 'BLOCKER',
    sandbox_tests: 'BLOCKER', self_test_report: 'BLOCKER', linked_ac: 'WARNING',
    security_notes: 'BLOCKER', security_gate: 'BLOCKER',
  },
  'qa-agent': {
    coverage_present: 'BLOCKER', coverage_complete: 'BLOCKER', tests_executed: 'BLOCKER',
    tests_passed: 'BLOCKER', no_blockers: 'BLOCKER', release_reason: 'WARNING',
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
      { prd: 'A real PRD body', acceptance_criteria: ['AC-1: something measurable and clear'] },
    );
    expect(res.ok).toBe(true);
    expect(res.violations).toHaveLength(0);
  });

  test('validator flags BLOCKER violations for an empty PO output', () => {
    const res = SdlcWorkflowService._validateGateOutput({ type: 'po-agent' }, {});
    expect(res.ok).toBe(false);
    expect(res.violations.map((v) => v.rule)).toEqual(expect.arrayContaining(['prd_present', 'ac_present']));
  });
});
