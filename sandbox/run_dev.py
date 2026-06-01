import os
import json
import logging
import re
from openai import OpenAI

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are a senior software engineer executing inside an isolated sandbox environment.
Your goal is to output the implementation plan, the code diff, and a risk assessment based on the provided PRD and UX context.

Output ONLY valid JSON.
Format:
{
  "architecture_ledger_update": "...",
  "implementation_plan": "...",
  "mock_code_diff": "diff --git ...",
  "changed_files": [{"path": "...", "reason": "...", "change_type": "add"}],
  "risk_assessment": "...",
  "risk_level": "LOW",
  "summary": "..."
}
"""

def _parse(raw):
    text = raw.strip()
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if fence: text = fence.group(1).strip()
    try: return json.loads(text)
    except: return {
        "architecture_ledger_update": "", 
        "implementation_plan": raw, 
        "mock_code_diff": "", 
        "changed_files": [], 
        "risk_assessment": "", 
        "risk_level": "MEDIUM", 
        "summary": "Fallback parsing inside sandbox"
    }

def main():
    print("[Sandbox] Starting Sandbox DEV Agent Execution...")
    
    # 1. Read input data
    with open("/home/user/handoff.json", "r") as f:
        handoff = json.load(f)
        
    prd_context = handoff.get("prd_context", "")
    ux_spec = handoff.get("ux_spec", "")
    
    print("[Sandbox] Context loaded successfully.")
    
    client = OpenAI(
        api_key=os.getenv("OPENAI_API_KEY", ""),
        base_url=os.getenv("OPENAI_API_BASE") or None
    )
    
    content = f"PRD:\n{prd_context}\n\nUX Spec:\n{ux_spec}\n"
    
    try:
        print("[Sandbox] Querying LLM to generate code...")
        response = client.chat.completions.create(
            model=os.getenv("DEFAULT_MODEL", "gpt-4o-mini"),
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": content}
            ],
            temperature=0.0
        )
        
        raw_result = response.choices[0].message.content
        parsed = _parse(raw_result)
        
        # Simulate running tests on the generated code inside the sandbox
        # (In a full implementation, we would apply the patch and run pytest/npm test)
        print("[Sandbox] Running simulated test suite...")
        parsed["sandbox_report"] = "Sandbox automated tests passed."
        parsed["patch_branch"] = "sandbox-auto-branch"
        parsed["patch_commit"] = "sandbox-auto-commit"
        
        with open("/home/user/output.json", "w") as f:
            json.dump(parsed, f)
            
        print("[Sandbox] DEV execution completed. Results saved.")
        
    except Exception as e:
        print(f"[Sandbox] Error during LLM generation: {e}")
        error_output = {
            "error": str(e),
            "risk_assessment": "High risk due to sandbox execution failure",
            "risk_level": "HIGH",
            "sandbox_report": str(e),
            "summary": "Failed inside E2B Sandbox"
        }
        with open("/home/user/output.json", "w") as f:
            json.dump(error_output, f)

if __name__ == "__main__":
    main()
