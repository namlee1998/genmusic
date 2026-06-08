# AIFA Documentation

Thu muc nay mo ta kien truc va trang thai hien tai cua AIFA v3.

## Tai lieu chinh

| File | Muc dich |
| --- | --- |
| [AIFA_V3_IMPLEMENTATION_SUMMARY.md](AIFA_V3_IMPLEMENTATION_SUMMARY.md) | Nguon su that ve tinh nang da co, hardening da lam va gioi han hien tai |
| [architecture.md](architecture.md) | Kien truc runtime hien tai va luong PO/UX/DEV/QA |
| [AIFA_NOTES.md](AIFA_NOTES.md) | Ban do codebase cho developer |
| [QUALITY_GATE_RULES.md](QUALITY_GATE_RULES.md) | Quy tac validation, risk gate, QA gate va release gate |
| [AIFA_DEMO_1_WEEK_ROADMAP.md](AIFA_DEMO_1_WEEK_ROADMAP.md) | Ke hoach 1 tuan de persist task/event/gate va recovery |
| [AIFA_REAL_DATA_3_WEEK_ROADMAP.md](AIFA_REAL_DATA_3_WEEK_ROADMAP.md) | Ke hoach 3 tuan de chuyen tu mock sang controlled real execution |
| [CHANGELOG.md](CHANGELOG.md) | Lich su thay doi dang chu y |

## Nguyen tac to chuc

- `README`: muc luc va loi vao duy nhat.
- `AIFA_V3_IMPLEMENTATION_SUMMARY`: current state, bao gom limitations va cac
  hardening da hoan tat.
- `architecture`, `AIFA_NOTES`, `QUALITY_GATE_RULES`: tai lieu tham chieu cho
  developer, moi file co mot chu de rieng.
- Hai roadmap chi mo ta future work; khong tron voi current state.
- `CHANGELOG` chi ghi lich su phien ban, khong dung lam roadmap.

## Workflow hien tai

```text
Open folder / repo
  -> PO route classification + clarification gate
  -> UX Penpot mock (neu route co UI)
  -> DEV question/tool gates + file changes
  -> QA quality gate + human review
  -> Owner/Admin release approval
  -> Release bundle + final.md
```

Execution path chinh cua demo:

```env
EXECUTION_PATH=claude-code
USE_MOCK_CLAUDE_CODE=true
USE_MOCK_AGENTS=true
```

Mock Claude Code dung cung interface `onGate` du kien cho runner that. Moi
output van phai qua output contract, validation ba lop va A2A integrity check.

## Cach doc

1. Doc [AIFA_V3_IMPLEMENTATION_SUMMARY.md](AIFA_V3_IMPLEMENTATION_SUMMARY.md)
   de nam pham vi da thuc hien va gioi han.
2. Doc [architecture.md](architecture.md) de hieu luong runtime.
3. Planning agent doc [AIFA_DEMO_1_WEEK_ROADMAP.md](AIFA_DEMO_1_WEEK_ROADMAP.md)
   truoc
   khi bat dau [AIFA_REAL_DATA_3_WEEK_ROADMAP.md](AIFA_REAL_DATA_3_WEEK_ROADMAP.md).
4. Developer doc [AIFA_NOTES.md](AIFA_NOTES.md) va
   [QUALITY_GATE_RULES.md](QUALITY_GATE_RULES.md) truoc khi sua runtime.

## Gioi han quan trong

- Claude Code runner that van la stub; demo dang dung mock.
- Pending gate metadata da persist, nhung continuation van in-memory; backend
  restart se danh dau gate `interrupted`, chua the resume tu diem gate.
- Ghi `final.md` vao folder local can Chrome/Edge va quyen `readwrite`.
- Path `langchain` duoc giu de tuong thich, nhung khong phai path phat trien chinh.


## 1. Repository Structure

