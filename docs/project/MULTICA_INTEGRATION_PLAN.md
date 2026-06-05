# Kế Hoạch Tái Cấu Trúc AIDLC Platform — Tích Hợp Multica

> **Ngày tạo:** 2026-06-05
> **Tác giả:** Team 6
> **Trạng thái:** Đã được mentor review & approve hướng tiếp cận
> **Thời gian ước lượng:** 7 ngày làm việc

---

## 1. Bối Cảnh & Nguồn Gốc

### 1.1 Các Recommendation từ Mentor

Mentor đã đưa ra 4 recommendation cốt lõi cho dự án:

| # | Recommendation gốc | Giải thích |
|---|---|---|
| 1 | "Nắm thẳng repo link vào rồi chia component, chạy pipeline → đưa QA.md vào repo local" | Thay đổi input flow: từ form text → repo URL. Output: commit QA.md ngược lại repo |
| 2 | "FE khi mở hiện ngay cái cần approve, agent nào, approve cái gì" | Đơn giản hóa giao diện, tập trung vào approval workflow |
| 3 | "Hook lên Claude Code (không dùng API key) — nghiên cứu Multica" | Dùng Multica platform để orchestrate Claude Code CLI — no API key needed |
| 4 | "Xác định lại kiến trúc và các bước, thư viện" | Cleanup dependencies thừa, rõ ràng hóa tech stack |

### 1.2 Research: Multica là gì?

**Multica** (`multica-ai/multica`) là một open-source platform quản lý AI coding agents như "first-class teammates":

- **GitHub:** `https://github.com/multica-ai/multica`
- **Website:** `https://multica.ai`
- **License:** Open Source
- **Tên gốc:** Lấy cảm hứng từ hệ điều hành **Multics** (1960s) — time-sharing cho nhiều users. Multica = "multiplexing" cho software teams

**Tính năng chính:**

| Tính năng | Mô tả |
|---|---|
| **Multi-CLI Support** | Hỗ trợ: Claude Code, Codex, Gemini, Cursor Agent, OpenClaw, Hermes, Kimi, Kiro CLI |
| **Local Daemon** | Chạy trên máy local, auto-detect CLI tools đã cài, spawn subprocess |
| **Kanban Dashboard** | Gán task cho agent, track real-time progress qua WebSocket |
| **Task Lifecycle** | enqueue → claim → start → complete/fail — quản lý vòng đời agent task |
| **Squads** | Routing layer: 1 "leader" agent phân chia task cho sub-agents |
| **Skill Library** | Agent giải quyết vấn đề → lưu solution làm reusable skill |
| **Self-hosted** | Docker Compose / Kubernetes, full control data |
| **Autopilot** | Cron-based trigger tự động tạo & route tasks cho agents |

**Kiến trúc Multica:**

```
Next.js (Web UI)  ↔  Go Backend (Chi router)  ↔  PostgreSQL 17 + pgvector
                             ↕ WebSocket
                     Local Daemon (your machine)
                             ↕ subprocess
                     Agent CLI (Claude Code, Codex, etc.)
```

### 1.3 Các Alternatives đã Research

| Tool | GitHub | License | Đặc trưng | Fit cho dự án |
|---|---|---|---|---|
| **Multica** | `multica-ai/multica` | Open Source | Dashboard + multi-CLI + self-host | ⭐⭐⭐⭐⭐ |
| **MS Conductor** | `microsoft/conductor` | MIT | YAML-first deterministic workflow | ⭐⭐⭐ |
| **Antfarm** | `snarktank/antfarm` | Open Source | YAML roles cho OpenClaw | ⭐⭐ |
| **Claude Code Agent Teams** | Built-in | N/A | Native, file-based mailbox | ⭐⭐⭐ |

**Quyết định: Chọn Multica** vì:
- Vendor-neutral (không lock-in Claude, sau này thêm Codex/Gemini)
- Có dashboard UI sẵn cho monitoring
- Task lifecycle management đã implement
- Self-hostable, team toàn quyền kiểm soát
- Local daemon auto-detect Claude Code CLI — no API key

---

## 2. Kiến Trúc Tổng Thể

### 2.1 Kiến Trúc Hiện Tại (AS-IS)

```
┌─────────────────┐     ┌──────────────────────┐     ┌─────────────────────┐
│   Frontend      │     │   Backend Gateway    │     │   Agents Service    │
│   React + Vite  │────▶│   Express + Prisma   │────▶│   FastAPI           │
│   12 components │     │   SQLite             │     │   + LangChain       │
│   42KB CSS      │     │   84KB workflow svc  │     │   + OpenAI API ❌   │
└─────────────────┘     └──────────────────────┘     │   + Langfuse ❌     │
                                                      │   + E2B SDK ❌      │
                                                      └─────────────────────┘
                                                               │
                                                               ▼
                                                      ┌─────────────────────┐
                                                      │   LLM Providers     │
                                                      │   OpenAI / Claude   │
                                                      │   DeepSeek API      │
                                                      │   ❌ Cần API keys   │
                                                      └─────────────────────┘
```

**Vấn đề cụ thể:**

1. **Input flow sai**: User gõ feature request text → không phải repo-first
2. **LLM lock-in**: Agents gọi trực tiếp OpenAI/Claude API → tốn tiền, cần API key
3. **FE quá phức tạp**: 12 SDLC components hiển thị đồng thời, user bị overwhelmed
4. **QA output bị trap**: QA result chỉ hiển thị trên UI, không commit vào repo
5. **Dependencies thừa**: LangChain, OpenAI, Langfuse, E2B, Claude SDK — không cần nếu dùng Multica
6. **Agent code monolith**: Mỗi agent vừa build prompt vừa gọi LLM vừa parse output

### 2.2 Kiến Trúc Đề Xuất (TO-BE)

```
┌────────────────────┐
│   Frontend         │
│   React + Vite     │
│   4 main components│
│   - RepoInput      │
│   - PipelineStepper │
│   - ApprovalQueue  │
│   - QAResultCard   │
└────────┬───────────┘
         │ REST + SSE
         ▼
┌────────────────────┐     ┌──────────────────────────┐
│   Backend Gateway  │     │   Multica (Self-hosted)   │
│   Express + Prisma │────▶│   Go Backend + PostgreSQL │
│   + GitService 🆕  │     │   Next.js Monitor UI      │
│   + MulticaClient 🆕│     └──────────┬───────────────┘
└────────┬───────────┘                  │ WebSocket
         │                              ▼
         │                 ┌──────────────────────────┐
         │                 │   Local Daemon            │
         │                 │   Auto-detect CLI tools   │
         │                 │   Task: enqueue→claim→run │
         │                 └──────────┬───────────────┘
         │                            │ subprocess
         │                            ▼
         │                 ┌──────────────────────────┐
         │                 │   Claude Code CLI         │
         │                 │   ✅ Login session         │
         │                 │   ✅ No API key            │
         │                 └──────────────────────────┘
         │
         │ git clone / commit
         ▼
┌────────────────────┐
│   Target Repo      │
│   + QA.md (output) │
└────────────────────┘
```

