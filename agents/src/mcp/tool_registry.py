"""Resolve MCP tools while keeping workers independent from implementations."""
from __future__ import annotations

from src.mcp.mocks import confluence_mock, jira_mock, local_mock, penpot_mock, testrail_mock

TOOLS = {
    "confluence.read": confluence_mock.read_page,
    "confluence.write": confluence_mock.write_page,
    "docs.search": local_mock.docs_search,
    "repo.read": local_mock.repo_read,
    "penpot.upsert": penpot_mock.upsert_design,
    "penpot.export": penpot_mock.export_preview,
    "github.read": local_mock.github_read,
    "github.write": local_mock.github_write,
    "jira.read": jira_mock.read_issue,
    "jira.write": jira_mock.write_issue,
    "testrail.write": testrail_mock.write_test_run,
    "test.run": local_mock.test_run,
    "scanner.run": local_mock.scanner_run,
}


def get_tool(tool_name: str):
    if tool_name not in TOOLS:
        raise KeyError(f"MCP tool is not registered: {tool_name}")
    return TOOLS[tool_name]