```text
.
|-- agents/                 Python FastAPI + direct LangChain worker service
|   |-- src/agents/         PO, UX, DEV, QA, plus a legacy Intent adapter
|   |-- src/quality_gate/   Quality gate rules and evaluator
|   `-- tests/              Python unit tests
|-- backend/                Node.js + Express API gateway
|   |-- prisma/             Local SQLite schema (env-driven DATABASE_URL)
|   |-- src/                Routes, controllers, services, middleware, models
|   |-- scripts/           demoSmoke.js preflight (six deterministic scenarios)
|   |-- supabase/           Supabase configuration and migrations
|   `-- tests/              Jest integration tests
|-- frontend/               React + Vite dashboard
|   |-- src/                UI, stores, and API clients
|   `-- tests/              Vitest tests
|-- docs/                   Architecture, rules, and project notes
|-- agents/sandbox/         E2B runtime for Claude Agent SDK DEV execution
|-- workspace/              Generated project artifacts
|-- .github/workflows/      CI: backend tests + schema drift + demo preflight
|-- docker-compose.yml      Local three-service stack
`-- pytest.ini              Python test discovery configuration
```

The main AIDLC flow is:

```text
Feature request
  -> PO Agent
  -> UX Agent
  -> DEV Agent + sandbox validation
  -> QA Agent + quality gate
  -> QA human approval
  -> Final release decision![alt text](image.png)
```

The Intent endpoint remains available only as a compatibility adapter for
older local data. New workflow runs start directly at PO Agent.

For design details, see [docs/architecture.md](docs/architecture.md). For agent
roles and required models, see [AGENTS.md](AGENTS.md).



## 2. Current Implementation Status

The repository includes an end-to-end local workflow demo:

- The active Build flow starts from the `New feature request` modal and submits
  directly to PO Agent. The visible path is `PO -> UX -> DEV -> QA`; the older
  Intent endpoint remains available only for compatibility.
- PO, UX, and DEV use confidence-based gates. When output confidence is
  `>= 0.80`, schema and evidence validation pass, and no warning or security
  issue remains, the backend auto-approves the output, persists an
  `a2a_handoff.v1` envelope, and starts the next worker.
- Every worker output is validated against a versioned, per-role output
  contract (`OUTPUT_CONTRACTS`, `gate-output.v1`). A blocking violation marks the
  run's artifacts `INVALID`, emits no handoff, and keeps the phase at review. A
  committed-but-`INVALID` upstream can never hand off downstream.
- When an intermediate output is held, the review modal opens automatically.
  Direct approval is disabled for that held output. The reviewer must send a
  concrete comment, blocking issue, expected fix, and at least one acceptance
  check back to the same worker. Rework is limited to three retries before the
  workflow records an escalation.
- QA always requires a human decision after its automated quality gate runs.
  QA approval stays locked until the automated recommendation is `PASS`.
- After QA approval, the Build page replaces the MCP panel with the final
  release gate. It summarizes risk, sandbox evidence, security status, QA
  coverage, blockers, and approved output versions. Only project owners and
  admins can approve or reject the release; approval remains locked while
  critical or high-risk blockers exist.
- Structured HITL decisions support `approve`, field-level `edit_approve`, and
  feedback-driven `reject`. They use idempotency keys and output-version checks.
- Approved worker outputs and A2A handoffs remain available in Outputs
  (`/sdlc/outputs`). Audit (`/sdlc/audit`) shows the run timeline, HITL
  decisions, handoffs, escalations, workflow metrics, and a frontend mock of
  the GitHub Actions CI preflight gate.
- The Build page includes an MCP/HTTPS activity visualization for the
  allow-listed tools used by PO, UX, DEV, and QA. Its lane state is currently
  derived from worker task status (`Waiting`, `Calling MCP`, result received,
  or failed); it is not a production tool-call telemetry stream yet.
- Active Python requests dispatch directly to LangChain workers. DEV also has
  an optional E2B Claude Agent SDK path. The previous LangGraph experiment is
  isolated from the running server.
- Backlog endpoints and a Kanban component exist, but the current Build page
  starts new runs from the direct PO submission modal.
- Owners can delete a project from the sidebar. Deletion removes its workflow
  tasks, artifacts, HITL decisions, backlog items, folders, invitations, and
  memberships.
- The demo runtime intentionally supports one polished deterministic
  `happy_path`: PO clarification, UX Penpot mock, DEV clarification and tool
  approval, QA review, release approval, then `final.md`.
- Failure-handling mechanisms remain in product code, but synthetic bad-case
  switching is not exposed during the happy-path demo.
- Run `cd backend && npm run demo:smoke` as the complete happy-path preflight.
- Local JWT sign-in works without hosted authentication. Development CORS
  accepts local frontend ports such as `5173` and `5174`.
