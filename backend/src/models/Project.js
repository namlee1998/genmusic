const prisma = require('../config/database');

class ProjectModel {
  static async create(data) {
    const record = await prisma.project.create({
      data: {
        id: data.id,
        name: data.name,
        createdBy: data.createdBy || null,
      }
    });
    return this._map(record);
  }

  static async findById(id) {
    const data = await prisma.project.findUnique({ where: { id } });
    return this._map(data);
  }

  static async list() {
    const data = await prisma.project.findMany({
      orderBy: { createdAt: 'asc' }
    });
    return (data || []).map(this._map);
  }

  static async listByIds(ids) {
    if (!ids || ids.length === 0) return [];
    const data = await prisma.project.findMany({
      where: { id: { in: ids } },
      orderBy: { createdAt: 'asc' }
    });
    return (data || []).map(this._map);
  }

  static async update(id, payload) {
    const record = await prisma.project.update({
      where: { id },
      data: payload
    });
    return this._map(record);
  }

  static async delete(id) {
    await prisma.project.delete({ where: { id } });
  }

  static _map(row) {
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      createdBy: row.createdBy,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}

module.exports = ProjectModel;
