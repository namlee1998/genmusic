"""
Quality Gate Evaluator
======================
Engine kiểm tra output của QA Agent dựa trên bộ rule cứng.
Trả về QualityGateResult với score, violations, và final recommendation.

Logic luồng:
  1. Classify task complexity (small / medium / large)
  2. Count test case types từ QAAgentOutput
  3. Evaluate AC coverage matrix
  4. Run async gate simulation nếu gate_type == ASYNC | STRICT
  5. Compute score (0-100) và recommendation (PASS / HOLD / REWORK)
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from typing import Literal

from src.quality_gate.rules import get_rules_for_task

logger = logging.getLogger(__name__)


# =============================================================================
# Result model
# =============================================================================

@dataclass
class GateViolation:
    rule: str
    expected: str
    actual: str
    severity: Literal["BLOCKER", "WARNING", "INFO"] = "BLOCKER"

    def to_dict(self) -> dict:
        return {
            "rule": self.rule,
            "expected": self.expected,
            "actual": self.actual,
            "severity": self.severity,
        }


@dataclass
class QualityGateResult:
    complexity: str                   # small | medium | large
    gate_type: str                    # FAST | ASYNC | STRICT
    score: int                        # 0-100
    recommendation: str               # PASS | HOLD | REWORK
    violations: list[GateViolation] = field(default_factory=list)
    metrics: dict = field(default_factory=dict)
    gate_checks: list[dict] = field(default_factory=list)  # Async gate check results
    summary: str = ""

    @property
    def passed(self) -> bool:
        return self.recommendation == "PASS"

    def to_dict(self) -> dict:
        return {
            "complexity": self.complexity,
            "gate_type": self.gate_type,
            "score": self.score,
            "recommendation": self.recommendation,
            "violations": [v.to_dict() for v in self.violations],
            "metrics": self.metrics,
            "gate_checks": self.gate_checks,
            "summary": self.summary,
            "passed": self.passed,
        }


# =============================================================================
# Async gate simulation (Medium / Large tasks)
# =============================================================================

async def _simulate_security_scan(
    mock_code_diff: str,
    risk_level: str,
    delay_seconds: int,
) -> dict:
    """
    Mô phỏng async security scan.
    - Delay simulate thời gian chờ scanner
    - Phát hiện các anti-patterns cơ bản trong diff
    """
    logger.info(f"[SecurityScan] Starting (delay={delay_seconds}s, risk={risk_level})")

    if delay_seconds > 0:
        await asyncio.sleep(min(delay_seconds, 5))  # Giới hạn max 5s để dev experience tốt

    issues: list[str] = []
    diff_lower = mock_code_diff.lower()

    # Anti-pattern detection trong code diff
    _SECURITY_ANTI_PATTERNS = [
        ("hardcoded password", ["password =", "password=", "passwd =", "secret ="]),
        ("SQL injection risk", ["f\"select", "f'select", "+ 'where", '+ "where']),
        ("eval() usage", ["eval(", "exec("]),
        ("debug credentials", ["admin123", "password123", "test1234", "qwerty"]),
        ("insecure random", ["random.random(", "math.random("]),
        ("console log sensitive", ["console.log(token", "console.log(password", "console.log(secret"]),
    ]

    for issue_name, patterns in _SECURITY_ANTI_PATTERNS:
        if any(p in diff_lower for p in patterns):
            issues.append(issue_name)

    passed = len(issues) == 0
    return {
        "check": "security_scan",
        "passed": passed,
        "issues": issues,
        "message": "No security issues detected" if passed else f"Security issues found: {', '.join(issues)}",
    }


async def _simulate_static_analysis(
    mock_code_diff: str,
    implementation_plan: str,
    delay_seconds: int,
) -> dict:
    """
    Mô phỏng async static code analysis.
    Kiểm tra code structure và quality signals từ diff.
    """
    logger.info(f"[StaticAnalysis] Starting (delay={delay_seconds}s)")

    if delay_seconds > 0:
        await asyncio.sleep(min(delay_seconds // 2, 3))

    warnings: list[str] = []
    diff_lower = mock_code_diff.lower()

    # Kiểm tra có test files trong diff không
    has_test_files = any(
        marker in diff_lower
        for marker in ["test_", "_test.", ".test.", ".spec.", "tests/", "test/"]
    )
    if not has_test_files and len(mock_code_diff) > 200:
        warnings.append("No test files found in the code diff — consider adding unit tests")

    # Kiểm tra TODO/FIXME left in code
    if "todo:" in diff_lower or "fixme:" in diff_lower or "hack:" in diff_lower:
        warnings.append("TODO/FIXME/HACK comments found — resolve before merge")

    # Kiểm tra error handling
    has_try_except = "try:" in diff_lower or "try {" in diff_lower or ".catch(" in diff_lower
    if not has_try_except and ("api" in diff_lower or "fetch(" in diff_lower or "request" in diff_lower):
        warnings.append("External API calls without error handling detected")

    # Kiểm tra type hints / documentation
    if "def " in diff_lower and '"""' not in diff_lower and "'''" not in diff_lower:
        if diff_lower.count("def ") > 3:
            warnings.append("Multiple functions without docstrings — consider adding documentation")

    passed = len([w for w in warnings if "resolve before" in w]) == 0
    return {
        "check": "static_analysis",
        "passed": passed,
        "warnings": warnings,
        "message": "Static analysis passed" if not warnings else f"{len(warnings)} warning(s) found",
    }


