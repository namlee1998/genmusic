const { randomUUID } = require('crypto');
jest.mock('uuid', () => ({ v4: () => require('crypto').randomUUID() }));

const prisma = require('../../src/config/database');
const { Task, AgentEvent } = require('../../src/models');
const taskLifecycle = require('../../src/services/taskLifecycleService');

describe('persisted task lifecycle and AgentEvent', () => {
  let projectId;
  let taskId;

  beforeEach(async () => {
    projectId = randomUUID();
    taskId = randomUUID();
    await prisma.project.create({ data: { id: projectId, name: 'Lifecycle test' } });
    await Task.create({ id: taskId, projectId, type: 'po-agent', status: 'pending' });
  });

  afterEach(async () => {
    await Task.deleteById(taskId);
    await prisma.project.delete({ where: { id: projectId } });
  });

  test('persists valid transitions and normalized ordered events', async () => {
    await taskLifecycle.transition(taskId, 'running', { actor: 'po-agent' });
    await taskLifecycle.transition(taskId, 'awaiting_gate', { actor: 'po-agent', payload: { approvalId: 'gate-1' } });
    await taskLifecycle.transition(taskId, 'running', {
      actor: 'human',
      payload: { approvalId: 'gate-1' },
      eventType: 'gate_resolved',
    });
    await taskLifecycle.transition(taskId, 'completed', { actor: 'po-agent' });

    const task = await Task.findById(taskId);
    const events = await AgentEvent.list({ taskId });

    expect(task.executionStatus).toBe('completed');
    expect(task.startedAt).toBeTruthy();
    expect(task.finishedAt).toBeTruthy();
    expect(events.map((event) => event.type)).toEqual([
      'task_queued',
      'task_started',
      'gate_pending',
      'gate_resolved',
      'task_completed',
    ]);
    expect(events.map((event) => event.sequence)).toEqual([1, 2, 3, 4, 5]);
  });

  test('rejects an invalid transition without writing an event', async () => {
    await expect(taskLifecycle.transition(taskId, 'completed')).rejects.toThrow(/Invalid task transition/);
    const events = await AgentEvent.list({ taskId });
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('task_queued');
  });
});
