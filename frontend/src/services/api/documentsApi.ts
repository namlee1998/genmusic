import api from './client';
import type {
  DocumentContentResponse,
  DocumentItem,
  DocumentPreviewResponse,
  FolderItem,
  ListDocumentsResponse,
  ListFoldersResponse,
  ListProjectsResponse,
  ProjectInvitationItem,
  ProjectItem,
  ProjectMemberItem,
  ProjectRole,
  TreeResponse,
  UploadDocumentResponse,
} from './types';

/**
 * Upload a document file to Supabase Storage via Backend.
 * POST /api/v1/documents/upload
 */
export async function uploadDocument(
  file: File,
  projectId: string,
  folderId?: string,
): Promise<UploadDocumentResponse> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('project_id', projectId);
  if (folderId) formData.append('folder_id', folderId);

  const { data } = await api.post<UploadDocumentResponse>('/documents/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

/**
 * List all documents with pagination.
 * GET /api/v1/documents
 */
export async function listDocuments(params?: {
  limit?: number;
  offset?: number;
  projectId?: string;
}): Promise<ListDocumentsResponse> {
  const { data } = await api.get<ListDocumentsResponse>('/documents', {
    params: {
      limit: params?.limit ?? 50,
      offset: params?.offset ?? 0,
      project_id: params?.projectId,
    },
  });
  return data;
}

/**
 * Get a single document by ID.
 * GET /api/v1/documents/:id
 */
export async function getDocument(documentId: string): Promise<DocumentItem> {
  const { data } = await api.get<{ status: string; data: DocumentItem }>(
    `/documents/${documentId}`,
  );
  return data.data;
}

/**
 * Delete a document.
 * DELETE /api/v1/documents/:id
 */
export async function deleteDocument(documentId: string): Promise<void> {
  await api.delete(`/documents/${documentId}`);
}

export async function renameDocument(
  documentId: string,
  fileName: string,
): Promise<{ status: string; data: DocumentItem }> {
  const { data } = await api.patch<{ status: string; data: DocumentItem }>(
    `/documents/${documentId}`,
    { file_name: fileName },
  );
  return data;
}

export async function moveDocument(
  documentId: string,
  payload: { project_id?: string; folder_id?: string | null },
): Promise<{ status: string; data: DocumentItem }> {
  const { data } = await api.patch<{ status: string; data: DocumentItem }>(
    `/documents/${documentId}/move`,
    payload,
  );
  return data;
}

export async function listProjects(): Promise<ListProjectsResponse> {
  const { data } = await api.get<ListProjectsResponse>('/projects');
  return data;
}

export async function createProject(name: string): Promise<{ status: string; data: ProjectItem }> {
  const { data } = await api.post<{ status: string; data: ProjectItem }>('/projects', { name });
  return data;
}

export async function renameProject(
  projectId: string,
  name: string,
): Promise<{ status: string; data: ProjectItem }> {
  const { data } = await api.patch<{ status: string; data: ProjectItem }>(
    `/projects/${projectId}`,
    { name },
  );
  return data;
}

export async function deleteProject(projectId: string): Promise<void> {
  await api.delete(`/projects/${projectId}`);
}

export async function listProjectMembers(projectId: string): Promise<ProjectMemberItem[]> {
  const { data } = await api.get<{ status: string; data: ProjectMemberItem[] }>(
    `/projects/${projectId}/members`,
  );
  return data.data;
}

export async function inviteProjectMember(
  projectId: string,
  payload: { email: string; role: Exclude<ProjectRole, 'owner'> },
): Promise<ProjectInvitationItem> {
  const { data } = await api.post<{ status: string; data: ProjectInvitationItem }>(
    `/projects/${projectId}/invitations`,
    payload,
  );
  return data.data;
}

export async function listProjectInvitations(projectId: string): Promise<ProjectInvitationItem[]> {
  const { data } = await api.get<{ status: string; data: ProjectInvitationItem[] }>(
    `/projects/${projectId}/invitations`,
  );
  return data.data;
}

export async function updateProjectMemberRole(
  projectId: string,
  userId: string,
  role: ProjectRole,
): Promise<ProjectMemberItem> {
  const { data } = await api.patch<{ status: string; data: ProjectMemberItem }>(
    `/projects/${projectId}/members/${userId}`,
    { role },
  );
  return data.data;
}

export async function removeProjectMember(projectId: string, userId: string): Promise<void> {
  await api.delete(`/projects/${projectId}/members/${userId}`);
}

export async function revokeProjectInvitation(
  projectId: string,
  invitationId: string,
): Promise<ProjectInvitationItem> {
  const { data } = await api.delete<{ status: string; data: ProjectInvitationItem }>(
    `/projects/${projectId}/invitations/${invitationId}`,
  );
  return data.data;
}

export async function listMyInvitations(): Promise<ProjectInvitationItem[]> {
  const { data } = await api.get<{ status: string; data: ProjectInvitationItem[] }>(
    '/invitations/mine',
  );
  return data.data;
}

export async function acceptInvitation(payload: {
  invitation_id?: string;
  token?: string;
}): Promise<ProjectInvitationItem> {
  const { data } = await api.post<{ status: string; data: ProjectInvitationItem }>(
    '/invitations/accept',
    payload,
  );
  return data.data;
}

export async function listFolders(projectId: string): Promise<ListFoldersResponse> {
  const { data } = await api.get<ListFoldersResponse>('/folders', {
    params: { project_id: projectId },
  });
  return data;
}

export async function createFolder(payload: {
  project_id: string;
  parent_id?: string | null;
  name: string;
}): Promise<{ status: string; data: FolderItem }> {
  const { data } = await api.post<{ status: string; data: FolderItem }>('/folders', payload);
  return data;
}

export async function renameFolder(
  folderId: string,
  name: string,
): Promise<{ status: string; data: FolderItem }> {
  const { data } = await api.patch<{ status: string; data: FolderItem }>(`/folders/${folderId}`, {
    name,
  });
  return data;
}

export async function moveFolder(
  folderId: string,
  payload: { project_id?: string; parent_id?: string | null; sort_order?: number },
): Promise<{ status: string; data: FolderItem }> {
  const { data } = await api.patch<{ status: string; data: FolderItem }>(
    `/folders/${folderId}/move`,
    payload,
  );
  return data;
}

export async function deleteFolder(folderId: string): Promise<void> {
  await api.delete(`/folders/${folderId}`);
}

export async function getDocumentTree(): Promise<TreeResponse> {
  const { data } = await api.get<TreeResponse>('/tree');
  return data;
}

/**
 * Get a signed URL to preview/download a document file.
 * GET /api/v1/documents/:id/preview
 */
export async function getDocumentPreview(documentId: string): Promise<DocumentPreviewResponse> {
  const { data } = await api.get<DocumentPreviewResponse>(`/documents/${documentId}/preview`);
  return data;
}

export async function getDocumentContent(documentId: string): Promise<DocumentContentResponse> {
  const { data } = await api.get<DocumentContentResponse>(`/documents/${documentId}/content`);
  return data;
}
