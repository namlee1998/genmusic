# AIFA — Spec triển khai Real Claude Agent SDK Adapter

> Mục tiêu: thay mock runner bằng real Claude Agent SDK nhưng **không viết lại state machine hiện tại**.  
> Phạm vi chính: backend runner, gate handling, UI pending approval cards, smoke test SDK, và chuẩn hóa output contract.

---

## 0. Kết luận thiết kế bắt buộc

Hướng triển khai đúng là:

- Giữ nguyên state machine/workflow hiện tại.
- Giữ `USE_MOCK_CLAUDE_CODE=true/false` làm feature flag fallback.
- Thay logic bên trong `backend/src/agents/claudeCodeRunner.js` bằng adapter thật gọi Claude Agent SDK.
- Không chạy 3 workflow Claude thật song song ngay từ đầu.
- Trước khi tích hợp sâu vào workflow, phải làm **SDK spike nhỏ** để xác minh hành vi thực tế của Claude Agent SDK.

Điểm cần chỉnh so với đề xuất ban đầu:

- Không nhồi toàn bộ logic tool approval + user question vào một khối `canUseTool` lớn.
- Không chỉ nói “prompt chặt + validator” mà phải có prompt ownership, retry policy, và failure behavior rõ ràng.
- Không để session resume là lựa chọn mơ hồ; phải có quyết định rõ cho demo và hướng nâng cấp durable.
- Không để smoke test sau cùng; smoke test phải là bước đầu tiên.
- Phải định nghĩa bằng data contract ranh giới giữa `stage_review`, `tool_permission`, `clarifying_question`, và `final_release`.

---

## 1. Nguyên tắc kiến trúc

### 1.1. Không viết lại workflow

Không thay đổi lớn các thành phần sau:

- `SdlcWorkflowService` state machine.
- Các stage hiện có: PO, UI/UX, DEV, QA.
- Cơ chế artifact validation hiện tại.
- Final release approval hiện tại.
- Audit trail backend vẫn ghi như cũ, nhưng frontend không cần show audit trail trong 3-flow board.

Chỉ thay phần “não agent”:

```txt
SdlcWorkflowService._runAgent
-> claudeCodeRunner.runAgent(...)
-> mock runner hoặc real Claude SDK runner
-> trả output theo agent-io.v1
```

### 1.2. Runner phải là adapter, không được chứa workflow logic

`claudeCodeRunner.js` chỉ chịu trách nhiệm:

- Build prompt cho từng stage.
- Gọi Claude Agent SDK.
- Stream/collect message.
- Dispatch tool permission/user question gate.
- Map final result về `agent-io.v1`.
- Trả lỗi có cấu trúc nếu output invalid hoặc timeout.

Không được đưa state transition PO → UX → DEV → QA vào runner.

---

## 2. Thứ tự triển khai bắt buộc

### Phase 0 — SDK spike trước khi sửa workflow

Mục tiêu: xác minh hành vi thật của SDK trước khi tích hợp sâu.

Tạo một script spike riêng, ví dụ:

```txt
backend/scripts/spikeClaudeAgentSdk.js
```

Script này chạy trên một repo nhỏ/local fixture và kiểm tra tối thiểu:

1. `query({ prompt, options })` chạy được với `ANTHROPIC_API_KEY`.
2. `options.cwd = repoPath` hoạt động đúng.
3. `Read`, `Glob`, `Grep`, `LS` hoạt động trong repo.
4. `canUseTool` được gọi khi Claude muốn dùng `Write`, `Edit`, `Bash`, hoặc `AskUserQuestion`.
5. Có thể return `allow` / `deny` từ callback.
6. Có thể nhận final message và parse structured output.
7. Ghi lại message shape thực tế để adapter không đoán sai.

Acceptance criteria Phase 0:

- Có log mẫu của SDK stream.
- Có log mẫu của một tool permission event.
- Có log mẫu của một `AskUserQuestion` event nếu SDK trigger được.
- Có kết luận rõ: SDK output message shape hiện tại là gì, adapter cần đọc field nào.

