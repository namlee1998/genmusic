import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import * as api from '@/services/api';
import type { ProjectInvitationItem, ProjectMemberItem, ProjectRole } from '@/services/api';
import { useAppStore } from '@/store';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useTranslation } from 'react-i18next';

const MUTABLE_INVITE_ROLES: Exclude<ProjectRole, 'owner'>[] = ['admin', 'editor', 'viewer'];
const ROLE_LABELS: Record<ProjectRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  editor: 'Editor',
  viewer: 'Viewer',
};
const ROLE_BADGE_CLASSES: Record<ProjectRole, string> = {
  owner: 'bg-error/10 text-error border-error/20',
  admin: 'bg-warning/10 text-warning border-warning/20',
  editor: 'bg-primary/10 text-primary border-primary/20',
  viewer: 'bg-surface-container-highest text-on-surface-variant border-outline-variant/30',
};
const ROLE_DESCRIPTIONS: Record<ProjectRole, string> = {
  owner: 'Toàn quyền quản trị project, thành viên và dữ liệu.',
  admin: 'Quản lý thành viên và nội dung, nhưng không thể xóa project hoặc chỉnh owner.',
  editor: 'Làm việc với tài liệu và workflow, không quản lý thành viên.',
  viewer: 'Chỉ xem tài liệu, kết quả và thành viên; không chỉnh sửa hoặc chạy agent.',
};

function MemberDisplay({ member }: { member: ProjectMemberItem }) {
  const primary = member.full_name || member.email || member.user_id;
  const secondary = member.full_name && member.email ? member.email : null;
  return (
    <span className="min-w-0 flex-1 truncate">
      <span className="block truncate text-sm text-on-surface">{primary}</span>
      {secondary && <span className="block truncate text-xs text-on-surface-variant">{secondary}</span>}
    </span>
  );
}

