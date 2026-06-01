const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const { Task, AgentArtifact, HitlDecision } = require('../models');
const AgentService = require('./AgentService');
const MembershipService = require('./MembershipService');
const QuotaService = require('./QuotaService');
const QualityGateService = require('./QualityGateService');
const fs = require('fs/promises');
const path = require('path');
const { ApiError } = require('../middleware/errorHandler');

const WORKSPACE_DIR = path.join(__dirname, '../../../workspace/projects');

// ---------------------------------------------------------------------------
// Workflow State Machine
// States: DRAFT → PO_RUNNING → PO_REVIEW → UX_RUNNING → UX_REVIEW →
//         DEV_RUNNING → DEV_REVIEW → QA_RUNNING → QA_REVIEW →
//         FINAL_REVIEW → READY / HOLD
// Rework states: PO_REWORK | UX_REWORK | DEV_REWORK | QA_FAILED
// ---------------------------------------------------------------------------

const AGENT_GATES = {
  'intent-agent': 'REQUIREMENT_GATE',
  'po-agent':  'REQUIREMENT_GATE',
  'ux-agent':  'UX_GATE',
  'dev-agent': 'DEV_GATE',
  'qa-agent':  'QA_GATE',
};

const NEXT_AGENT = {
  'intent-agent': 'po-agent',
  'po-agent':  'ux-agent',
  'ux-agent':  'dev-agent',
  'dev-agent': 'qa-agent',
  'qa-agent':  null,          // → FINAL_REVIEW
};

const NODE_TARGET = {
  'intent-agent': 'intent_node',
  'po-agent':  'po_agent',
  'ux-agent':  'ux_agent',
  'dev-agent': 'dev_agent',
  'qa-agent':  'qa_agent',
};

const REWORK_TARGETS = {
  po_agent:  { sourceType: 'intent-agent', run: 'runPOAgent' },
  ux_agent:  { sourceType: 'po-agent',     run: 'runUXAgent' },
  dev_agent: { sourceType: 'ux-agent',     run: 'runDEVAgent' },
  qa_agent:  { sourceType: 'dev-agent',    run: 'runQAAgent' },
};

/** SHA-256 content hash */
function contentHash(value) {
  const json = typeof value === 'string' ? value : JSON.stringify(value);
  return crypto.createHash('sha256').update(json, 'utf8').digest('hex');
}

/** Build task result from artifacts for client consumption */
function buildTaskResult(task, artifacts = []) {
  const byType = {};
  for (const art of artifacts) {
    const artifactType = art.artifactType || art.type;
    if (!byType[artifactType]) byType[artifactType] = [];
    byType[artifactType].push(art);
  }

  return {
    agentType: task.type,
    artifacts: artifacts.map((a) => ({
      id: a.id,
      phase: a.phase || a.agentType,
      type: a.type || a.artifactType,
      key: a.key || a.artifactKey,
      title: a.title,
      contentText: a.contentText,
      contentJson: a.contentJson,
    })),
    ...task.result,
  };
}

async function resolveArtifactContent(artifact) {
  let contentText = artifact.contentText;
  let contentJson = artifact.contentJson;

  if (typeof contentText === 'string' && contentText.startsWith('FILE:')) {
    try {
      contentText = await fs.readFile(contentText.slice(5), 'utf8');
    } catch (_) {
      contentText = 'File not found';
    }
  }

  if (!contentText && contentJson?.file_path) {
    try {
      const raw = await fs.readFile(contentJson.file_path, 'utf8');
      try {
        contentJson = JSON.parse(raw);
      } catch (_) {
        contentText = raw;
        contentJson = null;
      }
    } catch (_) {
      contentText = 'File not found';
    }
  }

  return { contentText, contentJson };
}

async function formatArtifactForClient(artifact) {
  const { contentText, contentJson } = await resolveArtifactContent(artifact);
  return {
    id: artifact.id,
    taskId: artifact.taskId,
    projectId: artifact.projectId,
    phase: artifact.agentType,
    agentType: artifact.agentType,
    type: artifact.artifactType,
    artifactType: artifact.artifactType,
    key: artifact.artifactKey,
    artifactKey: artifact.artifactKey,
    title: artifact.title,
    contentText,
    contentJson,
    ordinal: artifact.ordinal,
    sourceArtifactId: artifact.sourceArtifactId,
    contentHash: artifact.contentHash,
    createdAt: artifact.createdAt,
    updatedAt: artifact.updatedAt,
  };
}

