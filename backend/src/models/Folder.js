const prisma = require('../config/database');

class FolderModel {
  static async create(data) {
    const record = await prisma.folder.create({
      data: {
        id: data.id,
        projectId: data.projectId || data.project_id,
        parentId: data.parentId || data.parent_id || null,
        name: data.name,
        sortOrder: (data.sortOrder || data.sort_order) ?? 0,
      }
    });
    return this._map(record);
  }

  static async findById(id) {
    const data = await prisma.folder.findUnique({ where: { id } });
    return this._map(data);
  }

  static async listByProjectId(projectId) {
    const data = await prisma.folder.findMany({
      where: { projectId },
      orderBy: [
        { sortOrder: 'asc' },
        { createdAt: 'asc' }
      ]
    });
    return (data || []).map(this._map);
  }

  static async listAll() {
    const data = await prisma.folder.findMany({
      orderBy: { createdAt: 'asc' }
    });
    return (data || []).map(this._map);
  }

  static async update(id, payload) {
    const mapped = {
        projectId: payload.projectId || payload.project_id,
        parentId: payload.parentId || payload.parent_id,
        name: payload.name,
        sortOrder: payload.sortOrder || payload.sort_order,
    };
    Object.keys(mapped).forEach(k => mapped[k] === undefined && delete mapped[k]);

    const record = await prisma.folder.update({
      where: { id },
      data: mapped
    });
    return this._map(record);
  }

  static async delete(id) {
    await prisma.folder.delete({ where: { id } });
  }

  static _map(row) {
    if (!row) return null;
    return {
      id: row.id,
      projectId: row.projectId,
      parentId: row.parentId,
      name: row.name,
      sortOrder: row.sortOrder,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}

module.exports = FolderModel;
