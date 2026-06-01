import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/useAuthStore';
import { useTheme } from '@/theme';
import { ProjectPanel } from './ProjectPanel';
import { useApiActions } from '@/hooks/useApiActions';
import { useAppStore } from '@/store';
import { ProfilePage } from '@/pages/Profile';
import { ProjectSettings } from '@/pages/ProjectSettings';
import { NotFoundPage } from '@/pages/NotFound';
import { getProfile, listMyInvitations, acceptInvitation, type Profile, type ProjectInvitationItem } from '@/services/api';
import { useQuotaStore } from '@/store/useQuotaStore';
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher';
import { useSdlcStore } from '@/store/useSdlcStore';
import SdlcDashboard from '@/pages/SdlcDashboard';

// ---------------------------------------------------------------------------
// Invitations bell
// ---------------------------------------------------------------------------
function InvitationsBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [invitations, setInvitations] = useState<ProjectInvitationItem[]>([]);
  const [accepting, setAccepting] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const { fetchTree, setCurrentProject } = useAppStore();

  const load = async () => {
    try {
      const rows = await listMyInvitations();
      setInvitations(rows);
    } catch { /* non-fatal */ }
  };

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeout);
  }, []);
  useEffect(() => {
    if (!message) return;
    const timeout = window.setTimeout(() => setMessage(null), 4000);
    return () => window.clearTimeout(timeout);
  }, [message]);

  const handleAccept = async (inv: ProjectInvitationItem) => {
    setAccepting(inv.invitation_id);
    setMessage(null);
    try {
      const accepted = await acceptInvitation({ invitation_id: inv.invitation_id });
      await fetchTree();
      setCurrentProject(inv.project_id);
      await load();
      setMessage(`Đã tham gia ${accepted.project_name || inv.project_name || 'project'}`);
      setOpen(false);
      navigate('/app');
    } catch {
      setMessage('Không thể chấp nhận lời mời');
    } finally {
      setAccepting(null);
    }
  };

  const count = invitations.length;

  return (
    <div className="relative">
      <button
        onClick={() => { setOpen((v) => !v); if (!open) void load(); }}
        className="relative w-8 h-8 rounded-xl border border-outline-variant/20 bg-surface-container-low flex items-center justify-center text-on-surface-variant hover:text-primary transition-colors"
      >
        <span className="material-symbols-outlined text-[18px]">notifications</span>
        {count > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 rounded-full bg-error text-white text-[9px] font-bold flex items-center justify-center px-1">
            {count}
          </span>
        )}
      </button>

      {message && (
        <div className="absolute right-0 top-10 z-50 w-72 rounded-xl border border-primary/20 bg-surface-container-lowest px-3 py-2 text-xs font-semibold text-on-surface shadow-xl">
          {message}
        </div>
      )}

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-10 z-50 w-80 rounded-2xl border border-outline-variant/30 bg-surface-container-lowest shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-outline-variant/20">
              <span className="text-sm font-bold text-on-surface">Lời mời tham gia</span>
              <button onClick={() => setOpen(false)} className="text-on-surface-variant hover:text-on-surface">
                <span className="material-symbols-outlined text-[16px]">close</span>
              </button>
            </div>
            {invitations.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-on-surface-variant">Không có lời mời nào.</p>
            ) : (
              <ul className="max-h-72 overflow-y-auto divide-y divide-outline-variant/20">
                {invitations.map((inv) => (
                  <li key={inv.invitation_id} className="flex items-center gap-3 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-on-surface truncate">
                        {inv.project_name || `Project ${inv.project_id.slice(0, 8)}`}
                      </p>
                      <p className="text-[10px] text-on-surface-variant">Vai trò: <span className="uppercase">{inv.role}</span></p>
                    </div>
                    <button
                      disabled={accepting === inv.invitation_id}
                      onClick={() => void handleAccept(inv)}
                      className="shrink-0 rounded-lg bg-primary px-2 py-1 text-[10px] font-bold text-on-primary disabled:opacity-50"
                    >
                      {accepting === inv.invitation_id ? '...' : 'Chấp nhận'}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Quota badge
// ---------------------------------------------------------------------------
function QuotaBadge() {
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
      title="Xem & nâng cấp plan"
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

// ---------------------------------------------------------------------------
// Top bar (standalone, in-flow — not fixed)
// ---------------------------------------------------------------------------
function AppTopBar() {
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
    user?.user_metadata?.company_name ||
    user?.email?.split('@')[0] ||
    'Admin Console';
  const roleName = profile?.job_title || user?.user_metadata?.job_title || 'QA Engineer';
  const avatarUrl =
    profile?.avatar_url ||
    `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=0D8ABC&color=fff`;

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
            placeholder="Search projects & assets..."
            className="w-full pl-9 pr-4 py-1.5 bg-surface-container-lowest border border-outline-variant rounded text-xs focus:border-secondary focus:outline-none focus:ring-1 focus:ring-secondary/40 placeholder:text-on-surface-variant/40"
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={() => setFeatureRequestFormOpen(true)}
          disabled={!currentProjectId}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-primary hover:bg-primary/95 text-on-primary text-xs font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_10px_rgba(99,102,241,0.2)]"
          title={!currentProjectId ? "Vui lòng chọn một dự án từ Sidebar trước" : ""}
        >
          <span>🚀</span>
          <span>New Feature Request</span>
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
          title="Đăng xuất"
          className="w-8 h-8 rounded border border-outline-variant bg-surface-container-low flex items-center justify-center text-on-surface-variant hover:text-red-500 transition-colors"
        >
          <span className="material-symbols-outlined text-[18px]">logout</span>
        </button>
        <div className="w-px h-5 bg-outline-variant/30" />
        <button
          type="button"
          onClick={() => navigate('/profile')}
          className="flex items-center gap-2 rounded px-2 py-1 text-left transition-colors hover:bg-surface-variant"
          title="Hồ sơ cá nhân"
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

// ---------------------------------------------------------------------------
// Create project dialog
// ---------------------------------------------------------------------------
function CreateProjectDialog({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void;
  onSubmit: (name: string) => Promise<void>;
}) {
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

// ---------------------------------------------------------------------------
// AppShell
// ---------------------------------------------------------------------------
function QuotaWarningBanner() {
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
          ? `Bạn đã dùng hết ${summary.creditsTotal} credits. Không thể chạy thêm agent cho đến khi nâng cấp.`
          : `Bạn đã dùng ${summary.creditsUsed}/${summary.creditsTotal} credits (${Math.round((summary.creditsUsed / summary.creditsTotal) * 100)}%). Sắp hết quota.`
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
        Nâng cấp ngay
      </button>
    </div>
  );
}

export const AppShell: React.FC = () => {
  const api = useApiActions();
  const {
    projects,
    currentProjectId,
    treeLoaded,
    fetchTree,
    setCurrentProject,
    upsertProject,
    isCreateProjectDialogOpen,
    setCreateProjectDialogOpen,
  } = useAppStore();
  const location = useLocation();
  const isProfileRoute = location.pathname === '/profile';
  const isProjectSettingsRoute = location.pathname.startsWith('/projects/') && location.pathname.endsWith('/settings');
  const isUnknownAppRoute = location.pathname.startsWith('/sdlc/') && location.pathname !== '/sdlc/' && location.pathname !== '/sdlc';

  const [panelCollapsed, setPanelCollapsed] = useState(() => {
    return localStorage.getItem('project-panel-collapsed') === 'true';
  });

  const navigate = useNavigate();

  useEffect(() => {
    if (!treeLoaded) void fetchTree();
  }, [fetchTree, treeLoaded]);

  function handleToggleCollapse() {
    const next = !panelCollapsed;
    setPanelCollapsed(next);
    localStorage.setItem('project-panel-collapsed', String(next));
  }

  async function handleCreateProject(name: string) {
    const res = await api.createProject(name);
    upsertProject(res.data);
    setCurrentProject(res.data.project_id);
    setCreateProjectDialogOpen(false);
    // errors propagate up to CreateProjectDialog which displays them inline
  }

  const panelProjects = projects.map((p) => ({ id: p.project_id, name: p.name, role: p.role }));

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-background dark">
      <AppTopBar />
      <QuotaWarningBanner />

      <div className="flex flex-1 min-h-0">
        <ProjectPanel
          projects={panelProjects}
          activeProjectId={currentProjectId}
          onSelectProject={setCurrentProject}
          onCreateProject={() => setCreateProjectDialogOpen(true)}
          onOpenSettings={(id) => {
            setCurrentProject(id);
            navigate(`/projects/${id}/settings`);
          }}
          collapsed={panelCollapsed}
          onToggleCollapse={handleToggleCollapse}
        />

        <main className="flex-1 flex flex-col min-w-0 min-h-0">
          <div className="flex-1 overflow-hidden">
            {isProfileRoute ? (
              <ProfilePage />
            ) : isProjectSettingsRoute ? (
              <ProjectSettings />
            ) : isUnknownAppRoute ? (
              <NotFoundPage mode="panel" />
            ) : (
              <div className="flex flex-col h-full bg-slate-950">
                <SdlcDashboard />
              </div>
            )}
          </div>
        </main>
      </div>

      {isCreateProjectDialogOpen && (
        <CreateProjectDialog
          onCancel={() => setCreateProjectDialogOpen(false)}
          onSubmit={handleCreateProject}
        />
      )}
    </div>
  );
};
