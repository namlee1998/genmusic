# AI Agents Configuration

This document outlines the strict guidelines and configurations for the 4 AI workers in the v4 AIDLC pipeline.

## 1. Product Owner (PO) Agent
- **Role**: Parses the feature request and converts it into a formal Product Requirements Document (PRD), User Stories, and Acceptance Criteria.
- **Model**: Claude Sonnet through the LangChain router.
- **MCP Allow-list**: Confluence search and page write.
- **Output**: PRD Markdown, User Stories JSON, AC List.

## 2. UX Designer (UX) Agent
- **Role**: Reads the PRD and Acceptance Criteria to generate a UX Spec, User Flow, and Mock Wireframes.
- **Model**: GPT through the LangChain router.
- **MCP Allow-list**: Penpot wireframe publish.
- **Output**: UX Specification and Flow diagrams.

## 3. Developer (DEV) Agent
- **Role**: Reads PRD and UX Specs to write code diffs and implementation plans inside an E2B sandbox.
- **Model**: Claude Agent SDK.
- **MCP Allow-list**: Repository read/write and test execution.
- **Guardrails**:
  - `temperature`: 0.0 (Deterministic output).
  - `max_tokens`: 8192 (Prevent runaway loops).
  - `thinking`: `true` (Enabled for advanced reasoning).

## 4. Quality Assurance (QA) Agent
- **Role**: Reviews the DEV output and PRD to generate Test Cases, QA Reports, and an Acceptance Criteria Coverage Matrix.
- **Model**: DeepSeek through the LangChain router.
- **MCP Allow-list**: Jira and TestRail writes.
- **Output**: Coverage matrices and Release Recommendation (PASS/HOLD/REWORK).

## Pipeline Contract
- The visible flow is `PO -> UX -> DEV -> QA`.
- Every approved stage emits an A2A handoff envelope with an `approval_id`.
- A Human-in-the-Loop gate follows every worker. QA approval is blocked unless the automated quality gate returns `PASS`.
- The old Intent Agent endpoint remains only as a compatibility adapter for legacy data.
