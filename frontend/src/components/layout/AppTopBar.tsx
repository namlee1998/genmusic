import React from 'react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/theme';
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher';

export function AppTopBar() {
  const { t } = useTranslation();
  const { resolvedMode, toggleMode } = useTheme();

  return (
    <header className="h-16 shrink-0 z-40 border-b border-outline-variant bg-surface-container-lowest/80 backdrop-blur-md flex items-center justify-between px-6">
      <div className="flex items-center gap-3">
        <span className="font-headline font-bold text-base text-on-surface tracking-tighter">AIDLC</span>
        <span className="px-2 py-0.5 rounded bg-surface-variant text-[10px] font-label-mono text-secondary tracking-widest uppercase">Factory</span>
      </div>

      <div className="flex items-center flex-1 max-w-xs mx-8">
        <div className="relative w-full">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-base">
            search
          </span>
          <input
            type="text"
            placeholder={t('layout.searchPlaceholder')}
            className="w-full pl-9 pr-4 py-1.5 bg-surface-container-lowest border border-outline-variant rounded text-xs focus:border-secondary focus:outline-none focus:ring-1 focus:ring-secondary/40 placeholder:text-on-surface-variant/40"
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <LanguageSwitcher />
        <button
          onClick={toggleMode}
          title="Toggle theme"
          className="w-8 h-8 rounded border border-outline-variant bg-surface-container-low flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-variant transition-colors"
        >
          <span className="material-symbols-outlined text-[17px]">
            {resolvedMode === 'dark' ? 'dark_mode' : 'light_mode'}
          </span>
        </button>
      </div>
    </header>
  );
}

