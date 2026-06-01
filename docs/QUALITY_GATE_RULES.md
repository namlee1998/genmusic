# Quality Gate Rules — AIDLC Platform

> **Version**: 1.0.0  
> **Owner**: QA Team (Team 6)  
> **Last Updated**: 2026-05-29  
> **Status**: Active

---

## 1. Overview

The Quality Gate is a **rule-based enforcement system** that validates QA Agent output before human review. It ensures every feature that reaches the QA Gate meets minimum quality standards — preventing under-tested code from shipping.

The gate runs **automatically** after the QA Agent completes and produces a scored evaluation with a concrete recommendation: **PASS**, **HOLD**, or **REWORK**.

---

## 2. Task Complexity Classification

Tasks are automatically classified into three tiers based on scope and domain sensitivity.

| Tier | Trigger Criteria | Examples |
|------|-----------------|---------|
| **SMALL** | ≤3 ACs AND no sensitive domain keywords | Display list, read-only view, static page, tooltip |
| **MEDIUM** | ≥4 ACs OR contains sensitive domain keywords | User login, auth flow, multi-step form, API integration, role management |
| **LARGE** | >8 ACs OR payment/migration/OAuth keywords | Payment gateway, OAuth integration, DB migration, multi-tenant features |

### Sensitive Domain Keywords (auto-escalate to MEDIUM)
`auth`, `authentication`, `jwt`, `oauth`, `sso`, `login`, `password`, `credential`, `token`, `payment`, `checkout`, `billing`, `stripe`, `security`, `encryption`, `role`, `permission`, `rbac`, `migration`, `2fa`, `mfa`, `otp`, `pii`, `gdpr`

### Large Task Keywords (auto-escalate to LARGE)  
`payment gateway`, `data migration`, `full integration`, `multi-tenant`, `load test`, `stress test`

---

## 3. Quality Gate Rules by Tier

### 3.1 SMALL Task — Fast Gate

| Rule | Threshold | Severity |
|------|-----------|----------|
| Minimum test cases | **≥ 3** | BLOCKER |
| Happy path test cases | **≥ 1** | BLOCKER |
| Negative test cases | **≥ 1** | BLOCKER |
| Edge cases | 0 (optional) | — |
| Security test cases | 0 (optional) | — |
| AC coverage | **≥ 80%** | BLOCKER if <56%, WARNING if <80% |
| Max blockers | **= 0** | BLOCKER |
| Gate type | **FAST** | No async checks |
| Approvers required | **1** | — |
| Passing score | **≥ 70** | → PASS |
| Hold score | **≥ 50** | → HOLD |
| Below hold score | **< 50** | → REWORK |

**FAST Gate behavior**: No async checks required. If all thresholds are met, gate approves immediately.

---

### 3.2 MEDIUM Task — Async Gate

| Rule | Threshold | Severity |
|------|-----------|----------|
| Minimum test cases | **≥ 8** | BLOCKER |
| Happy path test cases | **≥ 2** | BLOCKER if 0, WARNING if 1 |
| Negative test cases | **≥ 3** | BLOCKER if 0, WARNING if <3 |
| Edge cases | **≥ 2** | WARNING if <2 |
| Security test cases | **≥ 1** | BLOCKER if 0 (for auth/payment features) |
| AC coverage | **≥ 90%** | BLOCKER if <63%, WARNING if <90% |
| Max blockers | **= 0** | BLOCKER |
| Gate type | **ASYNC** | Runs security scan + static analysis |
| Simulated delay | **30 seconds** | Simulates scanner runtime |
| Approvers required | **2** | Must have 2 human reviewers |
| Passing score | **≥ 80** | → PASS |
| Hold score | **≥ 65** | → HOLD |
| Below hold score | **< 65** | → REWORK |

**ASYNC Gate checks run in parallel:**

1. **Security Scan** — Detects anti-patterns:
   - Hardcoded passwords/credentials
   - SQL injection risks (f-string queries)
   - `eval()` / `exec()` usage
   - Debug credentials left in code
   - Sensitive data in `console.log` / `print`

2. **Static Analysis** — Checks code structure:
   - Missing test files in diff
   - TODO/FIXME/HACK comments not resolved
   - External API calls without error handling
   - Functions without docstrings (when >3 functions added)

---

### 3.3 LARGE Task — Strict Gate

| Rule | Threshold | Severity |
|------|-----------|----------|
| Minimum test cases | **≥ 15** | BLOCKER |
| Happy path test cases | **≥ 3** | BLOCKER if 0 |
| Negative test cases | **≥ 5** | BLOCKER if 0 |
| Edge cases | **≥ 4** | WARNING if <4 |
| Security test cases | **≥ 3** | BLOCKER if <2 |
| AC coverage | **≥ 95%** | BLOCKER if <66% |
| Max blockers | **= 0** | BLOCKER |
| Gate type | **STRICT** | Full security + static + manual review |
| Simulated delay | **60 seconds** | Simulates full scanner suite |
| Approvers required | **3** | Must have 3 human reviewers |
| Passing score | **≥ 90** | → PASS |
| Hold score | **≥ 75** | → HOLD |
| Below hold score | **< 75** | → REWORK |

---

## 4. Scoring Algorithm

Quality score is computed on a **0-100 weighted scale**:

| Component | Weight | Description |
|-----------|--------|-------------|
| Test case count | **25 pts** | Full credit at ≥ minimum; partial below 70% of minimum |
| Type distribution | **25 pts** | Happy(8) + Negative(9) + Edge(5) + Security(3) pts |
| AC Coverage | **25 pts** | Linear scale from 0 to required% |
| Zero blockers | **15 pts** | Full credit at 0 blockers; -5 per additional blocker |
| Gate checks pass | **10 pts** | Security scan + static analysis pass |

