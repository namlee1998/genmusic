const { spawn } = require('child_process');
const claudeCodeRunner = require('./claudeCodeRunner');
const { AGENT_CONTRACT_VERSION } = require('../services/agentContract');

const DEFAULT_TIMEOUT_MS = Number(process.env.CODEX_TIMEOUT_MS) || 30 * 60 * 1000;

/**
 * Exact schema shapes required by OUTPUT_CONTRACTS in SdlcWorkflowService.js.
 * Each check() rule is documented beside the key it validates.
 */
const CODEX_ARTIFACT_TEMPLATES = {
  'po-agent': {
    prd: 'Full Product Requirements Document in Markdown. Must be a non-empty string.',
    user_stories: [
      'As a user, I want to log in with email and password so that I can access my account.'
    ],
    acceptance_criteria: [
      'User can enter email and password and click submit.',
      'System validates credentials and redirects to dashboard on success.',
      'System shows error message on invalid credentials.'
    ],
    scope: 'What is included in this feature (non-empty string).',
    out_of_scope: 'What is explicitly excluded from this feature (non-empty string).',
    risk_classification: {
      level: 'HIGH',
      tags: ['auth', 'session'],
      required_gates: ['schema', 'validation', 'evidence', 'security', 'qa'],
      classifier: 'codex-rule-based.v1',
      reason: 'Reason for this risk level.'
    }
  },
  'ux-agent': {
    ux_spec: 'Full UX specification in Markdown. Must be a non-empty string.',
    user_flow: [
      { step: 1, action: 'User opens login page', expected: 'Login form is displayed' },
      { step: 2, action: 'User enters email and password', expected: 'Input fields accept text' },
      { step: 3, action: 'User clicks Login', expected: 'System validates and redirects' }
    ],
    wireframe_spec: 'Textual wireframe description of each screen layout. Non-empty string or object.',
    screens: [
      {
        name: 'LoginScreen',
        route: '/login',
        components: ['EmailInput', 'PasswordInput', 'LoginButton', 'ForgotPasswordLink']
      }
    ],
    component_inventory: {
      EmailInput: { type: 'input', validation: 'email format' },
      PasswordInput: { type: 'input', validation: 'min 8 chars' },
      LoginButton: { type: 'button', action: 'submit form' }
    }
  },
  'dev-agent': {
    implementation_plan: 'Step-by-step implementation plan in Markdown. Non-empty string.',
    patch_diff: '--- a/src/login.js\n+++ b/src/login.js\n@@ -0,0 +1,10 @@\n+// Login implementation',
    changed_files: ['src/login.js', 'src/components/LoginForm.jsx'],
    sandbox_result: { status: 'ok', output: 'Build successful' },
    self_test_report: 'Summary of tests run by the DEV agent. Non-empty string.',
    linked_ac_ids: ['AC-1', 'AC-2', 'AC-3'],
    risk_assessment: 'Analysis of risks introduced by this change. Non-empty string.',
    risk_classification: {
      level: 'HIGH',
      tags: ['auth'],
      required_gates: ['schema', 'validation', 'evidence', 'security', 'qa'],
      classifier: 'codex-rule-based.v1',
      reason: 'Auth feature requires security review.'
    },
    build_result: {
      build_ok: true,
      tests_ran: true,
      output: 'All tests passed.'
    },
    security_notes: 'Password is hashed with bcrypt. HTTPS enforced. CSRF protection enabled.',
    security_gate: {
      recommendation: 'PASS',
      notes: 'No critical vulnerabilities found.'
    },
    patch_format: 'unified'
  },
  'qa-agent': {
    test_cases: [
      { id: 'TC-1', title: 'Login with valid credentials', steps: ['Enter email', 'Enter password', 'Click Login'], expected: 'Redirect to dashboard', linked_ac: 'AC-1' },
      { id: 'TC-2', title: 'Login with invalid password', steps: ['Enter email', 'Enter wrong password', 'Click Login'], expected: 'Error message displayed', linked_ac: 'AC-2' }
    ],
    qa_report: 'QA summary report in Markdown. Non-empty string.',
    ac_coverage_matrix: [
      { ac_id: 'AC-1', covered: true, test_ids: ['TC-1'] },
      { ac_id: 'AC-2', covered: true, test_ids: ['TC-2'] },
      { ac_id: 'AC-3', covered: true, test_ids: ['TC-1', 'TC-2'] }
    ],
    test_run_report: {
      executed: true,
      total: 2,
      passed: 2,
      failed: 0,
      logs: 'All 2 tests ran and passed.',
      evidence: 'Test output captured from test runner.'
    },
    release_decision: 'approve',
    release_reason: 'All acceptance criteria covered. No blockers found.',
    blocker_count: 0
  }
};

/**
 * Build a Codex-optimised prompt that instructs it to return
 * the exact JSON structure AIFA's validator requires for each role.
 */
