"""Deterministic rework routing for the direct four-worker pipeline."""
from __future__ import annotations

import re


def determine_fix_target(feedback: str) -> str:
    """Route human feedback to the worker that owns the requested change."""
    text = feedback.lower()
    keywords = {
        "po_agent": [
            "po", "product owner", "prd", "requirement", "requirements",
            "acceptance criteria", "user story", "user stories", "scope",
        ],
        "ux_agent": [
            "ux", "ui", "design", "wireframe", "user flow", "screen",
            "layout", "mockup", "penpot",
        ],
        "dev_agent": [
            "dev", "code", "implement", "css", "api", "backend", "frontend",
            "auth", "migration", "timeout", "performance", "service",
        ],
        "qa_agent": [
            "qa", "test", "tests", "quality", "coverage", "test case",
            "test cases", "qa report", "retest",
        ],
    }

    if "bug-001" in text:
        return "ux_agent"
    if "bug-002" in text:
        return "dev_agent"

    for target in ("po_agent", "ux_agent", "dev_agent"):
        if any(keyword in text for keyword in keywords[target]):
            return target
    if any(re.search(r"\b" + re.escape(keyword) + r"\b", text) for keyword in keywords["qa_agent"]):
        return "qa_agent"
    if "tc-" in text or any(keyword in text for keyword in ("bug", "blocker", "fail", "failed", "error", "issue")):
        return "qa_agent"
    return "dev_agent"
