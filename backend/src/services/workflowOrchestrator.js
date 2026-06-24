// ── Workflow Orchestrator ─────────────────────────────────────────────────────
// Creates agent tasks, builds context from upstream artifacts, and starts agent
// execution. Each function accepts a `deps` object for callbacks to the owning
// service (SdlcWorkflowService) so that stateful methods stay in the class.

const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { Task, AgentArtifact, PipelineSession } = require('../models');
const FeatureBacklog = require('../models/FeatureBacklog');
const gateBridge = require('./gateBridge');
const repoService = require('./repoService');
const { ApiError } = require('../middleware/errorHandler');
const { NEXT_AGENT, AGENT_GATES, MAX_RETRY_PER_STEP } = require('./sdlcConstants');
const logger = require('../config/logger');

const MAX_PARALLEL_WORKFLOWS = () => Math.max(1, Number(process.env.MAX_PARALLEL_WORKFLOWS) || 4);

// =============================================================================
// runIntentAgent
// =============================================================================

async function runIntentAgent(params, deps) {
  const { projectId, featureRequest, feedbackPrompt = '', backlogId = null, user } = params;
  if (user) {
    await deps.MembershipService.requireProjectRole(user.id, projectId, ['owner', 'admin', 'editor']);
  }

  const inputHash = deps.contentHash({ featureRequest, feedbackPrompt });
  const task = await Task.create({
    id: uuidv4(),
    projectId,
    type: 'intent-agent',
    status: 'pending',
    inputContentHash: inputHash,
    versionStatus: 'draft',
  });

  if (backlogId) {
    try {
      await FeatureBacklog.linkTask(backlogId, task.id, projectId);
    } catch (error) {
      await Task.deleteById(task.id);
      throw new ApiError(409, error.message);
    }
  }

  deps.runAgent(task, {
    featureRequest,
    feedbackPrompt,
  }, user?.id).catch((err) => console.error('[SDLC] Intent Agent failed:', err));

  return task;
}

// =============================================================================
// runPOAgent
// =============================================================================

async function runPOAgent(params, deps) {
  const {
    projectId, sourceTaskId = null, featureRequest = null, feedbackPrompt = '',
    previousDraft = null, backlogId = null,
    repoUrl = null, repoPath = null, branch = 'main', request = '',
    sessionId = null, user,
  } = params;
  const sourceTask = sourceTaskId
    ? await deps.requireApprovedTask(sourceTaskId, 'intent-agent', user)
    : null;
  const effectiveProjectId = projectId || sourceTask?.projectId;
  if (!effectiveProjectId) throw new ApiError(400, 'projectId is required');
  if (user) {
    await deps.MembershipService.requireProjectRole(user.id, effectiveProjectId, ['owner', 'admin', 'editor']);
  }

  // Session management
  let session = sessionId ? await PipelineSession.findById(sessionId) : null;
  let repoContext = null;
  if (!session) {
    const active = await PipelineSession.countActive();
    if (active >= MAX_PARALLEL_WORKFLOWS()) {
      throw new ApiError(429, `Too many active workflows (${active}/${MAX_PARALLEL_WORKFLOWS()}). Try again when one finishes.`, 'TOO_MANY_WORKFLOWS', 'PO_RUNNING');
    }
    session = await PipelineSession.create({
      id: uuidv4(),
      projectId: effectiveProjectId,
      title: (request || featureRequest?.title || '').slice(0, 200) || null,
    });

    if (repoUrl && !repoService.isHttpUrl(repoUrl)) {
      repoPath = repoUrl;
      repoUrl = null;
    }

    if (repoUrl) {
      const cloned = await repoService.cloneRepo({ repoUrl, branch, projectId: effectiveProjectId, sessionId: session.id, request });
      const safety = await repoService.assertRepoSafe(cloned.repoPath);
      repoContext = { ...cloned, repoUrl, request, safety };
    } else if (repoPath) {
      const canonicalPath = repoService.repoPathFor(effectiveProjectId);
      const isUploadedProject = path.resolve(repoPath) === path.resolve(canonicalPath);
      const opened = isUploadedProject
        ? await repoService.prepareSessionRepo({ projectId: effectiveProjectId, sessionId: session.id, request })
        : await repoService.useLocalRepo({ repoPath, branch, projectId: effectiveProjectId, request });
      const safety = await repoService.assertRepoSafe(opened.repoPath);
      repoContext = { ...opened, repoUrl: null, request, safety };
    }

    if (repoContext) {
      await PipelineSession.update(session.id, {
        repoPath: repoContext.repoPath,
        workingBranch: repoContext.workingBranch,
        baseBranch: repoContext.baseBranch,
      });
    }
  }

  const sourceArtifacts = sourceTask ? await AgentArtifact.findByTaskId(sourceTask.id) : [];
  const inputHash = deps.contentHash({
    featureRequest,
    artifacts: sourceArtifacts.map((a) => a.contentHash),
    feedbackPrompt,
  });

  const task = await Task.create({
    id: uuidv4(),
    projectId: effectiveProjectId,
    sessionId: session.id,
    type: 'po-agent',
    status: 'pending',
    inputContentHash: inputHash,
    sourceRunId: sourceTask?.id || null,
    versionStatus: 'draft',
  });

  const poObservability = {};
  if (repoContext) poObservability.repo = repoContext;
  if (featureRequest) poObservability.featureRequest = featureRequest;
  if (Object.keys(poObservability).length) {
    await Task.update(task.id, { observability: poObservability });
  }

  if (backlogId) {
    try {
      await FeatureBacklog.linkTask(backlogId, task.id, effectiveProjectId);
    } catch (error) {
      await Task.deleteById(task.id);
      throw new ApiError(409, error.message);
    }
  }

  const context = await deps.buildContextFromArtifacts(sourceArtifacts, {
    feedbackPrompt,
    ...(previousDraft ? { previousDraft } : {}),
    ...(featureRequest ? { featureRequest } : {}),
    ...(repoContext ? { repoContext } : {}),
  });

  deps.runAgent(task, context, user?.id).catch((err) => console.error('[SDLC] PO Agent failed:', err));

  return task;
}

