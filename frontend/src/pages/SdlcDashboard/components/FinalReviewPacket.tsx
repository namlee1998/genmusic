import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import * as sdlcApi from '@/services/api/sdlcApi';
import type { Artifact } from '@/store/useSdlcStore';

interface HitlDecisionData {
  id: string;
  gate: string;
  decision: 'APPROVE' | 'REJECT' | 'REQUEST_CHANGES';
  comment: string;
  createdAt: string;
}

interface ReviewPacket {
  phases: Record<string, { taskId: string; status: string; versionStatus: string } | null>;
  artifacts: Artifact[];
  hitlDecisions: HitlDecisionData[];
  generatedAt: string;
}

const DECISION_COLORS: Record<string, string> = {
  APPROVE: '#10b981',
  REJECT: '#ef4444',
  REQUEST_CHANGES: '#f59e0b',
};

interface Props {
  projectId: string;
}

export default function FinalReviewPacket({ projectId }: Props) {
  const [packet, setPacket] = useState<ReviewPacket | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [released, setReleased] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);

  // Reset state when projectId changes (during rendering to avoid useEffect warning)
  const [prevProjectId, setPrevProjectId] = useState(projectId);
  if (projectId !== prevProjectId) {
    setPrevProjectId(projectId);
    setPacket(null);
    setLoading(true);
    setError(null);
    setReleased(false);
    setShowConfetti(false);
  }

  useEffect(() => {
    let active = true;
    sdlcApi.getFinalReviewPacket(projectId)
      .then((data) => {
        if (!active) return;
        setPacket(data);
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        console.error('Failed to load final review packet', err);
        setError('Không thể tải gói bàn giao sản phẩm cuối.');
        setLoading(false);
      });

    return () => { active = false; };
  }, [projectId]);

  const handleExportMarkdown = () => {
    if (!packet) return;

    let doc = `# BÁO CÁO GÓI BÀN GIAO SẢN PHẨM (RELEASE REPORT)\n`;
    doc += `*Dự án ID:* ${projectId}\n`;
    doc += `*Thời gian tạo:* ${new Date(packet.generatedAt).toLocaleString()}\n\n`;

    doc += `## 1. TRẠNG THÁI CÁC PHASES\n`;
    Object.entries(packet.phases).forEach(([phase, data]) => {
      doc += `- **${phase.toUpperCase()} Agent:** ${data ? `${data.status} (${data.versionStatus})` : 'Idle'}\n`;
    });
    doc += `\n`;

    doc += `## 2. DANH SÁCH TÀI LIỆU BÀN GIAO\n`;
    packet.artifacts.forEach((art) => {
      doc += `### 📄 ${art.title || art.type.toUpperCase()} (${art.phase})\n`;
      if (art.contentText) {
        // Remove markdown headers or prepend spaces to avoid formatting clash
        doc += `${art.contentText.slice(0, 1000)}${art.contentText.length > 1000 ? '\n\n... (xem chi tiết trong app) ...' : ''}\n\n`;
      } else if (art.contentJson) {
        doc += `\`\`\`json\n${JSON.stringify(art.contentJson, null, 2).slice(0, 1000)}\n\`\`\`\n\n`;
      }
    });

    // Copy to clipboard
    navigator.clipboard.writeText(doc).then(() => {
      alert('Đã sao chép báo cáo Markdown tổng hợp vào clipboard!');
    }).catch(() => {
      alert('Không thể sao chép tự động. Hãy xem chi tiết trên giao diện.');
    });
  };

  const handleRelease = () => {
    setReleased(true);
    setShowConfetti(true);
    setTimeout(() => {
      setShowConfetti(false);
    }, 4000);
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-12 text-on-surface-variant gap-3">
        <div className="animate-spin rounded-full h-10 w-8 border-t-2 border-primary"></div>
        <span className="text-sm">Đang biên soạn gói bàn giao sản phẩm...</span>
      </div>
    );
  }

  if (error || !packet) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-12 text-error gap-2">
        <span className="material-symbols-outlined text-4xl">error_outline</span>
        <span className="text-sm">{error || 'Không thể tải gói sản phẩm.'}</span>
      </div>
    );
  }

  // Count active artifacts by category
  const prdCount = packet.artifacts.filter(a => a.phase === 'po-agent').length;
  const uxCount = packet.artifacts.filter(a => a.phase === 'ux-agent').length;
  const devCount = packet.artifacts.filter(a => a.phase === 'dev-agent').length;
  const qaCount = packet.artifacts.filter(a => a.phase === 'qa-agent').length;

  return (
    <div className="final-review flex flex-col gap-6 p-6 overflow-y-auto max-h-[85vh] bg-[#090a0f] text-on-surface custom-scrollbar">
      {/* Confetti simulation (Task 5.2 - micro-animations) */}
      {showConfetti && (
        <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden flex items-center justify-center bg-primary/10 backdrop-blur-sm">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            className="bg-surface-container border border-success px-8 py-6 rounded-2xl shadow-2xl flex flex-col items-center gap-3 text-center"
          >
            <span className="text-4xl">🎉🚀✨</span>
            <h2 className="text-lg font-bold text-success">RELEASED TO PRODUCTION!</h2>
            <p className="text-xs text-on-surface-variant max-w-xs">
              Toàn bộ gói sản phẩm phần mềm (PRD, UX Specs, DEV Plan, QA Testcases) đã được đóng dấu kiểm định và sẵn sàng triển khai!
            </p>
          </motion.div>
        </div>
      )}

      {/* Header Banner */}
      <div className="flex justify-between items-start flex-wrap gap-4 border border-outline-variant/30 rounded-xl bg-gradient-to-r from-primary/10 to-secondary/10 p-6">
        <div>
          <h1 className="text-lg font-bold text-on-surface flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-2xl">package_2</span> Final Software Release Packet
          </h1>
          <p className="text-xs text-on-surface-variant mt-1.5">
            Biên soạn tự động toàn bộ kết quả phát triển phần mềm của 5 Agent qua 4 Quality Gates
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleExportMarkdown}
            className="px-4 py-2 border border-outline-variant/30 hover:bg-surface-container-high rounded-lg text-xs font-semibold flex items-center gap-2 text-on-surface transition-colors"
          >
            <span className="material-symbols-outlined text-sm">download</span> Export Report
          </button>
          
          <button
            onClick={handleRelease}
            disabled={released}
            className={`px-5 py-2 rounded-lg text-xs font-bold flex items-center gap-2 text-white transition-all ${
              released
                ? 'bg-success/35 border border-success/40 cursor-not-allowed'
                : 'bg-success hover:scale-[1.02] shadow-lg shadow-success/20'
            }`}
          >
            <span className="material-symbols-outlined text-sm">{released ? 'done' : 'rocket_launch'}</span>
            {released ? 'Released Signed-off' : 'Release to Production'}
          </button>
        </div>
      </div>

      {/* Stats Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'PO Artifacts', val: prdCount, icon: 'description', color: 'text-indigo-400' },
          { label: 'UX Specs', val: uxCount, icon: 'palette', color: 'text-purple-400' },
          { label: 'Code Assets', val: devCount, icon: 'code', color: 'text-blue-400' },
          { label: 'QA Testcases', val: qaCount, icon: 'science', color: 'text-emerald-400' },
        ].map((stat, i) => (
          <div key={i} className="bg-surface-container-high border border-outline-variant/15 rounded-lg p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg bg-surface-container/80 flex items-center justify-center border border-outline-variant/20`}>
              <span className={`material-symbols-outlined ${stat.color} text-lg`}>{stat.icon}</span>
            </div>
            <div>
              <div className="text-[10px] text-on-surface-variant font-medium">{stat.label}</div>
              <div className="text-base font-bold text-on-surface mt-0.5">{stat.val} files</div>
            </div>
          </div>
        ))}
      </div>

      {/* Grid: 2 columns - Left: Artifact list, Right: Gate sign-offs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Left Column: Artifact summaries */}
        <div className="flex flex-col gap-4 border border-outline-variant/20 rounded-xl bg-surface-container p-5">
          <h3 className="text-sm font-bold uppercase tracking-wider text-on-surface-variant mb-2 flex items-center gap-2">
            <span className="material-symbols-outlined text-sm">inventory</span> Compiled Artifact Assets
          </h3>
          
          <div className="flex flex-col gap-2 max-h-[360px] overflow-y-auto pr-1 custom-scrollbar">
            {packet.artifacts.map((art) => (
              <div key={art.id} className="flex items-center justify-between border border-outline-variant/15 hover:border-outline-variant/30 rounded-lg p-3 bg-surface-container-low transition-colors">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="text-base">📄</span>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-on-surface truncate">{art.title}</div>
                    <div className="text-[9px] text-on-surface-variant font-mono mt-0.5">{art.phase.toUpperCase()}</div>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded text-[8px] font-bold bg-[#0d0e13] border border-outline-variant/20 text-primary uppercase font-mono">
                  {art.type}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Right Column: Gate Sign-offs */}
        <div className="flex flex-col gap-4 border border-outline-variant/20 rounded-xl bg-surface-container p-5">
          <h3 className="text-sm font-bold uppercase tracking-wider text-on-surface-variant mb-2 flex items-center gap-2">
            <span className="material-symbols-outlined text-sm">verified_user</span> Gate Sign-offs (HITL decisions)
          </h3>
          
          <div className="flex flex-col gap-3 max-h-[360px] overflow-y-auto pr-1 custom-scrollbar">
            {packet.hitlDecisions.length === 0 ? (
              <div className="text-center py-10 text-xs text-on-surface-variant">Chưa có quyết duyệt chính thức nào.</div>
            ) : (
              packet.hitlDecisions.map((decision) => (
                <div key={decision.id} className="border border-outline-variant/15 rounded-lg p-3 bg-surface-container-low flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-on-surface">{decision.gate.replace('_', ' ')}</span>
                    <span
                      className="px-2 py-0.5 rounded text-[8px] font-bold font-mono"
                      style={{
                        backgroundColor: `${DECISION_COLORS[decision.decision]}20`,
                        color: DECISION_COLORS[decision.decision],
                        border: `1px solid ${DECISION_COLORS[decision.decision]}40`,
                      }}
                    >
                      {decision.decision}
                    </span>
                  </div>
                  {decision.comment && (
                    <div className="text-xs italic text-on-surface-variant bg-surface-container/50 p-2 rounded border border-outline-variant/10">
                      &quot;{decision.comment}&quot;
                    </div>
                  )}
                  <span className="text-[9px] text-on-surface-variant font-mono mt-0.5 text-right">
                    {new Date(decision.createdAt).toLocaleString()}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
