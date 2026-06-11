// AIFA PHASE 8 (T8.2) — unit coverage for the new claude-code path building
// blocks that do NOT need the DB: risk classifier tiers, gate bridge
// idempotency + watchdog, repo safety helpers, PO route classification, and
// the three-layer validation summary.

// uuid v14 is ESM-only; mock it with a unique counter so each id stays distinct.
jest.mock('uuid', () => { let n = 0; return { v4: () => `uuid-${++n}` }; });

const riskClassifier = require('../../src/services/riskClassifier');
const gateBridge = require('../../src/services/gateBridge');
const repoService = require('../../src/services/repoService');

beforeAll(() => { process.env.MOCK_SCENARIO = 'happy_path'; });
afterAll(() => { delete process.env.MOCK_SCENARIO; });
afterEach(() => gateBridge._clearAll());

describe('T2.1 — riskClassifier tiers', () => {
  const cases = [
    ['Write', { file_path: 'tests/auth.test.js' }, 'auto'],
    ['Write', { file_path: 'docs/readme.md' }, 'auto'],
    ['Write', { file_path: 'src/feature/new.js', is_new: true }, 'auto'],
    ['Write', { file_path: 'src/auth/google.js' }, 'approval'],
    ['Write', { file_path: 'config/settings.js' }, 'approval'],
    ['Write', { file_path: 'prisma/migrations/x.sql' }, 'approval'],
    ['Write', { file_path: 'package.json' }, 'approval'],
    ['Delete', { file_path: 'src/old.js' }, 'approval'],
    ['Write', { file_path: '../outside.js' }, 'block'],
    ['Edit', { file_path: '.env' }, 'block'],
  ];
  test.each(cases)('%s %o → %s', (tool, input, tier) => {
    expect(riskClassifier.classifyAction(tool, input, { featurePaths: ['src/', 'tests/', 'docs/'] }).tier).toBe(tier);
  });

  test('git push to main is blocked', () => {
    expect(riskClassifier.classifyAction('Bash', { command: 'git push origin main' }, {}).tier).toBe('block');
  });
});

describe('T2.2 — gateBridge idempotency + watchdog', () => {
  test('requestGate suspends, resolveGate wakes exactly once', async () => {
    const { approvalId, promise, ready } = gateBridge.requestGate({ taskId: 't', role: 'dev-agent', kind: 'tool', payload: {} });
    await ready;
    expect(gateBridge.hasPending(approvalId)).toBe(true);
    await expect(gateBridge.resolveGate(approvalId, { action: 'approve' })).resolves.toBe(true);
    // second resolve is a no-op (no double action)
    await expect(gateBridge.resolveGate(approvalId, { action: 'approve' })).resolves.toBe(false);
    expect(gateBridge.hasPending(approvalId)).toBe(false);
    await expect(promise).resolves.toEqual({ action: 'approve' });
  });

  test('watchdog auto-rejects an unanswered gate', async () => {
    const { promise } = gateBridge.requestGate({ taskId: 't', role: 'dev-agent', kind: 'tool', payload: {}, timeoutMs: 50 });
    const result = await promise;
    expect(result.timedOut).toBe(true);
    expect(result.action).toBe('reject');
  });

  test('listPending filters by task', () => {
    gateBridge.requestGate({ taskId: 'a', role: 'po-agent', kind: 'question', payload: {} });
    gateBridge.requestGate({ taskId: 'b', role: 'dev-agent', kind: 'tool', payload: {} });
    expect(gateBridge.listPending({ taskId: 'a' })).toHaveLength(1);
    expect(gateBridge.listPending({})).toHaveLength(2);
  });

  test('gate_pending is pushed directly to task subscribers after persistence', async () => {
    const events = [];
    const unsubscribe = gateBridge.subscribe('task-live', (event, data) => events.push({ event, data }));
    const { ready } = gateBridge.requestGate({ taskId: 'task-live', role: 'dev-agent', kind: 'tool', payload: { file_path: 'src/a.js' } });
    await ready;
    unsubscribe();

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      event: 'gate_pending',
      data: { taskId: 'task-live', role: 'dev-agent', kind: 'tool', status: 'pending' },
    });
  });

  test('pipeline lock only detects human question gates', () => {
    const svc = require('../../src/services/SdlcWorkflowService');
    gateBridge.requestGate({ taskId: 'tool', projectId: 'p', role: 'dev-agent', kind: 'tool', payload: {} });
    expect(svc._getPendingQuestionGate('p')).toBeNull();

    gateBridge.requestGate({ taskId: 'question', projectId: 'p', role: 'po-agent', kind: 'question', payload: {} });
    expect(svc._getPendingQuestionGate('p')).toMatchObject({
      taskId: 'question',
      role: 'po-agent',
      kind: 'question',
    });
  });
});

