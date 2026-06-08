# AIFA v3 - Tong ket tinh nang da trien khai

Tai lieu nay doi chieu ban hien tai voi `AIFA_IMPLEMENTATION_PLAN.md`, dong thoi
ghi lai cac cai tien phat sinh trong qua trinh hoan thien demo.

## 1. Tong quan ket qua

Ban moi da chuyen demo thanh mot workflow end-to-end co thu tu ro rang:

```text
Open folder / repo
  -> PO phan loai yeu cau va hoi lai human khi can
  -> UX tao Penpot mock neu yeu cau co UI
  -> DEV hoi lai human va xin duyet cac thay doi co rui ro
  -> QA chi chay sau khi DEV hoan tat
  -> Human review QA
  -> Owner/Admin approve release
  -> Tao release bundle va ghi final.md
```

Execution path chinh cua demo la `claude-code` mock. Mock khong tra output truc
tiep ma dien hanh vi thong qua cung interface `onGate` du kien dung cho Claude
Code that sau nay.

## 2. Cac hang muc da thuc hien theo chien luoc

### Phase 0 - Cau hinh va ban do codebase

- Da co `docs/AIFA_NOTES.md`, mo ta diem re execution path, validation, A2A
  handoff va SSE.
- Da them cac bien moi truong:
  - `EXECUTION_PATH`
  - `USE_MOCK_CLAUDE_CODE`
  - `MAX_PARALLEL_WORKFLOWS`
- Van giu execution path `langchain` de tuong thich voi he thong cu.

### Phase 1 - Repo input, branch, diff va safety

- Da them `repoService.js` de:
  - Clone repo HTTP(S).
  - Mo repo local phia server.
  - Tao branch `aifa/<slug>`.
  - Commit va lay diff.
  - Chan path traversal va danh dau file secret.
  - Cleanup workspace.
- Endpoint khoi dong workflow nhan `repo_url`, `repo_path`, `branch`, `request`.
- Da gioi han so workflow dang hoat dong bang `MAX_PARALLEL_WORKFLOWS`.
- Da ho tro upload ca folder tu browser, bo qua `.git`, `node_modules`, build
  output va file qua lon.

### Phase 2 - Risk gate va Human-in-the-Loop

- Da them `riskClassifier.js` voi ba muc:
  - `auto`: thay doi an toan.
  - `approval`: auth, security, payment, config, migration, dependency...
  - `block`: ghi ngoai repo, sua secret, push thang main...
- Da them `gateBridge.js`:
  - Tao gate dang cho.
  - Promise tam dung cho human.
  - Resolve mot lan duy nhat.
  - Watchdog timeout tu reject.
- Da trien khai `_makeOnGate()` theo interface gan voi `canUseTool`.
- Da co hai loai gate:
  - Tool approval: approve/reject thay doi file.
  - Question gate: agent hoi lai human.
- Tat ca nhanh gate deu duoc ghi audit.
- Da co endpoint resolve approval va kiem tra reject reason.

### Phase 3 - Claude Code mock runner

- Da them script va runner mock cho Claude Code.
- Runner mock thuc su goi `onGate` truoc khi ghi file.
- DEV mock tao thay doi that trong repo, vi du:
  - `src/auth/google.js`
  - `tests/auth/google-login.test.js`
- UX mock tao file Penpot SVG.
- Da co `claudeCodeRunner.js` lam khung cho integration that.
- Moi output van di qua output contract va validation chung.

### Phase 4 - PO routing va clarification

- PO phan loai route thanh `ui`, `backend`, `analysis`, hoac `fullstack`.
- Request khong co UI co the di thang `PO -> DEV`.
- Request co UI di theo `PO -> UX -> DEV`.
- PO co the hoi human mot lan voi toi da ba cau hoi.
- Cau tra loi hoac default assumption duoc dua vao PRD va audit.

### Phase 5 - Validation va A2A contract

- Da mo rong validation thanh ba lop:
  - Schema.
  - Semantic.
  - Risk.
- BLOCKER o bat ky lop nao se danh dau artifact `INVALID` va khong handoff.
- A2A handoff co hash integrity, trang thai committed va contract input theo
  route thuc te.
- Da giu duoc hai route:
  - `PO -> UX -> DEV -> QA`
  - `PO -> DEV -> QA`

### Phase 6 - Final approval va release bundle

