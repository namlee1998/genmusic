const prisma = require('../config/database');

class FeatureBacklog {
  static async create(data) {
    const mapped = {
        projectId: data.project_id || data.projectId,
        taskId: data.task_id || data.taskId,
        title: data.title,
        description: data.description,
        priority: data.priority,
        status: data.status,
    };
    Object.keys(mapped).forEach(k => mapped[k] === undefined && delete mapped[k]);
    const record = await prisma.featureBacklog.create({ data: mapped });
    return record;
  }

  static async findByProjectId(projectId) {
    // Repair legacy rows left behind when the client moved a card before task creation.
    await prisma.featureBacklog.updateMany({
      where: { projectId, status: 'IN_PROGRESS', taskId: null },
      data: { status: 'TODO' }
    });

    const data = await prisma.featureBacklog.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' }
    });
    return data;
  }

  static async updateStatus(id, status) {
    const data = await prisma.featureBacklog.update({
      where: { id },
      data: { status }
    });
    return data;
  }

  static async linkTask(id, taskId, projectId) {
    const result = await prisma.featureBacklog.updateMany({
      where: { id, projectId, status: 'TODO' },
      data: { taskId, status: 'IN_PROGRESS' }
    });
    if (result.count !== 1) {
      throw new Error('Backlog item must belong to the project and be in TODO before starting an agent');
    }
  }

  static async updateStatusByTaskId(taskId, status) {
    await prisma.featureBacklog.updateMany({
      where: { taskId },
      data: { status }
    });
  }

  static async deleteByProject(projectId) {
    await prisma.featureBacklog.deleteMany({
      where: { projectId }
    });
  }
}

module.exports = FeatureBacklog;
