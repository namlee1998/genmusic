// Persisted execution-state machine for one Task.
//
// Beginner reading guide: transition() validates the state edge, updates Task,
// and appends an ordered AgentEvent in the same database transaction. Workflow
// phases such as PO_REVIEW are derived elsewhere from these task states.

const prisma = require('../config/database');
const logger = require('../config/logger');

const TERMINAL = new Set(['completed', 'failed', 'cancelled', 'timeout']);
const TRANSITIONS = {
  queued: new Set(['dispatched', 'running', 'cancelled']),
  dispatched: new Set(['running', 'cancelled', 'timeout']),
  running: new Set(['awaiting_gate', 'completed', 'failed', 'cancelled', 'timeout']),
  awaiting_gate: new Set(['running', 'failed', 'cancelled', 'timeout']),
  completed: new Set(),
  failed: new Set(),
  cancelled: new Set(),
  timeout: new Set(),
};

const EVENT_BY_STATUS = {
  queued: 'task_queued',
  dispatched: 'task_dispatched',
  running: 'task_started',
  awaiting_gate: 'gate_pending',
  completed: 'task_completed',
  failed: 'task_failed',
  cancelled: 'task_cancelled',
  timeout: 'task_timeout',
};

async function appendEvent(tx, task, type, actor, payload) {
  const latest = await tx.agentEvent.findFirst({
    where: { taskId: task.id },
    orderBy: { sequence: 'desc' },
    select: { sequence: true },
  });
  return tx.agentEvent.create({
    data: {
      taskId: task.id,
      projectId: task.projectId,
      sequence: (latest?.sequence || 0) + 1,
      type,
      actor,
      payload: JSON.stringify(payload || {}),
    },
  });
}

async function transition(taskId, nextStatus, {
  actor = 'system',
  reason = null,
  payload = {},
  eventType = null,
} = {}) {
  return prisma.$transaction(async (tx) => {
    const task = await tx.task.findUnique({ where: { id: taskId } });
    if (!task) throw new Error(`Task not found: ${taskId}`);

    const current = task.executionStatus || 'queued';
    if (current === nextStatus) return task;
    if (!TRANSITIONS[current]?.has(nextStatus)) {
      throw new Error(`Invalid task transition: ${current} -> ${nextStatus}`);
    }

    const now = new Date();
    const updated = await tx.task.update({
      where: { id: taskId },
      data: {
        executionStatus: nextStatus,
        ...(nextStatus === 'running' && !task.startedAt ? { startedAt: now } : {}),
        ...(TERMINAL.has(nextStatus) ? { finishedAt: now } : {}),
      },
    });
    await appendEvent(tx, updated, eventType || EVENT_BY_STATUS[nextStatus] || 'task_transitioned', actor, {
      from: current,
      to: nextStatus,
      ...(reason ? { reason } : {}),
      ...payload,
    });
    return updated;
  });
}

async function record(taskId, type, { actor = 'system', payload = {} } = {}) {
  return prisma.$transaction(async (tx) => {
    const task = await tx.task.findUnique({ where: { id: taskId } });
    if (!task) throw new Error(`Task not found: ${taskId}`);
    return appendEvent(tx, task, type, actor, payload);
  });
}

async function transitionIfPresent(taskId, nextStatus, options = {}) {
  try {
    return await transition(taskId, nextStatus, options);
  } catch (error) {
    if (error.message.startsWith('Task not found:')) {
      logger.warn('task lifecycle transition skipped for missing task', { taskId, nextStatus });
      return null;
    }
    throw error;
  }
}

module.exports = {
  TRANSITIONS,
  transition,
  transitionIfPresent,
  record,
};
