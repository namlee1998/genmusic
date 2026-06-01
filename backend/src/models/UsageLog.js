const prisma = require('../config/database');

class UsageLogModel {
  static async create({ userId, projectId, taskId, agentType, status, tokenInput, tokenOutput, creditsCharged }) {
    const tokenTotal = (tokenInput || 0) + (tokenOutput || 0);
    const data = await prisma.usageLog.create({
      data: {
        userId,
        projectId: projectId || null,
        taskId: taskId || null,
        agentType,
        status,
        tokenInput: tokenInput || 0,
        tokenOutput: tokenOutput || 0,
        tokenTotal,
        creditsCharged: creditsCharged || 0,
        executedAt: new Date(),
      }
    });
    return this._map(data);
  }

  static async listByUser(userId, { limit = 50, offset = 0 } = {}) {
    const data = await prisma.usageLog.findMany({
      where: { userId },
      orderBy: { executedAt: 'desc' },
      skip: offset,
      take: limit
    });
    return (data || []).map(this._map);
  }

  static async listByUserPaginated(userId, { limit = 50, offset = 0 } = {}) {
    const [data, count] = await Promise.all([
      prisma.usageLog.findMany({
        where: { userId },
        orderBy: { executedAt: 'desc' },
        skip: offset,
        take: limit
      }),
      prisma.usageLog.count({ where: { userId } })
    ]);
    return {
      rows: (data || []).map(this._map),
      count: count || 0,
      limit,
      offset,
    };
  }

  /** Aggregate token & credit totals for a user within a date window. */
  static async sumByUser(userId, since) {
    const data = await prisma.usageLog.findMany({
      where: {
        userId,
        status: 'completed',
        executedAt: { gte: since }
      },
      select: {
        tokenTotal: true,
        creditsCharged: true
      }
    });

    return (data || []).reduce(
      (acc, row) => ({
        tokenTotal: acc.tokenTotal + (row.tokenTotal || 0),
        creditsCharged: acc.creditsCharged + (row.creditsCharged || 0),
      }),
      { tokenTotal: 0, creditsCharged: 0 },
    );
  }

  /** Delete logs older than cutoffDate (90-day retention). */
  static async deleteOlderThan(cutoffDate) {
    await prisma.usageLog.deleteMany({
      where: {
        executedAt: { lt: cutoffDate }
      }
    });
  }

  static _map(row) {
    if (!row) return null;
    return {
      id: row.id,
      userId: row.userId,
      projectId: row.projectId,
      taskId: row.taskId,
      agentType: row.agentType,
      status: row.status,
      tokenInput: row.tokenInput,
      tokenOutput: row.tokenOutput,
      tokenTotal: row.tokenTotal,
      creditsCharged: row.creditsCharged,
      executedAt: row.executedAt,
    };
  }
}

module.exports = UsageLogModel;
