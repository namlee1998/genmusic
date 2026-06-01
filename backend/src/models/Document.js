const prisma = require('../config/database');

class DocumentModel {
  static async create(data) {
    const record = await prisma.document.create({
      data: {
        id: data.id,
        projectId: data.projectId || data.project_id,
        fileName: data.fileName || data.file_name,
        fileType: data.fileType || data.file_type,
        filePath: data.filePath || data.file_path,
        fileSize: data.fileSize || data.file_size,
        folderId: data.folderId || data.folder_id,
        status: data.status || 'uploaded',
      }
    });
    return this._map(record);
  }

  static async findById(id) {
    const data = await prisma.document.findUnique({ where: { id } });
    return this._map(data);
  }

  static async update(id, data) {
    const mapped = {
        projectId: data.projectId || data.project_id,
        fileName: data.fileName || data.file_name,
        fileType: data.fileType || data.file_type,
        filePath: data.filePath || data.file_path,
        fileSize: data.fileSize || data.file_size,
        folderId: data.folderId || data.folder_id,
        status: data.status,
    };
    Object.keys(mapped).forEach(k => mapped[k] === undefined && delete mapped[k]);

    const record = await prisma.document.update({
      where: { id },
      data: mapped
    });
    return this._map(record);
  }

  static async list({ limit = 50, offset = 0, projectId } = {}) {
    const where = projectId ? { projectId } : {};
    
    const [data, count] = await Promise.all([
      prisma.document.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit
      }),
      prisma.document.count({ where })
    ]);

    return { rows: (data || []).map(this._map), count };
  }

  static async delete(id) {
    await prisma.document.delete({ where: { id } });
  }

  static async rename(id, fileName) {
    const record = await prisma.document.update({
      where: { id },
      data: { fileName }
    });
    return this._map(record);
  }

  static async move(id, { projectId, folderId }) {
    const record = await prisma.document.update({
      where: { id },
      data: {
        projectId,
        folderId: folderId || null
      }
    });
    return this._map(record);
  }

  static _map(row) {
    if (!row) return null;
    return {
      id: row.id,
      projectId: row.projectId,
      fileName: row.fileName,
      fileType: row.fileType,
      filePath: row.filePath,
      fileSize: row.fileSize,
      folderId: row.folderId,
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}

module.exports = DocumentModel;
