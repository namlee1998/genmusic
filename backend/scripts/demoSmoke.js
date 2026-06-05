#!/usr/bin/env node
/**
 * T9 — Demo preflight smoke test.
 *
 * Drives the SDLC workflow in-process (no HTTP/auth) against the existing mock
 * layer, once per demo scenario (T3), and asserts the workflow lands on the
 * expected branch. Run this before every demo:  `npm run demo:smoke`.
 *
 * It uses USE_MOCK_AGENTS + MOCK_SCENARIO (the existing env mechanism) — it does
 * NOT spin up a second mock system. Each scenario runs on its own throwaway
 * project so the derived state never bleeds across runs.
 *
 * Exit code 0 = all scenarios PASS, 1 = at least one FAIL.
 */

process.env.USE_MOCK_AGENTS = 'true';
process.env.NODE_ENV = process.env.NODE_ENV || 'development';
// I1: the smoke must NEVER touch dev.db. Force an isolated sqlite file (set
// before any prisma require so the client connects to it). Override via
// SMOKE_DATABASE_URL if needed.
process.env.DATABASE_URL = process.env.SMOKE_DATABASE_URL || 'file:./smoke.db';

const path = require('path');
const { execSync } = require('child_process');

// Ensure the isolated smoke DB has the current schema before connecting.
// db push (not migrate) — CI/smoke only need a matching schema, no history.
try {
  execSync('npx prisma db push --skip-generate --accept-data-loss', {
    cwd: path.join(__dirname, '..'),
    stdio: 'ignore',
    env: process.env,
  });
} catch (e) {
  console.error('Failed to prepare the isolated smoke DB schema:', e.message);
  process.exit(1);
}

const { v4: uuidv4 } = require('uuid');
const { Project, Task, HitlDecision, AgentArtifact } = require('../src/models');
const SdlcWorkflowService = require('../src/services/SdlcWorkflowService');
const prisma = require('../src/config/database');

