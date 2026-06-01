const prisma = require('../config/database');
const bcrypt = require('bcryptjs');

const SALT_ROUNDS = 12;

class AdminUserModel {
  static async create({ email, password, fullName }) {
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const data = await prisma.adminUser.create({
      data: {
        email: email.toLowerCase().trim(),
        passwordHash,
        fullName: fullName || null,
      }
    });
    return this._mapSafe(data);
  }

  static async findByEmail(email) {
    const data = await prisma.adminUser.findUnique({
      where: { email: email.toLowerCase().trim() }
    });
    return data; // returns passwordHash for verification
  }

  static async findById(id) {
    const data = await prisma.adminUser.findUnique({
      where: { id }
    });
    return this._mapSafe(data);
  }

  static async verifyPassword(plaintext, hash) {
    return bcrypt.compare(plaintext, hash);
  }

  static _mapSafe(row) {
    if (!row) return null;
    return {
      id: row.id,
      email: row.email,
      fullName: row.fullName,
      isActive: row.isActive,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}

module.exports = AdminUserModel;
