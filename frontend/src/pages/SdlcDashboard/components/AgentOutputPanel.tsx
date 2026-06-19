import { useEffect, useState } from 'react';
import { X, Check, RefreshCw, AlertTriangle } from 'lucide-react';
import { getSdlcTaskStatus, resolveOutputReviewGate, type GateItem } from '@/services/api/sdlcApi';

interface TaskArtifact {
  id: string;
  type: string;
  title: string;
  contentText: string | null;
  contentJson: unknown | null;
}

interface AgentOutputPanelProps {
  agent: 'PO' | 'UX' | 'DEV' | 'QA';
  gate: GateItem;
  onClose: () => void;
  onResolved: () => void;
}

const AGENT_LABEL: Record<string, string> = {
  PO: 'Product Owner', UX: 'UI/UX Designer', DEV: 'Developer', QA: 'Quality Assurance',
};

export default function AgentOutputPanel({ agent, gate, onClose, onResolved }: AgentOutputPanelProps) {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<string | null>(null);
  const [artifacts, setArtifacts] = useState<TaskArtifact[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!gate.taskId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    getSdlcTaskStatus(gate.taskId)
      .then((task) => {
        if (cancelled) return;
        setSummary(task?.result?.summary || gate.payload.outputSummary || null);
        setArtifacts(Array.isArray(task?.artifacts) ? task.artifacts : []);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : 'Failed to load agent output');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [gate.taskId, gate.payload.outputSummary]);

  const handleApprove = async () => {
    setSubmitting(true);
    setActionError(null);
    try {
      await resolveOutputReviewGate(gate.id, 'approve');
      onResolved();
      onClose();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Failed to approve');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!reason.trim()) return;
    setSubmitting(true);
    setActionError(null);
    try {
      await resolveOutputReviewGate(gate.id, 'reject', reason.trim());
      onResolved();
      onClose();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Failed to reject');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] flex justify-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-md h-full bg-surface-container-lowest border-l border-outline-variant shadow-2xl flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-outline-variant shrink-0">
          <div>
            <h2 className="text-sm font-bold text-on-surface">{AGENT_LABEL[agent]} Output</h2>
            <p className="text-[10.5px] text-on-surface-variant mt-0.5">Review the completed output, then approve or reject.</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-variant text-on-surface-variant hover:text-on-surface transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 flex flex-col gap-4">
          {loading && (
            <div className="animate-pulse flex flex-col gap-3">
              <div className="w-full h-16 bg-surface-container-high rounded-xl" />
              <div className="w-full h-32 bg-surface-container-high rounded-xl" />
            </div>
          )}

          {loadError && (
            <div className="flex items-center gap-2 p-3 bg-error/10 border border-error/20 rounded-lg text-error text-[11px]">
              <AlertTriangle size={14} />
              {loadError}
            </div>
          )}

          {!loading && !loadError && (
            <>
              {summary && (
                <div className="p-3 bg-surface-container/60 border border-outline-variant/15 rounded-xl">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-on-surface-variant/70">Summary</span>
                  <p className="text-[11.5px] text-on-surface mt-1 leading-relaxed">{summary}</p>
                </div>
              )}

              {gate.payload.validationIssues && gate.payload.validationIssues.length > 0 && (
                <div className="p-3 bg-red-500/5 border border-red-500/15 rounded-xl">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-red-400">Validation Issues</span>
                  <ul className="mt-1.5 flex flex-col gap-1">
                    {gate.payload.validationIssues.map((issue, idx) => (
                      <li key={idx} className="text-[10.5px] text-red-300 leading-relaxed">{issue.message || issue.rule}</li>
                    ))}
                  </ul>
                </div>
              )}

              {artifacts.length === 0 && !summary ? (
                <p className="text-[11px] text-on-surface-variant/70 text-center py-6">No artifacts produced yet.</p>
              ) : (
                artifacts.map((artifact) => (
                  <div key={artifact.id} className="p-3 bg-surface-container/40 border border-outline-variant/15 rounded-xl">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-on-surface-variant/70">{artifact.title}</span>
                    {artifact.contentText ? (
                      <pre className="mt-1.5 text-[10.5px] text-on-surface whitespace-pre-wrap leading-relaxed max-h-[260px] overflow-y-auto custom-scrollbar font-mono">{artifact.contentText}</pre>
                    ) : artifact.contentJson ? (
                      <pre className="mt-1.5 text-[10px] text-on-surface-variant whitespace-pre-wrap leading-relaxed max-h-[260px] overflow-y-auto custom-scrollbar font-mono">{JSON.stringify(artifact.contentJson, null, 2)}</pre>
                    ) : null}
                  </div>
                ))
              )}
            </>
          )}
        </div>

        <div className="p-4 border-t border-outline-variant shrink-0 flex flex-col gap-2">
          {actionError && (
            <div className="p-2 bg-error/10 border border-error/20 rounded-lg text-error text-[10.5px]">{actionError}</div>
          )}

          {showRejectForm ? (
            <>
              <textarea
                autoFocus
                placeholder="Reason for rejection (required)..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                className="w-full bg-black/30 border border-outline-variant/20 rounded-lg px-3 py-2 text-[11px] text-on-surface placeholder:text-on-surface-variant/40 resize-none outline-none focus:border-red-500/40 transition-colors"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => { setShowRejectForm(false); setReason(''); }}
                  disabled={submitting}
                  className="flex-1 py-2 rounded-lg border border-outline-variant/20 text-on-surface-variant hover:bg-surface-variant text-[11px] font-semibold transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleReject}
                  disabled={submitting || !reason.trim()}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-red-600/90 hover:bg-red-500 disabled:bg-surface-container-high disabled:cursor-not-allowed text-white text-[11px] font-bold transition-colors"
                >
                  {submitting ? <RefreshCw size={12} className="animate-spin" /> : <X size={12} />}
                  Confirm Reject
                </button>
              </div>
            </>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={() => setShowRejectForm(true)}
                disabled={submitting}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-red-600/10 border border-red-500/20 hover:bg-red-600/20 text-red-400 text-[11.5px] font-bold transition-colors disabled:opacity-50"
              >
                <X size={13} />
                Reject
              </button>
              <button
                onClick={handleApprove}
                disabled={submitting}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:bg-surface-container-high text-white text-[11.5px] font-bold transition-colors"
              >
                {submitting ? <RefreshCw size={13} className="animate-spin" /> : <Check size={13} />}
                Approve
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
