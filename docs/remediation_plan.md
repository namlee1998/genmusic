# 📋 Kế Hoạch Sửa Lỗi — Dự Án AIFA

**Ngày lập:** 2026-06-24  
**Nguồn:** System Audit Report  
**Mục đích:** Bàn giao cho team thực hiện  
**Bối cảnh:** Dự án local-only, single-user — các vấn đề security (auth, rate-limit) là by-design, không cần sửa.

---

## Tổng quan

| Phase | Nội dung | Ưu tiên | Ước lượng |
|-------|----------|---------|-----------|
| **Phase 1** | Fix lỗi code (ESLint + TypeScript) + CI | 🔴 Cao | 2–3 ngày |
| **Phase 2** | Refactor God Service backend (164KB) | 🟡 Trung bình | 3–5 ngày |
| **Phase 3** | Refactor God Component frontend + DB + Docs | 🟡 Trung bình | 3–4 ngày |
| **Phase 4** | Tăng test coverage + Performance | 🔵 Thấp | 3–5 ngày |

---

## Phase 1 — Fix Lỗi Code + CI Pipeline (Ưu tiên cao nhất)

> Mục tiêu: Code build sạch, CI bắt lỗi trước khi merge PR.

---

### Task 1.1 — Fix 3 ESLint Errors (setState trong useEffect)

**Phụ trách:** Frontend  
**Tệp cần sửa:**

#### 1.1a — `frontend/src/pages/SdlcDashboard/components/AgentOutputPanel.tsx` (dòng 403)

**Vấn đề:** Gọi `setLoading(false)` trực tiếp trong body của `useEffect` → gây cascading renders.

**Cách sửa:** Dùng early return trước effect hoặc chuyển logic ra ngoài effect:

```diff
 useEffect(() => {
   let cancelled = false;
-  if (!taskId) {
-    setLoading(false);
-    return;
-  }
-  setLoading(true);
+  if (!taskId) return;
   // ... fetch logic
   return () => { cancelled = true; };
 }, [taskId]);
+
+ // Derive loading state outside effect
+ const isLoading = !!taskId && /* đang fetch */;
```

Hoặc đơn giản hơn: khởi tạo `loading` state dựa trên `taskId`:

```tsx
const [loading, setLoading] = useState(!!taskId);
```

#### 1.1b — `frontend/src/pages/SdlcDashboard/index.tsx` (dòng 109)

**Vấn đề:** `setOpenAgentPanel(deepLinkAgentKey)` trong `useEffect`.

**Cách sửa:** Chuyển sang `useMemo` hoặc tính ngoài effect:

```diff
- useEffect(() => {
-   if (deepLinkAgentKey && ['PO', 'UX', 'DEV', 'QA'].includes(deepLinkAgentKey)) {
-     setOpenAgentPanel(deepLinkAgentKey);
-     // ...
-   }
- }, [deepLinkAgentKey]);
+ // Khởi tạo state từ URL param trực tiếp
+ const [openAgentPanel, setOpenAgentPanel] = useState(() => {
+   return deepLinkAgentKey && ['PO', 'UX', 'DEV', 'QA'].includes(deepLinkAgentKey)
+     ? deepLinkAgentKey : null;
+ });
```

#### 1.1c — `frontend/src/pages/SdlcDashboard/index.tsx` (dòng 88, 155)

**Vấn đề:** `pipelinePhases` logical expression làm deps của `useMemo` thay đổi mỗi render.

**Cách sửa:** Wrap `pipelinePhases` trong `useMemo` riêng:

```diff
+ const stablePipelinePhases = useMemo(() => pipelinePhases ?? [], [pipelinePhases]);
+
  const statusCounts = useMemo(() => {
    const counts = { completed: 0, running: 0, pending: 0, failed: 0 };
-   pipelinePhases?.forEach(p => { ... });
+   stablePipelinePhases.forEach(p => { ... });
    return counts;
- }, [pipelinePhases]);
+ }, [stablePipelinePhases]);
```

**Verify:** Chạy `npm run lint` → 0 errors.

---

### Task 1.2 — Fix 25+ TypeScript Errors

**Phụ trách:** Frontend  
**Tệp cần sửa:**

#### 1.2a — Cài type cho `socket.io-client`

```bash
cd frontend
npm install --save-dev @types/socket.io-client
# Hoặc nếu socket.io-client v4+ đã bundled types, kiểm tra tsconfig paths
```

**Tệp:** `frontend/src/components/sdlc/ToolApprovalPrompt.tsx` (dòng 2)

#### 1.2b — Fix Store Type Drift

