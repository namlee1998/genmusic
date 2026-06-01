import React from 'react';

export interface Project {
  id: string;
  name: string;
  role?: string;
}

interface ProjectPanelProps {
  projects: Project[];
  activeProjectId: string | null;
  onSelectProject: (id: string) => void;
  onCreateProject: () => void;
  onOpenSettings?: (id: string) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

const DOT_COLORS = ['bg-primary', 'bg-secondary', 'bg-tertiary', 'bg-warning', 'bg-error'];
const ROLE_BADGE_CLASSES: Record<string, string> = {
  owner: 'bg-error/10 text-error border-error/20',
  admin: 'bg-warning/10 text-warning border-warning/20',
  editor: 'bg-primary/10 text-primary border-primary/20',
  viewer: 'bg-surface-container-highest text-on-surface-variant border-outline-variant/30',
};

const roleBadgeClass = (role?: string) => (
  role ? ROLE_BADGE_CLASSES[role] || ROLE_BADGE_CLASSES.viewer : ROLE_BADGE_CLASSES.viewer
);

export const ProjectPanel: React.FC<ProjectPanelProps> = ({
  projects,
  activeProjectId,
  onSelectProject,
  onCreateProject,
  onOpenSettings,
  collapsed,
  onToggleCollapse,
}) => {
  return (
    <div
      className={`
        flex flex-col border-r border-outline-variant
        bg-surface-container-lowest transition-all duration-200 shrink-0
        ${collapsed ? 'w-12' : 'w-56'}
      `}
    >
      {/* Header */}
      <div
        className={`flex items-center border-b border-outline-variant shrink-0 ${collapsed ? 'justify-center h-16' : 'justify-between px-4 h-16'}`}
      >
        {!collapsed && (
          <span className="text-[11px] font-label-mono text-on-surface-variant uppercase tracking-widest px-1">
            Projects
          </span>
        )}
        <button
          onClick={onCreateProject}
          title="Tạo dự án mới"
          className="w-7 h-7 rounded flex items-center justify-center text-on-surface-variant hover:text-primary hover:bg-surface-variant transition-colors"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
        </button>
      </div>

      {/* Project list */}
      <div className="flex-1 overflow-y-auto custom-scrollbar py-3 px-2 min-h-0 space-y-1">
        {!collapsed && (
          <div className="px-2 mb-1">
            <span className="text-[9px] font-label-mono text-on-surface-variant/60 uppercase tracking-widest">
              Workspace
            </span>
          </div>
        )}
        
        {projects.map((project, idx) => {
          const dotColor = DOT_COLORS[idx % DOT_COLORS.length];
          const isActive = project.id === activeProjectId;

          if (collapsed) {
            return (
              <div
                key={project.id}
                title={`${project.name}${project.role ? ` - ${project.role}` : ''}`}
                onClick={() => onSelectProject(project.id)}
                className="flex items-center justify-center py-2.5 cursor-pointer rounded hover:bg-surface-variant"
              >
                <div
                  className={`w-2 h-2 rounded-full ${dotColor} transition-all ${
                    isActive
                      ? 'scale-125 ring-2 ring-primary/40 ring-offset-2 ring-offset-background'
                      : 'opacity-60'
                  }`}
                />
              </div>
            );
          }

          return (
            <div
              key={project.id}
              onClick={() => onSelectProject(project.id)}
              className={`
                flex items-center gap-2.5 px-3 py-2 rounded border cursor-pointer transition-all duration-150
                ${
                  isActive
                    ? 'bg-primary/10 border-primary/40 text-primary shadow-[0_0_10px_rgba(99,102,241,0.15)] font-semibold'
                    : 'text-on-surface-variant border-transparent hover:bg-surface-variant hover:text-on-surface'
                }
              `}
            >
              <div className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`} />
              <span className="truncate leading-tight text-xs">{project.name}</span>
              {project.role && (
                <span className={`ml-auto shrink-0 rounded border px-1.5 py-0.5 text-[9px] uppercase ${roleBadgeClass(project.role)}`}>
                  {project.role}
                </span>
              )}
              {typeof onOpenSettings === 'function' && (
                <button
                  type="button"
                  title="Cài đặt dự án"
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpenSettings(project.id);
                  }}
                  className="shrink-0 text-on-surface-variant hover:text-primary transition-colors ml-1"
                >
                  <span className="material-symbols-outlined text-[15px]">settings</span>
                </button>
              )}
            </div>
          );
        })}

        {!collapsed && projects.length === 0 && (
          <div className="py-6 px-2 text-center text-[11px] text-on-surface-variant/60">
            Chưa có dự án
          </div>
        )}

        {!collapsed && (
          <>
            <div className="my-2 mx-1 border-t border-outline-variant" />
            <button
              onClick={onCreateProject}
              className="w-full flex items-center gap-2 px-3 py-2 rounded text-xs text-on-surface-variant hover:text-primary hover:bg-surface-variant transition-colors"
            >
              <span className="material-symbols-outlined text-[14px]">add</span>
              <span>Tạo dự án mới</span>
            </button>
          </>
        )}
      </div>

      {/* Footer toggle */}
      <div className="border-t border-outline-variant p-2 shrink-0">
        <button
          onClick={onToggleCollapse}
          title={collapsed ? 'Mở rộng' : 'Thu gọn'}
          className={`
            w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs
            text-on-surface-variant hover:bg-surface-variant transition-colors
            ${collapsed ? 'justify-center' : ''}
          `}
        >
          <span className="material-symbols-outlined text-[16px]">
            {collapsed ? 'chevron_right' : 'chevron_left'}
          </span>
          {!collapsed && <span>Thu gọn</span>}
        </button>
      </div>
    </div>
  );
};
