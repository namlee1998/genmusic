// AIFA PHASE 3 — mock Claude Code runner (T3.2).
//
// Replays a scenario script (mockClaudeCodeScripts) by driving the SAME onGate
// interface a real Claude Code agent would use (canUseTool). It:
//   1. asks PO clarification questions through onGate('AskUserQuestion', …)
//   2. writes files through onGate('Write', …) — only writing to disk when the
//      gate allows; a denied write is skipped (and recorded by the gate audit)
//   3. returns { output } produced by the existing validated mock builder.
//
// CRITICAL (plan T3.2): output MUST flow through onGate side-effects, never be
// returned straight, otherwise the gate / HITL / UI cannot be exercised.

const fs = require('fs/promises');
const path = require('path');
const { getScript } = require('./mockClaudeCodeScripts');
const repoService = require('../services/repoService');
const logger = require('../config/logger');

/**
 * @param {object} p
 * @param {string} p.role         e.g. 'dev-agent'
 * @param {string} [p.repoPath]   cloned repo path; falls back to a sandbox dir
 * @param {string} p.taskId
 * @param {object} p.context      mutable context passed to buildOutput
 * @param {Function} p.onGate     async (toolName, input) => { behavior, … }
 * @param {string} p.scenario     selected MOCK_SCENARIO
 * @param {Function} p.buildOutput async () => output  (the validated mock builder)
 * @param {string} [p.sandboxDir] where to write when there is no cloned repo
 * @returns {Promise<{ output: object, writtenFiles: string[], deniedFiles: string[] }>}
 */
async function runAgent({ role, repoPath, taskId, context = {}, onGate, scenario, buildOutput, sandboxDir }) {
  const script = getScript(scenario, role);
  const writtenFiles = [];
  const deniedFiles = [];
  const targetRoot = repoPath || sandboxDir;

  // 1) Clarifying questions (type B) — at most once; never on a rerun (T4.3).
  const isRerun = !!(context.feedbackPrompt && String(context.feedbackPrompt).trim());
  if (script.asks && !isRerun && typeof onGate === 'function') {
    const res = await onGate('AskUserQuestion', { questions: script.asks.questions || [] });
    const answers = res?.updatedInput?.answers || [];
    if (typeof script.applyAnswers === 'function') {
      script.applyAnswers(answers, context);
    }
  }

  // 2) File writes (type A) -------------------------------------------------
  if (Array.isArray(script.writes) && typeof onGate === 'function') {
    for (const file of script.writes) {
      const decision = await onGate('Write', {
        file_path: file.file_path,
        content: file.content,
        diff: file.content,
      });
      if (decision?.behavior !== 'allow') {
        deniedFiles.push(file.file_path);
        continue;
      }
      // Only write to disk when we have a safe, in-repo target.
      if (targetRoot && repoService.isWithinRepo(targetRoot, file.file_path) && !repoService.isBlockedPath(file.file_path)) {
        const abs = path.resolve(targetRoot, file.file_path);
        await fs.mkdir(path.dirname(abs), { recursive: true });
        await fs.writeFile(abs, file.content, 'utf8');
        writtenFiles.push(file.file_path);
      } else if (targetRoot) {
        logger.warn('claude-code mock: skipped unsafe write', { taskId, role, file: file.file_path });
        deniedFiles.push(file.file_path);
      }
    }
  }

  // 3) Output (validated builder) -------------------------------------------
  const output = await buildOutput();
  if (script.outputPatch && typeof script.outputPatch === 'object') {
    Object.assign(output, script.outputPatch);
  }
  if (writtenFiles.length) {
    output.changed_files = [...new Set([...(output.changed_files || []), ...writtenFiles])];
  }
  logger.info('claude-code mock run complete', { taskId, role, scenario, written: writtenFiles.length, denied: deniedFiles.length });
  return { output, writtenFiles, deniedFiles };
}

module.exports = { runAgent };
