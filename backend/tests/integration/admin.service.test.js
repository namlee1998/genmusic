const mockGetLatestSnapshots = jest.fn();
const mockUsageFindMany = jest.fn();
const mockTaskFindMany = jest.fn();

jest.mock('../../src/services/DashboardService', () => ({
  getLatestSnapshots: mockGetLatestSnapshots,
}));

jest.mock('../../src/config/database', () => ({
  usageLog: { findMany: mockUsageFindMany },
  task: { findMany: mockTaskFindMany },
}));

jest.mock('../../src/config/environment', () => ({
  ADMIN_JWT_SECRET: 'test-secret',
  ADMIN_JWT_EXPIRES_IN: '1h',
}));

const AdminService = require('../../src/services/AdminService');

function queryResult(data) {
  const query = {
    data,
    error: null,
    select: jest.fn(() => query),
    gte: jest.fn(() => query),
    in: jest.fn(() => query),
    eq: jest.fn(() => query),
    order: jest.fn(() => query),
    limit: jest.fn(() => query),
  };
  return query;
}

describe('AdminService stats', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetLatestSnapshots.mockResolvedValue({
      '7d': {
        id: 'snapshot-7d',
        time_window: '7d',
        snapshot_at: '2026-05-12T00:00:00.000Z',
        data: { total_runs: 10 },
      },
    });
  });

  test('returns snapshots plus live metrics and falls invalid windows back to 7d', async () => {
    mockUsageFindMany.mockResolvedValueOnce([
        {
          user_id: 'user-1',
          project_id: 'project-1',
          task_id: 'task-fast',
          agent_type: 'agent_1',
          status: 'completed',
          token_input: 100,
          token_output: 50,
          token_total: 150,
          credits_charged: 2,
        },
        {
          user_id: 'user-2',
          project_id: 'project-2',
          task_id: 'task-slow',
          agent_type: 'agent_1',
          status: 'failed',
          token_input: 25,
          token_output: 0,
          token_total: 25,
          credits_charged: 0,
        },
        {
          user_id: 'user-3',
          project_id: 'project-1',
          task_id: 'task-missing-latency',
          agent_type: 'agent_1',
          status: 'completed',
          token_input: 0,
          token_output: 0,
          token_total: 0,
          credits_charged: 0,
        },
      ]);
    mockTaskFindMany.mockResolvedValueOnce([
        {
          id: 'task-fast',
          project_id: 'project-1',
          type: 'extract-flows',
          status: 'completed',
          updated_at: '2026-05-12T01:00:00.000Z',
          created_at: '2026-05-12T00:59:00.000Z',
          observability: { latency_ms: 100, trace_url: 'https://trace.test/fast', model: 'model-a' },
          source_run_id: null,
        },
        {
          id: 'task-missing-latency',
          project_id: 'project-1',
          type: 'extract-flows',
          status: 'completed',
          updated_at: '2026-05-12T01:01:00.000Z',
          created_at: '2026-05-12T01:00:00.000Z',
          observability: { trace_url: 'https://trace.test/no-latency' },
          source_run_id: null,
        },
        {
          id: 'task-slow',
          project_id: 'project-2',
          type: 'extract-flows',
          status: 'failed',
          error: 'Agent failed',
          updated_at: '2026-05-12T01:02:00.000Z',
          created_at: '2026-05-12T01:00:00.000Z',
          observability: { latency_ms: 300, trace_url: 'https://trace.test/slow', model: 'model-b' },
          source_run_id: 'run-1',
        },
      ]);

    const result = await AdminService.getStats('bad-window');

    expect(result['7d']).toMatchObject({ id: 'snapshot-7d' });
    expect(result.selectedWindow).toBe('7d');
    expect(result.live.window).toBe('7d');
    expect(result.live.tokens).toEqual({ input: 125, output: 50, total: 175 });
    expect(result.live.credits).toBe(2);
    expect(result.live.activeProjects).toBe(2);
    expect(result.live.activeUsers).toBe(3);
    expect(result.live.runsByAgent.agent_1).toMatchObject({
      total: 3,
      success: 2,
      failed: 1,
      failureRate: 33.3,
      successRate: 66.7,
    });
    expect(result.live.latencyByAgent.agent_1).toMatchObject({
      avg: 200,
      p95: 300,
      max: 300,
      sampleCount: 2,
    });
    expect(result.recentFailures).toMatchObject({
      count: 1,
      limit: 10,
      offset: 0,
    });
    expect(result.recentFailures.rows).toEqual([
      expect.objectContaining({
        taskId: 'task-slow',
        projectId: 'project-2',
        type: 'extract-flows',
        label: 'Agent 1',
        error: 'Agent failed',
        latencyMs: 300,
        model: 'model-b',
        traceUrl: 'https://trace.test/slow',
        sourceRunId: 'run-1',
      }),
    ]);
    expect(result.recentTraces).toMatchObject({
      count: 3,
      limit: 10,
      offset: 0,
    });
    expect(result.recentTraces.rows).toHaveLength(3);
  });

  test('paginates recent failures and traces with clamped params', async () => {
    mockUsageFindMany.mockResolvedValueOnce([
        {
          user_id: 'user-1',
          project_id: 'project-1',
          task_id: 'task-a',
          agent_type: 'agent_1',
          status: 'failed',
          token_input: 1,
          token_output: 0,
          token_total: 1,
          credits_charged: 0,
          executed_at: '2026-05-12T01:00:00.000Z',
        },
        {
          user_id: 'user-2',
          project_id: 'project-2',
          task_id: 'task-b',
          agent_type: 'agent_2',
          status: 'failed',
          token_input: 1,
          token_output: 0,
          token_total: 1,
          credits_charged: 0,
          executed_at: '2026-05-12T02:00:00.000Z',
        },
        {
          user_id: 'user-3',
          project_id: 'project-3',
          task_id: 'task-c',
          agent_type: 'agent_3',
          status: 'failed',
          token_input: 1,
          token_output: 0,
          token_total: 1,
          credits_charged: 0,
          executed_at: '2026-05-12T03:00:00.000Z',
        },
      ]);
    mockTaskFindMany.mockResolvedValueOnce([
        {
          id: 'task-a',
          project_id: 'project-1',
          type: 'extract-flows',
          status: 'failed',
          error: 'A failed',
          updated_at: '2026-05-12T01:00:00.000Z',
          created_at: '2026-05-12T00:59:00.000Z',
          observability: { trace_url: 'https://trace.test/a' },
          source_run_id: null,
        },
        {
          id: 'task-b',
          project_id: 'project-2',
          type: 'generate-testcases',
          status: 'failed',
          error: 'B failed',
          updated_at: '2026-05-12T02:00:00.000Z',
          created_at: '2026-05-12T01:59:00.000Z',
          observability: { trace_url: 'https://trace.test/b' },
          source_run_id: null,
        },
        {
          id: 'task-c',
          project_id: 'project-3',
          type: 'generate-automation',
          status: 'failed',
          error: 'C failed',
          updated_at: '2026-05-12T03:00:00.000Z',
          created_at: '2026-05-12T02:59:00.000Z',
          observability: { trace_url: 'https://trace.test/c' },
          source_run_id: null,
        },
      ]);

    const result = await AdminService.getStats('7d', {
      failuresLimit: '2',
      failuresOffset: '1',
      tracesLimit: '-10',
      tracesOffset: '-5',
    });

    expect(result.recentFailures).toMatchObject({ count: 3, limit: 2, offset: 1 });
    expect(result.recentFailures.rows.map((row) => row.taskId)).toEqual(['task-b', 'task-a']);
    expect(result.recentTraces).toMatchObject({ count: 3, limit: 1, offset: 0 });
    expect(result.recentTraces.rows.map((row) => row.taskId)).toEqual(['task-c']);
  });
});
