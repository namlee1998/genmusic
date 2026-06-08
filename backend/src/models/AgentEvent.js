const prisma = require('../config/database');

function parseJson(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch (_) {
    return fallback;
  }
}

class AgentEventModel {
  static async create({ taskId, projectId, type, actor = 'system', payload = {} }) {
    return prisma.$transaction(async (tx) => {
      const latest = await tx.agentEvent.findFirst({
        where: { taskId },
        orderBy: { sequence: 'desc' },
        select: { sequence: true },
      });
      const row = await tx.agentEvent.create({
        data: {
          taskId,
          projectId,
          sequence: (latest?.sequence || 0) + 1,
          type,
          actor,
          payload: JSON.stringify(payload || {}),
        },
      });
      return this._map(row);
    });
  }

  static async list({ taskId = null, projectId = null, afterSequence = null, limit = 200 } = {}) {
    const rows = await prisma.agentEvent.findMany({
      where: {
        ...(taskId ? { taskId } : {}),
        ...(projectId ? { projectId } : {}),
        ...(taskId && Number.isFinite(afterSequence) ? { sequence: { gt: afterSequence } } : {}),
      },
      orderBy: taskId ? { sequence: 'asc' } : { createdAt: 'asc' },
      take: Math.max(1, Math.min(Number(limit) || 200, 500)),
    });
    return rows.map(this._map);
  }

  static _map(row) {
    return {
      id: row.id,
      taskId: row.taskId,
      projectId: row.projectId,
      sequence: row.sequence,
      type: row.type,
      actor: row.actor,
      payload: parseJson(row.payload),
      createdAt: row.createdAt,
    };
  }
}

module.exports = AgentEventModel;
