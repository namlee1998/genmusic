# Mentor Q&A - AIFA Project

Tài liệu này gồm các câu hỏi mentor/PM/BE reviewer có khả năng hỏi về dự án, kèm câu trả lời ngắn gọn theo kiến trúc hiện tại. Do Backend đóng vai trò như "bộ não" (Control Plane) của toàn bộ hệ thống (quản lý Orchestration, SSE, Claude Runner, Database, Security), phần lớn các câu hỏi sẽ tập trung vào luồng Backend và API.

---

## Phần 1: Tổng quan & Kiến trúc dự án (Overview & Architecture)

### 1. Dự án này là gì?
**Trả lời:**  
AIFA là hệ thống điều phối quy trình phát triển phần mềm bằng AI agent. Người dùng tạo feature request, hệ thống chạy qua 4 persistent agent sessions: **PO, UX, DEV, QA**. Mỗi session có thể sinh artifact, chờ human review, request rework, handoff sang session tiếp theo, và cuối cùng tới Final Release.

### 2. Dự án dùng ngôn ngữ gì?
**Trả lời:**  
Dự án có 3 phần chính:
- **Frontend:** TypeScript + React.
- **Backend:** JavaScript Node.js + Express.
- **Agent fallback service:** Python + FastAPI. Hiện production/demo path đã chốt chạy qua Claude Code, Python/LangChain chỉ còn là fallback dev/test legacy.

### 3. Dự án dùng thư viện/framework nào?
**Trả lời:**  
Frontend dùng React, Vite, Zustand, React Router, Tailwind CSS, lucide-react, axios, framer-motion, react-markdown, i18next.
Backend dùng Express, Prisma/SQLite, `@anthropic-ai/claude-agent-sdk`, axios, multer, socket.io, pino, uuid, Sentry, node-cron.
Agents Python fallback dùng FastAPI, Uvicorn, Pydantic, LangChain, Langfuse, httpx, OpenAI-compatible libraries.

### 4. Chức năng chính của dự án gồm những gì?
**Trả lời:**  
- Tạo project và quản lý workspace.
- Tạo feature request.
- Chạy SDLC qua 4 sessions: PO -> UX -> DEV -> QA.
- Sinh artifact: PRD, acceptance criteria, UI design, code diff, QA report.
- Human-in-the-loop gate: approve, request changes, reject.
- Rework/rerun trong cùng session.
- Chat theo project/gate/session.
- Stream tiến độ agent qua SSE.
- Quản lý artifact, audit trail, timeline, metrics.
- Upload/repo workspace để DEV có context code.

### 5. Kiến trúc tổng quan của dự án như thế nào?
**Trả lời:**  
Frontend gọi API vào backend. Backend là control plane: quản lý project, task, session, artifact, gate, audit, và agent runtime. Backend gọi Claude Code SDK để chạy PO/UX/DEV/QA. Kết quả được lưu vào database và artifact files. Frontend poll/SSE để cập nhật dashboard.

### 6. Tại sao cần backend làm control plane thay vì FE gọi Claude trực tiếp?
**Trả lời:**  
Vì backend cần giữ các phần quan trọng:
- Auth/permission & Tool permission policy.
- Repo path safety.
- Session/task state & Artifact persistence.
- Human gate & Audit trail.
- Resume/rework session.
Nếu FE gọi trực tiếp thì khó kiểm soát security, luồng dữ liệu (workflow consistency) và mất hoàn toàn tính auditable.

### 7. Điểm yếu/risk hiện tại của dự án là gì?
**Trả lời:**  
- Dependency local phải đầy đủ (`@prisma/client`, `tsc`) mới chạy full test được.
- Python/LangChain fallback vẫn còn trong repo, cần cleanup sau khi Claude Code path ổn định.
- Migration SQLite có cột mới `Task.agentSessionId`; cần đảm bảo migration/db push chạy đúng trước demo.
- Real Claude Code phụ thuộc local Claude login, rate limit, và network/certificate.
- Repo-level apply/rollback cần được QA kỹ nếu dùng trên repo production thật.

### 8. Dự án này production ready chưa?
**Trả lời:**  
Kiến trúc đã đi đúng hướng cho demo/production path: 4 persistent sessions + Claude Code + HITL gates + audit. Tuy nhiên để gọi là production-ready thật sự, cần verify real Claude Code run end-to-end, harden migration/rollback, và QA kỹ các tool permissions (write/shell).

---

