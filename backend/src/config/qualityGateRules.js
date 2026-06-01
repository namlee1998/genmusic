/**
 * Quality Gate Rule Definitions (Node.js mirror of Python rules.py)
 * =================================================================
 * Bộ luật cứng cho hệ thống kiểm duyệt chất lượng.
 * Source of truth: agents/src/quality_gate/rules.py
 * Đây là bản mirror để backend evaluate mà không cần gọi Python agent.
 */

'use strict';

// ---------------------------------------------------------------------------
// Rule Definitions
// ---------------------------------------------------------------------------

const QUALITY_GATE_RULES = {
  /**
   * SMALL TASK — Quick gate, no async checks.
   * VD: Login page, simple form, display list, read-only view
   */
  small: {
    complexity: 'small',
    description: 'Simple task (≤3 AC, no sensitive domain). Fast gate — auto-approve on pass.',

    // Số lượng test case tối thiểu
    minTotalTestCases: 3,

    // Phân loại bắt buộc
    minHappyCases: 1,
    minNegativeCases: 1,
    minEdgeCases: 0,
    minSecurityCases: 0,

    // AC Coverage
    minAcCoveragePct: 80,

    // Lỗi nghiêm trọng
    maxBlockers: 0,

    // Risk level
    allowedRiskLevels: ['LOW', 'MEDIUM'],

    // Gate behavior
    gateType: 'FAST',
    simulateDelayMs: 0,           // Không delay
    requireSecurityScan: false,
    requireStaticAnalysis: false,
    minApprovers: 1,              // 1 reviewer

    // Score thresholds
    passingScore: 70,
    holdScore: 50,
  },

  /**
   * MEDIUM TASK — Async gate with security scan + static analysis simulation.
   * VD: User auth, multi-step checkout, API integration, role management
   */
  medium: {
    complexity: 'medium',
    description: 'Medium task (4-8 AC or sensitive domain). Async gate — waits for security & static analysis.',

    minTotalTestCases: 8,
    minHappyCases: 2,
    minNegativeCases: 3,
    minEdgeCases: 2,
    minSecurityCases: 1,

    minAcCoveragePct: 90,
    maxBlockers: 0,

    allowedRiskLevels: ['LOW', 'MEDIUM', 'HIGH'],

    gateType: 'ASYNC',
    simulateDelayMs: 30000,       // 30s delay simulation
    requireSecurityScan: true,
    requireStaticAnalysis: true,
    minApprovers: 2,              // 2 reviewers required

    passingScore: 80,
    holdScore: 65,
  },

  /**
   * LARGE TASK — Strict gate, full review required.
   * VD: Payment gateway, OAuth, data migration, performance-critical
   */
  large: {
    complexity: 'large',
    description: 'Large task (>8 AC or payment/migration). Strict gate — full review required.',

    minTotalTestCases: 15,
    minHappyCases: 3,
    minNegativeCases: 5,
    minEdgeCases: 4,
    minSecurityCases: 3,

    minAcCoveragePct: 95,
    maxBlockers: 0,

    allowedRiskLevels: ['LOW', 'MEDIUM', 'HIGH'],

    gateType: 'STRICT',
    simulateDelayMs: 60000,       // 60s delay simulation
    requireSecurityScan: true,
    requireStaticAnalysis: true,
    minApprovers: 3,              // 3 reviewers required

    passingScore: 90,
    holdScore: 75,
  },
};

// ---------------------------------------------------------------------------
// Domain classifiers
// ---------------------------------------------------------------------------

const SENSITIVE_DOMAIN_KEYWORDS = [
  'auth', 'authentication', 'authorization', 'oauth', 'sso', 'jwt',
  'login', 'logout', 'password', 'credential', 'token',
  'payment', 'checkout', 'billing', 'invoice', 'subscription', 'stripe',
  'security', 'encryption', 'hash', 'role', 'permission', 'rbac',
  'migration', 'database', 'import', 'export', 'sync',
  'webhook', 'integration', 'api gateway',
  'pii', 'gdpr', 'personal data', 'sensitive',
  '2fa', 'mfa', 'otp',
];

const LARGE_TASK_KEYWORDS = [
  'payment gateway', 'oauth', 'data migration', 'full integration',
  'multi-tenant', 'performance', 'load test', 'stress test',
];

// ---------------------------------------------------------------------------
// Task Complexity Classifier
// ---------------------------------------------------------------------------

/**
 * Classify task complexity: 'small' | 'medium' | 'large'
 *
 * @param {string} featureTitle
 * @param {string} featureDescription
 * @param {string[]} acceptanceCriteria
 * @param {string} riskLevel - 'LOW' | 'MEDIUM' | 'HIGH'
 * @returns {'small'|'medium'|'large'}
 */
function classifyTaskComplexity(featureTitle = '', featureDescription = '', acceptanceCriteria = [], riskLevel = 'LOW') {
  const combined = `${featureTitle} ${featureDescription}`.toLowerCase();
  const acCount = (acceptanceCriteria || []).length;

  // Large task check
  if (LARGE_TASK_KEYWORDS.some((kw) => combined.includes(kw))) return 'large';
  if (acCount > 8) return 'large';

  // Sensitive domain → escalate to medium
  if (SENSITIVE_DOMAIN_KEYWORDS.some((kw) => combined.includes(kw))) return 'medium';
  if (riskLevel === 'HIGH') return 'medium';
  if (acCount >= 4) return 'medium';

  return 'small';
}

/**
 * Get rules for a task.
 *
 * @returns {{ complexity: string, rules: object }}
 */
function getRulesForTask({ featureTitle, featureDescription, acceptanceCriteria, riskLevel, forceComplexity } = {}) {
  const complexity = forceComplexity && QUALITY_GATE_RULES[forceComplexity]
    ? forceComplexity
    : classifyTaskComplexity(featureTitle, featureDescription, acceptanceCriteria, riskLevel);

  return { complexity, rules: QUALITY_GATE_RULES[complexity] };
}

module.exports = {
  QUALITY_GATE_RULES,
  classifyTaskComplexity,
  getRulesForTask,
  SENSITIVE_DOMAIN_KEYWORDS,
  LARGE_TASK_KEYWORDS,
};
