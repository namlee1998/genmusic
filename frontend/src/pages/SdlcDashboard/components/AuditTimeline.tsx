import { useState, useMemo } from 'react';
import type { AuditEvent } from '@/store/useSdlcStore';

const EVENT_ICONS: Record<string, string> = {
  agent_run: '▶️',
  agent_complete: '⚙️',
  hitl_decision: '👤',
};

const DECISION_COLORS: Record<string, string> = {
  APPROVE: '#10b981',
  REJECT: '#ef4444',
  REQUEST_CHANGES: '#f59e0b',
};

const DECISION_LABELS: Record<string, string> = {
  APPROVE: 'Phê duyệt (Approve)',
  REJECT: 'Từ chối (Reject)',
  REQUEST_CHANGES: 'Yêu cầu Rework',
};

interface Props {
  events: AuditEvent[];
}

export default function AuditTimeline({ events }: Props) {
  const [actorFilter, setActorFilter] = useState<'ALL' | 'SYSTEM' | 'AGENT' | 'HUMAN'>('ALL');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'agent_run' | 'agent_complete' | 'hitl_decision'>('ALL');

  // Xử lý và tính toán thêm metadata (Phase & Version) cho các event (Task 3.1)
  const enrichedEvents = useMemo(() => {
    // Sắp xếp các event theo thời gian từ cũ đến mới để tính version chuẩn
    const sorted = [...events].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    const phaseRunCounts: Record<string, number> = {};

    return sorted.map((ev) => {
      // Derive phase
      let phase = ev.phase;
      if (!phase) {
        const actorLower = (ev.actor || '').toLowerCase();
        let derivedPhase = 'System';
        if (actorLower.includes('po') || actorLower.includes('requirement')) {
          derivedPhase = 'PO Agent';
        } else if (actorLower.includes('ux') || actorLower.includes('design')) {
          derivedPhase = 'UX Agent';
        } else if (actorLower.includes('dev') || actorLower.includes('code')) {
          derivedPhase = 'DEV Agent';
        } else if (actorLower.includes('qa') || actorLower.includes('test')) {
          derivedPhase = 'QA Agent';
        } else if (ev.gate) {
          if (ev.gate.includes('REQUIREMENT')) derivedPhase = 'PO Agent';
          else if (ev.gate.includes('UX')) derivedPhase = 'UX Agent';
          else if (ev.gate.includes('DEV')) derivedPhase = 'DEV Agent';
          else if (ev.gate.includes('QA')) derivedPhase = 'QA Agent';
        }
        phase = derivedPhase;
      }

      // Calculate version (Task 3.1 - Version tracking)
      let version = ev.artifact_version;
      if (!version) {
        let derivedVersion = 'v1';
        if (ev.type === 'agent_run') {
          const currentCount = (phaseRunCounts[phase] || 0) + 1;
          phaseRunCounts[phase] = currentCount;
          derivedVersion = `v${currentCount}`;
        } else {
          // Với complete hoặc decision, lấy count hiện tại của phase đó
          derivedVersion = `v${phaseRunCounts[phase] || 1}`;
        }
        version = derivedVersion;
      } else {
        const parsed = parseInt(version.replace(/[^\d]/g, ''), 10);
        if (!isNaN(parsed)) {
          phaseRunCounts[phase] = Math.max(phaseRunCounts[phase] || 0, parsed);
        }
      }

      // Phân loại Actor cho bộ lọc
      let actorCategory: 'SYSTEM' | 'AGENT' | 'HUMAN' = 'SYSTEM';
      if (ev.type === 'hitl_decision') {
        actorCategory = 'HUMAN';
      } else if (actorLower.includes('agent') || actorLower.includes('bot') || ev.type.startsWith('agent_')) {
        actorCategory = 'AGENT';
      }

      return {
        ...ev,
        phase,
        version,
        actorCategory,
      };
    });
  }, [events]);

  // Lọc danh sách event
  const filteredEvents = useMemo(() => {
    // Sắp xếp hiển thị từ mới nhất lên đầu tiên
    return enrichedEvents
      .filter((ev) => {
        if (actorFilter !== 'ALL' && ev.actorCategory !== actorFilter) return false;
        if (typeFilter !== 'ALL' && ev.type !== typeFilter) return false;
        return true;
      })
      .reverse();
  }, [enrichedEvents, actorFilter, typeFilter]);

  if (events.length === 0) {
    return (
      <div className="audit-empty py-12 flex flex-col items-center justify-center text-on-surface-variant">
        <div className="audit-empty__icon text-4xl mb-3">📜</div>
        <p className="text-sm font-semibold">Chưa có lịch sử duyệt (Audit Trail)</p>
        <p className="text-xs opacity-70 mt-1">Chạy Agent hoặc thực hiện kiểm duyệt để xem timeline.</p>
      </div>
    );
  }

  return (
    <div className="audit-timeline-container flex flex-col h-full min-h-0 bg-surface-container p-4 rounded-lg border border-outline-variant/20">
      {/* Control Bar: Bộ Lọc (Task 3.1) */}
      <div className="audit-filters flex flex-wrap gap-4 items-center justify-between border-b border-outline-variant/20 pb-3 mb-4">
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-[10px] uppercase font-bold tracking-wider text-on-surface-variant flex items-center gap-1">
            <span className="material-symbols-outlined text-xs">filter_alt</span> Lọc theo vai trò:
          </span>
          {(['ALL', 'HUMAN', 'AGENT', 'SYSTEM'] as const).map((filter) => (
            <button
              key={filter}
              onClick={() => setActorFilter(filter)}
              className={`px-2.5 py-1 rounded text-[10px] font-semibold transition-all ${
                actorFilter === filter
                  ? 'bg-primary text-on-primary'
                  : 'bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant'
              }`}
            >
              {filter === 'ALL' ? 'Tất cả' : filter}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-[10px] uppercase font-bold tracking-wider text-on-surface-variant flex items-center gap-1">
            <span className="material-symbols-outlined text-xs">category</span> Loại sự kiện:
          </span>
          {(['ALL', 'agent_run', 'agent_complete', 'hitl_decision'] as const).map((filter) => (
            <button
              key={filter}
              onClick={() => setTypeFilter(filter)}
              className={`px-2.5 py-1 rounded text-[10px] font-semibold transition-all ${
                typeFilter === filter
                  ? 'bg-primary text-on-primary'
                  : 'bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant'
              }`}
            >
              {filter === 'ALL'
                ? 'Tất cả'
                : filter === 'agent_run'
                ? 'Run Agent'
                : filter === 'agent_complete'
                ? 'Complete'
                : 'HITL Gate'}
            </button>
          ))}
        </div>
      </div>

      {/* Timeline list */}
      <div className="audit-timeline flex-1 overflow-y-auto pr-1 flex flex-col gap-4 custom-scrollbar max-h-[500px]">
        {filteredEvents.length === 0 ? (
          <div className="text-center py-10 text-xs text-on-surface-variant">
            Không tìm thấy sự kiện nào khớp với bộ lọc.
          </div>
        ) : (
          filteredEvents.map((ev, i) => (
            <div key={i} className={`audit-event audit-event--${ev.type} flex gap-3 relative`}>
              {/* Line connector */}
              {i < filteredEvents.length - 1 && (
                <div className="absolute left-[13px] top-[26px] bottom-[-22px] w-[2px] bg-outline-variant/30 z-0" />
              )}

              {/* Dot Icon */}
              <div
                className="audit-event__dot w-7 h-7 rounded-full flex items-center justify-center text-xs shrink-0 z-10 border border-outline-variant/40"
                style={{
                  background: ev.decision
                    ? `${DECISION_COLORS[ev.decision]}20`
                    : 'rgba(255,255,255,0.03)',
                  borderColor: ev.decision
                    ? DECISION_COLORS[ev.decision]
                    : 'var(--outline-variant)',
                  color: ev.decision ? DECISION_COLORS[ev.decision] : '#fff',
                }}
              >
                {EVENT_ICONS[ev.type] || '•'}
              </div>

              {/* Body */}
              <div className="audit-event__body flex-1 bg-surface-container-high/40 border border-outline-variant/10 rounded-lg p-3 flex flex-col gap-1.5">
                <div className="audit-event__header flex items-center justify-between flex-wrap gap-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="audit-event__actor text-xs font-bold text-on-surface">
                      {ev.actor}
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-surface-container-highest border border-outline-variant/30 text-on-surface-variant font-mono">
                      {ev.phase}
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-primary/10 border border-primary/20 text-primary font-mono">
                      {ev.version}
                    </span>
                  </div>
                  <span className="audit-event__time text-[9px] text-on-surface-variant font-mono">
                    {new Date(ev.timestamp).toLocaleTimeString()} {new Date(ev.timestamp).toLocaleDateString()}
                  </span>
                </div>

                <div className="audit-event__action text-xs text-on-surface-variant leading-relaxed">
                  {ev.type === 'hitl_decision' ? (
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-1.5">
                        <span>Đã kiểm duyệt chất lượng:</span>
                        <span
                          className="font-bold px-1.5 py-0.5 rounded text-[10px]"
                          style={{
                            backgroundColor: `${DECISION_COLORS[ev.decision || '']}20`,
                            color: DECISION_COLORS[ev.decision || ''],
                          }}
                        >
                          {DECISION_LABELS[ev.decision || ''] || ev.decision}
                        </span>
                      </div>
                      {ev.comment && (
                        <div className="audit-event__comment text-xs font-medium italic text-on-surface bg-surface-container-highest/50 border border-outline-variant/20 rounded p-2 mt-1">
                          💬 &quot;{ev.comment}&quot;
                        </div>
                      )}
                    </div>
                  ) : (
                    ev.action.replace(/_/g, ' ')
                  )}
                </div>

                {ev.taskId && (
                  <div className="audit-event__meta text-[9px] text-on-surface-variant font-mono opacity-80 mt-1">
                    Task ID: <code>{ev.taskId.slice(0, 8)}…</code>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
