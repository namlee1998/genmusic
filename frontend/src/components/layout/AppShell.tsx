import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ProjectPanel } from './ProjectPanel';
import { useApiActions } from '@/hooks/useApiActions';
import { useAppStore } from '@/store';
import { ProfilePage } from '@/pages/Profile';
import { ProjectSettings } from '@/pages/ProjectSettings';
import { NotFoundPage } from '@/pages/NotFound';
import SdlcDashboard from '@/pages/SdlcDashboard';
import { AppTopBar } from './AppTopBar';
import { QuotaWarningBanner } from './QuotaWarningBanner';
import { CreateProjectDialog } from './CreateProjectDialog';

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
