import { useMemo, useState } from 'react';

interface GateIssue {
  code: string;
  severity: string;
  detail: string;
  suggestedAction?: string;
}

interface GateEvaluation {
  complexity?: string;
  gateType?: string;
  score?: number;
  recommendation?: string;
  summary?: string;
  issues?: GateIssue[];
}

export type StructuredAction = 'approve' | 'edit_approve' | 'reject';

export interface StructuredDecision {
  action: StructuredAction;
  comment: string;
  retryReason?: string;
  editedOutput?: Record<string, unknown>;
  targetFields?: string[];
  blockingIssues?: Array<{ severity: string; issue: string; expected_fix: string }>;
  acceptanceChecks?: string[];
}

interface Props {
  taskId: string;
  gateEvaluation?: GateEvaluation | null;
  agentOutput?: Record<string, unknown> | null;
  outputVersion?: number;
  retryCount?: number;
  onSubmit: (decision: StructuredDecision) => Promise<void>;
  onClose: () => void;
}

// The three structured HITL actions (plan section 2.3.2).
const ACTIONS = [
  { value: 'approve' as const, label: 'Approve & hand off', description: 'Validate, commit the approved output, create the A2A handoff, and unlock the next worker.' },
  { value: 'edit_approve' as const, label: 'Edit by field & approve', description: 'Edit the structured output, re-validate, then approve. The edit is saved as a JSON Patch in the audit log.' },
  { value: 'reject' as const, label: 'Reject & re-run', description: 'Re-run the owning worker with your feedback (max 3 retries, then escalates).' },
];

// Retry reason taxonomy (plan section 2.3.3).
const RETRY_REASONS = ['schema_invalid', 'ac_not_measurable', 'coverage_gap', 'build_fail', 'quality_low', 'other'];
const FEEDBACK_EXAMPLES: Record<string, string> = {
  po: 'Example: Rewrite the acceptance criteria so each one is measurable and clarify the target user.',
  ux: 'Example: Rework the checkout flow with an explicit error state and a mobile wireframe.',
  dev: 'Example: Rework the implementation using a refresh-token flow and add a test for token expiry.',
};

interface DemoFeedbackPreset {
  retryReason: string;
  targetFields: string;
  blockingIssue: string;
  expectedFix: string;
  acceptanceChecks: string[];
  comment: string;
}

