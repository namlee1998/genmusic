# 🎯 Task Assignment: Giang — Frontend Lead & Project Manager

> **Vai trò:** Frontend Development + Quản lý dự án
> **Phases chịu trách nhiệm:** Phase 3 (FE) + Phase 4 (docs) + quản lý tổng
> **Tham chiếu:** [MULTICA_INTEGRATION_PLAN.md](./MULTICA_INTEGRATION_PLAN.md)

---

## Tổng Quan Công Việc

```
Day 1-2: Setup FE + Mock API + RepoInput component
Day 3-4: PipelineStepper + ApprovalQueue + QAResultCard
Day 5:   Integrate FE ↔ Backend (Minh)
Day 6:   E2E test + fix bugs
Day 7:   Docs + cleanup + review toàn bộ

Song song: Quản lý tiến độ team (Minh, Nam)
```

---

## Phase 3: Frontend Refactor

### Day 1-2: Foundation + RepoInput

- [x] **Setup mock API layer**
  - File: `frontend/src/services/api/sdlcApi.ts`
  - Tạo biến `VITE_USE_MOCK=true` trong `.env.development`
  - Mock data cho 4 endpoints:
    ```typescript
    POST /api/sdlc/pipeline          → { projectId, status }
    GET  /api/sdlc/pipeline/:id      → { status, currentStep, approvals, qaResult }
    POST /api/sdlc/pipeline/:id/approve → { success }
    GET  /api/sdlc/pipeline/:id/artifacts/:type → { content }
    ```
  - Mock data nên cover đủ các state: cloning, analyzing, po_running, awaiting_approval, qa_complete

- [x] **Tạo Zustand store mới**
  - File: `frontend/src/store/useSdlcStore.ts`
  - State cần:
    ```typescript
    interface SdlcState {
      projectId: string | null;
      repoUrl: string;
      pipelineStatus: PipelineStatus;
      currentStep: number;       // 1-6
      approvals: ApprovalItem[];
      qaResult: QAResult | null;
      isLoading: boolean;
      error: string | null;
      // actions
      submitRepo: (url: string) => Promise<void>;
      pollStatus: () => Promise<void>;
      approveItem: (id: string, action: 'approve' | 'reject', comment?: string) => Promise<void>;
    }
    ```

