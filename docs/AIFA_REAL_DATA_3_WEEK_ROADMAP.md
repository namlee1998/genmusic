# AIFA Real Data - Lo trinh 3 tuan

Tai lieu nay la ke hoach nang AIFA tu mock demo sang controlled real
execution.

## 1. Dieu kien bat dau

Chi bat dau roadmap nay sau khi cac must-have trong
[AIFA_DEMO_1_WEEK_ROADMAP.md](AIFA_DEMO_1_WEEK_ROADMAP.md) da dat. Dac biet,
task, gate va event phai persist; restart phai recovery duoc.

## 2. Muc tieu

Sau ba tuan, AIFA phai co:

- Real repo workspace tach theo workflow/task va branch rieng.
- Claude Code runner that qua `child_process.spawn` va stream JSON.
- Artifact, git diff, test result va gate evidence lay tu workspace that.
- Timeout, cancel, retry, recovery va security guardrails.
- Release evidence package du de human dua ra quyet dinh.

## 3. Kien truc dich

```text
Frontend
  -> Backend Control Plane
       -> WorkflowService
       -> TaskQueueService
       -> GateService
       -> ArtifactService
       -> AuditTrailService
       -> RepoService
       -> ReleaseService
  -> Internal Worker
       -> AgentRunner adapter
            -> MockClaudeCodeRunner
            -> RealClaudeCodeRunner
```

Runner contract dich:

```text
run(taskContext) -> AsyncIterable<AgentEvent>
cancel(taskId)
```

Backend control plane la noi quyet dinh policy, state transition va gate.
Runner chi execution va phat normalized event.

## 4. Tuan 1 - Real runner va workspace

### Muc tieu

Co the chay mot stage tren repo workspace that va quan sat output stream.

### Hang muc

- Tao workspace rieng cho workflow/task, persist path va working branch.
- Chuan hoa `AgentRunner` interface va task context.
- Trien khai `RealClaudeCodeRunner` bang `child_process.spawn`.
- Gan `cwd` vao repo workspace; khong cho runner tu chon duong dan.
- Parse stream JSON theo tung dong; thu stderr, exit code va timing.
- Ho tro timeout va cancel process.
- Backend so huu CLI args; chi cho phep option trong allowlist.
- Chuan hoa stage prompt va output contract:
  - PO: `prd.md`
  - UX: `ux_spec.md`
  - DEV: `dev_report.md`
  - QA: `qa_report.md`

### Definition of Done

- Mot real runner task phat normalized `AgentEvent`.
- Timeout/cancel dung duoc va task ket thuc dung status.
- Runner khong nhan command/CLI args tuy y tu request nguoi dung.

## 5. Tuan 2 - Real evidence va gate

### Muc tieu

Gate va QA dua ra quyet dinh dua tren du lieu thu tu repo.

### Hang muc

- `ArtifactCollector` doc output file tu workspace va tao checksum/metadata.
- Thu `git status`, diff, diff stat va changed-file list.
- Test runner phat hien command theo cau hinh/allowlist.
- Luu stdout, stderr, exit code, duration va test summary.
- Gate payload gom artifact, diff, test, risk va checklist.
- Rework loop that: request changes tao task moi co lineage ve task cu.
- Redact secret truoc khi luu log/event/evidence.

### Definition of Done

- DEV/QA evidence khong con la gia lap text.
- Human review nhin thay diff, test result va risk summary that.
- Rework tao coherent task chain moi, khong ghi de lich su.

## 6. Tuan 3 - Hardening va release

### Muc tieu

Workflow real-data co the demo an toan, phuc hoi va truy vet.

### Hang muc

- Recovery/idempotency cho stale task, duplicate event va duplicate decision.
- Retry policy theo loai loi.
- Timeout/cancel tu API den child process.
- Release evidence package gom:
  - `final.md`
  - `prd.md`
  - `ux_spec.md`
  - `dev_report.md`
  - `qa_report.md`
  - git diff/stat
  - test evidence
  - gate decisions va audit timeline
- Command allowlist, path safety, secret redaction va resource limit.
- Khong auto-push, merge hoac publish.
- Rehearse real-data scenario tu repo input den release approval.

### Definition of Done

- Restart giua workflow khong lam mat task/gate/event.
- Real artifacts, diff va test evidence xuat hien trong release bundle.
- Cancel/timeout/retry co test.
- Security guardrails chan path/command/secret nguy hiem.

## 7. Tai san hien tai co the tai su dung

- Repo upload/clone, branch, diff va path safety.
- Risk classifier va `onGate` contract.
- PO routing, UX/DEV/QA workflow va coherent chain selection.
- Artifact validation, A2A integrity va release approval.
- AIFA single-screen UI, SSE/poll reconciliation va release download.
- Mock Claude Code scripts de lam contract test cho real runner.

## 8. Khoang trong hien tai

| Khu vuc | Hien tai | Dich 3 tuan |
| --- | --- | --- |
| Claude runner | Stub + mock scripts | Real child process + stream JSON |
| Gate recovery | Persist metadata, restart thanh interrupted | Full DB-driven resume |
| Events | SSE/audit phan tan | Persisted normalized event store |
| Evidence | Mot phan mock/structured | Thu tu filesystem, git va test process |
| Recovery | Partial | Retry, timeout, cancel, stale-task recovery |
| Security | Path/risk guard co ban | Command policy, redaction, resource limits |

## 9. Khong lam

- Multi-provider abstraction lon.
- Distributed worker fleet.
- Agent marketplace.
- Auto-push/auto-merge/auto-deploy.
- UI redesign khong phuc vu real evidence va recovery.
