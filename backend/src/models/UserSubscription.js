const prisma = require('../config/database');

const TOKENS_PER_CREDIT = 1000;

class UserSubscriptionModel {
  static get TOKENS_PER_CREDIT() { return TOKENS_PER_CREDIT; }

  static async findByUserId(userId) {
    const data = await prisma.userSubscription.findUnique({
      where: { userId }
    });
    return this._map(data);
  }

  static async upsert({ userId, planId, creditsTotal, periodStart, periodEnd = null }) {
    const data = await prisma.userSubscription.upsert({
      where: { userId },
      update: {
        planId,
        creditsTotal,
        periodStart: periodStart ? new Date(periodStart) : new Date(),
        periodEnd: periodEnd ? new Date(periodEnd) : null,
      },
      create: {
        userId,
        planId,
        creditsTotal,
        creditsUsed: 0,
        status: 'active',
        periodStart: periodStart ? new Date(periodStart) : new Date(),
        periodEnd: periodEnd ? new Date(periodEnd) : null,
      }
    });
    return this._map(data);
  }

  /**
   * Atomically increment credits_used.
   * Returns the updated row, or null if user has no subscription.
   */
  static async incrementCreditsUsed(userId, creditsToAdd) {
    try {
      const data = await prisma.userSubscription.update({
        where: { userId },
        data: {
          creditsUsed: { increment: creditsToAdd }
        }
      });
      return this._map(data);
    } catch (e) {
      if (e.code === 'P2025') return null; // Not found
      throw e;
    }
  }

  static async updateStatus(userId, status) {
    const data = await prisma.userSubscription.update({
      where: { userId },
      data: { status }
    });
    return this._map(data);
  }

  static async assignPlan(userId, planId, creditsTotal, periodEnd = null) {
    const data = await prisma.userSubscription.upsert({
      where: { userId },
      update: {
        planId,
        creditsTotal,
        creditsUsed: 0,
        status: 'active',
        periodStart: new Date(),
        periodEnd: periodEnd ? new Date(periodEnd) : null,
      },
      create: {
        userId,
        planId,
        creditsTotal,
        creditsUsed: 0,
        status: 'active',
        periodStart: new Date(),
        periodEnd: periodEnd ? new Date(periodEnd) : null,
      }
    });
    return this._map(data);
  }

  static _map(row) {
    if (!row) return null;
    return {
      id: row.id,
      userId: row.userId,
      planId: row.planId,
      status: row.status,
      creditsUsed: row.creditsUsed,
      creditsTotal: row.creditsTotal,
      creditsRemaining: row.creditsTotal - row.creditsUsed,
      periodStart: row.periodStart,
      periodEnd: row.periodEnd,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}

module.exports = UserSubscriptionModel;
