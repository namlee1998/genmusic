const UserSubscription = require('../models/UserSubscription');
const UsageLog = require('../models/UsageLog');
const Plan = require('../models/Plan');
const supabase = require('../config/database');
const { ApiError } = require('../middleware/errorHandler');

const TOKENS_PER_CREDIT = 1000;
const DEFAULT_PLAN_ID = 'free';

class QuotaService {
  /**
   * Get or auto-provision a subscription for a user.
   * New users who have never been assigned a plan get Free automatically.
   */
  async getOrProvisionSubscription(userId) {
    await Plan.ensureDefaults();
    let sub = await UserSubscription.findByUserId(userId);
    if (!sub) {
      const plan = await Plan.findById(DEFAULT_PLAN_ID);
      if (!plan) throw new Error('Default plan not found');
      sub = await UserSubscription.upsert({
        userId,
        planId: DEFAULT_PLAN_ID,
        creditsTotal: plan.creditsLimit,
      });
    }
    return sub;
  }

  /**
   * Check whether the user has at least 1 credit remaining.
   * Throws ApiError 402 if quota is exceeded or account suspended.
   */
  async checkQuota(userId) {
    const sub = await this.getOrProvisionSubscription(userId);

    if (sub.status === 'suspended') {
      throw new ApiError(403, 'Your account has been suspended. Please contact support.');
    }

    if (sub.creditsRemaining <= 0 || sub.status === 'quota_exceeded') {
      throw new ApiError(402, 'You have used all your credits for this billing period. Please upgrade your plan.');
    }

    return sub;
  }

  /**
   * Record a completed agent run and deduct credits from the subscription.
   * Called after a task reaches "completed" status in WorkflowService.
   *
   * @param {Object} params
   * @param {string} params.userId
   * @param {string} params.projectId
   * @param {string} params.taskId
   * @param {string} params.agentType  — 'agent_1' | 'agent_2' | 'agent_3'
   * @param {number} params.tokenInput  — 0 if Python agent doesn't return counts yet
   * @param {number} params.tokenOutput — 0 if Python agent doesn't return counts yet
   */
  async recordUsage({ userId, projectId, taskId, agentType, tokenInput = 0, tokenOutput = 0 }) {
    const tokenTotal = tokenInput + tokenOutput;
    // Charge at least 1 credit per successful run so usage is always visible even when
    // the Python agent does not yet return token_usage counts.
    const creditsCharged = tokenTotal > 0 ? Math.ceil(tokenTotal / TOKENS_PER_CREDIT) : 1;

    console.log(`[QuotaService] recordUsage — userId=${userId}, agent=${agentType}, credits=${creditsCharged}, task=${taskId}`);

    // Write usage log
    try {
      await UsageLog.create({
        userId,
        projectId,
        taskId,
        agentType,
        status: 'completed',
        tokenInput,
        tokenOutput,
        creditsCharged,
      });
    } catch (err) {
      console.error('[QuotaService] Failed to write usage_log:', err.message);
      throw err;
    }

    // Atomically increment credits_used via Postgres function
    try {
      const updated = await this._incrementCreditsUsed(userId, creditsCharged);
      console.log(`[QuotaService] credits_used updated — used=${updated?.creditsUsed}, total=${updated?.creditsTotal}`);

      // If now over limit, flip status to quota_exceeded
      if (updated && updated.creditsUsed >= updated.creditsTotal) {
        await UserSubscription.updateStatus(userId, 'quota_exceeded');
      }
    } catch (err) {
      // Never block the agent response due to billing side-effects
      console.error('[QuotaService] Failed to increment credits_used:', err.message);
    }
  }

  /**
   * Record a failed agent run (no credits charged, but still logged).
   */
  async recordFailedUsage({ userId, projectId, taskId, agentType }) {
    await UsageLog.create({
      userId,
      projectId,
      taskId,
      agentType,
      status: 'failed',
      tokenInput: 0,
      tokenOutput: 0,
      creditsCharged: 0,
    }).catch((err) =>
      console.error('[QuotaService] Failed to log failed usage:', err.message),
    );
  }

  /**
   * Return quota summary for a user (used by user-facing API).
   */
  async getSummary(userId) {
    const sub = await this.getOrProvisionSubscription(userId);
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const usage30d = await UsageLog.sumByUser(userId, thirtyDaysAgo);

    return {
      planId: sub.planId,
      status: sub.status,
      creditsUsed: sub.creditsUsed,
      creditsTotal: sub.creditsTotal,
      creditsRemaining: sub.creditsRemaining,
      periodStart: sub.periodStart,
      periodEnd: sub.periodEnd,
      usage30d,
    };
  }

  /** Atomic increment via Postgres function to avoid race conditions. */
  async _incrementCreditsUsed(userId, creditsToAdd) {
    const { data, error } = await supabase.rpc('increment_credits_used', {
      p_user_id: userId,
      p_credits: creditsToAdd,
    });
    if (error) throw error;
    return data ? UserSubscription._map(data) : null;
  }
}

module.exports = new QuotaService();
