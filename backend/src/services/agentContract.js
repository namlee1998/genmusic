// Small, explicit agent I/O boundary shared by every execution adapter.
//
// Beginner reading guide: REQUIRED_OUTPUT_KEYS is the minimum shape accepted
// from deterministic mock output, the real Claude Agent SDK runner, and the
// Python/LangChain service. Detailed semantic/risk rules live in
// SdlcWorkflowService.OUTPUT_CONTRACTS (gate-output.v4).
//
// An adapter returns a plain object containing at least the role's required
// output keys below. tests/integration/agent-contract.test.js catches drift at
// this boundary before incomplete output reaches persistence or downstream.
//
// Keep this contract deliberately small. Do not duplicate richer gate rules.

const AGENT_CONTRACT_VERSION = 'agent-io.v3';

const REQUIRED_OUTPUT_KEYS = {
  'architecture-agent': ['repository_summary', 'technology_stack', 'technical_decisions', 'constraints', 'repository_routing', 'architecture_brief'],
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

/**
 * T2 (B1) — normalize `clarification_questions` from agent output to the
 * object shape consumed by the frontend ClarificationPanel.
 *
 * The frontend (and spec §6.1) expect `[{question, header?, options?}, ...]`,
 * but agents may still return the older `string[]` form, partial objects, or
 * even `null` while they migrate. This helper is defensive: it always returns
 * a non-empty array of objects, never throws, and never silently drops content.
 *
 * - `string[]` entries become `{question: str}` objects (header/options left
 *   undefined so ClarificationPanel's suggested-answer fallback uses the
 *   question text itself).
 * - Bare strings / numbers / null / undefined are coerced where possible.
 * - Items without a recognizable question text are dropped with a warning log.
 */
function normalizeClarificationQuestions(raw, { logger = console } = {}) {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  const out = [];
  for (const item of raw) {
    if (item == null) continue;
    if (typeof item === 'string') {
      const text = item.trim();
      if (text) out.push({ question: text });
      continue;
    }
    if (typeof item === 'object') {
      const question = typeof item.question === 'string' ? item.question.trim() : '';
      if (!question) {
        logger.warn?.('clarification_questions: dropping item without question field', { item });
        continue;
      }
      const header = typeof item.header === 'string' && item.header.trim() ? item.header.trim() : undefined;
      let options;
      if (Array.isArray(item.options) && item.options.length > 0) {
        options = item.options
          .filter((o) => o && typeof o === 'object')
          .map((o) => ({
            label: typeof o.label === 'string' ? o.label.trim() : '',
            description: typeof o.description === 'string' ? o.description.trim() : undefined,
          }))
          .filter((o) => o.label);
        if (options.length === 0) options = undefined;
      }
      out.push(
        options
          ? (header ? { question, header, options } : { question, options })
          : (header ? { question, header } : { question })
      );
    }
  }
  return out;
}

module.exports = { AGENT_CONTRACT_VERSION, REQUIRED_OUTPUT_KEYS, assertOutputConforms, hasContent, normalizeClarificationQuestions };