**Tệp chính:** `frontend/src/store/useSdlcStore.ts`

**Vấn đề:** Các component dùng `pipelinePhases`, `auditLog`, `pendingGates`, `error` từ store nhưng `SdlcState` type không có các field này.

**Cách sửa:** Thêm các field còn thiếu vào `SdlcState` interface:

```typescript
// Trong useSdlcStore.ts, thêm vào SdlcState interface:
interface SdlcState {
  // ... existing fields ...
  pipelinePhases: PhaseStatus[];    // ← thêm
  auditLog: AuditEntry[];           // ← thêm
  pendingGates: GateItem[];         // ← thêm
  error: string | null;             // ← thêm
}
```

#### 1.2c — Fix Implicit `any` trong `AgentsPage.tsx`

**Tệp:** `frontend/src/pages/SdlcDashboard/AgentsPage.tsx`

Thêm type annotation cho tất cả 17 parameter đang implicit `any`:

```typescript
// Ví dụ:
// Trước:  .filter((p) => p.status === 'completed')
// Sau:    .filter((p: PhaseStatus) => p.status === 'completed')

// Trước:  .map((e) => ...)
// Sau:    .map((e: AuditEntry) => ...)

// Trước:  .filter((g) => g.role === agent)
// Sau:    .filter((g: GateItem) => g.role === agent)
```

#### 1.2d — Fix `AuditPage.tsx` argument mismatch

**Tệp:** `frontend/src/pages/SdlcDashboard/AuditPage.tsx` (dòng 44, 95)

**Vấn đề:** Gọi function với 1 argument nhưng cần 2.

**Cách sửa:** Kiểm tra function signature trong store/api và truyền đủ argument.

#### 1.2e — Fix `useSdlcStore.ts` status type (dòng 353)

**Vấn đề:** `status: string` không assignable cho union type `"pending" | "running" | "completed" | "failed" | "awaiting_approval"`.

**Cách sửa:**

```diff
- status: session.status,
+ status: session.status as SessionData['status'],
```

Hoặc tốt hơn: validate giá trị trước khi assign.

**Verify:** Chạy `npx tsc --noEmit` → 0 errors.

---

### Task 1.3 — Fix Unused Variables (ESLint Warnings)

**Phụ trách:** Frontend

| Tệp | Dòng | Biến | Cách sửa |
|------|------|------|----------|
| `index.tsx` | 301 | `hasOutputToReview` | Xóa nếu không dùng, hoặc sử dụng trong JSX |
| `useSdlcStore.ts` | 310 | `status` | Xóa hoặc prefix `_status` |

**Verify:** `npm run lint` → 0 errors, 0 warnings.

---

### Task 1.4 — Thêm Frontend + Agents vào CI Pipeline

**Phụ trách:** DevOps / Bất kỳ  
**Tệp sửa:** `.github/workflows/ci.yml`

Thêm 2 job mới:

```yaml
  frontend:
    name: frontend lint + typecheck + tests
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: frontend
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
          cache-dependency-path: frontend/package-lock.json
      - run: npm ci
      - run: npx tsc --noEmit
      - run: npm run lint
      - run: npm test

  agents:
    name: python agent tests
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: agents
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      - run: pip install -r requirements.txt
      - run: python -m pytest tests/ -v
```

**Verify:** Push 1 commit lỗi TS → CI phải fail (red).

---

## Phase 2 — Refactor God Service Backend

> Mục tiêu: Tách `SdlcWorkflowService.js` (164KB / 3,465 dòng) thành các module có trách nhiệm rõ ràng.

---

### Task 2.1 — Lập mapping function → module mới

**Phụ trách:** Backend  
**Tệp nguồn:** `backend/src/services/SdlcWorkflowService.js`

Mở file, liệt kê tất cả exported functions và nhóm theo domain:

| Module mới | Functions thuộc nhóm | Ước lượng |
|------------|---------------------|-----------|
| `WorkflowOrchestrator.js` | `runPipeline`, `advancePhase`, `recoverInterruptedGates`, state machine logic | ~800 dòng |
| `AgentDispatcher.js` | `runPOAgent`, `runUXAgent`, `runDEVAgent`, `runQAAgent`, `runIntentAgent`, agent invocation/retry | ~600 dòng |
| `GateManager.js` | `submitGateDecision`, `submitStructuredDecision`, `resolveApproval`, gate validation | ~500 dòng |
| `SessionManager.js` | `listSessions`, `createSession`, session CRUD, concurrency control | ~400 dòng |
| `ArtifactManager.js` | Artifact persistence, `getProjectArtifacts`, content hash | ~400 dòng |
| `ReleaseManager.js` | `getFinalReviewPacket`, `submitReleaseDecision`, git commit | ~350 dòng |
| `WorkflowReport.js` | `getWorkflowStatus`, `getWorkflowMetrics`, `getTimeline`, `getAuditTrail` | ~350 dòng |