> Không làm UI hoặc gateBridge trước khi Phase 0 pass.

---

## 3. Real runner adapter

### 3.1. Feature flag

Giữ biến môi trường:

```env
USE_MOCK_CLAUDE_CODE=true|false
ANTHROPIC_API_KEY=...
```

Behavior:

```txt
USE_MOCK_CLAUDE_CODE=true
-> dùng mock runner hiện tại

USE_MOCK_CLAUDE_CODE=false
-> dùng real Claude SDK adapter
```

### 3.2. Runner interface đề xuất

Không đổi caller nhiều. Runner nên nhận input rõ:

```ts
runAgent({
  workflowId,
  taskId,
  projectId,
  stage,
  repoPath,
  context,
  artifactSchema,
  timeoutMs,
  onGate,
  onProgress,
})
```

Runner output:

```ts
{
  ok: boolean,
  stage: 'po' | 'ux' | 'dev' | 'qa',
  outputVersion: 'agent-io.v1',
  artifact: object,
  rawSummary?: string,
  sdkSessionId?: string,
  usage?: object,
  error?: {
    code: string,
    message: string,
    recoverable: boolean,
  }
}
```

### 3.3. Workspace isolation

Mỗi workflow phải có repo copy riêng:

```txt
/workspaces/{projectId}/{workflowId}/repo
```

Không cho 3 flow dùng chung `repoPath`.

Lý do: Claude thật có thể `Edit`, `Write`, `Bash`; chạy song song trên cùng repo sẽ gây race condition.

---

## 4. `canUseTool` không được chứa business logic lớn

SDK có thể chỉ cung cấp một callback `canUseTool`, nhưng trong codebase AIFA không được nhồi mọi thứ vào một hàm lớn.

Thiết kế đúng:

```txt
canUseTool(...)
-> claudePermissionDispatcher.dispatch(...)
   -> AskUserQuestionHandler.handle(...)
   -> ToolPermissionHandler.handle(...)
   -> ReadOnlyPolicyHandler.handle(...)
   -> DenyPolicyHandler.handle(...)
```

### 4.1. Vì sao phải tách handler

`tool_permission` và `clarifying_question` khác bản chất:

| Loại | Bản chất | Timeout | UI | Output trả về Claude |
|---|---|---:|---|---|
| `tool_permission` | binary allow/deny | ngắn | command/file/diff/path | `{ behavior: 'allow' }` hoặc `{ behavior: 'deny', message }` |
| `clarifying_question` | user cần đọc/suy nghĩ/trả lời | dài | questions/options/free text | `{ behavior: 'allow', updatedInput }` |

Nếu gộp vào một bridge lớn, production debug sẽ khó: không biết đang kẹt vì permission, vì user question, vì timeout, hay vì SDK callback.

### 4.2. Dispatcher contract

Tạo module mới:

```txt
backend/src/agents/claudePermissionDispatcher.js
```

Trách nhiệm:

- Nhận `toolName`, `input`, `context` từ SDK.
- Xác định gate type.
- Gọi đúng handler.
- Trả response đúng format cho SDK.
- Ghi audit event ngắn gọn.

Pseudo flow:

```txt
if toolName === 'AskUserQuestion'
  -> ClarifyingQuestionHandler
else if toolName in readOnlyTools and path safe
  -> allow immediately
else if toolName in dangerousTools
  -> ToolPermissionHandler
else
  -> ToolPermissionHandler hoặc deny theo policy
```

---

## 5. Tool permission policy

### 5.1. Auto-approve read-only tools có kiểm soát

Cho phép auto-approve:

```txt
Read
Glob
Grep
LS
```

Nhưng chỉ khi input path nằm trong repo workspace hiện tại.

Không auto-approve nếu path match:

```txt
.env
.env.*
*.pem
*.key
id_rsa
id_ed25519
credentials*
secrets*
node_modules/.cache
.git/config nếu chứa credential
```

### 5.2. Tool luôn cần gate