describe('T1.3 — repo safety helpers', () => {
  test('secret-like paths are blocked from reads', () => {
    expect(repoService.isBlockedPath('.env')).toBe(true);
    expect(repoService.isBlockedPath('config/id_rsa')).toBe(true);
    expect(repoService.isBlockedPath('certs/server.pem')).toBe(true);
    expect(repoService.isBlockedPath('src/index.js')).toBe(false);
  });
  test('path traversal stays out of the repo', () => {
    expect(repoService.isWithinRepo('/repo', 'src/a.js')).toBe(true);
    expect(repoService.isWithinRepo('/repo', '../../etc/passwd')).toBe(false);
  });
  test('slugify produces a branch-safe slug', () => {
    expect(repoService.slugify('Add Google Login!')).toBe('add-google-login');
  });
});

describe('T4.1 / T5.1 — route classification + three-layer validation', () => {
  const svc = require('../../src/services/SdlcWorkflowService');

  test('po next-agent honours the route', () => {
    expect(svc._nextAgentFor({ type: 'po-agent', observability: { route: { has_ui: true } } })).toBe('ux-agent');
    expect(svc._nextAgentFor({ type: 'po-agent', observability: { route: { has_ui: false } } })).toBe('dev-agent');
  });

  test('workflow status never pairs a stale QA task with the current DEV task', () => {
    const tasks = [
      { id: 'dev-new', type: 'dev-agent', sourceRunId: 'ux-new' },
      { id: 'qa-old', type: 'qa-agent', sourceRunId: 'dev-old' },
      { id: 'ux-new', type: 'ux-agent', sourceRunId: 'po-new' },
      { id: 'dev-old', type: 'dev-agent', sourceRunId: 'ux-old' },
      { id: 'po-new', type: 'po-agent' },
    ];

    expect(svc._selectCurrentTaskChain(tasks)).toMatchObject({
      poTask: { id: 'po-new' },
      uxTask: { id: 'ux-new' },
      devTask: { id: 'dev-new' },
      qaTask: null,
    });

    tasks.unshift({ id: 'qa-new', type: 'qa-agent', sourceRunId: 'dev-new' });
    expect(svc._selectCurrentTaskChain(tasks).qaTask).toMatchObject({ id: 'qa-new' });
  });

  test('completed QA waits for human review before final release', () => {
    const po = { id: 'po', type: 'po-agent', status: 'completed' };
    const ux = { id: 'ux', type: 'ux-agent', status: 'completed' };
    const dev = { id: 'dev', type: 'dev-agent', status: 'completed' };
    const qa = { id: 'qa', type: 'qa-agent', status: 'completed' };
    const approvedUpstream = {
      po: { decision: 'APPROVE' },
      ux: { decision: 'APPROVE' },
      dev: { decision: 'APPROVE' },
    };

    expect(svc._deriveCurrentPhase(po, ux, dev, qa, approvedUpstream)).toBe('QA_REVIEW');
  });

  test('layer 2 catches non-testable AC as a BLOCKER', () => {
    const summary = svc._threeLayerSummary({ type: 'po-agent' }, { prd: 'x', acceptance_criteria: ['a', 'b'] });
    expect(summary.semantic.ok).toBe(false);
    expect(summary.semantic.violations.map((v) => v.rule)).toContain('ac_testable');
  });

  test('a complete PO output passes all three layers', async () => {
    const out = await svc._buildMockOutput({ id: 't', type: 'po-agent' }, { featureRequest: { title: 'Add Google login', description: 'OAuth 2.0 sign-in' } });
    const summary = svc._threeLayerSummary({ type: 'po-agent' }, out);
    expect(summary.ok).toBe(true);
  });
});