### Task 2.2 — Tách từng module (lần lượt, không song song)

**Quy trình cho mỗi module:**

1. Tạo file mới trong `backend/src/services/`
2. Move functions liên quan sang file mới
3. Export functions từ file mới
4. Trong `SdlcWorkflowService.js`, import và re-export (backward compatible)
5. Chạy `npm test` — đảm bảo all tests pass
6. Commit

**Thứ tự tách (ít dependency → nhiều dependency):**

```
1. WorkflowReport.js        (ít dependency nhất, chỉ read DB)
2. ArtifactManager.js       (CRUD artifacts)
3. SessionManager.js        (CRUD sessions)
4. ReleaseManager.js        (final review flow)
5. GateManager.js           (gate logic, phụ thuộc gateBridge)
6. AgentDispatcher.js       (gọi agents, phụ thuộc gate)
7. WorkflowOrchestrator.js  (orchestrate tất cả, file cuối)
```

### Task 2.3 — Cập nhật Controller

**Tệp:** `backend/src/controllers/SdlcController.js`

Sau khi tách xong, controller import trực tiếp từ module cụ thể thay vì 1 file lớn:

```javascript
// Trước:
const SdlcWorkflowService = require('../services/SdlcWorkflowService');

// Sau:
const WorkflowOrchestrator = require('../services/WorkflowOrchestrator');
const GateManager = require('../services/GateManager');
const SessionManager = require('../services/SessionManager');
// ...
```

**Verify:** `npm test` → all pass. Chạy manual test 1 pipeline flow hoàn chỉnh.

---

## Phase 3 — Refactor Frontend + DB + Docs

---

### Task 3.1 — Tách `AgentsPage.tsx` (54KB)

**Phụ trách:** Frontend  
**Tệp:** `frontend/src/pages/SdlcDashboard/AgentsPage.tsx`

Tách thành các component con:

```
AgentsPage.tsx (~5KB, shell)
├── components/
│   ├── AgentCard.tsx          (~8KB)  — card hiển thị 1 agent
│   ├── AgentTimeline.tsx      (~8KB)  — timeline sự kiện
│   ├── AgentOutputViewer.tsx  (~10KB) — hiển thị output
│   ├── GateApprovalPanel.tsx  (~8KB)  — approve/reject UI
│   ├── PipelineProgress.tsx   (~5KB)  — progress bar
│   └── AgentMetrics.tsx       (~5KB)  — thống kê
```

**Quy trình:**
1. Xác định các section/JSX block lớn trong file
2. Extract thành component riêng, truyền props
3. Đảm bảo type-safe (không dùng `any`)
4. Chạy `npm run typecheck` + `npm run lint` sau mỗi lần tách

---

### Task 3.2 — Thêm Cascading Deletes vào Prisma Schema

**Phụ trách:** Backend  
**Tệp:** `backend/prisma/schema.prisma`

Thêm `onDelete: Cascade` cho các relation:

```diff
 model Task {
   // ...
-  project  Project  @relation(fields: [projectId], references: [id])
+  project  Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
-  session  PipelineSession? @relation(fields: [sessionId], references: [id])
+  session  PipelineSession? @relation(fields: [sessionId], references: [id], onDelete: Cascade)
 }

 model PipelineSession {
   // ...
-  project  Project  @relation(fields: [projectId], references: [id])
+  project  Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
 }

 model AgentArtifact {
   // ...
-  task  Task  @relation(fields: [taskId], references: [id])
+  task  Task  @relation(fields: [taskId], references: [id], onDelete: Cascade)
 }
```

**Sau khi sửa:**
```bash
cd backend
npx prisma db push
npm test
```

---

### Task 3.3 — Cập nhật API_CONTRACT.md

**Phụ trách:** Bất kỳ  
**Tệp:** `API_CONTRACT.md`

Bổ sung các endpoint đang thiếu trong tài liệu (so sánh với `backend/src/routes/sdlc.js`):

