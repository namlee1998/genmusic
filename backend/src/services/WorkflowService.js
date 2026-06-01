const { v4: uuidv4 } = require("uuid");
const crypto = require("crypto");
const { Task, Document, AgentArtifact } = require("../models");
const AgentService = require("./AgentService");
const DocumentService = require("./DocumentService");
const MembershipService = require("./MembershipService");
const QuotaService = require("./QuotaService");
const { ApiError } = require("../middleware/errorHandler");

/** Compute a stable SHA256 hex digest of any JSON-serializable value. */
function contentHash(value) {
  const json = typeof value === "string" ? value : JSON.stringify(value);
  return crypto.createHash("sha256").update(json, "utf8").digest("hex");
}

function stripYamlExtension(filename = "") {
  return String(filename || "").replace(/\.yaml$/i, "");
}

function flowArtifactKey(flow, index) {
  const title = flow.flowName || flow.name || "Unknown";
  return `flow:${index}:${title}`;
}

function scenarioArtifactKey(scenario) {
  const flowName = scenario?.flow_name || "unknown";
  const id = scenario?.id ?? "unknown";
  return `scenario:${flowName}:${id}`;
}

function yamlArtifactKey(file, index) {
  return `yaml:${index}:${stripYamlExtension(file?.filename || "unknown")}`;
}

function observabilityFromFailure(source, error) {
  const base = source || {};
  return {
    provider: base.provider || "langfuse",
    session_id: base.session_id || null,
    trace_url: base.trace_url || null,
    failed_at: base.failed_at || new Date().toISOString(),
    error: error?.message || String(error || "Unknown error"),
    ...(base.model ? { model: base.model } : {}),
    ...(base.started_at ? { started_at: base.started_at } : {}),
    ...(base.latency_ms ? { latency_ms: base.latency_ms } : {}),
  };
}

function artifactsToTestcases(artifacts = []) {
  return artifacts
    .filter((artifact) =>
      artifact.artifactType === "scenario" || artifact.artifactType === "yaml"
    )
    .map((artifact) => {
      if (artifact.artifactType === "scenario") {
        const scenario = artifact.contentJson || {};
        return {
          id: artifact.id,
          taskId: artifact.taskId,
          projectId: artifact.projectId,
          featureName: scenario.feature_name || "Unknown",
          flowName: scenario.flow_name || scenario.name || artifact.title ||
            "Unknown",
          scenarioData: scenario,
          automationYaml: null,
          yamlFilename: null,
          createdAt: artifact.createdAt,
          updatedAt: artifact.updatedAt,
        };
      }

      const meta = artifact.contentJson || {};
      return {
        id: artifact.id,
        taskId: artifact.taskId,
        projectId: artifact.projectId,
        featureName: artifact.artifactKey,
        flowName: "automation",
        scenarioData: null,
        automationYaml: artifact.contentText,
        yamlFilename: meta.filename || artifact.title ||
          `${artifact.artifactKey}.yaml`,
        createdAt: artifact.createdAt,
        updatedAt: artifact.updatedAt,
      };
    });
}

function flowArtifactsToFlows(artifacts = []) {
  return artifacts
    .filter((artifact) => artifact.artifactType === "flow")
    .map((artifact) => artifact.contentJson)
    .filter(Boolean);
}

function buildTaskResultForClient(task, artifacts = []) {
  const summary = task.result || {};

  if (task.type === "extract-flows") {
    const rawMarkdownArtifact = artifacts.find((artifact) =>
      artifact.artifactType === "raw_markdown"
    );
    return {
      ...summary,
      flows: flowArtifactsToFlows(artifacts),
      rawMarkdown: rawMarkdownArtifact?.contentText || "",
    };
  }

  if (task.type === "generate-testcases") {
    const scenarios = artifacts
      .filter((artifact) => artifact.artifactType === "scenario")
      .map((artifact) => artifact.contentJson)
      .filter(Boolean);
    return {
      ...summary,
      scenarios,
    };
  }

  if (task.type === "generate-automation") {
    const yamlFiles = artifacts
      .filter((artifact) => artifact.artifactType === "yaml")
      .map((artifact) => ({
        filename: artifact.contentJson?.filename || artifact.title ||
          `${artifact.artifactKey}.yaml`,
        content: artifact.contentText || "",
      }));
    return {
      ...summary,
      yaml_files: yamlFiles,
    };
  }

  return summary;
}
// parseAgent1Output is deprecated - kept for backward compatibility only
// const { parseAgent1Output } = require('../utils/agentParser');

/**
 * Normalize scenario payload for Agent 3 schema compatibility.
 * Some historical rows store numeric IDs, while agent schema expects strings.
 */
const normalizeScenarioForAgent3 = (scenario) => {
  if (!scenario || typeof scenario !== "object") return scenario;

  const normalized = { ...scenario };

  if (normalized.id !== undefined && normalized.id !== null) {
    normalized.id = String(normalized.id);
  }

  if (Array.isArray(normalized.steps)) {
    normalized.steps = normalized.steps.map((step) => {
      if (!step || typeof step !== "object") return step;
      if (step.id === undefined || step.id === null) return { ...step };
      return { ...step, id: String(step.id) };
    });
  }

  return normalized;
};

