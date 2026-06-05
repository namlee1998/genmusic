# 🎯 Task Assignment: Minh — Backend Lead

> **Vai trò:** Backend Development (Node.js)
> **Phases chịu trách nhiệm:** Phase 1 (Infra setup) + Phase 2 (Backend services)
> **Tham chiếu:** [MULTICA_INTEGRATION_PLAN.md](./MULTICA_INTEGRATION_PLAN.md)
> **Liên hệ:** Giang (FE + PM), Nam (Agent)

---

## Tổng Quan Công Việc

```
Day 1: Phase 1a — Multica server Docker setup
Day 2: Phase 1b — CLI + daemon + Claude Code verify + sandbox Dockerfile
Day 3: Phase 2a — GitService (clone, analyze, commit)
Day 4: Phase 2b — MulticaClient + docker_sandbox.py + pipeline endpoint
Day 5: Integration FE ↔ BE (pair với Giang)
Day 6: E2E test + fix bugs
Day 7: Cleanup + docs
```

---

## Phase 1: Setup Multica Infrastructure

### Day 1: Multica Server Docker Setup

- [ ] **Clone Multica repository**
  ```powershell
  git clone https://github.com/multica-ai/multica.git C:\Tools\multica
  cd C:\Tools\multica
  ```

- [ ] **Cấu hình environment**
  - Tạo `.env` trong `C:\Tools\multica`:
    ```env
    MULTICA_DB_HOST=localhost
    MULTICA_DB_PORT=5432
    MULTICA_DB_USER=multica
    MULTICA_DB_PASSWORD=multica_dev_2024
    MULTICA_DB_NAME=multica
    MULTICA_SERVER_PORT=8080
    MULTICA_LOG_LEVEL=debug
    ```

- [ ] **Khởi động Docker containers**
  ```powershell
  # Trong C:\Tools\multica
  make selfhost
  # Hoặc nếu không có make:
  docker compose up -d
  ```

- [ ] **Verify server chạy**
  ```powershell
  # Health check
  curl http://localhost:8080/health
  
  # Xem logs
  docker compose logs -f multica-server
  ```

- [ ] **Báo Giang:** ✅ Multica server đã chạy trên `localhost:8080`

---

### Day 2: CLI + Daemon + Sandbox Dockerfile

- [ ] **Cài đặt Multica CLI**
  ```powershell
  # Cài từ Go (nếu đã có Go)
  go install github.com/multica-ai/multica/cmd/multica@latest
  
  # Hoặc download binary từ GitHub releases
  ```

- [ ] **Setup và authenticate**
  ```powershell
  multica setup
  # → Trỏ về http://localhost:8080
  # → Tạo workspace mới cho project
  ```

- [ ] **Start daemon**
  ```powershell
  multica daemon start
  # Daemon sẽ listen cho tasks từ server
  ```

- [ ] **Verify Claude Code CLI integration**
  ```powershell
  # Kiểm tra daemon detect được claude CLI
  multica agent list
  # Expected output: claude CLI detected
  
  # Test tạo issue
  multica issue create --title "Test issue" --body "Testing Multica setup"
  ```

- [ ] **Build sandbox Docker image**
  ```powershell
  cd <project-root>/sandbox
  docker build -t aidlc-sandbox:latest .
  
  # Verify image
  docker run --rm aidlc-sandbox:latest node --version
  docker run --rm aidlc-sandbox:latest python3 --version
  ```

- [ ] **Báo Giang:** ✅ Multica CLI + daemon + sandbox image ready

---

## Phase 2: Backend Services

### Day 3: GitService

- [ ] **Tạo `backend/src/services/GitService.js`**

  Chức năng chính:
  ```javascript
  class GitService {
    // Clone repo về workspace/projects/<projectId>/repo
    async cloneRepo(repoUrl, projectId) {
      // git clone --depth 1 <repoUrl> <targetDir>
      // return { success, path, error }
    }
    
    // Phân tích codebase: tech stack, components, file count
    async analyzeRepo(projectPath) {
      // Đọc package.json, requirements.txt, etc.
      // return { techStack: [], components: [], fileCount }
    }
    
    // Commit QA report vào repo
    async commitQAReport(projectPath, qaContent, sessionId) {
      // Tạo branch agent/qa-<sessionId>
      // Ghi QA.md
      // git add + commit
      // return { commitSha, branch }
    }
  }
  ```

  Lưu ý:
  - Dùng `child_process.execFile` (không dùng `exec` — tránh shell injection)
  - Timeout 60s cho clone, 30s cho analyze
  - Error handling: repo không tồn tại, network error, permission denied

- [ ] **Test GitService:**
  ```powershell
  # Test clone một repo nhỏ
  node -e "
    const git = new (require('./backend/src/services/GitService'))();
    git.cloneRepo('https://github.com/expressjs/express.git', 'test-1').then(console.log);
  "
  ```

---

### Day 4: MulticaClient + Docker Sandbox + Pipeline Endpoint

- [ ] **Tạo `backend/src/services/MulticaClient.js`**

  Chức năng chính:
  ```javascript
  class MulticaClient {
    constructor(baseUrl = 'http://localhost:8080') { ... }
    
    // Tạo issue (task) trên Multica
    async createIssue(title, body, labels = []) {
      // POST /api/issues
      // return { issueId, status }
    }
    
    // Poll issue status
    async getIssueStatus(issueId) {
      // GET /api/issues/:id
      // return { status, output, completedAt }
    }
    
    // Lấy issue output (agent result)
    async getIssueOutput(issueId) {
      // GET /api/issues/:id/output
      // return { content, artifacts }
    }
  }
  ```

