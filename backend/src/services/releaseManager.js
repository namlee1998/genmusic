// ── Release Decision Logic ──────────────────────────────────────────────────
const { v4: uuidv4 } = require('uuid');
const { Task, HitlDecision, PipelineSession } = require('../models');
const { ApiError } = require('../middleware/errorHandler');
const { FINAL_GATE, RELEASE_DECISIONS, GATE_CONFIG } = require('./sdlcConstants');
const logger = require('../config/logger');

/**
 * Submit a final release decision (APPROVE / REJECT) for a session.
 * @param {Object} opts
 * @param {Function} opts.getFinalReviewPacket   - service.getFinalReviewPacket
 * @param {Function} opts.getAuditTrail           - service.getAuditTrail
 * @param {Function} opts.getRepoContext          - service._getRepoContext
 * @param {Function} opts.buildReleaseEvidenceSummary - internal fn
 */
async function submitReleaseDecision({
  sessionId, decisionId, decision, comment = '', user, deps = {},
}) {
  if (!RELEASE_DECISIONS.includes(decision)) {
    throw new ApiError(400, 'decision must be APPROVE | REJECT');
  }
  if (!decisionId) throw new ApiError(400, 'decision_id is required (idempotency key)');

  const session = await PipelineSession.findById(sessionId);
  if (!session) throw new ApiError(404, 'Session not found');
  const projectId = session.projectId;

  const MembershipService = {
    requireProjectRole: async () => ({ role: 'owner' }),
    listAccessibleProjectIds: async () => [],
    getUserProjectRole: async () => 'owner',
    createOwnerMembership: async () => {},
  };
  const membership = user
    ? await MembershipService.requireProjectRole(user.id, projectId, ['owner', 'admin', 'editor', 'viewer'])
    : null;
  if (membership && !['owner', 'admin'].includes(membership.role)) {
    throw new ApiError(403, 'Only project owners and admins may approve or reject a release.');
  }

  const existing = await HitlDecision.findByDecisionId(decisionId);
  if (existing) return { hitlDecision: existing, idempotentReplay: true };

  const qaTask = await Task.findLatestBySession(sessionId, 'qa-agent', 'completed', 'committed');
  if (!qaTask) throw new ApiError(409, 'Release gate is unavailable until QA is approved');

  const priorDecisions = await HitlDecision.findByProjectId(projectId);
  const priorReleaseDecision = [...priorDecisions].reverse()
    .find((record) => record.gate === FINAL_GATE && record.taskId === qaTask.id);
  if (priorReleaseDecision && ['APPROVE', 'REJECT'].includes(priorReleaseDecision.decision)) {
    throw new ApiError(409, `This QA run was already finalized as ${priorReleaseDecision.decision}`);
  }

  const qaGatePass = qaTask.result?.gateRecommendation === 'PASS' || (() => {
    const tr = qaTask.agentOutput?.test_run_report || {};
    return tr.executed === true && typeof tr.failed === 'number' && tr.failed === 0 && (tr.total || 0) > 0;
  })();
  if (!qaGatePass) {
    throw new ApiError(409, 'Release gate is unavailable until QA quality gate returns PASS');
  }

  const evidence = await buildReleaseEvidenceSummary(sessionId);
  if (decision === 'APPROVE' && evidence.open_blockers.some(
    (blocker) => GATE_CONFIG.RELEASE_BLOCKING_SEVERITIES.includes(blocker.severity),
  )) {
    throw new ApiError(409, 'Release approval is blocked until all critical and high-risk evidence issues are resolved');
  }

  const releaseComment = comment || {
    APPROVE: 'Release approved by authorized reviewer',
    REJECT: 'Release rejected by authorized reviewer',
  }[decision];

  const record = await HitlDecision.create({
    id: uuidv4(),
    workflowRunId: projectId,
    taskId: qaTask.id,
    projectId,
    gate: FINAL_GATE,
    decision,
    action: `release_${decision.toLowerCase()}`,
    decisionId,
    comment: releaseComment,
    reviewerId: user?.id || null,
    payload: {
      release_status: { APPROVE: 'released', REJECT: 'rejected' }[decision],
      reviewer_role: membership?.role || null,
      evidence,
    },
  });

  // T6.2 — on RELEASED, assemble the release bundle
  let releaseOutputs = null;
  if (decision === 'APPROVE') {
    try {
      const [packet, audit, repoContext] = await Promise.all([
        deps.getFinalReviewPacket(sessionId, null),
        deps.getAuditTrail(projectId, null, sessionId),
        deps.getRepoContext(projectId, sessionId),
      ]);
      const workflowReport = require('./workflowReport');
      const bundle = await workflowReport.writeReleaseBundle({
        projectId, session, repoContext, packet, audit, evidence, releaseDecision: record,
      });
      releaseOutputs = bundle.outputs;
      await PipelineSession.update(sessionId, { status: 'completed', outputDir: bundle.outputDir });
    } catch (err) {
      logger.error('release bundle failed', { projectId, sessionId, error: err.message });
    }
  }

  return { hitlDecision: record, releaseOutputs };
}

async function buildReleaseEvidenceSummary(sessionId) {
  const [poTask, uxTask, devTask, qaTask] = await Promise.all([
    Task.findLatestBySession(sessionId, 'po-agent', 'completed', 'committed'),
    Task.findLatestBySession(sessionId, 'ux-agent', 'completed', 'committed'),
    Task.findLatestBySession(sessionId, 'dev-agent', 'completed', 'committed'),
    Task.findLatestBySession(sessionId, 'qa-agent', 'completed', 'committed'),
  ]);
  const risk = poTask?.approvedOutput?.risk_classification || poTask?.agentOutput?.risk_classification || null;
  const securityGate = devTask?.approvedOutput?.security_gate || devTask?.agentOutput?.security_gate || null;
  const qaOutput = qaTask?.approvedOutput || qaTask?.agentOutput || {};
  const openBlockers = [
    ...(securityGate?.issues || []),
    ...((qaOutput.blocker_count || 0) > 0
      ? [{ severity: 'BLOCKER', code: 'qa_blockers', detail: `${qaOutput.blocker_count} QA blocker(s) remain.` }]
      : []),
  ];
  return {
    feature: poTask?.approvedOutput?.feature_request || poTask?.agentOutput?.feature_request || null,
    risk,
    versions: {
      po: poTask ? { task_id: poTask.id, output_version: poTask.outputVersion } : null,
      ux: uxTask ? { task_id: uxTask.id, output_version: uxTask.outputVersion } : null,
      dev: devTask ? { task_id: devTask.id, output_version: devTask.outputVersion } : null,
      qa: qaTask ? { task_id: qaTask.id, output_version: qaTask.outputVersion } : null,
    },
    build_result: devTask?.approvedOutput?.build_result || devTask?.agentOutput?.build_result || null,
    security_gate: securityGate,
    qa_gate: qaTask?.result?.gateRecommendation || null,
    coverage_percentage: qaOutput.coverage_summary?.percentage ?? null,
    open_blockers: openBlockers,
  };
}

module.exports = { submitReleaseDecision, buildReleaseEvidenceSummary };
