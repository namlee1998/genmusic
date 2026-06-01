# AIDLC Control Platform — Team 6

> **End-to-End Autonomous Software Factory** — Multi-AI Agent SDLC Automation with Quality Gates

[![GitHub Stars](https://img.shields.io/github/stars/team6/aidlc-platform)](https://github.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Python 3.10+](https://img.shields.io/badge/Python-3.10%2B-blue)](https://python.org)
[![Node.js 18+](https://img.shields.io/badge/Node.js-18%2B-green)](https://nodejs.org)

---

## Overview

An intelligent platform that automates the entire Software Development Life Cycle — from a raw feature request to production-ready code with full test coverage — using 5 specialized AI agents with a Human-in-the-Loop review system.

```
Feature Request → [Intent] → [PO] → [UX] → [DEV + Sandbox] → [QA + Quality Gate] → Human Review
```

### Key Features

- 🤖 **5 AI Agents**: Intent, PO (Product Owner), UX Designer, Developer, QA Engineer
- 🔒 **Quality Gate System**: Rule-based test coverage enforcement (SMALL/MEDIUM/LARGE task tiers)
- 🏃 **Async Security Scan**: Detects hardcoded secrets, SQL injection, missing error handling
- 👤 **Human-in-the-Loop (HITL)**: Approve, reject, or request changes at each gate
- 🔄 **Smart Rework Routing**: Feedback analyzed to re-run only the affected agent
- 📊 **Real-time SSE Streaming**: Live token streaming in the dashboard
- 🧪 **Sandbox Gate**: Validates git diffs before QA with auto-retry

---

## Architecture

```
frontend/          React/Vite dashboard (TypeScript, Zustand)
├── SdlcDashboard  HITL control panel + real-time logs
├── KanbanBoard    Feature backlog management
└── AuditTimeline  Decision history

backend/           Node.js/Express API gateway
├── SdlcWorkflowService   Orchestration + artifact storage
├── QualityGateService    Post-QA rule evaluation
└── AgentService          HTTP bridge to Python agents

agents/            Python FastAPI + LangGraph
├── intent_agent   Feature request → AI assumptions
├── po_agent       Assumptions → PRD + User Stories + AC
├── ux_agent       PRD → UX Spec + User Flow + Wireframes
├── dev_agent      PRD + UX → Implementation Plan + Git Diff
├── qa_agent       All artifacts → Test Cases + QA Report
└── quality_gate   Test cases → Score + PASS/HOLD/REWORK
```

---

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | 18+ |
| Python | 3.10+ |
| Git | 2.x+ |
| Supabase account | Free tier OK |

---

## Local Run Guide

### Step 1 — Clone & Configure

```bash
git clone <repo-url>
cd Team_6_End-to-End-Autonomous-Software-Factory-Multi-AI-Agent
```

### Step 2 — Configure Environment Variables

**Backend** (`backend/.env`):
```env
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SECRET_KEY=your-service-role-key

# Agent service
AGENTS_SERVICE_URL=http://localhost:8000

# Set to 'true' to use mock data (no AI API calls)
USE_MOCK_AGENTS=false

# Optional: JWT secret for local auth bypass
JWT_SECRET=your-jwt-secret
```

**AI Agents** (`agents/.env`):
```env
# OpenAI-compatible API key (works with DeepSeek, Litellm, etc.)
OPENAI_API_KEY=sk-...
OPENAI_API_BASE=https://api.openai.com/v1   # or your custom gateway

# Default model (overridable per-agent)
DEFAULT_MODEL=gpt-4o-mini

# Sandbox (optional — validates git diffs by applying them)
AGENT_REAL_SANDBOX=false
# AGENT_TEST_COMMANDS=pytest,npm test
# AGENT_WORKSPACE_REPO=/path/to/test/repo
```

**Frontend** (`frontend/.env`):
```env
VITE_BACKEND_URL=http://localhost:3000
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### Step 3 — Install Dependencies

```bash
# Backend
cd backend && npm install

# Frontend
cd ../frontend && npm install

# AI Agents
cd ../agents && pip install -r requirements.txt
```

### Step 4 — Start All Services

Open **3 terminal windows**:

**Terminal 1 — AI Agents** (port 8000):
```bash
cd agents
python main.py
# → FastAPI server at http://localhost:8000
# → Docs: http://localhost:8000/docs
```

**Terminal 2 — Backend** (port 3000):
```bash
cd backend
npm run dev
# → Express server at http://localhost:3000
```

**Terminal 3 — Frontend** (port 5173):
```bash
cd frontend
npm run dev
# → Vite server at http://localhost:5173
```

### Step 5 — Open the Dashboard

Navigate to: **http://localhost:5173**

Login with your Supabase credentials, or use the mock admin (if `USE_MOCK_AGENTS=true` and mock auth configured): `admin@vfs.com` / `admin123`

---

## Mock Mode (No API Costs)

For UI development without spending tokens:

```env
# backend/.env
USE_MOCK_AGENTS=true
```

Mock data is served from `mock-data/<agent-type>/` directory. Each file is served as a pre-filled artifact. No Python agent calls are made.

> **Note**: Quality Gate evaluation still runs in mock mode using the stored test case data.

---

## Quality Gate System

After QA Agent completes, the **Quality Gate** automatically evaluates test coverage against hard rules:

| Task Tier | Min Test Cases | Gate Type | Approvers |
|-----------|---------------|-----------|-----------|
| **SMALL** | 3 (1 happy, 1 negative) | FAST | 1 |
| **MEDIUM** | 8 (2 happy, 3 neg, 2 edge, 1 security) | ASYNC + Security Scan | 2 |
| **LARGE** | 15 (3 happy, 5 neg, 4 edge, 3 security) | STRICT | 3 |

**Score → Recommendation:**
- `PASS` (≥70/80/90 pts, no blockers) → Gate approves
- `HOLD` (partial coverage) → Human review required
- `REWORK` (blocker violations) → Auto-triggers QA re-run

See full documentation: [docs/QUALITY_GATE_RULES.md](docs/QUALITY_GATE_RULES.md)

---

## SDLC Workflow

```
1. Submit Feature Request
        ↓
2. Intent Agent — generates AI Assumptions
        ↓ [HUMAN: APPROVE / REQUEST_CHANGES]
3. PO Agent — PRD, User Stories, Acceptance Criteria
        ↓ [HUMAN: APPROVE / REQUEST_CHANGES]
4. UX Agent — UX Spec, User Flow, Wireframes
        ↓ [HUMAN: APPROVE / REQUEST_CHANGES]
5. DEV Agent — Implementation Plan, Git Diff
    → Sandbox Gate (validates diff, auto-retries ×2)
        ↓ [HUMAN: APPROVE / REQUEST_CHANGES]
6. QA Agent — Test Cases, QA Report, AC Coverage
    → Quality Gate (score 0-100, PASS/HOLD/REWORK)
        ↓ [HUMAN: APPROVE / REQUEST_CHANGES]
7. Final Review Packet (all artifacts)
```

### Smart Rework

When a human submits `REQUEST_CHANGES`, the system **routes feedback to the right agent**:

| Feedback contains | Routes to |
|------------------|-----------|
| "prd", "requirements", "ac" | PO Agent |
| "ux", "design", "wireframe" | UX Agent |
| "code", "api", "backend" | DEV Agent |
| "test", "coverage", "qa" | QA Agent |

---

## Project Structure

```
.
├── agents/                    Python FastAPI + LangGraph agents
│   ├── src/
│   │   ├── agents/            Agent implementations (5 agents)
│   │   ├── quality_gate/      Quality Gate rules + evaluator ⭐
│   │   ├── workflows/         LangGraph pipeline (main_pipeline.py)
│   │   ├── schemas/           Pydantic models
│   │   ├── tools/             Sandbox validation
│   │   └── utils/             Hybrid LLM router
│   └── main.py
│
├── backend/                   Node.js/Express API gateway
│   └── src/
│       ├── services/
│       │   ├── SdlcWorkflowService.js
│       │   ├── QualityGateService.js  ⭐
│       │   └── AgentService.js
│       ├── config/
│       │   └── qualityGateRules.js    ⭐
│       ├── models/            Supabase ORM
│       ├── controllers/       HTTP handlers
│       └── routes/            Express routes
│
├── frontend/                  React/Vite TypeScript dashboard
│   └── src/
│       ├── pages/SdlcDashboard/
│       ├── components/
│       └── services/
│
├── docs/
│   ├── QUALITY_GATE_RULES.md  ⭐ Gate rule documentation
│   └── ARCHITECTURE.md
│
├── mock-data/                 Mock artifacts for UI development
├── ARCHITECTURE.md            System design
├── AGENTS.md                  Agent specifications
└── CLAUDE.md                  AI coding guidelines
```

---

## Documentation

| Document | Description |
|----------|-------------|
| [ARCHITECTURE.md](ARCHITECTURE.md) | System design, components, data flow |
| [AGENTS.md](AGENTS.md) | Agent roles, models, output schemas |
| [docs/QUALITY_GATE_RULES.md](docs/QUALITY_GATE_RULES.md) | Quality Gate rule definitions, scoring |
| [CONTRIBUTING.md](CONTRIBUTING.md) | How to contribute |
| [CLAUDE.md](CLAUDE.md) | AI coding guidelines for this repo |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| AI Agents | Python 3.10+, LangGraph, FastAPI, LangChain |
| LLM Models | DeepSeek v4 Pro (DEV/QA), GPT-4o-mini (Intent/PO/UX) |
| Backend | Node.js 18+, Express, Supabase (PostgreSQL) |
| Frontend | React 18, Vite, TypeScript, Zustand, TailwindCSS |
| Quality Gate | Custom rule engine (Python + Node.js mirror) |
| Streaming | Server-Sent Events (SSE) + LangChain `astream_events` |

---

## License

MIT License — see [LICENSE](LICENSE)

---

*Team 6 — End-to-End Autonomous Software Factory | 2026*
