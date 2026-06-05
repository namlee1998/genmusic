const logger = require('../config/logger');

/**
 * Request logger middleware. Emits one structured JSON line per request,
 * carrying the I2 request id so it can be matched with the `requestId`
 * returned in any error response.
 */
const requestLogger = (req, res, next) => {
  const start = Date.now();

  res.on('finish', () => {
    logger.info('request', {
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      durationMs: Date.now() - start,
    });
  });

  next();
};

module.exports = { requestLogger };