async def _run_gate_checks(
    rules: dict,
    mock_code_diff: str,
    implementation_plan: str,
    risk_level: str,
) -> list[dict]:
    """
    Chạy tất cả async gate checks song song.
    """
    gate_type = rules.get("gate_type", "FAST")

    if gate_type == "FAST":
        return [{"check": "fast_gate", "passed": True, "message": "Fast gate — no async checks required"}]

    delay = rules.get("simulate_delay_seconds", 0)
    checks = []

    tasks = []
    if rules.get("require_security_scan", False):
        tasks.append(_simulate_security_scan(mock_code_diff, risk_level, delay))
    if rules.get("require_static_analysis", False):
        tasks.append(_simulate_static_analysis(mock_code_diff, implementation_plan, delay))

    if tasks:
        results = await asyncio.gather(*tasks, return_exceptions=True)
        for r in results:
            if isinstance(r, Exception):
                checks.append({"check": "unknown", "passed": False, "message": str(r)})
            else:
                checks.append(r)

    return checks or [{"check": "gate", "passed": True, "message": "Gate checks completed"}]


# =============================================================================
# Main evaluator
# =============================================================================

def _count_test_types(test_cases: list[dict]) -> dict[str, int]:
    """Count test cases by type."""
    counts: dict[str, int] = {
        "happy": 0,
        "negative": 0,
        "edge": 0,
        "security": 0,
        "ui": 0,
        "other": 0,
    }

    for tc in test_cases:
        tc_type = str(tc.get("type", "")).lower()
        if any(kw in tc_type for kw in ["functional", "happy", "positive"]):
            counts["happy"] += 1
        elif any(kw in tc_type for kw in ["negative", "error", "invalid", "fail"]):
            counts["negative"] += 1
        elif any(kw in tc_type for kw in ["edge", "boundary", "corner"]):
            counts["edge"] += 1
        elif any(kw in tc_type for kw in ["security", "auth", "permission", "access"]):
            counts["security"] += 1
        elif any(kw in tc_type for kw in ["ui", "visual", "layout", "render"]):
            counts["ui"] += 1
        else:
            counts["other"] += 1

    return counts


def _compute_ac_coverage(
    ac_coverage_matrix: list[dict],
    acceptance_criteria: list[str],
) -> float:
    """
    Tính phần trăm AC được cover (0-100).
    """
    if not acceptance_criteria:
        return 100.0  # Nếu không có AC thì coi như full cover

    if not ac_coverage_matrix:
        # Fallback: nếu không có matrix thì 0%
        return 0.0

    covered_count = sum(1 for row in ac_coverage_matrix if row.get("covered", False))
    total = max(len(acceptance_criteria), len(ac_coverage_matrix))
    return round((covered_count / total) * 100, 1) if total > 0 else 0.0


