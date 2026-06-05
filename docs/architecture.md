# System Architecture

> **Kiến trúc hiện tại:** Multica + Claude Code CLI (không dùng API key)
> **Cập nhật:** Đã thay thế LangChain/E2B/LangGraph bằng Multica platform
> **Plan chi tiết:** [project/MULTICA_INTEGRATION_PLAN.md](project/MULTICA_INTEGRATION_PLAN.md)

---

## Core Flow

```
Repo URL → Clone → Analyze → PO Agent → UX Agent → DEV Agent → Sandbox Gate → QA Agent → QA.md commit
                                   ↑ HITL         ↑ HITL      ↑ HITL                   ↑ HITL
```

---

## Components

### 1. Frontend (React + TypeScript)

Dashboard tập trung vào **approval workflow** — hiện rõ agent nào cần approve và cần approve gì.

4 components chính:
- **RepoInput** — User paste GitHub/GitLab URL → trigger pipeline
- **PipelineStepper** — Hiện tiến trình 6 bước real-time
- **ApprovalQueue** — Danh sách các items cần human review (confidence < 80%)
- **QAResultCard** — Kết quả QA cuối cùng + approve/reject release

### 2. Backend (Node.js)

Owns toàn bộ workflow state, HITL decisions, artifact storage.

Services chính:
- **GitService** — Clone repo, analyze codebase, commit QA.md
- **MulticaClient** — Tạo issue/task trên Multica, poll status
- **SdlcWorkflowService** — Orchestrate pipeline: PO → UX → DEV → Sandbox Gate → QA

### 3. Multica Platform (Self-hosted Docker)

Task management cho multi-agent workflow. Chạy trên `localhost:8080`.

- **Multica Server** — PostgreSQL-backed task queue + REST API
- **Multica Daemon** — Local daemon: nhận tasks, spawn agent CLI processes
- **Claude Code CLI** — Được daemon spawn với prompt template → thực thi qua session login

```
Backend → POST /api/issues (Multica) → Daemon → spawn `claude -p "..."` → output → done
```

### 4. Sandbox Gate (G3)

Kiểm thử DEV output trước khi đẩy sang QA. Chạy tests trong Docker container isolated.

- **Git Worktree** (`agents/src/tools/sandbox.py`) — Extract patch, validate format, prepare workspace
- **Docker Sandbox** (`sandbox/docker_sandbox.py`) — Chạy `npm test / pytest` trong container với:
  - `--network=none` — Cắt internet
  - `--memory=512m` — Giới hạn RAM
  - `--read-only` — Không ghi host filesystem

### 5. Agent Prompt Templates (`agents/`)

Không gọi LLM API trực tiếp. Chỉ chứa:
- **Prompt templates** — `build_<agent>_prompt()` functions
- **Output parsers** — `parse_<agent>_output()` functions
- **Schemas** — Pydantic models cho structured output

---

## Data Flow

```
1. User: paste repo URL
2. Backend: git clone --depth 1 → workspace/projects/<id>/repo/
3. Backend: analyze repo → { techStack, fileCount, components }
4. Backend: Multica.createIssue() → PO Agent task
5. Daemon: spawn claude -p "<po_prompt + repo_analysis>"
6. Claude CLI: → output PRD JSON
7. Backend: parse output, check confidence → HITL nếu cần
8. Backend: Multica.createIssue() → UX Agent task
9. ... (UX → DEV tương tự)
10. Backend: Sandbox Gate → apply patch → docker run tests
11. Sandbox fail: tạo DEV retry issue (max 2 lần)
12. Sandbox pass: Multica.createIssue() → QA Agent task
13. QA complete: GitService.commitQAReport() → QA.md trong repo
14. FE: QAResultCard → User approve/reject release
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite, Zustand |
| Backend | Node.js, Express |
| Agent Orchestration | Multica (self-hosted Docker, Go/PostgreSQL) |
| Agent Execution | Claude Code CLI (subprocess, session login) |
| Sandbox Testing | Docker Local (`aidlc-sandbox:latest`) |
| Repo Management | Git CLI via child_process |
| Agent Prompts | Python (template functions only, no SDK) |

---

## Environment Variables

```env
# Multica
MULTICA_URL=http://localhost:8080

# Git workspace
GIT_WORKSPACE=workspace/projects

# Sandbox (Docker)
AGENT_REAL_SANDBOX=true
SANDBOX_DOCKER_IMAGE=aidlc-sandbox:latest
SANDBOX_MEMORY_LIMIT=512m
SANDBOX_CPU_LIMIT=1

# Pipeline
AGENT_TEST_COMMANDS=npm test
CONFIDENCE_THRESHOLD=80
MAX_DEV_RETRIES=2

# Development
USE_MOCK_AGENTS=false
```

---

## Xem thêm

- [project/MULTICA_INTEGRATION_PLAN.md](project/MULTICA_INTEGRATION_PLAN.md) — Kế hoạch tích hợp chi tiết 7 ngày
- [project/TASK_GIANG_FE.md](project/TASK_GIANG_FE.md) — Công việc Frontend (Giang)
- [project/TASK_MINH_BE.md](project/TASK_MINH_BE.md) — Công việc Backend (Minh)
- [project/TASK_NAM_AGENT.md](project/TASK_NAM_AGENT.md) — Công việc Agent (Nam)
- [core/AGENTS.md](core/AGENTS.md) — Chi tiết từng agent