## Phần 2: Core Backend & Database (Quản lý Agent & Session)

### 9. Gọi agent trong backend như thế nào? (Câu trả lời ngắn gọn)
**Trả lời:**  
Frontend không gọi agent trực tiếp. FE gọi backend. Backend tạo Task run trong AgentSession, build context từ artifact upstream, rồi gọi `claudeCodeRunner.runAgent()` qua Claude Agent SDK. Output được parse, validate, lưu artifact, sau đó chờ human approve để handoff sang session tiếp theo.

### 10. Tại sao gọi là 4 persistent sessions? Tại sao không chỉ dùng một pipeline task?
**Trả lời:**  
Vì mỗi project luôn có 4 session cố định: `po`, `ux`, `dev`, `qa`. Session là context làm việc dài hạn của agent. Việc có session giúp mỗi agent duy trì state, transcript, native Claude session id, rework history, và audit trail riêng (thể hiện continuity của từng role). `Task` chỉ là một lần run/attempt trong session.

### 11. Intent Agent còn tồn tại không?
**Trả lời:**  
Không còn là một session riêng. Intent đã được gộp vào PO intake. Endpoint legacy `/run-intent-agent` vẫn được giữ để compatibility, nhưng nó delegate sang PO session thay vì tạo intent-agent session mới.

### 12. Claude Code được gọi bằng cách nào?
**Trả lời:**  
Backend dùng package `@anthropic-ai/claude-agent-sdk`. File `claudeCodeRunner.js` build role prompt theo agent type, gọi SDK `query()`, stream token về ChatService, parse output JSON/artifact, và trả về cho `SdlcWorkflowService`.
Env bắt buộc: `EXECUTION_PATH=claude-code`, `CLAUDE_CODE_OUTPUT_FORMAT=json`.

### 13. Dự án có dùng LLM router không?
**Trả lời:**  
Production/demo hiện tại đã chốt Claude Code. `EXECUTION_PATH=claude-code` nghĩa là PO/UX/DEV/QA đều chạy qua Claude Code SDK. Legacy Python/LangChain router vẫn còn trong repo để dev/test fallback, nhưng không phải path chính.

### 14. Các file backend quan trọng là gì?
**Trả lời:**
- `backend/src/routes/sdlc.js`: khai báo route SDLC.
- `backend/src/controllers/SdlcController.js`: HTTP controller.
- `backend/src/services/SdlcWorkflowService.js`: orchestration core, quản lý luồng agent.
- `backend/src/services/ChatService.js`: chat history và agent event stream.
- `backend/src/agents/claudeCodeRunner.js`: gọi Claude Code SDK.
- `backend/src/agents/claudePermissionDispatcher.js`: policy cho tool/file permission.
- `backend/src/services/agentContract.js`: validate output contract.
- `backend/src/models/AgentSession.js`: model 4 persistent sessions.

### 15. Các file agent/fallback Python quan trọng là gì?
**Trả lời:**
- `agents/main.py`: FastAPI agent server fallback.
- `agents/src/workflows/main_pipeline.py`: pipeline fallback.
- Các module logic nằm trong `agents/src/agents/` (như `po_agent.py`, `dev_agent.py`).

### 16. Database có những bảng/domain nào quan trọng?
**Trả lời:**
- `Project`: project/workspace.
- `AgentSession`: 4 session cố định PO/UX/DEV/QA.
- `Task`: mỗi lần agent run/attempt.
- `AgentArtifact`: output của agent.
- `HitlDecision`: human approve/reject/request changes.
- `AgentEvent`: lifecycle event của task.
- `ChatMessage`: transcript theo project/gate/session.

### 17. Session memory/transcript nằm ở đâu?
**Trả lời:**  
Session state nằm trong bảng `AgentSession`. Transcript/chat nằm trong `ChatMessage`. Backend tự động lưu audit message vào transcript khi session start, complete, blocked, approve, rework. Claude Code native session id được lưu ở `AgentSession.nativeSessionId` để resume context.

### 18. Human gate nằm ở đâu trong Backend?
**Trả lời:**  
- `HitlDecision` (Database) lưu decision.
- `gateBridge.js` quản lý pending gate runtime (chờ human).
- `SdlcWorkflowService.submitGateDecision()` xử lý logic approve/request changes.

### 19. Nếu backend restart giữa lúc agent đang chạy thì sao?
**Trả lời:**  
Backend có lifecycle/orphan recovery cho Claude Code path. `Task` lưu `claudeSessionId`, `AgentSession` lưu `nativeSessionId`. Khi restart, service có thể detect task đang running/awaiting resume và re-drive Claude Code session nếu có saved session id.

