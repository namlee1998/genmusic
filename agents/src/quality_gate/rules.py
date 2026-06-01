"""
Quality Gate Rule Definitions
==============================
Bộ luật cứng cho hệ thống kiểm duyệt chất lượng theo độ phức tạp task.

Task Complexity:
  - SMALL  : ≤3 AC, không có domain nhạy cảm (login đơn giản, display, view)
  - MEDIUM : 4-8 AC, hoặc có domain nhạy cảm (auth, payment, security, multi-step)
  - LARGE  : >8 AC hoặc integration/migration (dùng cùng rule với MEDIUM nhưng ngưỡng cao hơn)
"""

from __future__ import annotations
import re
from typing import Literal

# =============================================================================
# Bộ rule cứng — không thay đổi mà không có approval từ QA Lead
# =============================================================================

QUALITY_GATE_RULES: dict[str, dict] = {

    # -------------------------------------------------------------------------
    # SMALL TASK  (VD: Login page, simple form, display list)
    # Gate type FAST: auto-approve nếu pass tất cả threshold cơ bản
    # -------------------------------------------------------------------------
    "small": {
        "complexity": "small",
        "description": "Simple task (≤3 AC, no sensitive domain). Fast gate — auto-approve on pass.",

        # Số lượng test case tối thiểu
        "min_total_test_cases": 3,

        # Phân loại bắt buộc
        "min_happy_cases": 1,        # Ít nhất 1 Happy Path
        "min_negative_cases": 1,     # Ít nhất 1 Negative (lỗi nhập liệu, invalid)
        "min_edge_cases": 0,         # Edge case không bắt buộc với small task
        "min_security_cases": 0,     # Security không bắt buộc với small task

        # AC Coverage
        "min_ac_coverage_pct": 80,   # Tối thiểu 80% AC được cover

        # Lỗi nghiêm trọng
        "max_blockers": 0,           # Không được có blocker nào

        # Risk level
        "allowed_risk_levels": ["LOW", "MEDIUM"],
        "max_risk_level": "MEDIUM",  # High risk → escalate to MEDIUM rules

        # Gate behavior
        "gate_type": "FAST",                 # Không cần async wait
        "simulate_delay_seconds": 0,         # Không delay
        "require_security_scan": False,      # Không cần security scan
        "require_static_analysis": False,    # Không cần static analysis
        "min_approvers": 1,                  # 1 người approve là đủ

        # Score thresholds
        "passing_score": 70,         # Score tối thiểu để PASS
        "hold_score": 50,            # Score này → HOLD (cần review thêm)
        # < hold_score → REWORK
    },

    # -------------------------------------------------------------------------
    # MEDIUM TASK  (VD: User auth flow, multi-step form, API integration)
    # Gate type ASYNC: mô phỏng security check + static analysis
    # -------------------------------------------------------------------------
    "medium": {
        "complexity": "medium",
        "description": "Medium task (4-8 AC or sensitive domain). Async gate — waits for security & static analysis.",

        # Số lượng test case tối thiểu
        "min_total_test_cases": 8,

        # Phân loại bắt buộc
        "min_happy_cases": 2,        # Ít nhất 2 Happy Path (main flow + alt flow)
        "min_negative_cases": 3,     # Ít nhất 3 Negative (empty, invalid format, boundary)
        "min_edge_cases": 2,         # Ít nhất 2 Edge case (boundary, concurrent state)
        "min_security_cases": 1,     # Ít nhất 1 Security/auth test

        # AC Coverage
        "min_ac_coverage_pct": 90,   # Tối thiểu 90% AC được cover

        # Lỗi nghiêm trọng
        "max_blockers": 0,

        # Risk level
        "allowed_risk_levels": ["LOW", "MEDIUM", "HIGH"],
        "max_risk_level": "HIGH",

        # Gate behavior — Mô phỏng async security + static analysis
        "gate_type": "ASYNC",
        "simulate_delay_seconds": 30,        # Mô phỏng 30s delay (security scan)
        "require_security_scan": True,       # Bắt buộc security scan
        "require_static_analysis": True,     # Bắt buộc static analysis
        "min_approvers": 2,                  # Yêu cầu 2 reviewers

        # Score thresholds
        "passing_score": 80,
        "hold_score": 65,
    },

    # -------------------------------------------------------------------------
    # LARGE TASK  (VD: Payment gateway, OAuth, data migration)
    # Gate type STRICT: yêu cầu full coverage + security + performance tests
    # -------------------------------------------------------------------------
    "large": {
        "complexity": "large",
        "description": "Large task (>8 AC or integration/payment/migration). Strict gate — full review required.",

        "min_total_test_cases": 15,
        "min_happy_cases": 3,
        "min_negative_cases": 5,
        "min_edge_cases": 4,
        "min_security_cases": 3,

        "min_ac_coverage_pct": 95,

        "max_blockers": 0,

        "allowed_risk_levels": ["LOW", "MEDIUM", "HIGH"],
        "max_risk_level": "HIGH",

        # Gate behavior
        "gate_type": "STRICT",
        "simulate_delay_seconds": 60,
        "require_security_scan": True,
        "require_static_analysis": True,
        "min_approvers": 3,

        "passing_score": 90,
        "hold_score": 75,
    },
}


