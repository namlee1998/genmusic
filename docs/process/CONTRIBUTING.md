# Contributing to AIDLC

Thank you for investing your time in contributing to the Team 6 SDLC Factory!

## Code Standards
### Python (Agents)
- Follow **PEP 8** guidelines.
- Use strict typing for function signatures (`-> dict`, `model_config: dict | None`).
- All new Agents must be integrated into `main_pipeline.py` and strictly adhere to the `PipelineState` schema.
- Run `pytest` before submitting PRs.

### JavaScript/TypeScript (Backend & Frontend)
- Ensure all React components are functional and use standard hooks.
- Do not mix business logic with UI rendering. Use `zustand` stores.
- Run `npm test` and ensure Vitest/Jest suites pass completely.

## Pull Request Process
1. Ensure all Unit Tests pass 100% across all 3 tiers (Python, Node, React).
2. Do NOT commit `.env` files or API Keys.
3. Request review from a Senior AI Architect before merging to `main`.
