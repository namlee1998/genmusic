# V4 Alignment Status

Reference: `KE_HOACH_DU_AN.md` v4.

## Implemented

- Product flow starts at `PO -> UX -> DEV -> QA`; the old Intent endpoint is legacy-only.
- Active Python requests dispatch directly to LangChain workers; the LangGraph
  experiment is isolated from the running server.
- Every worker output requires HITL approval before the next worker can run.
- Approval writes an `a2a_handoff` artifact with `approval_id`.
- Audit Trail API surfaces worker activity, HITL decisions, and A2A handoffs.
- QA approval is blocked until the automated quality gate returns `PASS`.
- Quality gate enforces the v4 baseline: coverage >= 80%, bad-case ratio >= 30%,
  boundary cases >= 2, duplicate rate <= 5%, and zero scope violations.
- MCP layer has a hard worker allow-list and credential-free MVP stubs for
  Confluence, Penpot, Jira, and TestRail.
- DEV E2B image installs `claude-agent-sdk`; the sandbox runner invokes the SDK
  with `Read`, `Write`, `Bash`, `Grep`, and `Glob`.

## Scaffolded, Not Production-Ready

- The current Node orchestration service is an MVP adapter. Microsoft Agent
  Framework checkpoint/routing replacement remains an integration task.
- E2B runtime still needs a built template, repository upload/checkout, and
  production artifact collection.
- MCP mocks preserve interfaces but do not call external services.
- Penpot preview URLs are represented by the stub boundary; self-hosted Penpot
  deployment and REST adapter remain external setup work.

## Local Runtime Notes

- Agents service uses `http://127.0.0.1:8001`.
- Configure provider aliases with `PO_MODEL`, `UX_MODEL`, `QA_MODEL`, and
  `DEV_FALLBACK_MODEL`.
- Real LLM execution requires provider credentials and a trusted CA chain for
  the configured HTTPS gateway.
