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
const { REQUIRED_OUTPUT_KEYS, AGENT_CONTRACT_VERSION } = require('../services/agentContract');

const PROMPT_DIR = path.join(__dirname, 'prompts');
const DEFAULT_TIMEOUT_MS = Number(process.env.CLAUDE_CODE_TIMEOUT_MS) || 30 * 60 * 1000;
const ALLOWED_TOOLS = ['Read', 'Glob', 'Grep', 'LS', 'Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'Bash', 'AskUserQuestion'];
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

  const missing = (REQUIRED_OUTPUT_KEYS[role] || [])
    .filter((key) => output[key] === undefined || output[key] === null);
  if (missing.length) {
    if (process.env.CLAUDE_CODE_LENIENT_CONTRACT === 'true') {
      for (const key of missing) {
        output[key] = {
          status: 'missing_from_claude_output',
          note: `Claude did not return required key ${key}; AIFA inserted this placeholder so the real demo can continue.`,
        };
      }
      output.observability.contract_warnings = { missing_required_keys: missing };
      return output;
    }
    const err = new Error(`Claude output missing required ${role} key(s): ${missing.join(', ')}`);
    err.code = 'CLAUDE_OUTPUT_CONTRACT_INVALID';
    err.recoverable = true;
    err.missing = missing;
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
      'When you need a decision with multiple valid options, use AskUserQuestion.',
      'Return a valid agent-io.v1 JSON object only as your final message.',
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
    '- When a decision has multiple reasonable options, call AskUserQuestion before proceeding.',
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

function makeCanUseTool(onGate, cwd) {
  return async (toolName, input) => {
    if (typeof onGate !== 'function') return { behavior: 'allow', updatedInput: input };
    let res;
    try {
      res = await onGate(toolName, adaptGateInput(toolName, input, cwd));
    } catch (e) {
      return { behavior: 'deny', message: `Gate error: ${e.message}` };
    }
    if (!res || res.behavior === 'allow') {
      // AskUserQuestion carries answers in updatedInput; tool gates pass through.
      return { behavior: 'allow', updatedInput: res?.updatedInput || input };
    }
    return { behavior: 'deny', message: res.message || 'Rejected by reviewer' };
  };
}

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

  const q = query({
    prompt,
    options: {
      cwd,
      permissionMode: 'default',
      canUseTool: makeCanUseTool(onGate, cwd),
      allowedTools: ALLOWED_TOOLS,
      ...(process.env.CLAUDE_CODE_MODEL ? { model: process.env.CLAUDE_CODE_MODEL } : {}),
      ...(process.env.CLAUDE_CODE_MAX_TURNS ? { maxTurns: Number(process.env.CLAUDE_CODE_MAX_TURNS) } : {}),
    },
  });

  // Generous safety cap; human gate waits are bounded by gateBridge's own
  // watchdog (GATE_TIMEOUT_MS), so this only catches a runaway agent.
  const timer = setTimeout(() => { try { q.interrupt?.(); } catch (_) { /* noop */ } }, timeoutMs);
  if (typeof timer.unref === 'function') timer.unref();

  let resultText = '';
  let sessionId = null;
  let totalCostUsd = null;
  let usage = null;
  let isError = false;
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
      }
    }
  } finally {
    clearTimeout(timer);
  }

  if (isError && !resultText) {
    const err = new Error('Claude Agent SDK run ended with an error');
    err.code = 'CLAUDE_CODE_RUN_ERROR';
    err.recoverable = true;
    throw err;
  }

  const parsed = parseJsonObject(resultText);
  if (!parsed) {
    const err = new Error('Claude Agent SDK result did not contain parseable JSON output');
    err.code = 'CLAUDE_OUTPUT_PARSE_ERROR';
    err.recoverable = true;
    err.rawResult = resultText;
    throw err;
  }

  const output = normalizeOutput(role, parsed, { sessionId, totalCostUsd, usage });
  return { output, messages: messageTypes, cliSessionId: sessionId, taskId };
}

module.exports = { runAgent, buildPrompt, parseJsonObject, normalizeOutput };
