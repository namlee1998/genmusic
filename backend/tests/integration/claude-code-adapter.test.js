jest.mock('uuid', () => ({ v4: () => 'approval-id' }));

const path = require('path');
const claudePermissionDispatcher = require('../../src/agents/claudePermissionDispatcher');
const claudeCodeRunner = require('../../src/agents/claudeCodeRunner');
const gateBridge = require('../../src/services/gateBridge');

describe('Claude Code SDK adapter contracts', () => {
  test('parser finds a valid JSON block after an invalid fenced block', () => {
    const parsed = claudeCodeRunner.parseJsonObject([
      'Draft:',
      '```json',
      '{"prd": "missing closing brace"',
      '```',
      'Final:',
      '```json',
      '{"outputVersion":"agent-io.v3","artifact":{"prd":"# PRD","user_stories":["Story"]}}',
      '```',
    ].join('\n'));

    expect(parsed).toMatchObject({
      outputVersion: 'agent-io.v3',
      artifact: { prd: '# PRD' },
    });
  });

  test('parser prefers the full artifact envelope over a small prose object', () => {
    const parsed = claudeCodeRunner.parseJsonObject([
      'Example metadata: {"status":"draft"}',
      'Final output:',
      '{"outputVersion":"agent-io.v3","stage":"po","artifact":{"prd":"# PRD","scope":"In","out_of_scope":"Out"}}',
    ].join('\n'));

    expect(parsed).toMatchObject({
      outputVersion: 'agent-io.v3',
      stage: 'po',
      artifact: { prd: '# PRD' },
    });
  });

  test('balanced JSON extraction ignores braces inside string values', () => {
    const parsed = claudeCodeRunner.parseJsonObject(
      'Result: {"artifact":{"prd":"Use {tenantId} in the route","scope":"API"}} trailing text',
    );

    expect(parsed.artifact.prd).toContain('{tenantId}');
  });

  test('output repair runs once without any allowed tools', async () => {
    const query = jest.fn(({ options }) => (async function* resultStream() {
      expect(options.allowedTools).toEqual([]);
      expect(options.maxTurns).toBe(3);
      await expect(options.canUseTool('Write', { file_path: 'x' })).resolves.toMatchObject({
        behavior: 'deny',
      });
      yield {
        type: 'result',
        result: '```json\n{"outputVersion":"agent-io.v3","artifact":{"prd":"# Repaired"}}\n```',
      };
    }()));

    const result = await claudeCodeRunner._internal.repairRawOutput({
      query,
      role: 'po-agent',
      rawResult: 'PRD was drafted but JSON formatting failed.',
      cwd: process.cwd(),
    });

    expect(query).toHaveBeenCalledTimes(1);
    expect(claudeCodeRunner.parseJsonObject(result)).toMatchObject({
      artifact: { prd: '# Repaired' },
    });
  });

  test('runner forwards canUseTool context and adapts absolute paths for the UI gate', async () => {
    const onGate = jest.fn(async (_toolName, input) => ({ behavior: 'allow', updatedInput: input }));
    const repoPath = path.resolve('repo');
    const canUseTool = claudeCodeRunner._internal.makeCanUseTool(onGate, repoPath);
    const options = { toolUseID: 'tool-1', title: 'Claude wants to edit src/app.js' };

    await canUseTool('Edit', {
      file_path: path.join(repoPath, 'src', 'app.js'),
      old_string: 'old',
      new_string: 'new',
    }, options);

    expect(onGate).toHaveBeenCalledWith('Edit', expect.objectContaining({
      file_path: path.join('src', 'app.js'),
      diff: expect.stringContaining('+ new'),
    }), options);
  });

  test('tool payload keeps rich SDK data and existing board display fields', () => {
    const payload = claudePermissionDispatcher._internal.toolPayload({
      taskId: 'task-dev',
      role: 'dev-agent',
      toolName: 'Edit',
      input: { file_path: 'src/app.js', diff: '@@ src/app.js\n- old\n+ new' },
      options: { toolUseID: 'tool-1', title: 'Claude wants to edit src/app.js' },
      decision: { category: 'modify_existing', reason: 'Modifying an existing file requires human approval' },
    });

    expect(payload).toMatchObject({
      type: 'tool_permission',
      toolUseID: 'tool-1',
      toolName: 'Edit',
      tool: 'Edit',
      file_path: 'src/app.js',
      diff: expect.stringContaining('+ new'),
      display: { prompt: 'Claude wants to edit src/app.js', filePath: 'src/app.js' },
    });
  });

  test('tool payload remains valid when decision metadata is unavailable', () => {
    const payload = claudePermissionDispatcher._internal.toolPayload({
      taskId: 'task-dev',
      role: 'dev-agent',
      toolName: 'Write',
      input: { file_path: 'src/auth/google.js' },
    });

    expect(payload).toMatchObject({
      category: 'unknown',
      reason: 'Tool action requires approval',
      riskLevel: 'medium',
    });
  });

  test('interactive auth write reaches the approval gate with risk metadata', async () => {
    process.env.CLAUDE_CODE_INTERACTIVE_GATES = 'true';
    const requestGate = jest.spyOn(gateBridge, 'requestGate').mockReturnValue({
      approvalId: 'approval-id',
      ready: Promise.resolve(),
      promise: Promise.resolve({ action: 'approve' }),
    });

    try {
      const result = await claudePermissionDispatcher.dispatch({
        toolName: 'Write',
        input: { file_path: 'src/auth/google.js', content: 'module.exports = {};' },
        taskId: 'task-dev',
        role: 'dev-agent',
        scope: { featurePaths: ['src/', 'tests/', 'docs/'] },
        audit: jest.fn(),
      });

      expect(result.behavior).toBe('allow');
      expect(requestGate).toHaveBeenCalledWith(expect.objectContaining({
        kind: 'tool',
        payload: expect.objectContaining({
          category: 'security',
          reason: expect.stringContaining('auth/security/payment'),
          riskLevel: 'high',
        }),
      }));
    } finally {
      requestGate.mockRestore();
      delete process.env.CLAUDE_CODE_INTERACTIVE_GATES;
    }
  });

  test('question answers use the object shape AskUserQuestion expects', () => {
    const answers = claudePermissionDispatcher._internal.normalizeQuestionAnswers({
      questions: [
        { question: 'Edit file A?' },
        { question: 'Delete file B?' },
      ],
    }, ['yes', 'no']);

    expect(answers).toEqual({ 'Edit file A?': 'yes', 'Delete file B?': 'no' });
  });

  test('non-interactive mode auto-answers questions and auto-allows repo tools', async () => {
    delete process.env.CLAUDE_CODE_INTERACTIVE_GATES;
    const audit = jest.fn();

    const question = await claudePermissionDispatcher.dispatch({
      toolName: 'AskUserQuestion',
      input: { questions: [{ question: 'Which option?', options: [{ label: 'Recommended option' }] }] },
      taskId: 'task-dev',
      role: 'dev-agent',
      audit,
    });
    expect(question).toMatchObject({
      behavior: 'allow',
      updatedInput: { answers: { 'Which option?': 'Recommended option' } },
    });

    const edit = await claudePermissionDispatcher.dispatch({
      toolName: 'Edit',
      input: { file_path: 'src/app.js', old_string: 'a', new_string: 'b' },
      taskId: 'task-dev',
      role: 'dev-agent',
      scope: { featurePaths: ['src/'] },
      audit,
    });
    expect(edit.behavior).toBe('allow');
  });

  test('non-interactive mode still blocks dangerous operations', async () => {
    delete process.env.CLAUDE_CODE_INTERACTIVE_GATES;
    const result = await claudePermissionDispatcher.dispatch({
      toolName: 'Bash',
      input: { command: 'git push origin main' },
      taskId: 'task-dev',
      role: 'dev-agent',
    });
    expect(result).toMatchObject({ behavior: 'deny' });
  });

  test('tool-use execution errors are retryable', () => {
    expect(claudeCodeRunner._internal.isRetryableToolUseError({
      subtype: 'error_during_execution',
      stopReason: 'tool_use',
    })).toBe(true);
  });

  test('runner explicitly uses a generous maxTurns default', () => {
    expect(claudeCodeRunner._internal.DEFAULT_MAX_TURNS).toBeGreaterThanOrEqual(100);
  });

  test('role limits keep DEV and QA runs bounded unless explicitly overridden', () => {
    expect(claudeCodeRunner._internal.maxTurnsForRole('dev-agent')).toBe(200);
    expect(claudeCodeRunner._internal.maxTurnsForRole('qa-agent')).toBe(50);
  });

  test('DEV context excludes unrelated upstream artifacts', () => {
    const compact = claudeCodeRunner._internal.compactContext('dev-agent', {
      prd: [{ content: '# PRD' }],
      ux_spec: [{ content: '# UX' }],
      qa_report: [{ content: 'irrelevant and potentially huge' }],
      a2a_handoff: [{ content: { noisy: true } }],
    });

    expect(compact).toEqual({
      prd: [{ content: '# PRD' }],
      ux_spec: [{ content: '# UX' }],
    });
  });

  test('normalizer promotes valid nested DEV security evidence to contract fields', () => {
    const output = claudeCodeRunner.normalizeOutput('dev-agent', {
      artifact: {
        implementation_plan: '# Plan',
        patch_diff: 'diff --git a/a b/a',
        changed_files: ['a'],
        sandbox_result: { tests_ran: true, build_ok: true },
        self_test_report: '19 tests passed',
        linked_ac_ids: ['AC-1'],
        risk_assessment: 'High-risk authentication change',
        risk_classification: {
          level: 'HIGH',
          required_gates: ['security'],
          security_notes: 'State and token validation implemented.',
          security_gate: { recommendation: 'PASS' },
        },
      },
    });

    expect(output.security_notes).toContain('token validation');
    expect(output.security_gate).toEqual({ recommendation: 'PASS' });
    expect(output.patch_format).toBe('unified_diff');
  });

  test('normalizer rejects required fields that are present but empty', () => {
    expect(() => claudeCodeRunner.normalizeOutput('ux-agent', {
      outputVersion: 'agent-io.v3',
      artifact: {
        ux_spec: '# Login design',
        user_flow: [],
        wireframe_spec: '',
        screens: [],
        component_inventory: [],
      },
    })).toThrow(/empty: user_flow, wireframe_spec, screens, component_inventory/);
  });
});
