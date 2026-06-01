"""
Pydantic schemas for AIDLC agents (PO / UX / DEV / QA).
Extends the original schemas from A20-App-155.
"""

from __future__ import annotations
from typing import Any
from pydantic import BaseModel, Field

# Keep all original schemas
from src.schemas import (
    UXFlow, FlowUIContext, ErrorSignal,
    Agent1Input, Agent1Output,
    Agent2Input, Agent2Output, TestScenario, TestStep,
    Agent3Input, Agent3Output, AutomationFile,
    RunAgentRequest, StreamChunk,
)

# =============================================================================
# Feature Request (input to PO Agent)
# =============================================================================

class FeatureConstraint(BaseModel):
    text: str = Field(..., description="Constraint mô tả giới hạn kỹ thuật hoặc nghiệp vụ")

class FeatureRequest(BaseModel):
    id: str = Field(default="FR-001", description="Feature Request ID")
    title: str = Field(..., description="Tên tính năng ngắn gọn")
    description: str = Field(default="", description="Mô tả chi tiết tính năng")
    priority: str = Field(default="Medium", description="High / Medium / Low")
    target_user: str = Field(default="End user", description="Đối tượng sử dụng tính năng")
    business_goal: str = Field(default="", description="Mục tiêu kinh doanh")
    constraints: list[str] = Field(default_factory=list, description="Các ràng buộc kỹ thuật/sản phẩm")
    created_by: str = Field(default="human_user")
    status: str = Field(default="DRAFT")

class ProjectContext(BaseModel):
    project_id: str = Field(default="PRJ-001")
    project_name: str = Field(default="")
    tech_stack: dict[str, str] = Field(default_factory=dict, description="{'frontend': 'React', 'backend': 'FastAPI'}")
    existing_features: list[str] = Field(default_factory=list)
    constraints: list[str] = Field(default_factory=list)

# =============================================================================
# Intent Agent Output
# =============================================================================

class IntentAgentInput(BaseModel):
    feature_request: FeatureRequest
    feedback_prompt: str = Field(default="")

class IntentAgentOutput(BaseModel):
    intent_assumptions: str = Field(default="", description="AI Assumptions — markdown")
    clarifying_questions: list[str] = Field(default_factory=list)
    summary: str = Field(default="")

# =============================================================================
# PO Agent Output
# =============================================================================

class UserStory(BaseModel):
    id: str = Field(..., description="US-001")
    role: str = Field(..., description="As a [role]")
    want: str = Field(..., description="I want [action]")
    so_that: str = Field(..., description="So that [benefit]")
    acceptance_criteria: list[str] = Field(default_factory=list, description="Measurable AC list")

class POAgentInput(BaseModel):
    feature_request: FeatureRequest
    project_context: ProjectContext = Field(default_factory=ProjectContext)
    feedback_prompt: str = Field(default="")

class POAgentOutput(BaseModel):
    prd: str = Field(default="", description="Product Requirements Document — markdown")
    user_stories: list[UserStory] = Field(default_factory=list)
    acceptance_criteria: list[str] = Field(default_factory=list, description="Flat list of all ACs")
    scope: str = Field(default="", description="In-scope items — markdown")
    out_of_scope: str = Field(default="", description="Out-of-scope items — markdown")
    summary: str = Field(default="")

# =============================================================================
# UX Agent Output
# =============================================================================

class ScreenSpec(BaseModel):
    name: str
    purpose: str
    elements: list[str] = Field(default_factory=list)
    states: list[str] = Field(default_factory=list, description="loading/error/empty/success")

class UXAgentInput(BaseModel):
    prd: str = Field(default="")
    user_stories: list[UserStory] = Field(default_factory=list)
    acceptance_criteria: list[str] = Field(default_factory=list)
    feedback_prompt: str = Field(default="")

class UXAgentOutput(BaseModel):
    ux_spec: str = Field(default="", description="UX Spec — markdown")
    user_flow: str = Field(default="", description="User Flow diagram description — markdown")
    wireframe_spec: str = Field(default="", description="Wireframe description per screen — markdown")
    component_inventory: str = Field(default="", description="Component list — markdown")
    screens: list[ScreenSpec] = Field(default_factory=list)
    summary: str = Field(default="")

# =============================================================================
# DEV Agent Output
# =============================================================================

class ChangedFile(BaseModel):
    path: str
    reason: str
    change_type: str = Field(default="modify", description="add / modify / delete")

class DEVAgentInput(BaseModel):
    prd: str = Field(default="")
    ux_spec: str = Field(default="")
    user_flow: str = Field(default="")
    acceptance_criteria: list[str] = Field(default_factory=list)
    project_context: ProjectContext = Field(default_factory=ProjectContext)
    architecture_ledger: str = Field(default="", description="Lịch sử thay đổi hệ thống trước đây")
    feedback_prompt: str = Field(default="")

