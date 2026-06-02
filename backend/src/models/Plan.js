const prisma = require('../config/database');

class PlanModel {
  static async ensureDefaults() {
    const defaults = [
      {
        id: 'free',
        name: 'Free',
        creditsLimit: 50,
        maxProjects: 3,
        maxMembersPerProject: 3,
        taskHistoryDays: 30,
        description: '50 credits/month - up to 50,000 tokens',
      },
      {
        id: 'pro',
        name: 'Pro',
        creditsLimit: 1000,
        maxProjects: null,
        maxMembersPerProject: 20,
        taskHistoryDays: null,
        description: '1,000 credits/month - up to 1,000,000 tokens',
      },
    ];

    await Promise.all(defaults.map((plan) => prisma.plan.upsert({
      where: { id: plan.id },
      update: plan,
      create: plan,
    })));
  }

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
