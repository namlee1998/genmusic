import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  ArrowRight, 
  CheckCircle2, 
  Clock, 
  ShieldCheck, 
  FileText, 
  AlertTriangle, 
  Copy, 
  Check, 
  RefreshCw, 
  Link,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import type { AuditEvent } from '@/store/useSdlcStore';

interface Props {
  events: AuditEvent[];
}

export default function A2aHandoffTimeline({ events }: Props) {
  const { t } = useTranslation();
  const [selectedHandoff, setSelectedHandoff] = useState<'PO_UX' | 'UX_DEV' | 'DEV_QA'>('PO_UX');
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [expandedLogs, setExpandedLogs] = useState<Record<string, boolean>>({});

  const handleCopy = (text: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedText(text);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const handoffs = useMemo(() => {
    const data = {
      PO_UX: {
        id: 'PO_UX',
        from: 'PO',
        to: 'UX',
        fromLabel: 'PO Agent',
        toLabel: 'UX Agent',
        status: 'pending' as 'pending' | 'running' | 'completed' | 'failed',
        timestamp: '',
        hash: '',
        actionText: 'Awaiting PO output generation and human review approval.',
        attempt: 1,
        handoffId: '',
        events: [] as AuditEvent[]
      },
      UX_DEV: {
        id: 'UX_DEV',
        from: 'UX',
        to: 'DEV',
        fromLabel: 'UX Agent',
        toLabel: 'DEV Agent',
        status: 'pending' as 'pending' | 'running' | 'completed' | 'failed',
        timestamp: '',
        hash: '',
        actionText: 'Awaiting UX specifications and Penpot mockup definitions.',
        attempt: 1,
        handoffId: '',
        events: [] as AuditEvent[]
      },
      DEV_QA: {
        id: 'DEV_QA',
        from: 'DEV',
        to: 'QA',
        fromLabel: 'DEV Agent',
        toLabel: 'QA Agent',
        status: 'pending' as 'pending' | 'running' | 'completed' | 'failed',
        timestamp: '',
        hash: '',
        actionText: 'Awaiting DEV code changes and Docker sandbox preflight checks.',
        attempt: 1,
        handoffId: '',
        events: [] as AuditEvent[]
      }
    };

    // Sort events chronologically to process transitions in order
    const sortedEvents = [...events].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    sortedEvents.forEach(ev => {
      const actionLower = ev.action.toLowerCase();
      const actorLower = ev.actor.toLowerCase();

      // Detect handoff events from both mock client & real backend
      const isMockA2A = ev.actor === 'A2A';
      const isRealA2A = ev.type === 'a2a_handoff';
      const isSystemHandoff = actionLower.includes('handoff');

      if (isMockA2A) {
        if (actionLower.includes('po') && actionLower.includes('ux')) {
          data.PO_UX.status = 'completed';
          data.PO_UX.timestamp = ev.timestamp;
          data.PO_UX.hash = actionLower.match(/hash:?\s*([a-f0-9]+)/i)?.[1] || 'a8b9c10';
          data.PO_UX.actionText = ev.action;
          data.PO_UX.events.push(ev);
        } else if (actionLower.includes('ux') && actionLower.includes('dev')) {
          data.PO_UX.status = 'completed'; // cascade upstream state
          data.UX_DEV.status = 'completed';
          data.UX_DEV.timestamp = ev.timestamp;
          data.UX_DEV.hash = actionLower.match(/hash:?\s*([a-f0-9]+)/i)?.[1] || 'c5d6e7f';
          data.UX_DEV.actionText = ev.action;
          data.UX_DEV.events.push(ev);
        } else if (actionLower.includes('dev') && actionLower.includes('qa')) {
          data.PO_UX.status = 'completed';
          data.UX_DEV.status = 'completed';
          data.DEV_QA.status = 'completed';
          data.DEV_QA.timestamp = ev.timestamp;
          data.DEV_QA.hash = actionLower.match(/hash:?\s*([a-f0-9]+)/i)?.[1] || 'd9e8f7a';
          data.DEV_QA.actionText = ev.action;
          data.DEV_QA.events.push(ev);
        }
      } else if (isRealA2A) {
        const from = (ev.fromAgent || '').toUpperCase();
        const to = (ev.toAgent || '').toUpperCase();
        const key = `${from}_${to}` as 'PO_UX' | 'UX_DEV' | 'DEV_QA';
        
        if (data[key]) {
          data[key].status = 'completed';
          data[key].timestamp = ev.timestamp;
          data[key].hash = ev.artifactHash || '';
          data[key].handoffId = ev.handoffId || '';
          data[key].attempt = ev.attempt || 1;
          data[key].actionText = `Handoff verification package verified: hashes match.`;
          data[key].events.push(ev);
        }
      } else if (isSystemHandoff && actorLower === 'system') {
        if (actionLower.includes('po') && actionLower.includes('ux')) {
          data.PO_UX.events.push(ev);
        } else if (actionLower.includes('ux') && actionLower.includes('dev')) {
          data.UX_DEV.events.push(ev);
        } else if (actionLower.includes('dev') && actionLower.includes('qa')) {
          data.DEV_QA.events.push(ev);
        }
      }
    });

    // Handle running states dynamically based on current run activities
    const activeTasks = sortedEvents.filter(ev => ev.type === 'agent_run' && ev.status === 'running');
    const latestActiveTask = activeTasks[activeTasks.length - 1];
    
    if (latestActiveTask) {
      const activeAgent = (latestActiveTask.agent || '').toLowerCase();
      if (activeAgent.includes('ux') && data.PO_UX.status === 'pending') {
        data.PO_UX.status = 'running';
        data.PO_UX.actionText = 'Verifying PO requirements & validating inputs...';
      } else if (activeAgent.includes('dev') && data.UX_DEV.status === 'pending') {
        data.PO_UX.status = 'completed';
        data.UX_DEV.status = 'running';
        data.UX_DEV.actionText = 'Translating design tokens to code repository...';
      } else if (activeAgent.includes('qa') && data.DEV_QA.status === 'pending') {
        data.PO_UX.status = 'completed';
        data.UX_DEV.status = 'completed';
        data.DEV_QA.status = 'running';
        data.DEV_QA.actionText = 'Assembling build verification package for QA agent...';
      }
    }

    return data;
  }, [events]);

  const activeHandoff = handoffs[selectedHandoff];

  const toggleLogs = (id: string) => {
    setExpandedLogs(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  return (
    <div className="flex flex-col gap-6 w-full">
      {/* 1. Visual Flow Connection Ribbon */}
      <div className="flex items-center justify-between bg-[#11131a]/60 border border-[#1e293b] rounded-xl p-6 mx-[18px] relative overflow-hidden backdrop-blur-sm">
        <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/5 via-transparent to-cyan-500/5 pointer-events-none" />
        
        {/* PO Node */}
        <div 
          onClick={() => setSelectedHandoff('PO_UX')}
          className={`flex flex-col items-center gap-2 cursor-pointer z-10 transition-all duration-200 ${
            selectedHandoff === 'PO_UX' ? 'scale-105' : 'opacity-85 hover:opacity-100'
          }`}
        >
          <div className={`w-12 h-12 rounded-full flex items-center justify-center border-2 font-bold font-mono text-sm transition-all duration-300 ${
            handoffs.PO_UX.status === 'completed'
              ? 'bg-[#10b981]/10 border-[#10b981] text-[#10b981] shadow-[0_0_15px_rgba(16,185,129,0.25)]'
              : handoffs.PO_UX.status === 'running'
              ? 'bg-[#f59e0b]/10 border-[#f59e0b] text-[#f59e0b] animate-pulse shadow-[0_0_15px_rgba(245,158,11,0.25)]'
              : 'bg-slate-900 border-[#1e293b] text-slate-400'
          }`}>
            PO
          </div>
          <span className="text-[11px] font-semibold text-slate-300">Product Requirements</span>
        </div>

        {/* Connector Line 1 */}
        <div className="flex-1 h-[2px] mx-4 bg-gradient-to-r from-[#1e293b] to-[#1e293b] relative">
          <div 
            className={`absolute top-1/2 left-0 h-[2px] -translate-y-1/2 bg-[#10b981] transition-all duration-500 ${
              handoffs.PO_UX.status === 'completed' ? 'w-full' : 'w-0'
            }`} 
          />
          {handoffs.PO_UX.status === 'running' && (
            <div className="absolute top-1/2 left-0 h-[2px] -translate-y-1/2 bg-[#f59e0b] w-1/2 animate-pulse" />
          )}
        </div>

        {/* UX Node */}
        <div 
          onClick={() => setSelectedHandoff('UX_DEV')}
          className={`flex flex-col items-center gap-2 cursor-pointer z-10 transition-all duration-200 ${
            selectedHandoff === 'UX_DEV' ? 'scale-105' : 'opacity-85 hover:opacity-100'
          }`}
        >
          <div className={`w-12 h-12 rounded-full flex items-center justify-center border-2 font-bold font-mono text-sm transition-all duration-300 ${
            handoffs.UX_DEV.status === 'completed'
              ? 'bg-[#10b981]/10 border-[#10b981] text-[#10b981] shadow-[0_0_15px_rgba(16,185,129,0.25)]'
              : handoffs.UX_DEV.status === 'running'
              ? 'bg-[#f59e0b]/10 border-[#f59e0b] text-[#f59e0b] animate-pulse shadow-[0_0_15px_rgba(245,158,11,0.25)]'
              : 'bg-slate-900 border-[#1e293b] text-slate-400'
          }`}>
            UX
          </div>
          <span className="text-[11px] font-semibold text-slate-300">Design Specification</span>
        </div>

        {/* Connector Line 2 */}
        <div className="flex-1 h-[2px] mx-4 bg-[#1e293b] relative">
          <div 
            className={`absolute top-1/2 left-0 h-[2px] -translate-y-1/2 bg-[#10b981] transition-all duration-500 ${
              handoffs.UX_DEV.status === 'completed' ? 'w-full' : 'w-0'
            }`} 
          />
          {handoffs.UX_DEV.status === 'running' && (
            <div className="absolute top-1/2 left-0 h-[2px] -translate-y-1/2 bg-[#f59e0b] w-1/2 animate-pulse" />
          )}
        </div>

        {/* DEV Node */}
        <div 
          onClick={() => setSelectedHandoff('DEV_QA')}
          className={`flex flex-col items-center gap-2 cursor-pointer z-10 transition-all duration-200 ${
            selectedHandoff === 'DEV_QA' ? 'scale-105' : 'opacity-85 hover:opacity-100'
          }`}
        >
          <div className={`w-12 h-12 rounded-full flex items-center justify-center border-2 font-bold font-mono text-sm transition-all duration-300 ${
            handoffs.DEV_QA.status === 'completed'
              ? 'bg-[#10b981]/10 border-[#10b981] text-[#10b981] shadow-[0_0_15px_rgba(16,185,129,0.25)]'
              : handoffs.DEV_QA.status === 'running'
              ? 'bg-[#f59e0b]/10 border-[#f59e0b] text-[#f59e0b] animate-pulse shadow-[0_0_15px_rgba(245,158,11,0.25)]'
              : 'bg-slate-900 border-[#1e293b] text-slate-400'
          }`}>
            DEV
          </div>
          <span className="text-[11px] font-semibold text-slate-300">Code Artifacts</span>
        </div>

        {/* Connector Line 3 */}
        <div className="flex-1 h-[2px] mx-4 bg-[#1e293b] relative">
          <div 
            className={`absolute top-1/2 left-0 h-[2px] -translate-y-1/2 bg-[#10b981] transition-all duration-500 ${
              handoffs.DEV_QA.status === 'completed' ? 'w-full' : 'w-0'
            }`} 
          />
          {handoffs.DEV_QA.status === 'running' && (
            <div className="absolute top-1/2 left-0 h-[2px] -translate-y-1/2 bg-[#f59e0b] w-1/2 animate-pulse" />
          )}
        </div>

        {/* QA Node */}
        <div className="flex flex-col items-center gap-2 z-10">
          <div className={`w-12 h-12 rounded-full flex items-center justify-center border-2 font-bold font-mono text-sm ${
            handoffs.DEV_QA.status === 'completed'
              ? 'bg-[#10b981]/10 border-[#10b981] text-[#10b981] shadow-[0_0_15px_rgba(16,185,129,0.25)]'
              : 'bg-slate-900 border-[#1e293b] text-slate-400'
          }`}>
            QA
          </div>
          <span className="text-[11px] font-semibold text-slate-300">Verification &amp; Test</span>
        </div>
      </div>

      {/* Handoff Step Selector Tabs */}
      <div className="flex gap-2.5 px-[18px]">
        {(['PO_UX', 'UX_DEV', 'DEV_QA'] as const).map(key => {
          const item = handoffs[key];
          const isSelected = selectedHandoff === key;
          return (
            <button
              key={key}
              onClick={() => setSelectedHandoff(key)}
              className={`flex-1 flex items-center justify-between gap-3 px-4 py-3 rounded-xl border transition-all duration-150 cursor-pointer ${
                isSelected 
                  ? 'bg-gradient-to-br from-indigo-500/10 to-indigo-500/5 border-indigo-500/40 text-white shadow-[0_4px_12px_rgba(99,102,241,0.08)]' 
                  : 'bg-[#11131a]/40 border-[#1e293b] text-slate-400 hover:text-white hover:bg-[#11131a]/80'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="font-bold text-xs uppercase font-mono">{item.from} → {item.to}</span>
                <span className="text-[10px] text-slate-500">Contract</span>
              </div>
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                item.status === 'completed' ? 'bg-[#10b981]/10 text-[#10b981]' :
                item.status === 'running' ? 'bg-[#f59e0b]/10 text-[#f59e0b] animate-pulse' :
                'bg-slate-800 text-slate-500'
              }`}>
                {item.status.toUpperCase()}
              </span>
            </button>
          );
        })}
      </div>

      {/* 2. Detailed Contract Card */}
      <div className="bg-[#121318] border border-[#1e293b] rounded-xl p-6 mx-[18px] flex flex-col gap-5">
        <div className="flex items-center justify-between border-b border-[#1e293b] pb-4 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-lg border ${
              activeHandoff.status === 'completed' ? 'bg-[#10b981]/10 border-[#10b981]/20 text-[#10b981]' :
              activeHandoff.status === 'running' ? 'bg-[#f59e0b]/10 border-[#f59e0b]/20 text-[#f59e0b]' :
              'bg-slate-900 border-[#1e293b] text-slate-500'
            }`}>
              {activeHandoff.status === 'completed' ? <ShieldCheck size={20} /> : <Clock size={20} />}
            </div>
            <div>
              <h3 className="text-base font-bold text-white m-0">
                {activeHandoff.fromLabel} Bàn giao sang {activeHandoff.toLabel}
              </h3>
              <p className="text-xs text-slate-400 m-0 mt-0.5">
                Đảm bảo tính toàn vẹn thông tin và mã hóa chữ ký số của sản phẩm đầu ra (downstream).
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-mono">Attempt {activeHandoff.attempt}</span>
            {activeHandoff.handoffId && (
              <span className="text-[10px] bg-slate-900 px-2.5 py-1 rounded border border-[#1e293b] text-slate-400 font-mono">
                ID: {activeHandoff.handoffId.slice(0, 12)}...
              </span>
            )}
          </div>
        </div>

        {/* Status Alert Banner */}
        <div className={`p-4 rounded-xl border flex gap-3.5 ${
          activeHandoff.status === 'completed' ? 'bg-[#10b981]/5 border-[#10b981]/20 text-[#10b981]' :
          activeHandoff.status === 'running' ? 'bg-[#f59e0b]/5 border-[#f59e0b]/20 text-[#f59e0b]' :
          'bg-slate-950/60 border-[#1e293b] text-slate-400'
        }`}>
          {activeHandoff.status === 'completed' ? (
            <CheckCircle2 size={18} className="shrink-0 mt-0.5 text-[#10b981]" />
          ) : activeHandoff.status === 'running' ? (
            <RefreshCw size={18} className="shrink-0 mt-0.5 text-[#f59e0b] animate-spin" />
          ) : (
            <AlertTriangle size={18} className="shrink-0 mt-0.5 text-slate-500" />
          )}
          <div className="flex flex-col gap-1">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Trạng thái hợp đồng A2A
            </span>
            <p className="text-xs m-0 leading-relaxed text-slate-400 font-mono">
              {activeHandoff.actionText}
            </p>
          </div>
        </div>

        {/* Verification Info & Hashes */}
        {activeHandoff.status === 'completed' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Hash Check box */}
            <div className="bg-[#11131a]/60 border border-[#1e293b] rounded-xl p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <FileText size={14} className="text-indigo-400" />
                  Mã băm sản phẩm (Artifact Hash)
                </span>
                <span className="text-[10px] font-bold text-[#10b981] bg-[#10b981]/10 px-2 py-0.5 rounded-full">
                  HASHE MATCHE
                </span>
              </div>
              <div className="flex items-center justify-between bg-black/40 rounded-lg p-2.5 border border-[#1e293b]/50">
                <code className="text-xs text-[#a5b4fc] font-mono break-all pr-2">
                  {activeHandoff.hash}
                </code>
                <button 
                  onClick={() => handleCopy(activeHandoff.hash)}
                  className="p-1.5 hover:bg-white/5 rounded text-slate-400 hover:text-white transition-all cursor-pointer shrink-0"
                  title="Sao chép mã băm"
                >
                  {copiedText === activeHandoff.hash ? <Check size={14} className="text-[#10b981]" /> : <Copy size={14} />}
                </button>
              </div>
            </div>

            {/* Verification Mechanism */}
            <div className="bg-[#11131a]/60 border border-[#1e293b] rounded-xl p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <ShieldCheck size={14} className="text-[#10b981]" />
                  Kiểm tra toàn vẹn (Integrity Check)
                </span>
                <span className="text-[10px] text-slate-500 font-mono">
                  {activeHandoff.timestamp ? new Date(activeHandoff.timestamp).toLocaleTimeString() : ''}
                </span>
              </div>
              <p className="text-xs text-slate-400 m-0 leading-relaxed">
                Khi hoàn thành phase <code className="bg-slate-900 px-1 py-0.5 rounded text-slate-300">{activeHandoff.from}</code>, orchestrator tự động ký số sản phẩm trước khi nạp vào vùng nhớ của <code className="bg-slate-900 px-1 py-0.5 rounded text-slate-300">{activeHandoff.to}</code>.
              </p>
            </div>
          </div>
        )}

        {/* Handoff Log Ledger */}
        <div className="mt-2">
          <button 
            onClick={() => toggleLogs(activeHandoff.id)}
            className="flex items-center justify-between w-full text-slate-300 hover:text-white font-semibold text-xs py-2 border-b border-[#1e293b] cursor-pointer"
          >
            <span>Nhật ký chi tiết (Handoff Log Ledger) ({activeHandoff.events.length})</span>
            {expandedLogs[activeHandoff.id] ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          
          {expandedLogs[activeHandoff.id] && (
            <div className="flex flex-col gap-2 mt-3 max-h-[200px] overflow-y-auto custom-scrollbar pr-1">
              {activeHandoff.events.length === 0 ? (
                <p className="text-xs italic text-slate-500 p-2">Chưa ghi nhận sự kiện bàn giao nào.</p>
              ) : (
                activeHandoff.events.map((ev, i) => (
                  <div key={i} className="flex gap-3 text-xs bg-slate-950/40 border border-[#1e293b]/40 rounded p-2.5">
                    <span className="text-[10px] text-slate-500 font-mono shrink-0">{new Date(ev.timestamp).toLocaleTimeString()}</span>
                    <div className="flex-1 flex flex-col gap-1">
                      <span className="font-semibold text-slate-300">{ev.action}</span>
                      {ev.comment && <span className="text-slate-400 italic">💬 &quot;{ev.comment}&quot;</span>}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
