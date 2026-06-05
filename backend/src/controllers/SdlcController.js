const SdlcWorkflowService = require('../services/SdlcWorkflowService');

// Demo scenarios exposed by the dev-only scenario selector endpoint.
const MOCK_SCENARIOS = ['happy_path', 'low_confidence_hold', 'missing_evidence', 'qa_blocker', 'release_reject', 'escalation'];
const DEFAULT_MOCK_SCENARIO = 'happy_path';

class SdlcController {
  // ─── IntentGate ──────────────────────────────────────────────────────────

  async runIntentAgent(req, res, next) {
    try {
      const { project_id, feature_request, feedback_prompt, backlog_id } = req.body;
      if (!project_id) return res.status(400).json({ status: 'error', message: 'project_id is required' });
      if (!feature_request || !feature_request.title) {
        return res.status(400).json({ status: 'error', message: 'feature_request.title is required' });
      }

      const task = await SdlcWorkflowService.runIntentAgent({
        projectId: project_id,
        featureRequest: feature_request,
        feedbackPrompt: feedback_prompt || '',
        backlogId: backlog_id || null,
        user: req.user,
      });

      return res.status(202).json({ task_id: task.id, status: task.status, type: task.type });
    } catch (err) { next(err); }
  }

  // ─── Run Agents ──────────────────────────────────────────────────────────

  async runPOAgent(req, res, next) {
    try {
      const { project_id, source_task_id, feature_request, feedback_prompt, backlog_id } = req.body;
      if (!source_task_id && (!project_id || !feature_request?.title)) {
        return res.status(400).json({
          status: 'error',
          message: 'Provide source_task_id for legacy flow or project_id with feature_request.title for the v4 PO-first flow',
        });
      }

      const task = await SdlcWorkflowService.runPOAgent({
        projectId: project_id,
        sourceTaskId: source_task_id,
        featureRequest: feature_request,
        feedbackPrompt: feedback_prompt || '',
        backlogId: backlog_id || null,
        user: req.user,
      });

      return res.status(202).json({ task_id: task.id, status: task.status, type: task.type });
    } catch (err) { next(err); }
  }

  async runUXAgent(req, res, next) {
    try {
      const { source_task_id, feedback_prompt } = req.body;
      if (!source_task_id) return res.status(400).json({ status: 'error', message: 'source_task_id is required' });

      const task = await SdlcWorkflowService.runUXAgent({
        projectId: req.body.project_id,
        sourceTaskId: source_task_id,
        feedbackPrompt: feedback_prompt || '',
        user: req.user,
      });

      return res.status(202).json({ task_id: task.id, status: task.status, type: task.type });
    } catch (err) { next(err); }
  }

  async runDEVAgent(req, res, next) {
    try {
      const { source_task_id, feedback_prompt } = req.body;
      if (!source_task_id) return res.status(400).json({ status: 'error', message: 'source_task_id is required' });

      const task = await SdlcWorkflowService.runDEVAgent({
        projectId: req.body.project_id,
        sourceTaskId: source_task_id,
        feedbackPrompt: feedback_prompt || '',
        user: req.user,
      });

      return res.status(202).json({ task_id: task.id, status: task.status, type: task.type });
    } catch (err) { next(err); }
  }

  async runQAAgent(req, res, next) {
    try {
      const { source_task_id, feedback_prompt } = req.body;
      if (!source_task_id) return res.status(400).json({ status: 'error', message: 'source_task_id is required' });

      const task = await SdlcWorkflowService.runQAAgent({
        projectId: req.body.project_id,
        sourceTaskId: source_task_id,
        feedbackPrompt: feedback_prompt || '',
        user: req.user,
      });

      return res.status(202).json({ task_id: task.id, status: task.status, type: task.type });
    } catch (err) { next(err); }
  }

  // ─── HITL Gate ───────────────────────────────────────────────────────────

  async submitGateDecision(req, res, next) {
    try {
      const { task_id } = req.params;
      const { decision, comment } = req.body;

      const result = await SdlcWorkflowService.submitGateDecision({
        taskId: task_id,
        decision,
        comment,
        user: req.user,
      });

      return res.json({
        status: 'success',
        data: {
          task_id: result.task.id,
          gate: result.hitlDecision.gate,
          decision: result.hitlDecision.decision,
          comment: result.hitlDecision.comment,
          created_at: result.hitlDecision.createdAt,
        },
      });
    } catch (err) { next(err); }
  }

