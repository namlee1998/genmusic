const prisma = require('../config/database');

/**
 * HitlDecision — Human-in-the-Loop quality gate decisions.
 * Maps 1:1 with a task (one gate per agent phase).
 *
 * gate values: REQUIREMENT_GATE | UX_GATE | DEV_GATE | QA_GATE | FINAL_GATE
 * decision values: APPROVE | REJECT | REQUEST_CHANGES
 */
class HitlDecisionModel {
  static async create(data) {
    const record = await prisma.hitlDecision.create({
      data: {
        id: data.id,
        workflowRunId: data.workflowRunId || data.workflow_run_id,
        taskId: data.taskId || data.task_id,
        projectId: data.projectId || data.project_id,
        gate: data.gate,
        decision: data.decision,
        comment: data.comment || null,
        reviewerId: data.reviewerId || data.reviewer_id || null,
        // Structured HITL + append-only audit
        decisionId: data.decisionId || null,
        action: data.action || null,
        baseOutputVersion: data.baseOutputVersion ?? null,
        retryReason: data.retryReason || null,
        jsonPatch: data.jsonPatch === undefined ? null
          : (typeof data.jsonPatch === 'string' ? data.jsonPatch : JSON.stringify(data.jsonPatch)),
        payload: data.payload === undefined ? null
          : (typeof data.payload === 'string' ? data.payload : JSON.stringify(data.payload)),
      }
    });
    return this._map(record);
  }

  static async findByDecisionId(decisionId) {
    if (!decisionId) return null;
    const data = await prisma.hitlDecision.findUnique({ where: { decisionId } });
    return this._map(data);
  }

  static async findByTaskId(taskId) {
    const data = await prisma.hitlDecision.findFirst({
      where: { taskId },
      orderBy: { createdAt: 'desc' }
    });
    return this._map(data);
  }

  static async findByProjectId(projectId) {
    const data = await prisma.hitlDecision.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' }
    });
    return (data || []).map(this._map);
  }

  static async findLatestByWorkflowRunId(workflowRunId) {
    const data = await prisma.hitlDecision.findMany({
      where: { workflowRunId },
      orderBy: { createdAt: 'asc' }
    });
    return (data || []).map(this._map);
  }

  static _map(row) {
    if (!row) return null;
    let jsonPatch = null;
    let payload = null;
    try { jsonPatch = row.jsonPatch ? JSON.parse(row.jsonPatch) : null; } catch (_) { jsonPatch = null; }
    try { payload = row.payload ? JSON.parse(row.payload) : null; } catch (_) { payload = null; }
    return {
      id: row.id,
      workflowRunId: row.workflowRunId,
      taskId: row.taskId,
      projectId: row.projectId,
      gate: row.gate,
      decision: row.decision,
      comment: row.comment,
      reviewerId: row.reviewerId,
      decisionId: row.decisionId || null,
      action: row.action || null,
      baseOutputVersion: row.baseOutputVersion ?? null,
      retryReason: row.retryReason || null,
      jsonPatch,
      payload,
      createdAt: row.createdAt,
    };
  }
}

module.exports = HitlDecisionModel;
