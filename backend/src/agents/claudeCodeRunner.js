// Real Claude Code runner for AIFA — Claude Agent SDK adapter.
//
// Drives the LOCAL Claude Code (via @anthropic-ai/claude-agent-sdk `query()`,
// using your local `claude login` — no ANTHROPIC_API_KEY required) and routes
// every interactive checkpoint through AIFA's existing `onGate` callback:
//   - AskUserQuestion  -> AIFA "question" gate (clarifying questions surface in UI)
//   - Write/Edit/Bash… -> AIFA "tool" gate (risk-classified approve/deny + diff)
// So a real run behaves like normal Claude Code, but its prompts render on the
// AIFA board instead of a terminal. Enabled when USE_MOCK_CLAUDE_CODE=false.
//
// Phase-0 spike findings baked in:
//   * canUseTool fires for Write/Edit/AskUserQuestion; read-only Bash (pwd/ls)
//     can auto-run without hitting canUseTool — that's fine, AIFA only needs to
//     gate writes + questions.
//   * Claude passes ABSOLUTE file paths; AIFA's riskClassifier treats absolute
//     paths as "outside repo" and blocks them, so we classify a repo-RELATIVE
//     copy while letting the SDK execute with the original (correct) path.

const fs = require('fs/promises');
const path = require('path');
const { REQUIRED_OUTPUT_KEYS, AGENT_CONTRACT_VERSION, assertOutputConforms } = require('../services/agentContract');

const PROMPT_DIR = path.join(__dirname, 'prompts');
const DEFAULT_TIMEOUT_MS = Number(process.env.CLAUDE_CODE_TIMEOUT_MS) || 30 * 60 * 1000;
// The SDK caps a run at maxTurns; its default is low for a multi-step coding
// agent. DEV (read → plan → write several files → test) exhausts it and the run
// ends mid-tool with subtype=error_max_turns / stop_reason=tool_use. Give every
// role a generous ceiling; the gate-aware compute timeout still bounds runaways.
const configuredMaxTurns = Number(process.env.CLAUDE_CODE_MAX_TURNS);
const DEFAULT_MAX_TURNS = Number.isFinite(configuredMaxTurns) && configuredMaxTurns > 0
  ? Math.floor(configuredMaxTurns)
  : 200;
const ALLOWED_TOOLS = ['Read', 'Glob', 'Grep', 'LS', 'Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'Bash'];
const ROLE_LABEL = {
  'po-agent': 'Product Owner',
  'ux-agent': 'UX Designer',
  'dev-agent': 'Developer',
  'qa-agent': 'QA Engineer',
};

let _sdk = null;
async function loadSdk() {
  if (!_sdk) _sdk = await import('@anthropic-ai/claude-agent-sdk');
  return _sdk;
}

function stageKey(role) {
  return String(role || '').replace('-agent', '');
}

function safeJson(value, max = 24000) {
  const seen = new WeakSet();
  const text = JSON.stringify(value || {}, (key, val) => {
    if (typeof val === 'function') return undefined;
    if (typeof val === 'object' && val !== null) {
      if (seen.has(val)) return '[Circular]';
      seen.add(val);
    }
    return val;
  }, 2);
  return text.length > max ? `${text.slice(0, max)}\n...<truncated>` : text;
}

function parseJsonObject(text) {
  if (!text || typeof text !== 'string') return null;
  const candidates = [];
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) candidates.push(fenced[1]);
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) candidates.push(text.slice(firstBrace, lastBrace + 1));
  candidates.push(text);
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate.trim());
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch (_) { /* try next */ }
  }
  return null;
}

// Gate validators (_validateGateOutput) count these per-role keys as ARRAYS
// (e.g. PO `acceptance_criteria` via Array.isArray). Real Claude often returns
// them as a single multi-line string ("AC-1: …\n\nAC-2: …"), which the array
// check reads as empty → BLOCKER → output flagged INVALID even though the
// content is fine. Coerce string→array here so a well-formed real run conforms
// without weakening the gate. Object-array fields (e.g. qa `ac_coverage_matrix`,
// rows with `covered`) are intentionally left to the prompt — we never fabricate
// evidence objects from prose.
const STRING_LIST_KEYS = {
  'intent-agent': ['acceptance_criteria', 'user_stories'],
  'po-agent': ['acceptance_criteria', 'user_stories'],
  'ux-agent': ['screens', 'component_inventory'],
  'dev-agent': ['changed_files', 'linked_ac_ids'],
  'qa-agent': ['test_cases'],
};

