import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  danger = false,
  onConfirm,
  onCancel,
}) => {
  const { t } = useTranslation();
  const actualConfirmLabel = confirmLabel || t('common.confirm');
  const actualCancelLabel = cancelLabel || t('common.cancel');
  const confirmRef = useRef<HTMLButtonElement>(null);

  // Focus confirm button when dialog opens; close on Escape
  useEffect(() => {
    if (!open) return;
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      aria-modal="true"
      role="dialog"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={onCancel}
      />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-sm mx-4 bg-surface rounded-2xl shadow-xl border border-outline-variant/20 overflow-hidden animate-fade-up">
        {/* Icon + Title */}
        <div className="px-6 pt-6 pb-4 flex items-start gap-4">
          <span className={`material-symbols-outlined text-2xl mt-0.5 shrink-0 ${danger ? 'text-error' : 'text-primary'}`}>
            {danger ? 'warning' : 'help'}
          </span>
          <div>
            <h2 className="text-base font-bold text-on-surface leading-tight mb-1">{title}</h2>
            <p className="text-[13px] text-on-surface-variant leading-relaxed">{description}</p>
          </div>
        </div>

        {/* Actions */}
        <div className="px-6 pb-5 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-xs font-semibold text-on-surface-variant hover:text-on-surface hover:bg-surface-container rounded-lg transition-colors"
          >
            {actualCancelLabel}
          </button>
          <button
            ref={confirmRef}
            onClick={onConfirm}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors ${
              danger
                ? 'bg-error text-on-error hover:bg-error/90'
                : 'bg-primary text-on-primary hover:bg-primary/90'
            }`}
          >
            {actualConfirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
