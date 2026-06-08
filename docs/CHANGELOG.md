# Changelog

All notable changes to the AIDLC Control Platform (Team 6) will be documented in this file.

## [3.0.0] - AIFA v3 Risk-Gated Workflow
### Added
- Claude Code mock execution path through the production-shaped `onGate` interface.
- Risk classifier with `auto`, `approval`, and `block` actions.
- Idempotent pending gate bridge, question gates, watchdog, and gate audit events.
- Repo URL, server repo, and browser folder-upload inputs.
- PO route classification and optional UX skip for non-UI work.
- PO and DEV human clarification gates.
- UX Penpot SVG mock and inline frontend preview.
- Three-layer schema, semantic, and risk validation.
- Route-aware A2A contracts and coherent workflow-chain status.
- Multi-part release bundle with branch, commit/diff, `final.md`, QA report, and release decision.
- Chrome/Edge File System Access flow to update an existing local `final.md`.
- Dedicated Claude Code smoke test and AIFA gate integration tests.

### Changed
- QA now starts only after the matching DEV run is completed, committed, and has no pending gate.
- QA always pauses at human review before final release.
- Question gates lock downstream agents while threshold-safe outputs still auto-advance.
- Downstream startup failures no longer overwrite completed upstream tasks as failed.
- Release decisions are scoped to the current QA run.
- Pending gate metadata is persisted; orphaned gates are surfaced as
  `interrupted` after backend restart.
- Added one-week persisted execution-control and three-week real-data roadmaps.
- Consolidated completed backend-improvement and known-limitations documents
  into the implementation summary; removed duplicate source roadmaps.

### Known Limitations
- Real Claude Code execution remains a stub.
- Live gate continuation remains in-memory; restart recovery cannot yet resume
  from the gate and currently surfaces it as `interrupted`.
- Local file write-back requires Chrome/Edge and user-granted folder write permission.

## [1.1.0] - SDLC Factory Finalization
### Added
- Static Model Mapping in `router.py` to enforce strict agent-to-model assignments.
- Hybrid LLM token guardrail (Fallback to large-context models if inputs > 64k tokens).
- Flexbox layout fix in React frontend to prevent Pipeline overlapping UI bugs.
- `with_structured_output` fallback alternatives via robust RegEx Parsing to preserve SSE streaming capabilities.

### Removed
- Legacy AI Agents (`agent_1.py`, `agent_2.py`, `agent_3.py`) from previous experimental phases.
- Hardcoded auth bypass in `AuthService.js` (Restored Supabase integrity).

## [1.0.0] - Initial Dashboard Release
### Added
- React (Vite) Frontend with Glassmorphism dashboard.
- LangGraph Python Backend with SSE streaming.
- Human-in-the-loop Gates and Sandbox Rework functionality.
