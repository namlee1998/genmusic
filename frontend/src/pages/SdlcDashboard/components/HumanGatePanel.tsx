import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import * as sdlcApi from '@/services/api/sdlcApi';
import type { Artifact } from '@/store/useSdlcStore';
import ReactMarkdown from 'react-markdown';

interface Props {
  taskId: string;
  onDecision: (decision: 'APPROVE' | 'REJECT' | 'REQUEST_CHANGES', comment: string) => Promise<void>;
  onClose: () => void;
}

const DECISIONS = [
  { value: 'APPROVE' as const,          label: 'Approve',          icon: '✅', cls: 'gate-btn--approve',  desc: 'Output đạt yêu cầu. Tiếp tục phase tiếp theo.' },
  { value: 'REQUEST_CHANGES' as const,  label: 'Request Changes',  icon: '🔄', cls: 'gate-btn--changes',  desc: 'Cần chỉnh sửa. Agent sẽ chạy lại với feedback.' },
  { value: 'REJECT' as const,           label: 'Reject',           icon: '❌', cls: 'gate-btn--reject',   desc: 'Output không đạt. Tạm dừng workflow.' },
];

export default function HumanGatePanel({ taskId, onDecision, onClose }: Props) {
  const [selected, setSelected] = useState<typeof DECISIONS[number]['value'] | null>(null);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [activeArtIdx, setActiveArtIdx] = useState(0);
  const [fetchLoading, setFetchLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Reset state when taskId changes (during rendering to avoid useEffect warning)
  const [prevTaskId, setPrevTaskId] = useState(taskId);
  if (taskId !== prevTaskId) {
    setPrevTaskId(taskId);
    setArtifacts([]);
    setActiveArtIdx(0);
    setFetchLoading(true);
    setFetchError(null);
    setSelected(null);
    setComment('');
  }

  useEffect(() => {
    let active = true;
    sdlcApi.getSdlcTaskStatus(taskId)
      .then((task) => {
        if (!active) return;
        setArtifacts(task?.artifacts || []);
        setFetchLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        console.error('Failed to fetch artifacts for human gate', err);
        setFetchError('Không thể tải các artifact để xem trước.');
        setFetchLoading(false);
      });
    return () => { active = false; };
  }, [taskId]);

  const handleSubmit = async () => {
    if (!selected) return;
    setLoading(true);
    try {
      await onDecision(selected, comment);
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const activeArtifact = artifacts[activeArtIdx] || null;

  return (
    <div className="gate-panel gate-panel--split">
      {/* Cột trái: Xem trước Artifact */}
      <div className="gate-panel__preview flex flex-col min-h-0 bg-[#0d0e13] border border-outline-variant/30 rounded-lg p-5">
        <h3 className="text-sm font-bold uppercase tracking-wider text-on-surface-variant mb-4 flex items-center gap-2">
          <span className="material-symbols-outlined text-base">visibility</span> Preview Output Artifacts
        </h3>
        
        {fetchLoading ? (
          <div className="flex-1 flex flex-col items-center justify-center py-10 gap-3 text-on-surface-variant">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-primary"></div>
            <span className="text-xs">Đang tải tài liệu review...</span>
          </div>
        ) : fetchError ? (
          <div className="flex-1 flex flex-col items-center justify-center py-10 text-error gap-2 text-xs">
            <span className="material-symbols-outlined text-3xl">error_outline</span>
            <span>{fetchError}</span>
          </div>
        ) : artifacts.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center py-10 text-on-surface-variant gap-2 text-xs">
            <span className="material-symbols-outlined text-3xl">description</span>
            <span>Không tìm thấy artifact nào cho task này.</span>
          </div>
        ) : (
          <div className="flex-1 flex flex-col min-h-0 gap-3">
            {/* Hàng Tabs chọn Artifact */}
            <div className="flex flex-wrap gap-1.5 border-b border-outline-variant/20 pb-2">
              {artifacts.map((art, idx) => (
                <button
                  key={art.id}
                  onClick={() => setActiveArtIdx(idx)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
                    idx === activeArtIdx
                      ? 'bg-primary/20 text-primary border border-primary/40'
                      : 'bg-surface-container-high/40 hover:bg-surface-container-high text-on-surface-variant border border-transparent'
                  }`}
                >
                  {art.title || art.type.toUpperCase()}
                </button>
              ))}
            </div>

            {/* Nội dung Artifact */}
            <div className="flex-1 overflow-y-auto mt-2 pr-1 max-h-[460px] text-xs leading-relaxed text-on-surface select-text custom-scrollbar">
              {activeArtifact ? (
                activeArtifact.contentText ? (
                  <div className="prose prose-invert max-w-none prose-xs">
                    <ReactMarkdown>{activeArtifact.contentText}</ReactMarkdown>
                  </div>
                ) : activeArtifact.contentJson ? (
                  <pre className="bg-[#050505] p-4 rounded border border-outline-variant/20 overflow-x-auto text-[10px] font-mono text-[#9cdcfe]">
                    {JSON.stringify(activeArtifact.contentJson, null, 2)}
                  </pre>
                ) : (
                  <div className="text-center py-10 text-on-surface-variant">Tài liệu rỗng.</div>
                )
              ) : null}
            </div>
          </div>
        )}
      </div>

      {/* Cột phải: Decision Form */}
      <div className="gate-panel__form flex flex-col gap-5 justify-between">
        <div>
          <div className="gate-panel__header mb-4">
            <h2 className="flex items-center gap-2 text-base font-bold text-on-surface">
              <span className="material-symbols-outlined text-primary">gavel</span> Human Quality Gate
            </h2>
            <p className="gate-panel__sub text-xs text-on-surface-variant">
              Task <code>{taskId.slice(0, 8)}…</code> — Đưa ra quyết định phê duyệt
            </p>
          </div>

          <div className="gate-decisions flex flex-col gap-2">
            {DECISIONS.map((d) => (
              <motion.button
                key={d.value}
                className={`gate-btn ${d.cls} ${selected === d.value ? 'gate-btn--selected' : ''}`}
                onClick={() => setSelected(d.value)}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
              >
                <span className="gate-btn__icon">{d.icon}</span>
                <div>
                  <div className="gate-btn__label text-xs font-semibold">{d.label}</div>
                  <div className="gate-btn__desc text-[10px] text-on-surface-variant mt-0.5">{d.desc}</div>
                </div>
              </motion.button>
            ))}
          </div>

          <div className="gate-comment mt-4">
            <label className="text-xs font-semibold text-on-surface-variant block mb-1">
              Nhận xét / Feedback {selected === 'REQUEST_CHANGES' && <span className="gate-required text-warning">(yêu cầu bắt buộc)</span>}
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              placeholder="Nhận xét, lý do thay đổi hoặc ghi chú cho Agent..."
              className="gate-textarea text-xs w-full bg-[#050505] border border-outline-variant/30 rounded-lg p-2.5 text-on-surface focus:outline-none focus:border-primary"
            />
          </div>
        </div>

        <div className="gate-actions flex items-center justify-end gap-3 pt-3 border-t border-outline-variant/20">
          <button onClick={onClose} className="gate-cancel px-4 py-2 border border-outline-variant/30 rounded-lg text-xs hover:bg-surface-container-high/40 transition-colors">
            Hủy
          </button>
          <motion.button
            onClick={handleSubmit}
            disabled={!selected || loading || (selected === 'REQUEST_CHANGES' && !comment.trim())}
            className="gate-submit px-4 py-2 bg-primary text-on-primary text-xs font-bold rounded-lg hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            {loading ? '⏳ Đang gửi...' : `Gửi Quyết Định: ${selected || '—'}`}
          </motion.button>
        </div>
      </div>
    </div>
  );
}