- Resilience: errors return a stable `{status, code, message, phase, requestId}`
  envelope (`ARTIFACT_MISSING`, `HASH_MISMATCH`, `MOCK_PARSE_ERROR`, ...). A
  malformed mock file fails its task cleanly instead of silently falling back to
  a real agent. `unhandledRejection`/`uncaughtException` keep the server alive in
  dev/demo and log-and-exit in production for a clean supervised restart.
- Observability: an AsyncLocalStorage `requestId` is assigned per request, echoed
  on the response header, returned in error responses, and threaded into pino
  JSON logs (with `taskId`/`phase`) so a log line can be matched to an error.
  In the UI, structured API failures render a rich error banner with
  `code`, `phase`, and `requestId`; workflow state banners such as
  `DEV output is INVALID` are status summaries and may not include a request id.
- Agent I/O contract: the mock implements a small `run({task, context}) -> output`
  contract (`agent-io.v1`) verified by a shared conformance suite, so a future
  real agent must match the same output shape.
- CI: `.github/workflows/ci.yml` runs `npm ci` -> prisma generate -> db push to
  an isolated CI database -> schema drift check (`prisma migrate diff
  --exit-code`) -> `npm test` -> `npm run demo:smoke`. A broken happy/bad-case
  branch turns the build red. The Audit page includes a mock CI panel that
  animates this same sequence for local demos without calling GitHub Actions.

### MVP Boundaries

- MCP integrations currently preserve worker allow-lists and interfaces but
  use credential-free stubs for Confluence, Penpot, Jira, and TestRail.
- Real LLM execution still requires provider credentials and a trusted CA
  chain for the configured HTTPS gateway.
- DEV E2B execution has an SDK-ready sandbox image, but production repository
  checkout, template lifecycle, and artifact collection remain integration
  work.
- Supabase configuration is still needed for hosted document storage flows,
  but it is not required for the local SQLite + JWT SDLC mock demo.

### Verified Local Checks

The following checks have been run successfully against the current local
implementation:

- `agents`: `python -m pytest` passes `10/10` tests.
- `backend`: `npm.cmd test` passes `58/58` Jest tests (includes the agent-output
  contract drift guard, the agent conformance suite, and the INVALID-handoff
  guard for PO->UX, UX->DEV, DEV->QA).
- `backend`: `npm.cmd run demo:smoke` verifies the complete deterministic happy
  path against an isolated smoke database.
- `backend`: `npx.cmd prisma migrate diff --exit-code` reports no schema drift
  (the CI drift guard; the repo uses db push, so `migrate diff` replaces the
  N/A `migrate status`).
- `frontend`: `npm.cmd run build` passes after the latest SDLC dashboard UI
  updates, including the Audit CI mock and scrollable phase transitions.
  Historical local checks also passed the Vitest suite and typecheck; rerun
  them before merging frontend changes.
- Mock workflow smoke tests verify prepared PO and UX review paths:
  low-confidence `58/100` -> reviewer comment -> owning worker rerun `92/100`
  -> automatic continuation to `QA_REVIEW`.
- Mock workflow smoke tests verify `add google login` reaches `DEV_REVIEW` with
  score `58/100` and the evidence issue `oauth_state_csrf_missing`; structured
  feedback reruns DEV, reaches QA `PASS`, and produces `100%` mock coverage.
- Release evidence smoke tests verify `FINAL_REVIEW` summarizes `HIGH`
  auth/OAuth/session risk, passing sandbox and security gates, QA `PASS`, and
  zero open blockers.
- Final release API smoke tests verify `FINAL_REVIEW -> RELEASED` and
  `FINAL_REVIEW -> RELEASE_REJECTED`. A finalized release cannot be overwritten.
- Project deletion was exercised through the running HTTP API:
  `DELETE /api/v1/projects/:id` returned `200`, and the deleted project's task
  and artifact counts both returned to `0`.

The full frontend lint command still reports `9 errors` and `35 warnings`
outside the SDLC dashboard, including existing React effect patterns in older
admin, auth, and project settings pages. Treat repository-wide lint cleanup as
a separate maintenance task.

## 3. Prerequisites

| Tool | Version |
| --- | --- |
| Node.js | 18+ |
| Python | 3.10+ |
| Git | 2.x+ |
| Docker Desktop | Optional, for Docker quick start |
| Supabase project | Optional for the local SDLC mock demo; required for hosted storage flows |

