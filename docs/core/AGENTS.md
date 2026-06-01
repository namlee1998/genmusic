# AI Agents Configuration

This document outlines the strict guidelines and configurations for the 5 AI agents operating in the LangGraph pipeline.

## 1. Intent Agent
- **Role**: Parses user input to extract core business intents and assumptions.
- **Model**: `gpt-4o-mini` (Fast and cheap).
- **Output**: JSON payload with `intent_assumptions`.

## 2. Product Owner (PO) Agent
- **Role**: Takes intent assumptions and converts them into a formal Product Requirements Document (PRD), User Stories, and Acceptance Criteria.
- **Model**: `gpt-4o-mini` or `deepseek-v4-flash`.
- **Output**: PRD Markdown, User Stories JSON, AC List.

## 3. UX Designer (UX) Agent
- **Role**: Reads the PRD and Acceptance Criteria to generate a UX Spec, User Flow, and Mock Wireframes.
- **Model**: `gpt-4o-mini`.
- **Output**: UX Specification and Flow diagrams.

## 4. Developer (DEV) Agent
- **Role**: The core coding engine. Reads PRD and UX Specs to write actual code diffs and implementation plans.
- **Model**: `deepseek-v4-pro` (Strict requirement).
- **Guardrails**:
  - `temperature`: 0.0 (Deterministic output).
  - `max_tokens`: 8192 (Prevent runaway loops).
  - `thinking`: `true` (Enabled for advanced reasoning).

## 5. Quality Assurance (QA) Agent
- **Role**: Reviews the DEV output and PRD to generate Test Cases, QA Reports, and an Acceptance Criteria Coverage Matrix.
- **Model**: `deepseek-v4-pro` (To handle large code contexts).
- **Output**: Coverage matrices and Release Recommendation (PASS/HOLD/REWORK).
