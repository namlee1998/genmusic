"""
LangGraph workflow — Main Pipeline
Original: Agent 1 → Agent 2 → Agent 3  (testcase generation)
AIDLC:    PO Agent → UX Agent → DEV Agent → QA Agent → Quality Gate  (SDLC automation)
Both pipelines share the same graph; node_target selects which to run.

Quality Gate:
  - Runs after QA Agent
  - Classifies task complexity (small/medium/large)
  - Evaluates test coverage against hard rules
  - Attaches gate_evaluation to qa_result
"""

from __future__ import annotations

import json
import logging
from typing import Any, TypedDict

from langgraph.graph import END, StateGraph

from src.agents.po_agent import run_po_agent, stream_po_agent
from src.agents.intent_agent import run_intent_agent, stream_intent_agent
from src.agents.ux_agent import run_ux_agent, stream_ux_agent
from src.agents.dev_agent import run_dev_agent, stream_dev_agent
from src.agents.qa_agent import run_qa_agent, stream_qa_agent

from src.schemas.aidlc import (
    IntentAgentInput,
    POAgentInput, FeatureRequest, ProjectContext,
    UXAgentInput, DEVAgentInput, QAAgentInput,
)
from src.quality_gate.evaluator import evaluate_quality_gate

logger = logging.getLogger(__name__)


# =============================================================================
# Graph State
# =============================================================================

class PipelineState(TypedDict, total=False):
    """State shared across all nodes."""
    session_id: str
    node_target: str
    context: dict
    # Original agents
    agent_1_result: dict | None
    agent_1_error: str | None
    agent_2_result: dict | None
    agent_2_error: str | None
    agent_3_result: dict | None
    agent_3_error: str | None
    # AIDLC agents
    intent_result: dict | None
    intent_error: str | None
    po_result: dict | None
    po_error: str | None
    ux_result: dict | None
    ux_error: str | None
    dev_result: dict | None
    dev_error: str | None
    dev_retries: int
    sandbox_report: str | None
    qa_result: dict | None
    qa_error: str | None
    # Quality Gate
    gate_evaluation: dict | None   # QualityGateResult.to_dict()
    gate_error: str | None
    # Shared
    final_output: dict | None
    error: str | None


# =============================================================================
# Utility Functions
# =============================================================================

def determine_fix_target(feedback: str) -> str:
    """Analyze feedback keyword to route to the correct agent for targeted rework."""
    import re
    f = feedback.lower()
    explicit = {
        "po": ["po", "product owner", "prd", "requirement", "requirements", "acceptance criteria", "user story", "user stories", "scope"],
        "ux": ["ux", "ui", "design", "wireframe", "user flow", "screen", "layout", "mockup", "figma"],
        "dev": ["dev", "code", "implement", "css", "api", "backend", "frontend", "auth", "migration", "timeout", "performance", "service"],
        "qa": ["qa", "test", "tests", "quality", "coverage", "test case", "test cases", "qa report", "retest"],
    }

    # Known demo bugs point at the agent that owns the root cause
    if "bug-001" in f: return "ux_agent"
    if "bug-002" in f: return "dev_agent"

    def has_phrase(words):
        return any(w in f for w in words)

    def has_word(words):
        return any(re.search(r'\b' + re.escape(w) + r'\b', f) for w in words)

    if has_phrase(explicit["po"]): return "po_agent"
    if has_phrase(explicit["ux"]): return "ux_agent"
    if has_phrase(explicit["dev"]): return "dev_agent"
    if has_word(explicit["qa"]) or "tc-" in f: return "qa_agent"

    # Default fallback for generic bugs
    if has_word(["bug", "blocker", "fail", "failed", "error", "issue"]): return "qa_agent"
    return "dev_agent" # Default to DEV for generic code fixes


# =============================================================================
# AIDLC Node Functions
# =============================================================================

async def node_intent_agent(state: PipelineState) -> dict:
    """Run Intent Agent: Generates AI Assumptions."""
    try:
        ctx = state.get("context", {})
        fr_data = ctx.get("feature_request", {})
        input_data = IntentAgentInput(
            feature_request=FeatureRequest(**fr_data) if isinstance(fr_data, dict) else fr_data,
            feedback_prompt=ctx.get("feedback_prompt", ""),
        )
        result = await run_intent_agent(input_data)
        return {"intent_result": result.model_dump(), "intent_error": None}
    except Exception as e:
        return {"intent_result": None, "intent_error": str(e)}

