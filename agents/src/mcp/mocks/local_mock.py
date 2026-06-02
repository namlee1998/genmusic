"""Credential-free local implementations for MVP MCP boundaries."""
from __future__ import annotations

from typing import Any


def docs_search(payload: dict[str, Any]) -> dict[str, Any]:
    return {"source": "docs-mock", "status": "searched-locally", "query": payload.get("query", ""), "results": []}


def repo_read(payload: dict[str, Any]) -> dict[str, Any]:
    return {"source": "repo-mock", "status": "read-locally", "path": payload.get("path", "")}


def github_read(payload: dict[str, Any]) -> dict[str, Any]:
    return {"source": "github-mock", "status": "read-locally", "ref": payload.get("ref", "")}


def github_write(payload: dict[str, Any]) -> dict[str, Any]:
    return {"source": "github-mock", "status": "stored-locally", "path": payload.get("path", "")}


def test_run(payload: dict[str, Any]) -> dict[str, Any]:
    return {"source": "test-mock", "status": "passed-locally", "command": payload.get("command", "")}


def scanner_run(payload: dict[str, Any]) -> dict[str, Any]:
    return {"source": "scanner-mock", "status": "passed-locally", "issues": []}
