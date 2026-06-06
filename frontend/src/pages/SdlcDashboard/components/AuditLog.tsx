import React, { useState } from 'react';
import { useSdlcStore } from '@/store/useSdlcStore';
import { ClipboardList, Filter } from 'lucide-react';

type ActorType = 'ALL' | 'PO' | 'UX' | 'DEV' | 'QA' | 'A2A' | 'SYSTEM' | 'USER';

export default function AuditLog() {
  const { auditLog, status } = useSdlcStore();
  const [activeFilter, setActiveFilter] = useState<ActorType>('ALL');

  if (status === 'idle') return null;

  const filters: ActorType[] = ['ALL', 'SYSTEM', 'A2A', 'PO', 'UX', 'DEV', 'QA', 'USER'];

  const filteredLog = activeFilter === 'ALL' 
    ? auditLog 
    : auditLog.filter(entry => entry.actor === activeFilter);

  return (
    <div className="audit-log-card">
      <div className="audit-log-card__header" style={{ flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ClipboardList className="text-blue-400" size={20} />
          <h3 className="audit-log-card__title">Realtime Audit Ledger</h3>
        </div>
        <div className="audit-log-filters" style={{ alignItems: 'center' }}>
          <Filter size={12} className="text-slate-400" style={{ marginRight: '4px' }} />
          {filters.map(f => (
            <button
              key={f}
              type="button"
              className={`audit-filter-btn ${activeFilter === f ? 'audit-filter-btn--active' : ''}`}
              onClick={() => setActiveFilter(f)}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="audit-log-card__body">
        <div className="audit-log-container">
          {filteredLog.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', color: '#475569', fontStyle: 'italic', fontSize: '12px' }}>
              No audit entries recorded for this filter scope.
            </div>
          ) : (
            filteredLog.map((entry, idx) => (
              <div key={idx} className="audit-log-entry">
                <span className="audit-log-entry__time">{entry.timestamp}</span>
                <span className={`audit-log-entry__actor actor--${entry.actor}`}>
                  {entry.actor}
                </span>
                <span className="audit-log-entry__action">
                  {entry.action}
                </span>
                <span className="audit-log-entry__status">
                  {entry.status === 'ok' && <span className="text-emerald-500">●</span>}
                  {entry.status === 'warning' && <span className="text-amber-500">▲</span>}
                  {entry.status === 'error' && <span className="text-red-500">■</span>}
                  {entry.status === 'pending' && <span className="text-blue-500 animate-pulse">○</span>}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