  // ─── Structured HITL decision (plan section 2.3 / 2.8) ────────────────────

  async submitStructuredDecision(req, res, next) {
    try {
      const { task_id } = req.params;
      const { decision_id, base_output_version, action, payload, comment } = req.body;

      const result = await SdlcWorkflowService.submitStructuredDecision({
        taskId: task_id,
        decisionId: decision_id,
        baseOutputVersion: base_output_version,
        action,
        payload: payload || {},
        comment: comment || '',
        user: req.user,
      });

      return res.json({
        status: 'success',
        data: {
          task_id: result.task.id,
          action: result.hitlDecision.action,
          decision: result.hitlDecision.decision,
          decision_id: result.hitlDecision.decisionId,
          output_version: result.task.outputVersion,
          idempotent_replay: result.idempotentReplay || false,
          escalated: result.escalated || false,
          validation: result.validation || null,
          rerun_task_id: result.rerunTask?.id || null,
          rerun_task_type: result.rerunTask?.type || null,
        },
      });
    } catch (err) { next(err); }
  }

  // ─── Status & Data ───────────────────────────────────────────────────────

  async getTaskStatus(req, res, next) {
    try {
      const { task_id } = req.params;
      const task = await SdlcWorkflowService.getTaskStatus(task_id, req.user);
      if (!task) return res.status(404).json({ status: 'error', message: 'Task not found' });

      return res.json({
        status: 'success',
        data: {
          task_id: task.id,
          type: task.type,
          status: task.status,
          version_status: task.versionStatus,
          gate: task.gate,
          next_agent: task.nextAgent,
          result: task.result,
          error: task.error || null,
          gate_evaluation: task.gateEvaluation || null,
          artifacts: task.artifacts || [],
          hitl_decision: task.hitlDecision || null,
          // Structured HITL fields (plan 2.4 / 2.7 / 2.8)
          output_version: task.outputVersion ?? 0,
          retry_count: task.retryCount ?? 0,
          last_retry_reason: task.lastRetryReason || null,
          gate_mode: task.gateMode || null,
          agent_output: task.agentOutput || null,
          approved_output: task.approvedOutput || null,
          created_at: task.createdAt,
          updated_at: task.updatedAt,
        },
      });
    } catch (err) { next(err); }
  }

  async streamStatus(req, res, next) {
    try {
      const { task_id } = req.params;

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders?.();

      const sendEvent = (event, data) => {
        res.write(`event: ${event}\n`);
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      };

      sendEvent('progress', {
        step: 'connected',
        log: 'Connected to SDLC task stream...',
      });

      const heartbeatInterval = setInterval(() => {
        res.write(': heartbeat\n\n');
      }, 15000);

      let pollInterval;
      const stopAll = () => {
        clearInterval(pollInterval);
        clearInterval(heartbeatInterval);
      };

      pollInterval = setInterval(async () => {
        try {
          const task = await SdlcWorkflowService.getTaskStatus(task_id, req.user);

          if (!task) {
            sendEvent('error', { message: 'Task not found' });
            stopAll(); res.end(); return;
          }

          if (task.status === 'completed') {
            sendEvent('completed', {
              ...task.result,
              artifacts: task.artifacts || [],
              hitlDecision: task.hitlDecision || null,
            });
            stopAll(); res.end(); return;
          }

          if (task.status === 'failed') {
            sendEvent('error', { message: task.error || 'Task failed' });
            stopAll(); res.end(); return;
          }

          sendEvent('progress', {
            step: task.type,
            status: task.status,
            log: `Processing: ${task.type}`,
          });
        } catch (error) {
          sendEvent('error', { message: error.message });
          stopAll();
          res.end();
        }
      }, 2000);

      req.on('close', () => {
        stopAll();
        res.end();
      });
    } catch (err) {
      next(err);
    }
  }

  async getWorkflowStatus(req, res, next) {
    try {
      const { project_id } = req.query;
      if (!project_id) return res.status(400).json({ status: 'error', message: 'project_id is required' });

      const result = await SdlcWorkflowService.getWorkflowStatus(project_id, req.user);
      return res.json({ status: 'success', data: result });
    } catch (err) { next(err); }
  }

