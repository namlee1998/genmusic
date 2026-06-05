# 🎯 Task Assignment: Nam — Agent Management Lead

> **Vai trò:** Agent Management, Prompt Engineering, Pipeline Logic
> **Phases chịu trách nhiệm:** Phase 1 (Claude Code setup) + Phase 2 (Agent prompts) + Phase 4 (Cleanup agents)
> **Tham chiếu:** [MULTICA_INTEGRATION_PLAN.md](./MULTICA_INTEGRATION_PLAN.md)
> **Liên hệ:** Giang (FE + PM), Minh (Backend)

---

## Tổng Quan Công Việc

```
Day 1: Claude Code CLI setup + login + test
Day 2: Multica daemon verify + agent detection test
Day 3: Refactor PO Agent + UX Agent prompts (template-based)
Day 4: Refactor DEV Agent + QA Agent prompts + sandbox integration
Day 5: Integration testing — verify agents chạy qua Multica
Day 6: E2E test full pipeline
Day 7: Cleanup old deps + docs
```

---

## Phase 1: Claude Code CLI Setup (Day 1-2)

### Day 1: Claude Code CLI

- [ ] **Verify Claude Code CLI đã được cài**
  ```powershell
  claude --version
  # Nếu chưa có → cài từ https://docs.anthropic.com/claude-code
  ```

- [ ] **Login Claude Code**
  ```powershell
  claude login
  # Đăng nhập bằng tài khoản Anthropic
  # Verify:
  claude --help
  ```

- [ ] **Test Claude Code CLI hoạt động**
  ```powershell
  # Test prompt đơn giản
  claude -p "Say hello in Vietnamese"
  
  # Test với file context
  claude -p "Summarize this file" --file README.md
  
  # Test output format
  claude -p "List 3 programming languages" --output-format json
  ```

- [ ] **Hiểu cách Multica spawn Claude CLI**
  
  Multica daemon sẽ chạy lệnh tương tự:
  ```powershell
  claude -p "<agent prompt>" \
    --file <workspace-file> \
    --output-format json \
    --max-tokens 4096
  ```
  
  Quan trọng: Claude Code CLI sử dụng **session login** trên máy — KHÔNG cần API key trong code.

- [ ] **Báo Minh:** ✅ Claude CLI đã login và ready

---

### Day 2: Multica Daemon + Agent Detection

- [ ] **Verify Multica daemon detect Claude CLI**
  ```powershell
  # Minh sẽ start daemon, Nam verify:
  multica agent list
  # Expected: claude CLI detected
  ```

- [ ] **Test agent execution qua Multica**
  ```powershell
  # Tạo test issue
  multica issue create --title "Test Agent" --body "Say hello from PO agent"
  
  # Watch daemon logs
  multica daemon logs
  
  # Check issue status
  multica issue list --output json
  ```

- [ ] **Xác nhận flow hoạt động:**
  ```
  multica issue create → daemon claim → spawn claude CLI → output → issue complete
  ```

- [ ] **Báo Giang:** ✅ Agent execution qua Multica đã hoạt động

---

## Phase 2: Agent Prompt Refactor (Day 3-4)

### Bối cảnh thay đổi

**AS-IS:** Agents dùng LangChain + OpenAI/Claude SDK → gọi API trực tiếp
**TO-BE:** Agents là **prompt templates** → Multica daemon spawn Claude CLI với prompt đó

Mỗi agent file chuyển từ:
```python
# CŨ: gọi API trong code
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
response = client.chat.completions.create(model="gpt-4o", messages=[...])
```

Thành:
```python
# MỚI: export prompt template → Multica/Claude CLI thực thi
def build_prompt(context: dict) -> str:
    return f"""
    You are a {role} agent...
    Context: {context}
    Output format: JSON
    """
```

---

### Day 3: PO Agent + UX Agent

- [ ] **Refactor `agents/src/agents/po_agent.py`**

  Hiện tại: dùng LangChain + OpenAI SDK
  Mới: prompt template function

  ```python
  """PO Agent — Product Owner / PRD Generator.
  
  Chạy qua: Multica daemon → Claude Code CLI
  Input: repo analysis (tech stack, components, file structure)
  Output: PRD document (JSON structured)
  """
  
  def build_po_prompt(repo_analysis: dict, user_request: str = "") -> str:
      """Build prompt cho PO Agent."""
      return f"""You are an expert Product Owner analyzing a software repository.

  ## Repository Analysis
  - Tech Stack: {', '.join(repo_analysis.get('techStack', []))}
  - File Count: {repo_analysis.get('fileCount', 'unknown')}
  - Components: {', '.join(repo_analysis.get('components', []))}

  ## Your Task
  Analyze this repository and generate a comprehensive PRD (Product Requirements Document).

  {f"User Request: {user_request}" if user_request else ""}

  ## Output Format (JSON)
  {{
    "prd_title": "...",
    "executive_summary": "...",
    "user_stories": [
      {{"id": "US-001", "as_a": "...", "i_want": "...", "so_that": "...", "priority": "HIGH"}}
    ],
    "functional_requirements": ["..."],
    "non_functional_requirements": ["..."],
    "acceptance_criteria": ["..."],
    "confidence_score": 85,
    "risk_assessment": "..."
  }}

  Output ONLY valid JSON. No markdown fences.
  """
  
  def parse_po_output(raw_output: str) -> dict:
      """Parse PO agent output thành structured data."""
      import json, re
      text = raw_output.strip()
      # Strip markdown fences if present
      fence = re.search(r'```(?:json)?\s*([\s\S]*?)```', text)
      if fence:
          text = fence.group(1).strip()
      try:
          return json.loads(text)
      except json.JSONDecodeError:
          return {
              "prd_title": "Parse Error",
              "executive_summary": raw_output,
              "confidence_score": 30,
              "error": "Failed to parse PO output as JSON"
          }
  ```