# =============================================================================
# Keyword classifiers
# =============================================================================

# Domain nhạy cảm → tự động escalate lên MEDIUM dù số AC ít
_SENSITIVE_DOMAIN_KEYWORDS = [
    "auth", "authentication", "authorization", "oauth", "sso", "jwt",
    "login", "logout", "password", "credential", "token",
    "payment", "checkout", "billing", "invoice", "subscription", "stripe",
    "security", "encryption", "hash", "role", "permission", "rbac",
    "migration", "database", "import", "export", "sync",
    "webhook", "integration", "api gateway", "third.party",
    "pii", "gdpr", "personal data", "sensitive",
    "2fa", "mfa", "otp",
]

# Keywords chỉ ra task lớn
_LARGE_TASK_KEYWORDS = [
    "payment gateway", "oauth", "data migration", "full integration",
    "multi.tenant", "performance", "load test", "stress test",
]

# Keywords của small task
_SIMPLE_KEYWORDS = [
    "display", "view", "list", "read.only", "static page", "landing",
    "tooltip", "badge", "icon", "label",
]


def classify_task_complexity(
    feature_title: str,
    feature_description: str,
    acceptance_criteria: list[str],
    risk_level: str = "LOW",
) -> Literal["small", "medium", "large"]:
    """
    Phân loại độ phức tạp của task dựa trên AC count + domain keywords.

    Returns: "small" | "medium" | "large"
    """
    combined_text = f"{feature_title} {feature_description}".lower()
    ac_count = len(acceptance_criteria)

    # Kiểm tra large task keywords
    if any(re.search(r'\b' + re.escape(kw) + r'\b', combined_text) for kw in _LARGE_TASK_KEYWORDS):
        return "large"
    if ac_count > 8:
        return "large"

    # Kiểm tra sensitive domain → escalate lên MEDIUM
    if any(kw in combined_text for kw in _SENSITIVE_DOMAIN_KEYWORDS):
        return "medium"
    if risk_level == "HIGH":
        return "medium"
    if ac_count >= 4:
        return "medium"

    # Simple keywords → SMALL
    return "small"


def get_rules_for_task(
    feature_title: str = "",
    feature_description: str = "",
    acceptance_criteria: list[str] | None = None,
    risk_level: str = "LOW",
    force_complexity: str | None = None,
) -> tuple[str, dict]:
    """
    Trả về (complexity, rules_dict) cho task.

    Args:
        force_complexity: Nếu set, bỏ qua auto-classify (useful cho testing).
    """
    if acceptance_criteria is None:
        acceptance_criteria = []

    if force_complexity and force_complexity in QUALITY_GATE_RULES:
        complexity = force_complexity
    else:
        complexity = classify_task_complexity(
            feature_title,
            feature_description,
            acceptance_criteria,
            risk_level,
        )

    return complexity, QUALITY_GATE_RULES[complexity]