function toStringArray(value) {
  if (value == null || Array.isArray(value)) return value;
  if (typeof value !== 'string') return value; // placeholder/object → leave as-is
  const s = value.trim();
  if (!s) return [];
  // Prefer splitting on blank lines (paragraph items); fall back to single lines.
  let parts = s.split(/\n\s*\n+/).map((x) => x.trim()).filter(Boolean);
  if (parts.length <= 1) parts = s.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  // Strip leading list markers ("- ", "* ", "1. "/"1) ") but keep "AC-1:" content.
  parts = parts.map((p) => p.replace(/^[-*]\s+/, '').replace(/^\d+[.)]\s+/, '')).filter(Boolean);
  return parts.length ? parts : [s];
}

function coerceArrayFields(role, output) {
  for (const key of STRING_LIST_KEYS[role] || []) {
    if (typeof output[key] === 'string') output[key] = toStringArray(output[key]);
  }
  return output;
}

function normalizeOutput(role, parsed, meta = {}) {
  const envelope = parsed.outputVersion || parsed.schema_version || parsed.stage || parsed.artifact
    ? parsed
    : { artifact: parsed };
  const output = envelope.artifact && typeof envelope.artifact === 'object'
    ? { ...envelope.artifact }
    : { ...parsed };

  if (!output.summary && envelope.rawSummary) output.summary = envelope.rawSummary;
  if (!output.confidence_score && typeof envelope.confidence === 'number') {
    output.confidence_score = envelope.confidence;
  }
  output.token_usage = output.token_usage || {
    input: meta.usage?.input_tokens || 0,
    output: meta.usage?.output_tokens || 0,
  };
  output.observability = {
    ...(output.observability || {}),
    runner: 'claude-agent-sdk',
    cli_session_id: meta.sessionId || null,
    cli_total_cost_usd: meta.totalCostUsd ?? null,
    output_contract: AGENT_CONTRACT_VERSION,
  };

  // Reshape known list fields (string→array) so the gate's array checks pass.
  coerceArrayFields(role, output);

  const contract = assertOutputConforms(role, output);
  if (!contract.ok) {
    const problems = [
      contract.missing.length ? `missing: ${contract.missing.join(', ')}` : null,
      contract.empty.length ? `empty: ${contract.empty.join(', ')}` : null,
    ].filter(Boolean).join('; ');
    const err = new Error(`Claude output violates ${role} contract (${problems})`);
    err.code = 'CLAUDE_OUTPUT_CONTRACT_INVALID';
    err.recoverable = true;
    err.missing = contract.missing;
    err.empty = contract.empty;
    throw err;
  }
  return output;
}

async function loadPromptTemplate(role) {
  const key = stageKey(role);
  try {
    return await fs.readFile(path.join(PROMPT_DIR, `${key}.prompt.md`), 'utf8');
  } catch (_) {
    return [
      `You are the ${ROLE_LABEL[role] || role} agent in AIFA.`,
      'Work on the repository in your working directory using the available tools.',
      'Make reasonable assumptions and continue without asking interactive questions.',
      `Return a valid ${AGENT_CONTRACT_VERSION} JSON object only as your final message.`,
    ].join('\n');
  }
}

async function buildPrompt({ role, repoPath, context }) {
  const template = await loadPromptTemplate(role);
  const required = REQUIRED_OUTPUT_KEYS[role] || [];
  return [
    template.trim(),
    '',
    '## Runtime Contract',
    `- Stage: ${role}`,
    `- Output contract: ${AGENT_CONTRACT_VERSION}`,
    `- Required artifact keys: ${required.join(', ') || '(none)'}`,
    '- Work inside the working directory only; use repo-relative paths for file operations.',
    '- Make reasonable assumptions and continue without calling AskUserQuestion.',
    '- Your FINAL message must contain exactly one fenced ```json block with this shape:',
    '```json',
    JSON.stringify({
      outputVersion: AGENT_CONTRACT_VERSION,
      stage: stageKey(role),
      artifact: Object.fromEntries(required.map((key) => [key, `<${key}>`])),
      rawSummary: 'Short human-readable summary',
    }, null, 2),
    '```',
    '',
    '## Repository',
    repoPath ? `Working directory: ${repoPath}` : 'No repository was provided. Produce planning/evidence artifacts only.',
    '',
    '## AIFA Context',
    '```json',
    safeJson(context),
    '```',
  ].join('\n');
}

// ── Map a Claude tool call to AIFA's onGate, then to the SDK PermissionResult ──
function toRepoRel(absPath, cwd) {
  if (!absPath || !cwd) return absPath;
  try {
    const rel = path.relative(cwd, path.resolve(cwd, absPath));
    return rel || absPath;
  } catch (_) {
    return absPath;
  }
}