## 4. Configure Environment Variables

Create local environment files from the committed examples.

PowerShell:

```powershell
Copy-Item backend\.env.example backend\.env
Copy-Item agents\.env.example agents\.env
Copy-Item frontend\.env.example frontend\.env
```

Bash:

```bash
cp backend/.env.example backend/.env
cp agents/.env.example agents/.env
cp frontend/.env.example frontend/.env
```

### Root: `.env`

The optional root template configures repository-level AI hook logging and
documents DEV patch sandbox defaults. Create it only when using those helpers:

```env
AI_LOG_SERVER=https://ai-logs.note.transformerlabs.ai/api/ingest
AI_LOG_API_KEY=
AI_LOG_DIR=.ai-log

AGENT_REAL_SANDBOX=true
AGENT_WORKSPACE_REPO=.
AGENT_TEST_COMMANDS=python -m pytest -q
AGENT_TEST_TIMEOUT_SECONDS=300
AGENT_COMMIT_PATCH=true
AGENT_KEEP_WORKTREE=true
```

The agents service reads its own `agents/.env`, where the same `AGENT_*`
variables are included with local-safe defaults. `AGENT_REAL_SANDBOX=true`
applies generated DEV diffs inside an isolated Git worktree and runs
`AGENT_TEST_COMMANDS`. Keep it `false` when you only want deterministic
unified-diff format validation during local development.

### Backend: `backend/.env`

Use this template for the backend. Supabase values are only required when
testing hosted storage flows:

```env
PORT=3000
NODE_ENV=development

# Prisma datasource (required). Local dev points at dev.db; tests/CI/smoke
# override DATABASE_URL to an isolated sqlite file so they never touch dev.db.
DATABASE_URL="file:./dev.db"

SUPABASE_URL=https://your-project.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_your-project-publishable-key
SUPABASE_SECRET_KEY=sb_secret_your-project-secret-key
SUPABASE_STORAGE_BUCKET=documents
SUPABASE_AVATAR_BUCKET=avatars
SUPABASE_AUTH_REDIRECT_URL=http://localhost:5173/auth

AGENTS_BASE_URL=http://127.0.0.1:8001
FRONTEND_URL=http://localhost:5173

USE_MOCK_AGENTS=true
EXECUTION_PATH=claude-code
USE_MOCK_CLAUDE_CODE=true
ENABLE_LEGACY_WORKFLOWS=false

JWT_SECRET=replace-for-shared-environments
JWT_EXPIRES_IN=7d
ADMIN_JWT_SECRET=replace-for-shared-environments
ADMIN_JWT_EXPIRES_IN=8h
```

Use `AGENTS_BASE_URL`, not the older `AGENTS_SERVICE_URL` name.

- `SUPABASE_SECRET_KEY` is server-side only. Never expose it in the frontend.
- `USE_MOCK_AGENTS=true` skips real LLM calls in the SDLC workflow.
- `MOCK_LOW_CONFIDENCE_STAGE=dev-agent` selects the intermediate worker used
  to demonstrate reviewer feedback and rerun behavior in mock mode. Use
  `po-agent` or `ux-agent` to exercise their prepared review gates.
- `ENABLE_LEGACY_WORKFLOWS=false` keeps the old three-agent endpoints disabled.

For the local UI demo without LLM credentials, set:

```env
USE_MOCK_AGENTS=true
```

### Agents: `agents/.env`

Required when calling real AI agents:

```env
OPENAI_API_KEY=
OPENAI_API_BASE=
DEFAULT_MODEL=
PO_MODEL=kr/claude-sonnet-4.5
UX_MODEL=gpt-4o
QA_MODEL=deepseek-v4-pro
DEV_FALLBACK_MODEL=kr/claude-sonnet-4.5

PORT=8001
HOST=0.0.0.0
LOG_LEVEL=INFO

LANGFUSE_ENABLED=false
LANGFUSE_PUBLIC_KEY=
LANGFUSE_SECRET_KEY=
LANGFUSE_HOST=https://cloud.langfuse.com

AGENT_REAL_SANDBOX=false
AGENT_WORKSPACE_REPO=..
AGENT_TEST_COMMANDS=python -m pytest -q
AGENT_TEST_TIMEOUT_SECONDS=300
AGENT_COMMIT_PATCH=true
AGENT_KEEP_WORKTREE=true

USE_E2B_SANDBOX=false
E2B_API_KEY=
ANTHROPIC_API_KEY=
```

