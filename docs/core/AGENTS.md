# AI Agents Configuration

> **Cập nhật:** Kiến trúc mới sử dụng **Multica + Claude Code CLI** thay cho LangChain/OpenAI SDK.
> Xem chi tiết: [MULTICA_INTEGRATION_PLAN.md](../project/MULTICA_INTEGRATION_PLAN.md)

---

## Cơ chế hoạt động

Mỗi agent **không** gọi LLM API trực tiếp. Thay vào đó:

```
Backend tạo Multica issue
    → Multica daemon claim task
    → Spawn Claude Code CLI với prompt template
    → Claude CLI xử lý + output JSON
    → Backend parse output + tiếp tục pipeline
```

Claude Code CLI sử dụng **session login** trên máy — không cần API key trong code.

---

## 1. Product Owner (PO) Agent

- **Vai trò:** Phân tích repo → tạo PRD, User Stories, Acceptance Criteria
- **Input:** Repo analysis (tech stack, file count, components)
- **Execution:** Claude Code CLI qua Multica daemon
- **Output:** JSON gồm `prd`, `user_stories`, `acceptance_criteria`, `confidence_score`
- **Prompt file:** `agents/src/agents/po_agent.py` — hàm `build_po_prompt()`
- **Trigger approval:** `confidence_score < 80`

---

## 2. UX Designer (UX) Agent

- **Vai trò:** Đọc PRD → tạo UX Spec, User Flow, Wireframe description
- **Input:** PO output (PRD + user stories)
- **Execution:** Claude Code CLI qua Multica daemon
- **Output:** JSON gồm `ux_spec`, `user_flows`, `wireframes`, `confidence_score`
- **Prompt file:** `agents/src/agents/ux_agent.py` — hàm `build_ux_prompt()`
- **Trigger approval:** `confidence_score < 80`

---

## 3. Developer (DEV) Agent

- **Vai trò:** Đọc PRD + UX Spec → tạo implementation plan + code diff
- **Input:** PO output + UX output + repo structure
- **Execution:** Claude Code CLI qua Multica daemon
- **Output:** JSON gồm `implementation_plan`, `mock_code_diff` (unified git diff), `risk_level`, `confidence_score`
- **Prompt file:** `agents/src/agents/dev_agent.py` — hàm `build_dev_prompt()`
- **Guardrails:**
  - Output PHẢI là unified git diff format (`diff --git ...`)
  - Sau DEV → Sandbox Gate (G3): apply patch + chạy tests trong Docker container
  - Nếu sandbox fail & retries < 2 → DEV Agent chạy lại với error context
- **Trigger approval:** `confidence_score < 80` hoặc `risk_level = HIGH`

---

## 4. Quality Assurance (QA) Agent

- **Vai trò:** Review DEV output + sandbox results → tạo QA Report
- **Input:** PRD + DEV output + sandbox test results
- **Execution:** Claude Code CLI qua Multica daemon
- **Output:** JSON gồm `qa_report_md` (markdown), `status`, `coverage_estimate`, `blockers`, `recommendation`
- **Prompt file:** `agents/src/agents/qa_agent.py` — hàm `build_qa_prompt()`
- **Final output:** `QA.md` được commit vào target repo qua `GitService.commitQAReport()`

---

## Pipeline Contract

```
Repo URL → Clone → Analyze → PO → HITL → UX → HITL → DEV → Sandbox Gate → HITL → QA → HITL → QA.md commit
```

- Mỗi agent chạy **tuần tự** — agent sau cần output từ agent trước
- **HITL gate:** Nếu `confidence_score < 80` → FE hiện ApprovalQueue card → User approve/reject
- **Sandbox Gate (G3):** Sau DEV, trước QA — chạy tests trong Docker container isolated
- Approval được lưu vào database với `approval_id`
- QA.md cuối cùng được commit vào target repo (branch `agent/qa-<session-id>`)