// Build the input AIFA's onGate/riskClassifier should see (repo-relative path +
// a human-readable diff). The SDK still executes with the ORIGINAL input.
function adaptGateInput(toolName, input, cwd) {
  const out = { ...input };
  if (input.file_path) out.file_path = toRepoRel(input.file_path, cwd);
  if (toolName === 'Write') {
    out.diff = input.content || null;
  } else if (toolName === 'Edit') {
    out.diff = `@@ ${out.file_path}\n- ${input.old_string ?? ''}\n+ ${input.new_string ?? ''}`;
  } else if (toolName === 'MultiEdit') {
    out.diff = (input.edits || []).map((e) => `- ${e.old_string ?? ''}\n+ ${e.new_string ?? ''}`).join('\n');
  }
  return out;
}

function makeCanUseTool(onGate, cwd, gateClock = null) {
  return async (toolName, input, options = {}) => {
    if (typeof onGate !== 'function') return { behavior: 'allow', updatedInput: input };
    let res;
    // A tool/question gate may sit paused waiting for a human; bracket the wait so
    // the runner's safety timeout doesn't count it against the agent's budget.
    if (gateClock) gateClock.enter();
    try {
      res = await onGate(toolName, adaptGateInput(toolName, input, cwd), options);
    } catch (e) {
      return { behavior: 'deny', message: `Gate error: ${e.message}` };
    } finally {
      if (gateClock) gateClock.exit();
    }
    if (!res || res.behavior === 'allow') {
      // AskUserQuestion carries answers in updatedInput; tool gates pass through.
      return { behavior: 'allow', updatedInput: res?.updatedInput || input };
    }
    return { behavior: 'deny', message: res.message || 'Rejected by reviewer' };
  };
}

