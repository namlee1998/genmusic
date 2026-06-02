import type { AuditEvent } from '@/store/useSdlcStore';

const EVENT_ICONS: Record<string, string> = {
  agent_run: '▶️',
  agent_complete: '✅',
  hitl_decision: '👤',
  a2a_handoff: '↗',
  escalation: '🚨',
  release_decision: '🚀',
  failure: '⛔',
};

const DECISION_COLORS: Record<string, string> = {
  APPROVE: '#10b981', REJECT: '#ef4444', REQUEST_CHANGES: '#f59e0b',
};

interface Props { events: AuditEvent[]; }

export default function AuditTimeline({ events }: Props) {
  if (events.length === 0) {
    return (
      <div className="audit-empty">
        <div className="audit-empty__icon">📜</div>
        <p>No events yet. Run an agent to start building the audit trail.</p>
      </div>
    );
  }

  return (
    <div className="audit-timeline">
      {events.map((ev, i) => (
        <div key={i} className={`audit-event audit-event--${ev.type}`}>
          <div className="audit-event__line" />
          <div className="audit-event__dot"
            style={ev.decision ? { background: DECISION_COLORS[ev.decision] || '#6b7280' } : undefined}>
            {EVENT_ICONS[ev.type] || '•'}
          </div>
          <div className="audit-event__body">
            <div className="audit-event__header">
              <span className="audit-event__actor">{ev.actor}</span>
              <span className="audit-event__action">{ev.action.replace(/_/g, ' ')}</span>
              {ev.severity && <span className={`audit-event__severity audit-event__severity--${ev.severity.toLowerCase()}`}>{ev.severity}</span>}
              <span className="audit-event__time">
                {new Date(ev.timestamp).toLocaleString()}
              </span>
            </div>

            {/* Granular state-machine transition (plan TIP-002 / Scenario D) */}
            {(ev.stateFrom || ev.stateTo) && (
              <div className="audit-event__transition">
                {ev.stateFrom && <code>{ev.stateFrom}</code>}
                {ev.stateFrom && ev.stateTo && <span> → </span>}
                {ev.stateTo && <code>{ev.stateTo}</code>}
              </div>
            )}

            {/* A2A handoff source → target (plan TIP-005) */}
            {ev.type === 'a2a_handoff' && (ev.fromAgent || ev.toAgent) && (
              <div className="audit-event__handoff">
                <code>{ev.fromAgent}</code> → <code>{ev.toAgent}</code>
                {ev.attempt != null && <span className="audit-event__chip">attempt {ev.attempt}</span>}
              </div>
            )}

            <div className="audit-event__tags">
              {ev.versionTag && <span className="audit-event__chip">{ev.versionTag}</span>}
              {ev.type !== 'a2a_handoff' && ev.attempt != null && ev.attempt > 1 && (
                <span className="audit-event__chip">attempt {ev.attempt}</span>
              )}
              {ev.retryReason && <span className="audit-event__chip audit-event__chip--warn">{ev.retryReason}</span>}
              {!!ev.blockingIssueCount && <span className="audit-event__chip audit-event__chip--warn">{ev.blockingIssueCount} blocking issue{ev.blockingIssueCount === 1 ? '' : 's'}</span>}
            </div>

            {ev.comment && (
              <div className="audit-event__comment">💬 &quot;{ev.comment}&quot;</div>
            )}
            {ev.taskId && (
              <div className="audit-event__meta">Task: {ev.taskId.slice(0, 8)}…</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