Các tool sau phải tạo `tool_permission` gate:

```txt
Write
Edit
MultiEdit
NotebookEdit
Bash
MCP tools có side effect
WebFetch/WebSearch nếu output có thể ảnh hưởng artifact quan trọng
```

### 5.3. Bash deny pattern

Deny ngay, không cần hỏi user, nếu command match:

```txt
rm -rf /
sudo *
curl * | sh
wget * | sh
chmod -R 777
mkfs*
dd if=*
:(){ :|:& };:
ssh *
scp *
export *TOKEN*
cat ~/.ssh/*
cat ~/.env
```

Nếu command không match deny pattern nhưng có side effect, tạo gate.

---

## 6. Gate type contract

Không dùng ý định mơ hồ để phân biệt approval. Phải phân biệt bằng `gate.type`.

### 6.1. Các gate type bắt buộc

```ts
type GateType =
  | 'stage_review'
  | 'tool_permission'
  | 'clarifying_question'
  | 'final_release';
```

### 6.2. `stage_review`

Dùng khi một agent đã hoàn thành artifact và cần user review stage.

Payload:

```json
{
  "type": "stage_review",
  "workflowId": "...",
  "taskId": "...",
  "stage": "po|ux|dev|qa",
  "title": "PO Agent needs your approval",
  "summary": "...",
  "artifactId": "...",
  "actions": ["approve", "request_changes", "reject"]
}
```

Quick-fill templates chỉ được dùng ở gate này, cho action `request_changes`.

### 6.3. `tool_permission`

Dùng khi Claude muốn dùng tool có side effect hoặc tool nhạy cảm.

Payload:

```json
{
  "type": "tool_permission",
  "workflowId": "...",
  "taskId": "...",
  "stage": "dev",
  "sdkSessionId": "...",
  "toolUseID": "...",
  "toolName": "Bash|Write|Edit|...",
  "toolInput": {},
  "riskLevel": "low|medium|high",
  "display": {
    "command": "npm test",
    "filePath": "src/app.js",
    "diffPreview": "optional"
  },
  "actions": ["approve", "deny"]
}
```

Không dùng quick-fill templates ở gate này.

### 6.4. `clarifying_question`

Dùng khi Claude gọi `AskUserQuestion`.

Payload phải giữ câu hỏi thật từ Claude, không tự bịa:

```json
{
  "type": "clarifying_question",
  "workflowId": "...",
  "taskId": "...",
  "stage": "po|ux|dev|qa",
  "sdkSessionId": "...",
  "toolUseID": "...",
  "questions": [
    {
      "id": "q1",
      "question": "Which login behavior do you want?",
      "options": ["Email/password", "Google OAuth", "Both"],
      "multiSelect": false,
      "allowFreeText": true
    }
  ],
  "actions": ["submit_answer", "cancel"]
}
```

Không dùng quick-fill templates ở gate này.

### 6.5. `final_release`

Dùng khi toàn bộ stage hoàn tất và cần release approval cuối.

Payload:

```json
{
  "type": "final_release",
  "workflowId": "...",
  "projectId": "...",
  "summary": "...",
  "releaseOutputs": [],
  "actions": ["approve_release", "reject_release"]
}
```

---

## 7. Prompt ownership và output contract

### 7.1. Không để prompt nằm rải rác trong code

Tạo thư mục prompt rõ ràng:

```txt
backend/src/agents/prompts/
  po.prompt.md
  ux.prompt.md
  dev.prompt.md
  qa.prompt.md
  repair-output.prompt.md
```

Mỗi prompt phải có owner rõ:

```txt
Prompt owner: backend/agent team
Schema owner: backend workflow team
Validator owner: backend workflow team
```

### 7.2. Mỗi stage phải có output schema riêng hoặc schema section riêng

Không chỉ nói “xuất JSON đúng schema”. Cần định nghĩa contract:

```txt
agent-io.v1
- stage
- summary
- artifacts[]
- decisions[]
- risks[]
- nextHandoff
- evidence
```

