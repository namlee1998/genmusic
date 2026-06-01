# Changelog

All notable changes to the AIDLC Control Platform (Team 6) will be documented in this file.

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