const FEATURE = {
  title: 'Add Google login',
  description: 'Allow users to sign in with their Google account via OAuth 2.0.',
  priority: 'High',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(projectId, predicate, { timeoutMs = 30000, label = 'condition' } = {}) {
  const start = Date.now();
  let last = null;
  while (Date.now() - start < timeoutMs) {
    last = await SdlcWorkflowService.getWorkflowStatus(projectId, null);
    if (predicate(last)) return last;
    await sleep(400);
  }
  throw new Error(`Timed out waiting for ${label}. Last phase: ${last?.currentPhase}`);
}

async function newProject(name) {
  const id = uuidv4();
  await Project.create({ id, name: `smoke-${name}-${id.slice(0, 6)}` });
  return id;
}

function approvePayload() {
  return { decisionId: uuidv4(), action: 'approve' };
}

function rejectPayload(field) {
  return {
    decisionId: uuidv4(),
    action: 'reject',
    comment: 'Please improve this output; confidence is below the gate threshold.',
    payload: {
      retry_reason: 'quality_low',
      target_fields: [field || 'confidence_score'],
      blocking_issues: [{ severity: 'HIGH', issue: 'Confidence below threshold', expected_fix: 'Add evidence and re-run' }],
      acceptance_checks: ['Confidence >= 0.8 with supporting evidence'],
    },
  };
}

function missingEvidenceRejectPayload() {
  return {
    decisionId: uuidv4(),
    action: 'reject',
    comment: 'Attach the missing sandbox execution and self-test evidence before handing off to QA.',
    payload: {
      retry_reason: 'build_fail',
      target_fields: ['sandbox_result', 'self_test_report', 'sandbox_report'],
      blocking_issues: [{
        severity: 'HIGH',
        issue: 'DEV output is missing sandbox execution evidence and self-test report',
        expected_fix: 'Run sandbox checks, attach self-test report, and confirm build/tests pass',
      }],
      acceptance_checks: [
        'sandbox_result.tests_ran is true',
        'self_test_report is present',
        'sandbox report includes passing build and test evidence',
      ],
    },
  };
}

function qaBlockerRejectPayload() {
  return {
    decisionId: uuidv4(),
    action: 'reject',
    comment: 'Re-run QA after resolving the OAuth callback blocker and attach a clean regression report.',
    payload: {
      retry_reason: 'coverage_gap',
      target_fields: ['test_run_report', 'qa_report', 'blocker_count', 'release_reason'],
      blocking_issues: [{
        severity: 'HIGH',
        issue: 'QA found a blocking OAuth callback regression',
        expected_fix: 'Regenerate QA evidence with zero blockers and zero failed tests',
      }],
      acceptance_checks: [
        'blocker_count is 0',
        'test_run_report.failed is 0',
        'QA report documents the resolved callback regression',
      ],
    },
  };
}

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

async function happyPath() {
  process.env.MOCK_SCENARIO = 'happy_path';
  const projectId = await newProject('happy');
  await SdlcWorkflowService.runPOAgent({ projectId, featureRequest: FEATURE, user: null });

  // PO/UX/DEV auto-approve; QA is strict-manual and stops at QA_REVIEW.
  const s = await waitFor(projectId, (w) => w.phases.qa?.status === 'completed', { label: 'QA completed', timeoutMs: 40000 });
  if (s.phases.qa.versionStatus === 'committed') throw new Error('QA should await manual approval, not be auto-committed');

  // Approve QA, then approve the Final Release gate.
  await SdlcWorkflowService.submitStructuredDecision({ taskId: s.phases.qa.taskId, ...approvePayload(), user: null });
  await SdlcWorkflowService.submitReleaseDecision({ projectId, decisionId: uuidv4(), decision: 'APPROVE', user: null });

  const fin = await SdlcWorkflowService.getWorkflowStatus(projectId, null);
  if (fin.currentPhase !== 'RELEASED') throw new Error(`Expected RELEASED, got ${fin.currentPhase}`);
  return 'reached Final Release (RELEASED)';
}

async function lowConfidenceHold() {
  process.env.MOCK_SCENARIO = 'low_confidence_hold';
  const projectId = await newProject('hold');
  await SdlcWorkflowService.runPOAgent({ projectId, featureRequest: FEATURE, user: null });

  const s = await waitFor(projectId, (w) => w.phases.dev?.status === 'completed', { label: 'DEV completed' });
  if (s.currentPhase !== 'DEV_REVIEW') throw new Error(`Expected DEV_REVIEW, got ${s.currentPhase}`);
  if (!s.phases.dev.awaitingReview) throw new Error('DEV should be awaitingReview (HOLD)');
  if (s.phases.dev.versionStatus === 'committed') throw new Error('Low-confidence DEV must not auto-approve');
  return 'DEV held for review (HOLD), not auto-approved';
}

async function missingEvidence() {
  process.env.MOCK_SCENARIO = 'missing_evidence';
  const projectId = await newProject('missing');
  await SdlcWorkflowService.runPOAgent({ projectId, featureRequest: FEATURE, user: null });

  const s = await waitFor(projectId, (w) => w.phases.dev?.status === 'completed', { label: 'DEV completed' });
  const invalid = await AgentArtifact.hasInvalid(s.phases.dev.taskId);
  if (!invalid) throw new Error('DEV artifacts should be INVALID (missing evidence)');
  if (s.phases.dev.versionStatus === 'committed') throw new Error('INVALID DEV must not be committed');
  if (s.phases.qa) throw new Error('No QA handoff should occur from an INVALID DEV output');

  await SdlcWorkflowService.submitStructuredDecision({ taskId: s.phases.dev.taskId, ...missingEvidenceRejectPayload(), user: null });
  const fixed = await waitFor(
    projectId,
    (w) => w.phases.dev?.taskId !== s.phases.dev.taskId && w.phases.dev?.versionStatus === 'committed' && w.phases.qa?.status === 'completed',
    { label: 'DEV evidence rerun committed and QA completed', timeoutMs: 50000 },
  );
  const fixedInvalid = await AgentArtifact.hasInvalid(fixed.phases.dev.taskId);
  if (fixedInvalid) throw new Error('DEV rerun should be VALID after attaching evidence');
  return 'DEV INVALID first, then reviewer feedback attaches evidence and unlocks QA';
}

async function qaBlocker() {
  process.env.MOCK_SCENARIO = 'qa_blocker';
  const projectId = await newProject('qablock');
  await SdlcWorkflowService.runPOAgent({ projectId, featureRequest: FEATURE, user: null });

  const s = await waitFor(projectId, (w) => w.phases.qa?.status === 'completed', { label: 'QA completed', timeoutMs: 40000 });
  const invalid = await AgentArtifact.hasInvalid(s.phases.qa.taskId);
  if (!invalid) throw new Error('QA artifacts should be INVALID (blocker present)');
  if (s.releaseGate?.eligible) throw new Error('Release must not be eligible while QA has a blocker');

  await SdlcWorkflowService.submitStructuredDecision({ taskId: s.phases.qa.taskId, ...qaBlockerRejectPayload(), user: null });
  const fixed = await waitFor(
    projectId,
    (w) => w.phases.qa?.taskId !== s.phases.qa.taskId && w.phases.qa?.status === 'completed',
    { label: 'QA blocker rerun completed', timeoutMs: 40000 },
  );
  const fixedInvalid = await AgentArtifact.hasInvalid(fixed.phases.qa.taskId);
  if (fixedInvalid) throw new Error('QA rerun should be VALID after blocker remediation');
  if (fixed.phases.qa.versionStatus === 'committed') throw new Error('QA rerun should still await manual approval');
  return 'QA INVALID first, then reviewer feedback clears blockers and awaits approval';
  return 'QA blocker → QA INVALID, release LOCKED (not eligible)';
}

async function releaseReject() {
  process.env.MOCK_SCENARIO = 'release_reject';
  const projectId = await newProject('rel-reject');
  await SdlcWorkflowService.runPOAgent({ projectId, featureRequest: FEATURE, user: null });

  const s = await waitFor(projectId, (w) => w.phases.qa?.status === 'completed', { label: 'QA completed', timeoutMs: 40000 });
  await SdlcWorkflowService.submitStructuredDecision({ taskId: s.phases.qa.taskId, ...approvePayload(), user: null });
  await SdlcWorkflowService.submitReleaseDecision({ projectId, decisionId: uuidv4(), decision: 'REJECT', user: null });

  const fin = await SdlcWorkflowService.getWorkflowStatus(projectId, null);
  if (fin.currentPhase !== 'RELEASE_REJECTED') throw new Error(`Expected RELEASE_REJECTED, got ${fin.currentPhase}`);
  return 'Final gate REJECT → RELEASE_REJECTED';
}

async function escalation() {
  process.env.MOCK_SCENARIO = 'escalation';
  const projectId = await newProject('escalate');
  await SdlcWorkflowService.runPOAgent({ projectId, featureRequest: FEATURE, user: null });

  let s = await waitFor(projectId, (w) => w.phases.dev?.status === 'completed', { label: 'DEV completed (attempt 1)' });
  let escalated = false;
  let prevTaskId = null;

  for (let i = 0; i < 5 && !escalated; i += 1) {
    const devTaskId = s.phases.dev.taskId;
    const res = await SdlcWorkflowService.submitStructuredDecision({ taskId: devTaskId, ...rejectPayload(), user: null });
    if (res.escalated) { escalated = true; break; }
    prevTaskId = devTaskId;
    // Wait for the rerun (a new DEV task) to finish and hold again.
    s = await waitFor(
      projectId,
      (w) => w.phases.dev?.taskId && w.phases.dev.taskId !== prevTaskId && w.phases.dev.status === 'completed',
      { label: `DEV rerun #${i + 2}` },
    );
  }

  if (!escalated) {
    // Fallback: check persisted escalation decision.
    const decisions = await HitlDecision.findByProjectId(projectId);
    escalated = decisions.some((d) => d.action === 'escalation_required');
  }
  if (!escalated) throw new Error('Expected an escalation after exceeding max retries');
  return 'Repeated low-confidence rejects → escalation (MAX_RETRY_EXCEEDED)';
}

const SCENARIOS = [
  ['happy_path', happyPath],
  ['low_confidence_hold', lowConfidenceHold],
  ['missing_evidence', missingEvidence],
  ['qa_blocker', qaBlocker],
  ['release_reject', releaseReject],
  ['escalation', escalation],
];

(async () => {
  console.log('▶  AIDLC demo preflight smoke (USE_MOCK_AGENTS=true)\n');
  const results = [];
  for (const [name, fn] of SCENARIOS) {
    const started = Date.now();
    try {
      const detail = await fn();
      const secs = ((Date.now() - started) / 1000).toFixed(1);
      console.log(`✅ PASS  ${name.padEnd(20)} ${detail}  (${secs}s)`);
      results.push(true);
    } catch (err) {
      const secs = ((Date.now() - started) / 1000).toFixed(1);
      console.log(`❌ FAIL  ${name.padEnd(20)} ${err.message}  (${secs}s)`);
      results.push(false);
    } finally {
      delete process.env.MOCK_SCENARIO;
    }
  }

  const passed = results.filter(Boolean).length;
  console.log(`\n${passed}/${results.length} scenarios passed.`);
  await prisma.$disconnect().catch(() => {});
  process.exit(passed === results.length ? 0 : 1);
})();