async def node_po_agent(state: PipelineState) -> dict:
    """Run PO Agent: PRD + User Stories + AC."""
    try:
        ctx = state.get("context", {})
        pc_data = ctx.get("project_context", {})
        
        # In Option C, PO Agent reads intent assumptions from the context
        # (specifically, the user approved intent_assumptions)
        intent_assumptions = ""
        for art in ctx.get("intent_assumptions", []):
            if isinstance(art, dict) and "content" in art:
                intent_assumptions += art["content"] + "\n\n"
        
        # We also need the original FeatureRequest to instantiate POAgentInput properly,
        # or we might just pass the FeatureRequest inside intent assumptions.
        # But POAgentInput expects feature_request. Since we don't have the original
        # request stored easily in the downstream task input (the task has intent_assumptions),
        # Let's mock a feature request containing the intent assumptions as the description.
        # This makes sense because the user Approved the AI Assumptions as the actual requirement!
        fr = FeatureRequest(
            title=ctx.get("title", "Feature Request from AI Assumptions"),
            description=intent_assumptions,
            priority="High",
            target_user="See Intent Assumptions",
            business_goal="See Intent Assumptions"
        )
        
        input_data = POAgentInput(
            feature_request=fr,
            project_context=ProjectContext(**pc_data) if isinstance(pc_data, dict) else ProjectContext(),
            feedback_prompt=ctx.get("feedback_prompt", ""),
        )
        result = await run_po_agent(input_data)
        return {"po_result": result.model_dump(), "po_error": None}
    except Exception as e:
        return {"po_result": None, "po_error": str(e)}


async def node_ux_agent(state: PipelineState) -> dict:
    """Run UX Agent: UX Spec + User Flow + Wireframe."""
    try:
        ctx = state.get("context", {})
        input_data = UXAgentInput(
            prd=ctx.get("prd", ""),
            acceptance_criteria=ctx.get("acceptance_criteria", []),
            feedback_prompt=ctx.get("feedback_prompt", ""),
        )
        result = await run_ux_agent(input_data)
        return {"ux_result": result.model_dump(), "ux_error": None}
    except Exception as e:
        return {"ux_result": None, "ux_error": str(e)}


async def node_dev_agent(state: PipelineState) -> dict:
    """Run DEV Agent: Implementation Plan + Code Diff + Risk."""
    try:
        ctx = state.get("context", {})
        pc_data = ctx.get("project_context", {})
        
        # If we are in a rework loop, append the sandbox report to the feedback prompt
        fp = ctx.get("feedback_prompt", "")
        if state.get("sandbox_report"):
            fp += f"\n\n[SYSTEM] Sandbox execution failed. Please fix the code. Error:\n{state.get('sandbox_report')}"
            
        input_data = DEVAgentInput(
            prd=ctx.get("prd", ""),
            ux_spec=ctx.get("ux_spec", ""),
            user_flow=ctx.get("user_flow", ""),
            acceptance_criteria=ctx.get("acceptance_criteria", []),
            project_context=ProjectContext(**pc_data) if isinstance(pc_data, dict) else ProjectContext(),
            feedback_prompt=fp,
        )
        result = await run_dev_agent(input_data)
        
        retries = state.get("dev_retries", 0)
        
        return {
            "dev_result": result.model_dump(), 
            "dev_error": None,
            "dev_retries": retries
        }
    except Exception as e:
        return {"dev_result": None, "dev_error": str(e)}

async def node_sandbox_gate(state: PipelineState) -> dict:
    """Run Sandbox Gate (G3): Test DEV output."""
    from src.tools.sandbox import run_sandbox_test
    
    dev_res = state.get("dev_result")
    if not dev_res:
        return {"dev_error": "No DEV result to test"}
        
    report = run_sandbox_test(
        dev_res.get("implementation_plan", ""),
        dev_res.get("mock_code_diff", "")
    )
    
    if report["success"]:
        return {"sandbox_report": None} # Passed
    else:
        return {
            "sandbox_report": report["report"],
            "dev_retries": state.get("dev_retries", 0) + 1
        }

def route_dev_sandbox(state: PipelineState) -> str:
    """Route: if sandbox failed and retries < 2, go back to DEV."""
    if state.get("sandbox_report") and state.get("dev_retries", 0) < 2:
        return "dev_agent"
    return "END"


async def node_qa_agent(state: PipelineState) -> dict:
    """Run QA Agent: Test Cases + QA Report + Coverage Matrix."""
    try:
        ctx = state.get("context", {})
        input_data = QAAgentInput(
            prd=ctx.get("prd", ""),
            acceptance_criteria=ctx.get("acceptance_criteria", []),
            ux_spec=ctx.get("ux_spec", ""),
            implementation_plan=ctx.get("implementation_plan", ""),
            mock_code_diff=ctx.get("mock_code_diff", ""),
            sandbox_report=ctx.get("sandbox_report", ""),
            risk_assessment=ctx.get("risk_assessment", ""),
            risk_level=ctx.get("risk_level", "LOW"),
            feedback_prompt=ctx.get("feedback_prompt", ""),
        )
        result = await run_qa_agent(input_data)
        return {"qa_result": result.model_dump(), "qa_error": None}
    except Exception as e:
        return {"qa_result": None, "qa_error": str(e)}


