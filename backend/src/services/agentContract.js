// I4: the small, explicit agent I/O contract.
//
// An agent (mock OR real) is anything that implements:
//     run({ task, context }) -> Promise<output>
// where `output` is a plain object containing at least the role's required
// output keys below. Today the only implementation is the mock builder
// (`SdlcWorkflowService._buildMockOutput`); when a real agent is wired, it must
// produce the same shape and is checked by the same conformance suite
// (tests/integration/agent-contract.test.js) — so divergence is caught at the
// boundary instead of mid-pipeline.
//
// Deliberately tiny: this is the minimal handoff shape, NOT a full schema (the
// richer per-field validation lives in OUTPUT_CONTRACTS / _validateGateOutput).
// Do not grow this into a 6-connector abstraction until a real second
// implementation exists and the real pattern is visible.

const AGENT_CONTRACT_VERSION = 'agent-io.v1';

const REQUIRED_OUTPUT_KEYS = {
  'po-agent': ['prd', 'acceptance_criteria'],
  'ux-agent': ['ux_spec'],
  'dev-agent': ['patch_diff', 'sandbox_result', 'self_test_report'],
  'qa-agent': ['ac_coverage_matrix', 'test_run_report'],
};

/**
 * Check an agent output against the role contract.
 * @returns {{ ok: boolean, missing: string[] }}
 */
function assertOutputConforms(role, output) {
  const required = REQUIRED_OUTPUT_KEYS[role] || [];
  const out = output || {};
  const missing = required.filter((key) => out[key] === undefined || out[key] === null);
  return { ok: missing.length === 0, missing };
}

module.exports = { AGENT_CONTRACT_VERSION, REQUIRED_OUTPUT_KEYS, assertOutputConforms };
