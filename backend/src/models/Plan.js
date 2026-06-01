const prisma = require('../config/database');

class PlanModel {
  static async findAll() {
    const data = await prisma.plan.findMany({
      where: { isActive: true },
      orderBy: { creditsLimit: 'asc' }
    });
    return (data || []).map(this._map);
  }

  static async findById(id) {
    const data = await prisma.plan.findUnique({
      where: { id }
    });
    return this._map(data);
  }

  static _map(row) {
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      creditsLimit: row.creditsLimit,
      maxProjects: row.maxProjects ?? null,
      maxMembersPerProject: row.maxMembersPerProject ?? null,
      taskHistoryDays: row.taskHistoryDays ?? null,
      description: row.description,
      isActive: row.isActive,
      createdAt: row.createdAt,
    };
  }
}

module.exports = PlanModel;