### 2.3 Luồng Dữ Liệu Mới (Data Flow)

```
1. User paste repo URL
   │
   ▼
2. Backend: GitService.cloneRepo()
   → workspace/projects/<project-id>/repo/
   │
   ▼
3. Backend: GitService.analyzeRepo()
   → { techStack: ["React","Node.js"], components: [...], fileCount: 90 }
   │
   ▼
4. Backend: MulticaClient.createIssue()
   → Tạo PO Agent task trên Multica
   │
   ▼
5. Multica Daemon: claim task → spawn Claude Code CLI
   → claude -p "Analyze this repo and create PRD..."
   │
   ▼
6. Claude Code CLI xử lý → output PRD + user stories
   │
   ▼
7. Multica: task complete → Backend poll status
   │
   ▼
8. Backend: auto-create UX task → DEV task (sequential)
   │
   ▼
9. DEV Agent output: code diff (unified git patch)
   │
   ▼
10. 🧪 SANDBOX GATE (G3):
    → Apply patch vào isolated git worktree
    → Chạy test commands (pytest / npm test)
    → Nếu FAIL & retries < 2 → quay lại DEV Agent
    → Nếu PASS → tiếp tục QA
   │
   ▼
11. Nếu confidence < 80%:
    → Backend tạo approval item
    → FE: ApprovalQueue hiện card
    → User review & approve/reject
   │
   ▼
12. QA Agent task → Multica daemon → Claude Code CLI
   │
   ▼
13. QA Agent complete:
     → Backend: GitService.commitQAReport()
     → QA.md committed vào repo local
     │
     ▼
14. FE: QAResultCard hiện kết quả
     → User approve release hoặc reject
```

### 2.4 Sandbox Testing — Kiến trúc & Vai trò

#### Sandbox Testing hiện tại (AS-IS)

Hệ thống hiện tại có **2 tầng sandbox** để kiểm tra DEV agent output:

```
┌─────────────────────────────────────────────────────────┐
│ TIER 1: E2B Cloud Sandbox (sandbox/e2b_runtime.py)      │
│                                                         │
│ Khi: USE_E2B_SANDBOX=true + E2B_API_KEY                 │
│                                                         │
│ Luồng:                                                  │
│   1. Upload handoff.json (PRD + UX context) vào E2B     │
│   2. Upload run_dev.py (DEV agent script)               │
│   3. Chạy DEV agent TRONG sandbox container             │
│   4. Đọc output.json từ sandbox                         │
│                                                         │
│ Docker image: e2b-dev/code-interpreter:latest            │
│ + Python, Node.js 20, git, pytest, anthropic SDK         │
│ Timeout: 300s (5 phút)                                  │
│                                                         │
│ ⚠️ Cần: E2B_API_KEY + OPENAI_API_KEY (sandbox nội bộ)  │
└─────────────────────────────────────────────────────────┘
                           │
                    fallback nếu E2B tắt
                           ▼
┌─────────────────────────────────────────────────────────┐
│ TIER 2: Git Worktree Sandbox (agents/src/tools/sandbox.py)│
│                                                         │
│ Khi: AGENT_REAL_SANDBOX=true (hoặc luôn validate format)│
│                                                         │
│ Luồng:                                                  │
│   1. Extract unified git diff từ DEV output             │
│   2. Validate patch format (diff --git, ---, +++, @@)   │
│   3. Nếu AGENT_REAL_SANDBOX=true:                       │
│      a. Tạo git worktree (isolated branch)              │
│      b. git apply --check → git apply                   │
│      c. Chạy AGENT_TEST_COMMANDS (pytest, npm test...)   │
│      d. Commit patch vào branch agent/<session-id>      │
│   4. Nếu AGENT_REAL_SANDBOX=false:                      │
│      → Chỉ validate format, skip thực thi              │
│                                                         │
│ ✅ KHÔNG cần API key, chạy hoàn toàn local              │
└─────────────────────────────────────────────────────────┘
```

**Pipeline node trong LangGraph:**

```
dev_agent → sandbox_gate → route_dev_sandbox
                              │
                   ┌──────────┼──────────┐
                   │                     │
              sandbox FAIL          sandbox PASS
              & retries < 2
                   │                     │
                   ▼                     ▼
              dev_agent (retry)     qa_gate (G4)
```

**Các environment variables liên quan:**

| Variable | Default | Mô tả |
|---|---|---|
| `USE_E2B_SANDBOX` | `false` | Bật E2B cloud sandbox (Tier 1) |
| `E2B_API_KEY` | _(none)_ | API key cho E2B (nếu dùng Tier 1) |
| `AGENT_REAL_SANDBOX` | `false` | Bật git worktree sandbox (Tier 2) |
| `AGENT_WORKSPACE_REPO` | _(auto-detect)_ | Path tới git repo cho worktree |
| `AGENT_TEST_COMMANDS` | _(none)_ | Commands để chạy trong sandbox (ví dụ: `npm test`) |
| `AGENT_TEST_TIMEOUT_SECONDS` | `300` | Timeout cho mỗi test command |
| `AGENT_COMMIT_PATCH` | `true` | Tự động commit patch vào branch sandbox |
| `AGENT_KEEP_WORKTREE` | `true` | Giữ worktree sau khi test xong |

#### Sandbox Testing trong kiến trúc Multica (TO-BE)

**Thay đổi chính: E2B Cloud → Docker Local Sandbox**

E2B cung cấp VM-level isolation (Firecracker micro-VM), nhưng yêu cầu API key trả phí. Giải pháp: thay bằng **Docker container local** — cùng mức isolation cho dự án academic, không cần API key, và Docker Desktop đã có sẵn (Multica cũng cần).

| Aspect | AS-IS | TO-BE |
|---|---|---|
| **E2B Sandbox (Tier 1)** | Cloud micro-VM, cần E2B_API_KEY | 🔄 **Thay bằng Docker Local Sandbox** |
| **Git Worktree Sandbox (Tier 2)** | Validate patch + apply | ✅ **Giữ** — prepare code cho Docker |
| **Test execution** | Chạy tests trên host (không an toàn) | ✅ **Chạy tests TRONG Docker container** |
| **Trigger** | LangGraph `node_sandbox_gate` | Backend `SdlcWorkflowService.runSandboxGate()` |
| **DEV retry** | LangGraph `route_dev_sandbox` | Backend: nếu sandbox fail → Multica issue mới cho DEV |

