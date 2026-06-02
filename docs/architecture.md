# System Architecture

## Core Flow
The visible v4 AIDLC workflow is sequential:

```text
Feature Request -> PO -> HITL -> UX -> HITL -> DEV -> HITL -> QA -> Quality Gate -> HITL
```

The Node.js backend owns workflow state, Human-in-the-Loop decisions, persisted artifacts, and A2A handoff records. The React dashboard exposes the same four-worker flow. The old Intent endpoint is retained only as a compatibility adapter for legacy records.

## Components

### 1. Workflow Adapter (`backend/src/services/SdlcWorkflowService.js`)
- Runs the PO-first workflow and persists each worker task.
- Records an A2A envelope with `approval_id` after every approval.
- Blocks QA approval unless the automated quality gate returns `PASS`.
- Keeps legacy Intent tasks readable during migration.

Microsoft Agent Framework is the target production orchestrator. The current repository uses this in-process adapter while that integration is built.

### 2. Python Agent Service (`agents/`)
- Active requests dispatch directly to one LangChain worker at a time. The old
  LangGraph experiment is not imported by the running service.
- PO uses Claude through the LangChain router.
- UX uses GPT through the LangChain router.
- DEV is scaffolded for Claude Agent SDK execution inside E2B.
- QA uses DeepSeek through the LangChain router.
- MCP tools are restricted by a worker-specific allow-list and currently use local mocks.

### 3. Human-in-the-Loop
- Every worker pauses at a review gate.
- Reviewers can approve, reject, or request rework with feedback.
- QA approval is additionally guarded by deterministic quality thresholds.

### 4. Streaming And Audit
- Python workers expose HTTP and SSE endpoints.
- Node.js forwards progress to the React dashboard.
- Audit timeline data is persisted with tasks, artifacts, HITL decisions, and A2A handoffs.

See [project/v4-alignment.md](project/v4-alignment.md) for the distinction between implemented behavior and production integration work.
