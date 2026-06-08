# AIFA Demo - Lo trinh 1 tuan theo operational patterns

Tai lieu nay la ke hoach thuc thi da chuan hoa tu cac operational patterns cua
Multica. Muc tieu la de demo AIFA co the phuc hoi va quan sat duoc, khong sao
chep toan bo Multica.

## 1. Muc tieu cuoi tuan

Demo van giu core domain cua AIFA:

```text
Stage -> Artifact -> Gate -> HITL -> QA -> Release
```

Nhung execution control phai dat cac dieu kien:

- Task va trang thai execution duoc persist trong DB.
- Gate la trang thai `awaiting_gate`, khong phu thuoc Promise trong RAM.
- Backend restart van doc duoc task/gate va tiep tuc theo quy tac recovery.
- Mock runner va runner that sau nay cung phat mot chuan `AgentEvent`.
- Artifact, audit va release evidence co the truy vet theo workflow/task.

Uu tien demo hien tai: lam muot mot `happy_path` duy nhat tu Open folder den
RELEASED va `final.md`. Cac synthetic bad-case scenario khong nam trong be mat
demo; failure-handling logic van duoc giu de nang cap sau.

## 2. Baseline hien tai

| Nang luc | Trang thai hien tai | Khoang trong can xu ly |
| --- | --- | --- |
| Task persist | Da co task/stage backend | Chua co day du lifecycle va worker claim/heartbeat |
| Pending gate persist | Da persist metadata | Continuation van in-memory; restart chi chuyen `interrupted` |
| State machine | Co workflow phase va task status | Chua chuan hoa `queued -> dispatched -> running -> awaiting_gate -> terminal` |
| Agent event | Co SSE, audit va progress event | Chua co persisted normalized `AgentEvent` lam nguon su that |
| Artifact | Da persist va co VALID/INVALID | Can gan chat voi task/event va lifecycle |
| Release evidence | Da co `final.md`, QA report, diff metadata | Can dam bao tao tu persisted execution evidence |
| Runner | Mock Claude Code qua `onGate` | Chua co adapter event-stream on dinh cho runner that |

Gate `interrupted` hien tai la buoc trung gian trung thuc, nhung chua dat
Definition of Done cua roadmap nay.

## 3. State machine dich

```text
queued
  -> dispatched
  -> running
  -> awaiting_gate
  -> running
  -> completed | failed | cancelled | timeout
```

Moi transition phai:

1. Kiem tra transition hop le.
2. Ghi DB truoc khi phat event ra SSE.
3. Co audit actor, reason va timestamp.
4. Idempotent khi worker/API gui lai cung mot command.

## 4. Data model can bo sung

### AgentTask

Toi thieu gom:

- `id`, `workflow_id`, `project_id`, `stage`, `status`
- `input_json`, `result_json`, `error_json`
- `attempt`, `max_attempts`
- `locked_by`, `locked_at`, `heartbeat_at`
- `started_at`, `finished_at`, `created_at`, `updated_at`

### AgentEvent

Toi thieu gom:

- `id`, `workflow_id`, `task_id`, `sequence`
- `type`, `actor`, `payload_json`
- `created_at`

Event type ban dau:

```text
task_queued
task_started
progress
gate_pending
gate_resolved
artifact_created
task_completed
task_failed
task_cancelled
task_timeout
```

### AgentArtifact

Artifact can tham chieu `workflow_id`, `task_id`, `stage`, `type`, `path`,
`status`, checksum va metadata evidence.

## 5. Ke hoach 7 ngay

| Ngay | Trong tam | Dau ra |
| --- | --- | --- |
| 1 | Chuan hoa schema va state machine | Dang thuc hien: da co lifecycle fields, transition service, persisted `AgentEvent` va test |
| 2 | Internal worker va task claiming | Claim atomically, heartbeat, stale-task detection |
| 3 | Gate DB-driven | `awaiting_gate`, persisted decision, resume khong can closure cu |
| 4 | Normalized AgentEvent | Event store, SSE doc tu event, mock runner phat event chuan |
| 5 | Artifact va audit linkage | Artifact/evidence gan task va event day du |
| 6 | Recovery, retry, timeout | Restart recovery, idempotency, retry policy |
| 7 | Regression va demo rehearsal | Restart-mid-gate scenario, release evidence, runbook |

## 6. Hang muc uu tien

### Must-have

- DMO-001: Persisted `AgentTask` - dang thuc hien tren bang `Task` hien co;
  lifecycle fields va transition validation da co, worker claim/heartbeat chua co.
- DMO-002: Persisted `awaiting_gate` va resume sau decision.
- DMO-003: Recovery sau backend restart.
- DMO-004: Normalized persisted `AgentEvent` - da co schema/model, ordered
  sequence, task/gate lifecycle events va task event API; SSE replay chua co.
- DMO-005: Artifact lifecycle va status.
- DMO-006: Audit transition/gate day du.
- DMO-007: Release evidence truy vet ve task/artifact/event.

### Should-have

- Retry co gioi han.
- Timeout va cancel.
- Event API co cursor/replay.
- Timeline UI dua tren event store.

## 7. Definition of Done

- Khong con live gate phu thuoc duy nhat vao Promise/closure trong RAM.
- Restart backend khi task `awaiting_gate` khong lam mat gate va khong bat user
  chay lai toan bo workflow.
- Mock runner phat cung `AgentEvent` contract du kien cho runner that.
- SSE co the reconnect va doc tiep event da persist.
- Release bundle chi duoc tao tu coherent task chain va evidence da persist.
- Co automated test cho restart-mid-gate, duplicate decision, stale worker,
  timeout va happy path.

## 8. Khong lam trong tuan nay

- Multi-provider orchestration.
- Agent marketplace/daemon phuc tap.
- UI redesign lon.
- Tu dong push/publish ra remote.
- Claude Code execution that; phan nay thuoc roadmap 3 tuan.