**So sánh isolation:**

```
E2B (cũ):                        Docker Local (mới):
┌──────────────────────┐          ┌──────────────────────┐
│  Firecracker VM      │          │  Docker Container    │
│  Kernel riêng        │          │  --network=none      │
│  Cloud-hosted        │          │  --memory=512m       │
│  ❌ Cần API key      │          │  --cpus=1            │
│  ❌ Cần OPENAI key   │          │  --read-only         │
│  ❌ Trả phí          │          │  --tmpfs /tmp        │
│                      │          │  ✅ Free             │
│                      │          │  ✅ Không cần API    │
│                      │          │  ✅ Docker đã có     │
└──────────────────────┘          └──────────────────────┘
```

**Luồng Sandbox mới — Docker Local:**

```
1. DEV Agent (qua Multica/Claude CLI) output code diff
   │
   ▼
2. Backend nhận output → extract unified patch
   │
   ▼
3. Backend: sandbox.prepare_workspace():
   a. Validate patch format (diff --git, ---, +++, @@)
   b. Tạo temp directory
   c. git apply patch vào temp dir
   │
   ▼
4. Backend: docker_sandbox.run_tests():
   a. docker run --rm \
        --network=none        ← Cắt internet hoàn toàn
        --memory=512m         ← Giới hạn RAM (tránh OOM)
        --cpus=1              ← Giới hạn CPU (tránh fork bomb)
        --pids-limit=100      ← Giới hạn processes
        --read-only           ← Không ghi host filesystem
        --tmpfs /tmp:size=64m ← Chỉ ghi được /tmp (có limit)
        -v <workspace>:/workspace:ro   ← Code mount read-only
        -v <output>:/output:rw         ← Output volume
        aidlc-sandbox:latest
        sh -c "cd /workspace && npm test 2>&1 | tee /output/test-results.txt"
   b. Đọc test results từ /output/
   c. Container tự xóa (--rm)
   │
   ▼
5. Nếu sandbox FAIL & retries < 2:
   → Backend tạo Multica issue mới cho DEV:
     "[DEV-RETRY] Fix sandbox errors: <error message>"
   → DEV Agent chạy lại với context lỗi
   │
   ▼
6. Nếu sandbox PASS (hoặc max retries):
   → Commit patch vào branch agent/<session-id>
   → Tiếp tục QA Agent
```

**Dockerfile mới (refactor từ sandbox/Dockerfile hiện tại):**

```dockerfile
# sandbox/Dockerfile — Docker Local Sandbox (thay E2B)
FROM node:20-slim

# Install system tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    git python3 python3-pip python3-venv jq curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python test tools
RUN pip3 install --break-system-packages pytest pytest-cov pydantic

# Security: non-root user
RUN useradd -m -s /bin/bash sandbox
USER sandbox

# Working directory
WORKDIR /workspace

# Default: run tests
CMD ["sh", "-c", "echo 'No test command specified'"]
```

**Build image (one-time setup trong Phase 1):**

```powershell
cd sandbox
docker build -t aidlc-sandbox:latest .
```

**File changes cho Sandbox:**

| File | Thay đổi |
|---|---|
| `sandbox/Dockerfile` | 🔄 **Refactor** — E2B base → Node 20 + Python 3 + non-root user |
| `sandbox/e2b_runtime.py` | ❌ Archive → thay bằng `docker_sandbox.py` |
| `sandbox/run_dev.py` | ❌ Archive — DEV agent chạy qua Multica/Claude CLI |
| `sandbox/test_e2b.py` | ❌ Archive — E2B tests không còn dùng |
| [NEW] `sandbox/docker_sandbox.py` | 🆕 Docker sandbox wrapper (xem bên dưới) |
| `agents/src/tools/sandbox.py` | 🔄 **Update** — thêm Docker execution path |
| `agents/src/schemas/aidlc.py` | ✅ Giữ `SandboxReport` schema |

**Module mới — `sandbox/docker_sandbox.py`:**

```python
"""Docker Local Sandbox — thay thế E2B cloud sandbox.

An toàn: --network=none, --memory=512m, --read-only, --pids-limit=100
Không cần API key. Chỉ cần Docker Desktop.
"""
import subprocess, json, os, tempfile
from pathlib import Path

SANDBOX_IMAGE = os.getenv("SANDBOX_DOCKER_IMAGE", "aidlc-sandbox:latest")
SANDBOX_MEMORY = os.getenv("SANDBOX_MEMORY_LIMIT", "512m")
SANDBOX_CPUS = os.getenv("SANDBOX_CPU_LIMIT", "1")
SANDBOX_TIMEOUT = int(os.getenv("SANDBOX_TIMEOUT_SECONDS", "300"))

def run_in_docker(workspace_path: str, test_command: str) -> dict:
    """Chạy test command trong Docker container isolated."""
    output_dir = tempfile.mkdtemp(prefix="sandbox-output-")

    cmd = [
        "docker", "run", "--rm",
        "--network=none",
        f"--memory={SANDBOX_MEMORY}",
        f"--cpus={SANDBOX_CPUS}",
        "--pids-limit=100",
        "--read-only",
        "--tmpfs", "/tmp:size=64m",
        "-v", f"{workspace_path}:/workspace:ro",
        "-v", f"{output_dir}:/output:rw",
        SANDBOX_IMAGE,
        "sh", "-c",
        f"cd /workspace && {test_command} 2>&1 | tee /output/results.txt; "
        f"echo $? > /output/exitcode.txt"
    ]

    try:
        result = subprocess.run(
            cmd, capture_output=True, text=True,
            timeout=SANDBOX_TIMEOUT
        )
        # Read results from output volume
        results_file = Path(output_dir) / "results.txt"
        exitcode_file = Path(output_dir) / "exitcode.txt"

        output_text = results_file.read_text() if results_file.exists() else result.stdout
        exit_code = int(exitcode_file.read_text().strip()) if exitcode_file.exists() else result.returncode

        return {
            "success": exit_code == 0,
            "report": output_text,
            "exit_code": exit_code,
        }
    except subprocess.TimeoutExpired:
        return {
            "success": False,
            "report": f"[Docker Sandbox] Timeout after {SANDBOX_TIMEOUT}s",
            "exit_code": -1,
        }
    except FileNotFoundError:
        return {
            "success": False,
            "report": "[Docker Sandbox] Docker not found. Install Docker Desktop.",
            "exit_code": -1,
        }
```

**Cấu hình sandbox cho repo-first pipeline:**

