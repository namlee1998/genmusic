import type { WorkflowMetrics } from '@/store/useSdlcStore';

interface Props { metrics: WorkflowMetrics | null; }

function formatDuration(seconds: number | null): string {
  if (seconds == null) return '—';
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return s ? `${m}m ${s}s` : `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

const STAGE_LABELS: Record<string, string> = {
  'po-agent': 'PO', 'ux-agent': 'UX', 'dev-agent': 'DEV', 'qa-agent': 'QA',
};

/**
 * Workflow metrics panel (plan TIP-011). Surfaces the derived health signals so
 * the team can prove the workflow improves over time — most importantly the
 * false auto-approval rate.
 */
export default function WorkflowMetricsPanel({ metrics }: Props) {
  if (!metrics) {
    return (
      <div className="metrics-panel metrics-panel--empty">
        <p>No metrics yet. Run a feature through the workflow to populate these signals.</p>
      </div>
    );
  }

  const failureReasons = Object.entries(metrics.gate_failure_reason_distribution || {});
  const rerunStages = Object.entries(metrics.rerun_count_per_stage || {});

  return (
    <div className="metrics-panel">
      <div className="metrics-grid">
        <div className="metric-card">
          <span className="metric-card__label">Cycle time</span>
          <span className="metric-card__value">{formatDuration(metrics.cycle_time_seconds)}</span>
          <small>request → release</small>
        </div>
        <div className="metric-card">
          <span className="metric-card__label">Auto-approval rate</span>
          <span className="metric-card__value">{metrics.auto_approval_rate}%</span>
          <small>{metrics.counts.auto_approvals}/{metrics.counts.auto_approvals + metrics.counts.human_approvals} approvals</small>
        </div>
        <div className="metric-card">
          <span className="metric-card__label">Human rejection rate</span>
          <span className="metric-card__value">{metrics.human_rejection_rate}%</span>
          <small>{metrics.counts.rejections} rejections</small>
        </div>
        <div className={`metric-card ${metrics.false_auto_approval_rate > 0 ? 'metric-card--alert' : ''}`}>
          <span className="metric-card__label">False auto-approval</span>
          <span className="metric-card__value">{metrics.false_auto_approval_rate}%</span>
          <small>auto-approved then rejected</small>
        </div>
        <div className="metric-card">
          <span className="metric-card__label">Requirement coverage</span>
          <span className="metric-card__value">{metrics.requirement_coverage_percentage ?? '—'}{metrics.requirement_coverage_percentage != null ? '%' : ''}</span>
          <small>QA coverage matrix</small>
        </div>
        <div className="metric-card">
          <span className="metric-card__label">Sandbox</span>
          <span className="metric-card__value">{metrics.sandbox_pass == null ? '—' : metrics.sandbox_pass ? 'PASS' : 'FAIL'}</span>
          <small>QA gate {metrics.qa_gate || '—'}</small>
        </div>
        <div className={`metric-card ${metrics.dead_letter_count > 0 ? 'metric-card--alert' : ''}`}>
          <span className="metric-card__label">Dead-letter</span>
          <span className="metric-card__value">{metrics.dead_letter_count}</span>
          <small>max-retry escalations</small>
        </div>
        <div className="metric-card">
          <span className="metric-card__label">Total runs</span>
          <span className="metric-card__value">{metrics.counts.total_runs}</span>
          <small>{metrics.counts.escalations} escalation{metrics.counts.escalations === 1 ? '' : 's'}</small>
        </div>
      </div>

      <div className="metrics-breakdown">
        <div className="metrics-breakdown__col">
          <h4>Time per agent</h4>
          <ul>
            {['po-agent', 'ux-agent', 'dev-agent', 'qa-agent'].map((stage) => (
              <li key={stage}>
                <span>{STAGE_LABELS[stage]}</span>
                <b>{formatDuration(metrics.time_per_agent?.[stage]?.avg_seconds ?? null)}</b>
                <small>{metrics.time_per_agent?.[stage]?.runs ?? 0} run(s)</small>
              </li>
            ))}
          </ul>
        </div>
        <div className="metrics-breakdown__col">
          <h4>Rerun count per stage</h4>
          {rerunStages.length ? (
            <ul>
              {rerunStages.map(([stage, count]) => (
                <li key={stage}><span>{STAGE_LABELS[stage] || stage}</span><b>{count}</b></li>
              ))}
            </ul>
          ) : <p className="metrics-breakdown__none">No reruns.</p>}
        </div>
        <div className="metrics-breakdown__col">
          <h4>Gate failure reasons</h4>
          {failureReasons.length ? (
            <ul>
              {failureReasons.map(([reason, count]) => (
                <li key={reason}><span>{reason.replace(/_/g, ' ')}</span><b>{count}</b></li>
              ))}
            </ul>
          ) : <p className="metrics-breakdown__none">No gate failures.</p>}
        </div>
      </div>
    </div>
  );
}
