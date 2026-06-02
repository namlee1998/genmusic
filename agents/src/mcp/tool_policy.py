"""Hard allow-list for tools exposed to each worker."""

WORKER_TOOLS = {
    "PO": {"confluence.read", "confluence.write", "docs.search", "repo.read"},
    "UX": {"penpot.upsert", "penpot.export", "docs.search"},
    "DEV": {"github.read", "github.write"},
    "QA": {"jira.read", "jira.write", "testrail.write", "test.run", "scanner.run"},
}


def require_allowed(worker: str, tool_name: str) -> None:
    if tool_name not in WORKER_TOOLS.get(worker.upper(), set()):
        raise PermissionError(f"{worker} is not allowed to call MCP tool: {tool_name}")
