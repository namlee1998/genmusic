import React, { useState } from 'react';

interface CreateProjectDialogProps {
  onCancel: () => void;
  onSubmit: (name: string) => Promise<void>;
}

export function CreateProjectDialog({
  onCancel,
  onSubmit,
}: CreateProjectDialogProps) {
  const [value, setValue] = useState('New Project');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    const name = value.trim();
    if (!name || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(name);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (err as Error)?.message ??
        'Tạo dự án thất bại';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center px-4">
      <div className="w-full max-w-sm rounded border border-outline-variant bg-surface-container-lowest shadow-2xl p-5">
        <h4 className="text-sm font-semibold text-on-surface mb-3">Tạo dự án mới</h4>
        <label className="block text-[11px] text-on-surface-variant mb-1 font-label-mono uppercase tracking-wider">Tên dự án</label>
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onCancel();
            if (e.key === 'Enter') void handleSubmit();
          }}
          className="w-full rounded border border-outline-variant px-3 py-2 text-xs bg-surface-container-low text-on-surface placeholder:text-on-surface-variant/40 focus:border-secondary outline-none transition-colors"
          placeholder="Nhập tên dự án..."
        />
        {error && (
          <p className="mt-3 rounded border border-error/30 bg-error/10 px-3 py-2 text-xs text-error">
            {error}
          </p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={submitting}
            className="px-3 py-1.5 rounded text-xs font-semibold bg-surface-container-high border border-outline-variant text-on-surface hover:bg-surface-variant disabled:opacity-50 transition-colors"
          >
            Hủy
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !value.trim()}
            className="px-3 py-1.5 rounded text-xs font-semibold bg-primary text-on-primary hover:opacity-90 disabled:opacity-50 transition-all shadow-[0_0_10px_rgba(99,102,241,0.2)]"
          >
            {submitting ? 'Đang tạo...' : 'Tạo dự án'}
          </button>
        </div>
      </div>
    </div>
  );
}