### Score → Recommendation Mapping

```
REWORK  : Any BLOCKER violation  (regardless of score)
REWORK  : score < hold_score
HOLD    : hold_score ≤ score < passing_score
PASS    : score ≥ passing_score  AND  zero BLOCKER violations
```

---

## 5. Test Case Type Classification

The evaluator maps QA Agent test case `type` field to categories:

| Category | Accepted type values |
|----------|---------------------|
| **happy** | `functional`, `happy`, `positive` |
| **negative** | `negative`, `error`, `invalid`, `fail` |
| **edge** | `edge`, `boundary`, `corner` |
| **security** | `security`, `auth`, `permission`, `access` |
| **ui** | `ui`, `visual`, `layout`, `render` |
| **other** | Everything else (counts toward total but not categories) |

---

## 6. Violation Severity Levels

| Severity | Meaning | Effect on Recommendation |
|----------|---------|--------------------------|
| **BLOCKER** | Hard requirement not met | Forces `REWORK` regardless of score |
| **WARNING** | Soft requirement partially met | Reduces score but may still PASS |
| **INFO** | Informational only | No impact on score |

---

## 7. Workflow Integration

```
QA Agent completes
        ↓
quality_gate node (LangGraph)
        ↓
  classify_task_complexity()
        ↓
  evaluate against rules
        ↓
  [if ASYNC/STRICT]
  → run security_scan()  ─┐
  → run static_analysis() ┘ (parallel, ~3-5s max)
        ↓
  compute score (0-100)
        ↓
  recommendation: PASS | HOLD | REWORK
        ↓
gate_evaluation artifact saved
        ↓
Human QA_GATE decision
  APPROVE  → PASS gate → commit task
  REJECT   → end workflow
  REQUEST_CHANGES → auto-rework
```

---

## 8. Configuration

### Python (agents/src/quality_gate/rules.py)

```python
# Override task complexity for testing
complexity, rules = get_rules_for_task(
    feature_title="Login page",
    acceptance_criteria=["User can login", "Show error on wrong password"],
    force_complexity="small",  # Override auto-detect
)

# Programmatic evaluation
result = await evaluate_quality_gate(
    feature_title="Login",
    acceptance_criteria=[...],
    test_cases=[...],           # QA Agent output
    ac_coverage_matrix=[...],   # QA Agent output
    blocker_count=0,
    risk_level="LOW",
    mock_code_diff="...",       # DEV Agent output (for async checks)
)
print(result.score, result.recommendation)
```

### Node.js (backend/src/services/QualityGateService.js)

```js
const QualityGateService = require('./services/QualityGateService');

const result = await QualityGateService.evaluate({
  featureTitle: 'User Login',
  acceptanceCriteria: ['...', '...'],
  testCases: [/* QA Agent output */],
  acCoverageMatrix: [/* QA Agent output */],
  blockerCount: 0,
  riskLevel: 'HIGH',         // Triggers MEDIUM gate
  mockCodeDiff: '...',       // For security scan
  forceComplexity: 'medium', // Optional override
});

console.log(result.score);          // 85
console.log(result.recommendation); // "PASS"
console.log(result.violations);     // []
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| None required | — | Gate rules are code-configured |

---

## 9. Small vs Medium Task Examples

### Example: Login Feature (SMALL)

**Input**: "Implement a login form with email + password"  
**Auto-classified**: SMALL (2 ACs, no sensitive keyword overrides — *wait*, "login" IS a sensitive keyword → escalates to MEDIUM)

> **Note**: "login" keyword → auto-escalated to **MEDIUM** even with 2 ACs.

**Requirements at MEDIUM gate:**
- ≥ 8 test cases
- ≥ 2 happy path, ≥ 3 negative, ≥ 2 edge, ≥ 1 security
- ≥ 90% AC coverage
- Security scan + static analysis
- 2 approvers

**Expected test cases for login:**
```
TC-001: functional  - Login with valid credentials → dashboard redirect
TC-002: functional  - Login redirects to intended deep link (alt happy path)
TC-003: negative    - Empty email → "Email is required" error
TC-004: negative    - Empty password → "Password is required" error
TC-005: negative    - Wrong password → "Invalid credentials" error (NOT "wrong password")
TC-006: negative    - Non-existent email → same generic error (no user enumeration)
TC-007: edge        - Email with mixed case ("User@Example.COM") → normalizes, login succeeds
TC-008: edge        - 5th consecutive failed login → rate limiting triggered
TC-009: security    - JWT token in response is not stored in localStorage (XSS prevention)
TC-010: security    - Expired token redirects to login instead of showing 401 to user
```

### Example: Display Feature (SMALL — genuinely small)

**Input**: "Show a read-only list of recent transactions"  
**Auto-classified**: SMALL (no sensitive keywords, 2 ACs)

**Requirements at FAST gate:**
- ≥ 3 test cases (happy + negative minimum)
- ≥ 80% AC coverage
- No security/static checks
- 1 approver

---

## 10. Confluence Sync

This document is the source of truth for Quality Gate rules.  
Sync to Confluence page: **AIDLC Platform > Quality Assurance > Quality Gate Rules**

Changes to rules require:
1. PR approval from QA Lead
2. Update version number in this document
3. Update Python `rules.py` and JS `qualityGateRules.js` in the same PR
4. Announce in `#qa-platform` Slack channel

---

*Generated by Team 6 — End-to-End Autonomous Software Factory*