class SdlcWorkflowService {
  // =========================================================================
  // Run Agents
  // =========================================================================

  /**
   * Start an Intent Agent run — generates AI assumptions from raw request.
   */
  async runIntentAgent({ projectId, featureRequest, feedbackPrompt = '', user }) {
    if (user) {
      await MembershipService.requireProjectRole(user.id, projectId, ['owner', 'admin', 'editor']);
    }

    const inputHash = contentHash({ featureRequest, feedbackPrompt });
    const task = await Task.create({
      id: uuidv4(),
      projectId,
      type: 'intent-agent',
      status: 'pending',
      inputContentHash: inputHash,
      versionStatus: 'draft',
    });

    this._runAgent(task, {
      featureRequest,
      feedbackPrompt,
    }, user?.id).catch((err) => console.error('[SDLC] Intent Agent failed:', err));

    return task;
  }

  /**
   * Start a PO Agent run — reads intent assumptions, produces PRD artifacts.
   */
  async runPOAgent({ projectId, sourceTaskId, feedbackPrompt = '', user }) {
    const sourceTask = await this._requireApprovedTask(sourceTaskId, 'intent-agent', user);

    const sourceArtifacts = await AgentArtifact.findByTaskId(sourceTask.id);
    const inputHash = contentHash({
      artifacts: sourceArtifacts.map((a) => a.contentHash),
      feedbackPrompt,
    });

    const task = await Task.create({
      id: uuidv4(),
      projectId: sourceTask.projectId,
      type: 'po-agent',
      status: 'pending',
      inputContentHash: inputHash,
      sourceRunId: sourceTask.id,
      versionStatus: 'draft',
    });

    const context = await this._buildContextFromArtifacts(sourceArtifacts, { feedbackPrompt });
    
    // We also need to pass the original feature request since po_agent expects it.
    // The original feature request is stored in the intent task's input content hash? No, in DB we don't store it plainly except if we look at the request payload.
    // For now, let's just fetch it from the first task's input, or pass it via context.
    // Actually, PO Agent's prompt can just read from context.intent_assumptions! Let's update PO Agent to accept Intent assumptions.

    this._runAgent(task, context, user?.id).catch((err) => console.error('[SDLC] PO Agent failed:', err));

    return task;
  }

  /**
   * Start a UX Agent run — reads approved PRD artifacts, produces UX spec.
   */
  async runUXAgent({ projectId, sourceTaskId, feedbackPrompt = '', user }) {
    const sourceTask = await this._requireApprovedTask(sourceTaskId, 'po-agent', user);

    const sourceArtifacts = await AgentArtifact.findByTaskId(sourceTask.id);
    const inputHash = contentHash({
      artifacts: sourceArtifacts.map((a) => a.contentHash),
      feedbackPrompt,
    });

    const task = await Task.create({
      id: uuidv4(),
      projectId: sourceTask.projectId,
      type: 'ux-agent',
      status: 'pending',
      inputContentHash: inputHash,
      sourceRunId: sourceTask.id,
      versionStatus: 'draft',
    });

    const context = await this._buildContextFromArtifacts(sourceArtifacts, { feedbackPrompt });
    this._runAgent(task, context, user?.id).catch((err) => console.error('[SDLC] UX Agent failed:', err));

    return task;
  }

  /**
   * Start a DEV Agent run — reads approved UX artifacts, produces implementation plan.
   */
  async runDEVAgent({ projectId, sourceTaskId, feedbackPrompt = '', user }) {
    const sourceTask = await this._requireApprovedTask(sourceTaskId, 'ux-agent', user);
    const effectiveProjectId = projectId || sourceTask.projectId;

    // Also load PO artifacts for DEV context
    const poTask = await Task.findLatestByProject(effectiveProjectId, 'po-agent', 'completed', 'committed');
    const [uxArtifacts, poArtifacts] = await Promise.all([
      AgentArtifact.findByTaskId(sourceTask.id),
      poTask ? AgentArtifact.findByTaskId(poTask.id) : Promise.resolve([]),
    ]);

    const inputHash = contentHash({
      artifacts: [...uxArtifacts, ...poArtifacts].map((a) => a.contentHash),
      feedbackPrompt,
    });

    const task = await Task.create({
      id: uuidv4(),
      projectId: sourceTask.projectId,
      type: 'dev-agent',
      status: 'pending',
      inputContentHash: inputHash,
      sourceRunId: sourceTask.id,
      versionStatus: 'draft',
    });

    const context = await this._buildContextFromArtifacts([...poArtifacts, ...uxArtifacts], { feedbackPrompt });
    this._runAgent(task, context, user?.id).catch((err) => console.error('[SDLC] DEV Agent failed:', err));

    return task;
  }

