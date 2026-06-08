# AIFA v3 Gate and Validation Rules

> Version: 3.0
> Status: Active
> Source of truth: `backend/src/services/SdlcWorkflowService.js`,
> `backend/src/services/riskClassifier.js`, and the QA quality-gate service.

## 1. Gate model

AIFA dung nhieu lop gate thay vi mot quality score duy nhat:

```text
Tool risk gate
  -> Worker output validation
  -> Stage approval gate
  -> QA quality gate
  -> Final release gate
```

## 2. Tool risk gate

Moi tool action tu Claude Code path di qua `onGate`.

| Tier | Vi du | Xu ly |
| --- | --- | --- |
| `auto` | Tao file feature moi, sua tests/docs/mock | Cho phep ngay va ghi audit |
| `approval` | Sua auth/security/payment/config/migration/dependency, xoa file | Tam dung cho human approve/reject |
| `block` | Ghi ngoai repo, sua `.env`, doc secret, push main | Tu choi ngay va ghi audit |

Question gate cua PO/DEV tam dung workflow cho den khi human tra loi hoac
watchdog timeout.

## 3. Worker output validation

Moi output worker phai qua `gate-output.v2` va ba lop validation.

### Schema

- Required fields ton tai.
- Kieu du lieu va output shape hop le.
- Artifact co the duoc luu va resolve.

### Semantic

- Acceptance criteria phai testable.
- UX/DEV/QA output lien ket voi scope va acceptance criteria.
- DEV phai co sandbox/self-test evidence.
- QA phai co coverage va test evidence.

### Risk

- Auth, OAuth, payment, security va config can evidence/approval phu hop.
- Security gate va QA gate khong duoc con blocker.

BLOCKER o bat ky lop nao:

- Artifact bi danh dau `INVALID`.
- Khong tao A2A handoff.
- Khong start downstream.

## 4. Stage gate policy

| Stage | Mode | Hanh vi |
| --- | --- | --- |
| PO | Confidence | Auto-approve khi PASS, confidence >= 0.80 va khong co warning/risk issue |
| UX | Confidence | Auto-approve khi PASS, confidence >= 0.80 va khong co warning/risk issue |
| DEV | Confidence | Auto-approve output PASS sau khi tat ca tool/question gate da resolve |
| QA | Strict manual | Luon dung tai `QA_REVIEW` cho human |

Low-confidence hoac output co warning/risk issue phai duoc gui lai owning worker
voi feedback. Structured decision ho tro idempotency, optimistic locking,
field-level edit va retry/escalation.

## 5. Pipeline ordering

- Question gate tai PO/DEV khoa downstream.
- Downstream chi start khi source task `completed` va `committed`.
- QA chi start tu dung DEV source va khi DEV khong con pending gate.
- Khong tao trung QA cho cung mot DEV.
- Workflow status chi hien mot coherent task chain.
- Loi khoi dong downstream khong duoc doi upstream completed thanh failed.

## 6. QA quality gate

QA output duoc danh gia theo task complexity va evidence:

| Complexity | Gate style | Muc tieu |
| --- | --- | --- |
| SMALL | Fast | Du test co ban, coverage toi thieu, zero blocker |
| MEDIUM | Async | Nhieu test hon, security/static evidence, zero blocker |
| LARGE | Strict | Coverage va security evidence cao, manual scrutiny |

Recommendation:

```text
PASS   = dat nguong va khong co BLOCKER
HOLD   = can human/review bo sung
REWORK = co BLOCKER hoac khong dat nguong
```

Human chi co the approve QA khi recommendation la `PASS`.

## 7. A2A handoff gate

Moi handoff phai co:

- Upstream committed.
- Artifact khong INVALID.
- Artifact hash khop.
- Required downstream inputs dung theo route.

Contract:

```text
PO -> UX  : PRD + acceptance criteria + risk
PO -> DEV : PRD + acceptance criteria + risk
UX -> DEV : UX spec + wireframe + risk
DEV -> QA : patch/diff + sandbox/self-test + security gate
```

## 8. Final release gate

Release chi duoc approve khi:

- QA completed va committed.
- QA recommendation la `PASS`.
- Human da approve QA.
- Khong con critical/high-risk blocker.
- Reviewer co role owner/admin.

Khi approve, he thong tao branch/commit metadata, diff, `final.md`,
`qa-report.md` va release decision.

## 9. Gate audit events

Su kien chinh:

```text
GATE_QUESTION
GATE_ANSWER
GATE_REQUEST
GATE_DECISION
GATE_AUTO
GATE_BLOCK
AUTO_APPROVED_*_GATE
HANDOFF_EMITTED_*_TO_*
```

## 10. Known boundaries

- Pending gate metadata da persist, nhung live `onGate` continuation van
  in-memory; restart chuyen gate cu thanh `interrupted`.
- Claude Code runner that chua duoc ket noi.
- QA smoke coverage cho claude-code path chua phu day tat ca scenario cu.

Full DB-driven gate recovery la must-have cua
`docs/AIFA_DEMO_1_WEEK_ROADMAP.md`.
