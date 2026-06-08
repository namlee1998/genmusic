# AIFA v3 System Architecture

## 1. Muc tieu

AIFA la software factory co bon worker PO, UX, DEV va QA. Backend giu state
workflow, kiem soat handoff va tam dung tai cac diem can human. Demo hien tai
mock toan bo Claude Code, Penpot va QA execution nhung van di qua interface va
gate giong duong tich hop that.

## 2. Core flow

```text
Folder upload / Repo URL
        |
        v
PO Agent -- route has_ui=false --------------------+
  | route has_ui=true                              |
  v                                                |
UX Agent + Penpot SVG                              |
  |                                                |
  +-------------------------> DEV Agent <-----------+
                                |
                                v
                         QA Agent + Quality Gate
                                |
                                v
                         Human QA Review
                                |
                                v
                       Owner/Admin Release Gate
                                |
                                v
              branch + commit/diff + final.md + QA report
```

Question gate tai PO hoac DEV khoa downstream. QA chi duoc tao khi DEV cua
dung workflow chain da `completed`, `committed` va khong con gate.

## 3. Components

### Frontend

`frontend/src/pages/AifaDemo/index.tsx` cung cap mot man hinh:

- Open folder va upload repo.
- Theo doi flow PO/UX/DEV/QA.
- Hien Penpot mock.
- Resolve question gate va tool approval gate.
- Review output theo stage.
- Approve release, download release bundle.
- Ghi report vao `final.md` local bang File System Access API.
- Poll workflow/audit va theo doi SSE.

### Backend API

Backend Node.js/Express chiu trach nhiem:

- Repo upload/clone va workflow start.
- Task state va A2A handoff.
- Gate pending/resolve.
- Validation va QA quality gate.
- Audit, release decision va release files.

Endpoint chinh:

```text
POST /api/v1/sdlc/upload-repo
POST /api/v1/sdlc/run-po-agent
GET  /api/v1/sdlc/workflow-status
GET  /api/v1/sdlc/approvals
POST /api/v1/sdlc/approvals/:approval_id
POST /api/v1/sdlc/tasks/:task_id/gate-decision
POST /api/v1/sdlc/projects/:project_id/release-decision
GET  /api/v1/sdlc/projects/:project_id/release-files/:file_name
```

### Orchestrator

`SdlcWorkflowService.js` la state machine trung tam:

- Chon execution path.
- Chay worker.
- Validate output.
- Auto-approve output an toan.
- Tao A2A handoff.
- Khoi dong agent tiep theo.
- Chon mot coherent task chain cho workflow status.
- Tao final review va release bundle.

### Claude Code path

```text
mockClaudeCodeScripts
  -> mockClaudeCodeRunner
  -> onGate(tool/question)
  -> riskClassifier + gateBridge
  -> write file neu allow
  -> output
  -> validation + handoff
```

`claudeCodeRunner.js` that hien la stub. Khi tich hop that, runner phai gan
`canUseTool=onGate` va giu nguyen contract output.

### Repo and release

`repoService.js` quan ly:

- Clone/open/uploaded repo.
- Branch `aifa/<slug>`.
- Commit va diff.
- Secret/path safety.
- Workspace cleanup.

`workflowReport.js` tao:

- `final.md`
- `qa-report.md`
- branch/commit metadata
- release decision

Backend ghi report vao repo copy tren server. Frontend co the ghi noi dung
`final.md` ve file local da ton tai neu user cap quyen folder.

## 4. Validation and gates

Moi output di qua:

```text
agent-io output
  -> schema validation
  -> semantic validation
  -> risk validation
  -> artifact VALID / INVALID
  -> gate policy
  -> approved handoff
```

Gate modes:

- PO, UX, DEV: confidence gate, auto-approve khi PASS va an toan.
- QA: strict-manual, luon can human review.
- Final release: owner/admin only.

Tool actions duoc phan loai:

- `auto`: cho phep va audit.
- `approval`: tam dung cho human.
- `block`: tu choi ngay.

## 5. State and observability

- Task/artifact/HITL decision duoc luu qua model backend.
- Pending gate metadata duoc persist, nhung live continuation cua `onGate` van
  phu thuoc Promise trong process.
- Restart backend danh dau gate dang cho thanh `interrupted`; chua full-resume.
- SSE phat `progress`, `completed`, `error`, `gate_pending` va heartbeat.
- UI poll workflow status, pending gate, artifact va audit.

## 6. Environment

```env
EXECUTION_PATH=claude-code
USE_MOCK_CLAUDE_CODE=true
USE_MOCK_AGENTS=true
MAX_PARALLEL_WORKFLOWS=3
```

## 7. Boundaries

- Khong tu dong chay script trong uploaded repo.
- Khong doc secret-like files.
- Browser folder upload tao ban sao tren server.
- Ghi nguoc file local chi hoat dong khi co File System Access API va quyen
  `readwrite`.

## 8. Kien truc dich tiep theo

Kien truc hien tai la baseline demo, khong phai kien truc execution cuoi cung.

1. [AIFA_DEMO_1_WEEK_ROADMAP.md](AIFA_DEMO_1_WEEK_ROADMAP.md) se chuan hoa
   persisted `AgentTask`, `AgentEvent`, state machine, worker heartbeat va
   DB-driven gate recovery.
2. [AIFA_REAL_DATA_3_WEEK_ROADMAP.md](AIFA_REAL_DATA_3_WEEK_ROADMAP.md) se them
   `AgentRunner` adapter, real Claude Code child process, filesystem/git/test
   evidence va hardening.

Kien truc dich tach ro:

```text
Backend Control Plane -> persisted task/gate/event
Internal Worker       -> claim, heartbeat, recovery
AgentRunner adapter   -> mock hoac real execution, normalized AgentEvent
```