The provider must expose an OpenAI-compatible API. `PO_MODEL`, `UX_MODEL`, and
`QA_MODEL` select the LangChain-routed workers. `DEV_FALLBACK_MODEL` is used
only by the explicit local DEV fallback because the target v4 DEV path runs
Claude Agent SDK inside E2B. Set `USE_E2B_SANDBOX=true`, `E2B_API_KEY`, and
`ANTHROPIC_API_KEY` only when exercising that E2B path. Langfuse tracing is
optional.

### Frontend: `frontend/.env`

```env
VITE_API_URL=http://localhost:3000/api/v1
```

In local development this value is optional because Vite proxies `/api` to the
backend. Set it explicitly for deployed environments.

## 5. Install Dependencies

Use the lockfiles for reproducible Node.js installs.

PowerShell:

```powershell
python -m pip install -r agents\requirements.txt

Set-Location backend
npm.cmd ci
npx.cmd prisma db push

Set-Location ..\frontend
npm.cmd ci

Set-Location ..
```

Bash:

```bash
python -m pip install -r agents/requirements.txt

cd backend
npm ci
npx prisma db push

cd ../frontend
npm ci

cd ..
```

The backend Prisma schema uses local SQLite at `backend/prisma/dev.db`, and
local authentication uses JWT. Supabase remains available for hosted storage
flows.

## 6. Run The Application

### Option A: Docker Compose

After creating the three service `.env` files:

```powershell
docker compose up --build
```

Compose overrides the backend's manual-run agent URL with
`AGENTS_BASE_URL=http://agents:8001`, using the Docker service hostname.

| Service | URL |
| --- | --- |
| Frontend | <http://localhost:5173> |
| Backend health check | <http://localhost:3000/health> |
| Agents API docs | <http://localhost:8001/docs> |

Stop the stack:

```powershell
docker compose down
```

### Option B: Run Each Service Manually

Open three terminals from the repository root.

Terminal 1 - agents:

```powershell
Set-Location agents
python main.py
```

Terminal 2 - backend:

```powershell
Set-Location backend
npm.cmd run dev
```

Terminal 3 - frontend:

```powershell
Set-Location frontend
npm.cmd run dev
```

Open <http://localhost:5173>.

The committed examples use backend port `3000`. The current manually-run local
workspace may use another port, such as `3001`, when `backend/.env` and
`frontend/.env` are configured consistently:

```env
# backend/.env
PORT=3001

# frontend/.env
VITE_API_URL=http://127.0.0.1:3001/api/v1
```

### First Use

After signing in:

1. Create a project with the `+` button in the project sidebar, then select it.
2. Click `New Feature Request` in the top bar or `New feature request` on the
   Build page.
3. Enter the feature title and any useful description, priority, target user,
   business goal, or constraints. Click `Send directly to PO`.
4. Watch the visible `PO -> UX -> DEV -> QA` path. PO, UX, and DEV continue
   automatically while their confidence and validation checks pass. The
   MCP/HTTPS panel shows status-derived activity for each worker lane.
5. If an intermediate worker is held, use the automatically opened review
   modal. Add a review comment, blocking issue, expected fix, and acceptance
   checks, then click `Send feedback & rerun`.
6. At QA, review the output and choose `Approve & hand off` only after the
   automated QA recommendation is `PASS`.
7. In the final release gate, review the evidence summary. A project owner or
   admin can choose `Approve release` or `Reject`.
8. Open `Outputs` to inspect retained artifacts and A2A handoffs. Open `Audit`
   to inspect workflow metrics, the mock CI preflight gate, scrollable phase
   transitions, and the run timeline.

For the clearest local demo, submit `add google login`. PO classifies it as
`HIGH` risk and PO/UX auto-approve. DEV pauses with confidence `0.58` and the
concrete issue `oauth_state_csrf_missing`. Ask DEV to validate OAuth `state`
against the login session, attach passing security notes, and rerun sandbox
checks. The review modal also provides `Fill demo review feedback` for this
scenario. The mock DEV rerun returns confidence `0.92`, security gate `PASS`,
and the pipeline continues automatically to QA. After QA approval, the final
release gate displays the evidence summary and `100%` mock coverage.