// A run can die mid-stream when a corporate proxy drops the long-lived
// connection to the Anthropic API ("socket connection was closed unexpectedly"),
// or on a transient 5xx/overload. These are not agent bugs — retrying the run
// usually succeeds, so we distinguish them from real failures.
const TRANSIENT_ERROR = /socket connection was closed|socket hang ?up|ECONNRESET|ETIMEDOUT|EPIPE|ENOTFOUND|EAI_AGAIN|network error|fetch failed|terminated|connection (error|closed|reset)|premature close|stream (error|closed)|\b(408|425|429|500|502|503|504)\b|overloaded|rate.?limit/i;
const isTransientError = (err) => TRANSIENT_ERROR.test(String(err?.message || ''));
const isRetryableToolUseError = (err) => err?.subtype === 'error_during_execution'
  && err?.stopReason === 'tool_use';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function runAgent({
  role,
  repoPath,
  taskId,
  context = {},
  onGate,
  onProgress,
  sandboxDir,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  const { query } = await loadSdk();
  const cwd = repoPath || sandboxDir || process.cwd();
  const prompt = await buildPrompt({ role, repoPath, context });

  // One streaming run of the agent. Returns the raw result fields; throws on
  // error so the retry loop below can decide whether the failure is transient.
  const attempt = async () => {
    // Gate-aware safety budget: the timeout should bound the AGENT's own compute,
    // NOT the wall-clock time a run sits paused waiting for a human to approve a
    // tool/answer a question. `gateClock` accrues human-wait time and pushes the
    // deadline out by the same amount; while a gate is open the timer never fires.
    // (Without this, a DEV run that correctly surfaces an approval gate is killed
    // at timeoutMs and the SDK reports stop_reason=tool_use.)
    let gateDepth = 0;
    let gateWaitStartedAt = 0;
    let extraBudgetMs = 0;
    const startedAt = Date.now();
    const gateClock = {
      enter() { if (gateDepth++ === 0) gateWaitStartedAt = Date.now(); },
      exit() { if (gateDepth > 0 && --gateDepth === 0) extraBudgetMs += Date.now() - gateWaitStartedAt; },
    };

    const q = query({
      prompt,
      options: {
        cwd,
        permissionMode: 'default',
        canUseTool: makeCanUseTool(onGate, cwd, gateClock),
        allowedTools: ALLOWED_TOOLS,
        maxTurns: DEFAULT_MAX_TURNS,
        ...(process.env.CLAUDE_CODE_MODEL ? { model: process.env.CLAUDE_CODE_MODEL } : {}),
      },
    });

    let timer;
    const armTimer = () => {
      const deadline = startedAt + timeoutMs + extraBudgetMs;
      timer = setTimeout(() => {
        // Still paused on a human gate, or the deadline was pushed out → re-check
        // later instead of killing a run that is legitimately waiting/working.
        if (gateDepth > 0 || Date.now() < startedAt + timeoutMs + extraBudgetMs) { armTimer(); return; }
        try { q.interrupt?.(); } catch (_) { /* noop */ }
      }, Math.max(1000, deadline - Date.now()));
      if (typeof timer.unref === 'function') timer.unref();
    };
    armTimer();

    let resultText = '';
    let sessionId = null;
    let totalCostUsd = null;
    let usage = null;
    let isError = false;
    let resultSubtype = null;
    let numTurns = null;
    let stopReason = null;
    let resultErrors = [];
    const messageTypes = [];

    try {
      for await (const message of q) {
        messageTypes.push(message.type);
        if (message.type === 'assistant') {
          for (const block of message.message?.content || []) {
            if (block.type === 'text' && typeof onProgress === 'function') {
              onProgress({ type: 'text', data: block.text });
            }
          }
        } else if (message.type === 'result') {
          resultText = message.result || '';
          sessionId = message.session_id || null;
          totalCostUsd = message.total_cost_usd ?? null;
          usage = message.usage || null;
          isError = !!message.is_error;
          resultSubtype = message.subtype || null;
          numTurns = message.num_turns ?? null;
          stopReason = message.stop_reason ?? null;
          resultErrors = Array.isArray(message.errors) ? message.errors : [];
        }
      }
    } finally {
      clearTimeout(timer);
    }

    // An error result (e.g. an API/socket error surfaced as a result message)
    // is thrown so the retry loop can inspect it for transient causes.
    if (isError) {
      const detail = resultErrors.filter(Boolean).join('; ');
      const diagnostic = [
        resultSubtype || 'unknown_result_error',
        Number.isFinite(numTurns) ? `turns=${numTurns}` : null,
        stopReason ? `stop_reason=${stopReason}` : null,
      ].filter(Boolean).join(', ');
      const err = new Error(detail || resultText || `Claude Agent SDK run ended with an error (${diagnostic})`);
      err.code = 'CLAUDE_CODE_RUN_ERROR';
      err.recoverable = true;
      err.subtype = resultSubtype;
      err.numTurns = numTurns;
      err.stopReason = stopReason;
      err.sdkErrors = resultErrors;
      if (resultSubtype === 'error_max_turns') {
        err.code = 'CLAUDE_CODE_MAX_TURNS';
        err.message = `Claude Code reached maxTurns=${DEFAULT_MAX_TURNS} before finishing (turns=${numTurns}, stop_reason=${stopReason || 'unknown'})`;
      }
      throw err;
    }
    return { resultText, sessionId, totalCostUsd, usage, messageTypes, resultSubtype, numTurns, stopReason };
  };

  const maxAttempts = Math.max(1, Number(process.env.CLAUDE_CODE_MAX_RETRIES ?? 2) + 1);
  let run;
  for (let i = 1; i <= maxAttempts; i += 1) {
    try {
      run = await attempt();
      break;
    } catch (err) {
      if (i < maxAttempts && (isTransientError(err) || isRetryableToolUseError(err))) {
        // eslint-disable-next-line no-console
        console.warn(`[claudeCodeRunner] recoverable error on ${role} attempt ${i}/${maxAttempts}, retrying: ${err.message}`);
        await sleep(1500 * i);
        continue;
      }
      throw err;
    }
  }
  const {
    resultText, sessionId, totalCostUsd, usage, messageTypes, resultSubtype, numTurns, stopReason,
  } = run;

  const parsed = parseJsonObject(resultText);
  if (!parsed) {
    const err = new Error('Claude Agent SDK result did not contain parseable JSON output');
    err.code = 'CLAUDE_OUTPUT_PARSE_ERROR';
    err.recoverable = true;
    err.rawResult = resultText;
    throw err;
  }

  const output = normalizeOutput(role, parsed, { sessionId, totalCostUsd, usage });
  output.observability.claude_result = {
    subtype: resultSubtype,
    num_turns: numTurns,
    stop_reason: stopReason,
    max_turns: DEFAULT_MAX_TURNS,
  };
  return { output, messages: messageTypes, cliSessionId: sessionId, taskId };
}

module.exports = {
  runAgent,
  buildPrompt,
  parseJsonObject,
  normalizeOutput,
  _internal: {
    adaptGateInput, makeCanUseTool, isRetryableToolUseError, DEFAULT_MAX_TURNS,
  },
};
