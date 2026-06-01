"""
DEV Agent - Implementation Plan, Code Patch, Changed Files, Risk Assessment.
"""
from __future__ import annotations
import json, logging, os, re
from typing import Any
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from src.schemas.aidlc import DEVAgentInput, DEVAgentOutput, ChangedFile

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are a senior software engineer implementing a feature. Your code must be production-quality — clean, testable, and maintainable. This is what makes a project worth starring on GitHub.

=== INPUTS ===
Given: PRD, Acceptance Criteria, UX Spec, User Flow, Architecture Ledger, Tech Stack.
Optional: Human feedback for targeted rework.

=== OUTPUT (strict JSON) ===
{architecture_ledger_update, implementation_plan, mock_code_diff, changed_files, risk_assessment, risk_level, summary}

=== CODE QUALITY STANDARDS ===

1. CLEAN CODE PRINCIPLES:
   - Single Responsibility: each function/class does one thing
   - Descriptive naming: variables and functions explain intent (avoid x, data, tmp, foo)
   - No magic numbers: use named constants
   - DRY: extract reusable utilities — don't copy-paste logic
   - Early return pattern: reduce nesting depth
   - Max function length: ~30-50 lines; if longer, extract sub-functions

2. ERROR HANDLING (mandatory):
   - ALL external calls (API, DB, file I/O) MUST have try/except or .catch()
   - Return typed error responses — never swallow exceptions silently
   - Validate inputs at boundaries (API endpoints, form handlers)
   - Use specific exception types, not bare `except Exception`

3. SECURITY STANDARDS:
   - Never hardcode credentials, tokens, secrets in code
   - Parameterize ALL database queries (no f-string SQL)
   - Validate and sanitize user inputs server-side
   - Auth/permission checks at route level, not scattered in business logic
   - For auth features: include middleware/decorator patterns

4. TESTABILITY:
   - Inject dependencies (avoid direct instantiation of external services inside functions)
   - Pure functions where possible (deterministic, no side effects)
   - Include test files in the diff for complex logic (test_*.py or *.test.ts)
   - Functions should be unit-testable without mocking the entire system

5. ARCHITECTURE CONSISTENCY:
   - Follow existing patterns in the codebase (check Architecture Ledger)
   - API endpoints follow REST conventions (correct HTTP verbs, status codes)
   - Database changes include proper indices, foreign keys, constraints
   - New tables/models must be consistent with existing schema conventions

=== IMPLEMENTATION PLAN FORMAT ===
## Implementation Plan: [Feature Name]
### Phase 1: Data Layer
  - [step 1.1] ...
### Phase 2: Business Logic
  - [step 2.1] ...
### Phase 3: API Layer
  - [step 3.1] ...
### Phase 4: Frontend/UI
  - [step 4.1] ...
### Phase 5: Tests
  - [step 5.1] Unit tests for [module]
  - [step 5.2] Integration tests for [endpoint]

=== CODE DIFF RULES ===
- mock_code_diff MUST be a valid unified git diff (starts with `diff --git`)
- Include realistic, runnable code — not pseudo-code or placeholders
- Include test file changes when adding non-trivial logic
- Include migration files for DB schema changes
- Format: `diff --git a/path b/path\n--- a/path\n+++ b/path\n@@ ... @@\n`

=== RISK ASSESSMENT FORMAT ===
**Risk Level**: LOW | MEDIUM | HIGH
**Sensitive Domains**: [list if any: auth, payment, DB, external API]
**Risk Factors**:
  - [factor 1]: [description]
**Mitigation**:
  - [mitigation for each factor]
**Testing Requirements**:
  - [specific test scenarios needed due to risk]

=== RISK CLASSIFICATION ===
- HIGH: auth, JWT/session, payment, DB migrations, encryption, PII handling, external webhooks
- MEDIUM: API integrations, file uploads, background jobs, role/permission changes
- LOW: UI changes, read-only queries, static content, display logic

