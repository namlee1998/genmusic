const prisma = require('../config/database');

class TaskModel {
  static async create(data) {
    const record = await prisma.task.create({
      data: {
        id: data.id,
        projectId: data.projectId,
        type: data.type,
        status: data.status || 'pending',
        promptProfile: data.promptProfile,
        result: data.result,
        error: data.error,
        inputContentHash: data.inputContentHash || null,
        outputContentHash: data.outputContentHash || null,
        sourceRunId: data.sourceRunId || null,
        versionStatus: data.versionStatus || 'draft',
        observability: data.observability || {},
      }
    });
    return this._map(record);
  }

  static async findById(id) {
    const data = await prisma.task.findUnique({ where: { id } });
    return this._map(data);
  }

  static async findByIdWithDocument(id) {
    return this.findById(id);
  }

  static async update(id, data) {
    const mapped = {
      updatedAt: data.updated_at ? new Date(data.updated_at) : new Date(),
      status: data.status,
      result: data.result,
      error: data.error,
      versionStatus: data.version_status || data.versionStatus,
      observability: data.observability,
      outputContentHash: data.output_content_hash || data.outputContentHash,
      sourceRunId: data.source_run_id || data.sourceRunId,
    };
    Object.keys(mapped).forEach(k => mapped[k] === undefined && delete mapped[k]);

    const record = await prisma.task.update({
      where: { id },
      data: mapped
    });
    return this._map(record);
  }

  static async findByProjectId(projectId) {
    const data = await prisma.task.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' }
    });
    return (data || []).map(this._map);
  }

  static async list(filters = {}) {
    const limit = Number.isFinite(filters.limit) ? filters.limit : 50;
    const take = Math.max(1, Math.min(limit, 200));

    const where = {};
    if (filters.type)      where.type = filters.type;
    if (filters.status)    where.status = filters.status;
    if (filters.projectId) where.projectId = filters.projectId;
    if (filters.sinceDate) where.createdAt = { gte: new Date(filters.sinceDate) };

    const data = await prisma.task.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take
    });
    return (data || []).map(this._map);
  }

  static async deleteById(id) {
    await prisma.task.delete({ where: { id } });
  }

  static async findLatestByProject(projectId, type, status = null, versionStatus = null) {
    const where = { projectId };
    if (type) where.type = type;
    if (status) where.status = status;
    if (versionStatus) where.versionStatus = versionStatus;

    const data = await prisma.task.findFirst({
      where,
      orderBy: { createdAt: 'desc' }
    });
    return this._map(data);
  }

  static async commitTask(id) {
    const record = await prisma.task.update({
      where: { id },
      data: { versionStatus: 'committed' }
    });
    return this._map(record);
  }

  static _map(row) {
    if (!row) return null;
    return {
      id: row.id,
      projectId: row.projectId,
      type: row.type,
      status: row.status,
      promptProfile: row.promptProfile,
      result: row.result,
      error: row.error,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      inputContentHash: row.inputContentHash || null,
      outputContentHash: row.outputContentHash || null,
      sourceRunId: row.sourceRunId || null,
      versionStatus: row.versionStatus || 'committed',
      observability: row.observability || {},
    };
  }
}

module.exports = TaskModel;
