import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuotaStore } from '@/store/useQuotaStore';
import { useTranslation } from 'react-i18next';

export const UpgradePlanPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { summary } = useQuotaStore();
  const [showPayment, setShowPayment] = React.useState(false);

  const plans = useMemo(() => [
    {
      id: 'free',
      name: 'Free',
      price: t('upgrade.priceFree'),
      credits: 50,
      tokens: '50,000',
      features: [
        t('upgrade.planFreeFeature1'),
        t('upgrade.planFreeFeature2'),
        t('upgrade.planFreeFeature3'),
        t('upgrade.planFreeFeature4'),
        t('upgrade.planFreeFeature5'),
      ],
      highlight: false,
    },
    {
      id: 'pro',
      name: 'Pro',
      price: t('upgrade.pricePro'),
      credits: 1000,
      tokens: '1,000,000',
      features: [
        t('upgrade.planProFeature1'),
        t('upgrade.planProFeature2'),
        t('upgrade.planProFeature3'),
        t('upgrade.planProFeature4'),
        t('upgrade.planProFeature5'),
        t('upgrade.planProFeature6'),
      ],
      highlight: true,
    },
  ], [t]);

  return (
    <div className="min-h-full bg-background flex flex-col">
      {/* Header */}
      <div className="shrink-0 h-16 flex items-center px-6 border-b border-outline-variant bg-surface-container-lowest/80 backdrop-blur-md">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-xs font-semibold text-on-surface-variant hover:text-on-surface transition-colors"
        >
          <span className="material-symbols-outlined text-[16px]">arrow_back</span>
          {t('upgrade.back')}
        </button>
        <span className="ml-4 text-sm font-semibold text-on-surface">{t('upgrade.title')}</span>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-8 max-w-3xl mx-auto w-full">
        {/* Current status */}
        {summary && (
          <div className="mb-8 rounded border border-outline-variant bg-surface-container p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded border border-primary/30 bg-primary/10 flex items-center justify-center">
              <span className="material-symbols-outlined text-primary text-[20px]">toll</span>
            </div>
            <div className="flex-1">
              <p className="text-[10px] text-on-surface-variant font-label-mono uppercase tracking-wider">{t('upgrade.currentPlan')}</p>
              <p className="text-sm font-bold text-on-surface capitalize mt-0.5">{summary.planId}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-on-surface-variant font-label-mono uppercase tracking-wider">{t('upgrade.remainingCredits')}</p>
              <p className={`text-sm font-bold mt-0.5 ${summary.creditsRemaining <= 0 ? 'text-error' : 'text-on-surface'}`}>
                {summary.creditsRemaining} / {summary.creditsTotal}
              </p>
            </div>
          </div>
        )}

        {/* Plan cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-8">
          {plans.map((plan) => {
            const isCurrent = summary?.planId === plan.id;
            return (
              <div
                key={plan.id}
                className={`relative rounded border p-6 flex flex-col gap-4 transition-all ${
                  plan.highlight
                    ? 'border-primary bg-primary/5 shadow-[0_0_15px_rgba(99,102,241,0.15)]'
                    : 'border-outline-variant bg-surface-container'
                }`}
              >
                {plan.highlight && (
                  <span className="absolute -top-2.5 left-4 rounded bg-primary px-2.5 py-0.5 text-[9px] font-semibold text-on-primary uppercase tracking-wider shadow-[0_0_10px_rgba(99,102,241,0.2)]">
                    {t('upgrade.recommended')}
                  </span>
                )}
                <div>
                  <p className="text-sm font-bold text-on-surface uppercase tracking-wider">{plan.name}</p>
                  <p className="text-xl font-bold text-primary mt-1">{plan.price}</p>
                </div>
                <div className="rounded bg-surface-container-lowest border border-outline-variant px-3 py-2 text-xs">
                  <span className="font-semibold text-on-surface">{plan.credits} {t('upgrade.credits')}</span>
                  <span className="text-on-surface-variant"> / {t('upgrade.month')} ({plan.tokens} {t('upgrade.tokens')})</span>
                </div>
                <ul className="space-y-2">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-xs text-on-surface-variant">
                      <span className="material-symbols-outlined text-[14px] text-secondary">check_circle</span>
                      {f}
                    </li>
                  ))}
                </ul>
                {isCurrent ? (
                  <span className="mt-auto rounded border border-outline-variant py-2 text-center text-xs font-semibold text-on-surface-variant bg-surface-container-low">
                    {t('upgrade.currentPlan')}
                  </span>
                ) : plan.id === 'pro' ? (
                  <button
                    onClick={() => setShowPayment(true)}
                    className="mt-auto rounded bg-primary py-2 text-xs font-semibold text-on-primary hover:opacity-90 transition-opacity shadow-[0_0_10px_rgba(99,102,241,0.15)]"
                  >
                    {t('upgrade.upgradePro')}
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>

        {/* Payment instructions */}
        {showPayment && (
          <div className="rounded border border-primary/30 bg-primary/5 p-6 space-y-4">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-[20px]">payment</span>
              <p className="text-xs font-bold text-on-surface uppercase tracking-wider font-label-mono">{t('upgrade.paymentInstructions')}</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {/* QR placeholder */}
              <div className="rounded border border-outline-variant bg-surface-container-lowest p-5 flex flex-col items-center gap-2">
                <div className="w-32 h-32 rounded bg-surface-container-low border border-outline-variant flex items-center justify-center">
                  <span className="material-symbols-outlined text-[48px] text-on-surface-variant/40">qr_code_2</span>
                </div>
                <p className="text-[10px] font-label-mono text-on-surface-variant text-center">{t('upgrade.momoQrCode')}</p>
              </div>
              {/* Instructions */}
              <div className="space-y-2.5 text-xs text-on-surface-variant">
                <p className="font-semibold text-on-surface uppercase tracking-wider text-[10px] font-label-mono">{t('upgrade.stepsTitle')}</p>
                <ol className="list-decimal list-inside space-y-1.5 leading-relaxed">
                  <li>{t('upgrade.step1')}</li>
                  <li>{t('upgrade.step2')}</li>
                  <li>{t('upgrade.step3')} <span className="font-bold text-on-surface text-primary">UPGRADE [email]</span></li>
                  <li>{t('upgrade.step4')}</li>
                </ol>
                <div className="mt-4 rounded border border-outline-variant bg-surface-container-lowest p-3.5">
                  <p className="font-semibold text-on-surface mb-1">{t('upgrade.afterPayment')}</p>
                  <p className="leading-relaxed text-xs">{t('upgrade.activationWindow')}</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
