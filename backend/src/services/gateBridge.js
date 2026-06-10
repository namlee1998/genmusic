// Bridge between a live agent permission wait and persisted human approval.
//
// Beginner reading guide:
// - requestGate() persists PendingGate, moves the Task to awaiting_gate, and
//   returns an in-memory Promise awaited by the running agent.
// - resolveGate() resolves exactly once, persists the decision, and resumes Task.
// - after restart the Promise is gone; server boot marks old gates interrupted
//   and SdlcWorkflowService re-dispatches the affected stage.
//
// In-memory registry of pending HITL gates. The claude-code runner calls
// requestGate() and AWAITS the returned promise; the HTTP approvals endpoint
// calls resolveGate() to wake it up. Resolution is idempotent (a double POST
// never triggers a double action) and a watchdog auto-rejects an unanswered
// gate after a timeout so a workflow can never hang forever.
//
// SSE in this app is poll-based, so we also expose listPending()/getPending()
// for the status stream + a new /approvals listing to render, and accept an
// optional emitSse callback for push-style consumers.

const { v4: uuidv4 } = require('uuid');
const logger = require('../config/logger');
const PendingGate = require('../models/PendingGate');
const taskLifecycle = require('./taskLifecycleService');

/** approvalId -> pending record */
const pending = new Map();
/** taskId -> Set<(event, data) => void> */
const subscribers = new Map();

function emit(taskId, event, data) {
  for (const listener of subscribers.get(taskId) || []) {
    try {
      listener(event, data);
    } catch (err) {
      logger.warn('gate subscriber failed', { taskId, event, error: err.message });
    }
  }
}

function subscribe(taskId, listener) {
  const listeners = subscribers.get(taskId) || new Set();
  listeners.add(listener);
  subscribers.set(taskId, listeners);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) subscribers.delete(taskId);
  };
}

function defaultTimeout() {
  return Math.max(1000, Number(process.env.GATE_TIMEOUT_MS) || 600000);
}

/**
 * Create a pending gate and return a promise that resolves when a human (or the
 * watchdog) decides. The promise resolves to the raw decision object passed to
 * resolveGate, e.g. { action:'approve' } | { action:'reject', comment } |
 * { answers } | { timedOut:true }.
 *
 * @param {object} p
 * @param {string} p.taskId
 * @param {string} [p.projectId]
 * @param {string} p.role     owning role, e.g. 'dev-agent'
 * @param {'tool'|'question'} p.kind
 * @param {object} p.payload  rendered context (file_path, diff, questions, risk…)
 * @param {Function} [p.emitSse]  optional (event, data) => void push callback
 * @param {number} [p.timeoutMs]
 */
function requestGate({ taskId, projectId = null, role, kind, payload = {}, emitSse = null, timeoutMs }) {
  const approvalId = uuidv4();
  const ttl = Number.isFinite(timeoutMs) ? timeoutMs : defaultTimeout();

  const promise = new Promise((resolve) => {
    const timer = setTimeout(() => {
      // Watchdog: auto-reject so the workflow never hangs. Resolve idempotently.
      if (pending.has(approvalId)) {
        resolveGate(approvalId, {
          action: 'reject',
          timedOut: true,
          comment: 'Auto-rejected: approval timed out',
        }).catch((err) => logger.warn('failed to resolve gate timeout', { approvalId, error: err.message }));
      }
    }, ttl);
    // Avoid keeping the event loop alive on this timer (tests / smoke).
    if (typeof timer.unref === 'function') timer.unref();

    pending.set(approvalId, {
      approvalId,
      taskId,
      projectId,
      role,
      kind,
      payload,
      status: 'pending',
      createdAt: new Date().toISOString(),
      timer,
      resolve,
    });
  });

  const eventData = { approvalId, taskId, projectId, role, kind, payload, status: 'pending', createdAt: new Date().toISOString() };
  // Persistence is completed before SSE/subscriber notification. Callers that
  // drive an agent await `ready`, so a visible gate always has durable state.
  const ready = (async () => {
    await PendingGate.create(eventData);
    await taskLifecycle.transitionIfPresent(taskId, 'awaiting_gate', {
      actor: role,
      payload: { approvalId, kind },
    });
    if (typeof emitSse === 'function') emitSse('gate_pending', eventData);
    emit(taskId, 'gate_pending', eventData);
    logger.info('gate_pending', { approvalId, taskId, role, kind });
  })();
  ready.catch((err) => logger.error('failed to persist pending gate', { approvalId, error: err.message }));
  // Remember `ready` on the record so resolveGate can wait for the awaiting_gate
  // transition to land before transitioning back to running (see resolveGate).
  const rec = pending.get(approvalId);
  if (rec) rec.ready = ready;
  return { approvalId, promise, ready };
}