Nếu hiện tại đã có `_validateGateOutput`, tận dụng validator đó. Nếu chưa đủ, mở rộng validator trước khi bật real runner.

### 7.3. Retry policy khi Claude output sai schema

Không fail ngay ở lần đầu.

Đề xuất policy:

```txt
Max attempts: 2 normal attempts + 1 repair attempt
```

Flow:

```txt
Attempt 1:
  Claude chạy stage, trả output.
  Backend validate.

Nếu invalid:
  Attempt 2:
    Gửi lỗi validation cụ thể cho Claude.
    Yêu cầu xuất lại đúng schema, không làm thêm tool side effect nếu không cần.

Nếu vẫn invalid:
  Repair attempt:
    Dùng repair-output.prompt.md, chỉ chuyển raw output -> valid agent-io.v1.
    Không cho Bash/Edit/Write trong repair attempt.

Nếu vẫn invalid:
  Mark task failed với error code OUTPUT_SCHEMA_INVALID.
```

### 7.4. Failure behavior rõ ràng

Khi output invalid sau retry:

- Task status: `failed` hoặc `awaiting_manual_recovery`.
- UI hiển thị: “Agent output invalid. Manual recovery required.”
- Audit trail ghi raw validation errors.
- Không auto-advance workflow.

---

## 8. Session resume / timeout decision

### 8.1. Demo decision

Trong giai đoạn demo đầu tiên, không bắt buộc implement full session resume.

Nhưng phải implement behavior rõ:

```txt
Nếu process còn sống:
  pending gate resolve -> SDK callback tiếp tục.

Nếu process restart / callback mất:
  gate chuyển sang recoverable_failed.
  UI hiển thị nút Retry stage.
  Retry stage chạy lại Claude từ checkpoint/context gần nhất.
```

Không được để gate treo vô hạn.

### 8.2. Data cần persist ngay từ đầu

Dù chưa resume full, vẫn phải persist:

```txt
PendingGate:
- gateId
- type
- workflowId
- projectId
- taskId
- stage
- sdkSessionId
- toolUseID
- toolName
- toolInput
- questionPayload
- status: pending|approved|rejected|answered|expired|recoverable_failed
- createdAt
- resolvedAt
- resolvedBy
- timeoutAt
```

### 8.3. Timeout policy

Đề xuất:

```txt
tool_permission timeout: 5 phút
clarifying_question timeout: 30 phút hoặc manual only
stage_review timeout: manual only
final_release timeout: manual only
```

Khi timeout:

- `tool_permission`: deny với message timeout hoặc mark recoverable.
- `clarifying_question`: pause task, không auto deny.
- `stage_review`: giữ pending.
- `final_release`: giữ pending.

### 8.4. Production upgrade path

Sau demo, nâng cấp session resume thật:

- Lưu `sdkSessionId`.
- Dùng session store/durable transcript nếu SDK hỗ trợ.
- Khi worker restart, resume session hoặc retry từ checkpoint.
- Không phụ thuộc vào in-memory Promise cho long-running HITL.

---

## 9. UI thay đổi cần làm

### 9.1. 3-flow board

Màn hình chính chia thành 3 khối workflow độc lập:

```txt
Workflow 1: đang chờ approval ở PO Agent
Workflow 2: đang chờ approval ở Dev Agent
Workflow 3: đang chờ approval ở QA Agent
```

Mỗi block chỉ show:

- Workflow title.
- Repo/branch ngắn.
- Current agent/stage chip.
- Current pending gate card.
- Final release approval card ở dưới cùng.

Không show full audit trail trong màn hình này.

### 9.2. Render theo `gate.type`

Frontend không được đoán UI bằng text/title. Phải switch theo `gate.type`.

```txt
stage_review
-> artifact review card
-> approve / request changes / reject
-> quick-fill allowed for request changes

tool_permission
-> tool permission card
-> show toolName, command/file/diff/risk
-> approve / deny
-> no quick-fill

clarifying_question
-> question form
-> render questions/options/free text
-> submit answer / cancel
-> no quick-fill

final_release
-> release approval card
-> approve final release / reject release
```