export const ProjectSettings: React.FC = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const {
    projects,
    currentProjectId,
    documentsLoading,
    treeLoaded,
    upsertProject,
    removeProject,
    setCurrentProject,
  } = useAppStore();
  const projectId = useMemo(() => {
    const match = location.pathname.match(/^\/projects\/([^/]+)\/settings\/?$/);
    return match ? decodeURIComponent(match[1]) : '';
  }, [location.pathname]);
  const project = projects.find((p) => p.project_id === projectId);
  const userRole = project?.role;
  const canAdmin = userRole === 'owner' || userRole === 'admin';
  const canOwner = userRole === 'owner';
  const canEditContent = userRole === 'owner' || userRole === 'admin' || userRole === 'editor';
  const manageMembersDisabledReason = canAdmin ? undefined : t('settings.memberLimit');
  const editProjectDisabledReason = canAdmin ? undefined : t('settings.renameLimit');
  const deleteProjectDisabledReason = canOwner ? undefined : t('settings.deleteLimit');

  const [tab, setTab] = useState<'info' | 'access'>('info');
  const [name, setName] = useState(project?.name ?? '');
  const [members, setMembers] = useState<ProjectMemberItem[]>([]);
  const [invitations, setInvitations] = useState<ProjectInvitationItem[]>([]);
  const [email, setEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<Exclude<ProjectRole, 'owner'>>('viewer');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmAction, setConfirmAction] = useState<
    | { type: 'delete-project' }
    | { type: 'remove-member'; member: ProjectMemberItem }
    | { type: 'revoke-invitation'; invitation: ProjectInvitationItem }
    | null
  >(null);

  const tabs = useMemo(
    () => [
      ['info', t('settings.infoTab')],
      ['access', t('settings.accessTab')],
    ] as const,
    [t],
  );

  const roleDescriptions = useMemo<Record<ProjectRole, string>>(() => ({
    owner: t('settings.roleOwner'),
    admin: t('settings.roleAdmin'),
    editor: t('settings.roleEditor'),
    viewer: t('settings.roleViewer'),
  }), [t]);

  const memberEmails = useMemo(
    () => new Set(members.map((member) => member.email?.toLowerCase()).filter(Boolean)),
    [members],
  );
  const pendingInvitations = useMemo(
    () =>
      invitations.filter((invitation) => (
        invitation.status === 'pending' &&
        !memberEmails.has(invitation.email.toLowerCase())
      )),
    [invitations, memberEmails],
  );

  const roleOptionsForMember = (member: ProjectMemberItem): ProjectRole[] => {
    if (userRole === 'owner') return ['owner', 'admin', 'editor', 'viewer'];
    if (member.role === 'admin') return ['admin', 'editor', 'viewer'];
    return ['editor', 'viewer'];
  };

  // Reset loading and state variables during rendering to satisfy ESLint rule
  const [prevProjectName, setPrevProjectName] = useState(project?.name);
  if (project?.name !== prevProjectName) {
    setPrevProjectName(project?.name);
    setName(project?.name ?? '');
  }

  const [prevParams, setPrevParams] = useState({ projectId, canAdmin });
  if (projectId !== prevParams.projectId || canAdmin !== prevParams.canAdmin) {
    setPrevParams({ projectId, canAdmin });
    setLoading(true);
    setError(null);
  }

  const [prevSessionProj, setPrevSessionProj] = useState(projectId);
  if (project && currentProjectId !== projectId && projectId !== prevSessionProj) {
    setPrevSessionProj(projectId);
    setCurrentProject(projectId);
  }

  const refresh = async () => {
    if (!projectId) return;
    try {
      const [memberRows, inviteRows] = await Promise.all([
        api.listProjectMembers(projectId),
        canAdmin ? api.listProjectInvitations(projectId) : Promise.resolve([]),
      ]);
      setMembers(memberRows);
      setInvitations(inviteRows);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      setError(axiosErr?.response?.data?.message ?? (err instanceof Error ? err.message : t('settings.loadFailed')));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      void refresh();
    }, 0);
    return () => clearTimeout(timer);
  }, [projectId, canAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveName = async () => {
    if (!projectId || !name.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await api.renameProject(projectId, name.trim());
      upsertProject(res.data);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      setError(axiosErr?.response?.data?.message ?? (err instanceof Error ? err.message : t('settings.renameFailed')));
    } finally {
      setSaving(false);
    }
  };

  const deleteProject = async () => {
    if (!projectId) return;
    setError(null);
    try {
      await api.deleteProject(projectId);
      removeProject(projectId);
      setCurrentProject(null);
      navigate('/app');
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      setError(axiosErr?.response?.data?.message ?? (err instanceof Error ? err.message : t('settings.deleteFailed')));
    }
  };

  const invite = async () => {
    if (!email.trim() || !canAdmin) return;
    setError(null);
    try {
      await api.inviteProjectMember(projectId, { email: email.trim(), role: inviteRole });
      setEmail('');
      await refresh();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      setError(axiosErr?.response?.data?.message ?? (err instanceof Error ? err.message : t('settings.inviteFailed')));
    }
  };

  const updateRole = async (member: ProjectMemberItem, role: ProjectRole) => {
    setError(null);
    try {
      await api.updateProjectMemberRole(projectId, member.user_id, role);
      await refresh();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      setError(axiosErr?.response?.data?.message ?? (err instanceof Error ? err.message : t('settings.updateRoleFailed')));
    }
  };

  const removeMember = async (member: ProjectMemberItem) => {
    setError(null);
    try {
      await api.removeProjectMember(projectId, member.user_id);
      await refresh();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      setError(axiosErr?.response?.data?.message ?? (err instanceof Error ? err.message : t('settings.deleteMemberFailed')));
    }
  };

  const confirmTitle = !confirmAction
    ? ''
    : confirmAction.type === 'delete-project'
      ? t('settings.deleteProjectConfirm')
      : confirmAction.type === 'remove-member'
        ? t('settings.deleteMemberConfirm')
        : t('settings.revokeInviteConfirm');
  const confirmDescription = !confirmAction
    ? ''
    : confirmAction.type === 'delete-project'
      ? t('settings.deleteProjectDesc').replace('{name}', project?.name || '')
      : confirmAction.type === 'remove-member'
        ? t('settings.deleteMemberDesc').replace('{name}', confirmAction.member.full_name || confirmAction.member.email || confirmAction.member.user_id)
        : t('settings.revokeInviteDesc').replace('{email}', confirmAction.invitation.email);
  const handleConfirm = () => {
    const action = confirmAction;
    setConfirmAction(null);
    if (!action) return;
    if (action.type === 'delete-project') void deleteProject();
    if (action.type === 'remove-member') void removeMember(action.member);
    if (action.type === 'revoke-invitation') void revokeInvitation(action.invitation);
  };

  const revokeInvitation = async (inv: ProjectInvitationItem) => {
    setError(null);
    try {
      await api.revokeProjectInvitation(projectId, inv.invitation_id);
      await refresh();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      setError(axiosErr?.response?.data?.message ?? (err instanceof Error ? err.message : t('settings.revokeInviteFailed')));
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-background p-6">
      <div className="mx-auto flex max-w-5xl flex-col gap-5">
        {/* Header */}
        <div className="flex flex-col gap-4 border-b border-outline-variant/20 pb-5">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => navigate('/app')}
              className="inline-flex items-center gap-2 rounded-xl border border-outline-variant/30 bg-surface-container-low px-3 py-2 text-sm font-semibold text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              <span className="material-symbols-outlined text-[18px]">arrow_back</span>
              {t('settings.backMain')}
            </button>
          </div>
          <div>
            <h1 className="font-headline text-xl font-bold text-on-surface">{project?.name ?? 'Project'}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="text-xs text-on-surface-variant">{t('settings.yourRole')}</span>
              {userRole ? (
                <span className={`rounded border px-2 py-0.5 text-[10px] font-bold uppercase ${ROLE_BADGE_CLASSES[userRole]}`}>
                  {ROLE_LABELS[userRole]}
                </span>
              ) : (
                <span className="text-xs font-semibold text-on-surface-variant">{t('settings.loading')}</span>
              )}
            </div>
            {userRole && (
              <p className="mt-1 text-xs text-on-surface-variant">{roleDescriptions[userRole]}</p>
            )}
          </div>
        </div>

        {treeLoaded && !documentsLoading && !project && (
          <div className="rounded-lg border border-outline-variant/30 bg-surface-container-low px-4 py-3 text-sm text-on-surface-variant">
            {t('settings.noProjectPermission')}
          </div>
        )}

        {/* Error banner */}
        {error && (
          <div className="flex items-center gap-2 rounded-lg bg-error/10 border border-error/30 px-4 py-2 text-sm text-error">
            <span className="material-symbols-outlined text-[16px]">error</span>
            {error}
            <button onClick={() => setError(null)} className="ml-auto text-error/60 hover:text-error">
              <span className="material-symbols-outlined text-[14px]">close</span>
            </button>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2 border-b border-outline-variant/20">
          {tabs.map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`px-3 py-2 text-sm ${tab === id ? 'border-b-2 border-primary text-primary' : 'text-on-surface-variant'}`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Info tab */}
        {tab === 'info' && (
          <section className="max-w-xl space-y-4">
            <label className="block text-xs font-semibold text-on-surface-variant">{t('settings.projectName')}</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void saveName()}
              disabled={!canAdmin}
              title={editProjectDisabledReason}
              className="w-full rounded-lg border border-outline-variant/30 bg-surface-container-low px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-60"
            />
            <div className="flex gap-2">
              <button
                disabled={!canAdmin || saving || !name.trim()}
                title={editProjectDisabledReason}
                onClick={saveName}
                className="rounded-lg bg-primary px-3 py-2 text-xs font-bold text-on-primary disabled:opacity-50"
              >
                {saving ? t('settings.saving') : t('settings.saveBtn')}
              </button>
              <button
                disabled={!canOwner}
                title={deleteProjectDisabledReason}
                onClick={() => setConfirmAction({ type: 'delete-project' })}
                className="rounded-lg bg-error px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
              >
                {t('settings.deleteProjectBtn')}
              </button>
            </div>
          </section>
        )}

        {/* Access tab */}
        {tab === 'access' && (
          <section className="space-y-6">
            {!canAdmin && (
              <div className="rounded-lg border border-outline-variant/30 bg-surface-container-low px-4 py-3 text-xs text-on-surface-variant">
                {t('settings.readOnlyWarning')}{' '}
                {canEditContent ? t('settings.editorWarning') : t('settings.viewerWarning')}
              </div>
            )}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-on-surface">{t('settings.membersTitle')}</h2>
                <span className="text-xs text-on-surface-variant">{members.length} {t('settings.people')}</span>
              </div>
              {loading && <p className="text-xs text-on-surface-variant">{t('settings.loading')}</p>}
              {!loading && members.length === 0 && (
                <p className="text-xs text-on-surface-variant">{t('settings.noMembers')}</p>
              )}
              {members.map((member) => (
                <div key={member.user_id} className="flex items-center gap-3 border-b border-outline-variant/20 py-3">
                  <MemberDisplay member={member} />
                  <select
                    value={member.role}
                    disabled={!canAdmin || (member.role === 'owner' && !canOwner)}
                    title={!canAdmin ? manageMembersDisabledReason : member.role === 'owner' && !canOwner ? 'Admin không thể chỉnh Owner' : undefined}
                    onChange={(e) => void updateRole(member, e.target.value as ProjectRole)}
                    className="rounded border border-outline-variant/30 bg-surface-container-low px-2 py-1 text-xs disabled:opacity-60"
                  >
                    {roleOptionsForMember(member).map((r) => (
                      <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                    ))}
                  </select>
                  <button
                    disabled={!canAdmin || (member.role === 'owner' && !canOwner)}
                    title={!canAdmin ? manageMembersDisabledReason : member.role === 'owner' && !canOwner ? 'Admin không thể xóa Owner' : undefined}
                    onClick={() => setConfirmAction({ type: 'remove-member', member })}
                    className="rounded px-2 py-1 text-xs text-error disabled:opacity-40"
                  >
                    {t('settings.removeBtn')}
                  </button>
                </div>
              ))}
            </div>

            {canAdmin && (
              <div className="space-y-3 border-t border-outline-variant/20 pt-5">
                <div>
                  <h2 className="text-sm font-bold text-on-surface">{t('settings.pendingInvitations')}</h2>
                  <p className="text-xs text-on-surface-variant">{t('settings.pendingDesc')}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && void invite()}
                    placeholder="email@example.com"
                    className="min-w-64 rounded-lg border border-outline-variant/30 bg-surface-container-low px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as Exclude<ProjectRole, 'owner'>)}
                    className="rounded-lg border border-outline-variant/30 bg-surface-container-low px-3 py-2 text-sm"
                  >
                    {MUTABLE_INVITE_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                  </select>
                  <button
                    disabled={!email.trim()}
                    onClick={invite}
                    className="rounded-lg bg-primary px-3 py-2 text-xs font-bold text-on-primary disabled:opacity-50"
                  >
                    {t('settings.inviteBtn')}
                  </button>
                </div>
                {loading && <p className="text-xs text-on-surface-variant">{t('settings.loading')}</p>}
                {!loading && pendingInvitations.length === 0 && (
                  <p className="text-xs text-on-surface-variant">Không có lời mời đang chờ.</p>
                )}
                {pendingInvitations.map((inv) => (
                  <div key={inv.invitation_id} className="flex items-center gap-3 border-b border-outline-variant/20 py-3 text-sm">
                    <span className="flex-1 truncate">{inv.email}</span>
                    <span className="text-xs text-on-surface-variant">{ROLE_LABELS[inv.role]}</span>
                    <span className="text-xs text-warning">pending</span>
                    <button
                      onClick={() => setConfirmAction({ type: 'revoke-invitation', invitation: inv })}
                      className="text-xs text-error hover:underline"
                    >
                      {t('settings.revokeBtn')}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
      <ConfirmDialog
        open={!!confirmAction}
        title={confirmTitle}
        description={confirmDescription}
        confirmLabel={confirmAction?.type === 'revoke-invitation' ? t('settings.revokeBtn') : t('settings.removeBtn')}
        danger
        onConfirm={handleConfirm}
        onCancel={() => setConfirmAction(null)}
      />
    </div>
  );
};
