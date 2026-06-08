// I2: per-request correlation id, threaded through the whole async chain via
// AsyncLocalStorage so deep service/agent logs can include it without passing
// `req` everywhere. No schema change — the id lives in logs + the error
// envelope only (request↔error↔log correlation for debugging).
const { AsyncLocalStorage } = require('async_hooks');
const { v4: uuidv4 } = require('uuid');

const requestContext = new AsyncLocalStorage();

/** Current request id (or null when outside a request context). */
const getRequestId = () => requestContext.getStore()?.requestId || null;

/** Whole current context store (requestId, and anything added via setContext). */
const getContext = () => requestContext.getStore() || {};

/** Merge extra fields (e.g. taskId, phase) into the active request context. */
const setContext = (fields = {}) => {
  const store = requestContext.getStore();
  if (store) Object.assign(store, fields);
};

/** Run a function inside a fresh context (used by background jobs/scripts). */
const runWithContext = (fields, fn) => requestContext.run({ ...fields }, fn);

const requestContextMiddleware = (req, res, next) => {
  const requestId = req.headers['x-request-id'] || uuidv4();
  req.id = requestId;
  res.setHeader('x-request-id', requestId);
  requestContext.run({ requestId }, () => next());
};

module.exports = {
  requestContext,
  requestContextMiddleware,
  getRequestId,
  getContext,
  setContext,
  runWithContext,
};