  async getFinalReviewPacket(req, res, next) {
    try {
      const { project_id } = req.params;
      const packet = await SdlcWorkflowService.getFinalReviewPacket(project_id, req.user);
      return res.json({ status: 'success', data: packet });
    } catch (err) { next(err); }
  }

  async submitReleaseDecision(req, res, next) {
    try {
      const { project_id } = req.params;
      const { decision_id, decision, comment } = req.body;
      const result = await SdlcWorkflowService.submitReleaseDecision({
        projectId: project_id,
        decisionId: decision_id,
        decision,
        comment: comment || '',
        user: req.user,
      });
      return res.json({
        status: 'success',
        data: {
          decision: result.hitlDecision.decision,
          action: result.hitlDecision.action,
          comment: result.hitlDecision.comment,
          release_status: result.hitlDecision.payload?.release_status || null,
          idempotent_replay: result.idempotentReplay || false,
        },
      });
    } catch (err) { next(err); }
  }

  async getAuditTrail(req, res, next) {
    try {
      const { project_id } = req.params;
      const trail = await SdlcWorkflowService.getAuditTrail(project_id, req.user);
      return res.json({ status: 'success', data: trail });
    } catch (err) { next(err); }
  }

  // T7: thin alias for the audit trail under a UI-friendly name. No new logic —
  // delegates straight to getAuditTrail (:id is the project id).
  async getTimeline(req, res, next) {
    try {
      const { id } = req.params;
      const trail = await SdlcWorkflowService.getAuditTrail(id, req.user);
      return res.json({ status: 'success', data: trail });
    } catch (err) { next(err); }
  }

  async getWorkflowMetrics(req, res, next) {
    try {
      const { project_id } = req.params;
      const metrics = await SdlcWorkflowService.getWorkflowMetrics(project_id, req.user);
      return res.json({ status: 'success', data: metrics });
    } catch (err) { next(err); }
  }

  async getProjectArtifacts(req, res, next) {
    try {
      const { project_id } = req.params;
      const result = await SdlcWorkflowService.getProjectArtifacts(project_id, req.user);
      return res.json({ status: 'success', data: result });
    } catch (err) { next(err); }
  }

  // ─── Dev-only: demo scenario selector ────────────────────────────────────
  // Lets the UI flip MOCK_SCENARIO at runtime (the mock builder reads it per
  // run). Disabled in production. Never persisted — process env only.

  getMockScenario(req, res) {
    return res.json({
      status: 'success',
      data: {
        scenario: MOCK_SCENARIOS.includes(process.env.MOCK_SCENARIO) ? process.env.MOCK_SCENARIO : DEFAULT_MOCK_SCENARIO,
        mockEnabled: process.env.USE_MOCK_AGENTS === 'true',
        available: MOCK_SCENARIOS,
      },
    });
  }

  setMockScenario(req, res) {
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({ status: 'error', code: 'FORBIDDEN', message: 'Scenario switching is disabled in production' });
    }
    const { scenario } = req.body || {};
    if (!MOCK_SCENARIOS.includes(scenario)) {
      return res.status(400).json({ status: 'error', code: 'BAD_REQUEST', message: `Unknown scenario: ${scenario}` });
    }
    process.env.MOCK_SCENARIO = scenario;
    return res.json({ status: 'success', data: { scenario: process.env.MOCK_SCENARIO } });
  }

  // ─── Kanban Backlog ──────────────────────────────────────────────────────

  async getBacklogs(req, res, next) {
    try {
      const { project_id } = req.params;
      const FeatureBacklog = require('../models/FeatureBacklog');
      const backlogs = await FeatureBacklog.findByProjectId(project_id);
      return res.json({ status: 'success', data: backlogs });
    } catch (err) { next(err); }
  }

  async createBacklog(req, res, next) {
    try {
      const { project_id } = req.params;
      const { title, description, priority } = req.body;
      const FeatureBacklog = require('../models/FeatureBacklog');
      const record = await FeatureBacklog.create({
        project_id,
        title,
        description,
        priority: priority || 'MEDIUM',
        status: 'TODO'
      });
      return res.status(201).json({ status: 'success', data: record });
    } catch (err) { next(err); }
  }

  async moveBacklog(req, res, next) {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const FeatureBacklog = require('../models/FeatureBacklog');
      const record = await FeatureBacklog.updateStatus(id, status);
      return res.json({ status: 'success', data: record });
    } catch (err) { next(err); }
  }
}

module.exports = new SdlcController();