  /**
   * Start a QA Agent run — reads DEV artifacts + all upstream, produces test cases.
   */
  async runQAAgent({ projectId, sourceTaskId, feedbackPrompt = '', user }) {
    const sourceTask = await this._requireApprovedTask(sourceTaskId, 'dev-agent', user);
    const effectiveProjectId = projectId || sourceTask.projectId;

    const [poTask, uxTask] = await Promise.all([
      Task.findLatestByProject(effectiveProjectId, 'po-agent', 'completed', 'committed'),
      Task.findLatestByProject(effectiveProjectId, 'ux-agent', 'completed', 'committed'),
    ]);

    const allArtifacts = (
      await Promise.all([
        poTask ? AgentArtifact.findByTaskId(poTask.id) : Promise.resolve([]),
        uxTask ? AgentArtifact.findByTaskId(uxTask.id) : Promise.resolve([]),
        AgentArtifact.findByTaskId(sourceTask.id),
      ])
    ).flat();

    const inputHash = contentHash({
      artifacts: allArtifacts.map((a) => a.contentHash),
      feedbackPrompt,
    });

    const task = await Task.create({
      id: uuidv4(),
      projectId: sourceTask.projectId,
      type: 'qa-agent',
      status: 'pending',
      inputContentHash: inputHash,
      sourceRunId: sourceTask.id,
      versionStatus: 'draft',
    });

    const context = await this._buildContextFromArtifacts(allArtifacts, { feedbackPrompt });
    this._runAgent(task, context, user?.id).catch((err) => console.error('[SDLC] QA Agent failed:', err));

    return task;
  }

  // =========================================================================
  // HITL Gate
  // =========================================================================

  /**
   * Human submits a gate decision: APPROVE | REJECT | REQUEST_CHANGES
   */
  async submitGateDecision({ taskId, decision, comment, user }) {
    const task = await Task.findById(taskId);
    if (!task) throw new ApiError(404, 'Task not found');
    if (user) await MembershipService.requireProjectRole(user.id, task.projectId, ['owner', 'admin', 'editor']);
    if (task.status !== 'completed') throw new ApiError(400, 'Task must be completed before gate decision');

    const gate = AGENT_GATES[task.type];
    if (!gate) throw new ApiError(400, `Task type ${task.type} has no gate`);

    if (!['APPROVE', 'REJECT', 'REQUEST_CHANGES'].includes(decision)) {
      throw new ApiError(400, 'Decision must be APPROVE | REJECT | REQUEST_CHANGES');
    }

    const hitlRecord = await HitlDecision.create({
      id: uuidv4(),
      workflowRunId: task.projectId, // use projectId as workflow scope
      taskId: task.id,
      projectId: task.projectId,
      gate,
      decision,
      comment: comment || '',
      reviewerId: user?.id || null,
    });

    if (decision === 'APPROVE') {
      await Task.commitTask(taskId);
    } else if (decision === 'REQUEST_CHANGES' && comment) {
      // Trigger targeted rework automatically in the background
      this.triggerRework({
        projectId: task.projectId,
        sourceTaskId: taskId,
        feedbackPrompt: comment,
        user
      }).catch(err => console.error('[SDLC] Rework triggered by gate decision failed:', err));
    }

    return { task, hitlDecision: hitlRecord };
  }

  // =========================================================================
  // Targeted Rework Logic
  // =========================================================================

