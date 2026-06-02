"""Minimal audited MCP client used by local stubs and future real adapters."""
from __future__ import annotations

from collections.abc import Callable
from typing import Any

from src.mcp.tool_policy import require_allowed
from src.mcp.tool_registry import get_tool


def call_tool(worker: str, tool_name: str, payload: dict[str, Any], audit: Callable | None = None):
    require_allowed(worker, tool_name)
    if audit:
        audit("tool_call", {"worker": worker, "tool": tool_name, "payload": payload})
    result = get_tool(tool_name)(payload)
    if audit:
        audit("tool_result", {"worker": worker, "tool": tool_name, "result": result})
    return result