- QA la strict-manual gate: QA hoan tat thi dung tai `QA_REVIEW`.
- Chi owner/admin duoc approve final release.
- Release bi khoa neu con evidence blocker muc cao.
- Khi RELEASED, backend tao release bundle:
  - Working branch.
  - Commit/diff.
  - `final.md`.
  - `qa-report.md`.
  - Release decision.
- `final.md` tong hop feature, PRD, UX, DEV plan, diff, QA, evidence va audit.
- UI co the download `final.md` va QA report.

### Phase 7 - Frontend demo mot man hinh

- Da co mot man hinh AIFA gom:
  - Open folder.
  - Request va Run.
  - Flow PO/UX/DEV/QA.
  - Gate pending.
  - Stage review.
  - Final release approval.
  - Release bundle.
  - Audit log realtime.
- Da xu ly SSE cho `progress`, `completed`, `error`, `gate_pending` va reconnect.
- UI hien Penpot mock truc tiep thay vi chi hien artifact text.

### Phase 8 - Kiem thu

- Da co test cho risk classifier, gate idempotency, watchdog, repo safety,
  routing, validation ba lop va task-chain selection.
- Da co smoke test rieng cho execution path `claude-code`.
- Da verify cac nhanh quan trong:
  - Happy path den RELEASED va tao `final.md`.
  - DEV thieu evidence thi INVALID va khong chay QA.
- Frontend production build da pass.

## 3. Cac cai tien them ngoai chien luoc ban dau

### Upload folder tu browser

Ke hoach ban dau tap trung vao `repo_url` va repo clone. Ban moi bo sung luong
chon bat ky folder tu may nguoi dung, upload cac file hop le len server va
git-init thanh repo rieng cho workflow.

### Ghi nguoc final.md vao folder local

Ban moi su dung File System Access API tren Chrome/Edge:

- Nut Open folder xin quyen `readwrite`.
- Sau release, frontend tai report tu backend.
- Tim file `final.md` da ton tai trong folder goc, sau do moi tim folder con.
- Ghi noi dung report truc tiep vao file local.
- Co nut `Write local final.md` de ghi lai thu cong.

Day la cai tien gan voi trai nghiem Claude Code hon, vi output xuat hien ngay
trong folder dang lam viec cua nguoi dung.

### UX Penpot mock truc quan

Ngoai viec tao artifact SVG, UI hien thi truc tiep mock Google Login de nguoi
dung thay ket qua UX agent ngay trong flow.

### DEV cung co the hoi lai human

Khong chi PO, DEV mock cung co question gate de hoi quyet dinh ky thuat, vi du
chien luoc luu session. Pipeline dung cho den khi human tra loi.

### Pipeline lock co thu tu chat che

- Question gate tai PO hoac DEV khoa cac agent phia sau.
- QA chi duoc tao sau khi DEV `completed`, `committed` va khong con gate.
- UI hien QA la `locked` khi DEV chua xong.
- Workflow status chi hien QA thuoc dung DEV run hien tai, khong tron QA cu voi
  DEV moi.

### Bao ve trang thai upstream

Loi khoi dong downstream khong con ghi de mot task upstream da hoan tat thanh
FAILED. Vi du, loi khoi dong QA se khong bien DEV da approved thanh
`FAILED_DEV`.

### Chong trung va tach release theo tung QA run

- Khong tao trung QA cho cung mot DEV source.
- Release decision duoc kiem tra theo QA task hien tai, tranh release cu khoa
  workflow moi trong cung project.

### Upload va FormData on dinh hon

- De browser tu gan multipart boundary.
- Snapshot `FileList` truoc khi reset input.
- Gioi han file count va file size.
- Tang timeout upload folder.
- Tra loi upload ro rang hon khi folder khong co file hop le.

## 4. Khac biet so voi ban cu

| Khu vuc | Ban cu | Ban moi |
| --- | --- | --- |
| Execution | LangChain/mock output truc tiep | Claude-code mock dien hanh vi qua `onGate` |
| Repo input | Repo URL hoac workflow khong repo | Repo URL, repo server, upload folder browser |
| Gate | Review output theo phase | Risk-based tool gate + question gate + stage review |
| PO | Tao PRD | Phan route, hoi human, ghi assumption |
| UX | Artifact UX | Artifact + Penpot SVG + preview tren UI |
| DEV | Tao output DEV | Hoi human, xin duyet file rui ro, ghi file that |
| QA | Co the bi hien/chay lon xon | Chi chay sau DEV dung chain, dung tai human review |
| Pipeline | Stage co the hien task cu | Coherent task chain va downstream lock |
| Release | Final decision | Branch, commit/diff, final.md, QA report, decision |
| Local output | Chi nam tren server | Co the ghi vao `final.md` trong folder local da cap quyen |