  /**
   * Evaluates the feedback via Python agents and triggers the appropriate agent.
   */
  async triggerRework({ projectId, sourceTaskId, feedbackPrompt, user }) {
    console.log(`[SDLC] Triggering Rework for project ${projectId}. Feedback: "${feedbackPrompt}"`);

    const rejectedTask = await Task.findById(sourceTaskId);
    if (!rejectedTask) throw new ApiError(404, 'Source task not found');
    if (user) await MembershipService.requireProjectRole(user.id, rejectedTask.projectId, ['owner', 'admin', 'editor']);

    if (rejectedTask.type === 'intent-agent') {
      const featureRequest = await this._getFeatureRequestFromIntentTask(rejectedTask);
      return this.runIntentAgent({
        projectId: rejectedTask.projectId,
        featureRequest,
        feedbackPrompt,
        user,
      });
    }

    // 1. Ask python Agent Server to analyze the feedback and route it
    const targetAgent = await AgentService.routeRework(feedbackPrompt);
    console.log(`[SDLC] Agent Server routed rework to: ${targetAgent}`);

    const reworkTarget = REWORK_TARGETS[targetAgent] || REWORK_TARGETS.dev_agent;
    if (!REWORK_TARGETS[targetAgent]) {
      console.warn(`[SDLC] Unrecognized rework target: ${targetAgent}. Defaulting to DEV.`);
    }

    const upstream = await Task.findLatestByProject(
      projectId || rejectedTask.projectId,
      reworkTarget.sourceType,
      'completed',
      'committed',
    );
    if (!upstream) {
      throw new ApiError(400, `Cannot rework ${targetAgent}: no committed ${reworkTarget.sourceType} source found`);
    }

    return this[reworkTarget.run]({
      projectId: projectId || rejectedTask.projectId,
      sourceTaskId: upstream.id,
      feedbackPrompt,
      user,
    });
  }

  // =========================================================================
  // Final Review Packet
  // =========================================================================

  async getFinalReviewPacket(projectId, user) {
    if (user) {
      await MembershipService.requireProjectRole(user.id, projectId, ['owner', 'admin', 'editor', 'viewer']);
    }

    const [intentTask, poTask, uxTask, devTask, qaTask] = await Promise.all([
      Task.findLatestByProject(projectId, 'intent-agent', 'completed', 'committed'),
      Task.findLatestByProject(projectId, 'po-agent', 'completed', 'committed'),
      Task.findLatestByProject(projectId, 'ux-agent', 'completed', 'committed'),
      Task.findLatestByProject(projectId, 'dev-agent', 'completed', 'committed'),
      Task.findLatestByProject(projectId, 'qa-agent', 'completed'),
    ]);

    const allArtifacts = (
      await Promise.all([
        intentTask ? AgentArtifact.findByTaskId(intentTask.id) : Promise.resolve([]),
        poTask ? AgentArtifact.findByTaskId(poTask.id) : Promise.resolve([]),
        uxTask ? AgentArtifact.findByTaskId(uxTask.id) : Promise.resolve([]),
        devTask ? AgentArtifact.findByTaskId(devTask.id) : Promise.resolve([]),
        qaTask ? AgentArtifact.findByTaskId(qaTask.id) : Promise.resolve([]),
      ])
    ).flat();

    const hitlDecisions = await HitlDecision.findByProjectId(projectId);

    return {
      phases: {
        intent: intentTask ? { taskId: intentTask.id, status: intentTask.status, versionStatus: intentTask.versionStatus } : null,
        po: poTask ? { taskId: poTask.id, status: poTask.status, versionStatus: poTask.versionStatus } : null,
        ux: uxTask ? { taskId: uxTask.id, status: uxTask.status, versionStatus: uxTask.versionStatus } : null,
        dev: devTask ? { taskId: devTask.id, status: devTask.status, versionStatus: devTask.versionStatus } : null,
        qa: qaTask ? { taskId: qaTask.id, status: qaTask.status, versionStatus: qaTask.versionStatus } : null,
      },
      artifacts: await Promise.all(allArtifacts.map((a) => formatArtifactForClient(a))),
      hitlDecisions,
      generatedAt: new Date().toISOString(),
    };
  }

  // =========================================================================
  // Audit Trail
  // =========================================================================

