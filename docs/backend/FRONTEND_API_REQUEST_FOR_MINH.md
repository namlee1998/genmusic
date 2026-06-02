# 🔔 YÊU CẦU TỪ FRONTEND (Giang) → BACKEND (Minh)

> **Ngày tạo**: 2026-06-01
> **Trạng thái**: ⏳ Chờ Minh confirm
> **Liên quan**: Audit Trail UI nâng cấp (Task 3.1, 3.2, 3.3 trong kế hoạch frontend)

---

## 1. Audit Trail API — Cần bổ sung trường

**Endpoint hiện tại**: `GET /api/v1/sdlc/audit-trail/:project_id`

Frontend đang cần các trường sau trong response để xây Audit Trail UI nâng cấp.
Minh check giúp xem **endpoint hiện tại đã trả về những trường nào**, trường nào **cần bổ sung**:

### Schema mong muốn cho mỗi audit event:

```json
{
  "id": "LOG-001",
  "workflow_run_id": "WR-001",
  "actor": "PO_AGENT",           // ✅ Đã có
  "action": "GENERATE_PRD",      // ✅ Đã có
  "timestamp": "2026-05-26T10:01:00Z",  // ✅ Đã có
  "type": "agent_run",           // ✅ Đã có

  // ── CÁC TRƯỜNG CẦN CONFIRM ──
  "artifact_id": "ART-001",     // ❓ Có chưa? — Frontend cần để link artifact với event
  "artifact_version": 1,        // ❓ Có chưa? — Frontend cần hiển thị "v1", "v2" sau mỗi rework
  "reviewer_name": "human_user", // ❓ Có chưa? — Frontend cần hiển thị "Ai đã duyệt"
  "gate": "REQUIREMENT_GATE",   // ❓ Có chưa? — Phân loại gate nào
  "decision": "APPROVE",        // ❓ Có chưa? — Quyết định HITL
  "comment": "LGTM",            // ❓ Có chưa? — Comment khi review
  "phase": "po"                 // ❓ Có chưa? — Để group events theo phase
}
```

### Tại sao cần?
- Sếp yêu cầu: *"Xây dựng component 'Lịch sử duyệt' (Audit Trail) bên cạnh task: **Ai** đã duyệt bước 1, duyệt **lúc mấy giờ**, **version output** là gì."*
- Frontend sẽ group events by phase, hiện version tracking (v1→v2 sau rework), filter by actor/type.

---

## 2. Fetch Artifacts by Task ID

**Endpoint hiện tại**: `GET /api/v1/sdlc/tasks/:task_id` → trả về `{ artifacts: [...] }`

Frontend cần confirm: response `artifacts` array có đầy đủ:
- `id`, `phase`, `type`, `key`, `title`
- `contentText` (string, Markdown) hoặc `contentJson` (object)

Nếu đã có đủ thì OK, không cần thêm gì.

---

## 3. Lưu ý: Data source là SQLite

Frontend đã biết data từ **SQLite** (không phải Postgres). Đảm bảo API response format giống nhau bất kể storage layer.

---

> **Minh reply**: Ghi kết quả vào phần dưới đây hoặc tạo file mới.

### ✏️ MINH'S RESPONSE:
<!-- Minh điền vào đây -->

```
Trường đã có: 
Trường cần thêm:
ETA bổ sung:
```
