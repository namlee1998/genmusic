import os
import json
import logging
from e2b_code_interpreter import Sandbox

logger = logging.getLogger(__name__)

class E2BRuntime:
    def __init__(self, template="ubuntu"):
        self.template = template
        self.api_key = os.getenv("E2B_API_KEY")

    def execute_dev_agent(self, a2a_handoff: dict) -> dict:
        if not self.api_key:
            return {"error": "E2B_API_KEY is not set. Sandbox cannot start."}
            
        try:
            with Sandbox.create() as sandbox:
                # 1. Upload handoff data
                sandbox.files.write("/home/user/handoff.json", json.dumps(a2a_handoff))
                
                # 2. Upload the internal dev agent script
                current_dir = os.path.dirname(os.path.abspath(__file__))
                run_dev_path = os.path.join(current_dir, "run_dev.py")
                with open(run_dev_path, "r") as f:
                    sandbox.files.write("/home/user/run_dev.py", f.read())
                    
                # 3. Pass API keys to sandbox via env
                env = {
                    "OPENAI_API_KEY": os.getenv("OPENAI_API_KEY", ""),
                    "ANTHROPIC_API_KEY": os.getenv("ANTHROPIC_API_KEY", ""),
                    "DEFAULT_MODEL": os.getenv("DEFAULT_MODEL", "gpt-4o-mini")
                }
                
                # 4. Install dependencies and Run the DEV agent inside sandbox
                print("🚀 Installing dependencies in E2B Sandbox...")
                sandbox.commands.run("pip install openai")
                
                print("🚀 Running Dev Agent inside E2B Sandbox...")
                result = sandbox.commands.run(
                    "python /home/user/run_dev.py",
                    envs=env,
                    timeout=300 # 5 mins max
                )
                
                if result.error:
                    print(f"Sandbox error: {result.error}")
                    return {"error": result.error, "sandbox_report": result.stdout}
                
                # 5. Read outputs
                try:
                    output_json = sandbox.files.read("/home/user/output.json")
                    parsed_output = json.loads(output_json)
                    return parsed_output
                except Exception as read_err:
                    return {
                        "error": f"Failed to read output.json from sandbox: {read_err}",
                        "sandbox_report": result.stdout
                    }
                    
        except Exception as e:
            return {"error": str(e)}