  async getAuditTrail(projectId, user) {
    if (user) {
      await MembershipService.requireProjectRole(user.id, projectId, ['owner', 'admin', 'editor', 'viewer']);
    }

    const [tasks, hitlDecisions] = await Promise.all([
      Task.findByProjectId(projectId),
      HitlDecision.findByProjectId(projectId),
    ]);

    const sdlcTasks = tasks.filter((t) => ['intent-agent', 'po-agent', 'ux-agent', 'dev-agent', 'qa-agent'].includes(t.type));

    const events = [
      ...sdlcTasks.map((t) => ({
        timestamp: t.createdAt,
        actor: t.type.toUpperCase().replace('-', '_'),
        action: `START_${t.type.replace('-agent', '').toUpperCase()}_AGENT`,
        taskId: t.id,
        status: t.status,
        type: 'agent_run',
      })),
      ...sdlcTasks
        .filter((t) => t.status === 'completed')
        .map((t) => ({
          timestamp: t.updatedAt,
          actor: t.type.toUpperCase().replace('-', '_'),
          action: `COMPLETE_${t.type.replace('-agent', '').toUpperCase()}_AGENT`,
          taskId: t.id,
          status: 'completed',
          type: 'agent_complete',
        })),
      ...hitlDecisions.map((d) => ({
        timestamp: d.createdAt,
        actor: 'HUMAN',
        action: `${d.decision}_${d.gate}`,
        taskId: d.taskId,
        gate: d.gate,
        decision: d.decision,
        comment: d.comment,
        type: 'hitl_decision',
      })),
    ].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    return { projectId, events };
  }

  // =========================================================================
  // Task status (SSE-compatible, reuses base WorkflowService pattern)
  // =========================================================================

  async getTaskStatus(taskId, user) {
    const task = await Task.findById(taskId);
    if (!task) return null;
    if (user) {
      await MembershipService.requireProjectRole(user.id, task.projectId, ['owner', 'admin', 'editor', 'viewer']);
    }

    const [artifacts, hitlDecision] = await Promise.all([
      AgentArtifact.findByTaskId(taskId),
      HitlDecision.findByTaskId(taskId),
    ]);

    task.artifacts = await Promise.all(artifacts.map((a) => formatArtifactForClient(a)));
    task.result = buildTaskResult(task, task.artifacts);
    task.hitlDecision = hitlDecision;
    task.gate = AGENT_GATES[task.type] || null;
    task.nextAgent = NEXT_AGENT[task.type];

    // Attach Quality Gate evaluation for QA tasks
    if (task.type === 'qa-agent') {
      const gateArtifact = artifacts.find((a) => a.artifactType === 'gate_evaluation');
      if (gateArtifact) {
        const resolved = await resolveArtifactContent(gateArtifact);
        task.gateEvaluation = resolved.contentJson || null;
      }
      // Surface gate metadata from result
      if (task.result) {
        task.gateScore = task.result.gateScore;
        task.gateRecommendation = task.result.gateRecommendation;
        task.gateComplexity = task.result.gateComplexity;
        task.minApproversRequired = task.result.minApproversRequired;
      }
    }

    return task;
  }

  async getWorkflowStatus(projectId, user) {
    if (user) {
      await MembershipService.requireProjectRole(user.id, projectId, ['owner', 'admin', 'editor', 'viewer']);
    }

    const [intentTask, poTask, uxTask, devTask, qaTask] = await Promise.all([
      Task.findLatestByProject(projectId, 'intent-agent', null),
      Task.findLatestByProject(projectId, 'po-agent', null),
      Task.findLatestByProject(projectId, 'ux-agent', null),
      Task.findLatestByProject(projectId, 'dev-agent', null),
      Task.findLatestByProject(projectId, 'qa-agent', null),
    ]);

    const hitlDecisions = await HitlDecision.findByProjectId(projectId);
    const decisionsByTaskId = {};
    for (const d of hitlDecisions) decisionsByTaskId[d.taskId] = d;

    const mapPhase = (task) => {
      if (!task) return null;
      return {
        taskId: task.id,
        status: task.status,
        versionStatus: task.versionStatus,
        gate: AGENT_GATES[task.type],
        hitlDecision: decisionsByTaskId[task.id] || null,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
      };
    };

    return {
      projectId,
      phases: {
        intent: mapPhase(intentTask),
        po: mapPhase(poTask),
        ux: mapPhase(uxTask),
        dev: mapPhase(devTask),
        qa: mapPhase(qaTask),
      },
      currentPhase: this._deriveCurrentPhase(intentTask, poTask, uxTask, devTask, qaTask, decisionsByTaskId),
    };
  }

  // =========================================================================
  // Internals
  // =========================================================================

