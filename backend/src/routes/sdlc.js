const express = require('express');
const multer = require('multer');
const SdlcController = require('../controllers/SdlcController');
const quotaMiddleware = require('../middleware/quotaMiddleware');

const router = express.Router();

// Folder upload ("Open folder" flow): in-memory, generous limits for a repo.
const repoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 8000 },
});

// ── IntentGate ─────────────────────────────────────────────────────────────
router.post('/run-intent-agent', quotaMiddleware, SdlcController.runIntentAgent.bind(SdlcController));

// ── Repo folder upload (T1.4 "Open folder") ───────────────────────────────
// POST /api/v1/sdlc/upload-repo  (multipart: files[] + paths[] + project_id)
router.post('/upload-repo', repoUpload.array('files'), SdlcController.uploadRepo.bind(SdlcController));

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
// Cancel a running/awaiting task (DMO — timeout & cancel)
router.post('/tasks/:task_id/cancel', SdlcController.cancelTask.bind(SdlcController));

// ── Gate approvals (T2.4) — claude-code onGate pending gates ───────────────
// GET  /api/v1/sdlc/approvals?task_id=xxx   list pending gates
// POST /api/v1/sdlc/approvals/:approval_id  { action, comment } | { answers }
router.get('/approvals',               SdlcController.listPendingApprovals.bind(SdlcController));
router.post('/approvals/:approval_id', SdlcController.resolveApproval.bind(SdlcController));

// ── Task Status ──────────────────────────────────────────────────────────
router.get('/tasks/:task_id',              SdlcController.getTaskStatus.bind(SdlcController));
router.get('/tasks/:task_id/events',       SdlcController.getTaskEvents.bind(SdlcController));
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
router.get('/projects/:project_id/release-files/:file_name', SdlcController.downloadReleaseFile.bind(SdlcController));

// ── Dev-only: demo scenario selector (MOCK_SCENARIO) ───────────────────────
router.get('/dev/mock-scenario',  SdlcController.getMockScenario.bind(SdlcController));

// ── Demo board: 3 independent flows parked at PO / DEV / QA ────────────────
// POST /api/v1/sdlc/demo/seed-board[?reset=true]   provision (idempotent)
// GET  /api/v1/sdlc/demo/board                     aggregated board state
router.post('/demo/seed-board', SdlcController.seedDemoBoard.bind(SdlcController));
router.get('/demo/board',       SdlcController.getDemoBoard.bind(SdlcController));

// ── Backlog / Kanban ──────────────────────────────────────────────────────
router.get('/projects/:project_id/backlog',           SdlcController.getBacklogs.bind(SdlcController));
router.post('/projects/:project_id/backlog',          SdlcController.createBacklog.bind(SdlcController));
router.patch('/backlog/:id/move',                     SdlcController.moveBacklog.bind(SdlcController));


module.exports = router;
