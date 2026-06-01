const prisma = require('../config/database');

class ProfileModel {
  static async findByUserId(userId) {
    const data = await prisma.profile.findUnique({
      where: { userId }
    });
    return this._map(data);
  }

  static async upsert(userId, data) {
    // Map snake_case or mixed to camelCase for Prisma
    const mapped = {
      fullName: data.full_name || data.fullName,
      age: data.age,
      jobTitle: data.job_title || data.jobTitle,
      address: data.address,
      phone: data.phone,
      bio: data.bio,
      avatarUrl: data.avatar_url || data.avatarUrl,
      avatarPath: data.avatar_path || data.avatarPath,
    };
    
    // Remove undefined
    Object.keys(mapped).forEach(key => mapped[key] === undefined && delete mapped[key]);

    const record = await prisma.profile.upsert({
      where: { userId },
      update: mapped,
      create: { userId, ...mapped }
    });
    return this._map(record);
  }

  static async update(userId, data) {
    const mapped = {
      fullName: data.full_name || data.fullName,
      age: data.age,
      jobTitle: data.job_title || data.jobTitle,
      address: data.address,
      phone: data.phone,
      bio: data.bio,
      avatarUrl: data.avatar_url || data.avatarUrl,
      avatarPath: data.avatar_path || data.avatarPath,
    };

    Object.keys(mapped).forEach(key => mapped[key] === undefined && delete mapped[key]);

    const record = await prisma.profile.update({
      where: { userId },
      data: mapped
    });
    return this._map(record);
  }

  static async delete(userId) {
    await prisma.profile.delete({
      where: { userId }
    });
  }

  static _map(row) {
    if (!row) return null;
    return {
      userId: row.userId,
      fullName: row.fullName,
      age: row.age,
      jobTitle: row.jobTitle,
      address: row.address,
      phone: row.phone,
      bio: row.bio,
      avatarUrl: row.avatarUrl,
      avatarPath: row.avatarPath,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}

module.exports = ProfileModel;
