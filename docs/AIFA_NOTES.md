# AIFA Notes - Ban do codebase hien tai

Tai lieu nay la ban do nhanh cho developer khi sua AIFA v3.

## File trung tam

| File | Trach nhiem |
| --- | --- |
| `backend/src/services/SdlcWorkflowService.js` | Orchestrator, validation, handoff, gate policy, release |
| `backend/src/services/repoService.js` | Clone/open/upload repo, git, safety |
| `backend/src/services/riskClassifier.js` | Phan loai tool action |
| `backend/src/services/gateBridge.js` | Pending gate, resolve, watchdog |
| `backend/src/services/workflowReport.js` | Tao release bundle va final.md |
| `backend/src/agents/mockClaudeCodeRunner.js` | Dien hanh vi mock qua onGate |
| `backend/src/agents/mockClaudeCodeScripts.js` | Script theo scenario/role |
| `backend/src/agents/claudeCodeRunner.js` | Stub runner Claude Code that |
| `backend/src/controllers/SdlcController.js` | HTTP va SSE |
| `backend/src/routes/sdlc.js` | Route API |
| `frontend/src/pages/AifaDemo/index.tsx` | UI demo mot man hinh |

## Diem re execution path

`SdlcWorkflowService._runAgent(task, context, userId)`:

- `EXECUTION_PATH=claude-code`: goi `_runClaudeCodePath`.
- Claude Code mock: goi `mockClaudeCodeRunner.runAgent`.
- Claude Code that: khung `claudeCodeRunner`, chua trien khai.
- Path khac: giu mock/LangChain compatibility cu.

Moi path deu dua output vao `_saveAgentData`, sau do validate va quyet dinh
handoff.

## Validation

- `_validateGateOutput(task, output)`: kiem tra `OUTPUT_CONTRACTS`.
- `_threeLayerSummary(task, output)`: gom schema, semantic va risk.
- `_evaluateGatePolicy(task)`: confidence + validation + gate mode.
- `_saveAgentData`: luu artifact va danh dau `VALID`/`INVALID`.
- BLOCKER: khong tao handoff, khong chay downstream.

Output contract hien tai: `gate-output.v2`.

## Gate and HITL

- `_makeOnGate(taskId, role)`: interface gan voi Claude Code `canUseTool`.
- `riskClassifier.classifyAction`: `auto | approval | block`.
- `gateBridge.requestGate`: tam dung va tao approval ID.
- `resolveApproval`: danh thuc gate mot lan duy nhat.
- `_getPendingQuestionGate`: khoa pipeline khi PO/DEV dang hoi human.
- `submitGateDecision`: review output theo phase.
- `submitReleaseDecision`: owner/admin release gate.

Pending gate metadata da persist. Promise continuation cua live `onGate` van
in-memory; backend restart danh dau gate cu `interrupted`, chua full-resume.

Huong nang cap task/gate/event xem
`docs/AIFA_DEMO_1_WEEK_ROADMAP.md`; real runner va evidence xem
`docs/AIFA_REAL_DATA_3_WEEK_ROADMAP.md`.

## Handoff and ordering

- `_nextAgentFor`: chon agent tiep theo dua tren PO route.
- `_recordApprovedHandoff`: tao artifact `a2a_handoff.v1`.
- `_requireApprovedTask`: kiem tra committed, VALID va hash integrity.
- `_startNextAgentIfAvailable`: chi start downstream sau khi source completed,
  committed va khong con gate.
- `_selectCurrentTaskChain`: chi hien task cung mot chain; QA cu khong duoc ghep
  voi DEV moi.

Route ho tro:

```text
PO -> UX -> DEV -> QA
PO -> DEV -> QA
```

## SSE and frontend polling

SSE endpoint phat:

- `progress`
- `completed`
- `error`
- `gate_pending`
- heartbeat

Frontend dong thoi poll workflow status, gate, audit va artifact. SSE duoc dung
cho live progress va reconnect.

## Repo upload and local final.md

- Browser upload gui file va relative path den `/upload-repo`.
- Backend tao repo copy tai `workspace/projects/<projectId>/repo`.
- Release bundle duoc ghi vao repo copy.
- Tren Chrome/Edge, frontend giu `DirectoryHandle` co quyen `readwrite`, tai
  report tu backend va ghi vao file `final.md` da ton tai trong folder local.

## Test quan trong

```powershell
cd backend
npm.cmd test -- --runInBand tests/integration/aifa-gate.test.js
npm.cmd run demo:smoke:cc

cd ../frontend
npm.cmd run build
```

## Luu y khi sua

- Khong bo qua validation cho bat ky execution path nao.
- Khong start QA truoc khi dung DEV source da committed.
- Loi downstream khong duoc ghi de upstream completed thanh failed.
- Khong tu dong chay script trong uploaded repo.
- Khong mo rong quyen browser ngoai folder user da chon.
