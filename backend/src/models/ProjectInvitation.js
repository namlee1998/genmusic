const prisma = require('../config/database');

class ProjectInvitationModel {
  static async create(data) {
    const record = await prisma.projectInvitation.create({
      data: {
        id: data.id,
        projectId: data.projectId,
        email: data.email,
        role: data.role,
        token: data.token,
        status: data.status || 'pending',
        invitedBy: data.invitedBy,
        expiresAt: data.expiresAt,
      }
    });
    return this._map(record);
  }

  static async findById(id) {
    const data = await prisma.projectInvitation.findUnique({ where: { id } });
    return this._map(data);
  }

  static async findByToken(token) {
    const data = await prisma.projectInvitation.findUnique({ where: { token } });
    return this._map(data);
  }

  static async listByProject(projectId) {
    const data = await prisma.projectInvitation.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' }
    });
    return (data || []).map(this._map);
  }

  static async countPendingByProject(projectId) {
    return prisma.projectInvitation.count({
      where: { projectId, status: 'pending' }
    });
  }

  static async listPendingByEmail(email) {
    const data = await prisma.projectInvitation.findMany({
      where: { email, status: 'pending' },
      orderBy: { createdAt: 'desc' }
    });
    return (data || []).map(this._map);
  }

  static async updateStatus(id, status) {
    const data = await prisma.projectInvitation.update({
      where: { id },
      data: { status }
    });
    return this._map(data);
  }

  static _map(row) {
    if (!row) return null;
    return {
      id: row.id,
      projectId: row.projectId,
      email: row.email,
      role: row.role,
      token: row.token,
      status: row.status,
      invitedBy: row.invitedBy,
      expiresAt: row.expiresAt,
      createdAt: row.createdAt,
    };
  }
}

module.exports = ProjectInvitationModel;
