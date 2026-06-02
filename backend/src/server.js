const express = require('express');
const cors = require('cors');
const { PORT, NODE_ENV, FRONTEND_URL } = require('./config/environment');
const prisma = require('./config/database');
const routes = require('./routes');
const { startBatchJobs } = require('./jobs/batchJob');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { requestLogger } = require('./middleware/logger');

const app = express();
const PRISMA_CONNECT_TIMEOUT_MS = 5_000;

const connectPrismaWithTimeout = () => Promise.race([
  prisma.$connect(),
  new Promise((_, reject) => {
    setTimeout(
      () => reject(new Error(`Timed out after ${PRISMA_CONNECT_TIMEOUT_MS}ms`)),
      PRISMA_CONNECT_TIMEOUT_MS
    );
  }),
]);

// CORS configuration
const allowedOrigins = new Set(
  FRONTEND_URL
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
);

if (NODE_ENV !== 'production') {
  allowedOrigins.add('http://localhost:5173');
  allowedOrigins.add('http://localhost:3000');
}

app.use(cors({
  origin(origin, callback) {
    const isLocalDevOrigin = NODE_ENV !== 'production'
      && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin || '');
    if (!origin || allowedOrigins.has(origin) || isLocalDevOrigin) {
      return callback(null, true);
    }
    return callback(new Error(`Origin ${origin} is not allowed by CORS`));
  },
  credentials: true,
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

if (NODE_ENV === 'development') {
  app.use(requestLogger);
}

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
app.use('/api/v1', routes);

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

// Start server
const startServer = async () => {
  try {
    // Test Prisma connection
    try {
      await connectPrismaWithTimeout();
      console.log('[Prisma] Connection verified.');
    } catch (dbError) {
      console.error('[Prisma] Connection test failed:', dbError.message);
      console.warn('[Prisma] Ensure database exists and schema is pushed');
    }

    // Start listening
    app.listen(PORT, () => {
      console.log(`[Server] Backend running on http://localhost:${PORT}`);
      console.log(`[Server] Environment: ${NODE_ENV}`);
      console.log(`[Server] Agents URL: ${process.env.AGENTS_BASE_URL || 'http://127.0.0.1:8001'}`);
      startBatchJobs();
    });
  } catch (error) {
    console.error('[Server] Failed to start:', error);
    process.exit(1);
  }
};

startServer();

module.exports = app;