### 9.3. Audit trail

Audit trail vẫn ghi ở backend nhưng ẩn khỏi main board.

Có thể để link nhỏ:

```txt
View audit details
```

Nhưng không render timeline lớn trong 3-flow board.

---

## 10. API changes đề xuất

### 10.1. List active workflows with pending gates

Tạo hoặc chuẩn hóa endpoint:

```txt
GET /sdlc/workflows/active-board
```

Response:

```json
{
  "status": "success",
  "data": {
    "workflows": [
      {
        "workflowId": "...",
        "projectId": "...",
        "title": "Workflow 1",
        "repo": "acme/retail-platform",
        "branch": "main",
        "currentStage": "po",
        "progress": { "done": 1, "total": 4 },
        "currentGate": {},
        "finalReleaseGate": {}
      }
    ]
  }
}
```

### 10.2. Resolve gate endpoint

Chuẩn hóa một endpoint:

```txt
POST /sdlc/gates/:gateId/resolve
```

Body theo gate type:

```json
{
  "decisionId": "client-generated-idempotency-key",
  "action": "approve|deny|request_changes|submit_answer|approve_release|reject_release",
  "comment": "optional",
  "answers": [],
  "updatedInput": {}
}
```

Bắt buộc có `decisionId` để idempotent.

---

## 11. Test plan

### 11.1. Unit tests

- Dispatcher route đúng handler theo `toolName`.
- Read-only path policy allow/deny đúng.
- Bash deny pattern hoạt động.
- `AskUserQuestion` tạo `clarifying_question` gate.
- `Write/Edit/Bash` tạo `tool_permission` gate.
- Invalid schema retry đúng số lần.

### 11.2. Integration tests

- Mock runner vẫn chạy khi `USE_MOCK_CLAUDE_CODE=true`.
- Real runner spike pass trên repo nhỏ.
- User approve tool permission -> Claude tiếp tục.
- User deny tool permission -> Claude nhận deny message.
- User answer clarifying question -> Claude tiếp tục với answer.
- Output invalid -> retry -> valid hoặc failed rõ ràng.

### 11.3. Runtime/manual tests

- Backend restart khi có pending `tool_permission`.
- Backend restart khi có pending `clarifying_question`.
- Mở 2 tab cùng approve một gate.
- Chạy 1 workflow full PO → UX → DEV → QA.
- Sau đó mới chạy 3 workflow board.

---

## 12. Không làm trong phase đầu

Không làm các việc sau ở phase đầu:

- Không bật 3 flow real Claude song song ngay.
- Không dùng `bypassPermissions`.
- Không auto-approve `Bash`, `Write`, `Edit`.
- Không để Claude tự spawn subagent thay cho AIFA stage orchestration.
- Không viết lại workflow engine.
- Không show audit trail lớn trong 3-flow board.
- Không để quick-fill templates can thiệp vào `AskUserQuestion`.

---

## 13. Definition of Done

Một bản implement được coi là đạt khi:

- `USE_MOCK_CLAUDE_CODE=true` vẫn chạy như trước.
- `USE_MOCK_CLAUDE_CODE=false` chạy được một stage thật trên repo nhỏ.
- `canUseTool` chỉ là dispatcher mỏng, không chứa business logic lớn.
- Có handler riêng cho `tool_permission`.
- Có handler riêng cho `clarifying_question`.
- Gate được persist với `gate.type` rõ ràng.
- UI render pending gate theo `gate.type`, không đoán bằng title/text.
- Output invalid có retry policy rõ ràng.
- Nếu process restart khi gate pending, UI không kẹt vô hạn; gate chuyển `recoverable_failed` hoặc có retry stage.
- 3-flow board hiển thị được 3 workflow độc lập, mỗi workflow có current approval card và final release card ở cuối.

---

## 14. Tóm tắt cho coding agent

Triển khai theo hướng adapter, không rewrite workflow.

