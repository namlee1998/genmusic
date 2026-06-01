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

  static async linkTask(id, taskId) {
    const data = await prisma.featureBacklog.update({
      where: { id },
      data: { taskId, status: 'IN_PROGRESS' }
    });
    return data;
  }
}

module.exports = FeatureBacklog;
