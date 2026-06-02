const { v4: uuidv4 } = require('uuid');
const { Project, Folder, Document, ProjectMember } = require('../models');
const DocumentService = require('./DocumentService');
const MembershipService = require('./MembershipService');
const QuotaService = require('./QuotaService');
const prisma = require('../config/database');
const { ApiError } = require('../middleware/errorHandler');

class ProjectService {
  async listProjects(user) {
    const projectIds = await MembershipService.listAccessibleProjectIds(user.id);
    const projects = await Project.listByIds(projectIds);
    return Promise.all(projects.map(async (project) => ({
      ...project,
      role: await MembershipService.getUserProjectRole(user.id, project.id),
    })));
  }

  async createProject(name, user) {
    if (!name || !name.trim()) {
      throw new ApiError(400, 'Project name is required');
    }
    if (!user?.id) throw new ApiError(401, 'Authenticated user is required');

    const sub = await QuotaService.getOrProvisionSubscription(user.id);
    const { Plan } = require('../models');
    const plan = await Plan.findById(sub.planId);
    if (plan?.maxProjects !== null && plan?.maxProjects !== undefined) {
      const ownedCount = await ProjectMember.countOwnedByUser(user.id);
      if (ownedCount >= plan.maxProjects) {
        throw new ApiError(403, `Gói ${plan.name} chỉ cho phép tạo tối đa ${plan.maxProjects} project. Hãy nâng cấp lên Pro để tạo thêm.`);
      }
    }

    const project = await Project.create({
      id: uuidv4(),
      name: name.trim(),
      createdBy: user.id,
    });
    await MembershipService.createOwnerMembership(project.id, user.id);
    return { ...project, role: 'owner' };
  }

  async renameProject(projectId, name, user) {
    await MembershipService.requireProjectRole(user.id, projectId, ['owner', 'admin']);
    const project = await Project.findById(projectId);
    if (!project) throw new ApiError(404, 'Project not found');
    if (!name || !name.trim()) throw new ApiError(400, 'Project name is required');
    const updated = await Project.update(projectId, { name: name.trim() });
    const role = await MembershipService.getUserProjectRole(user.id, projectId);
    return { ...updated, role };
  }

  async deleteProject(projectId, user) {
    await MembershipService.requireProjectRole(user.id, projectId, ['owner']);
    const project = await Project.findById(projectId);
    if (!project) throw new ApiError(404, 'Project not found');

    const projectDocs = await Document.list({ projectId, limit: 1000, offset: 0 });
    const docIds = projectDocs.rows.map((d) => d.id);
    for (const docId of docIds) {
      await DocumentService.deleteDocument(docId, user, { skipAccessCheck: true });
    }

    const tasks = await prisma.task.findMany({
      where: { projectId },
      select: { id: true },
    });
    const taskIds = tasks.map((task) => task.id);

    await prisma.$transaction([
      prisma.agentArtifact.deleteMany({
        where: taskIds.length > 0
          ? { OR: [{ projectId }, { taskId: { in: taskIds } }] }
          : { projectId },
      }),
      prisma.testcase.deleteMany({ where: { projectId } }),
      prisma.hitlDecision.deleteMany({ where: { projectId } }),
      prisma.featureBacklog.deleteMany({ where: { projectId } }),
      prisma.sessionState.deleteMany({ where: { projectId } }),
      prisma.usageLog.updateMany({
        where: { projectId },
        data: { projectId: null, taskId: null },
      }),
      prisma.task.deleteMany({ where: { projectId } }),
      prisma.folder.deleteMany({ where: { projectId } }),
      prisma.projectInvitation.deleteMany({ where: { projectId } }),
      prisma.projectMembership.deleteMany({ where: { projectId } }),
      prisma.project.delete({ where: { id: projectId } }),
    ]);
    return true;
  }

  async getProjectTree(projectId, user) {
    await MembershipService.requireProjectRole(user.id, projectId, ['owner', 'admin', 'editor', 'viewer']);
    const project = await Project.findById(projectId);
    if (!project) throw new ApiError(404, 'Project not found');

    const [folders, docsResult] = await Promise.all([
      Folder.listByProjectId(projectId),
      Document.list({ projectId, limit: 1000, offset: 0 }),
    ]);

    return {
      project,
      folders,
      documents: docsResult.rows,
    };
  }
}

module.exports = new ProjectService();