### 20. Backend có apply code vào repo thật không?
**Trả lời:**  
DEV session có thể chạy trên repo workspace/local repo, đọc context file, sinh diff/code artifact, và dùng `claudePermissionDispatcher` để kiểm soát tool/file access. Việc apply patch thật phụ thuộc vào cấu hình của Claude Code runner và người dùng duyệt (approve) tool gate.

### 21. BE route/controller/service mapping như thế nào?
**Trả lời:**  
Mô hình chuẩn MVC/Service:
- Frontend `sdlcApi.ts` -> Backend `routes/sdlc.js` -> `SdlcController.js` -> `SdlcWorkflowService.js` -> `claudeCodeRunner.js`.

---

## Phần 3: API & Giao tiếp (Frontend <-> Backend)

### 22. Backend kết nối với frontend qua những gì?
**Trả lời:**  
Backend expose REST API và SSE.
- REST API: Start session, get pipeline, approve gate, get chat history.
- SSE: Stream workflow progress, stream session status, stream agent token.

### 23. Frontend kết nối với agent như thế nào?
**Trả lời:**  
Frontend không gọi agent trực tiếp. Frontend gọi Backend (API + SSE). Khi Agent chạy ở Backend, Backend phát event (SSE) đẩy token và trạng thái ngược về Frontend.

### 24. FE có biết agent đang chạy tới đâu không?
**Trả lời:**  
Có. FE biết qua 3 cơ chế:
1. Poll `GET /sdlc/pipeline/:workflowId` (State tổng hợp).
2. SSE `GET /sdlc/stream/:workflowId` (Snapshot realtime).
3. Chat agent stream `GET /chat/:projectId/agent-stream` (Live agent token).

### 25. Luồng API khi user tạo feature request là gì?
**Trả lời:**  
```text
Dashboard -> POST /api/v1/sdlc/projects/:project_id/sessions/po/start 
-> SdlcController -> SdlcWorkflowService.startAgentSession(role='po') 
-> Tạo Task -> _runAgent() -> claudeCodeRunner
```

### 26. Luồng API lấy danh sách 4 sessions như thế nào?
**Trả lời:**  
FE gọi `GET /api/v1/sdlc/projects/:project_id/sessions`. Backend trả về danh sách 4 session (po, ux, dev, qa) kèm theo `currentTaskId`, `status` và `lastCommittedTaskId`.

### 27. Luồng API poll trạng thái workflow như thế nào?
**Trả lời:**  
FE gọi `GET /api/v1/sdlc/pipeline/:workflowId`. Backend trả về `pipelinePhases`, `agentSessions`, `pendingGates`, `auditLog` - đây là API quan trọng nhất để dựng 4 lane trên Dashboard.

### 28. Luồng API approve/request changes của FE là gì?
**Trả lời:**  
FE gọi `POST /api/v1/sdlc/sessions/:session_id/decision`. Backend đọc `session_id`, tìm `currentTaskId`, rồi gọi `submitGateDecision()`. Nếu duyệt, session chuyển sang `committed` và tự động start agent tiếp theo.

### 29. FE approve thì làm sao backend biết approve session nào?
**Trả lời:**  
Vì FE gửi kèm `session_id`. Backend lookup trong DB để lấy ra task mới nhất đang pending của session đó, không bao giờ bị lẫn lộn giữa PO/UX hay DEV.

### 30. Luồng API rerun/rework session như thế nào?
**Trả lời:**  
FE gọi `POST /api/v1/sdlc/sessions/:session_id/rerun`. Backend KHÔNG tạo session mới, mà tạo một `Task` run mới bên trong `AgentSession` đó, kèm theo feedback của user.

### 31. Luồng API chat giữa FE và BE như thế nào?
**Trả lời:**  
- Lịch sử chat: `GET /api/v1/chat/:projectId/history`.
- Gửi tin nhắn: `POST /api/v1/chat/:projectId/messages`.
- Live Agent Stream (SSE): `GET /api/v1/chat/:projectId/agent-stream`. (ChatService đẩy từng token qua EventSource).

---

## Phần 4: Quy trình & Hoạt động (Workflow & Frontend)