def _compute_score(
    rules: dict,
    type_counts: dict[str, int],
    total_test_cases: int,
    ac_coverage_pct: float,
    blocker_count: int,
    gate_checks_passed: bool,
) -> int:
    """
    Tính score 0-100 dựa trên quy tắc weighted scoring.

    Trọng số:
      - Số lượng TC đủ minimum : 25 pts
      - Phân loại TC đủ : 25 pts
      - AC Coverage : 25 pts
      - Không có blocker : 15 pts
      - Gate checks pass : 10 pts
    """
    score = 0

    # 1. Số lượng TC (25 pts)
    min_total = rules["min_total_test_cases"]
    if total_test_cases >= min_total:
        score += 25
    elif total_test_cases >= max(1, min_total * 0.7):
        score += 15  # Partial credit
    else:
        score += max(0, int(25 * (total_test_cases / max(1, min_total))))

    # 2. Phân loại TC (25 pts)
    type_score = 0
    type_rules = [
        ("happy", "min_happy_cases", 8),
        ("negative", "min_negative_cases", 9),
        ("edge", "min_edge_cases", 5),
        ("security", "min_security_cases", 3),
    ]
    for type_name, rule_key, max_pts in type_rules:
        required = rules.get(rule_key, 0)
        actual = type_counts.get(type_name, 0)
        if required == 0:
            type_score += max_pts  # Full pts if not required
        elif actual >= required:
            type_score += max_pts
        else:
            type_score += int(max_pts * (actual / required))
    score += min(type_score, 25)

    # 3. AC Coverage (25 pts)
    min_coverage = rules["min_ac_coverage_pct"]
    if ac_coverage_pct >= min_coverage:
        score += 25
    else:
        score += int(25 * (ac_coverage_pct / max(1, min_coverage)))

    # 4. Không có blocker (15 pts)
    max_blockers = rules.get("max_blockers", 0)
    if blocker_count <= max_blockers:
        score += 15
    else:
        score += max(0, 15 - (blocker_count * 5))

    # 5. Gate checks (10 pts)
    if gate_checks_passed:
        score += 10

    return min(100, max(0, score))


