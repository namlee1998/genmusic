import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuotaStore } from '@/store/useQuotaStore';

export function QuotaBadge() {
  const { t } = useTranslation();
  const { summary, isBlocked, isNearLimit } = useQuotaStore();
  const navigate = useNavigate();

  if (!summary) return null;

  const pct = summary.creditsTotal > 0
    ? Math.min(100, Math.round((summary.creditsUsed / summary.creditsTotal) * 100))
    : 0;

  const color = isBlocked
    ? 'bg-error/10 border-error/30 text-error'
    : isNearLimit
    ? 'bg-warning/10 border-warning/30 text-warning'
    : 'bg-surface-container border-outline-variant/30 text-on-surface-variant';

  const barColor = isBlocked ? 'bg-error' : isNearLimit ? 'bg-yellow-400' : 'bg-primary';

  return (
    <button
      onClick={() => navigate('/upgrade')}
      title={t('layout.quotaViewUpgrade')}
      className={`flex items-center gap-2 rounded-xl border px-2.5 py-1.5 text-xs font-semibold transition-colors hover:opacity-80 ${color}`}
    >
      <span className="material-symbols-outlined text-[14px]">toll</span>
      <span>{summary.creditsRemaining}<span className="font-normal opacity-60">/{summary.creditsTotal}</span></span>
      <div className="w-16 h-1.5 rounded-full bg-outline-variant/20 overflow-hidden">
        <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
    </button>
  );
}
