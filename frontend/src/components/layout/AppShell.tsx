import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AppSidebar } from './AppSidebar';
import { useApiActions } from '@/hooks/useApiActions';
import { useAppStore } from '@/store';
import { NotFoundPage } from '@/pages/NotFound';
import SdlcDashboard from '@/pages/SdlcDashboard';
import AuditPage from '@/pages/SdlcDashboard/AuditPage';
import HitlDashboard from '@/pages/SdlcDashboard/HitlDashboard';
import DebugPage from '@/pages/SdlcDashboard/DebugPage';
import AgentsPage from '@/pages/SdlcDashboard/AgentsPage';
import { AppTopBar } from './AppTopBar';
import { useSdlcStore } from '@/store/useSdlcStore';
import * as sdlcApi from '@/services/api/sdlcApi';
import { FeatureRequestProjectDialog } from './dialogs/FeatureRequestProjectDialog';
import { ImportProjectDialog } from './dialogs/ImportProjectDialog';


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
  const isDefaultRoute = location.pathname === '/sdlc' || location.pathname === '/sdlc/'; // → HitlDashboard
  const isBuildRoute = location.pathname === '/sdlc/build' || location.pathname === '/sdlc/build/';
  const isAuditRoute = location.pathname === '/sdlc/audit' || location.pathname === '/sdlc/audit/';
  const isDebugRoute = location.pathname === '/sdlc/debug' || location.pathname === '/sdlc/debug/';
  const isAgentsRoute = location.pathname === '/sdlc/agents' || location.pathname === '/sdlc/agents/';
  const isUnknownAppRoute = location.pathname.startsWith('/sdlc/')
    && location.pathname !== '/sdlc/' && location.pathname !== '/sdlc'
    && !isBuildRoute && !isAuditRoute && !isDebugRoute && !isAgentsRoute;

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

  async function handleCreateProject(name: string, url: string, files?: File[]) {
    const res = await api.createProject(name);
    upsertProject(res.data);
    
    let finalRepoUrl = url;
    
    if (files && files.length > 0 && import.meta.env.VITE_USE_MOCK !== 'true') {
      try {
        const uploadRes = await sdlcApi.uploadRepoFolder(res.data.project_id, files);
        if (uploadRes && uploadRes.repo_path) {
          finalRepoUrl = uploadRes.repo_path;
        }
      } catch (err) {
        console.error('Failed to upload repository folder:', err);
        throw err;
      }
    }

    localStorage.setItem(`repoUrl_${res.data.project_id}`, finalRepoUrl);
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
          <div className="flex-1 overflow-y-auto">
            {isUnknownAppRoute ? (
              <NotFoundPage mode="panel" />
            ) : isAuditRoute ? (
              <div className="flex flex-col h-full bg-background">
                <AuditPage />
              </div>
            ) : isDefaultRoute ? (
              <div className="flex flex-col h-full bg-background">
                <HitlDashboard />
              </div>
            ) : isBuildRoute ? (
              <div className="flex flex-col h-full bg-background">
                <SdlcDashboard />
              </div>
            ) : isDebugRoute ? (
              <div className="flex flex-col h-full bg-background">
                <DebugPage />
              </div>
            ) : isAgentsRoute ? (
              <div className="flex flex-col h-full bg-background">
                <AgentsPage />
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
            navigate('/sdlc/build?focusRequest=true');
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