/**
 * Resolve a pending gate exactly once. Returns true if this call woke the gate,
 * false if it was already resolved/absent (idempotent — no double action).
 */
async function resolveGate(approvalId, result = {}) {
  const rec = pending.get(approvalId);
  if (!rec) return false;
  // A fast resolve (e.g. an auto-approving drainer) can fire before requestGate's
  // async `ready` has run the running -> awaiting_gate transition. Await it first
  // so our awaiting_gate -> running transition can never be reordered ahead of it,
  // which would otherwise leave the task stuck in awaiting_gate.
  if (rec.ready) await rec.ready.catch(() => {});
  clearTimeout(rec.timer);
  rec.status = result.timedOut ? 'timed_out' : (result.action === 'reject' ? 'rejected' : 'resolved');
  pending.delete(approvalId);
  await PendingGate.resolve(approvalId, rec.status, result);
  await taskLifecycle.transitionIfPresent(rec.taskId, 'running', {
    actor: 'human',
    payload: { approvalId, result, gateStatus: rec.status },
    eventType: 'gate_resolved',
  });
  emit(rec.taskId, 'gate_resolved', { approvalId, taskId: rec.taskId, result });
  logger.info('gate_resolved', { approvalId, taskId: rec.taskId, action: result.action || 'allow' });
  rec.resolve(result);
  return true;
}

function hasPending(approvalId) {
  return pending.has(approvalId);
}

function getPending(approvalId) {
  const rec = pending.get(approvalId);
  if (!rec) return null;
  // never leak the resolve fn / timer / ready promise
  const { resolve, timer, ready, ...safe } = rec;
  return safe;
}

/** List pending gates, optionally filtered by taskId or projectId. */
function listPending({ taskId = null, projectId = null } = {}) {
  const out = [];
  for (const rec of pending.values()) {
    if (taskId && rec.taskId !== taskId) continue;
    if (projectId && rec.projectId !== projectId) continue;
    const { resolve, timer, ready, ...safe } = rec;
    out.push(safe);
  }
  return out;
}

/** Test/cleanup helper — drop everything (does NOT resolve). */
function _clearAll() {
  for (const rec of pending.values()) clearTimeout(rec.timer);
  pending.clear();
  subscribers.clear();
}

async function markOrphanedPendingInterrupted() {
  return PendingGate.markPendingInterrupted();
}

async function listInterrupted(filters = {}) {
  try {
    return await PendingGate.listInterrupted(filters);
  } catch (err) {
    logger.warn('failed to list interrupted gates', { error: err.message });
    return [];
  }
}

async function findPersisted(approvalId) {
  try {
    return await PendingGate.findById(approvalId);
  } catch (err) {
    logger.warn('failed to read persisted gate', { approvalId, error: err.message });
    return null;
  }
}

module.exports = {
  requestGate,
  resolveGate,
  hasPending,
  getPending,
  listPending,
  listInterrupted,
  findPersisted,
  markOrphanedPendingInterrupted,
  subscribe,
  _clearAll,
};
