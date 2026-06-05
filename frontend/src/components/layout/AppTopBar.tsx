import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/store/useAuthStore';
import { useTheme } from '@/theme';
import { useAppStore } from '@/store';
import { getProfile, type Profile } from '@/services/api';
import { useQuotaStore } from '@/store/useQuotaStore';
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher';
import { useSdlcStore } from '@/store/useSdlcStore';
import { QuotaBadge } from './QuotaBadge';
import { InvitationsBell } from './InvitationsBell';

export function AppTopBar() {
  const { t } = useTranslation();
  const { resolvedMode, toggleMode } = useTheme();
  const { user, signOut } = useAuthStore();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const fetchQuota = useQuotaStore((s) => s.fetch);
  const { currentProjectId } = useAppStore();
  const setFeatureRequestFormOpen = useSdlcStore((s) => s.setFeatureRequestFormOpen);

  useEffect(() => { void fetchQuota(); }, [fetchQuota]);

  useEffect(() => {
    let mounted = true;

    const loadProfile = async () => {
      try {
        const data = await getProfile();
        if (mounted) setProfile(data);
      } catch {
        if (mounted) setProfile(null);
      }
    };

    const handleProfileUpdated = (event: Event) => {
      const nextProfile = (event as CustomEvent<Profile>).detail;
      setProfile(nextProfile);
    };

    void loadProfile();
    window.addEventListener('profile-updated', handleProfileUpdated);
    return () => {
      mounted = false;
      window.removeEventListener('profile-updated', handleProfileUpdated);
    };
  }, []);

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  const displayName =
    profile?.full_name ||
    (user?.user_metadata?.company_name as string | undefined) ||
    user?.email?.split('@')[0] ||
    t('layout.welcomeAdmin');
  const roleName = profile?.job_title || (user?.user_metadata?.job_title as string | undefined) || t('layout.welcomeGuest');
  const avatarUrl =
    profile?.avatar_url ||
    `https://ui-avatars.com/api/?name=${encodeURIComponent(String(displayName))}&background=0D8ABC&color=fff`;

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
        <button
          onClick={() => setFeatureRequestFormOpen(true)}
          disabled={!currentProjectId}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-primary hover:bg-primary/95 text-on-primary text-xs font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_10px_rgba(99,102,241,0.2)]"
          title={!currentProjectId ? t('layout.chooseProjectFirst') : ""}
        >
          <span>🚀</span>
          <span>{t('layout.newFeatureRequest')}</span>
        </button>
        <div className="w-px h-5 bg-outline-variant/30 mx-1" />
        <LanguageSwitcher />
        <QuotaBadge />
        <button
          onClick={toggleMode}
          title="Toggle theme"
          className="w-8 h-8 rounded border border-outline-variant bg-surface-container-low flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-variant transition-colors"
        >
          <span className="material-symbols-outlined text-[17px]">
            {resolvedMode === 'dark' ? 'dark_mode' : 'light_mode'}
          </span>
        </button>
        <InvitationsBell />
        <button
          onClick={handleSignOut}
          title={t('layout.signOut')}
          className="w-8 h-8 rounded border border-outline-variant bg-surface-container-low flex items-center justify-center text-on-surface-variant hover:text-red-500 transition-colors"
        >
          <span className="material-symbols-outlined text-[18px]">logout</span>
        </button>
        <div className="w-px h-5 bg-outline-variant/30" />
        <button
          type="button"
          onClick={() => navigate('/profile')}
          className="flex items-center gap-2 rounded px-2 py-1 text-left transition-colors hover:bg-surface-variant"
          title={t('layout.myProfile')}
        >
          <div className="text-right">
            <p className="text-xs font-semibold leading-none">{displayName}</p>
            <p className="text-[10px] text-on-surface-variant uppercase tracking-widest leading-none mt-0.5 font-label-mono">
              {roleName}
            </p>
          </div>
          <div className="w-8 h-8 rounded border border-outline-variant overflow-hidden">
            <img
              src={avatarUrl}
              alt="avatar"
              className="w-full h-full object-cover"
            />
          </div>
        </button>
      </div>
    </header>
  );
}