- [ ] **Tạo `sandbox/docker_sandbox.py`**
  - Xem code mẫu trong MULTICA_INTEGRATION_PLAN.md §2.4
  - Dùng `subprocess.run(["docker", "run", "--rm", ...])` 
  - Flags bắt buộc: `--network=none`, `--memory=512m`, `--cpus=1`, `--read-only`, `--pids-limit=100`

- [ ] **Update `backend/src/services/SdlcWorkflowService.js`**

  State machine mới:
  ```javascript
  class SdlcWorkflowService {
    async startPipeline(repoUrl) {
      // 1. gitService.cloneRepo()
      // 2. gitService.analyzeRepo()
      // 3. multicaClient.createIssue() — PO Agent
      // 4. Poll PO → if confidence < 80% → approval
      // 5. multicaClient.createIssue() — UX Agent
      // 6. multicaClient.createIssue() — DEV Agent
      // 7. Sandbox Gate: apply patch → docker test
      // 8. multicaClient.createIssue() — QA Agent
      // 9. gitService.commitQAReport()
    }
    
    async getPipelineStatus(projectId) { ... }
    async approveItem(projectId, approvalId, action, comment) { ... }
  }
  ```

- [ ] **Update routes**
  - File: `backend/src/routes/sdlcRoutes.js`
  - File: `backend/src/controllers/SdlcController.js`

  ```javascript
  // Endpoints cần implement:
  router.post('/api/sdlc/pipeline', controller.startPipeline);
  router.get('/api/sdlc/pipeline/:projectId', controller.getStatus);
  router.post('/api/sdlc/pipeline/:projectId/approve', controller.approve);
  router.get('/api/sdlc/pipeline/:projectId/artifacts/:type', controller.getArtifact);
  ```

---

### Day 5: Integration với Frontend

- [ ] **Pair với Giang để connect FE ↔ BE**
  - Verify tất cả 4 endpoints hoạt động
  - Test real-time polling
  - Fix CORS issues nếu có

- [ ] **Test flows:**
  - [ ] POST /pipeline → clone + analyze thành công
  - [ ] GET /pipeline/:id → status update đúng
  - [ ] POST /approve → pipeline tiếp tục
  - [ ] GET /artifacts → trả về markdown content

---

### Day 6: E2E Testing

- [ ] **Test full pipeline:**
  - [ ] Submit repo URL → clone → analyze
  - [ ] PO Agent chạy qua Multica → output PRD
  - [ ] Approval flow (confidence < 80%)
  - [ ] DEV Agent → code diff → sandbox gate
  - [ ] Docker sandbox chạy tests
  - [ ] QA Agent → QA.md committed
  - [ ] Toàn bộ flow end-to-end

- [ ] **Edge cases:**
  - [ ] Invalid repo URL
  - [ ] Multica server down → graceful error
  - [ ] Sandbox timeout → retry logic
  - [ ] Claude CLI not logged in → clear error message

---

### Day 7: Cleanup + Docs

- [ ] Update `backend/package.json` — remove unused deps
- [ ] Remove deprecated LangChain/OpenAI imports
- [ ] Update `.env.example` với env vars mới
- [ ] Viết API documentation trong `docs/API.md`

---

## Files Tôi Chịu Trách Nhiệm

| Action | File |
|---|---|
| 🆕 NEW | `backend/src/services/GitService.js` |
| 🆕 NEW | `backend/src/services/MulticaClient.js` |
| 🆕 NEW | `sandbox/docker_sandbox.py` |
| 🔄 REFACTOR | `sandbox/Dockerfile` |
| 🔄 MODIFY | `backend/src/services/SdlcWorkflowService.js` |
| 🔄 MODIFY | `backend/src/controllers/SdlcController.js` |
| 🔄 MODIFY | `backend/src/routes/sdlcRoutes.js` |
| 🔄 MODIFY | `.env.example` |
| 🆕 NEW | `docs/API.md` |

---

## API Contract (Thống nhất với Giang)

> ⚠️ **Giang sẽ code FE dựa trên contract này. Nếu thay đổi → báo ngay!**

```javascript
// POST /api/sdlc/pipeline
// Request:
{ "repoUrl": "https://github.com/user/repo.git" }
// Response:
{ "projectId": "proj-abc123", "status": "cloning" }

// GET /api/sdlc/pipeline/:projectId
// Response:
{
  "projectId": "proj-abc123",
  "status": "awaiting_approval",  // PipelineStatus enum
  "currentStep": 3,               // 1-6
  "repoInfo": {
    "techStack": ["React", "Node.js"],
    "fileCount": 90,
    "components": ["Header", "Sidebar", "Dashboard"]
  },
  "approvals": [
    {
      "id": "appr-001",
      "agentName": "PO",
      "artifactType": "prd",
      "confidence": 72,
      "summary": "Generated PRD for e-commerce checkout...",
      "createdAt": "2026-06-05T10:30:00Z"
    }
  ],
  "qaResult": null
}

// POST /api/sdlc/pipeline/:projectId/approve
// Request:
{ "approvalId": "appr-001", "action": "approve", "comment": "LGTM" }
// Response:
{ "success": true }

// GET /api/sdlc/pipeline/:projectId/artifacts/:type
// type = "prd" | "ux_spec" | "code_diff" | "qa_report"
// Response:
{ "content": "# PRD Document\n...", "format": "markdown" }
```

---

## Dependencies & Blockers

| Phụ thuộc | Từ ai | Khi nào cần |
|---|---|---|
| Multica server running | Bản thân | Day 1 |
| Claude Code CLI logged in | Nam | Day 2 |
| Agent prompts cho PO/UX/DEV/QA | Nam | Day 4 |
| FE mock data format | Giang | Day 1 (để align contract) |
| Integration testing | Giang | Day 5 |
