import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuotaStore } from '@/store/useQuotaStore';

export function QuotaWarningBanner() {
  const { t } = useTranslation();
  const { summary, isBlocked, isNearLimit } = useQuotaStore();
  const navigate = useNavigate();

  if (!summary || (!isBlocked && !isNearLimit)) return null;

  return (
    <div className={`shrink-0 flex items-center justify-between px-6 py-2 text-xs font-semibold border-b ${
      isBlocked
        ? 'bg-error/10 border-error/20 text-error'
        : 'bg-yellow-50 border-yellow-200 text-yellow-800 dark:bg-yellow-900/20 dark:border-yellow-700/30 dark:text-yellow-300'
    }`}>
      <div className="flex items-center gap-2">
        <span className="material-symbols-outlined text-[15px]">
          {isBlocked ? 'block' : 'warning'}
        </span>
        {isBlocked
          ? t('layout.quotaWarningBlocked', { total: summary.creditsTotal })
          : t('layout.quotaWarningNearLimit', { used: summary.creditsUsed, total: summary.creditsTotal, pct: Math.round((summary.creditsUsed / summary.creditsTotal) * 100) })
        }
      </div>
      <button
        onClick={() => navigate('/upgrade')}
        className={`shrink-0 ml-4 rounded-lg px-2.5 py-1 text-[11px] font-bold border transition-opacity hover:opacity-80 ${
          isBlocked
            ? 'bg-error text-white border-error'
            : 'bg-yellow-500 text-white border-yellow-500'
        }`}
      >
        {t('layout.upgradeNow')}
      </button>
    </div>
  );
}
