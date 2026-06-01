import os
import json
import subprocess

def run_in_sandbox():
    print("[Sandbox] Reading context...")
    with open("/app/context.json", "r") as f:
        context = json.load(f)
        
    prd = context.get("prd_context", "")
    ux_spec = context.get("ux_spec", "")
    
    print("[Sandbox] Initializing Claude Dev SDK...")
    # This is a mock implementation representing Claude SDK.
    # In a real scenario, this would use anthropic / langchain to generate code.
    
    # 1. Generate Code (Mock)
    code_content = f"// Generated code based on PRD: {prd[:10]}...\nconsole.log('Hello World');"
    
    with open("/app/index.js", "w") as f:
        f.write(code_content)
        
    # 2. Generate Tests (Mock)
    test_content = "const assert = require('assert');\nassert.strictEqual(1, 1);"
    with open("/app/test.js", "w") as f:
        f.write(test_content)
        
    # 3. Run tests using subprocess
    print("[Sandbox] Running tests...")
    try:
        result = subprocess.run(["node", "/app/test.js"], capture_output=True, text=True, check=True)
        test_status = "PASS"
        test_output = result.stdout
    except subprocess.CalledProcessError as e:
        test_status = "FAIL"
        test_output = e.stderr

    # 4. Write Output
    output_data = {
        "sandbox_report": f"Test Execution: {test_status}\nOutput:\n{test_output}",
        "changed_files": [
            {"path": "/app/index.js", "reason": "Implementation", "change_type": "modify"}
        ],
        "mock_code_diff": "+ console.log('Hello World');"
    }
    
    with open("/app/output.json", "w") as f:
        json.dump(output_data, f)
        
    print("[Sandbox] Dev Execution Completed Successfully.")

if __name__ == "__main__":
    run_in_sandbox()
