import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/store/useAuthStore';
import { useHitlStore } from '@/store/useHitlStore';
import { useSdlcStore } from '@/store/useSdlcStore';
import { getProfile, type Profile } from '@/services/api';
import {
  Layers,
  History,
  FolderOpen,
  Settings,
  Gavel,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  Search,
  Rocket,
} from 'lucide-react';

export interface Project {
  id: string;
  name: string;
  role?: string;
}

interface AppSidebarProps {
  projects: Project[];
  activeProjectId: string | null;
  onSelectProject: (id: string) => void;
  onCreateProject: () => void;
  onDeleteProject?: (id: string) => void;
  deletingProjectId?: string | null;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

const ROLE_BADGE_CLASSES: Record<string, string> = {
  owner: 'bg-error/10 text-error border-error/20',
  admin: 'bg-warning/10 text-warning border-warning/20',
  editor: 'bg-primary/10 text-primary border-primary/20',
  viewer: 'bg-surface-container-highest text-on-surface-variant border-outline-variant/30',
};

const roleBadgeClass = (role?: string) => (
  role ? ROLE_BADGE_CLASSES[role] || ROLE_BADGE_CLASSES.viewer : ROLE_BADGE_CLASSES.viewer
);

export const AppSidebar: React.FC<AppSidebarProps> = ({
  projects,
  activeProjectId,
  onSelectProject,
  onCreateProject,
  onDeleteProject,
  deletingProjectId = null,
  collapsed,
  onToggleCollapse,
}) => {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [profile, setProfile] = useState<Profile | null>(null);

  const { user } = useAuthStore();
  const { interventions } = useHitlStore();
  const setFeatureRequestFormOpen = useSdlcStore((s) => s.setFeatureRequestFormOpen);

  const activeProject = projects.find((p) => p.id === activeProjectId);

  // Fetch profile for displaying job role & full name in sidebar footer
  useEffect(() => {
    let mounted = true;
    const loadProfile = async () => {
      try {
        const data = await getProfile();
        if (mounted) setProfile(data);
      } catch {
        /* no-op */
      }
    };
    void loadProfile();
    return () => {
      mounted = false;
    };
  }, []);

  const filteredProjects = projects.filter((p) =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const displayName =
    profile?.full_name ||
    (user?.user_metadata?.company_name as string) ||
    user?.email?.split('@')[0] ||
    t('layout.welcomeAdmin');
  const roleName = (profile?.job_title || user?.user_metadata?.job_title || t('layout.welcomeGuest')) as string;
  const avatarUrl =
    profile?.avatar_url ||
    `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=0D8ABC&color=fff`;

  // Active path checking helpers
  const isBuildActive =
    location.pathname === '/sdlc' || location.pathname === '/sdlc/';
  const isAuditActive = location.pathname.startsWith('/sdlc/audit');
  const isOutputsActive = location.pathname.startsWith('/sdlc/outputs');
  const isHitlActive = location.pathname.startsWith('/sdlc/hitl');
  const isSettingsActive =
    location.pathname.startsWith('/projects/') && location.pathname.endsWith('/settings');

  // Trigger project settings page navigation
  const handleOpenSettings = (id: string) => {
    onSelectProject(id);
    navigate(`/projects/${id}/settings`);
  };

  return (
    <aside
      className={`
        flex flex-col border-r border-outline-variant
        bg-surface-container-lowest transition-all duration-300 shrink-0 z-30 relative
        ${collapsed ? 'w-16' : 'w-60'}
      `}
    >
      {/* 1. Project Selector Section */}
      <div className="p-3 border-b border-outline-variant shrink-0 relative">
        {collapsed ? (
          <button
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            title={activeProject ? activeProject.name : t('layout.projectsTitle')}
            className={`w-10 h-10 rounded-xl bg-surface-container flex items-center justify-center border border-outline-variant/30 hover:border-primary/40 text-on-surface hover:bg-surface-variant transition-all mx-auto`}
          >
            {activeProject ? (
              <span className="text-sm font-bold uppercase tracking-wider text-primary">
                {activeProject.name.slice(0, 2)}
              </span>
            ) : (
              <Layers size={18} className="text-on-surface-variant" />
            )}
          </button>
        ) : (
          <button
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="w-full flex items-center justify-between gap-2.5 px-3 py-2 rounded-xl border border-outline-variant bg-surface-container-low hover:bg-surface-variant hover:border-outline text-left transition-all"
          >
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-label-mono text-on-surface-variant/70 uppercase tracking-widest leading-none mb-1">
                {t('layout.workspace')}
              </p>
              <h4 className="text-xs font-bold text-on-surface truncate leading-tight">
                {activeProject ? activeProject.name : t('layout.noProjects')}
              </h4>
            </div>
            <ChevronDown
              size={14}
              className={`text-on-surface-variant transition-transform shrink-0 ${
                isDropdownOpen ? 'rotate-180' : ''
              }`}
            />
          </button>
        )}

        {/* Project Dropdown List Overlay */}
        {isDropdownOpen && (
          <>
            <div
              className="fixed inset-0 z-40 bg-black/5"
              onClick={() => {
                setIsDropdownOpen(false);
                setSearchQuery('');
              }}
            />
            <div
              className={`
                absolute left-3 right-3 top-[calc(100%-4px)] z-50 rounded-xl border border-outline-variant/60 
                bg-surface-container-lowest shadow-2xl p-2.5 overflow-hidden flex flex-col max-h-[360px]
                backdrop-blur-md transition-all animate-in fade-in duration-100
                ${collapsed ? 'w-64 left-14 top-3' : ''}
              `}
            >
              {/* Dropdown Header & Search */}
              <div className="relative mb-2 shrink-0">
                <Search
                  size={12}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant/50"
                />
                <input
                  type="text"
                  placeholder={t('layout.searchPlaceholder')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-surface-container border border-outline-variant/40 rounded-lg text-[11px] focus:outline-none focus:border-primary/50 text-on-surface"
                />
              </div>

              {/* Projects List Container */}
              <div className="flex-1 overflow-y-auto custom-scrollbar space-y-1 pr-0.5">
                {filteredProjects.length === 0 ? (
                  <p className="py-6 text-center text-[10px] text-on-surface-variant/60 font-medium">
                    {t('layout.noProjects')}
                  </p>
                ) : (
                  filteredProjects.map((project) => {
                    const isActive = project.id === activeProjectId;
                    return (
                      <div
                        key={project.id}
                        onClick={() => {
                          onSelectProject(project.id);
                          setIsDropdownOpen(false);
                          setSearchQuery('');
                        }}
                        className={`
                          flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer transition-all text-left group
                          ${
                            isActive
                              ? 'bg-primary/10 border border-primary/30 text-primary font-bold shadow-sm'
                              : 'text-on-surface-variant border border-transparent hover:bg-surface-variant hover:text-on-surface'
                          }
                        `}
                      >
                        <span className="truncate text-xs flex-1 leading-tight">
                          {project.name}
                        </span>
                        {project.role && (
                          <span
                            className={`shrink-0 rounded border px-1.5 py-0.5 text-[8px] uppercase tracking-wider ${roleBadgeClass(
                              project.role
                            )}`}
                          >
                            {project.role}
                          </span>
                        )}
                        {/* Quick Settings Gear */}
                        <button
                          type="button"
                          title={t('layout.projectSettings')}
                          onClick={(e) => {
                            e.stopPropagation();
                            setIsDropdownOpen(false);
                            handleOpenSettings(project.id);
                          }}
                          className="shrink-0 text-on-surface-variant/50 hover:text-primary transition-colors opacity-0 group-hover:opacity-100 p-0.5"
                        >
                          <Settings size={12} />
                        </button>
                        {/* Quick Delete Trash */}
                        {project.role === 'owner' && onDeleteProject && (
                          <button
                            type="button"
                            title={t('layout.deleteProjectConfirm')}
                            disabled={deletingProjectId === project.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              setIsDropdownOpen(false);
                              onDeleteProject(project.id);
                            }}
                            className="shrink-0 text-on-surface-variant/50 hover:text-error transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-50 p-0.5"
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Import Project Footer CTA */}
              <div className="border-t border-outline-variant/30 pt-2 mt-2 shrink-0">
                <button
                  onClick={() => {
                    onCreateProject();
                    setIsDropdownOpen(false);
                  }}
                  className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold bg-primary/10 hover:bg-primary text-primary hover:text-on-primary border border-primary/20 transition-all cursor-pointer"
                >
                  <Plus size={13} />
                  <span>{t('layout.createProject')}</span>
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* 2. Launcher Action (New Feature Request) */}
      <div className={`p-3 shrink-0 ${collapsed ? 'text-center' : ''}`}>
        {collapsed ? (
          <button
            onClick={() => setFeatureRequestFormOpen(true)}
            title={t('layout.newFeatureRequest')}
            className="w-10 h-10 rounded-xl bg-primary hover:bg-primary/95 text-on-primary flex items-center justify-center transition-all shadow-[0_0_10px_rgba(99,102,241,0.2)] hover:scale-105 mx-auto"
          >
            <Rocket size={18} />
          </button>
        ) : (
          <button
            onClick={() => setFeatureRequestFormOpen(true)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-primary hover:bg-primary/95 text-on-primary text-xs font-bold transition-all shadow-[0_0_12px_rgba(99,102,241,0.2)] hover:scale-[1.01]"
          >
            <Rocket size={14} className="animate-bounce" />
            <span>{t('layout.newFeatureRequest')}</span>
          </button>
        )}
      </div>

      {/* 3. Navigation Links List */}
      <div className="flex-1 overflow-y-auto custom-scrollbar px-3 py-2 space-y-1">
        {/* Global Pages Division (Top) */}
        {!collapsed && (
          <div className="px-3 py-1 mb-1">
            <span className="text-[9px] font-label-mono text-on-surface-variant/50 uppercase tracking-widest">
              Global
            </span>
          </div>
        )}

        {/* HITL Inbox Link */}
        <button
          onClick={() => navigate('/sdlc/hitl')}
          title={collapsed ? t('hitl.title', 'HITL Inbox') : undefined}
          className={`
            w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs transition-all border-l-[3px]
            ${
              isHitlActive
                ? 'bg-primary/10 border-primary text-primary font-bold shadow-[inset_0_0_10px_rgba(99,102,241,0.06)]'
                : 'text-on-surface-variant border-transparent hover:bg-surface-variant hover:text-on-surface'
            }
            ${collapsed ? 'justify-center border-l-0 relative' : ''}
          `}
        >
          <Gavel size={16} className={isHitlActive ? 'text-primary' : 'text-amber-500'} />
          {!collapsed && <span className="flex-1 text-left">{t('hitl.title', 'HITL Inbox')}</span>}
          {interventions.length > 0 && (
            <span
              className={`
                bg-error text-white text-[9px] font-bold rounded-full px-1.5 py-0.5 leading-none shrink-0
                ${collapsed ? 'absolute top-1 right-1.5 animate-pulse min-w-[12px] h-3 flex items-center justify-center p-0 text-[8px]' : ''}
              `}
            >
              {interventions.length}
            </span>
          )}
        </button>

        {/* Project Section Divider */}
        <div className="my-3 mx-1 border-t border-outline-variant/30" />

        {/* Project Section Heading */}
        {!collapsed && (
          <div className="px-3 py-1 mb-1">
            <span className="text-[9px] font-label-mono text-on-surface-variant/50 uppercase tracking-widest">
              {t('layout.workspace')}
            </span>
          </div>
        )}

        {/* Project Dashboard Links */}
        <nav className="space-y-1">
          {/* Build Dashboard */}
          <button
            onClick={() => activeProjectId && navigate('/sdlc')}
            disabled={!activeProjectId}
            title={collapsed ? t('dashboard.build', 'Build Dashboard') : undefined}
            className={`
              w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs transition-all relative group
              ${
                !activeProjectId
                  ? 'opacity-40 cursor-not-allowed text-on-surface-variant/50'
                  : isBuildActive
                  ? 'bg-primary/10 border-l-[3px] border-primary text-primary font-bold shadow-[inset_0_0_10px_rgba(99,102,241,0.06)]'
                  : 'text-on-surface-variant hover:bg-surface-variant hover:text-on-surface border-l-[3px] border-transparent'
              }
              ${collapsed ? 'justify-center border-l-0' : ''}
            `}
          >
            <Layers size={16} className={isBuildActive ? 'text-primary' : 'text-on-surface-variant/80'} />
            {!collapsed && <span>{t('dashboard.build', 'Build Dashboard')}</span>}
            {collapsed && !activeProjectId && (
              <span className="absolute left-16 top-1/2 -translate-y-1/2 z-50 bg-black text-white text-[10px] px-2 py-1 rounded hidden group-hover:block whitespace-nowrap shadow-xl">
                {t('layout.chooseProjectFirst')}
              </span>
            )}
          </button>

          {/* Audit Logs */}
          <button
            onClick={() => activeProjectId && navigate('/sdlc/audit')}
            disabled={!activeProjectId}
            title={collapsed ? t('dashboard.audit', 'Audit Trail') : undefined}
            className={`
              w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs transition-all relative group
              ${
                !activeProjectId
                  ? 'opacity-40 cursor-not-allowed text-on-surface-variant/50'
                  : isAuditActive
                  ? 'bg-primary/10 border-l-[3px] border-primary text-primary font-bold shadow-[inset_0_0_10px_rgba(99,102,241,0.06)]'
                  : 'text-on-surface-variant hover:bg-surface-variant hover:text-on-surface border-l-[3px] border-transparent'
              }
              ${collapsed ? 'justify-center border-l-0' : ''}
            `}
          >
            <History size={16} className={isAuditActive ? 'text-primary' : 'text-on-surface-variant/80'} />
            {!collapsed && <span>{t('dashboard.audit', 'Audit Trail')}</span>}
          </button>

          {/* Worker Outputs */}
          <button
            onClick={() => activeProjectId && navigate('/sdlc/outputs')}
            disabled={!activeProjectId}
            title={collapsed ? t('dashboard.outputs', 'Worker Outputs') : undefined}
            className={`
              w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs transition-all relative group
              ${
                !activeProjectId
                  ? 'opacity-40 cursor-not-allowed text-on-surface-variant/50'
                  : isOutputsActive
                  ? 'bg-primary/10 border-l-[3px] border-primary text-primary font-bold shadow-[inset_0_0_10px_rgba(99,102,241,0.06)]'
                  : 'text-on-surface-variant hover:bg-surface-variant hover:text-on-surface border-l-[3px] border-transparent'
              }
              ${collapsed ? 'justify-center border-l-0' : ''}
            `}
          >
            <FolderOpen size={16} className={isOutputsActive ? 'text-primary' : 'text-on-surface-variant/80'} />
            {!collapsed && <span>{t('dashboard.outputs', 'Worker Outputs')}</span>}
          </button>

          {/* Settings */}
          <button
            onClick={() => activeProjectId && navigate(`/projects/${activeProjectId}/settings`)}
            disabled={!activeProjectId}
            title={collapsed ? t('layout.projectSettings', 'Project Settings') : undefined}
            className={`
              w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs transition-all relative group
              ${
                !activeProjectId
                  ? 'opacity-40 cursor-not-allowed text-on-surface-variant/50'
                  : isSettingsActive
                  ? 'bg-primary/10 border-l-[3px] border-primary text-primary font-bold shadow-[inset_0_0_10px_rgba(99,102,241,0.06)]'
                  : 'text-on-surface-variant hover:bg-surface-variant hover:text-on-surface border-l-[3px] border-transparent'
              }
              ${collapsed ? 'justify-center border-l-0' : ''}
            `}
          >
            <Settings size={16} className={isSettingsActive ? 'text-primary' : 'text-on-surface-variant/80'} />
            {!collapsed && <span>{t('layout.projectSettings', 'Project Settings')}</span>}
          </button>
        </nav>
      </div>

      {/* 4. Footer Section */}
      <div className="border-t border-outline-variant shrink-0 flex flex-col">
        {/* Profile Navigator */}
        <button
          onClick={() => navigate('/profile')}
          title={t('layout.myProfile')}
          className={`
            flex items-center gap-3 p-3 text-left transition-colors hover:bg-surface-variant/60
            ${collapsed ? 'justify-center' : ''}
          `}
        >
          <div className="w-8 h-8 rounded-xl border border-outline-variant overflow-hidden shrink-0">
            <img
              src={avatarUrl}
              alt="avatar"
              className="w-full h-full object-cover"
            />
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold leading-tight text-on-surface truncate">
                {displayName}
              </p>
              <p className="text-[9px] text-on-surface-variant/80 uppercase tracking-widest font-label-mono leading-none mt-1 truncate">
                {roleName}
              </p>
            </div>
          )}
        </button>

        {/* Collapsible toggle */}
        <div className="border-t border-outline-variant/30 p-2">
          <button
            onClick={onToggleCollapse}
            title={collapsed ? t('layout.expand') : t('layout.collapse')}
            className={`
              w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-xs
              text-on-surface-variant hover:bg-surface-variant transition-colors
              ${collapsed ? 'justify-center' : ''}
            `}
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
            {!collapsed && <span>{t('layout.collapse')}</span>}
          </button>
        </div>
      </div>
    </aside>
  );
};
