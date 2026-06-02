# Báo Cáo Phân Tích & Review Hệ Thống AIDLC Control Platform (v0.1)

Dựa trên vai trò **Product Manager, Senior Software Architect và QA Engineer**, tôi đã thực hiện review chuyên sâu đối với 242 file mới được thêm vào, đối chiếu trực tiếp với 3 tài liệu kiến trúc lõi:
1. `Aidlc Product Workflow Concrete Blueprint.pdf`
2. `Bao_cao_BMAD_HITL_Flow_Sequence_Diagram.pdf`
3. `Bao_cao_OMO_Workflow_HITL_WordReady.pdf`

Dưới đây là các điểm sai lệch so với thiết kế, các lỗ hổng kiến trúc và các lỗi code chi tiết (soi từng lỗi) cần khắc phục ngay.

---

## 👨‍💼 1. Product Manager Review (Đánh giá theo Blueprint & Product Vision)

### 1.1. Bỏ sót IntentGate & Prometheus Interview (Nghiêm trọng)
- **Vấn đề:** Theo thiết kế (OMO & Blueprint), khi User nhập Feature Request, hệ thống phải chạy qua **IntentGate** để phân loại và làm rõ yêu cầu (Prometheus Interview) nếu input mơ hồ. 
- **Thực tế:** Trong component `FeatureRequestForm.tsx` và `SdlcController.js`, input của người dùng bị đẩy thẳng trực tiếp vào `PO Agent`. Nếu input là "Làm cho tôi cái nút màu đỏ", PO Agent vẫn sẽ sinh ra 1 đống PRD vô nghĩa thay vì hỏi lại User.
- **Hậu quả:** Sai lệch hoàn toàn với triết lý "Tránh agent hiểu sai task" của OMO.

### 1.2. Mất cơ chế Self-Review (Ralph Loop)
- **Vấn đề:** Blueprint ghi rõ `PO Self-review`, `UX Self-review` phải kiểm tra output contract trước khi tới tay Human.
- **Thực tế:** Trong `main_pipeline.py`, LangGraph chỉ có 1 node duy nhất cho mỗi agent (`po_node`, `ux_node`), sinh ra kết quả là trả thẳng về Frontend. Không có vòng lặp ReAct hay self-correction.
- **Hậu quả:** Chất lượng Artifact thấp, dễ bị hallucination, tăng tỷ lệ Reject tại Human Gate (gây Approve Fatigue).

### 1.3. Vi phạm Output Contract Layer
- **Vấn đề:** Blueprint yêu cầu `PRD Output Contract` phải chia rõ các trường: Problem statement, Target user, Scope, Constraints.
- **Thực tế:** Pydantic schema trong `aidlc.py` chỉ định nghĩa `prd: str`. Việc gom toàn bộ PRD vào một chuỗi String lớn làm mất khả năng validate bằng code (Todo Enforcer không thể check xem Agent có quên viết Target User hay không).

---

## 🏛️ 2. Senior Software Architect Review (Đánh giá Kiến Trúc BMAD & OMO)

### 2.1. Phá vỡ nguyên tắc Artifact Handoff qua File System (BMAD)
- **Vấn đề:** Sơ đồ BMAD nhấn mạnh: *"Artifact được pass qua file system... Session sau đọc artifact đã được user review"*.
- **Thực tế:** Code backend (Node.js & Python) truyền dữ liệu artifact qua memory/JSON và lưu vào Database dưới dạng chuỗi text dài. Không sinh ra file `.md` hay `.json` vật lý nào trên ổ cứng của workspace cả.
- **Hậu quả:** 
  1. Khó audit bằng Git.
  2. Mất đi trải nghiệm "AI là một developer trong team tạo ra file code".

### 2.2. Thiếu Lifecycle Hooks và Pause/Resume (OMO)
- **Vấn đề:** OMO sử dụng các lifecycle hooks (`before_tool_call`, `after_plan`) và hỗ trợ `/pause`, `/resume`.
- **Thực tế:** Dịch vụ `SdlcWorkflowService.js` đang gọi agent chạy một mạch (block execution). Không có bất kỳ điểm dừng (checkpoint) nào để user can thiệp giữa chừng (Manual Interrupt). Nếu request bị timeout giữa chừng, toàn bộ state bị mất (No Session Recovery).

### 2.3. Orchestrator Tĩnh thay vì Sisyphus Orchestrator / Category Router
- **Vấn đề:** OMO yêu cầu Orchestrator động (route task sang visual/deep/quick).
- **Thực tế:** LangGraph pipeline trong `main_pipeline.py` hoàn toàn là một FSM (Finite State Machine) tĩnh, nối cứng `PO -> UX -> DEV -> QA`. Không có sự linh hoạt trong việc bỏ qua phase nếu không cần thiết.

