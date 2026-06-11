# Decision log — World-class improvements (AIDLC_WORLDCLASS_IMPROVEMENTS)

Date: 2026-06-04
Principle: standardize what exists first; add structure only with evidence of need.
No Workflow model, no Ajv, no big abstractions, no read-model. Threshold stays 0.8.

## Scope this round
Implemented: **I1, I2 (partial), I3, I4, I5, I7**. Deferred: **I6** (optimistic
lock for concurrent decisions) → moved to the pre-multi-user milestone; at
single-user demo it solves a problem that cannot occur yet and would add
regression risk to the demo write path.

## What was implemented

- **I7 — env-based crash behavior.** `unhandledRejection`/`uncaughtException`:
  dev/demo keep the server alive; production logs and `process.exit(1)` so the
  supervisor restarts a clean process (serving on undefined state is unsafe).
- **I5 — versioned output contracts.** Extracted the per-role required-field
  shape out of `_validateGateOutput` into a single, explicit, versioned
  `OUTPUT_CONTRACTS` (version `gate-output.v1`); the validator now iterates it
  (behaviour identical — predicates unchanged, no Ajv). Drift test
  `tests/integration/output-contract.test.js` fails if the shape changes without
  a snapshot/version update.
- **I3 — PHASE_TRANSITION chain.** `getAuditTrail` already tagged events with
  stateFrom/stateTo; added a synthesized, continuous `phaseTransitions` array
  (`{type:'PHASE_TRANSITION', from, to, cause, at, agent, taskId, requestId}`)
  derived from the ordered events. No new table, no Workflow model. Returned by
  `getAuditTrail` and the `/workflow/:id/timeline` alias.
- **I4 — small agent contract + shared conformance suite.** `agentContract.js`
  defines `run({task, context}) -> output` + `REQUIRED_OUTPUT_KEYS` per role +
  `assertOutputConforms` (version `agent-io.v1`). Extracted the mock output
  builder into `_buildMockOutput` (pure, no DB) so the mock IS an implementation
  of the contract. `tests/integration/agent-contract.test.js` runs the mock
  through the suite (6/6). The real-agent path now warns (non-fatal) when output
  diverges from the contract, so divergence surfaces the moment a real agent is
  wired. Kept tiny on purpose — not a 6-connector abstraction.
- **I2 — requestId correlation (partial).** AsyncLocalStorage-based
  `requestContext` middleware assigns a per-request id (honours inbound
  `x-request-id`), echoes it on the response header, and threads it through the
  async chain. The error envelope now includes `requestId`; the request log line
  includes it too — so an error response can be matched to its log line. **No
  schema change** (requestId is not persisted into the audit this round; that is
  deferred to the production/I3-persistence milestone, per the "no column
  without evidence of need" rule).
  **pino:** the initial `npm install pino` failed with
  `UNABLE_TO_VERIFY_LEAF_SIGNATURE` (environment TLS/proxy). Resolved with a
  one-off `npm install pino --strict-ssl=false` (user-approved; official
  registry, no global config change). `src/config/logger.js` is a pino JSON
  logger that auto-injects the request context (requestId + taskId/phase) into
  every line; the request logger and the key SDLC service logs (INVALID,
  task-failed, contract-divergence) now emit structured JSON.
- **I1 — CI + DB isolation.**
  - `schema.prisma` datasource switched to `env("DATABASE_URL")`. `backend/.env`
    sets `DATABASE_URL="file:./dev.db"` for local dev.
  - Jest: `tests/setupEnv.js` (via `setupFiles`) guarantees a DATABASE_URL
    (defaults to dev.db; CI overrides) — the runtime prisma client does not load
    .env. All 58 tests stay green.
  - `demoSmoke.js` forces `DATABASE_URL=file:./smoke.db` before any prisma
    require and runs its own `prisma db push`, so the smoke NEVER touches dev.db.
  - `.github/workflows/ci.yml`: npm ci → prisma generate → db push to an
    isolated `ci.db` → **drift guard** `prisma migrate diff --exit-code`
    (chosen over `migrate status`, which is N/A: the repo uses db push with no
    migration history) → `npm test` → `npm run demo:smoke`. A broken branch
    turns the build red.

## Notable decisions / deviations
- `prisma migrate status` (requested) does not apply — no `prisma/migrations`
  history (db-push project). Substituted `prisma migrate diff --exit-code`,
  which detects schema↔DB drift and is run AFTER db push against the isolated DB.
- pino install blocked by environment TLS — see I2 above. Awaiting user
  direction (fix registry cert vs one-off `--strict-ssl=false` install).

## Verification
- `npm test`: 58/58 (was 44; +I4 conformance, +I5 drift, +T6 handoff).
- `npm run demo:smoke`: 6/6 against the isolated smoke DB.
- `prisma migrate diff --exit-code`: "No difference detected" (exit 0).