- [ ] **Refactor `agents/src/agents/ux_agent.py`**

  Tương tự PO Agent nhưng cho UX:
  ```python
  def build_ux_prompt(prd_output: dict, repo_analysis: dict) -> str:
      """Build prompt cho UX Agent."""
      return f"""You are an expert UX Designer.

  ## PRD Context
  {json.dumps(prd_output, indent=2)}

  ## Repository Tech Stack
  {', '.join(repo_analysis.get('techStack', []))}

  ## Your Task
  Create a UX specification based on the PRD above.

  ## Output Format (JSON)
  {{
    "design_system": {{
      "colors": {{}},
      "typography": {{}},
      "spacing": {{}}
    }},
    "wireframes": [
      {{"page": "...", "layout": "...", "components": ["..."]}}
    ],
    "user_flows": [
      {{"name": "...", "steps": ["..."]}}
    ],
    "accessibility_notes": ["..."],
    "confidence_score": 80
  }}
  """
  ```

- [ ] **Test prompts manually:**
  ```powershell
  # Test PO prompt
  claude -p "<po_prompt_content>" --output-format json
  
  # Test UX prompt  
  claude -p "<ux_prompt_content>" --output-format json
  ```

---

### Day 4: DEV Agent + QA Agent

- [ ] **Refactor `agents/src/agents/dev_agent.py`**

  DEV Agent là phức tạp nhất vì output phải là **unified git diff**:
  ```python
  def build_dev_prompt(prd_output: dict, ux_spec: dict, repo_analysis: dict) -> str:
      """Build prompt cho DEV Agent."""
      return f"""You are a Senior Software Engineer implementing features.

  ## PRD
  {json.dumps(prd_output, indent=2)}

  ## UX Specification
  {json.dumps(ux_spec, indent=2)}

  ## Repository Info
  - Tech Stack: {', '.join(repo_analysis.get('techStack', []))}
  - File Count: {repo_analysis.get('fileCount', 'unknown')}

  ## Your Task
  Generate the implementation as a unified git diff.

  ## Output Format (JSON)
  {{
    "implementation_plan": "Step-by-step plan...",
    "mock_code_diff": "diff --git a/file.js b/file.js\\n--- a/file.js\\n+++ b/file.js\\n@@ -1,3 +1,5 @@\\n...",
    "changed_files": [
      {{"path": "src/file.js", "reason": "...", "change_type": "modify"}}
    ],
    "risk_assessment": "...",
    "risk_level": "LOW",
    "confidence_score": 75,
    "summary": "..."
  }}

  CRITICAL: mock_code_diff MUST be a valid unified git diff format.
  """
  ```

  Lưu ý quan trọng:
  - Output phải là unified git diff (`diff --git...`) → Sandbox Gate cần parse
  - `confidence_score` < 80 → trigger approval flow
  - DEV Agent có thể bị retry bởi Sandbox Gate

- [ ] **Refactor `agents/src/agents/qa_agent.py`**

  QA Agent tạo QA.md report:
  ```python
  def build_qa_prompt(
      prd_output: dict, 
      dev_output: dict, 
      sandbox_result: dict
  ) -> str:
      """Build prompt cho QA Agent."""
      return f"""You are a QA Engineer reviewing code changes.

  ## PRD Requirements
  {json.dumps(prd_output, indent=2)}

  ## DEV Agent Output
  Code Diff: {dev_output.get('mock_code_diff', 'N/A')}
  Risk Level: {dev_output.get('risk_level', 'UNKNOWN')}

  ## Sandbox Test Results
  {json.dumps(sandbox_result, indent=2)}

  ## Your Task
  Create a comprehensive QA report in Markdown format.

  ## Output Format (JSON)
  {{
    "qa_report_md": "# QA Report\\n\\n## Summary\\n...\\n## Test Results\\n...",
    "status": "passed",
    "coverage_estimate": 85,
    "blockers": 0,
    "warnings": 2,
    "issues_found": [
      {{"severity": "warning", "description": "...", "file": "..."}}
    ],
    "confidence_score": 90,
    "recommendation": "approve"
  }}
  """
  ```