  _deriveCurrentPhase(intentTask, poTask, uxTask, devTask, qaTask, decisionsByTaskId) {
    if (!intentTask || intentTask.status === 'pending' || intentTask.status === 'processing') return 'INTAKE_REVIEW';
    if (intentTask.status === 'failed') return 'INTENT_FAILED';
    if (!decisionsByTaskId[intentTask?.id] || decisionsByTaskId[intentTask?.id]?.decision !== 'APPROVE') return 'INTAKE_REVIEW';
    if (!poTask || poTask.status === 'pending' || poTask.status === 'processing') return 'PO_RUNNING';
    if (poTask.status === 'failed') return 'PO_FAILED';
    if (!decisionsByTaskId[poTask?.id] || decisionsByTaskId[poTask?.id]?.decision !== 'APPROVE') return 'PO_REVIEW';
    if (!uxTask || uxTask.status === 'pending' || uxTask.status === 'processing') return 'UX_RUNNING';
    if (uxTask.status === 'failed') return 'UX_FAILED';
    if (!decisionsByTaskId[uxTask?.id] || decisionsByTaskId[uxTask?.id]?.decision !== 'APPROVE') return 'UX_REVIEW';
    if (!devTask || devTask.status === 'pending' || devTask.status === 'processing') return 'DEV_RUNNING';
    if (devTask.status === 'failed') return 'DEV_FAILED';
    if (!decisionsByTaskId[devTask?.id] || decisionsByTaskId[devTask?.id]?.decision !== 'APPROVE') return 'DEV_REVIEW';
    if (!qaTask || qaTask.status === 'pending' || qaTask.status === 'processing') return 'QA_RUNNING';
    if (qaTask.status === 'failed') return 'QA_FAILED';
    if (!decisionsByTaskId[qaTask?.id]) return 'QA_REVIEW';
    return 'FINAL_REVIEW';
  }

  async _requireApprovedTask(taskId, expectedType, user) {
    const task = await Task.findById(taskId);
    if (!task) throw new ApiError(404, 'Source task not found');
    if (user) await MembershipService.requireProjectRole(user.id, task.projectId, ['owner', 'admin', 'editor']);
    if (task.type !== expectedType) throw new ApiError(400, `Source task must be type: ${expectedType}`);
    if (task.status !== 'completed') throw new ApiError(400, 'Source task must be completed');
    if (task.versionStatus !== 'committed') {
      throw new ApiError(400, 'Source task must be approved (committed) before running next agent');
    }
    return task;
  }

  async _buildContextFromArtifacts(artifacts, extras = {}) {
    const context = { ...extras };
    for (const art of artifacts) {
      if (!context[art.artifactType]) context[art.artifactType] = [];
      const resolved = await resolveArtifactContent(art);
      const content = resolved.contentText ?? resolved.contentJson ?? '';
      context[art.artifactType].push({
        key: art.artifactKey,
        title: art.title,
        content,
      });
    }
    return context;
  }

  async _getFeatureRequestFromIntentTask(task) {
    const featureArtifacts = await AgentArtifact.findByTaskIdAndType(task.id, 'feature_request');
    if (featureArtifacts.length > 0) {
      const resolved = await resolveArtifactContent(featureArtifacts[0]);
      const featureRequest = resolved.contentJson || resolved.contentText;
      if (featureRequest && typeof featureRequest === 'object' && featureRequest.title) {
        return featureRequest;
      }
      if (typeof featureRequest === 'string' && featureRequest.trim()) {
        return { title: 'Rework feature request', description: featureRequest };
      }
    }

    const assumptions = await AgentArtifact.findByTaskIdAndType(task.id, 'intent_assumptions');
    if (assumptions.length > 0) {
      const resolved = await resolveArtifactContent(assumptions[0]);
      if (resolved.contentText && resolved.contentText.trim()) {
        return {
          title: 'Rework feature request',
          description: resolved.contentText,
        };
      }
    }

    throw new ApiError(400, 'Cannot rework intent task: original feature request artifact is missing');
  }

  async _writeArtifactToFile(projectId, taskId, filename, content) {
    const dir = path.join(WORKSPACE_DIR, projectId, taskId);
    await fs.mkdir(dir, { recursive: true });
    const filepath = path.join(dir, filename);
    const data = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
    await fs.writeFile(filepath, data, 'utf8');
    return `FILE:${filepath}`;
  }