class WorkflowService {
  /**
   * Create and start a flow extraction task (Agent 1)
   * @param {Object} data
   * @param {string[]} data.documentIds - Array of document IDs to process
   * @param {string} data.promptProfile - Prompt profile to use
   * @returns {Promise<Object>} Task record
   */
  async extractFlows(
    { projectId, documentIds, promptProfile, feedbackPrompt = "", user },
  ) {
    if (user) {
      await MembershipService.requireProjectRole(user.id, projectId, [
        "owner",
        "admin",
        "editor",
      ]);
      for (const documentId of documentIds || []) {
        const document = await Document.findById(documentId);
        if (!document) {
          throw new ApiError(404, `Document not found: ${documentId}`);
        }
        if (document.projectId !== projectId) {
          throw new ApiError(400, "document_ids must belong to project_id");
        }
      }
    }

    // Hash the input so downstream agents can detect staleness
    const inputHash = contentHash({
      documentIds: [...documentIds].sort(),
      promptProfile: promptProfile || "",
    });

    const task = await Task.create({
      id: uuidv4(),
      projectId,
      type: "extract-flows",
      status: "pending",
      promptProfile,
      inputContentHash: inputHash,
      versionStatus: "draft",
    });

    // Trigger agent asynchronously (don't await)
    this._runAgent1Extraction(task, documentIds, feedbackPrompt, user?.id)
      .catch((error) => {
        console.error("[WorkflowService] Agent 1 extraction failed:", error);
      });

    return task;
  }

