const prisma = require('../config/database');

class TestcaseModel {
  static async create(data) {
    const record = await prisma.testcase.create({
      data: {
        id: data.id,
        taskId: data.taskId,
        projectId: data.projectId,
        featureName: data.featureName,
        flowName: data.flowName,
        scenarioData: data.scenarioData,
        automationYaml: data.automationYaml,
        yamlFilename: data.yamlFilename,
      }
    });
    return this._map(record);
  }

  static async bulkCreate(records) {
    if (!records || records.length === 0) return [];

    const rows = records.map(data => ({
      id: data.id,
      taskId: data.taskId,
      projectId: data.projectId ?? null,
      featureName: data.featureName,
      flowName: data.flowName,
      scenarioData: data.scenarioData,
      automationYaml: data.automationYaml ?? null,
      yamlFilename: data.yamlFilename ?? null,
    }));

    await prisma.testcase.createMany({ data: rows });

    const ids = rows.map(r => r.id).filter(Boolean);
    let result = [];
    if (ids.length > 0) {
      result = await prisma.testcase.findMany({ where: { id: { in: ids } } });
    } else {
      const taskIds = [...new Set(rows.map(r => r.taskId))];
      result = await prisma.testcase.findMany({ where: { taskId: { in: taskIds } } });
    }

    return (result || []).map(row => this._map(row));
  }

  static async findByTaskId(taskId) {
    const data = await prisma.testcase.findMany({
      where: { taskId },
      orderBy: { createdAt: 'asc' }
    });
    return (data || []).map(this._map);
  }

  static async deleteByTaskId(taskId) {
    await prisma.testcase.deleteMany({
      where: { taskId }
    });
  }

  static async findByProjectId(projectId) {
    const data = await prisma.testcase.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' }
    });
    return (data || []).map(this._map);
  }

  static _map(row) {
    if (!row) return null;
    return {
      id: row.id,
      taskId: row.taskId,
      projectId: row.projectId,
      featureName: row.featureName,
      flowName: row.flowName,
      scenarioData: row.scenarioData,
      automationYaml: row.automationYaml,
      yamlFilename: row.yamlFilename,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}

module.exports = TestcaseModel;