Thứ tự đúng:

1. Làm SDK spike nhỏ trước.
2. Implement real runner sau feature flag.
3. Tách `canUseTool` thành dispatcher + handler riêng.
4. Chuẩn hóa `gate.type` và persist gate.
5. Thêm retry/failure behavior cho structured output.
6. Cập nhật UI render gate theo type.
7. Test một flow thật.
8. Sau đó mới bật 3-flow board.

Điểm quan trọng nhất: **đừng biến `canUseTool` thành một God callback**. Nó chỉ nên là adapter mỏng từ Claude SDK sang gate system của AIFA.
# CURRENT DECISION - LOCAL CLAUDE CODE CLI

This handover is superseded for the current Phase 2 runtime path.

Current implementation direction:

- AIFA backend calls `backend/src/agents/claudeCodeRunner.js`.
- `claudeCodeRunner.js` spawns the local Claude Code CLI (`claude.cmd` on Windows).
- Claude Code uses the local machine login, e.g. Claude Pro already authenticated in Claude Code.
- No `ANTHROPIC_API_KEY` is required for this local demo path.
- Do not use the Agent SDK runtime path for Phase 2.
- Keep the opened/uploaded repo flow: AIFA works against the uploaded repo workspace and release output is still written back into that repo folder.
- Claude output must be parsed as JSON artifact, validated by AIFA, saved, then passed through the existing review gates.

Validation note from 2026-06-08:

- `claude.cmd --version` works locally and reports Claude Code 2.1.97.
- Non-interactive Claude CLI initially failed with certificate/connection errors (`UNABLE_TO_VERIFY_LEAF_SIGNATURE`).
- A one-off local probe with `NODE_TLS_REJECT_UNAUTHORIZED=0` reached Claude Code auth/service and returned a real rate-limit message: `You've hit your limit - resets 1:30pm (Asia/Saigon)`.
- Therefore the backend CLI adapter is wired to the right local Claude Code path; the remaining blocker for a full real artifact test is local Claude Code connectivity/certificate and Claude Pro rate limit reset.
- Later phases may continue without a full real Claude artifact test, but the final demo-readiness checkpoint must run at least one real stage through local Claude Code, parse/save the JSON artifact, and open the existing AIFA review gate.
- Runtime failures are now expected to fail visibly, not fall back to mock silently. Use `CLAUDE_CODE_INSECURE_TLS=true` only as a local debugging escape hatch for certificate issues.

Checkpoint update from 2026-06-08 14:03 Asia/Saigon:

- Local Claude Code rate limit reset and a real non-interactive JSON probe succeeded.
- A real `po-agent` checkpoint succeeded through `claudeCodeRunner.runAgent()`.
- The runner returned and validated real artifact keys including `prd` and `acceptance_criteria`, with observability `runner: claude-code-cli`.
- This machine currently requires `CLAUDE_CODE_INSECURE_TLS=true` because of its local certificate chain. This is configured only for the local demo and must not be treated as a production default.
- UI review now supports opening the saved artifacts before approval and surfaces worker failure code/message on the board.
- `final.md` and `qa-report.md` now include the required real-agent contract artifacts, including `self_test_report`, `test_run_report`, and `ac_coverage_matrix`.

Interactive real-demo update:

- `/aifa` now seeds `mode=real_single` from Open Folder.
- `demoBoardService` creates one real flow only in this mode and does not start the background drainer, so Claude `AskUserQuestion` and tool/diff approvals remain pending for the user.
- Board read-model includes `pendingGates`; the UI renders a live Claude question/tool approval card before stage review.
- Gate resolution uses the existing `/approvals/:approvalId` API, so the blocked Claude SDK run resumes after the user answers or approves/rejects.
- `CLAUDE_CODE_LENIENT_CONTRACT=true` is enabled for demo: missing DEV/QA required keys become visible placeholders plus `observability.contract_warnings` instead of hard-failing the live flow.

The SDK/API-key notes below are historical context only unless explicitly re-approved.

---