const DEMO_FEEDBACK_PRESETS: Record<string, Partial<Record<string, DemoFeedbackPreset>>> = {
  low_confidence_hold: {
    dev: {
      retryReason: 'quality_low',
      targetFields: 'confidence_score, implementation_plan, sandbox_report, linked_ac_ids',
      blockingIssue: 'DEV output confidence is below the auto-approval threshold and lacks enough implementation evidence.',
      expectedFix: 'Add concrete implementation evidence, link the patch to acceptance criteria, and rerun sandbox validation.',
      acceptanceChecks: [
        'Confidence score is at least 0.8',
        'Implementation plan references the affected files and acceptance criteria',
        'Sandbox report is attached and passing',
      ],
      comment: 'Strengthen the DEV evidence package so confidence clears the review threshold and the handoff can proceed.',
    },
    po: {
      retryReason: 'quality_low',
      targetFields: 'prd, acceptance_criteria, scope',
      blockingIssue: 'PO output confidence is below the gate threshold because scope and acceptance criteria need clearer evidence.',
      expectedFix: 'Clarify scope, rewrite measurable acceptance criteria, and explain why the feature is ready for UX handoff.',
      acceptanceChecks: [
        'Confidence score is at least 0.8',
        'Every acceptance criterion is measurable',
        'Scope and out-of-scope sections are explicit',
      ],
      comment: 'Tighten the PO artifact so the next worker receives measurable requirements and confidence can recover.',
    },
    ux: {
      retryReason: 'quality_low',
      targetFields: 'ux_spec, user_flow, screens, wireframe_spec',
      blockingIssue: 'UX output confidence is below the gate threshold because the flow evidence is incomplete.',
      expectedFix: 'Add the missing screen states, clarify user flow transitions, and attach updated wireframe evidence.',
      acceptanceChecks: [
        'Confidence score is at least 0.8',
        'Screens cover entry, success, and error states',
        'Wireframe evidence is attached',
      ],
      comment: 'Complete the UX evidence so the DEV handoff is specific enough to implement safely.',
    },
  },
  missing_evidence: {
    dev: {
      retryReason: 'build_fail',
      targetFields: 'sandbox_result, self_test_report, sandbox_report',
      blockingIssue: 'DEV output is missing sandbox execution evidence and the self-test report.',
      expectedFix: 'Run the sandbox checks, attach the self-test report, and confirm build and tests pass before handoff.',
      acceptanceChecks: [
        'sandbox_result.tests_ran is true',
        'self_test_report is present',
        'sandbox report includes passing build and test evidence',
      ],
      comment: 'Attach the missing sandbox and self-test evidence, then rerun DEV validation so QA can receive the handoff.',
    },
  },
  qa_blocker: {
    qa: {
      retryReason: 'coverage_gap',
      targetFields: 'test_run_report, qa_report, blocker_count, release_reason',
      blockingIssue: 'QA found a blocking OAuth callback regression and the release gate is locked.',
      expectedFix: 'Regenerate QA evidence after the callback fix, mark the blocker resolved, and attach a passing regression run.',
      acceptanceChecks: [
        'blocker_count is 0',
        'test_run_report.failed is 0',
        'QA report documents the resolved CSRF callback regression',
      ],
      comment: 'Re-run QA after resolving the callback regression and produce a clean release recommendation.',
    },
  },
  escalation: {
    dev: {
      retryReason: 'quality_low',
      targetFields: 'confidence_score, implementation_plan, sandbox_report',
      blockingIssue: 'DEV output remains below confidence threshold after prior feedback.',
      expectedFix: 'Provide stronger implementation evidence and prove the risky areas are covered before another handoff attempt.',
      acceptanceChecks: [
        'Confidence score is at least 0.8',
        'Evidence addresses the reviewer issue directly',
        'Retry budget is not exceeded',
      ],
      comment: 'This demo branch intentionally keeps confidence low after feedback so repeated rejects trigger escalation.',
    },
  },
};

function readScenarioBrief(agentOutput?: Record<string, unknown> | null) {
  const brief = agentOutput?.scenario_brief;
  if (!brief || typeof brief !== 'object') return { scenario: 'happy_path', stage: '' };
  const record = brief as Record<string, unknown>;
  return {
    scenario: typeof record.scenario === 'string' ? record.scenario : 'happy_path',
    stage: typeof record.stage === 'string' ? record.stage.replace('-agent', '') : '',
  };
}