## 5. Hardening backend da hoan tat

- Xoa pipeline mock client-side; API client chi goi endpoint backend that.
- Persist pending gate metadata; gate mo khi restart duoc hien thanh
  `interrupted` thay vi bien mat im lang.
- Push `gate_pending` va `gate_resolved` qua SSE; polling la reconciliation.
- Thay `window.prompt` bang inline review form co validation.
- Persist project ID demo ro rang, khong doan theo ten/project dau tien.
- Them gate integration test, persistence check va Claude Code smoke test.

Day la hardening cho demo, khong dong nghia full workflow recovery.

## 6. Gioi han hien tai

| Van de | Anh huong | Huong xu ly |
| --- | --- | --- |
| `claudeCodeRunner.js` that van la stub | Chua co controlled real execution | Roadmap real-data 3 tuan |
| Gate metadata persist nhung continuation van in-memory | Restart chuyen gate thanh `interrupted`, khong resume tai diem gate | Roadmap demo 1 tuan |
| SSE chua co event ID/replay va van reconcile bang polling | Reconnect co the thieu event ngan han | Persisted `AgentEvent` va cursor replay |
| Approval idempotency chua day du cho multi-tab/multi-reviewer | Co the race khi resolve | Persist decision ID va optimistic transition |
| Evidence diff/test con mot phan mock/structured | Release evidence chua phai real-data day du | Artifact/git/test collector |
| File System Access API phu thuoc Chromium va quyen `readwrite` | Trinh duyet khac chi download duoc report | Desktop/CLI agent hoac download fallback |
| Smoke test chua phu tat ca scenario | Con residual regression risk | Them blocker/reject/recovery/timeout test |
| Repository-wide lint/typecheck cu con loi | Khong the xem full-repo check la green | Xu ly tach theo module/roadmap |

Nguyen tac: khong tuyen bo full resume khi moi chi persist gate metadata; khong
bo validation/A2A integrity de doi lay demo nhanh.

## 7. Ket luan

Ban moi khong chi thuc hien cac phase cot loi cua chien luoc v3, ma con bien
workflow thanh mot demo co the quan sat va dieu khien duoc tu dau den cuoi.
Nhung cai tien quan trong nhat la risk-based `onGate`, Penpot mock truc quan,
question gate cho PO/DEV, thu tu DEV -> QA chat che, release bundle day du va
kha nang ghi `final.md` tro lai folder local da cap quyen.

## 8. Lo trinh tiep theo

- [AIFA_DEMO_1_WEEK_ROADMAP.md](AIFA_DEMO_1_WEEK_ROADMAP.md): thay execution
  control trung gian bang persisted task/event/gate co full recovery.
- [AIFA_REAL_DATA_3_WEEK_ROADMAP.md](AIFA_REAL_DATA_3_WEEK_ROADMAP.md): sau khi
  nen tang recovery hoan tat, tich hop real Claude Code runner va real
  filesystem/git/test evidence.

Thu tu nay la bat buoc de tranh dua real runner vao mot workflow chua co kha
nang phuc hoi va truy vet day du.

### Trang thai trien khai roadmap 1 tuan

- Da mo rong `Task` voi persisted execution lifecycle:
  `queued`, `running`, `awaiting_gate`, terminal status va timing fields.
- Da them persisted normalized `AgentEvent` co sequence theo task.
- Da them transition service chan state transition khong hop le.
- Gate ghi `awaiting_gate` va `gate_resolved` vao DB truoc khi phat live event
  va danh thuc runner.
- Da co API doc event theo task voi `after_sequence` de lam nen cho replay.
- Chua co worker claim/heartbeat, stale recovery va full gate resume.
- Demo runtime da duoc thu gon ve mot `happy_path` duy nhat; scenario switcher
  va smoke branch phu da bo khoi be mat demo de rehearsal on dinh hon.