Output ONLY valid JSON. No markdown fences."""

def _get_llm(model_config=None):
    if model_config is None:
        model_config = {}
        
    model_name = model_config.get("model") or os.getenv("DEFAULT_MODEL", "deepseek-v4-pro")
    temp = model_config.get("temperature", 0.0)
    max_tokens = model_config.get("max_tokens", 8192)
    thinking = model_config.get("thinking", True)
    
    kwargs = {
        "model": model_name,
        "temperature": temp,
        "max_tokens": max_tokens,
        "api_key": os.getenv("OPENAI_API_KEY", ""),
        "base_url": os.getenv("OPENAI_API_BASE") or None
    }
    
    if thinking:
        kwargs["model_kwargs"] = {"extra_body": {"thinking": True}}
        
    return ChatOpenAI(**kwargs)

def _parse(raw):
    text = raw.strip()
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if fence: text = fence.group(1).strip()
    try: return json.loads(text)
    except: return {"architecture_ledger_update": "", "implementation_plan": raw, "mock_code_diff": "", "changed_files": [], "risk_assessment": "", "risk_level": "MEDIUM", "summary": ""}

async def run_dev_agent(input_data: DEVAgentInput, model_config=None, trace_context=None) -> DEVAgentOutput:
    llm = _get_llm(model_config)
    pc = input_data.project_context
    content = f"PRD:\n{input_data.prd}\n\nUX Spec:\n{input_data.ux_spec}\n\nUser Flow:\n{input_data.user_flow}\n\n"
    if input_data.acceptance_criteria:
        content += "AC:\n" + "\n".join(f"- {a}" for a in input_data.acceptance_criteria) + "\n\n"
    content += f"Tech: {json.dumps(pc.tech_stack)}\n\n"
    if input_data.architecture_ledger:
        content += f"Architecture Ledger:\n{input_data.architecture_ledger}\n\n"
    if input_data.feedback_prompt:
        content = f"<human_feedback>\n{input_data.feedback_prompt}\n</human_feedback>\n\n{content}"
    cfg = trace_context.langchain_config("dev_agent") if trace_context else None
    resp = await llm.ainvoke([SystemMessage(content=SYSTEM_PROMPT), HumanMessage(content=content)],
                              **({"config": cfg} if cfg else {}))
    p = _parse(resp.content)
    files = [ChangedFile(**f) if isinstance(f, dict) else f for f in p.get("changed_files", [])]
    return DEVAgentOutput(architecture_ledger_update=p.get("architecture_ledger_update",""),
                          implementation_plan=p.get("implementation_plan",""),
                          mock_code_diff=p.get("mock_code_diff",""), changed_files=files,
                          risk_assessment=p.get("risk_assessment",""), risk_level=p.get("risk_level","LOW"),
                          sandbox_report=p.get("sandbox_report",""), patch_branch=p.get("patch_branch",""),
                          patch_commit=p.get("patch_commit",""),
                          summary=p.get("summary","DEV Agent completed"))

async def stream_dev_agent(input_data: DEVAgentInput, model_config=None, trace_context=None):
    from src.tools.sandbox import run_sandbox_test
    
    llm = _get_llm(model_config)
    cfg = trace_context.langchain_config("dev_agent") if trace_context else None

    # Base content
    base_content = f"PRD:\n{input_data.prd}\n\nUX Spec:\n{input_data.ux_spec}\n"
    if input_data.architecture_ledger:
        base_content += f"\nArchitecture Ledger:\n{input_data.architecture_ledger}\n"
    if input_data.feedback_prompt:
        base_content = f"<human_feedback>\n{input_data.feedback_prompt}\n</human_feedback>\n\n{base_content}"
        
    retries = 0
    max_retries = 2
    
    while retries <= max_retries:
        content = base_content
        if retries > 0:
            yield {"event": "progress", "data": {"step": "sandbox_gate", "token": f"\n\n🔄 Sandbox execution failed. Retrying (Attempt {retries}/{max_retries})...\n\n"}}
            
        msgs = [SystemMessage(content=SYSTEM_PROMPT), HumanMessage(content=content)]
        full, tin, tout = "", 0, 0
        
        if hasattr(llm, "astream_events"):
            async for ev in llm.astream_events(msgs, version="v2", **({"config": cfg} if cfg else {})):
                if ev["event"] == "on_chat_model_stream" and ev["data"]["chunk"].content:
                    full += ev["data"]["chunk"].content
                    yield {"event":"progress","data":{"step":"dev_agent","token":ev["data"]["chunk"].content}}
                elif ev["event"] == "on_chat_model_end":
                    u = getattr(ev["data"].get("output"),"usage_metadata",None)
                    if u: tin += u.get("input_tokens",0); tout += u.get("output_tokens",0)
        else:
            async for chunk in llm.astream(msgs):
                if chunk.content: full += chunk.content; yield {"event":"progress","data":{"step":"dev_agent","token":chunk.content}}
        
        parsed = _parse(full)
        
        report = run_sandbox_test(
            parsed.get("implementation_plan", ""),
            parsed.get("mock_code_diff", ""),
            session_id=getattr(trace_context, "session_id", None),
        )
        parsed["sandbox_report"] = report.get("report", "")
        if report.get("patch_branch"):
            parsed["patch_branch"] = report["patch_branch"]
        if report.get("patch_commit"):
            parsed["patch_commit"] = report["patch_commit"]
        
        if report["success"]:
            yield {"event": "progress", "data": {"step": "sandbox_gate", "token": f"\n\n{report['report']}\n"}}
            yield {"event":"completed","data":{**parsed,"token_usage":{"input":tin,"output":tout}}}
            return
            
        # Sandbox failed
        yield {"event": "progress", "data": {"step": "sandbox_gate", "token": f"\n\n{report['report']}\n"}}
        base_content += f"\n\n[SYSTEM] Sandbox execution failed. Error:\n{report['report']}\nPlease fix your unified git diff."
        retries += 1
        
    # If we reached here, max retries exceeded
    yield {"event": "progress", "data": {"step": "sandbox_gate", "token": f"\n\n⚠️ Max retries ({max_retries}) reached. Sandbox still failing. Proceeding to QA Gate for manual review.\n"}}
    yield {"event":"completed","data":{**parsed,"token_usage":{"input":tin,"output":tout}}}