- [ ] **Test DEV + QA prompts:**
  ```powershell
  # Test DEV prompt — verify output is valid git diff
  claude -p "<dev_prompt>" --output-format json
  
  # Test QA prompt — verify output has qa_report_md
  claude -p "<qa_prompt>" --output-format json
  ```

---

## Phase 4: Cleanup (Day 7)

### Remove Old Dependencies

- [ ] **Update `agents/requirements.txt`**
  ```diff
  # REMOVE these:
  - langchain>=0.1.0
  - langchain-openai>=0.1.0
  - langchain-anthropic>=0.1.0
  - langfuse>=2.0.0
  - e2b-code-interpreter>=0.0.9
  - openai>=1.0.0
  - google-generativeai>=0.3.0
  
  # KEEP these:
    pydantic>=2.0.0
    python-dotenv>=1.0.0
    httpx>=0.25.0
  ```

- [ ] **Archive old agent files**
  ```powershell
  # Tạo thư mục archive
  mkdir agents/src/agents/_archive
  
  # Move original files (giữ lại để tham khảo)
  # Copy các file gốc trước khi overwrite
  ```

- [ ] **Remove LangGraph workflow**
  - File: `agents/src/workflows/main_pipeline.py`
  - Archive vào `_archive/` — workflow mới nằm trong backend `SdlcWorkflowService.js`

- [ ] **Update imports và clean dead code**
  - Xóa tất cả `from langchain...` imports
  - Xóa tất cả `from openai...` imports
  - Xóa `from e2b_code_interpreter...` imports

---

## Files Tôi Chịu Trách Nhiệm

| Action | File |
|---|---|
| 🔄 REFACTOR | `agents/src/agents/po_agent.py` |
| 🔄 REFACTOR | `agents/src/agents/ux_agent.py` |
| 🔄 REFACTOR | `agents/src/agents/dev_agent.py` |
| 🔄 REFACTOR | `agents/src/agents/qa_agent.py` |
| 🔄 MODIFY | `agents/requirements.txt` |
| 📁 ARCHIVE | `agents/src/workflows/main_pipeline.py` |
| 📁 ARCHIVE | `sandbox/e2b_runtime.py` |
| 📁 ARCHIVE | `sandbox/run_dev.py` |
| 📁 ARCHIVE | `sandbox/test_e2b.py` |
| 🔄 UPDATE | `agents/src/tools/sandbox.py` (integrate với docker_sandbox) |

---

## Prompt Engineering Guidelines

### Output Format Rules
1. **Luôn yêu cầu JSON output** — dễ parse, dễ validate
2. **Luôn có `confidence_score`** (0-100) — backend dùng để trigger approval
3. **DEV Agent: output PHẢI là unified git diff** — Sandbox Gate cần apply được
4. **QA Agent: output có `qa_report_md`** — backend commit vào repo dưới dạng QA.md

### Prompt Testing Checklist
Mỗi prompt cần test:
- [ ] Output là valid JSON
- [ ] `confidence_score` nằm trong 0-100
- [ ] Không có markdown fences bọc JSON (hoặc parser xử lý được)
- [ ] DEV Agent: `mock_code_diff` bắt đầu bằng `diff --git`
- [ ] QA Agent: `qa_report_md` là valid markdown

### Retry Context
Khi DEV Agent bị retry do Sandbox Gate fail, Minh sẽ append error context vào prompt:
```python
def build_dev_retry_prompt(original_prompt: str, sandbox_error: str, attempt: int) -> str:
    return f"""{original_prompt}

[SYSTEM] Your previous attempt (#{attempt}) failed sandbox testing.
Error: {sandbox_error}

Please fix the code diff to address the error above.
Output the corrected unified git diff.
"""
```

---

## Dependencies & Blockers

| Phụ thuộc | Từ ai | Khi nào cần |
|---|---|---|
| Claude Code CLI login | Bản thân | Day 1 |
| Multica daemon running | Minh | Day 2 |
| Multica issue API working | Minh | Day 3 |
| Sandbox Docker image built | Minh | Day 4 (để test sandbox flow) |
| Backend pipeline endpoint | Minh | Day 5 (integration) |

---

## Lưu Ý Quan Trọng

> ⚠️ **Claude Code CLI cần login trên máy TRƯỚC khi daemon chạy.**  
> Multica daemon spawn `claude` CLI process — nếu chưa login thì agent sẽ fail.

> ⚠️ **Agent prompts là stateless.**  
> Mỗi lần chạy agent = 1 lần gọi `claude -p "..."`. Không có memory/conversation history.  
> Tất cả context cần truyền qua prompt parameter.

> ⚠️ **Test từng prompt riêng lẻ TRƯỚC khi integrate.**  
> Chạy `claude -p "<prompt>"` manually và verify JSON output trước khi đưa vào Multica flow.