class DEVAgentOutput(BaseModel):
    architecture_ledger_update: str = Field(default="", description="Những thay đổi kiến trúc sau Story này")
    implementation_plan: str = Field(default="", description="Step-by-step plan — markdown")
    mock_code_diff: str = Field(default="", description="Unified git diff under the legacy field name")
    changed_files: list[ChangedFile] = Field(default_factory=list)
    risk_assessment: str = Field(default="", description="Risk level LOW/MEDIUM/HIGH + reasoning — markdown")
    risk_level: str = Field(default="LOW", description="LOW | MEDIUM | HIGH")
    sandbox_report: str = Field(default="")
    patch_branch: str = Field(default="")
    patch_commit: str = Field(default="")
    summary: str = Field(default="")

# =============================================================================
# QA Agent Output
# =============================================================================

class ACCoverageRow(BaseModel):
    ac: str
    test_case_ids: list[str]
    covered: bool

class QATestCase(BaseModel):
    id: str = Field(..., description="TC-001")
    source_ac: str = Field(default="", description="Acceptance Criterion this TC covers")
    title: str
    type: str = Field(default="functional", description="functional / ui / security / edge")
    priority: str = Field(default="Medium")
    precondition: str = Field(default="")
    steps: list[str] = Field(default_factory=list)
    expected_result: str = Field(default="")
    status: str = Field(default="Not Run")

class QAAgentInput(BaseModel):
    prd: str = Field(default="")
    acceptance_criteria: list[str] = Field(default_factory=list)
    ux_spec: str = Field(default="")
    implementation_plan: str = Field(default="")
    mock_code_diff: str = Field(default="")
    sandbox_report: str = Field(default="")
    risk_assessment: str = Field(default="")
    risk_level: str = Field(default="LOW")
    feedback_prompt: str = Field(default="")

class QAAgentOutput(BaseModel):
    test_cases: list[QATestCase] = Field(default_factory=list)
    qa_report: str = Field(default="", description="QA Report — markdown")
    ac_coverage_matrix: list[ACCoverageRow] = Field(default_factory=list)
    pass_count: int = Field(default=0)
    fail_count: int = Field(default=0)
    blocker_count: int = Field(default=0)
    release_recommendation: str = Field(default="HOLD", description="PASS / HOLD / REWORK")
    summary: str = Field(default="")


# =============================================================================
# Quality Gate Result (output of QualityGate evaluator)
# =============================================================================

class GateViolation(BaseModel):
    rule: str = Field(..., description="Rule name that was violated")
    expected: str = Field(..., description="Expected value / threshold")
    actual: str = Field(..., description="Actual value found")
    severity: str = Field(default="BLOCKER", description="BLOCKER | WARNING | INFO")


class GateCheck(BaseModel):
    check: str = Field(..., description="Check name (security_scan, static_analysis, fast_gate)")
    passed: bool
    issues: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    message: str = Field(default="")


class QualityGateMetrics(BaseModel):
    total_test_cases: int = Field(default=0)
    type_counts: dict[str, int] = Field(default_factory=dict)
    ac_coverage_pct: float = Field(default=0.0)
    blocker_count: int = Field(default=0)
    min_total_required: int = Field(default=0)
    min_happy_required: int = Field(default=0)
    min_negative_required: int = Field(default=0)
    min_edge_required: int = Field(default=0)
    min_security_required: int = Field(default=0)
    min_ac_coverage_required: float = Field(default=0.0)
    min_approvers_required: int = Field(default=1)


class QualityGateEvaluation(BaseModel):
    """Result of Quality Gate evaluation. Attached to QAAgentOutput after gate check."""
    complexity: str = Field(default="small", description="small | medium | large")
    gate_type: str = Field(default="FAST", description="FAST | ASYNC | STRICT")
    score: int = Field(default=0, description="Quality score 0-100")
    recommendation: str = Field(default="HOLD", description="PASS | HOLD | REWORK")
    violations: list[GateViolation] = Field(default_factory=list)
    metrics: QualityGateMetrics = Field(default_factory=QualityGateMetrics)
    gate_checks: list[GateCheck] = Field(default_factory=list)
    summary: str = Field(default="")
    passed: bool = Field(default=False)

# Re-export everything
__all__ = [
    # Original
    "UXFlow", "FlowUIContext", "ErrorSignal",
    "Agent1Input", "Agent1Output",
    "Agent2Input", "Agent2Output", "TestScenario", "TestStep",
    "Agent3Input", "Agent3Output", "AutomationFile",
    "RunAgentRequest", "StreamChunk",
    # AIDLC
    "FeatureRequest", "ProjectContext",
    "IntentAgentInput", "IntentAgentOutput",
    "POAgentInput", "POAgentOutput", "UserStory",
    "UXAgentInput", "UXAgentOutput", "ScreenSpec",
    "DEVAgentInput", "DEVAgentOutput", "ChangedFile",
    "QAAgentInput", "QAAgentOutput", "QATestCase", "ACCoverageRow",
    # Quality Gate
    "GateViolation", "GateCheck", "QualityGateMetrics", "QualityGateEvaluation",
]
