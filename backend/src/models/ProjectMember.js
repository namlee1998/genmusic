const prisma = require('../config/database');

class ProjectMemberModel {
  static async create(data) {
    const record = await prisma.projectMembership.create({
      data: {
        projectId: data.projectId,
        userId: data.userId,
        role: data.role,
        invitedBy: data.invitedBy || null,
        joinedAt: new Date(),
      }
    });
    return this._map(record);
  }

  static async find(projectId, userId) {
    const data = await prisma.projectMembership.findFirst({
      where: { projectId, userId }
    });
    return this._map(data);
  }

  static async listByProject(projectId) {
    const data = await prisma.projectMembership.findMany({
      where: { projectId },
      orderBy: { joinedAt: 'asc' }
    });
    return (data || []).map(this._map);
  }

  static async listByUser(userId) {
    const data = await prisma.projectMembership.findMany({
      where: { userId },
      orderBy: { joinedAt: 'asc' }
    });
    return (data || []).map(this._map);
  }

  static async countByProject(projectId) {
    return prisma.projectMembership.count({
      where: { projectId }
    });
  }

  static async countOwnedByUser(userId) {
    return prisma.projectMembership.count({
      where: { userId, role: 'owner' }
    });
  }

  static async countOwners(projectId) {
    return prisma.projectMembership.count({
      where: { projectId, role: 'owner' }
    });
  }

  static async updateRole(projectId, userId, role) {
    await prisma.projectMembership.updateMany({
      where: { projectId, userId },
      data: { role }
    });
    return this.find(projectId, userId);
  }

  static async delete(projectId, userId) {
    await prisma.projectMembership.deleteMany({
      where: { projectId, userId }
    });
  }

  static async deleteByProject(projectId) {
    await prisma.projectMembership.deleteMany({
      where: { projectId }
    });
  }

  static _map(row) {
    if (!row) return null;
    return {
      projectId: row.projectId,
      userId: row.userId,
      role: row.role,
      invitedBy: row.invitedBy,
      joinedAt: row.joinedAt,
      createdAt: row.joinedAt, 
    };
  }
}

module.exports = ProjectMemberModel;