```env
# Trong .env sau khi tích hợp Multica

# Sandbox — Docker Local
AGENT_REAL_SANDBOX=true
AGENT_WORKSPACE_REPO=workspace/projects/<project-id>/repo
AGENT_TEST_COMMANDS=npm test
AGENT_TEST_TIMEOUT_SECONDS=300
AGENT_COMMIT_PATCH=true
AGENT_KEEP_WORKTREE=true

# Docker Sandbox settings
SANDBOX_DOCKER_IMAGE=aidlc-sandbox:latest
SANDBOX_MEMORY_LIMIT=512m
SANDBOX_CPU_LIMIT=1
SANDBOX_TIMEOUT_SECONDS=300

# Không còn cần:
# USE_E2B_SANDBOX=false (removed)
# E2B_API_KEY= (removed)
# OPENAI_API_KEY= (removed — agents dùng Claude CLI qua Multica)
```

---

## 3. Chi Tiết Từng Phase

### Phase 1: Setup Multica Infrastructure (Ngày 1-2)

#### 3.1.1 Cài đặt Multica Server (Self-hosted)

**Bước 1: Clone repository**

```powershell
git clone https://github.com/multica-ai/multica.git C:\Tools\multica
cd C:\Tools\multica
```

**Bước 2: Cấu hình environment**

Tạo file `.env` trong thư mục multica:

```env
# Database
POSTGRES_DB=multica
POSTGRES_USER=multica
POSTGRES_PASSWORD=<tạo-password-mạnh>

# Backend
DATABASE_URL=postgres://multica:<password>@postgres:5432/multica?sslmode=disable
JWT_SECRET=<tạo-chuỗi-random-dài-ít-nhất-32-ký-tự>
FRONTEND_ORIGIN=http://localhost:3000

# Email (optional, cho authentication)
# RESEND_API_KEY=...
# RESEND_FROM_EMAIL=noreply@yourdomain.com
```

**Bước 3: Khởi động services**

```powershell
# Tự động generate .env nếu chưa có + start all services
make selfhost

# Hoặc manual:
docker compose -f docker-compose.selfhost.yml up -d
```

**Services chạy:**

| Service | Container | Port | Mô tả |
|---|---|---|---|
| PostgreSQL 17 | `multica-postgres` | 5432 (internal) | Database + pgvector |
| Go Backend | `multica-backend` | 8080 → 127.0.0.1 | API + WebSocket server |
| Next.js Frontend | `multica-frontend` | 3000 → 127.0.0.1 | Monitoring dashboard |

**Bước 4: Verify**

```powershell
# Check health
curl http://127.0.0.1:8080/health

# Mở browser → http://localhost:3000 (Multica Dashboard)
```

#### 3.1.2 Cài đặt Multica CLI + Daemon

**Bước 1: Install CLI**

```powershell
# Windows (PowerShell)
irm https://raw.githubusercontent.com/multica-ai/multica/main/scripts/install.ps1 | iex

# Verify
multica --version
```

**Bước 2: Setup (authenticate + start daemon)**

```powershell
multica setup
# → Sẽ mở browser để login
# → Tự động start daemon
# → Auto-detect Claude Code CLI trên PATH
```

**Bước 3: Verify daemon + agents**

```powershell
# List detected agent CLIs
multica agent list
# Expected output: claude (Claude Code CLI) — detected ✓

# List workspaces
multica workspace list
```

#### 3.1.3 Prerequisites Check

Trước khi bắt đầu Phase 1, verify:

```powershell
# 1. Docker Desktop running
docker --version

# 2. Claude Code CLI installed & logged in
claude --version
claude auth status  # hoặc thử claude -p "hello"

# 3. Node.js 18+
node --version

# 4. Python 3.10+
python --version

# 5. Git
git --version
```

> **Lưu ý quan trọng:** Claude Code CLI phải được **login trước** (`claude login`). Multica daemon chỉ spawn CLI subprocess — nó không xử lý authentication. Mỗi member trong team cần login Claude Code trên máy riêng.

#### 3.1.4 Deliverables Phase 1

- [ ] Multica server chạy trên Docker (3 containers)
- [ ] Multica CLI installed trên máy dev
- [ ] Daemon running, detect Claude Code CLI
- [ ] Workspace created cho AIDLC project
- [ ] Verify: `multica issue create` và `multica issue list` hoạt động

---

### Phase 2: Backend Integration (Ngày 3-4)

#### 3.2.1 GitService — Clone, Analyze, Commit

**File mới:** `backend/src/services/GitService.js`

**Responsibilities:**

| Method | Input | Output | Mô tả |
|---|---|---|---|
| `cloneRepo(repoUrl, projectId)` | URL + project ID | Local path string | Clone vào `workspace/projects/<id>/repo/` |
| `analyzeRepo(localPath)` | Path to cloned repo | RepoAnalysis object | Scan cấu trúc, detect tech stack |
| `commitQAReport(localPath, qaContent)` | Path + QA content | Commit hash | Ghi QA.md + git commit |
| `getRepoStatus(localPath)` | Path | Status object | Check git status, last commit |

**analyzeRepo() logic chi tiết:**

```
Input: /workspace/projects/abc123/repo/

Scan:
  ├── Tìm package.json → detect Node.js deps (React, Express, Vue, etc.)
  ├── Tìm requirements.txt / pyproject.toml → detect Python deps
  ├── Tìm go.mod → detect Go modules
  ├── Tìm Cargo.toml → detect Rust crates
  ├── Tìm Dockerfile → detect containerization
  ├── Tìm docker-compose.yml → detect multi-service
  ├── List top-level folders → component candidates
  └── Count files by extension → size metrics

Output:
  {
    "repoName": "sample-app",
    "repoUrl": "https://github.com/team/sample-app",
    "techStack": ["React 19", "Express 5", "Python 3.11"],
    "components": [
      { "name": "frontend", "path": "frontend/", "type": "React", "files": 45 },
      { "name": "backend", "path": "backend/", "type": "Express", "files": 30 },
      { "name": "ml-service", "path": "ml/", "type": "Python", "files": 15 }
    ],
    "totalFiles": 90,
    "hasTests": true,
    "hasDocker": true,
    "primaryLanguage": "TypeScript"
  }
```

**Implementation notes:**
- Sử dụng `child_process.execSync('git clone ...')` — không cần thêm library
- Analyze dùng `fs.readdirSync` + `JSON.parse` cho package.json
- Workspace directory: `<project-root>/workspace/projects/<project-id>/repo/`
- Nếu repo đã clone → `git pull` thay vì clone lại

#### 3.2.2 MulticaClient — CLI Wrapper

**File mới:** `backend/src/services/MulticaClient.js`

**Responsibilities:**