async def evaluate_quality_gate(
    # Thông tin feature để classify
    feature_title: str = "",
    feature_description: str = "",
    acceptance_criteria: list[str] | None = None,
    # QA Agent output
    test_cases: list[dict] | None = None,
    ac_coverage_matrix: list[dict] | None = None,
    blocker_count: int = 0,
    risk_level: str = "LOW",
    # Code artifacts (cho async gate checks)
    mock_code_diff: str = "",
    implementation_plan: str = "",
    # Override
    force_complexity: str | None = None,
) -> QualityGateResult:
    """
    Main evaluation function.
    Async để support gate simulation (security scan, static analysis).

    Returns: QualityGateResult
    """
    if acceptance_criteria is None:
        acceptance_criteria = []
    if test_cases is None:
        test_cases = []
    if ac_coverage_matrix is None:
        ac_coverage_matrix = []

    # --- 1. Get rules ---
    complexity, rules = get_rules_for_task(
        feature_title=feature_title,
        feature_description=feature_description,
        acceptance_criteria=acceptance_criteria,
        risk_level=risk_level,
        force_complexity=force_complexity,
    )
    gate_type = rules["gate_type"]

    logger.info(
        f"[QualityGate] Evaluating task '{feature_title}' | "
        f"complexity={complexity}, gate_type={gate_type}, "
        f"tc_count={len(test_cases)}, ac_count={len(acceptance_criteria)}"
    )

    # --- 2. Compute metrics ---
    type_counts = _count_test_types(test_cases)
    total_tc = len(test_cases)
    ac_coverage_pct = _compute_ac_coverage(ac_coverage_matrix, acceptance_criteria)

    # --- 3. Run async gate checks ---
    gate_checks = await _run_gate_checks(
        rules=rules,
        mock_code_diff=mock_code_diff,
        implementation_plan=implementation_plan,
        risk_level=risk_level,
    )
    gate_checks_passed = all(c.get("passed", True) for c in gate_checks)

    # --- 4. Collect violations ---
    violations: list[GateViolation] = []

    # Kiểm tra total test cases
    if total_tc < rules["min_total_test_cases"]:
        violations.append(GateViolation(
            rule="min_total_test_cases",
            expected=f">= {rules['min_total_test_cases']}",
            actual=str(total_tc),
            severity="BLOCKER",
        ))

    # Kiểm tra từng loại
    type_checks = [
        ("happy", "min_happy_cases", "Happy path test cases"),
        ("negative", "min_negative_cases", "Negative test cases"),
        ("edge", "min_edge_cases", "Edge case test cases"),
        ("security", "min_security_cases", "Security test cases"),
    ]
    for type_name, rule_key, label in type_checks:
        required = rules.get(rule_key, 0)
        actual = type_counts.get(type_name, 0)
        if actual < required:
            severity = "BLOCKER" if required > 0 and actual == 0 else "WARNING"
            violations.append(GateViolation(
                rule=rule_key,
                expected=f">= {required} {label}",
                actual=f"{actual} {label}",
                severity=severity,
            ))

    # Kiểm tra AC coverage
    min_cov = rules["min_ac_coverage_pct"]
    if ac_coverage_pct < min_cov:
        violations.append(GateViolation(
            rule="min_ac_coverage_pct",
            expected=f">= {min_cov}% AC coverage",
            actual=f"{ac_coverage_pct}% AC coverage",
            severity="BLOCKER" if ac_coverage_pct < min_cov * 0.7 else "WARNING",
        ))

    # Kiểm tra blockers
    max_blockers = rules.get("max_blockers", 0)
    if blocker_count > max_blockers:
        violations.append(GateViolation(
            rule="max_blockers",
            expected=f"<= {max_blockers} blockers",
            actual=f"{blocker_count} blockers",
            severity="BLOCKER",
        ))

    # Gate check violations
    for check in gate_checks:
        if not check.get("passed", True):
            issues = check.get("issues", check.get("warnings", []))
            if issues:
                for issue in issues:
                    violations.append(GateViolation(
                        rule=f"gate_check.{check['check']}",
                        expected="No issues",
                        actual=issue,
                        severity="WARNING" if check["check"] == "static_analysis" else "BLOCKER",
                    ))

    # --- 5. Compute score ---
    score = _compute_score(
        rules=rules,
        type_counts=type_counts,
        total_test_cases=total_tc,
        ac_coverage_pct=ac_coverage_pct,
        blocker_count=blocker_count,
        gate_checks_passed=gate_checks_passed,
    )

    # --- 6. Determine recommendation ---
    blocker_violations = [v for v in violations if v.severity == "BLOCKER"]

    if len(blocker_violations) > 0:
        recommendation = "REWORK"
    elif score >= rules["passing_score"]:
        recommendation = "PASS"
    elif score >= rules["hold_score"]:
        recommendation = "HOLD"
    else:
        recommendation = "REWORK"

    # --- 7. Build summary ---
    summary_lines = [
        f"[{complexity.upper()} / {gate_type}] Score: {score}/100 → {recommendation}",
        f"Test Cases: {total_tc} total "
        f"(happy={type_counts['happy']}, negative={type_counts['negative']}, "
        f"edge={type_counts['edge']}, security={type_counts['security']})",
        f"AC Coverage: {ac_coverage_pct}% | Blockers: {blocker_count}",
    ]
    if violations:
        summary_lines.append(f"Violations ({len(violations)}): " + "; ".join(
            f"{v.rule} [{v.severity}]" for v in violations[:5]
        ))
    if gate_checks:
        failed_checks = [c for c in gate_checks if not c.get("passed", True)]
        if failed_checks:
            summary_lines.append(f"Gate failures: {', '.join(c['check'] for c in failed_checks)}")

    return QualityGateResult(
        complexity=complexity,
        gate_type=gate_type,
        score=score,
        recommendation=recommendation,
        violations=violations,
        metrics={
            "total_test_cases": total_tc,
            "type_counts": type_counts,
            "ac_coverage_pct": ac_coverage_pct,
            "blocker_count": blocker_count,
            "min_total_required": rules["min_total_test_cases"],
            "min_happy_required": rules["min_happy_cases"],
            "min_negative_required": rules["min_negative_cases"],
            "min_edge_required": rules["min_edge_cases"],
            "min_security_required": rules["min_security_cases"],
            "min_ac_coverage_required": rules["min_ac_coverage_pct"],
            "min_approvers_required": rules.get("min_approvers", 1),
        },
        gate_checks=gate_checks,
        summary="\n".join(summary_lines),
    )