- [x] **Component: RepoInput**
  - File: `frontend/src/pages/SdlcDashboard/components/RepoInput.tsx`
  - Input field cho GitHub/GitLab URL
  - Validate URL format (phải là .git hoặc https://github.com/...)
  - Button "Analyze Repository"
  - Loading state khi submitting
  - Hiện repo info sau khi clone thành công (tech stack, file count)
  - **Wireframe:**
    ```
    ┌─────────────────────────────────────────────────┐
    │  🔗 Repository URL                              │
    │  ┌───────────────────────────────────────┐ ┌──┐ │
    │  │ https://github.com/user/repo.git      │ │▶ │ │
    │  └───────────────────────────────────────┘ └──┘ │
    │                                                 │
    │  📊 Analysis: React, Node.js | 90 files | 3 components │
    └─────────────────────────────────────────────────┘
    ```

---

### Day 3: PipelineStepper

- [x] **Component: PipelineStepper**
  - File: `frontend/src/pages/SdlcDashboard/components/PipelineStepper.tsx`
  - 6 steps: Clone → Analyze → PO Agent → UX Agent → DEV Agent → QA Agent
  - States cho mỗi step: pending | running | awaiting_approval | complete | failed
  - Animated progress indicator
  - Real-time update qua polling (mỗi 3s khi pipeline đang chạy)
  - **Wireframe:**
    ```
    ┌──────────────────────────────────────────────────┐
    │  ① Clone  ② Analyze  ③ PO  ④ UX  ⑤ DEV  ⑥ QA   │
    │  [✅]──────[✅]──────[🔄]──[⏳]──[⏳]──[⏳]      │
    │                       │                          │
    │           "PO Agent đang phân tích PRD..."       │
    └──────────────────────────────────────────────────┘
    ```

---

### Day 4: ApprovalQueue + QAResultCard + DetailModal

- [x] **Component: ApprovalQueue**
  - File: `frontend/src/pages/SdlcDashboard/components/ApprovalQueue.tsx`
  - List các approval items cần user review
  - Mỗi card hiện: agent name, artifact type, confidence score, summary
  - Buttons: Approve ✅ / Reject ❌
  - Optional comment khi reject
  - Badge count trên header
  - **Wireframe:**
    ```
    ┌─────────────────────────────────────────────────┐
    │  📋 Pending Approvals (2)                       │
    │  ┌───────────────────────────────────────────┐  │
    │  │ 🤖 PO Agent — PRD Document                │  │
    │  │ Confidence: 72%  ⚠️                       │  │
    │  │ "Generated PRD for e-commerce checkout..." │  │
    │  │ [👁 Detail]    [✅ Approve]  [❌ Reject]   │  │
    │  └───────────────────────────────────────────┘  │
    │  ┌───────────────────────────────────────────┐  │
    │  │ 🤖 DEV Agent — Code Diff                  │  │
    │  │ Confidence: 65%  ⚠️                       │  │
    │  │ "Modified 5 files, added checkout API..."  │  │
    │  │ [👁 Detail]    [✅ Approve]  [❌ Reject]   │  │
    │  └───────────────────────────────────────────┘  │
    └─────────────────────────────────────────────────┘
    ```

- [x] **Component: QAResultCard**
  - File: `frontend/src/pages/SdlcDashboard/components/QAResultCard.tsx`
  - Hiện QA report summary (pass/fail, coverage, issues found)
  - Link tới QA.md trong repo
  - Final approve/reject cho release
  - **Wireframe:**
    ```
    ┌─────────────────────────────────────────────────┐
    │  🧪 QA Report — Final                           │
    │  Status: ✅ PASSED  |  Coverage: 85%            │
    │  Issues: 0 blockers, 2 warnings                 │
    │  ┌─────────────────────────────────────────┐    │
    │  │ QA.md đã được commit vào repo           │    │
    │  │ Branch: agent/qa-session-abc123         │    │
    │  └─────────────────────────────────────────┘    │
    │  [👁 Full Report]  [✅ Release]  [❌ Reject]    │
    └─────────────────────────────────────────────────┘
    ```

- [x] **Component: DetailModal**
  - File: `frontend/src/pages/SdlcDashboard/components/DetailModal.tsx`
  - Modal hiện chi tiết artifact (PRD, UX spec, code diff, QA report)
  - Render markdown content
  - Code diff syntax highlighting
  - Scroll + copy button

---

### Day 5: Integration với Backend

- [ ] **Chuyển mock → real API**
  - Set `VITE_USE_MOCK=false`
  - Verify tất cả endpoints hoạt động với backend của Minh
  - Test WebSocket/polling real-time updates

- [x] **Update SdlcDashboard/index.tsx**
  - File: `frontend/src/pages/SdlcDashboard/index.tsx`
  - Layout mới: RepoInput → PipelineStepper → ApprovalQueue → QAResultCard
  - Archive các components cũ (move vào `_archive/`)

---

### Day 6: Testing + Polish

- [x] **Test tất cả flows:**
  - [x] Submit repo → clone → analyze → hiện tech stack
  - [x] Pipeline chạy → stepper animate
  - [x] Approval card hiện khi confidence < 80%
  - [x] Approve → pipeline tiếp tục
  - [x] Reject → pipeline dừng
  - [x] QA complete → QAResultCard hiện kết quả
  - [x] Detail modal hiện đúng content

- [ ] **UI polish:**
  - [ ] Responsive trên mobile
  - [ ] Dark mode compatibility
  - [ ] Loading skeletons
  - [ ] Error states (network error, timeout, etc.)
  - [ ] Empty states

---

## Phase 4: Documentation (Day 7)

- [ ] Update `README.md` — hướng dẫn setup FE
- [ ] Update `frontend/docs/PROGRESS.md` — ghi nhận tiến độ
- [ ] Review + merge code của Minh và Nam
- [ ] Viết `docs/DEMO_GUIDE.md` — hướng dẫn demo

---

## Quản Lý Dự Án (Song Song Cả Tuần)

### Daily check:
- [ ] **Day 1:** Confirm Minh setup Multica thành công, Nam hiểu agent prompts
- [ ] **Day 2:** Verify daemon + Claude Code CLI hoạt động
- [ ] **Day 3:** Review API contract với Minh — thống nhất request/response format
- [ ] **Day 4:** Check Nam đã refactor xong agent prompts chưa
- [ ] **Day 5:** Integration day — pair với Minh để connect FE ↔ BE
- [ ] **Day 6:** Full team test E2E flow
- [ ] **Day 7:** Final review + docs

### Blocking issues cần escalate:
- Nếu Multica server không chạy được → fallback plan: mock Multica, dùng subprocess trực tiếp
- Nếu API contract thay đổi → update mock data + thông báo Minh
- Nếu Claude Code CLI cần login → chuẩn bị hướng dẫn cho Nam

---

## Files Tôi Chịu Trách Nhiệm

| Action | File |
|---|---|
| 🆕 NEW | `frontend/src/pages/SdlcDashboard/components/RepoInput.tsx` |
| 🆕 NEW | `frontend/src/pages/SdlcDashboard/components/PipelineStepper.tsx` |
| 🆕 NEW | `frontend/src/pages/SdlcDashboard/components/ApprovalQueue.tsx` |
| 🆕 NEW | `frontend/src/pages/SdlcDashboard/components/QAResultCard.tsx` |
| 🆕 NEW | `frontend/src/pages/SdlcDashboard/components/DetailModal.tsx` |
| 🔄 MODIFY | `frontend/src/pages/SdlcDashboard/index.tsx` |
| 🔄 MODIFY | `frontend/src/services/api/sdlcApi.ts` |
| 🔄 MODIFY | `frontend/src/store/useSdlcStore.ts` |
| 🆕 NEW | `docs/DEMO_GUIDE.md` |
| 🔄 MODIFY | `README.md` |
| 📁 ARCHIVE | 6 old FE components (AgentPhaseCard, FeatureRequestForm, etc.) |

---

## API Contract (Thống nhất với Minh)

```typescript
// === Types ===

type PipelineStatus = 
  | 'cloning' | 'analyzing' 
  | 'po_running' | 'ux_running' | 'dev_running' | 'sandbox_testing' | 'qa_running'
  | 'awaiting_approval'
  | 'qa_complete' | 'failed';

interface ApprovalItem {
  id: string;
  agentName: 'PO' | 'UX' | 'DEV' | 'QA';
  artifactType: 'prd' | 'ux_spec' | 'code_diff' | 'qa_report';
  confidence: number;       // 0-100
  summary: string;
  createdAt: string;        // ISO 8601
}

interface QAResult {
  status: 'passed' | 'failed';
  coverage: number;          // 0-100
  blockers: number;
  warnings: number;
  reportUrl: string;         // link tới QA.md trong repo
  commitSha: string;
}

interface PipelineResponse {
  projectId: string;
  status: PipelineStatus;
  currentStep: number;       // 1-6
  repoInfo?: {
    techStack: string[];
    fileCount: number;
    components: string[];
  };
  approvals: ApprovalItem[];
  qaResult?: QAResult;
}
```

> ⚠️ **Lưu ý:** API contract này cần Minh confirm. Nếu có thay đổi → update mock data tương ứng.