| Method | Mô tả | CLI command |
|---|---|---|
| `createIssue(title, description)` | Tạo task mới trên Multica | `multica issue create --output json` |
| `listIssues()` | Liệt kê tất cả issues | `multica issue list --output json` |
| `getIssueStatus(issueId)` | Lấy status của 1 issue | `multica issue list --output json` + filter |
| `setWorkspace(workspaceId)` | Switch workspace | `multica workspace switch <id>` |

**Tại sao dùng CLI wrapper?**
- Multica chưa có documented public REST API
- CLI + `--output json` cho output machine-readable ổn định
- `child_process.execSync` đơn giản, không cần thêm dependency
- Sau này nếu Multica expose REST API → refactor wrapper, interface giữ nguyên

**Error handling:**
```
try {
  execSync('multica issue create ...')
} catch (err) {
  // CLI not found → throw "Multica CLI not installed"
  // Daemon not running → throw "Multica daemon not running"
  // Auth expired → throw "Multica auth expired, run: multica setup"
}
```

#### 3.2.3 Pipeline Endpoint

**File modify:** `backend/src/controllers/SdlcController.js`

**Endpoint mới:**

```
POST /api/v1/sdlc/start-from-repo
Body: { "repo_url": "https://github.com/team/project.git", "project_id": "..." }
Response: {
  "task_id": "...",
  "repo_analysis": { techStack, components, totalFiles, ... },
  "multica_issue_id": "...",
  "status": "PO_RUNNING"
}
```

**Luồng trong endpoint:**

```
1. Validate repo_url (phải là github.com/* hoặc gitlab.com/*)
2. GitService.cloneRepo(repo_url, project_id)
3. GitService.analyzeRepo(localPath)
4. Chuẩn bị PO prompt (include repo analysis)
5. MulticaClient.createIssue("PO: Analyze " + repoName, prompt)
6. SdlcWorkflowService.createPipeline({ projectId, repoUrl, analysis, issueId })
7. Return { task_id, repo_analysis, multica_issue_id }
```

**File modify:** `backend/src/routes/sdlcRoutes.js`

```javascript
router.post('/start-from-repo', auth, sdlcController.startFromRepo);
router.get('/pipeline-status/:project_id', auth, sdlcController.getPipelineStatus);
```

#### 3.2.4 Pipeline State Machine

**File modify:** `backend/src/services/SdlcWorkflowService.js`

**Thêm methods:**

| Method | Mô tả |
|---|---|
| `startFromRepo(opts)` | Tạo pipeline mới từ repo analysis |
| `pollMulticaStatus(projectId)` | Poll Multica issue status mỗi 3s |
| `advancePipeline(projectId, agentOutput)` | Khi agent xong → tạo issue cho phase tiếp |
| `handleApprovalRequired(projectId, phase, output)` | Khi confidence < 80% → hold cho human |
| `onQAComplete(projectId, qaOutput)` | Gọi GitService.commitQAReport() |

**Pipeline states:**

```
REPO_CLONING → REPO_ANALYZED → PO_RUNNING → PO_REVIEW? → UX_RUNNING → UX_REVIEW?
→ DEV_RUNNING → DEV_REVIEW? → QA_RUNNING → QA_REVIEW → QA_COMMITTED → RELEASED
```

**Polling mechanism:**

```javascript
// Chạy background interval khi pipeline active
setInterval(async () => {
  const activePipelines = await getActivePipelines();
  for (const pipeline of activePipelines) {
    const status = await MulticaClient.getIssueStatus(pipeline.currentIssueId);
    if (status.state === 'completed') {
      await advancePipeline(pipeline.projectId, status.output);
    }
  }
}, 3000); // Poll mỗi 3 giây
```

#### 3.2.5 Deliverables Phase 2

- [ ] `GitService.js`: clone, analyze, commit hoạt động
- [ ] `MulticaClient.js`: create/list/status issues hoạt động
- [ ] `POST /api/v1/sdlc/start-from-repo` endpoint hoạt động
- [ ] Pipeline state machine chạy được PO → UX → DEV → QA
- [ ] QA.md được commit vào repo local khi QA xong
- [ ] Backend tests pass

---

### Phase 3: Frontend Đơn Giản Hóa (Ngày 5-6)

#### 3.3.1 Nguyên Tắc Thiết Kế Mới

**Core principle: "Show what matters, hide what doesn't"**

| Nguyên tắc | Hiện tại (AS-IS) | Sau đổi (TO-BE) |
|---|---|---|
| **First impression** | 6+ panels hiển thị cùng lúc | 3 sections: Input, Pipeline, Approvals |
| **Approval visibility** | Phải scroll xuống tìm HumanGatePanel | ApprovalQueue nổi bật ngay trên dashboard |
| **Agent output** | Inline StageInspector 5KB | Ẩn sau "View Detail" modal |
| **MCP activity** | Luôn hiện McpActivityPanel | Ẩn trong DetailModal |
| **Input method** | Form text (FeatureRequestForm) | Repo URL input (RepoInput) |

#### 3.3.2 Component Structure Mới

**AS-IS: 12 components**

```
SdlcDashboard/components/
├── AgentPhaseCard.tsx         (3.5KB) ← inline trên Build
├── ArtifactViewer.tsx         (6.9KB) ← Outputs page
├── AuditTimeline.tsx          (14.5KB) ← Audit page
├── EmptyProjectState.tsx      (1.7KB) ← placeholder
├── FeatureRequestForm.tsx     (3.8KB) ← modal
├── HumanGatePanel.tsx         (12KB)  ← modal
├── KanbanBoard.tsx            (9KB)   ← separate view
├── McpActivityPanel.tsx       (3KB)   ← inline trên Build
├── PenpotPreview.tsx          (7.1KB) ← inline trên Build
├── ReleaseGatePanel.tsx       (5.4KB) ← inline trên Build
├── StageInspector.tsx         (4.9KB) ← inline trên Build
└── WorkflowMetricsPanel.tsx   (5.3KB) ← Audit page
```

**TO-BE: 4 components chính + detail modal**

