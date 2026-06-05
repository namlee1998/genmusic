const express = require('express');
const SdlcController = require('../controllers/SdlcController');
const quotaMiddleware = require('../middleware/quotaMiddleware');

const router = express.Router();

// ── IntentGate ─────────────────────────────────────────────────────────────
router.post('/run-intent-agent', quotaMiddleware, SdlcController.runIntentAgent.bind(SdlcController));

// ── Run Agents (quota checked) ────────────────────────────────────────────
router.post('/run-po-agent',  quotaMiddleware, SdlcController.runPOAgent.bind(SdlcController));
router.post('/run-ux-agent',  quotaMiddleware, SdlcController.runUXAgent.bind(SdlcController));
router.post('/run-dev-agent', quotaMiddleware, SdlcController.runDEVAgent.bind(SdlcController));
router.post('/run-qa-agent',  quotaMiddleware, SdlcController.runQAAgent.bind(SdlcController));

// ── HITL Gate ────────────────────────────────────────────────────────────
// POST /api/v1/sdlc/tasks/:task_id/gate-decision  { decision, comment }
router.post('/tasks/:task_id/gate-decision', SdlcController.submitGateDecision.bind(SdlcController));
// Structured HITL (plan 2.3/2.8): { decision_id, base_output_version, action, payload, comment }
router.post('/tasks/:task_id/decision', SdlcController.submitStructuredDecision.bind(SdlcController));

// ── Task Status ──────────────────────────────────────────────────────────
router.get('/tasks/:task_id',              SdlcController.getTaskStatus.bind(SdlcController));
router.get('/status/:task_id',             SdlcController.streamStatus.bind(SdlcController));   // SSE

// ── Workflow-level views ──────────────────────────────────────────────────
// GET /api/v1/sdlc/workflow-status?project_id=xxx
router.get('/workflow-status',                        SdlcController.getWorkflowStatus.bind(SdlcController));
router.get('/final-review-packet/:project_id',        SdlcController.getFinalReviewPacket.bind(SdlcController));
router.post('/projects/:project_id/release-decision', SdlcController.submitReleaseDecision.bind(SdlcController));
router.get('/audit-trail/:project_id',                SdlcController.getAuditTrail.bind(SdlcController));
// T7: alias — same event timeline as audit-trail, UI-friendly path.
router.get('/workflow/:id/timeline',                  SdlcController.getTimeline.bind(SdlcController));
router.get('/projects/:project_id/metrics',           SdlcController.getWorkflowMetrics.bind(SdlcController));
router.get('/projects/:project_id/artifacts',          SdlcController.getProjectArtifacts.bind(SdlcController));

// ── Dev-only: demo scenario selector (MOCK_SCENARIO) ───────────────────────
router.get('/dev/mock-scenario',  SdlcController.getMockScenario.bind(SdlcController));
router.post('/dev/mock-scenario', SdlcController.setMockScenario.bind(SdlcController));

// ── Backlog / Kanban ──────────────────────────────────────────────────────
router.get('/projects/:project_id/backlog',           SdlcController.getBacklogs.bind(SdlcController));
router.post('/projects/:project_id/backlog',          SdlcController.createBacklog.bind(SdlcController));
router.patch('/backlog/:id/move',                     SdlcController.moveBacklog.bind(SdlcController));


module.exports = router;