export default function HumanGatePanel({
  taskId, gateEvaluation, agentOutput, outputVersion = 0, retryCount = 0, onSubmit, onClose,
}: Props) {
  const requiresFeedbackRerun = gateEvaluation?.gateType === 'confidence_based'
    && gateEvaluation.recommendation === 'HOLD';
  const [action, setAction] = useState<StructuredAction | null>(requiresFeedbackRerun ? 'reject' : null);
  const [comment, setComment] = useState('');
  const [retryReason, setRetryReason] = useState('other');
  const [targetFields, setTargetFields] = useState('');
  const [blockingIssue, setBlockingIssue] = useState('');
  const [expectedFix, setExpectedFix] = useState('');
  const [acceptanceChecks, setAcceptanceChecks] = useState('');
  const [editText, setEditText] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const approvalBlocked = gateEvaluation?.gateType === 'qa_quality_gate'
    && gateEvaluation.recommendation !== 'PASS';
  const visibleActions = requiresFeedbackRerun ? ACTIONS.filter((item) => item.value === 'reject') : ACTIONS;
  const prettyOutput = useMemo(() => JSON.stringify(agentOutput ?? {}, null, 2), [agentOutput]);
  const workerLabel = gateEvaluation?.complexity?.toUpperCase() || 'Worker';
  const feedbackPlaceholder = FEEDBACK_EXAMPLES[gateEvaluation?.complexity || ''] || 'Describe what the worker should improve before rerunning.';
  const fillDemoFeedback = () => {
    const { scenario, stage } = readScenarioBrief(agentOutput);
    const preset = DEMO_FEEDBACK_PRESETS[scenario]?.[stage]
      || DEMO_FEEDBACK_PRESETS[scenario]?.dev
      || DEMO_FEEDBACK_PRESETS.low_confidence_hold.dev;
    if (preset) {
      setRetryReason(preset.retryReason);
      setTargetFields(preset.targetFields);
      setBlockingIssue(preset.blockingIssue);
      setExpectedFix(preset.expectedFix);
      setAcceptanceChecks(preset.acceptanceChecks.join('\n'));
      setComment(preset.comment);
      return;
    }

    const issue = gateEvaluation?.issues?.find((item) => item.code === 'oauth_state_csrf_missing')
      || gateEvaluation?.issues?.[0];
    setRetryReason('quality_low');
    setTargetFields('security_notes, callback_handler, sandbox_tests');
    setBlockingIssue(issue?.detail || 'OAuth callback state validation evidence is missing.');
    setExpectedFix(issue?.suggestedAction || 'Validate OAuth state against the login session, attach passing security notes, and rerun sandbox tests.');
    setAcceptanceChecks([
      'Reject callback when OAuth state does not match the login session',
      'Attach passing security checklist and sandbox test evidence',
    ].join('\n'));
    setComment('Add OAuth state validation against the login session, attach the updated security evidence, and rerun the sandbox checks.');
  };

  const selectAction = (value: StructuredAction) => {
    setAction(value);
    setError(null);
    if (value === 'edit_approve' && !editText) setEditText(prettyOutput);
  };

  const submit = async () => {
    if (!action) return;
    setError(null);

    let editedOutput: Record<string, unknown> | undefined;
    if (action === 'edit_approve') {
      try {
        editedOutput = JSON.parse(editText);
        setEditError(null);
      } catch (e) {
        setEditError(`Invalid JSON: ${(e as Error).message}`);
        return;
      }
    }

    setLoading(true);
    try {
      await onSubmit({
        action, comment, retryReason: action === 'reject' ? retryReason : undefined, editedOutput,
        targetFields: action === 'reject' ? targetFields.split(',').map((item) => item.trim()).filter(Boolean) : undefined,
        blockingIssues: action === 'reject' ? [{ severity: 'HIGH', issue: blockingIssue, expected_fix: expectedFix }] : undefined,
        acceptanceChecks: action === 'reject' ? acceptanceChecks.split('\n').map((item) => item.trim()).filter(Boolean) : undefined,
      });
      onClose();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message
        ?? (e as Error)?.message ?? 'Decision failed';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const submitDisabled = !action || loading
    || (action === 'approve' && approvalBlocked)
    || (action === 'reject' && (!comment.trim() || !blockingIssue.trim() || !expectedFix.trim() || !acceptanceChecks.trim()));

  return (
    <div className="gate-panel">
      <div className="gate-panel__header">
        <h2>{requiresFeedbackRerun ? `${workerLabel} output needs human review` : 'Human review gate'}</h2>
        <p className="gate-panel__sub">
          Task <code>{taskId.slice(0, 8)}…</code> · output v{outputVersion}
          {retryCount > 0 && <> · retries {retryCount}/3</>}
        </p>
      </div>

      <div className="gate-decisions">
        {visibleActions.map((a) => (
          <button key={a.value} className={`gate-btn ${action === a.value ? 'gate-btn--selected' : ''}`} onClick={() => selectAction(a.value)}>
            <div>
              <div className="gate-btn__label">{requiresFeedbackRerun ? 'Send feedback & rerun worker' : a.label}</div>
              <div className="gate-btn__desc">{requiresFeedbackRerun ? 'The worker receives your direction, regenerates its output, and runs validation again.' : a.description}</div>
            </div>
          </button>
        ))}
      </div>

      {gateEvaluation && (
        <div className={`gate-evaluation ${gateEvaluation.recommendation === 'PASS' ? 'gate-evaluation--pass' : 'gate-evaluation--hold'}`}>
          <div className="gate-evaluation__header"><strong>{gateEvaluation.gateType === 'qa_quality_gate' ? 'Automated QA gate' : 'Confidence-based review trigger'}</strong><span>{gateEvaluation.complexity?.toUpperCase()} · {gateEvaluation.score}/100</span></div>
          <p>{gateEvaluation.recommendation}: {gateEvaluation.summary}</p>
          {!!gateEvaluation.issues?.length && (
            <div className="gate-issues">
              <strong>Issues requiring attention</strong>
              {gateEvaluation.issues.map((issue) => (
                <div className="gate-issue" key={`${issue.code}:${issue.detail}`}>
                  <span>{issue.severity}</span>
                  <div><b>{issue.code}</b><p>{issue.detail}</p>{issue.suggestedAction && <small>{issue.suggestedAction}</small>}</div>
                </div>
              ))}
            </div>
          )}
          {approvalBlocked && <small>Approval stays locked until the automated QA gate returns PASS.</small>}
          {requiresFeedbackRerun && <small>Direct approval is disabled. Add a concrete direction for the worker and rerun it.</small>}
        </div>
      )}

      {action === 'edit_approve' && (
        <div className="gate-comment">
          <label>Edit structured output (JSON) <span className="gate-required">(re-validated on approve)</span></label>
          <textarea
            className="gate-textarea" rows={12} value={editText} spellCheck={false}
            onChange={(e) => { setEditText(e.target.value); setEditError(null); }}
            style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}
          />
          {editError && <small className="gate-required">{editError}</small>}
        </div>
      )}

      {action === 'reject' && (
        <>
          <button className="gate-demo-fill" type="button" onClick={fillDemoFeedback}>
            Fill demo review feedback
          </button>
          <div className="gate-comment">
            <label>Retry reason</label>
            <select className="gate-textarea" value={retryReason} onChange={(e) => setRetryReason(e.target.value)} style={{ height: 36 }}>
              {RETRY_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div className="gate-comment">
            <label>Target fields <span className="gate-muted">(comma-separated)</span></label>
            <input className="gate-textarea" value={targetFields} onChange={(e) => setTargetFields(e.target.value)} placeholder="security_notes, callback_handler, sandbox_tests" />
          </div>
          <div className="gate-comment">
            <label>Blocking issue <span className="gate-required">(required)</span></label>
            <textarea className="gate-textarea" rows={2} value={blockingIssue} onChange={(e) => setBlockingIssue(e.target.value)} placeholder="Example: OAuth callback does not validate state against the login session." />
          </div>
          <div className="gate-comment">
            <label>Expected fix <span className="gate-required">(required)</span></label>
            <textarea className="gate-textarea" rows={2} value={expectedFix} onChange={(e) => setExpectedFix(e.target.value)} placeholder="Example: Add state generation and callback validation, then rerun sandbox tests." />
          </div>
          <div className="gate-comment">
            <label>Acceptance checks <span className="gate-required">(one per line)</span></label>
            <textarea className="gate-textarea" rows={3} value={acceptanceChecks} onChange={(e) => setAcceptanceChecks(e.target.value)} placeholder={'Reject callback when state does not match\nAttach passing security checklist and sandbox test evidence'} />
          </div>
        </>
      )}

      <div className="gate-comment">
        <label>Review comment {action === 'reject' && <span className="gate-required">(required)</span>}</label>
        <textarea className="gate-textarea" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder={requiresFeedbackRerun ? feedbackPlaceholder : 'Review notes, requested changes, or the rejection reason.'} />
      </div>

      {error && <div className="delivery-error" style={{ margin: '0 0 8px' }}>{error}</div>}

      <div className="gate-actions">
        <button className="gate-cancel" onClick={onClose}>Cancel</button>
        <button className="gate-submit" onClick={submit} disabled={submitDisabled}>
          {loading ? 'Submitting…' : requiresFeedbackRerun ? 'Send feedback & rerun' : `Submit: ${action || '-'}`}
        </button>
      </div>
    </div>
  );
}