```
SdlcDashboard/components/
├── RepoInput.tsx          🆕 Input URL + Start + analysis display
├── PipelineStepper.tsx    🆕 4 steps: PO → UX → DEV → QA (status icons)
├── ApprovalQueue.tsx      🆕 Card list: pending approvals (nổi bật)
├── QAResultCard.tsx       🆕 QA summary + commit status
├── DetailModal.tsx        🆕 Lazy-load: full output, logs, MCP, preview
├── HumanGatePanel.tsx     ✅ Giữ (modal-only, logic giữ nguyên)
├── EmptyProjectState.tsx  ✅ Giữ nguyên
│
├── [Giữ nhưng ẩn sau navigation]
│   ├── AuditTimeline.tsx         → /sdlc/audit
│   ├── WorkflowMetricsPanel.tsx  → /sdlc/audit
│   ├── ArtifactViewer.tsx        → /sdlc/outputs
│   └── KanbanBoard.tsx           → tab hoặc dropdown
│
└── [Archive / merge vào component mới]
    ├── AgentPhaseCard.tsx     → merge vào PipelineStepper
    ├── FeatureRequestForm.tsx → thay bằng RepoInput
    ├── McpActivityPanel.tsx   → move vào DetailModal
    ├── StageInspector.tsx     → move vào DetailModal
    ├── PenpotPreview.tsx      → move vào DetailModal
    └── ReleaseGatePanel.tsx   → merge vào ApprovalQueue/QAResultCard
```

#### 3.3.3 Wireframe: Dashboard Mới

```
┌─────────────────────────────────────────────────────────┐
│  AIDLC Control Platform           [Build] [Audit] [Out] │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  🔗 Repository URL                                     │
│  ┌─────────────────────────────────────────┐  [Start]  │
│  │ https://github.com/team/project.git     │           │
│  └─────────────────────────────────────────┘           │
│                                                         │
│  📊 Repo: sample-app | React + Node.js | 90 files      │
│                                                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Pipeline Progress                                      │
│  ┌──────┐    ┌──────┐    ┌──────┐    ┌──────┐          │
│  │ PO ✅ │───▶│ UX ✅ │───▶│DEV ⏳│───▶│ QA ○ │          │
│  │ 2m30s │    │ 1m45s│    │ run..│    │      │          │
│  └──────┘    └──────┘    └──────┘    └──────┘          │
│                                                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  🔔 PENDING APPROVALS (1)                               │
│                                                         │
│  ┌───────────────────────────────────────────────────┐  │
│  │  🤖 DEV Agent needs your review                   │  │
│  │                                                   │  │
│  │  Confidence: ██████░░░░ 58/100                    │  │
│  │  Issue: oauth_state_csrf_missing                  │  │
│  │                                                   │  │
│  │  [Review & Approve]            [View Detail →]    │  │
│  └───────────────────────────────────────────────────┘  │
│                                                         │
│  ┌───────────────────────────────────────────────────┐  │
│  │  ✅ QA Report Complete                             │  │
│  │                                                   │  │
│  │  Coverage: 92%  │  Score: PASS  │  Blockers: 0    │  │
│  │  QA.md committed to local repo                    │  │
│  │                                                   │  │
│  │  [Approve Release]  [View QA.md]  [View Detail →] │  │
│  └───────────────────────────────────────────────────┘  │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

#### 3.3.4 Chi tiết từng Component mới

**RepoInput.tsx**
- Input field với validation (github.com/*, gitlab.com/*, bitbucket.org/*)
- Button "Start Pipeline"
- Loading state khi clone đang chạy
- Hiển thị repo analysis result (tech stack badges, component list, file count)
- Giữ tương thích: vẫn có "New Feature Request" button cho legacy text input

**PipelineStepper.tsx**
- 4 bước ngang: PO → UX → DEV → QA
- Status icons: ○ pending, ⏳ running, ✅ done, ❌ failed, 🔔 needs review
- Timing info dưới mỗi step (e.g., "2m 30s")
- Click step → expand inline với brief log
- "View Detail" link → mở DetailModal

**ApprovalQueue.tsx**
- Card list layout, nổi bật với badge "PENDING APPROVALS (N)"
- Mỗi card:
  - Agent icon + tên (PO/UX/DEV/QA)
  - Confidence progress bar (màu: xanh >80, vàng 60-80, đỏ <60)
  - 1-line issue summary
  - 2 buttons: `[Review & Approve]` → mở HumanGatePanel, `[View Detail →]` → mở DetailModal
- Empty state: "No pending approvals. Pipeline is running smoothly."

**QAResultCard.tsx**
- Hiện khi QA phase complete
- Summary metrics: coverage %, overall score (PASS/FAIL), blocker count
- Xác nhận QA.md đã commit ("QA.md committed to local repo ✓")
- Actions: `[Approve Release]`, `[View QA.md →]`, `[View Detail →]`

**DetailModal.tsx**
- Lazy-loaded (React.lazy)
- Tab layout bên trong:
  - **Output**: Full agent output rendered as markdown
  - **Logs**: SSE log stream (reuse logic từ StageInspector)
  - **Activity**: MCP tool calls (reuse logic từ McpActivityPanel)
  - **Preview**: Penpot preview (nếu UX phase, reuse PenpotPreview)
  - **Code**: Code diff viewer (nếu DEV phase)

#### 3.3.5 API Changes cho Frontend

**File modify:** `frontend/src/services/api/sdlcApi.ts`

Thêm functions:

```typescript
// Bắt đầu pipeline từ repo URL
export async function startFromRepo(projectId: string, repoUrl: string): Promise<{
  task_id: string;
  repo_analysis: RepoAnalysis;
  multica_issue_id: string;
}>;

// Poll pipeline status (thay thế getWorkflowStatus cho repo-based flow)
export async function getPipelineStatus(projectId: string): Promise<PipelineStatus>;
```

**File modify:** `frontend/src/store/useSdlcStore.ts`

Thêm state fields:

```typescript
// Repo-based pipeline state
repoUrl: string | null;
repoAnalysis: RepoAnalysis | null;
pipelinePhases: {
  po: PhaseStatus;
  ux: PhaseStatus;
  dev: PhaseStatus;
  qa: PhaseStatus;
};
pendingApprovals: ApprovalItem[];
qaResult: QAResult | null;
```

#### 3.3.6 Deliverables Phase 3

- [ ] `RepoInput.tsx`: URL input + validation + start pipeline
- [ ] `PipelineStepper.tsx`: 4 steps with status polling
- [ ] `ApprovalQueue.tsx`: pending approval cards
- [ ] `QAResultCard.tsx`: QA summary + commit status
- [ ] `DetailModal.tsx`: lazy-loaded full detail view
- [ ] `SdlcDashboard/index.tsx`: rewritten, ~120 lines
- [ ] Frontend tests pass
- [ ] TypeScript build pass

---

### Phase 4: Cleanup & Documentation (Ngày 7)

#### 3.4.1 Dependencies Loại Bỏ

**agents/requirements.txt:**

| Package | Lý do loại | Thay thế bằng |
|---|---|---|
| `langchain>=0.3.0` | Không gọi LLM trực tiếp nữa | Multica daemon → Claude CLI |
| `langchain-openai>=0.2.0` | Không dùng OpenAI API | Multica daemon → Claude CLI |
| `langfuse>=3.0.0` | Observability qua Multica dashboard | Multica task tracking |
| `openai>=1.50.0` | Không gọi OpenAI API | Multica daemon → Claude CLI |
| `e2b-code-interpreter>=1.0.0` | Sandbox qua Claude Code CLI | Claude Code tự sandbox |
| `claude-agent-sdk>=0.1.0` | Dùng Multica CLI thay thế | Multica daemon |

**Giữ lại:**
```
fastapi>=0.115.0       # Health check + prompt template API
uvicorn[standard]>=0.30.0
python-dotenv>=1.0.0
pydantic>=2.0.0        # Schema validation
httpx>=0.27.0          # HTTP client
PyYAML>=6.0
pytest>=8.0.0          # Tests
```

**frontend/package.json:**

| Package | Lý do loại |
|---|---|
| `@google/genai` | Không cần client-side AI calls |

#### 3.4.2 Agent Code Refactor

Agents service chuyển vai trò từ **LLM executor** → **prompt template builder**:

**AS-IS (mỗi agent):**
```python
async def run_po_agent(input_data, model_config, trace_context):
    llm = _get_llm(model_config)           # ← Init LLM client
    prompt = build_prompt(input_data)       # ← Build prompt
    result = await llm.ainvoke(prompt)      # ← Call API (cần API key)
    return parse_output(result)             # ← Parse response
