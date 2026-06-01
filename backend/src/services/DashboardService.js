const prisma = require('../config/database');

const TIME_WINDOWS = ['1d', '7d', '30d'];

function windowToMs(window) {
  const days = parseInt(window, 10);
  return days * 24 * 60 * 60 * 1000;
}

class DashboardService {
  async computeSnapshot(timeWindow) {
    const since = new Date(Date.now() - windowToMs(timeWindow)).toISOString();

    const [
      usersResult,
      subscriptionsResult,
      activeUsersResult,
      runsResult,
      creditsResult,
      runsByAgentResult,
    ] = await Promise.all([
      // Total users with subscriptions
      prisma.userSubscription.count(),

      // Users by plan and status breakdown
      prisma.userSubscription.findMany({
        select: { planId: true, status: true },
      }),

      // Active users in window (distinct user_ids that ran an agent)
      prisma.usageLog.findMany({
        where: { executedAt: { gte: new Date(since) } },
        select: { userId: true },
        distinct: ['userId'],
      }),

      // Total runs in window
      prisma.usageLog.count({
        where: { executedAt: { gte: new Date(since) } },
      }),

      // Credits charged in window
      prisma.usageLog.findMany({
        where: { status: 'completed', executedAt: { gte: new Date(since) } },
        select: { creditsCharged: true },
      }),

      // Runs by agent in window
      prisma.usageLog.findMany({
        where: { executedAt: { gte: new Date(since) } },
        select: { agentType: true, status: true },
      }),
    ]);

    const subs = subscriptionsResult || [];
    const usersByPlan = subs.reduce((acc, s) => {
      acc[s.planId] = (acc[s.planId] || 0) + 1;
      return acc;
    }, {});
    const quotaExceededUsers = subs.filter((s) => s.status === 'quota_exceeded').length;
    const suspendedUsers = subs.filter((s) => s.status === 'suspended').length;

    const activeUserIds = new Set((activeUsersResult || []).map((r) => r.userId));

    const allRuns = runsByAgentResult || [];
    const runsByAgent = allRuns.reduce((acc, r) => {
      acc[r.agent_type] = (acc[r.agent_type] || 0) + 1;
      return acc;
    }, {});
    const successfulRuns = allRuns.filter((r) => r.status === 'completed').length;
    const failedRuns = allRuns.filter((r) => r.status === 'failed').length;

    const totalCredits = (creditsResult || []).reduce(
      (sum, r) => sum + (r.creditsCharged || 0),
      0,
    );

    return {
      total_users: usersResult || 0,
      active_users: activeUserIds.size,
      quota_exceeded_users: quotaExceededUsers,
      suspended_users: suspendedUsers,
      users_by_plan: usersByPlan,
      total_runs: allRuns.length,
      successful_runs: successfulRuns,
      failed_runs: failedRuns,
      total_credits: totalCredits,
      runs_by_agent: runsByAgent,
    };
  }

  async runBatch() {
    console.log('[DashboardService] Running batch snapshot...');
    const now = new Date();

    for (const window of TIME_WINDOWS) {
      try {
        const data = await this.computeSnapshot(window);
        await prisma.dashboardSnapshot.upsert({
          where: { date: new Date(now.setHours(0,0,0,0)) }, // approximate replacement for onConflict
          update: { metrics: JSON.stringify(data) },
          create: { date: new Date(now.setHours(0,0,0,0)), metrics: JSON.stringify(data) },
        });
        console.log(`[DashboardService] Snapshot saved: ${window}`);
      } catch (err) {
        console.error(`[DashboardService] Error computing snapshot (${window}):`, err.message);
      }
    }

    // Clean up usage_logs older than 90 days
    try {
      const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      await prisma.usageLog.deleteMany({
        where: { executedAt: { lt: cutoff } }
      });
      console.log('[DashboardService] Old usage logs cleaned up.');
    } catch (err) {
      console.error('[DashboardService] Cleanup error:', err.message);
    }
  }

  async getLatestSnapshots() {
    const results = {};
    for (const window of TIME_WINDOWS) {
      try {
        const data = await prisma.dashboardSnapshot.findFirst({
          orderBy: { createdAt: 'desc' }
        });
        if (data) results[window] = JSON.parse(data.metrics);
      } catch (err) {
        console.error(err);
      }
    }
    return results;
  }
}

module.exports = new DashboardService();
