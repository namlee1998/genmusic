# Decision log — Demo Hardening (AIDLC_DEMO_HARDENING_TASKS v2)

Date: 2026-06-04
Scope: backend (Node/Express + Prisma + existing mock-agent layer). Principle: smallest safe change, no orchestrator rewrite, no parallel systems.

## What was implemented

- **T1 — INVALID artifact status.** Added an additive `status` column to `AgentArtifact`
  (`VALID | INVALID | PENDING`, default `VALID` so old rows are unaffected). After a run,
  `_saveAgentData` calls the existing `_validateGateOutput`; a BLOCKER marks the run's
  artifacts `INVALID`, skips `_autoApproveSafeOutput`, emits no handoff, and the derived
  phase stays at `*_REVIEW`. No Ajv, no `schemas/*.json`.
- **T2 — gate config clarity.** Kept the 0.8 auto-approve threshold (tests depend on it).
  Introduced a documented `GATE_CONFIG` block and routed the two release-blocking severity
  checks through `GATE_CONFIG.RELEASE_BLOCKING_SEVERITIES` (same values). The three bad-case
  branches already existed (`_evaluateGatePolicy` HOLD on low confidence / missing evidence;
  release lock on QA blocker); audit events now also carry `reason` + `ruleHit`.
- **T3 — mock scenarios via env.** Reused `USE_MOCK_AGENTS` + `mock-data/`; added a
  `MOCK_SCENARIO` env handled by `_applyMockScenario` (`happy_path`, `low_confidence_hold`,
  `missing_evidence`, `qa_blocker`, `release_reject`, `escalation`). **No** `mocks/scenarios/`
  dir, **no** `?scenario=` query. When `MOCK_SCENARIO` is unset the legacy behaviour is
  preserved exactly (DEV holds low + OAuth security-rework cycle stays in play).
- **T4 — resilience.** `errorHandler` now returns `{status, code, message, phase}`; added
  `ERROR_CODES` (`ARTIFACT_MISSING`, `HASH_MISMATCH`, `MOCK_PARSE_ERROR`); `ApiError` accepts
  optional `code`/`phase` (backward compatible). Malformed mock JSON now fails a task with a
  clear `MOCK_PARSE_ERROR` instead of silently falling back to the real agent. Added
  `process.on('unhandledRejection')` / `uncaughtException` so the server survives a demo.
- **T5 — derived state hardening (no Workflow model).** Kept `_deriveCurrentPhase`. Made the
  most-recent decision per task deterministic (`createdAt`, then `id` tie-break) and added a
  matching tie-break to `Task.findLatestByProject`, so reruns never stick on an old decision
  and parallel reruns derive the same phase. Added a **derived** `awaitingReview` on each
  phase (no stored column, frontend contract unchanged).
- **T6 — INVALID upstream blocks handoff.** `_requireApprovedTask` (the single guard for
  UX/DEV/QA runs) now rejects with 409 if the committed source has any `INVALID` artifact.
  Covered by `tests/integration/sdlc.handoff.test.js` for PO→UX, UX→DEV, DEV→QA.
- **T7 — timeline alias.** `GET /workflow/:id/timeline` delegates straight to `getAuditTrail`.
  No new event table, no duplicated logic.
- **T8 — rerun idempotency within the existing schema.** No new column. Each rerun is already
  uniquely identified by `task.id` (the run id), linked via `sourceRunId`, ordered by
  `retryCount`/`outputVersion`, and protected from double-processing by the `decisionId`
  idempotency key. The T5 tie-break removes the only remaining parallel-rerun drift.
- **T9 — preflight smoke.** `scripts/demoSmoke.js` (`npm run demo:smoke`) drives all six
  scenarios in-process against the mock layer and asserts the expected branch. 6/6 deterministic.

## Notable finding

For high-risk auth features (e.g. "Add Google login"), the mock DEV agent intentionally fails
the OAuth security gate on the first pass (`securityPassed = !securityRequired || !!feedback`),
i.e. it expects one security-rework cycle. Under T1 that first-pass output is now correctly
`INVALID`. So the demo scenarios that must reach QA force the DEV security gate to PASS on the
first run (except `missing_evidence`), isolating each scenario's own variable. The legacy
(no `MOCK_SCENARIO`) path keeps the original security-rework behaviour.

## Out of scope (unchanged)

Ajv, a `Workflow` model, `config/gates.js`, `mocks/scenarios/`, real MCP adapters, Supabase
production path. Threshold stays 0.8.
