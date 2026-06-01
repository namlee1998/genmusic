import React from 'react';
import { useTheme } from '@/theme';
import { Button } from '@/components/ui/Button';
import { useAuthStore } from '@/store/useAuthStore';
import { useNavigate } from 'react-router-dom';

interface TopBarProps {
  searchPlaceholder?: string;
}

export const TopBar: React.FC<TopBarProps> = ({ searchPlaceholder = 'Search...' }) => {
  const { resolvedMode, toggleMode } = useTheme();
  const { user, signOut } = useAuthStore();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  const displayName =
    (user?.user_metadata?.company_name as string | undefined) || user?.email?.split('@')[0] || 'Admin Console';
  const roleName = (user?.user_metadata?.job_title as string | undefined) || 'Enterprise';
  // Use UI Avatars to generate a placeholder avatar based on the display name
  const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(String(displayName))}&background=0D8ABC&color=fff`;

  return (
    <header className="fixed top-0 right-0 left-64 h-16 z-40 border-b border-outline-variant/30 bg-surface/80 backdrop-blur-xl flex justify-between items-center px-8 shadow-[0_8px_40px_-28px_rgba(36,42,66,0.45)]">
      <div className="flex items-center flex-1 max-w-xl">
        <div className="relative w-full">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-xl">
            search
          </span>
          <input
            type="text"
            placeholder={searchPlaceholder}
            className="w-full pl-10 pr-4 py-2 bg-surface-container-low border border-outline-variant/30 rounded-xl text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          />
        </div>
      </div>
      <div className="flex items-center gap-4">
        <Button variant="toolbar" onClick={toggleMode} title="Toggle theme">
          <span className="material-symbols-outlined text-[19px]">
            {resolvedMode === 'dark' ? 'dark_mode' : 'light_mode'}
          </span>
        </Button>
        <div className="flex items-center gap-2 border-r border-outline-variant/20 pr-4">
          <Button variant="toolbar">
            <span className="material-symbols-outlined text-[20px] leading-none">
              notifications
            </span>
          </Button>
          <Button variant="toolbar" onClick={handleSignOut} title="Sign Out">
            <span className="material-symbols-outlined text-[20px] leading-none text-red-500">
              logout
            </span>
          </Button>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-xs font-bold font-headline leading-none">{displayName}</p>
            <p className="text-[10px] text-on-surface-variant font-label uppercase tracking-widest leading-none mt-1">
              {roleName}
            </p>
          </div>
          <div className="w-9 h-9 rounded-full border border-outline-variant/20 bg-surface-container-highest overflow-hidden">
            <img src={avatarUrl} alt="User Avatar" className="w-full h-full object-cover" />
          </div>
        </div>
      </div>
    </header>
  );
};
