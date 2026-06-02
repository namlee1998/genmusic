const prisma = require('../config/database');

function serializeJson(value) {
  if (value === null || value === undefined || typeof value === 'string') return value ?? null;
  return JSON.stringify(value);
}

function parseJson(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch (_) {
    return null;
  }
}

class AgentArtifactModel {
  static async bulkUpsert(records) {
    if (!records || records.length === 0) return [];

    const rows = records.map((data, index) => ({
      taskId: data.taskId || data.task_id,
      projectId: data.projectId || data.project_id,
      agentType: data.agentType || data.agent_type,
      artifactType: data.artifactType || data.artifact_type,
      artifactKey: data.artifactKey || data.artifact_key,
      title: data.title ?? null,
      contentJson: serializeJson((data.contentJson || data.content_json) ?? null),
      contentText: (data.contentText || data.content_text) ?? null,
      ordinal: data.ordinal ?? index,
      sourceArtifactId: (data.sourceArtifactId || data.source_artifact_id) ?? null,
      contentHash: (data.contentHash || data.content_hash) ?? null,
      updatedAt: new Date(),
    }));

    const result = [];
    for (const row of rows) {
      const existing = await prisma.agentArtifact.findFirst({
        where: {
          taskId: row.taskId,
          artifactType: row.artifactType,
          artifactKey: row.artifactKey
        }
      });

      let updatedRecord;
      if (existing) {
        updatedRecord = await prisma.agentArtifact.update({
          where: { id: existing.id },
          data: row
        });
      } else {
        updatedRecord = await prisma.agentArtifact.create({
          data: row
        });
      }
      result.push(updatedRecord);
    }

    return result.map((row) => this._map(row));
  }

  static async findByTaskId(taskId) {
    const data = await prisma.agentArtifact.findMany({
      where: { taskId },
      orderBy: [
        { ordinal: 'asc' },
        { createdAt: 'asc' }
      ]
    });
    return (data || []).map((row) => this._map(row));
  }

  static async findByTaskIdAndType(taskId, artifactType) {
    const data = await prisma.agentArtifact.findMany({
      where: { taskId, artifactType },
      orderBy: [
        { ordinal: 'asc' },
        { createdAt: 'asc' }
      ]
    });
    return (data || []).map((row) => this._map(row));
  }

  static async findByProjectId(projectId) {
    const data = await prisma.agentArtifact.findMany({
      where: { projectId },
      orderBy: [
        { createdAt: 'asc' },
        { ordinal: 'asc' }
      ]
    });
    return (data || []).map((row) => this._map(row));
  }

  static async findPartialByOffset(taskId, offset = 0) {
    const allArtifacts = await this.findByTaskId(taskId);
    return {
      artifacts: allArtifacts.slice(offset),
      nextOffset: allArtifacts.length,
    };
  }

  static async deleteByTaskId(taskId) {
    await prisma.agentArtifact.deleteMany({
      where: { taskId }
    });
  }

  static _map(row) {
    if (!row) return null;
    return {
      id: row.id,
      taskId: row.taskId,
      projectId: row.projectId,
      agentType: row.agentType,
      artifactType: row.artifactType,
      artifactKey: row.artifactKey,
      title: row.title,
      contentJson: parseJson(row.contentJson),
      contentText: row.contentText,
      ordinal: row.ordinal,
      sourceArtifactId: row.sourceArtifactId,
      contentHash: row.contentHash,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}

module.exports = AgentArtifactModel;
