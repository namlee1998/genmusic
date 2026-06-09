jest.mock('uuid', () => ({ v4: () => 'approval-id' }));

const path = require('path');
const claudePermissionDispatcher = require('../../src/agents/claudePermissionDispatcher');
const claudeCodeRunner = require('../../src/agents/claudeCodeRunner');

describe('Claude Code SDK adapter contracts', () => {
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