  /**
   * Core runner — calls AgentService and parses SSE stream, saves artifacts.
   * @private
   */
  async _runAgent(task, context, userId = null) {
    await Task.update(task.id, { status: 'processing' });

    // Hybrid Mock Mode Bypass
    if (process.env.USE_MOCK_AGENTS === 'true') {
      try {
        console.log(`[SDLC] Running in MOCK mode for agent ${task.type}`);
        const mockDir = path.join(__dirname, '../../../mock-data', task.type);
        const files = await fs.readdir(mockDir).catch(() => []);
        
        const completedData = {
          summary: "Mock execution completed via Hybrid Mock Mode.",
          token_usage: { input: 1250, output: 450 },
          observability: { trace_id: "mock-trace-123" }
        };

        for (const file of files) {
          if (!file.endsWith('.md') && !file.endsWith('.json')) continue;
          const key = file.replace(/\.(md|json)$/, '');
          const ext = path.extname(file);
          const content = await fs.readFile(path.join(mockDir, file), 'utf8');
          completedData[key] = ext === '.json' ? JSON.parse(content) : content;
        }
        if (task.type === 'intent-agent' && context.featureRequest) {
          completedData.feature_request = context.featureRequest;
        }

        // Simulate processing delay
        await new Promise(r => setTimeout(r, 2000));
        
        await this._saveAgentData(task, completedData, userId);
        return; // Bypass the real agent completely
      } catch (err) {
        console.error(`[SDLC._runAgent] Mock mode failed for task ${task.id}:`, err);
        // Fallback to real agent if mock fails
      }
    }

    try {
      const response = await AgentService.runAgent({
        sessionId: task.id,
        nodeTarget: NODE_TARGET[task.type],
        userId,
        projectId: task.projectId,
        context,
      });

      let buffer = '';
      let completedData = null;
      let agentError = null;

      response.data.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        let currentEvent = null;

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith('data: ') && currentEvent) {
            try {
              const data = JSON.parse(line.slice(6));
              if (currentEvent === 'error') {
                agentError = data.message || 'Agent error';
              } else if (currentEvent === 'completed') {
                completedData = data;
              }
            } catch (_) {}
          }
        }
      });

      response.data.on('end', async () => {
        try {
          if (agentError) throw new Error(agentError);
          if (!completedData) throw new Error('Agent returned no data');
          if (task.type === 'intent-agent' && context.featureRequest) {
            completedData.feature_request = context.featureRequest;
          }

          await this._saveAgentData(task, completedData, userId);
        } catch (err) {
          console.error(`[SDLC._runAgent] Failed for task ${task.id}:`, err);
          await Task.update(task.id, { status: 'failed', error: err.message });
        }
      });

      response.data.on('error', async (err) => {
        await Task.update(task.id, { status: 'failed', error: `Stream error: ${err.message}` });
      });
    } catch (err) {
      await Task.update(task.id, { status: 'failed', error: err.message });
    }
  }

  async _saveAgentData(task, completedData, userId) {
    // Save each artifact returned by the agent
    const artifactRows = [];
    const artifactTypes = ['feature_request', 'intent_assumptions', 'clarifying_questions',
      'prd', 'user_stories', 'acceptance_criteria', 'scope', 'out_of_scope',
      'ux_spec', 'user_flow', 'wireframe_spec', 'component_inventory', 'screens',
      'architecture_ledger_update', 'implementation_plan', 'mock_code_diff', 'changed_files',
      'risk_assessment', 'risk_level', 'sandbox_report', 'patch_branch', 'patch_commit',
      'test_cases', 'qa_report', 'ac_coverage_matrix', 'pass_count', 'fail_count',
      'blocker_count', 'release_recommendation',
      // Quality Gate result (populated below for qa-agent tasks)
      'gate_evaluation'];

    // -------------------------------------------------------------------------
    // Quality Gate evaluation — runs after QA Agent completes
    // -------------------------------------------------------------------------
    if (task.type === 'qa-agent' && !completedData.gate_evaluation) {
      try {
        // Fetch DEV artifacts for code diff context
        const devTask = await Task.findLatestByProject(task.projectId, 'dev-agent', 'completed', 'committed').catch(() => null);
        let mockCodeDiff = '';
        let implementationPlan = '';

        if (devTask) {
          const devArtifacts = await AgentArtifact.findByTaskId(devTask.id);
          for (const art of devArtifacts) {
            if (art.artifactType === 'mock_code_diff') {
              const resolved = await resolveArtifactContent(art);
              mockCodeDiff = resolved.contentText || '';
            }
            if (art.artifactType === 'implementation_plan') {
              const resolved = await resolveArtifactContent(art);
              implementationPlan = resolved.contentText || '';
            }
          }
        }

        // Fetch PO artifacts for feature title & AC
        const poTask = await Task.findLatestByProject(task.projectId, 'po-agent', 'completed', 'committed').catch(() => null);
        let featureTitle = '';
        let featureDescription = '';
        let acceptanceCriteria = completedData.acceptance_criteria || [];

        if (poTask) {
          const poArtifacts = await AgentArtifact.findByTaskId(poTask.id);
          for (const art of poArtifacts) {
            if (art.artifactType === 'prd') {
              const resolved = await resolveArtifactContent(art);
              featureDescription = (resolved.contentText || '').slice(0, 500);
            }
            if (art.artifactType === 'acceptance_criteria') {
              const resolved = await resolveArtifactContent(art);
              if (Array.isArray(resolved.contentJson)) {
                acceptanceCriteria = resolved.contentJson;
              }
            }
          }
        }

        const gateResult = await QualityGateService.evaluate({
          featureTitle,
          featureDescription,
          acceptanceCriteria: Array.isArray(acceptanceCriteria) ? acceptanceCriteria : [],
          testCases: completedData.test_cases || [],
          acCoverageMatrix: completedData.ac_coverage_matrix || [],
          blockerCount: completedData.blocker_count || 0,
          riskLevel: completedData.risk_level || 'LOW',
          mockCodeDiff,
          implementationPlan,
        });

        completedData.gate_evaluation = gateResult;

        console.log(
          `[QualityGate] Task ${task.id}: ${gateResult.complexity.toUpperCase()} | ` +
          `Score: ${gateResult.score}/100 | Recommendation: ${gateResult.recommendation} | ` +
          `Approvers required: ${gateResult.minApproversRequired}`
        );
      } catch (gateErr) {
        console.error(`[QualityGate] Evaluation failed for task ${task.id}:`, gateErr.message);
        // Non-fatal — continue saving without gate result
      }
    }

    for (const artType of artifactTypes) {
      if (completedData[artType] !== undefined && completedData[artType] !== null) {
        const content = completedData[artType];
        let fileRef = null;

        if (typeof content === 'string') {
          fileRef = await this._writeArtifactToFile(task.projectId, task.id, `${artType}.md`, content);
        } else {
          fileRef = await this._writeArtifactToFile(task.projectId, task.id, `${artType}.json`, content);
        }

        artifactRows.push({
          id: uuidv4(),
          taskId: task.id,
          projectId: task.projectId,
          agentType: task.type,
          artifactType: artType,
          artifactKey: `${artType}:${task.id}`,
          title: artType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
          contentText: typeof content === 'string' ? fileRef : null,
          contentJson: typeof content === 'object' ? { file_path: fileRef.slice(5) } : null,
          ordinal: artifactTypes.indexOf(artType),
          contentHash: contentHash(content),
        });
      }
    }

    if (artifactRows.length > 0) {
      await AgentArtifact.bulkUpsert(artifactRows);
    }

    // Build enriched result — include gate info for QA tasks
    const taskResult = {
      artifactCount: artifactRows.length,
      agentType: task.type,
      ...(completedData.summary ? { summary: completedData.summary } : {}),
    };
    if (task.type === 'qa-agent' && completedData.gate_evaluation) {
      taskResult.gateScore = completedData.gate_evaluation.score;
      taskResult.gateRecommendation = completedData.gate_evaluation.recommendation;
      taskResult.gateComplexity = completedData.gate_evaluation.complexity;
      taskResult.minApproversRequired = completedData.gate_evaluation.minApproversRequired;
    }

    const outputHash = contentHash(artifactRows.map((a) => a.contentHash));
    await Task.update(task.id, {
      status: 'completed',
      output_content_hash: outputHash,
      result: taskResult,
      observability: completedData.observability || {},
    });

    if (userId) {
      QuotaService.recordUsage({
        userId,
        projectId: task.projectId,
        taskId: task.id,
        agentType: task.type,
        tokenInput: completedData.token_usage?.input || 0,
        tokenOutput: completedData.token_usage?.output || 0,
      }).catch(() => {});
    }
  }
}

module.exports = new SdlcWorkflowService();