To exercise the prepared PO or UX human-review paths instead, set one of these
values in `backend/.env` and restart the backend:

```env
MOCK_LOW_CONFIDENCE_STAGE=po-agent
```

```env
MOCK_LOW_CONFIDENCE_STAGE=ux-agent
```

For local mock authentication, use:

```text
admin@vfs.com
admin123
```

## 7. Run Tests

Tests are split into three independent suites. Run all three before opening a
pull request.

### Python Agents

From the repository root:

```powershell
python -m pytest
```

Pytest discovers `agents/tests/unit/test_*.py` through `pytest.ini`. These tests
do not require the services to be running or real LLM credentials.

Run a single Python test file:

```powershell
python -m pytest agents\tests\unit\test_sandbox.py -v
```

### Backend

```powershell
Set-Location backend
npm.cmd test
```

This runs Jest integration tests serially through `jest --runInBand`.

If Jest reports `Cannot find module '@prisma/client'`, restore dependencies and
generate the Prisma client:

```powershell
npm.cmd ci
npx.cmd prisma db push
npm.cmd test
```

Run the demo scenario preflight before a demo or merge. It drives all six
deterministic branches through the mock layer and asserts the expected outcome.
It forces an isolated `smoke.db` (it never touches `dev.db`):

```powershell
npm.cmd run demo:smoke
```

### Frontend

```powershell
Set-Location frontend
npm.cmd test
```

This runs the Vitest suite once through `vitest run`.

If PowerShell reports that `vitest` is not recognized, restore dependencies:

```powershell
npm.cmd ci
npm.cmd test
```

### Frontend Static Checks

```powershell
Set-Location frontend
npm.cmd run typecheck
npm.cmd run build
```

Run repository-wide lint when working on cleanup:

```powershell
npm.cmd run lint
```

The current SDLC dashboard changes pass ESLint. Older unrelated pages still
contain `9 errors` and `35 warnings`.

### Full Local Verification

From the repository root:

```powershell
python -m pytest

Set-Location backend
npm.cmd test

Set-Location ..\frontend
npm.cmd test
npm.cmd run typecheck
npm.cmd run build

Set-Location ..
```

### Optional E2B Sandbox Experiment

`sandbox/test_e2b.py` is not part of the default pytest suite. It invokes an
external sandbox and requires credentials:

```powershell
$env:E2B_API_KEY = "your-key"
$env:OPENAI_API_KEY = "your-key"
python sandbox\test_e2b.py
```

### Continuous Integration

`.github/workflows/ci.yml` runs on pushes to `main`, `staging`, `features/**`
and on pull requests. The backend job, against an isolated CI SQLite database
(`DATABASE_URL=file:./ci.db`):

1. `npm ci`
2. `npx prisma generate`
3. `npx prisma db push --skip-generate --accept-data-loss`
4. Schema drift guard: `npx prisma migrate diff --exit-code` (exit 2 on drift)
5. `npm test`
6. `npm run demo:smoke`

The Prisma datasource reads `env("DATABASE_URL")`, so tests and the smoke run on
isolated databases and never touch the committed `dev.db`. Jest defaults the
value via `tests/setupEnv.js`; the smoke forces its own `smoke.db`.

For local demos, the Audit page (`/sdlc/audit`) includes a mock CI preflight
panel that visualizes the same six steps above and ends in a merge-gate pass
state. It is a frontend-only demo aid; the real enforcement remains the GitHub
Actions workflow.

## 8. API Overview

The backend listens on port `3000` by default. Use the `PORT` value from
`backend/.env` if the local workspace overrides it.

| Prefix | Purpose |
| --- | --- |
| `GET /health` | Backend health check |
| `/api/v1/auth` | Sign-up, sign-in, OAuth, and password flows |
| `/api/v1/projects` | Project and membership management |
| `/api/v1/documents` | Document upload and management |
| `/api/v1/sdlc` | Current four-worker AIDLC workflow |
| `/api/v1/workflows` | Legacy three-agent workflow, disabled by default |
| `/api/v1/admin` | Admin authentication and dashboard APIs |

The current workflow lives under `/api/v1/sdlc`. Only enable
`ENABLE_LEGACY_WORKFLOWS=true` when intentionally testing the older flow.

Useful current SDLC endpoints:

| Endpoint | Purpose |
| --- | --- |
| `POST /api/v1/sdlc/run-po-agent` | Start the visible workflow from a feature request |
| `POST /api/v1/sdlc/run-ux-agent` | Run UX from an approved PO handoff |
| `POST /api/v1/sdlc/run-dev-agent` | Run DEV from an approved UX handoff |
| `POST /api/v1/sdlc/run-qa-agent` | Run QA from an approved DEV handoff |
| `POST /api/v1/sdlc/tasks/:task_id/decision` | Submit a structured HITL decision |
| `GET /api/v1/sdlc/status/:task_id` | SSE task status stream |
| `GET /api/v1/sdlc/workflow-status?project_id=...` | Current workflow state (phases, `awaitingReview`, release gate) |
| `POST /api/v1/sdlc/projects/:project_id/release-decision` | Approve or reject the final release after QA approval |
| `GET /api/v1/sdlc/projects/:project_id/artifacts` | Load retained worker outputs and A2A handoffs |
| `GET /api/v1/sdlc/audit-trail/:project_id` | Audit events plus a synthesized `phaseTransitions` chain |
| `GET /api/v1/sdlc/workflow/:id/timeline` | Alias of the audit trail (UI-friendly path) |
| `GET /api/v1/sdlc/projects/:project_id/metrics` | Workflow health metrics |
| `DELETE /api/v1/projects/:id` | Delete an owned project and its workflow data |

## 9. Documentation Map

| Document | Purpose |
| --- | --- |
| [CURRENT_WORKFLOW.md](CURRENT_WORKFLOW.md) | Detailed current PO-first workflow: state machine, validation/INVALID, gates, A2A handoffs, output contracts, resilience, observability, mock scenarios, and CI |
| [docs/architecture.md](docs/architecture.md) | High-level system architecture |
| [docs/QUALITY_GATE_RULES.md](docs/QUALITY_GATE_RULES.md) | Quality gate rules and scoring |
| [docs/backend/agent-artifact-flow.md](docs/backend/agent-artifact-flow.md) | Backend artifact persistence flow |
| [docs/project/6-week-roadmap.md](docs/project/6-week-roadmap.md) | Delivery roadmap |
| [docs/project/v4-alignment.md](docs/project/v4-alignment.md) | v4 alignment status and remaining production work |
| [docs/project/QA_Testing.md](docs/project/QA_Testing.md) | Historical QA scenario notes |
| [AGENTS.md](AGENTS.md) | Agent roles, model requirements, and outputs |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Contribution checklist |
| [CHANGELOG.md](CHANGELOG.md) | Change history |

Project journals, feedback, and review notes are kept under `docs/project/`.
Research notes are kept under `docs/research/`.

## 10. Notes For Contributors

- Do not commit `.env` files or API keys.
- Keep the four-worker flow under `/api/v1/sdlc` as the primary workflow.
- Treat `workspace/` as generated project artifacts.
- Update this root README when setup or test commands change. Do not add
  service-specific README files.

## Documentation

To help you understand the architecture, vision, and detailed design of the system, the project documentation has been consolidated into the `/docs` directory:

*   **Core Systems:**
    *   [Architecture Overview](docs/core/ARCHITECTURE.md) - High-level system structure and data flow.
    *   [AI Agents](docs/core/AGENTS.md) - Role description and specifications of PO, UX, DEV, and QA Agents.
    *   [Project Blueprint](docs/core/blueprint.md) - Detailed vision and scope of the autonomous software factory.
    *   [Sequence Flow](docs/core/sequence.md) - BMAD Human-in-the-Loop flow sequence diagram.
*   **Processes & Quality:**
    *   [QA Testing Guide](docs/process/QA_Testing.md) - Testing workflows, manual verification, and test status.
    *   [Code Review Report v0.1](docs/process/review_0.1.md) - Structural audit of codebase v0.1.
    *   [Contributing Guide](docs/process/CONTRIBUTING.md) - Guidelines for contributing code.
*   **Planning & References:**
    *   [6-Week Roadmap](docs/planning/6-week-roadmap.md) - Phase targets and delivery timeline.
    *   [User Feedback](docs/planning/USER_FEEDBACK.md) - Human review and system improvement notes.
    *   [OMO & HITL Reference](docs/reference/omo.md) - Detailed guide to OMO runtime loop & hooks.

## License

MIT. See [LICENSE](LICENSE).