```

**TO-BE (mỗi agent):**
```python
def build_po_prompt(input_data: POAgentInput) -> str:
    """Build prompt text. Multica daemon sẽ gửi cho Claude CLI."""
    return f"""You are a Product Owner agent...
    Repo analysis: {json.dumps(input_data.repo_analysis)}
    Output JSON: {{ prd, user_stories, acceptance_criteria, confidence }}
    """
```

**Giữ nguyên:**
- Pydantic input/output schemas (`POAgentInput`, `UXAgentInput`, etc.)
- Output parsing logic
- Quality gate evaluator (`src/quality_gate/evaluator.py`)
- Sandbox tool (`src/tools/sandbox.py`) — có thể dùng cho local validation

#### 3.4.3 Documentation Updates

| File | Thay đổi |
|---|---|
| `README.md` | Thêm Multica prerequisites, update setup steps, remove API key requirements |
| `docs/architecture.md` | Cập nhật diagram TO-BE, component descriptions |
| `CLAUDE.md` | Thêm rules cho Multica integration |
| `docs/project/MULTICA_INTEGRATION_PLAN.md` | Document này — mark completed items |
| `frontend/docs/PROGRESS.md` | Cập nhật component status |

#### 3.4.4 Deliverables Phase 4

- [ ] `requirements.txt` cleaned up (6 packages loại)
- [ ] `package.json` cleaned up
- [ ] Agent files refactored thành prompt builders
- [ ] README.md updated
- [ ] architecture.md updated
- [ ] End-to-end test pass

---

## 4. Tech Stack Xác Định (Final)

| Layer | Technology | Status | Ghi chú |
|---|---|---|---|
| **Frontend** | React 19 + Vite 6 + TypeScript 5.8 | ✅ Giữ | Không thay đổi framework |
| **State Management** | Zustand 5 | ✅ Giữ | Nhẹ, phù hợp |
| **Styling** | Vanilla CSS (sdlc.css) + Tailwind 4 | ✅ Giữ | Custom theme giữ nguyên |
| **Animation** | Motion (framer-motion) | ✅ Giữ | Modal transitions |
| **i18n** | react-i18next | ✅ Giữ | EN/VI support |
| **Icons** | lucide-react | ✅ Giữ | Consistent icon set |
| **Backend API** | Express 5 + Prisma/SQLite | ✅ Giữ | API Gateway |
| **Authentication** | JWT (local) | ✅ Giữ | No external auth needed |
| **Git Operations** | `child_process` → `git` CLI | 🆕 Thêm | Clone, analyze, commit |
| **Agent Orchestration** | Multica (self-hosted) | 🆕 Thay | Thay LangChain + OpenAI |
| **Agent Runtime** | Multica Daemon → Claude Code CLI | 🆕 Thay | No API key required |
| **Agent Prompts** | FastAPI (Python) | 🔄 Refactor | Prompt builder only |
| **Agent Database** | PostgreSQL 17 (Multica) | 🆕 Riêng | Task state, agent config |
| **Observability** | Multica Dashboard + SSE logs | 🔄 Hybrid | Replace Langfuse |

---

## 5. Risk Assessment & Mitigations

| Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|
| Multica CLI không stable trên Windows | High | Medium | Test kỹ trên Windows trước khi commit. Fallback: Linux VM / WSL2 |
| Claude Code CLI cần mỗi member login riêng | Medium | High | Document rõ trong onboarding. Mỗi máy dev cần `claude login` |
| Multica chưa có public REST API | Medium | Confirmed | CLI wrapper + `--output json`. Interface layer cho phép swap sau |
| Pipeline polling 3s tạo load | Low | Low | Chỉ poll khi pipeline active. Sau nâng cấp WebSocket |
| Git clone repo lớn chậm | Medium | Medium | Shallow clone (`--depth 1`). Limit repo size (< 500MB) |
| Frontend breaking change lớn | Medium | High | Giữ old components trong `[archived]/`. Gradual migration |

---

## 6. Verification Plan

### 6.1 Unit Tests

```powershell
# Backend (Jest)
cd backend && npm test
# Expected: 40+ tests pass

# Agents (pytest)
python -m pytest
# Expected: 10+ tests pass

# Frontend (Vitest)
cd frontend && npm test
# Expected: 21+ tests pass
```

### 6.2 Type & Build Check

```powershell
cd frontend
npm run typecheck    # TypeScript errors = 0
npm run build        # Build success
```

### 6.3 Integration Test Checklist

```
[ ] 1. Login vào FE (admin@vfs.com / admin123)
[ ] 2. Create/select project
[ ] 3. Paste repo URL vào RepoInput
[ ] 4. Verify: repo cloned, analysis displayed (tech stack, components)
[ ] 5. Verify: PipelineStepper shows PO running
[ ] 6. Verify: PO completes → auto-advance to UX
[ ] 7. Verify: DEV pauses (if low confidence) → ApprovalQueue shows card
[ ] 8. Verify: Click "Review & Approve" → HumanGatePanel modal opens
[ ] 9. Verify: Submit feedback → agent reruns
[ ] 10. Verify: QA completes → QAResultCard shows PASS/FAIL
[ ] 11. Verify: QA.md exists in workspace/projects/<id>/repo/QA.md
[ ] 12. Verify: Approve release → pipeline status = RELEASED
[ ] 13. Verify: /sdlc/audit page still works
[ ] 14. Verify: /sdlc/outputs page still works
```

### 6.4 Mock Mode

Giữ `USE_MOCK_AGENTS=true` cho offline development:
- Khi mock = true → Backend trả mock data thay vì gọi Multica
- Không cần Multica server/daemon chạy
- Giữ tương thích ngược với mock flow hiện tại

---

## 7. Timeline Tổng Hợp

```
Week 1:
  Day 1  ▓▓▓▓░░░░░░  Phase 1a: Multica server Docker setup
  Day 2  ▓▓▓▓░░░░░░  Phase 1b: CLI + daemon + Claude Code verify + sandbox Dockerfile build
  Day 3  ░░▓▓▓▓░░░░  Phase 2a: GitService (clone, analyze, commit)
  Day 4  ░░▓▓▓▓░░░░  Phase 2b: MulticaClient + docker_sandbox.py + pipeline endpoint
  Day 5  ░░░░▓▓▓▓░░  Phase 3a: RepoInput + PipelineStepper
  Day 6  ░░░░▓▓▓▓░░  Phase 3b: ApprovalQueue + QAResultCard + DetailModal
  Day 7  ░░░░░░▓▓▓▓  Phase 4: Cleanup + docs + E2E test

