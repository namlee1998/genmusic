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

const AGENT_CONTRACT_VERSION = 'agent-io.v3';

const REQUIRED_OUTPUT_KEYS = {
  'intent-agent': ['intent_assumptions'],
  'po-agent': ['prd', 'user_stories', 'acceptance_criteria', 'scope', 'out_of_scope', 'risk_classification'],
  'ux-agent': ['ux_spec', 'user_flow', 'wireframe_spec', 'screens', 'component_inventory'],
  'dev-agent': [
    'implementation_plan', 'patch_diff', 'changed_files', 'sandbox_result',
    'self_test_report', 'linked_ac_ids', 'risk_assessment', 'risk_classification',
  ],
  'qa-agent': [
    'test_cases', 'qa_report', 'ac_coverage_matrix', 'test_run_report',
    'release_decision', 'release_reason', 'blocker_count',
  ],
};

function hasContent(value) {
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0 && value.every(hasContent);
  if (value && typeof value === 'object') {
    const values = Object.values(value);
    return values.length > 0 && values.some(hasContent);
  }
  return value !== undefined && value !== null;
}

/**
 * Check an agent output against the role contract.
 * Required fields must exist and contain meaningful content. Numeric zero and
 * boolean false remain valid values; empty strings/arrays/objects do not.
 * @returns {{ ok: boolean, missing: string[], empty: string[] }}
 */
function assertOutputConforms(role, output) {
  const required = REQUIRED_OUTPUT_KEYS[role] || [];
  const out = output || {};
  const missing = required.filter((key) => out[key] === undefined || out[key] === null);
  const empty = required.filter((key) => !missing.includes(key) && !hasContent(out[key]));
  return { ok: missing.length === 0 && empty.length === 0, missing, empty };
}

module.exports = { AGENT_CONTRACT_VERSION, REQUIRED_OUTPUT_KEYS, assertOutputConforms, hasContent };
