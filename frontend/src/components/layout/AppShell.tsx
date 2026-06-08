import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AppSidebar } from './AppSidebar';
import { useApiActions } from '@/hooks/useApiActions';
import { useAppStore } from '@/store';
import { ProfilePage } from '@/pages/Profile';
import { ProjectSettings } from '@/pages/ProjectSettings';
import { NotFoundPage } from '@/pages/NotFound';
import SdlcDashboard from '@/pages/SdlcDashboard';
import AuditPage from '@/pages/SdlcDashboard/AuditPage';
import OutputsPage from '@/pages/SdlcDashboard/OutputsPage';
import HitlDashboard from '@/pages/SdlcDashboard/HitlDashboard';
import { AppTopBar } from './AppTopBar';
import { QuotaWarningBanner } from './QuotaWarningBanner';
import { useSdlcStore } from '@/store/useSdlcStore';



// ---------------------------------------------------------------------------
// Feature Request Project Selection Dialog
// ---------------------------------------------------------------------------
function FeatureRequestProjectDialog({
  projects,
  onCancel,
  onSelect,
}: {
  projects: Array<{ id: string; name: string; role?: string }>;
  onCancel: () => void;
  onSelect: (projectId: string) => void;
}) {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');

  const filtered = projects.filter((p) =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-outline-variant bg-surface-container-lowest p-6 shadow-2xl flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-on-surface flex items-center gap-2">
            <span>🚀</span>
            <span>{t('layout.newFeatureRequest', 'New Feature Request')}</span>
          </h2>
          <button
            type="button"
            onClick={onCancel}
            className="text-on-surface-variant hover:text-on-surface transition-colors p-1 rounded-lg hover:bg-surface-variant/40"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <p className="text-xs text-on-surface-variant mb-4">
          {t('layout.chooseProjectFirst', 'Please choose a project to request a feature for:')}
        </p>

        {/* Search Input */}
        <div className="relative mb-4 shrink-0">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/50 text-base">
            search
          </span>
          <input
            type="text"
            placeholder={t('layout.searchPlaceholder', 'Search...')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-surface-container border border-outline-variant/40 rounded-xl text-xs focus:outline-none focus:border-primary/50 text-on-surface"
          />
        </div>

        {/* Projects List */}
        <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 pr-1 min-h-[150px]">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-xs text-on-surface-variant/60 font-medium">
              {t('layout.noProjects', 'No projects found')}
            </div>
          ) : (
            filtered.map((p) => (
              <button
                key={p.id}
                onClick={() => onSelect(p.id)}
                className="w-full flex items-center justify-between gap-3 p-3 rounded-xl border border-outline-variant/30 bg-surface-container-low hover:bg-surface-variant hover:border-primary/30 transition-all text-left group"
              >
                <div className="min-w-0 flex-1">
                  <span className="block text-xs font-semibold text-on-surface truncate group-hover:text-primary transition-colors">
                    {p.name}
                  </span>
                </div>
                {p.role && (
                  <span className="shrink-0 rounded border px-1.5 py-0.5 text-[8px] uppercase tracking-wider bg-surface-container-highest text-on-surface-variant border-outline-variant/30">
                    {p.role}
                  </span>
                )}
              </button>
            ))
          )}
        </div>

        <div className="mt-5 pt-3 border-t border-outline-variant/20 flex justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-surface-container-high border border-outline-variant text-on-surface hover:bg-surface-variant transition-colors"
          >
            {t('layout.cancel', 'Cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}


// ---------------------------------------------------------------------------
// Create project dialog
// ---------------------------------------------------------------------------
function ImportProjectDialog({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void;
  onSubmit: (name: string, url: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validateUrl = (urlStr: string) => {
    if (!urlStr) return t('layout.projectNameLabel', 'Repository URL is required');
    const regex = /^(https?:\/\/)?(www\.)?(github|gitlab)\.com\/[\w-]+\/[\w.-]+(\.git)?\/?$/i;
    if (!regex.test(urlStr)) {
      return t('layout.createProjectFailed', 'Please enter a valid GitHub or GitLab URL');
    }
    return '';
  };

  const handleSubmit = async () => {
    const urlStr = value.trim();
    const validationError = validateUrl(urlStr);
    if (validationError) {
      setError(validationError);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const repoName = urlStr.replace(/\.git\/?$/, '').split('/').pop() || 'Imported Project';
      await onSubmit(repoName, urlStr);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (err as Error)?.message ??
        t('layout.createProjectFailed');
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center px-4">
      <div className="w-full max-w-sm rounded border border-outline-variant bg-surface-container-lowest shadow-2xl p-5">
        <h4 className="text-sm font-semibold text-on-surface mb-3">{t('layout.createProjectTitle')}</h4>
        <label className="block text-[11px] text-on-surface-variant mb-1 font-label-mono uppercase tracking-wider">{t('layout.projectNameLabel')}</label>
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onCancel();
            if (e.key === 'Enter') void handleSubmit();
          }}
          className="w-full rounded border border-outline-variant px-3 py-2 text-xs bg-surface-container-low text-on-surface placeholder:text-on-surface-variant/40 focus:border-secondary outline-none transition-colors"
          placeholder={t('layout.projectNamePlaceholder')}
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
            {t('layout.cancel')}
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !value.trim()}
            className="px-3 py-1.5 rounded text-xs font-semibold bg-primary text-on-primary hover:opacity-90 disabled:opacity-50 transition-all shadow-[0_0_10px_rgba(99,102,241,0.2)]"
          >
            {submitting ? t('layout.creating') : t('layout.createProjectBtn')}
          </button>
        </div>
      </div>
    </div>
  );
}

export const AppShell: React.FC = () => {
  const { t } = useTranslation();
  const api = useApiActions();
  const {
    projects,
    currentProjectId,
    treeLoaded,
    fetchTree,
    setCurrentProject,
    upsertProject,
    removeProject,
    isCreateProjectDialogOpen,
    setCreateProjectDialogOpen,
  } = useAppStore();
  const location = useLocation();
  const navigate = useNavigate();
  const isFeatureRequestFormOpen = useSdlcStore((s) => s.isFeatureRequestFormOpen);
  const setFeatureRequestFormOpen = useSdlcStore((s) => s.setFeatureRequestFormOpen);
  const isProfileRoute = location.pathname === '/profile';
  const isProjectSettingsRoute = location.pathname.startsWith('/projects/') && location.pathname.endsWith('/settings');
  const isAuditRoute = location.pathname === '/sdlc/audit' || location.pathname === '/sdlc/audit/';
  const isOutputsRoute = location.pathname === '/sdlc/outputs' || location.pathname === '/sdlc/outputs/';
  const isHitlRoute = location.pathname === '/sdlc/hitl' || location.pathname === '/sdlc/hitl/';
  const isUnknownAppRoute = location.pathname.startsWith('/sdlc/')
    && location.pathname !== '/sdlc/' && location.pathname !== '/sdlc'
    && !isAuditRoute && !isOutputsRoute && !isHitlRoute;

  const [panelCollapsed, setPanelCollapsed] = useState(() => {
    return localStorage.getItem('project-panel-collapsed') === 'true';
  });
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null);
  const [pendingDeleteProjectId, setPendingDeleteProjectId] = useState<string | null>(null);
  const [projectActionMessage, setProjectActionMessage] = useState<string | null>(null);


  useEffect(() => {
    if (!treeLoaded) void fetchTree();
  }, [fetchTree, treeLoaded]);

  function handleToggleCollapse() {
    const next = !panelCollapsed;
    setPanelCollapsed(next);
    localStorage.setItem('project-panel-collapsed', String(next));
  }

  async function handleCreateProject(name: string, url: string) {
    const res = await api.createProject(name);
    upsertProject(res.data);
    localStorage.setItem(`repoUrl_${res.data.project_id}`, url);
    setCurrentProject(res.data.project_id);
    setCreateProjectDialogOpen(false);
    // errors propagate up to CreateProjectDialog which displays them inline
  }

  useEffect(() => {
    if (!projectActionMessage) return;
    const timeout = window.setTimeout(() => setProjectActionMessage(null), 3500);
    return () => window.clearTimeout(timeout);
  }, [projectActionMessage]);

  async function handleDeleteProject(projectId: string) {
    const project = projects.find((item) => item.project_id === projectId);

    setDeletingProjectId(projectId);
    try {
      await api.deleteProject(projectId);
      removeProject(projectId);
      if (currentProjectId === projectId) {
        const fallbackId = projects.find((item) => item.project_id !== projectId)?.project_id || null;
        setCurrentProject(fallbackId);
      }
      setPendingDeleteProjectId(null);
      setProjectActionMessage(t('layout.projectActionDeleted', { name: project?.name || 'project' }));
    } catch (error) {
      const message = (error as { response?: { data?: { message?: string } }; message?: string })
        .response?.data?.message || (error as Error).message || t('layout.projectActionDeleteFailed');
      setProjectActionMessage(message);
    } finally {
      setDeletingProjectId(null);
    }
  }

  const panelProjects = projects.map((p) => ({ id: p.project_id, name: p.name, role: p.role }));

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-background dark">
      <AppTopBar />
      <QuotaWarningBanner />

      <div className="flex flex-1 min-h-0">
        <AppSidebar
          projects={panelProjects}
          activeProjectId={currentProjectId}
          onSelectProject={setCurrentProject}
          onCreateProject={() => setCreateProjectDialogOpen(true)}
          onDeleteProject={setPendingDeleteProjectId}
          deletingProjectId={deletingProjectId}
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
            ) : isAuditRoute ? (
              <div className="flex flex-col h-full bg-background">
                <AuditPage />
              </div>
            ) : isOutputsRoute ? (
              <div className="flex flex-col h-full bg-background">
                <OutputsPage />
              </div>
            ) : isHitlRoute ? (
              <div className="flex flex-col h-full bg-background">
                <HitlDashboard />
              </div>
            ) : (
              <div className="flex flex-col h-full bg-background">
                <SdlcDashboard />
              </div>
            )}
          </div>
        </main>
      </div>

      {isCreateProjectDialogOpen && (
        <ImportProjectDialog
          onCancel={() => setCreateProjectDialogOpen(false)}
          onSubmit={handleCreateProject}
        />
      )}

      {isFeatureRequestFormOpen && (
        <FeatureRequestProjectDialog
          projects={panelProjects}
          onCancel={() => setFeatureRequestFormOpen(false)}
          onSelect={(projectId) => {
            setCurrentProject(projectId);
            setFeatureRequestFormOpen(false);
            navigate('/sdlc?focusRequest=true');
          }}
        />
      )}

      {projectActionMessage && (
        <div className="fixed bottom-5 right-5 z-[1000] rounded-lg border border-outline-variant bg-surface-container-lowest px-4 py-3 text-xs font-semibold text-on-surface shadow-xl">
          {projectActionMessage}
        </div>
      )}

      {pendingDeleteProjectId && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-md rounded-xl border border-outline-variant bg-surface-container-lowest p-5 shadow-2xl">
            <h2 className="text-base font-bold text-on-surface">{t('layout.deleteProjectConfirm')}</h2>
            <p className="mt-2 text-sm text-on-surface-variant">
              {t('layout.deleteProjectDesc', { name: projects.find((item) => item.project_id === pendingDeleteProjectId)?.name || 'this project' })}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-outline-variant px-3 py-2 text-xs font-semibold text-on-surface-variant hover:bg-surface-variant"
                onClick={() => setPendingDeleteProjectId(null)}
                disabled={deletingProjectId !== null}
              >
                {t('layout.cancel')}
              </button>
              <button
                type="button"
                className="rounded-lg bg-error px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
                onClick={() => void handleDeleteProject(pendingDeleteProjectId)}
                disabled={deletingProjectId !== null}
              >
                {deletingProjectId ? t('layout.deleting') : t('layout.confirmDeleteBtn')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
