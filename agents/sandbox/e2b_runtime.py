import os
import json
from e2b_code_interpreter import Sandbox

class E2BRuntime:
    def __init__(self, template_id="base"):
        # `template_id` can be custom docker image built on E2B
        self.template_id = template_id

    def execute_dev_agent(self, context_data: dict) -> dict:
        """
        Creates an E2B Sandbox, uploads the context and run_dev.py script,
        executes the Dev Agent inside the sandbox, and returns the result.
        """
        print(f"[E2B Runtime] Starting sandbox with template: {self.template_id}")
        
        # Load run_dev.py content
        current_dir = os.path.dirname(os.path.abspath(__file__))
        run_dev_path = os.path.join(current_dir, "run_dev.py")
        
        with open(run_dev_path, "r") as f:
            run_dev_script = f.read()
            
        with Sandbox(template=self.template_id) as sandbox:
            print("[E2B Runtime] Sandbox started.")
            
            # Upload context and script
            sandbox.files.write("/app/context.json", json.dumps(context_data))
            sandbox.files.write("/app/run_dev.py", run_dev_script)
            
            print("[E2B Runtime] Running Dev Agent inside Sandbox...")
            
            # Note: The Sandbox needs ANTHROPIC_API_KEY injected to run SDK
            anthropic_key = os.environ.get("ANTHROPIC_API_KEY", "")
            
            execution = sandbox.commands.run(
                "python3 /app/run_dev.py",
                envs={"ANTHROPIC_API_KEY": anthropic_key}
            )
            
            print(f"[E2B Runtime] Execution finished. Exit code: {execution.exit_code}")
            
            if execution.error:
                print(f"[E2B Runtime] Error: {execution.error}")
                
            # Attempt to read result file
            try:
                result_str = sandbox.files.read("/app/output.json")
                return json.loads(result_str)
            except Exception as e:
                return {
                    "error": str(e),
                    "stdout": execution.stdout,
                    "stderr": execution.stderr
                }
