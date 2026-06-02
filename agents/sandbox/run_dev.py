"""Run Claude Agent SDK inside the ephemeral E2B sandbox."""
from __future__ import annotations

import asyncio
import json
from pathlib import Path
from typing import Any

from claude_agent_sdk import ClaudeAgentOptions, query

PROJECT_DIR = Path("/app/project")
CONTEXT_PATH = Path("/app/context.json")
OUTPUT_PATH = Path("/app/output.json")


def _serialize_message(message: Any) -> dict[str, Any]:
    if hasattr(message, "model_dump"):
        return message.model_dump(mode="json")
    if hasattr(message, "__dict__"):
        return {key: str(value) for key, value in vars(message).items()}
    return {"message": str(message)}


def _build_prompt(context: dict[str, Any]) -> str:
    return f"""Implement the requested feature inside {PROJECT_DIR}.

Read the existing repository before editing. Make the smallest safe change,
run relevant tests, and leave the working tree with the implementation applied.

PRD:
{context.get("prd_context", "")}

UX specification:
{context.get("ux_spec", "")}

Return a concise implementation summary, changed files, test results, and risk assessment.
"""


async def main() -> None:
    context = json.loads(CONTEXT_PATH.read_text(encoding="utf-8"))
    PROJECT_DIR.mkdir(parents=True, exist_ok=True)
    options = ClaudeAgentOptions(
        system_prompt="You are a senior engineer working inside an isolated E2B sandbox.",
        permission_mode="acceptEdits",
        cwd=str(PROJECT_DIR),
        allowed_tools=["Read", "Write", "Bash", "Grep", "Glob"],
    )

    messages: list[dict[str, Any]] = []
    async for message in query(prompt=_build_prompt(context), options=options):
        payload = _serialize_message(message)
        messages.append(payload)
        print(json.dumps({"type": "sdk_message", "payload": payload}), flush=True)

    OUTPUT_PATH.write_text(
        json.dumps(
            {
                "implementation_plan": "Claude Agent SDK completed implementation in E2B.",
                "changed_files": [],
                "mock_code_diff": "",
                "risk_assessment": "Review SDK transcript and sandbox test output.",
                "risk_level": "MEDIUM",
                "sandbox_report": "Claude Agent SDK session completed successfully.",
                "sdk_messages": messages,
                "summary": "DEV Agent completed via Claude Agent SDK inside E2B.",
            },
            ensure_ascii=True,
        ),
        encoding="utf-8",
    )


if __name__ == "__main__":
    asyncio.run(main())