| Endpoint hiện có trong code | Có trong API_CONTRACT.md? |
|-----------------------------|--------------------------|
| `POST /run-intent-agent` | ❌ Thiếu |
| `POST /upload-repo` | ❌ Thiếu |
| `POST /run-ux-agent` | ❌ Thiếu |
| `POST /run-dev-agent` | ❌ Thiếu |
| `POST /run-qa-agent` | ❌ Thiếu |
| `POST /tasks/:id/gate-decision` | ❌ Thiếu |
| `POST /tasks/:id/decision` | ❌ Thiếu |
| `POST /tasks/:id/cancel` | ❌ Thiếu |
| `POST /output-review/:id` | ❌ Thiếu |
| `GET /tasks/:id` | ❌ Thiếu |
| `GET /tasks/:id/events` | ❌ Thiếu |
| `GET /pipeline/:workflowId` | ❌ Thiếu |
| `GET /workflow-status` | ❌ Thiếu |
| `GET /sessions/:id/final-review-packet` | ❌ Thiếu |
| `POST /sessions/:id/release-decision` | ❌ Thiếu |
| `GET /projects/:id/metrics` | ❌ Thiếu |
| `GET /projects/:id/backlog` | ❌ Thiếu |
| Tổng thiếu: **17 endpoints** | |

---

## Phase 4 — Testing + Performance

---

### Task 4.1 — Thêm Test Coverage Reporting

**Phụ trách:** DevOps

**Backend** — sửa `backend/package.json`:
```diff
- "test": "jest --runInBand"
+ "test": "jest --runInBand --coverage"
```

**Frontend** — sửa `frontend/package.json`:
```diff
- "test": "vitest run"
+ "test": "vitest run --coverage"
```

Cài thêm coverage provider cho frontend:
```bash
cd frontend && npm install -D @vitest/coverage-v8
```

---

### Task 4.2 — Viết thêm Frontend Tests

**Phụ trách:** Frontend  
**Mục tiêu tối thiểu:** Cover các flow chính

| Test file mới | Chức năng test |
|---------------|---------------|
| `AgentCard.test.tsx` | Render đúng trạng thái agent |
| `GateApproval.test.tsx` | Approve/Reject flow |
| `PipelineProgress.test.tsx` | Hiển thị đúng phase status |
| `ImportProjectDialog.test.tsx` | Upload repo flow |
| `useSdlcStore.test.ts` | Store actions + state transitions |

---

### Task 4.3 — Thêm Response Compression

**Phụ trách:** Backend  
**Tệp:** `backend/src/server.js`

```bash
cd backend && npm install compression
```

```diff
 const cors = require('cors');
+const compression = require('compression');

 app.use(cors(corsConfig));
+app.use(compression());
 app.use(express.json({ limit: '50mb' }));
```

---

### Task 4.4 — Di chuyển `express` sang devDependencies (Frontend)

**Tệp:** `frontend/package.json`

```bash
cd frontend
npm uninstall express
npm install -D express
```

---

## Checklist Bàn Giao

Người nhận bàn giao dùng checklist này để track tiến độ:

- [ ] **Phase 1**
  - [ ] 1.1 — Fix 3 ESLint errors (setState in effect)
  - [ ] 1.2a — Cài type socket.io-client
  - [ ] 1.2b — Fix Store type drift (SdlcState interface)
  - [ ] 1.2c — Fix implicit `any` trong AgentsPage.tsx
  - [ ] 1.2d — Fix AuditPage.tsx argument mismatch
  - [ ] 1.2e — Fix status type casting
  - [ ] 1.3 — Fix unused variables
  - [ ] 1.4 — Thêm frontend + agents job vào CI
  - [ ] ✅ Verify: `npm run lint` = 0 errors, `npx tsc --noEmit` = 0 errors
- [ ] **Phase 2**
  - [ ] 2.1 — Lập mapping functions → modules
  - [ ] 2.2 — Tách 7 modules (theo thứ tự)
  - [ ] 2.3 — Cập nhật Controller imports
  - [ ] ✅ Verify: `npm test` = all pass
- [ ] **Phase 3**
  - [ ] 3.1 — Tách AgentsPage.tsx thành 6 components
  - [ ] 3.2 — Thêm cascading deletes Prisma
  - [ ] 3.3 — Cập nhật API_CONTRACT.md (17 endpoints)
  - [ ] ✅ Verify: lint + typecheck + test pass
- [ ] **Phase 4**
  - [ ] 4.1 — Thêm coverage reporting
  - [ ] 4.2 — Viết thêm 5 test files
  - [ ] 4.3 — Thêm compression middleware
  - [ ] 4.4 — Move express sang devDependencies

---

> **Lưu ý:** Mỗi Phase nên tạo **1 branch riêng** và merge qua PR. Không làm nhiều Phase trên cùng 1 branch để dễ review và rollback.