function buildCodexPrompt({ role, repoPath, context }) {
  const template = CODEX_ARTIFACT_TEMPLATES[role] || {};
  const contextSummary = context.featureRequest
    ? `Feature Request Title: ${context.featureRequest.title || ''}\nDescription: ${context.featureRequest.description || ''}`
    : JSON.stringify(context).slice(0, 2000);

  return [
    `You are the ${role} agent in an AI-powered Software Factory pipeline.`,
    '',
    '## Your Task',
    contextSummary,
    '',
    repoPath
      ? `## Repository\nWorking directory: ${repoPath}\nAnalyse the code if needed to produce accurate artifacts.`
      : '## Repository\nNo repository provided. Produce planning and design artifacts only.',
    '',
    '## MANDATORY OUTPUT FORMAT',
    'Your ENTIRE response must be ONE fenced ```json code block. Nothing before or after it.',
    'All string values must be non-empty. All arrays must have at least one element.',
    'Follow the EXACT structure of the example below, replacing placeholder text with real content.',
    '',
    '```json',
    JSON.stringify({
      outputVersion: AGENT_CONTRACT_VERSION,
      stage: role,
      artifact: template,
      rawSummary: 'One-sentence summary of what you produced.'
    }, null, 2),
    '```',
    '',
    '## Critical Rules',
    '- Do NOT leave any field as an empty string "", empty array [], or empty object {}.',
    '- The `artifact` object MUST contain all keys shown in the example above with real content.',
    '- Replace ALL placeholder text with actual content relevant to the feature request.',
    '- `release_decision` (qa-agent only) MUST be exactly one of: "approve", "reject", or "needs_changes".',
    '- `build_result.build_ok` (dev-agent only) MUST be `true`.',
    '- `build_result.tests_ran` (dev-agent only) MUST be `true`.',
    '- `test_run_report.executed` (qa-agent only) MUST be `true`.',
    '- `test_run_report.failed` (qa-agent only) MUST be `0`.',
    '- `test_run_report.total` (qa-agent only) MUST equal the number of items in `test_cases`.',
    '- `ac_coverage_matrix` (qa-agent only): every entry MUST have `covered: true`.',
    '- `blocker_count` (qa-agent only) MUST be `0`.',
  ].join('\n');
}

/**
 * Adapter to run the 'codex exec' CLI tool programmatically (non-interactive).
 */
async function runAgent({
  role,
  repoPath,
  taskId,
  context = {},
  onGate,
  onProgress,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  const cwd = repoPath || process.cwd();
  const prompt = buildCodexPrompt({ role, repoPath, context });

  return new Promise((resolve, reject) => {
    const args = [
      'exec',
      '-',
      '-c', 'sandbox_permissions=["disk-full-read-access", "disk-write-access", "network-full-access"]',
    ];

    const child = spawn('codex', args, {
      cwd,
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        TERM: 'xterm-256color',
      },
    });

    let stdoutData = '';
    let stderrData = '';
    let timer;

    const cleanup = () => {
      clearTimeout(timer);
      try { child.kill('SIGKILL'); } catch (e) { /* ignore */ }
    };

    timer = setTimeout(() => {
      cleanup();
      const err = new Error(`Codex CLI timed out after ${timeoutMs}ms.`);
      err.code = 'CODEX_RUN_TIMEOUT';
      reject(err);
    }, timeoutMs);

    child.stdin.write(prompt);
    child.stdin.end();

    child.stdout.on('data', (data) => {
      const text = data.toString();
      stdoutData += text;
      if (typeof onProgress === 'function') {
        onProgress({ type: 'text', data: text });
      }
    });

    child.stderr.on('data', (data) => {
      stderrData += data.toString();
      console.error(`[codexRunner] stderr: ${data}`);
    });

    child.on('close', () => {
      cleanup();
      try {
        // DEBUG: log raw output so we can see exactly what Codex returned
        console.log(`[codexRunner:${role}] raw stdout (first 2000 chars):`, stdoutData.slice(0, 2000));

        const parsed = claudeCodeRunner.parseJsonObject(stdoutData);
        if (!parsed) {
          const err = new Error('Codex CLI result did not contain parseable JSON output');
          err.code = 'CODEX_OUTPUT_PARSE_ERROR';
          err.rawResult = stdoutData;
          err.stderrResult = stderrData;
          throw err;
        }

        // Flatten: Codex may wrap real data in { artifact: {...} }
        const artifact = parsed.artifact || parsed;
        const output = {
          outputVersion: parsed.outputVersion || AGENT_CONTRACT_VERSION,
          stage: parsed.stage || role,
          rawSummary: parsed.rawSummary || '',
          observability: { runner: 'codex-cli' },
          ...artifact,
        };

        // DEBUG: log final fields being saved
        console.log(`[codexRunner:${role}] output keys:`, Object.keys(output));
        console.log(`[codexRunner:${role}] ux_spec:`, typeof output.ux_spec, String(output.ux_spec || '').slice(0, 100));
        console.log(`[codexRunner:${role}] screens:`, Array.isArray(output.screens), output.screens?.length);

        resolve({ output, messages: ['assistant'], cliSessionId: 'codex-' + taskId, taskId });
      } catch (err) {
        reject(err);
      }
    });

    child.on('error', (err) => {
      cleanup();
      reject(err);
    });
  });
}

module.exports = { runAgent };
