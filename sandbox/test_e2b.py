import os
from dotenv import load_dotenv

# Load env vars (e.g. E2B_API_KEY, OPENAI_API_KEY)
load_dotenv(os.path.join(os.path.dirname(__file__), '..', 'backend', '.env'))

from e2b_runtime import E2BRuntime

def main():
    print("🚀 Bắt đầu test luồng E2B Sandbox v3...")
    
    handoff = {
        "prd_context": "Feature: Add a simple calculator function that adds two numbers. It should be in src/calc.js and export the add function.",
        "ux_spec": "No UI required. Just the JS logic.",
        "test_cases": [],
        "quality_gate_status": "",
        "risk_level": "LOW"
    }

    runtime = E2BRuntime()
    result = runtime.execute_dev_agent(handoff)
    
    print("\n✅ Kết quả trả về từ Sandbox:\n")
    import json
    print(json.dumps(result, indent=2, ensure_ascii=False))

if __name__ == "__main__":
    main()