### 32. Luồng hoạt động của dự án từ lúc user tạo request đến release?
**Trả lời:**  
1. User nhập feature request.
2. Hệ thống start PO session -> sinh PRD/AC.
3. Human approve PO -> start UX session -> sinh UI design.
4. Human approve UX -> start DEV session -> sinh code diff/patch.
5. Human approve DEV -> start QA session -> sinh Test/Verdict.
6. Human approve QA -> Final release.

### 33. Rework/rerun hoạt động như thế nào?
**Trả lời:**  
Nếu user request changes ở PO, backend tạo task chạy lại trong PO session. Tất cả các session đứng sau (UX, DEV) sẽ bị đánh dấu là `stale` (cũ) cho đến khi PO hoàn thành bản mới và được approve.

### 34. Có cơ chế rollback không?
**Trả lời:**  
- Workflow Rollback: Có. Nếu Reject, workflow bắt buộc làm lại phase đó. Các phase sau sẽ bị khóa hoặc đánh dấu stale.
- Repo-level Rollback: Phụ thuộc vào git state của workspace và cách Claude Code apply patch. Nếu chạy trên production repo, cần human kiểm duyệt kỹ lệnh bash git.

### 35. Các file frontend/component quan trọng là gì?
**Trả lời:**
- `frontend/src/pages/SdlcDashboard/index.tsx`: Dashboard workflow 4 lanes.
- `frontend/src/store/useSdlcStore.ts`: Quản lý state workflow toàn cục (Zustand).
- `frontend/src/store/useHitlStore.ts`: Quản lý popup phê duyệt (Gate).
- `frontend/src/components/sdlc/ToolApprovalPrompt.tsx`: UI phê duyệt tool.

### 36. FE hiện 4 sessions như thế nào?
**Trả lời:**  
Dashboard dùng `pipelinePhases` và `agentSessions` lấy từ API để render 4 cột (lanes) trạng thái cho PO, UX, DEV, QA.

---

## Phần 5: Quality Gate, Security & Performance

### 37. Hệ thống bảo mật như thế nào khi cho phép Agent chạy Tool và Shell Command?
**Trả lời:**  
AIFA có lớp `claudePermissionDispatcher` làm nhiệm vụ chặn hoặc yêu cầu human review trước khi agent được phép thực thi tool.
- **Read-only tools** (`Read`, `Glob`, `Grep`, `LS`): Tự động được phép (auto-allowed), NHƯNG sẽ bị BLOCK hoàn toàn nếu agent cố ý thoát ra khỏi thư mục repo (`../../`) hoặc đọc các file nhạy cảm (`.env`, `.pem`, `id_rsa`, `credentials.json`).
- **Write/Shell tools**: Được phân loại rủi ro qua `riskClassifier`. Nếu là command can thiệp sâu, nó sẽ bị đưa vào trạng thái `pending gate` để chờ human phê duyệt trên UI trước khi chạy tiếp.

### 38. Dự án đã xử lý performance và UX khi Agent chạy lâu như thế nào?
**Trả lời:**  
Dự án áp dụng 4 lớp tối ưu để LLM chạy mượt mà:
1. **Live Token Streaming (UX):** Truyền `agent_token` event qua EventSource, giúp user thấy từng chữ agent suy nghĩ real-time trên Chat UI.
2. **Context Window Truncation (LLM):** Bypass giới hạn đọc các file lớn xuống tối đa 200 dòng trong `runDEVAgent`, giảm thiểu input tokens và Time-To-First-Token.
3. **Module Caching:** Lazy-cache các thư viện nặng (`glob`) để tránh load lại nhiều lần.
4. **Soft Timeout Warning:** Cảnh báo timeout ở mốc 60% budget để user biết agent có bị kẹt hay không.

### 39. DEV Agent đọc file và sửa code như thế nào mà không bị tràn context?
**Trả lời:**  
Sử dụng `repoService.findQuickTargetFiles()` để hint thẳng cho agent những file cốt lõi (như `App.jsx`, `App.css`), tránh việc nó phải gọi `ls` toàn bộ thư mục. Agent dùng tool `multi_replace_file_content` hoặc shell script (kèm Tool Gate) để sửa đúng vị trí cần sửa.

### 40. Output của agent được validate như thế nào?
**Trả lời:**  
Bằng `agentContract.js`. Mỗi agent có các trường bắt buộc (PO cần `prd`, UX cần `ui_design`, QA cần `verdict`). Nếu thiếu, artifact bị mark là `invalid` và không cho phép handoff sang session sau.

