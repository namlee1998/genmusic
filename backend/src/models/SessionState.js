const prisma = require('../config/database');

class SessionStateModel {
  static async upsert(data) {
    const page = data.page;
    const userId = data.userId || data.user_id;
    const projectId = data.projectId || data.project_id;
    
    const existing = await prisma.sessionState.findFirst({
      where: { page, userId, projectId }
    });

    const mapped = {
        selectedDocIds: JSON.stringify(data.selectedDocIds || data.selected_doc_ids || []),
        taskId: data.taskId || data.task_id || null,
        metadata: JSON.stringify(data.metadata || {}),
    };

    if (existing) {
      const record = await prisma.sessionState.update({
        where: { id: existing.id },
        data: mapped
      });
      return this._map(record);
    } else {
      const record = await prisma.sessionState.create({
        data: {
          page,
          userId,
          projectId,
          ...mapped
        }
      });
      return this._map(record);
    }
  }

  static async findByPage(page, userId, projectId) {
    const data = await prisma.sessionState.findFirst({
      where: { page, userId, projectId }
    });
    return this._map(data);
  }

  static async deleteByPage(page, userId, projectId = null) {
    const where = { page, userId };
    if (projectId) where.projectId = projectId;
    
    await prisma.sessionState.deleteMany({ where });
    return true;
  }

  static async deleteById(id) {
    await prisma.sessionState.delete({ where: { id } });
    return true;
  }

  static async updateSelectedDocIds(id, selectedDocIds) {
    const record = await prisma.sessionState.update({
      where: { id },
      data: { selectedDocIds: JSON.stringify(selectedDocIds) }
    });
    return this._map(record);
  }

  static async removeDocIds(docIdsToRemove, options = {}) {
    const ids = new Set((docIdsToRemove || []).filter(Boolean));
    if (ids.size === 0) return;

    const where = {};
    if (options.projectId) where.projectId = options.projectId;
    if (options.userId) where.userId = options.userId;
    if (options.page) where.page = options.page;

    const data = await prisma.sessionState.findMany({ where });
    const touchedStates = (data || [])
      .map(this._map)
      .filter((state) => state.selectedDocIds.some((id) => ids.has(id)));

    for (const state of touchedStates) {
      const updatedDocIds = state.selectedDocIds.filter((id) => !ids.has(id));
      if (updatedDocIds.length === 0) {
        await this.deleteById(state.id);
      } else {
        await this.updateSelectedDocIds(state.id, updatedDocIds);
      }
    }
  }

  static _map(row) {
    if (!row) return null;
    return {
      id: row.id,
      page: row.page,
      userId: row.userId,
      projectId: row.projectId,
      selectedDocIds: typeof row.selectedDocIds === 'string' ? JSON.parse(row.selectedDocIds || '[]') : (row.selectedDocIds || []),
      taskId: row.taskId,
      metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata || '{}') : (row.metadata || {}),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}

module.exports = SessionStateModel;
