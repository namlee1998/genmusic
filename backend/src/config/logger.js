// I2: structured JSON logging (pino). Every line automatically carries the
// active request context (requestId, and any taskId/phase set via setContext),
// so logs can be correlated with the `requestId` returned in error responses.
const pino = require('pino');
const { getContext } = require('../middleware/requestContext');

const base = pino({
  level: process.env.LOG_LEVEL || 'info',
  base: undefined, // drop pid/hostname noise; keep lines compact
});

// Merge the active request context into each log line's fields.
const withCtx = (fields = {}) => ({ ...getContext(), ...fields });

const logger = {
  info: (msg, fields = {}) => base.info(withCtx(fields), msg),
  warn: (msg, fields = {}) => base.warn(withCtx(fields), msg),
  error: (msg, fields = {}) => base.error(withCtx(fields), msg),
  debug: (msg, fields = {}) => base.debug(withCtx(fields), msg),
  raw: base,
};

module.exports = logger;
