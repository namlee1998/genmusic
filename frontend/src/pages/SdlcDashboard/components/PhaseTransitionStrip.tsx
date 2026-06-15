import { ArrowRight, GitCommit, User } from 'lucide-react';
import type { PhaseTransition } from '@/store/useSdlcStore';

const fmtTime = (iso: string) => {
  try { return new Date(iso).toLocaleTimeString(); } catch { return iso; }
};

const toneFor = (to: string): { bg: string; border: string; text: string } => {
  if (/FAILED|REJECTED|INVALID|MAX_RETRY/.test(to)) {
    return { bg: 'bg-red-500/10', border: 'border-red-500/20', text: 'text-red-400' };
  }
  if (/RELEASED|APPROVED|HANDOFF/.test(to)) {
    return { bg: 'bg-[#10b981]/10', border: 'border-[#10b981]/20', text: 'text-[#10b981]' };
  }
  if (/REVIEW|HOLD|DRAFTED/.test(to)) {
    return { bg: 'bg-amber-500/10', border: 'border-amber-500/20', text: 'text-amber-400' };
  }
  return { bg: 'bg-blue-500/10', border: 'border-blue-500/20', text: 'text-blue-400' };
};

export default function PhaseTransitionStrip({ transitions }: { transitions: PhaseTransition[] }) {
  if (!transitions?.length) {
    return (
      <div className="bg-[#11131a]/40 border border-[#1e293b]/60 rounded-xl p-6 text-center text-slate-500 italic text-xs">
        No phase transitions recorded yet.
      </div>
    );
  }

  return (
    <div className="w-full overflow-x-auto custom-scrollbar pb-3">
      <ol className="flex gap-4 p-0 m-0 list-none min-w-max">
        {transitions.map((t, i) => {
          const tone = toneFor(t.to);
          return (
            <li 
              key={`${t.at}-${i}`} 
              className={`flex flex-col gap-2 p-3.5 rounded-xl border bg-[#11131a]/60 border-[#1e293b] shadow-sm max-w-[240px] ${tone.border}`}
            >
              {/* State Transition Indicator */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] font-bold text-slate-400 font-mono px-1.5 py-0.5 rounded bg-slate-900 border border-[#1e293b]">
                  {t.from}
                </span>
                <ArrowRight size={12} className="text-slate-500" />
                <span className={`text-[10px] font-bold font-mono px-1.5 py-0.5 rounded ${tone.bg} ${tone.text}`}>
                  {t.to}
                </span>
              </div>

              {/* Cause & Metadata */}
              <div className="flex flex-col gap-1 mt-1">
                <span className="text-[11px] font-medium text-slate-300 line-clamp-2 leading-relaxed">
                  {t.cause.replace(/_/g, ' ')}
                </span>
                <div className="flex items-center justify-between gap-2 mt-1 border-t border-[#1e293b]/40 pt-1.5">
                  <span className="text-[9px] text-slate-500 font-mono flex items-center gap-1">
                    <User size={10} /> {t.agent ? t.agent.replace('-agent', '').toUpperCase() : 'SYSTEM'}
                  </span>
                  <span className="text-[9px] text-slate-500 font-mono">
                    {fmtTime(t.at)}
                  </span>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