---

## 🕵️‍♂️ 3. QA Engineer & Code-Level Review (Soi Lỗi Code Chi Tiết)

Tôi đã scan qua các file JS, TS, Python và SQL vừa mới thêm. Đây là các bugs và technical debts:

### 🔴 Backend (Node.js & SQL)
1. **Lỗi Transaction (Race Condition):** Tại route `POST /api/sdlc/gate-decision`, hệ thống đang `INSERT` vào bảng `hitl_decisions` sau đó `UPDATE` bảng `tasks` đổi status thành `committed`. Hai lệnh này KHÔNG được bọc trong 1 SQL Transaction (`BEGIN...COMMIT`). Nếu server crash giữa chừng, quyết định Gate bị lưu nhưng Task không chuyển state -> Deadlock workflow.
2. **Missing Input Validation:** Trong `SdlcController.js`, API nhận `featureRequest` từ `req.body` nhưng không hề dùng thư viện nào (Joi, Zod) để kiểm tra xem `title` có rỗng hay `constraints` có phải là mảng không. Có thể gây lỗi 500 nếu truyền sai schema.
3. **No Auth Propagation to Python:** Frontend có gửi JWT token lên Node.js, nhưng Node.js khi gọi HTTP sang Python Agents (`http://localhost:8000`) lại không chuyển tiếp thông tin user/token. Python backend đang bị hổng bảo mật nội bộ.
4. **Lỗi RLS Policy:** File `001_hitl_decisions.sql` có Row Level Security, nhưng policy `hitl_decisions_insert` viết sai logic join với `project_members`. Việc dùng `IN (SELECT project_id...)` có performance rất tệ khi dữ liệu lớn, cần chuyển sang `EXISTS`.

### 🟡 Frontend (React / TypeScript)
5. **Memory Leak do SSE Connection:** Trong `sdlcApi.ts` hoặc `useSdlcStore.ts`, khi subscribe vào Server-Sent Events (SSE) để nghe Agent typing, thiếu hàm dọn dẹp `eventSource.close()` nằm trong `useEffect` cleanup return. Nếu user chuyển trang liên tục, trình duyệt sẽ bị ngập lụt các kết nối SSE ẩn.
6. **Không xử lý Timeout / Reconnect:** Nếu luồng mạng bị rớt, SSE không tự động reconnect. UI sẽ bị treo ở trạng thái `badge-running` mãi mãi mà không báo lỗi.
7. **Type Any & Thiếu Strict Typing:** Trong một số đoạn code (nhất là việc parse JSON từ Python trả về), sử dụng `any` thay vì các Type Interfaces tương ứng của `POAgentOutput`, dẫn đến mất an toàn dữ liệu lúc render Markdown.

### 🟢 Python Agents (FastAPI / LangGraph)
8. **Context Window Overflow:** Prompts không có cơ chế cắt gọt (trimming). Nếu `Project Context` hoặc file quá lớn, đưa vào DEV Agent sẽ bị vượt quá giới hạn token của LLM, gây lỗi `RateLimitError` hoặc `TokenLimitExceeded`.
9. **Chưa xử lý lỗi JSON Parsing:** `qa_agent.py` và các agents trả về Pydantic object bằng cách gọi `.bind_tools()`. Nếu LLM bị hallucinate và trả về JSON sai format, script Python sẽ văng exception Pydantic ValidationError và crash tiến trình agent.

---

## 🎯 4. Đề Xuất Khắc Phục (Action Plan)

Để sản phẩm đạt chuẩn "Product-ready" đúng ý Mentor, team cần làm các bước sau:

1. **Implement IntentGate:** Thêm 1 API chặn đầu trước khi gọi PO Agent. Nếu request quá ngắn (< 20 ký tự), trả về một list câu hỏi (Prometheus Interview) yêu cầu User trả lời thêm.
2. **Áp dụng BMAD File Handoff:** Sửa lại Backend: Thay vì lưu JSON vào DB, hãy thiết lập để Python Agent trực tiếp tạo ra các file Markdown (`prd.md`, `ux_spec.md`) trong thư mục của workspace. Backend chỉ lưu đường dẫn file.
3. **Sửa DB Transaction:** Bọc các lệnh thay đổi state của HITL gate vào `supabase.rpc()` hoặc dùng Transaction.
4. **Sửa SSE Cleanup:** Bổ sung `return () => eventSource.close();` trong các `useEffect` ở Frontend.
5. **Thêm vòng lặp Self-Review:** Trong LangGraph, sau mỗi node tạo (VD: `po_node`), thêm 1 node `po_reviewer_node`. Nếu chất lượng kém, quay lại `po_node` (Max retries: 2) trước khi đưa lên Human Gate.

*Báo cáo kết thúc.*