Legend: ▓ = active work, ░ = buffer
```

---

## 8. Appendix

### A. Multica CLI Quick Reference

```powershell
# Setup & Auth
multica setup                              # First-time setup
multica daemon start                       # Start local daemon
multica daemon stop                        # Stop daemon

# Workspace
multica workspace list                     # List all workspaces
multica workspace switch <id>              # Switch active workspace

# Issues (Tasks)
multica issue create                       # Create new issue (interactive)
multica issue list                         # List all issues
multica issue list --output json           # Machine-readable output
multica issue take <issue-id>              # Manually takeover an issue

# Agents
multica agent list                         # List detected agent CLIs

# Autopilot
multica autopilot trigger-add              # Add automated trigger
```

### B. File Change Summary

| Action | File | Phase |
|---|---|---|
| 🆕 NEW | `backend/src/services/GitService.js` | 2 |
| 🆕 NEW | `backend/src/services/MulticaClient.js` | 2 |
| 🆕 NEW | `frontend/src/pages/SdlcDashboard/components/RepoInput.tsx` | 3 |
| 🆕 NEW | `frontend/src/pages/SdlcDashboard/components/PipelineStepper.tsx` | 3 |
| 🆕 NEW | `frontend/src/pages/SdlcDashboard/components/ApprovalQueue.tsx` | 3 |
| 🆕 NEW | `frontend/src/pages/SdlcDashboard/components/QAResultCard.tsx` | 3 |
| 🆕 NEW | `frontend/src/pages/SdlcDashboard/components/DetailModal.tsx` | 3 |
| 🔄 MODIFY | `backend/src/controllers/SdlcController.js` | 2 |
| 🔄 MODIFY | `backend/src/services/SdlcWorkflowService.js` | 2 |
| 🔄 MODIFY | `backend/src/routes/sdlcRoutes.js` | 2 |
| 🔄 MODIFY | `frontend/src/pages/SdlcDashboard/index.tsx` | 3 |
| 🔄 MODIFY | `frontend/src/services/api/sdlcApi.ts` | 3 |
| 🔄 MODIFY | `frontend/src/store/useSdlcStore.ts` | 3 |
| 🔄 MODIFY | `agents/requirements.txt` | 4 |
| 🔄 MODIFY | `agents/src/agents/po_agent.py` | 4 |
| 🔄 MODIFY | `agents/src/agents/ux_agent.py` | 4 |
| 🔄 MODIFY | `agents/src/agents/dev_agent.py` | 4 |
| 🔄 MODIFY | `agents/src/agents/qa_agent.py` | 4 |
| 🔄 MODIFY | `frontend/package.json` | 4 |
| 🔄 MODIFY | `README.md` | 4 |
| 🔄 MODIFY | `docs/architecture.md` | 4 |
| 🔄 MODIFY | `CLAUDE.md` | 4 |
| 📁 ARCHIVE | `frontend/src/pages/SdlcDashboard/components/AgentPhaseCard.tsx` | 3 |
| 📁 ARCHIVE | `frontend/src/pages/SdlcDashboard/components/FeatureRequestForm.tsx` | 3 |
| 📁 ARCHIVE | `frontend/src/pages/SdlcDashboard/components/McpActivityPanel.tsx` | 3 |
| 📁 ARCHIVE | `frontend/src/pages/SdlcDashboard/components/StageInspector.tsx` | 3 |
| 📁 ARCHIVE | `frontend/src/pages/SdlcDashboard/components/PenpotPreview.tsx` | 3 |
| 📁 ARCHIVE | `frontend/src/pages/SdlcDashboard/components/ReleaseGatePanel.tsx` | 3 |
| 🔄 REFACTOR | `sandbox/Dockerfile` | 1 |
| 🆕 NEW | `sandbox/docker_sandbox.py` | 2 |
| 📁 ARCHIVE | `sandbox/e2b_runtime.py` | 4 |
| 📁 ARCHIVE | `sandbox/run_dev.py` | 4 |
| 📁 ARCHIVE | `sandbox/test_e2b.py` | 4 |
| 🔄 UPDATE | `agents/src/tools/sandbox.py` | 2 |
| ✅ KEEP | `agents/src/schemas/aidlc.py` (SandboxReport) | — |

### C. Glossary

| Thuật ngữ | Giải thích |
|---|---|
| **Multica** | Open-source platform quản lý multi-agent coding (multica-ai/multica) |
| **Daemon** | Background process chạy trên máy local, auto-detect + spawn agent CLIs |
| **HITL** | Human-in-the-Loop — con người review trước khi pipeline tiếp tục |
| **A2A Handoff** | Agent-to-Agent handoff — chuyển giao output giữa các agents |
| **Confidence Score** | Điểm tự tin của agent output (0-100). < 80 → cần human review |
| **Quality Gate** | Bộ rules đánh giá QA output (coverage, blockers, security) |
| **Sandbox Gate (G3)** | Kiểm tra DEV output: apply patch → chạy tests trong Docker container |
| **Docker Local Sandbox** | Container isolated thay E2B: `--network=none`, `--memory=512m`, `--read-only` |
| **E2B Sandbox** | Cloud sandbox (Firecracker VM) — **bị thay bằng Docker Local Sandbox** |
| **Git Worktree** | Git branch isolated — prepare code trước khi đưa vào Docker test |
| **Pipeline** | Luồng sequential: PO → UX → DEV → Sandbox Gate → QA |
| **Shallow Clone** | `git clone --depth 1` — chỉ clone commit mới nhất, nhanh hơn |