async def node_quality_gate(state: PipelineState) -> dict:
    """
    Quality Gate Node — evaluates QA output against hard rules.

    Classifies task complexity (small/medium/large), runs async gate checks
    (security scan + static analysis for medium/large), and computes a score.
    The gate_evaluation is attached to the state for the backend to surface.
    """
    try:
        ctx = state.get("context", {})
        qa_result = state.get("qa_result") or {}
        dev_result = state.get("dev_result") or {}

        feature_title = ctx.get("title", ctx.get("feature_title", ""))
        feature_description = ctx.get("feature_description", ctx.get("prd", "")[:500])

        gate_result = await evaluate_quality_gate(
            feature_title=feature_title,
            feature_description=feature_description,
            acceptance_criteria=ctx.get("acceptance_criteria", []),
            test_cases=qa_result.get("test_cases", []),
            ac_coverage_matrix=qa_result.get("ac_coverage_matrix", []),
            blocker_count=qa_result.get("blocker_count", 0),
            risk_level=ctx.get("risk_level", dev_result.get("risk_level", "LOW")),
            mock_code_diff=dev_result.get("mock_code_diff", ctx.get("mock_code_diff", "")),
            implementation_plan=dev_result.get("implementation_plan", ctx.get("implementation_plan", "")),
        )

        logger.info(
            f"[QualityGate] complexity={gate_result.complexity} "
            f"score={gate_result.score} recommendation={gate_result.recommendation}"
        )

        return {
            "gate_evaluation": gate_result.to_dict(),
            "gate_error": None,
        }
    except Exception as e:
        logger.error(f"[QualityGate] Evaluation failed: {e}")
        return {
            "gate_evaluation": None,
            "gate_error": str(e),
        }


# =============================================================================
# Router
# =============================================================================

def route_target(state: PipelineState) -> str:
    target = state.get("node_target", "")
    
    # If this is a rework request (e.g. from HITL gate), auto-route based on feedback
    if target == "supervisor_rework":
        ctx = state.get("context", {})
        feedback = ctx.get("feedback_prompt", "")
        return determine_fix_target(feedback)

    mapping = {
        "intent_node": "intent_agent",
        "po_agent": "po_agent",
        "ux_agent": "ux_agent",
        "dev_agent": "dev_agent",
        "qa_agent": "qa_agent",
    }
    return mapping.get(target, "error")


# =============================================================================
# Build Graph
# =============================================================================

def build_graph():
    """Build and compile the unified LangGraph workflow.

    Pipeline:
      intent_agent → [END]
      po_agent     → [END]
      ux_agent     → [END]
      dev_agent    → sandbox_gate → (retry dev_agent | END)
      qa_agent     → quality_gate → [END]
    """
    workflow = StateGraph(PipelineState)

    # AIDLC SDLC pipeline nodes
    workflow.add_node("intent_agent", node_intent_agent)
    workflow.add_node("po_agent", node_po_agent)
    workflow.add_node("ux_agent", node_ux_agent)
    workflow.add_node("dev_agent", node_dev_agent)
    workflow.add_node("sandbox_gate", node_sandbox_gate)
    workflow.add_node("qa_agent", node_qa_agent)
    workflow.add_node("quality_gate", node_quality_gate)
    # Error node
    workflow.add_node("error_node", lambda state: {"error": f"Unknown node_target: {state.get('node_target')}"})

    workflow.set_conditional_entry_point(
        route_target,
        path_map={
            "intent_agent": "intent_agent",
            "po_agent": "po_agent",
            "ux_agent": "ux_agent",
            "dev_agent": "dev_agent",
            "qa_agent": "qa_agent",
            "error": "error_node",
        },
    )

    # Simple terminal nodes (no downstream processing needed)
    for node in ["intent_agent", "po_agent", "ux_agent", "error_node"]:
        workflow.add_edge(node, END)

    # DEV → Sandbox → (retry or END)
    workflow.add_edge("dev_agent", "sandbox_gate")
    workflow.add_conditional_edges(
        "sandbox_gate",
        route_dev_sandbox,
        {
            "dev_agent": "dev_agent",
            "END": END
        }
    )

    # QA → Quality Gate → END
    workflow.add_edge("qa_agent", "quality_gate")
    workflow.add_edge("quality_gate", END)

    return workflow.compile()


# Singleton graph instance
_graph = None


def get_graph():
    """Get or create the compiled graph (singleton)."""
    global _graph
    if _graph is None:
        _graph = build_graph()
    return _graph