### 41. QA Gate đánh giá artifact bằng tiêu chí gì để quyết định PASS hay HOLD?
**Trả lời:**  
Backend sử dụng `QualityGateService` để chấm điểm (0-100) dựa trên bộ rule:
1. **Total Test Cases (25đ):** Số lượng test case.
2. **Type Distribution (25đ):** Phân bổ loại test (Happy, Negative, Security).
3. **AC Coverage (25đ):** Tỷ lệ bao phủ Acceptance Criteria của PO.
4. **Blockers (15đ):** Trừ điểm nếu QA báo lỗi Blocker.
5. **Static & Security Scan (10đ):** Lọc hardcoded password, thiếu error handling.
Nếu vi phạm Blocker hoặc tổng điểm quá thấp, hệ thống gài Gate Recommendation thành `HOLD` hoặc `REWORK`.

---

## Phụ lục: Danh sách câu hỏi tự kiểm tra (Self-Check Checklist)

Dưới đây là danh sách tổng hợp 41 câu hỏi để các thành viên trong team có thể tự test lại kiến thức của mình trước khi trình bày với Mentor:

**Phần 1: Tổng quan & Kiến trúc**
- [ ] 1. Dự án này là gì?
- [ ] 2. Dự án dùng ngôn ngữ gì?
- [ ] 3. Dự án dùng thư viện/framework nào?
- [ ] 4. Chức năng chính của dự án gồm những gì?
- [ ] 5. Kiến trúc tổng quan của dự án như thế nào?
- [ ] 6. Tại sao cần backend làm control plane thay vì FE gọi Claude trực tiếp?
- [ ] 7. Điểm yếu/risk hiện tại của dự án là gì?
- [ ] 8. Dự án này production ready chưa?

**Phần 2: Core Backend & Database**
- [ ] 9. Gọi agent trong backend như thế nào? (Câu trả lời ngắn gọn)
- [ ] 10. Tại sao gọi là 4 persistent sessions? Tại sao không chỉ dùng một pipeline task?
- [ ] 11. Intent Agent còn tồn tại không?
- [ ] 12. Claude Code được gọi bằng cách nào?
- [ ] 13. Dự án có dùng LLM router không?
- [ ] 14. Các file backend quan trọng là gì?
- [ ] 15. Các file agent/fallback Python quan trọng là gì?
- [ ] 16. Database có những bảng/domain nào quan trọng?
- [ ] 17. Session memory/transcript nằm ở đâu?
- [ ] 18. Human gate nằm ở đâu trong Backend?
- [ ] 19. Nếu backend restart giữa lúc agent đang chạy thì sao?
- [ ] 20. Backend có apply code vào repo thật không?
- [ ] 21. BE route/controller/service mapping như thế nào?

**Phần 3: API & Giao tiếp (Frontend <-> Backend)**
- [ ] 22. Backend kết nối với frontend qua những gì?
- [ ] 23. Frontend kết nối với agent như thế nào?
- [ ] 24. FE có biết agent đang chạy tới đâu không?
- [ ] 25. Luồng API khi user tạo feature request là gì?
- [ ] 26. Luồng API lấy danh sách 4 sessions như thế nào?
- [ ] 27. Luồng API poll trạng thái workflow như thế nào?
- [ ] 28. Luồng API approve/request changes của FE là gì?
- [ ] 29. FE approve thì làm sao backend biết approve session nào?
- [ ] 30. Luồng API rerun/rework session như thế nào?
- [ ] 31. Luồng API chat giữa FE và BE như thế nào?

**Phần 4: Quy trình & Hoạt động**
- [ ] 32. Luồng hoạt động của dự án từ lúc user tạo request đến release?
- [ ] 33. Rework/rerun hoạt động như thế nào?
- [ ] 34. Có cơ chế rollback không?
- [ ] 35. Các file frontend/component quan trọng là gì?
- [ ] 36. FE hiện 4 sessions như thế nào?

**Phần 5: Quality Gate, Security & Performance**
- [ ] 37. Hệ thống bảo mật như thế nào khi cho phép Agent chạy Tool và Shell Command?
- [ ] 38. Dự án đã xử lý performance và UX khi Agent chạy lâu như thế nào?
- [ ] 39. DEV Agent đọc file và sửa code như thế nào mà không bị tràn context?
- [ ] 40. Output của agent được validate như thế nào?
- [ ] 41. QA Gate đánh giá artifact bằng tiêu chí gì để quyết định PASS hay HOLD?
