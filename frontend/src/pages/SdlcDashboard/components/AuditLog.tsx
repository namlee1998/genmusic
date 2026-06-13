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

  const actorClasses = (actor: string) => {
    return {
      PO: 'bg-blue-500/12 text-blue-300',
      UX: 'bg-pink-500/12 text-pink-300',
      DEV: 'bg-indigo-500/12 text-indigo-300',
      QA: 'bg-emerald-500/12 text-emerald-300',
      A2A: 'bg-purple-500/12 text-purple-300',
      SYSTEM: 'bg-slate-500/12 text-slate-300',
      USER: 'bg-amber-500/12 text-amber-300',
    }[actor] || 'bg-slate-500/12 text-slate-300';
  };

  return (
    <div className="mx-[18px] my-4 p-5 bg-gradient-to-br from-[#30293b]/40 to-[#0d0e13]/98 border border-[#1e293b] rounded-lg shadow-[0_10px_30px_rgba(0,0,0,0.25)]">
      <div className="flex items-center justify-between border-b border-[#1e293b] pb-3 mb-4 flex-wrap gap-2.5">
        <div className="flex items-center gap-2">
          <ClipboardList className="text-blue-400" size={20} />
          <h3 className="text-base font-bold text-white m-0">Realtime Audit Ledger</h3>
        </div>
        <div className="flex items-center gap-1.5">
          <Filter size={12} className="text-slate-400 mr-1" />
          {filters.map(f => (
            <button
              key={f}
              type="button"
              className={`bg-white/2 border border-[#1e293b] rounded text-[10px] font-mono font-semibold px-2 py-1 cursor-pointer transition-all duration-150 text-[#908fa0] hover:text-white hover:bg-white/5 ${activeFilter === f ? 'bg-indigo-500/10 border-indigo-500/40 text-indigo-300' : ''}`}
              onClick={() => setActiveFilter(f)}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="w-full">
        <div className="max-h-[250px] overflow-y-auto flex flex-col gap-2 pr-1 custom-scrollbar">
          {filteredLog.length === 0 ? (
            <div className="p-5 text-center text-slate-500 italic text-[12px]">
              No audit entries recorded for this filter scope.
            </div>
          ) : (
            filteredLog.map((entry, idx) => (
              <div key={idx} className="flex items-center gap-3 text-[12px] px-2 py-1.5 rounded bg-black/15 border border-[#1e293b]/20">
                <span className="font-mono text-slate-500 text-[10px] min-w-[65px]">{entry.timestamp}</span>
                <span className={`font-mono font-bold min-w-[50px] px-1.5 py-0.5 rounded text-[9px] text-center tracking-wider ${actorClasses(entry.actor)}`}>
                  {entry.actor}
                </span>
                <span className="flex-1 text-slate-300">
                  {entry.action}
                </span>
                <span className="text-[10px]">
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