  /**
   * Resolve unknowns from a previous extraction task
   * @param {Object} data
   * @param {string} data.taskId - Original task ID
   * @param {Array} data.resolutions - Array of {unknown_text, user_feedback}
   * @returns {Promise<Object>} Updated task
   */
  async resolveUnknowns({ taskId, resolutions, user }) {
    const task = await Task.findById(taskId);
    if (!task) {
      throw new Error("Task not found");
    }
    if (user) {
      await MembershipService.requireProjectRole(user.id, task.projectId, [
        "owner",
        "admin",
        "editor",
      ]);
    }

    await Task.update(taskId, { status: "processing" });

    try {
      const response = await AgentService.resolveUnknowns({
        sessionId: taskId,
        resolutions,
      });

      return Task.update(taskId, {
        status: "completed",
        result: response,
      });
    } catch (error) {
      await Task.update(taskId, {
        status: "failed",
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Generate test scenarios from extraction results (Agent 2)
   * @param {Object} data
   * @param {string} data.taskId - Original extraction task ID
   * @returns {Promise<Object>} New task for scenario generation
   */
  async generateTestcases(
    {
      taskId,
      feedbackPrompt = "",
      selectedFlowNames = [],
      previousTaskId = "",
      user,
    },
  ) {
    const sourceTask = await Task.findById(taskId);
    if (!sourceTask) {
      throw new Error("Source task not found");
    }
    if (user) {
      await MembershipService.requireProjectRole(
        user.id,
        sourceTask.projectId,
        ["owner", "admin", "editor"],
      );
    }

    if (sourceTask.type !== "extract-flows") {
      throw new Error("Source task must be an extract-flows task");
    }

    // Input hash = hash of Agent 1's output (for staleness detection on Agent 3 side)
    const inputHash = sourceTask.outputContentHash ||
      contentHash(sourceTask.result?.flows || []);

    const task = await Task.create({
      id: uuidv4(),
      projectId: sourceTask.projectId,
      type: "generate-testcases",
      status: "pending",
      inputContentHash: inputHash,
      sourceRunId: sourceTask.id,
      versionStatus: "draft",
    });

    // Trigger agent asynchronously
    this._runAgent2Generation(
      task,
      sourceTask,
      feedbackPrompt,
      selectedFlowNames,
      previousTaskId,
      user?.id,
    ).catch((error) => {
      console.error("[WorkflowService] Agent 2 generation failed:", error);
    });

    return task;
  }

  /**
   * Generate automation code from testcases (Agent 3)
   * @param {Object} data
   * @param {string} data.taskId - Testcase generation task ID
   * @returns {Promise<Object>} New task for automation generation
   */
  async generateAutomation(
    {
      taskId,
      framework = "AIDLC Control Platform",
      feedbackPrompt = "",
      selectedScenarioIds = [],
      previousTaskId = "",
      user,
    },
  ) {
    const sourceTask = await Task.findById(taskId);
    if (!sourceTask) {
      throw new Error("Source task not found");
    }
    if (user) {
      await MembershipService.requireProjectRole(
        user.id,
        sourceTask.projectId,
        ["owner", "admin", "editor"],
      );
    }

    if (sourceTask.type !== "generate-testcases") {
      throw new Error("Source task must be a generate-testcases task");
    }

    // Input hash = hash of Agent 2's output (for staleness detection)
    const inputHash = sourceTask.outputContentHash ||
      contentHash(sourceTask.result?.scenarios || []);

    const task = await Task.create({
      id: uuidv4(),
      projectId: sourceTask.projectId,
      type: "generate-automation",
      status: "pending",
      inputContentHash: inputHash,
      sourceRunId: sourceTask.id,
      versionStatus: "draft",
    });

    // Trigger agent asynchronously
    this._runAgent3Automation(
      task,
      sourceTask,
      framework,
      feedbackPrompt,
      selectedScenarioIds,
      previousTaskId,
      user?.id,
    ).catch((error) => {
      console.error("[WorkflowService] Agent 3 automation failed:", error);
    });

    return task;
  }

  /**
   * Get task status by ID (with document and testcases)
   * @param {string} taskId
   * @returns {Promise<Object|null>} Task record with relations
   */
  async getTaskStatus(taskId, user) {
    const task = await Task.findByIdWithDocument(taskId);
    if (!task) return null;
    if (user) {
      await MembershipService.requireProjectRole(user.id, task.projectId, [
        "owner",
        "admin",
        "editor",
        "viewer",
      ]);
    }

    const artifacts = await AgentArtifact.findByTaskId(taskId);
    task.artifacts = artifacts;
    task.testcases = artifactsToTestcases(artifacts);
    task.result = buildTaskResultForClient(task, artifacts);

    return task;
  }

  async getTaskPartialTestcases(taskId, offset = 0, user) {
    const task = await Task.findById(taskId);
    if (!task) throw new ApiError(404, "Task not found");
    if (user) {
      await MembershipService.requireProjectRole(user.id, task.projectId, [
        "owner",
        "admin",
        "editor",
        "viewer",
      ]);
    }
    const artifactType = task.type === "generate-automation"
      ? "yaml"
      : "scenario";
    const allArtifacts = await AgentArtifact.findByTaskIdAndType(
      taskId,
      artifactType,
    );
    const partialArtifacts = allArtifacts.slice(offset);
    return {
      artifacts: partialArtifacts,
      testcases: artifactsToTestcases(partialArtifacts),
      nextOffset: allArtifacts.length,
    };
  }

  /**
   * Delete a task and all associated testcases
   * @param {string} taskId
   */
  async deleteTask(taskId, user) {
    const task = await Task.findById(taskId);
    if (!task) throw new Error("Task not found");
    if (user) {
      await MembershipService.requireProjectRole(user.id, task.projectId, [
        "owner",
        "admin",
        "editor",
      ]);
    }

    await AgentArtifact.deleteByTaskId(taskId);
    await Task.deleteById(taskId);
  }

  /**
   * List workflow tasks with optional filters
   * @param {Object} filters
   * @param {string=} filters.type
   * @param {string=} filters.status
   * @param {string=} filters.documentId
   * @param {number=} filters.limit
   * @returns {Promise<Object[]>}
   */
  async listTasks(filters = {}) {
    const enrichedFilters = { ...filters };

    if (filters.user) {
      const sub = await QuotaService.getOrProvisionSubscription(
        filters.user.id,
      );
      const { Plan } = require("../models");
      const plan = await Plan.findById(sub.planId);
      if (plan?.taskHistoryDays) {
        const since = new Date();
        since.setDate(since.getDate() - plan.taskHistoryDays);
        enrichedFilters.sinceDate = since.toISOString();
      }
    }

    if (!enrichedFilters.user) return Task.list(enrichedFilters);
    if (enrichedFilters.projectId) {
      await MembershipService.requireProjectRole(
        enrichedFilters.user.id,
        enrichedFilters.projectId,
        ["owner", "admin", "editor", "viewer"],
      );
      return Task.list(enrichedFilters);
    }

    const projectIds = await MembershipService.listAccessibleProjectIds(
      enrichedFilters.user.id,
    );
    const rows = (await Promise.all(
      projectIds.map((projectId) =>
        Task.list({ ...enrichedFilters, projectId })
      ),
    )).flat();
    return rows
      .sort((a, b) =>
        new Date(b.updatedAt || b.createdAt).getTime() -
        new Date(a.updatedAt || a.createdAt).getTime()
      )
      .slice(0, enrichedFilters.limit || 50);
  }

  /**
   * Get the latest completed task for the project that owns a document.
   * Auto-propagation only sees committed tasks — draft tasks are invisible to downstream.
   * @param {string} documentId
   * @returns {Promise<Object|null>} Latest completed committed task
   */
  async getLatestCompletedTask(documentId, type, user) {
    const document = await Document.findById(documentId);
    if (!document) throw new ApiError(404, "Document not found");
    if (user) {
      await MembershipService.requireProjectRole(user.id, document.projectId, [
        "owner",
        "admin",
        "editor",
        "viewer",
      ]);
    }
    // First try committed, fall back to any completed (legacy rows have no version_status)
    const committed = await Task.findLatestByProject(
      document.projectId,
      type,
      "completed",
      "committed",
    );
    if (committed) return committed;
    return Task.findLatestByProject(document.projectId, type, "completed");
  }

  /**
   * Commit a draft task, making it the active version for downstream agents.
   * @param {string} taskId
   * @param {Object} user
   */
  async commitTask(taskId, user) {
    const task = await Task.findById(taskId);
    if (!task) throw new ApiError(404, "Task not found");
    if (user) {
      await MembershipService.requireProjectRole(user.id, task.projectId, [
        "owner",
        "admin",
        "editor",
      ]);
    }
    if (task.status !== "completed") {
      throw new ApiError(400, "Only completed tasks can be committed");
    }
    if (task.versionStatus === "committed") return task; // idempotent
    const updated = await Task.commitTask(taskId);
    console.log(
      `[WorkflowService] Task committed: id=${taskId}, type=${task.type}`,
    );
    return updated;
  }

  /**
   * Check staleness for each agent stage in a project.
   * Returns an object with staleness info for Agent 1, 2, and 3.
   * @param {string} projectId
   * @param {Object} user
   */
  async checkStaleness(projectId, user) {
    if (user) {
      await MembershipService.requireProjectRole(user.id, projectId, [
        "owner",
        "admin",
        "editor",
        "viewer",
      ]);
    }

    // Latest completed task per stage (any version_status — we need to compare hashes)
    const [agent1Latest, agent2Latest, agent3Latest] = await Promise.all([
      Task.findLatestByProject(projectId, "extract-flows", "completed"),
      Task.findLatestByProject(projectId, "generate-testcases", "completed"),
      Task.findLatestByProject(projectId, "generate-automation", "completed"),
    ]);

    // Latest COMMITTED task per stage (what downstream agents should use)
    const [agent1Committed, agent2Committed] = await Promise.all([
      Task.findLatestByProject(
        projectId,
        "extract-flows",
        "completed",
        "committed",
      ),
      Task.findLatestByProject(
        projectId,
        "generate-testcases",
        "completed",
        "committed",
      ),
    ]);

    const result = {
      agent1: agent1Latest
        ? {
          taskId: agent1Latest.id,
          versionStatus: agent1Latest.versionStatus,
          outputContentHash: agent1Latest.outputContentHash,
          isDraft: agent1Latest.versionStatus === "draft",
        }
        : null,
      agent2: null,
      agent3: null,
    };

    if (agent2Latest) {
      // Agent 2 is stale if its input_hash != active committed Agent 1's output_hash
      const activeA1OutputHash = agent1Committed?.outputContentHash ||
        agent1Latest?.outputContentHash;
      const isStale = !!(activeA1OutputHash && agent2Latest.inputContentHash &&
        agent2Latest.inputContentHash !== activeA1OutputHash);
      result.agent2 = {
        taskId: agent2Latest.id,
        versionStatus: agent2Latest.versionStatus,
        outputContentHash: agent2Latest.outputContentHash,
        isDraft: agent2Latest.versionStatus === "draft",
        isStale,
        upstreamHash: activeA1OutputHash || null,
      };
    }

    if (agent3Latest) {
      const activeA2OutputHash = agent2Committed?.outputContentHash ||
        agent2Latest?.outputContentHash;
      const isStale = !!(activeA2OutputHash && agent3Latest.inputContentHash &&
        agent3Latest.inputContentHash !== activeA2OutputHash);
      result.agent3 = {
        taskId: agent3Latest.id,
        versionStatus: agent3Latest.versionStatus,
        outputContentHash: agent3Latest.outputContentHash,
        isDraft: agent3Latest.versionStatus === "draft",
        isStale,
        upstreamHash: activeA2OutputHash || null,
      };
    }

    return result;
  }

  /**
   * Internal: Run Agent 1 extraction
   * @private
   */
  async _runAgent1Extraction(
    task,
    documentIds,
    feedbackPrompt = "",
    userId = null,
  ) {
    // Download and concatenate all documents
    let rawText = "";
    try {
      const docPromises = documentIds.map(async (docId, i) => {
        const document = await Document.findById(docId);
        if (!document) {
          throw new Error(`Document not found: ${docId}`);
        }
        const content = await DocumentService.getContent(docId);
        return { document, content, index: i };
      });

      const results = await Promise.all(docPromises);
      // Ensure absolute ordering as provided in documentIds
      results.sort((a, b) => a.index - b.index);

      for (const res of results) {
        if (documentIds.length > 1) {
          // Add separator for multi-doc
          rawText += `\n\n--- DOCUMENT ${
            res.index + 1
          }: ${res.document.fileName} ---\n\n${res.content}`;
        } else {
          rawText = res.content;
        }
      }
    } catch (error) {
      await Task.update(task.id, {
        status: "failed",
        error: `Failed to read document content: ${error.message}`,
      });
      return;
    }

    await Task.update(task.id, { status: "processing" });

    console.log(
      `[WorkflowService._runAgent1Extraction] raw_text length=${rawText.length}, preview:\n${
        rawText.slice(0, 500)
      }`,
    );

    try {
      const response = await AgentService.runAgent({
        sessionId: task.id,
        nodeTarget: "agent_1_extraction",
        userId,
        projectId: task.projectId,
        context: {
          raw_text: rawText,
          prompt_profile: task.promptProfile || "",
          feedback_prompt: feedbackPrompt,
        },
      });

      // Collect stream response - parse SSE events
      let result = "";
      let buffer = "";
      let completedData = null;
      let agentError = null;
      let errorObservability = null;

      response.data.on("data", (chunk) => {
        buffer += chunk.toString();

        // Parse SSE events from buffer
        const lines = buffer.split("\n");
        buffer = lines.pop() || ""; // Keep incomplete line in buffer

        let currentEvent = null;

        for (const line of lines) {
          if (line.startsWith("event: ")) {
            currentEvent = line.slice(7).trim();
            // DEBUG: Log event type
            console.log("[WorkflowService] SSE event received:", currentEvent);
          } else if (line.startsWith("data: ") && currentEvent) {
            if (currentEvent === "error") {
              // Handle error event outside try-catch so it's not swallowed
              let errorMsg = "Agent execution error";
              try {
                const parsedError = JSON.parse(line.slice(6));
                errorMsg = parsedError.message || errorMsg;
                errorObservability = parsedError.observability || null;
              } catch (_) {}
              console.error(
                "[WorkflowService] Agent returned error:",
                errorMsg,
              );
              agentError = errorMsg;
            } else {
              try {
                const data = JSON.parse(line.slice(6));

                if (currentEvent === "progress" && data.token) {
                  // Accumulate tokens for Agent 1 markdown output
                  result += data.token;
                } else if (currentEvent === "completed") {
                  // DEBUG: Log completed data keys
                  console.log(
                    "[WorkflowService] SSE completed event keys:",
                    Object.keys(data),
                  );
                  // Agent completed - capture structured data
                  completedData = data;
                }
              } catch (parseError) {
                // Skip malformed JSON
              }
            }
          } else if (line === "" && currentEvent) {
            // Empty line marks end of event
            currentEvent = null;
          }
        }
      });

      response.data.on("end", async () => {
        try {
          // DEBUG: Log raw completed event
          console.log(
            "[WorkflowService] Raw completedData:",
            JSON.stringify(completedData, null, 2),
          );
          console.log(
            "[WorkflowService] Accumulated result length:",
            result.length,
          );

          if (agentError) {
            if (userId) {
              QuotaService.recordFailedUsage({
                userId,
                projectId: task.projectId,
                taskId: task.id,
                agentType: "agent_1",
              }).catch(() => {});
            }
            completedData = completedData ||
              { observability: errorObservability };
            throw new Error(`Agent error: ${agentError}`);
          }

          // Use completed data from agent (already structured)
          if (completedData) {
            console.log(
              "[WorkflowService] Agent 1 completed with structured data:",
              {
                flowsCount: completedData.flows?.length || 0,
                hasRawMarkdown: !!completedData.raw_markdown,
                featureCount: completedData.feature_count || 0,
                firstFlow: completedData.flows?.[0] || null,
              },
            );

            // Map agent flow format (name, source, steps) to frontend format (flowName, source, steps)
            const mappedFlows = (completedData.flows || []).map((flow) => ({
              flowName: flow.name || flow.flowName || "Unknown",
              source: flow.source || "",
              steps: flow.steps || [],
              ui_context: flow.ui_context || {},
            }));

            const outputHash = contentHash(mappedFlows);
            const flowArtifacts = mappedFlows.map((flow, index) => ({
              id: uuidv4(),
              taskId: task.id,
              projectId: task.projectId,
              agentType: "agent1",
              artifactType: "flow",
              artifactKey: flowArtifactKey(flow, index),
              title: flow.flowName,
              contentJson: flow,
              ordinal: index,
              contentHash: contentHash(flow),
            }));
            const rawMarkdown = completedData.raw_markdown || result;
            await AgentArtifact.bulkUpsert([
              ...flowArtifacts,
              ...(rawMarkdown
                ? [{
                  id: uuidv4(),
                  taskId: task.id,
                  projectId: task.projectId,
                  agentType: "agent1",
                  artifactType: "raw_markdown",
                  artifactKey: "raw_markdown",
                  title: "Raw Markdown",
                  contentText: rawMarkdown,
                  ordinal: 999999,
                  contentHash: contentHash(rawMarkdown),
                }]
                : []),
            ]);
            await Task.update(task.id, {
              result: {
                flowCount: mappedFlows.length,
                featureCount: completedData.feature_count || 0,
                ...(feedbackPrompt ? { feedback_prompt: feedbackPrompt } : {}),
              },
              status: "completed",
              output_content_hash: outputHash,
              observability: completedData.observability || {},
            });
            const t1In = completedData.token_usage?.input || 0;
            const t1Out = completedData.token_usage?.output || 0;
            console.log(
              `[Agent1] token_usage — input: ${t1In}, output: ${t1Out}, total: ${
                t1In + t1Out
              } (task=${task.id})`,
            );
            if (userId) {
              QuotaService.recordUsage({
                userId,
                projectId: task.projectId,
                taskId: task.id,
                agentType: "agent_1",
                tokenInput: t1In,
                tokenOutput: t1Out,
              }).catch(() => {});
            }
          } else if (result && result.trim().length > 0) {
            // Fallback: use accumulated markdown
            console.log(
              "[WorkflowService] No completed event, using accumulated markdown",
            );
            await AgentArtifact.bulkUpsert([{
              id: uuidv4(),
              taskId: task.id,
              projectId: task.projectId,
              agentType: "agent1",
              artifactType: "raw_markdown",
              artifactKey: "raw_markdown",
              title: "Raw Markdown",
              contentText: result,
              ordinal: 999999,
              contentHash: contentHash(result),
            }]);
            await Task.update(task.id, {
              result: {
                flowCount: 0,
                featureCount: 0,
              },
              status: "completed",
              output_content_hash: contentHash([]),
              observability: completedData?.observability || {},
            });
          } else {
            throw new Error("Agent returned empty result");
          }
        } catch (parseError) {
          console.error(
            "[WorkflowService] Error saving agent response:",
            parseError,
          );
          await Task.update(task.id, {
            error: `Failed to save agent response: ${parseError.message}`,
            status: "failed",
            observability: observabilityFromFailure(
              completedData?.observability,
              parseError,
            ),
          });
        }
      });

      response.data.on("error", async (error) => {
        await Task.update(task.id, {
          status: "failed",
          error: `Stream error: ${error.message}`,
          observability: observabilityFromFailure(null, error),
        });
      });
    } catch (error) {
      await Task.update(task.id, {
        status: "failed",
        error: error.message,
        observability: observabilityFromFailure(null, error),
      });
    }
  }

  /**
   * Internal: Run Agent 2 scenario generation
   * @private
   */
  async _runAgent2Generation(
    task,
    sourceTask,
    feedbackPrompt = "",
    selectedFlowNames = [],
    previousTaskId = "",
    userId = null,
  ) {
    await Task.update(task.id, { status: "processing" });

    const sourceFlowArtifacts = await AgentArtifact.findByTaskIdAndType(
      sourceTask.id,
      "flow",
    );
    let flows = flowArtifactsToFlows(sourceFlowArtifacts).map((f) => ({
      name: f.flowName || f.name || "Unknown",
      source: f.source || "",
      steps: f.steps || [],
      ui_context: f.ui_context || {},
    }));

    // Partial re-run: only process selected flows
    if (selectedFlowNames.length > 0) {
      flows = flows.filter((f) => selectedFlowNames.includes(f.name));
    }

    console.log(
      `[Agent2] Starting task=${task.id}, flows=${flows.length}/${sourceFlowArtifacts.length} (partial=${
        selectedFlowNames.length > 0
      }), feedbackPrompt="${feedbackPrompt}"`,
    );
    flows.forEach((f, i) =>
      console.log(
        `[Agent2]   flow[${i}]: "${f.name}" (${f.steps.length} steps)`,
      )
    );

    try {
      const response = await AgentService.runAgent({
        sessionId: task.id,
        nodeTarget: "agent_2_scenarios",
        userId,
        projectId: task.projectId,
        sourceRunId: sourceTask.id,
        context: {
          flows,
          feature_name: sourceTask.result?.feature_name || "Extracted Feature",
          feedback_prompt: feedbackPrompt,
        },
      });

      console.log(`[Agent2] SSE stream opened for task=${task.id}`);

      // Collect stream response - parse SSE events
      let result = "";
      let buffer = "";
      let completedData = null;
      let agentError = null;
      let errorObservability = null;

      let chunkCount = 0;
      response.data.on("data", (chunk) => {
        chunkCount++;
        buffer += chunk.toString();

        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        let currentEvent = null;

        for (const line of lines) {
          if (line.startsWith("event: ")) {
            currentEvent = line.slice(7).trim();
            if (currentEvent !== "progress") {
              console.log(
                `[Agent2] SSE event="${currentEvent}" (chunk #${chunkCount})`,
              );
            }
          } else if (line.startsWith("data: ") && currentEvent) {
            if (currentEvent === "error") {
              let errorMsg = "Agent 2 execution error";
              try {
                const parsedError = JSON.parse(line.slice(6));
                errorMsg = parsedError.message || errorMsg;
                errorObservability = parsedError.observability || null;
              } catch (_) {}
              console.error(`[Agent2] ERROR from agent: ${errorMsg}`);
              agentError = errorMsg;
            } else {
              try {
                const data = JSON.parse(line.slice(6));
                if (currentEvent === "progress") {
                  // Log meaningful progress messages (not raw tokens)
                  const msg = data.status || data.step || data.log || "";
                  if (msg && !data.token) {
                    console.log(`[Agent2] progress: ${msg}`);
                  }
                  if (data.token) result += data.token;
                  // Partial save: persist scenarios for each completed flow immediately
                  if (data.new_scenarios?.length > 0) {
                    const partialArtifacts = data.new_scenarios.map((
                      s,
                      index,
                    ) => ({
                      id: uuidv4(),
                      taskId: task.id,
                      projectId: task.projectId,
                      agentType: "agent2",
                      artifactType: "scenario",
                      artifactKey: scenarioArtifactKey(s),
                      title: s.name || s.flow_name || "Scenario",
                      contentJson: s,
                      ordinal: s.__ordinal ?? index,
                      contentHash: contentHash(s),
                    }));
                    AgentArtifact.bulkUpsert(partialArtifacts)
                      .then((saved) =>
                        console.log(
                          `[Agent2] Partial save: upserted ${saved.length} scenario artifact(s) (flow="${
                            data.new_scenarios[0]?.flow_name
                          }")`,
                        )
                      )
                      .catch((err) =>
                        console.warn(
                          "[Agent2] Partial save failed:",
                          err.message,
                        )
                      );
                  }
                } else if (currentEvent === "completed") {
                  console.log(
                    `[Agent2] completed — scenarios=${
                      data.scenarios?.length ?? 0
                    }, feature="${data.feature_name}"`,
                  );
                  completedData = data;
                }
              } catch (parseError) {
                // Skip malformed JSON
              }
            }
          } else if (line === "" && currentEvent) {
            currentEvent = null;
          }
        }
      });

      response.data.on("end", async () => {
        console.log(
          `[Agent2] Stream ended — chunks=${chunkCount}, agentError=${agentError}, hasCompleted=${!!completedData}`,
        );
        try {
          if (agentError) {
            if (userId) {
              QuotaService.recordFailedUsage({
                userId,
                projectId: task.projectId,
                taskId: task.id,
                agentType: "agent_2",
              }).catch(() => {});
            }
            completedData = completedData ||
              { observability: errorObservability };
            throw new Error(`Agent error: ${agentError}`);
          }
          if (!completedData && (!result || result.trim().length === 0)) {
            throw new Error("Agent returned empty result");
          }

          const finalScenarios = completedData?.scenarios || [];
          const featureName = completedData?.feature_name ||
            sourceTask.result?.feature_name ||
            "Unknown";
          const markdown = completedData?.markdown || result;

          console.log(
            `[Agent2] Saving ${finalScenarios.length} scenarios to task=${task.id}`,
          );

          // Dedup: query existing rows first, only insert what's missing.
          // Handles partial saves from streaming and safe retries.
          // Also saves BEFORE marking completed to prevent race condition on frontend fetch.
          if (finalScenarios.length > 0) {
            const scenarioArtifacts = finalScenarios.map((scenario, index) => ({
              id: uuidv4(),
              taskId: task.id,
              projectId: task.projectId,
              agentType: "agent2",
              artifactType: "scenario",
              artifactKey: scenarioArtifactKey(scenario),
              title: scenario.name || scenario.flow_name || "Scenario",
              contentJson: scenario,
              ordinal: index,
              contentHash: contentHash(scenario),
            }));
            await AgentArtifact.bulkUpsert(scenarioArtifacts);
            console.log(
              `[Agent2] Upserted ${scenarioArtifacts.length} scenario artifact(s) for task=${task.id}`,
            );
          } else {
            console.warn(
              `[Agent2] No scenarios returned — task=${task.id}, completedData keys: ${
                Object.keys(completedData || {}).join(", ")
              }`,
            );
          }

          // Partial re-run: copy kept flows from previous task
          if (previousTaskId && selectedFlowNames.length > 0) {
            const prevArtifacts = await AgentArtifact.findByTaskIdAndType(
              previousTaskId,
              "scenario",
            );
            const kept = prevArtifacts.filter((artifact) => {
              const scenario = artifact.contentJson || {};
              return !selectedFlowNames.includes(
                scenario.flow_name || scenario.name || artifact.title || "",
              );
            });
            if (kept.length > 0) {
              const toCreate = kept.map((artifact, index) => ({
                id: uuidv4(),
                taskId: task.id,
                projectId: task.projectId,
                agentType: "agent2",
                artifactType: "scenario",
                artifactKey: artifact.artifactKey,
                title: artifact.title,
                contentJson: artifact.contentJson,
                ordinal: finalScenarios.length + index,
                sourceArtifactId: artifact.id,
                contentHash: artifact.contentHash,
              }));
              await AgentArtifact.bulkUpsert(toCreate);
              console.log(
                `[Agent2] Merged ${kept.length} kept scenario artifact(s) from previousTask=${previousTaskId}`,
              );
            }
          }

          const savedArtifacts = await AgentArtifact.findByTaskIdAndType(
            task.id,
            "scenario",
          );
          const outputHash = contentHash(
            savedArtifacts.map((artifact) => artifact.contentJson),
          );
          // Mark completed AFTER testcases are persisted
          await Task.update(task.id, {
            result: {
              scenarioCount: savedArtifacts.length,
              feature_name: featureName,
              markdownLength: markdown.length,
              ...(feedbackPrompt ? { feedback_prompt: feedbackPrompt } : {}),
            },
            status: "completed",
            output_content_hash: outputHash,
            observability: completedData?.observability || {},
          });
          const t2In = completedData?.token_usage?.input || 0;
          const t2Out = completedData?.token_usage?.output || 0;
          console.log(
            `[Agent2] token_usage — input: ${t2In}, output: ${t2Out}, total: ${
              t2In + t2Out
            } (task=${task.id})`,
          );
          if (userId) {
            QuotaService.recordUsage({
              userId,
              projectId: task.projectId,
              taskId: task.id,
              agentType: "agent_2",
              tokenInput: t2In,
              tokenOutput: t2Out,
            }).catch(() => {});
          }
        } catch (parseError) {
          console.error(
            `[Agent2] Save error for task=${task.id}:`,
            parseError.message,
          );
          await Task.update(task.id, {
            error: `Failed to save agent response: ${parseError.message}`,
            status: "failed",
            observability: observabilityFromFailure(
              completedData?.observability,
              parseError,
            ),
          });
        }
      });

      response.data.on("error", async (error) => {
        console.error(
          `[Agent2] Stream error for task=${task.id}:`,
          error.message,
        );
        await Task.update(task.id, {
          status: "failed",
          error: `Stream error: ${error.message}`,
          observability: observabilityFromFailure(null, error),
        });
      });
    } catch (error) {
      await Task.update(task.id, {
        status: "failed",
        error: error.message,
        observability: observabilityFromFailure(null, error),
      });
    }
  }

  /**
   * Internal: Run Agent 3 automation code generation
   * @private
   */
  async _runAgent3Automation(
    task,
    sourceTask,
    framework = "AIDLC Auto Platform",
    feedbackPrompt = "",
    selectedScenarioIds = [],
    previousTaskId = "",
    userId = null,
  ) {
    await Task.update(task.id, { status: "processing" });

    const sourceScenarioArtifacts = await AgentArtifact.findByTaskIdAndType(
      sourceTask.id,
      "scenario",
    );
    let scenarios = sourceScenarioArtifacts
      .filter((artifact) => artifact.contentJson)
      .map((artifact) => normalizeScenarioForAgent3(artifact.contentJson));

    // Partial re-run: only process selected scenarios
    if (selectedScenarioIds.length > 0) {
      scenarios = scenarios.filter((s) =>
        selectedScenarioIds.includes(String(s.id))
      );
    }

    const featureName = sourceTask.result?.feature_name || "Unknown";

    console.log(
      `[Agent3] Starting task=${task.id}, scenarios=${scenarios.length}/${sourceScenarioArtifacts.length} (partial=${
        selectedScenarioIds.length > 0
      }), framework=${framework}`,
    );

    try {
      const response = await AgentService.runAgent({
        sessionId: task.id,
        nodeTarget: "agent_3_automation",
        userId,
        projectId: task.projectId,
        sourceRunId: sourceTask.id,
        context: {
          feature_name: featureName,
          scenarios,
          ui_description: "",
          framework,
          feedback_prompt: feedbackPrompt,
        },
      });

      let buffer = "";
      let completedData = null;
      let agentError = null;
      let errorObservability = null;
      let chunkCount = 0;
      let currentEvent = null;

      response.data.on("data", (chunk) => {
        chunkCount++;
        buffer += chunk.toString();

        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("event: ")) {
            currentEvent = line.slice(7).trim();
            if (currentEvent !== "progress") {
              console.log(
                `[Agent3] SSE event="${currentEvent}" (chunk #${chunkCount})`,
              );
            }
          } else if (line.startsWith("data: ") && currentEvent) {
            if (currentEvent === "error") {
              let errorMsg = "Agent 3 execution error";
              try {
                const parsedError = JSON.parse(line.slice(6));
                errorMsg = parsedError.message || errorMsg;
                errorObservability = parsedError.observability || null;
              } catch (_) {}
              console.error(`[Agent3] ERROR: ${errorMsg}`);
              agentError = errorMsg;
            } else {
              try {
                const data = JSON.parse(line.slice(6));
                if (currentEvent === "progress") {
                  const msg = data.status || data.log || "";
                  if (msg) console.log(`[Agent3] progress: ${msg}`);
                  // Partial save: persist each scenario's YAML immediately as it arrives
                  if (data.new_files?.length > 0) {
                    const partialYamls = data.new_files.map((f, index) => ({
                      id: uuidv4(),
                      taskId: task.id,
                      projectId: task.projectId,
                      agentType: "agent3",
                      artifactType: "yaml",
                      artifactKey: yamlArtifactKey(f, index),
                      title: f.filename,
                      contentJson: { filename: f.filename, framework },
                      contentText: f.content,
                      ordinal: index,
                      contentHash: contentHash(f.content || ""),
                    }));
                    AgentArtifact.bulkUpsert(partialYamls)
                      .then((saved) =>
                        console.log(
                          `[Agent3] Partial save: upserted ${saved.length} YAML artifact(s) (${
                            data.new_files[0]?.filename
                          })`,
                        )
                      )
                      .catch((err) =>
                        console.warn(
                          "[Agent3] Partial save failed:",
                          err.message,
                        )
                      );
                  }
                } else if (currentEvent === "completed") {
                  console.log(
                    `[Agent3] completed — yaml_files=${
                      data.yaml_files?.length ?? 0
                    }`,
                  );
                  completedData = data;
                }
              } catch (_) {}
            }
          } else if (line === "" && currentEvent) {
            currentEvent = null;
          }
        }
      });

      response.data.on("end", async () => {
        console.log(
          `[Agent3] Stream ended — chunks=${chunkCount}, agentError=${agentError}, hasCompleted=${!!completedData}`,
        );
        try {
          if (agentError) {
            if (userId) {
              QuotaService.recordFailedUsage({
                userId,
                projectId: task.projectId,
                taskId: task.id,
                agentType: "agent_3",
              }).catch(() => {});
            }
            completedData = completedData ||
              { observability: errorObservability };
            throw new Error(`Agent error: ${agentError}`);
          }
          if (!completedData) throw new Error("Agent returned empty result");

          const yamlFiles = completedData.yaml_files || [];
          console.log(
            `[Agent3] Saving ${yamlFiles.length} YAML files for task=${task.id}`,
          );

          if (yamlFiles.length > 0) {
            const yamlArtifacts = yamlFiles.map((f, index) => ({
              id: uuidv4(),
              taskId: task.id,
              projectId: task.projectId,
              agentType: "agent3",
              artifactType: "yaml",
              artifactKey: yamlArtifactKey(f, index),
              title: f.filename,
              contentJson: { filename: f.filename, framework },
              contentText: f.content,
              ordinal: index,
              contentHash: contentHash(f.content || ""),
            }));
            await AgentArtifact.bulkUpsert(yamlArtifacts);
            console.log(
              `[Agent3] Upserted ${yamlArtifacts.length} YAML artifact(s) for task=${task.id}`,
            );
          } else {
            console.warn(`[Agent3] No YAML files returned for task=${task.id}`);
          }

          // Partial re-run: copy kept scenarios' YAMLs from previous task
          if (previousTaskId && selectedScenarioIds.length > 0) {
            const prevYamls = await AgentArtifact.findByTaskIdAndType(
              previousTaskId,
              "yaml",
            );
            const kept = prevYamls.filter((artifact) => {
              const meta = artifact.contentJson || {};
              const scenId = stripYamlExtension(
                meta.filename || artifact.title || artifact.artifactKey,
              );
              return !selectedScenarioIds.includes(scenId);
            });
            if (kept.length > 0) {
              const toCreate = kept.map((artifact, index) => ({
                id: uuidv4(),
                taskId: task.id,
                projectId: task.projectId,
                agentType: "agent3",
                artifactType: "yaml",
                artifactKey: artifact.artifactKey,
                title: artifact.title,
                contentJson: artifact.contentJson,
                contentText: artifact.contentText,
                ordinal: yamlFiles.length + index,
                sourceArtifactId: artifact.id,
                contentHash: artifact.contentHash,
              }));
              await AgentArtifact.bulkUpsert(toCreate);
              console.log(
                `[Agent3] Merged ${kept.length} kept YAML artifact(s) from previousTask=${previousTaskId}`,
              );
            }
          }

          const savedArtifacts = await AgentArtifact.findByTaskIdAndType(
            task.id,
            "yaml",
          );
          const outputHash = contentHash(savedArtifacts.map((artifact) => ({
            filename: artifact.contentJson?.filename || artifact.title,
            content: artifact.contentText,
          })));
          // Mark completed AFTER files are persisted
          await Task.update(task.id, {
            result: {
              yamlCount: savedArtifacts.length,
              summary: completedData.summary || "",
              framework,
              ...(feedbackPrompt ? { feedback_prompt: feedbackPrompt } : {}),
            },
            status: "completed",
            output_content_hash: outputHash,
            observability: completedData.observability || {},
          });
          const t3In = completedData.token_usage?.input || 0;
          const t3Out = completedData.token_usage?.output || 0;
          console.log(
            `[Agent3] token_usage — input: ${t3In}, output: ${t3Out}, total: ${
              t3In + t3Out
            } (task=${task.id})`,
          );
          console.log(
            `[Agent3] billing userId=${userId ?? "NULL — skipping quota"}`,
          );
          if (userId) {
            QuotaService.recordUsage({
              userId,
              projectId: task.projectId,
              taskId: task.id,
              agentType: "agent_3",
              tokenInput: t3In,
              tokenOutput: t3Out,
            }).catch((err) =>
              console.error("[Agent3] recordUsage error:", err.message)
            );
          }
        } catch (err) {
          console.error(
            `[Agent3] Save error for task=${task.id}:`,
            err.message,
          );
          await Task.update(task.id, {
            error: `Failed to save agent response: ${err.message}`,
            status: "failed",
            observability: observabilityFromFailure(
              completedData?.observability,
              err,
            ),
          });
        }
      });

      response.data.on("error", async (error) => {
        console.error(
          `[Agent3] Stream error for task=${task.id}:`,
          error.message,
        );
        await Task.update(task.id, {
          status: "failed",
          error: `Stream error: ${error.message}`,
          observability: observabilityFromFailure(null, error),
        });
      });
    } catch (error) {
      await Task.update(task.id, {
        status: "failed",
        error: error.message,
        observability: observabilityFromFailure(null, error),
      });
    }
  }
}

module.exports = new WorkflowService();