// =============================================================================
// runUXAgent
// =============================================================================

async function runUXAgent(params, deps) {
  const { projectId, sourceTaskId, feedbackPrompt = '', previousDraft = null, user } = params;
  const sourceTask = await deps.requireApprovedTask(sourceTaskId, 'po-agent', user);

  const sourceArtifacts = await AgentArtifact.findByTaskId(sourceTask.id);
  const inputHash = deps.contentHash({
    artifacts: sourceArtifacts.map((a) => a.contentHash),
    feedbackPrompt,
  });

  const task = await Task.create({
    id: uuidv4(),
    projectId: sourceTask.projectId,
    sessionId: sourceTask.sessionId,
    type: 'ux-agent',
    status: 'pending',
    inputContentHash: inputHash,
    sourceRunId: sourceTask.id,
    versionStatus: 'draft',
  });

  const context = await deps.buildContextFromArtifacts(sourceArtifacts, { feedbackPrompt, ...(previousDraft ? { previousDraft } : {}) });
  deps.runAgent(task, context, user?.id).catch((err) => console.error('[SDLC] UX Agent failed:', err));

  return task;
}

// =============================================================================
// runDEVAgent
// =============================================================================

async function runDEVAgent(params, deps) {
  const { projectId, sourceTaskId, feedbackPrompt = '', previousDraft = null, user } = params;
  const sourceTask = await deps.requireApprovedTask(sourceTaskId, ['ux-agent', 'po-agent'], user);
  const effectiveProjectId = projectId || sourceTask.projectId;
  const fromPoDirectly = sourceTask.type === 'po-agent';

  const poTask = fromPoDirectly
    ? sourceTask
    : await Task.findLatestBySession(sourceTask.sessionId, 'po-agent', 'completed', 'committed');
  const [uxArtifacts, poArtifacts] = await Promise.all([
    fromPoDirectly ? Promise.resolve([]) : AgentArtifact.findByTaskId(sourceTask.id),
    poTask ? AgentArtifact.findByTaskId(poTask.id) : Promise.resolve([]),
  ]);

  const inputHash = deps.contentHash({
    artifacts: [...uxArtifacts, ...poArtifacts].map((a) => a.contentHash),
    feedbackPrompt,
  });

  const task = await Task.create({
    id: uuidv4(),
    projectId: sourceTask.projectId,
    sessionId: sourceTask.sessionId,
    type: 'dev-agent',
    status: 'pending',
    inputContentHash: inputHash,
    sourceRunId: sourceTask.id,
    versionStatus: 'draft',
  });

  const context = await deps.buildContextFromArtifacts([...poArtifacts, ...uxArtifacts], { feedbackPrompt, ...(previousDraft ? { previousDraft } : {}) });
  deps.runAgent(task, context, user?.id).catch((err) => console.error('[SDLC] DEV Agent failed:', err));

  return task;
}

// =============================================================================
// runQAAgent
// =============================================================================

async function runQAAgent(params, deps) {
  const { projectId, sourceTaskId, feedbackPrompt = '', previousDraft = null, user } = params;
  const sourceTask = await deps.requireApprovedTask(sourceTaskId, 'dev-agent', user);
  const sessionTasks = await Task.findBySessionId(sourceTask.sessionId);

  if (gateBridge.listPending({ taskId: sourceTask.id }).length > 0) {
    throw new ApiError(409, 'DEV still has a pending gate; QA cannot start yet');
  }

  const existingQa = sessionTasks.find(
    (task) => task.type === 'qa-agent'
      && task.sourceRunId === sourceTask.id
      && ['pending', 'running'].includes(task.status)
  );
  if (existingQa) return existingQa;

  const [poTask, uxTask] = await Promise.all([
    Task.findLatestBySession(sourceTask.sessionId, 'po-agent', 'completed', 'committed'),
    Task.findLatestBySession(sourceTask.sessionId, 'ux-agent', 'completed', 'committed'),
  ]);

  const allArtifacts = (
    await Promise.all([
      poTask ? AgentArtifact.findByTaskId(poTask.id) : Promise.resolve([]),
      uxTask ? AgentArtifact.findByTaskId(uxTask.id) : Promise.resolve([]),
      AgentArtifact.findByTaskId(sourceTask.id),
    ])
  ).flat();

  const inputHash = deps.contentHash({
    artifacts: allArtifacts.map((a) => a.contentHash),
    feedbackPrompt,
  });

  const task = await Task.create({
    id: uuidv4(),
    projectId: sourceTask.projectId,
    sessionId: sourceTask.sessionId,
    type: 'qa-agent',
    status: 'pending',
    inputContentHash: inputHash,
    sourceRunId: sourceTask.id,
    versionStatus: 'draft',
  });

  const context = await deps.buildContextFromArtifacts(allArtifacts, { feedbackPrompt, ...(previousDraft ? { previousDraft } : {}) });
  deps.runAgent(task, context, user?.id).catch((err) => console.error('[SDLC] QA Agent failed:', err));

  return task;
}

// =============================================================================
// startNextAgentIfAvailable — called after a task is approved/committed
// =============================================================================

async function startNextAgentIfAvailable(task, userId, deps) {
  const nextAgent = deps.nextAgentFor(task);
  if (!nextAgent) return null;
  if (task.status !== 'completed' || task.versionStatus !== 'committed') return null;

  const tasks = task.sessionId ? await Task.findBySessionId(task.sessionId) : await Task.findByProjectId(task.projectId);
  const scopeTaskIds = new Set(tasks.map((t) => t.id));
  if (deps.getPendingQuestionGate(task.projectId, scopeTaskIds)) return null;
  if (gateBridge.listPending({ taskId: task.id }).length > 0) return null;

  const existing = tasks.find((candidate) => candidate.type === nextAgent && candidate.sourceRunId === task.id);
  if (existing) return existing;

  const args = {
    projectId: task.projectId,
    sourceTaskId: task.id,
    user: userId ? { id: userId } : null,
  };

  if (nextAgent === 'po-agent') return runPOAgent(args, deps);
  if (nextAgent === 'ux-agent') return runUXAgent(args, deps);
  if (nextAgent === 'dev-agent') return runDEVAgent(args, deps);
  if (nextAgent === 'qa-agent') return runQAAgent(args, deps);
  return null;
}

module.exports = {
  runIntentAgent,
  runPOAgent,
  runUXAgent,
  runDEVAgent,
  runQAAgent,
  startNextAgentIfAvailable,
};
