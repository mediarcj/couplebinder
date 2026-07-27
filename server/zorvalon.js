'use strict';

// Description: Entry point for application server - refactored and modular
// High-level boot order (see detailed comment below):
//   Express → preflight OPTIONS → toggles → trust proxy/canonical host →
//   core security + health/degrade/cors/rate limiters → Stripe webhook + parsers + cookies →
//   app config → auth bridge + default-deny → views/static → routes → errors → shutdown
// Notes: Console logs mark important checkpoints for audit and debugging.

const express = require('express');
const path = require('path');

// Install console shim early to intercept JSON event logs
try {
  const { installJsonLogShim } = require('./utils/consoleLogger');
  installJsonLogShim();
} catch (err) {
  console.error('Failed to install console shim:', err.message);
}

// Application Configuration and Dependencies
let config, logConfigSummary, csrfLite, requestIdMiddleware, logger, consoleLogger;

try {
  const configModule = require('./config');
  config = configModule.config;
  logConfigSummary = configModule.logConfigSummary;
} catch (error) {
  console.error('Failed to load config module:', error.message);
  if ((process.env.NODE_ENV || 'development') !== 'test') process.exitCode = 1;
  throw error;
}

try {
  csrfLite = require('./middleware/csrfLite');
} catch (error) {
  console.error('FATAL: Cannot load CSRF middleware:', error);
  console.error('CRITICAL: CSRF protection is mandatory. Server cannot start.');
  if ((process.env.NODE_ENV || 'development') !== 'test') process.exitCode = 1;
  throw error;
}

try {
  requestIdMiddleware = require('./middleware/requestId');
} catch (error) {
  console.error('FATAL: Cannot load request ID middleware:', error);
  console.error('CRITICAL: Request tracking is mandatory for audit trails. Server cannot start.');
  if ((process.env.NODE_ENV || 'development') !== 'test') process.exitCode = 1;
  throw error;
}

try {
  logger = require('./utils/logger');
  logger.info({ event: 'boot.module_loaded', module: 'logger' }, 'Logger module loaded successfully');
} catch (error) {
  console.error('Failed to load logger module:', error.message);
  logger = { info: () => {}, error: () => {}, warn: () => {} };
}

try {
  consoleLogger = require('./utils/consoleLogger');
  logger.info(
    { event: 'boot.module_loaded', module: 'consoleLogger' },
    'Console logger module loaded successfully'
  );
} catch (error) {
  logger.error(
    { event: 'boot.module_load_failed', module: 'consoleLogger', error: error.message },
    'Failed to load console logger module'
  );
  consoleLogger = {
    formatConfigSummary: () => {},
    formatMiddlewareRegistration: () => {},
    formatServerStartup: () => {},
  };
}

// Server toggles (feature flags for ops)
let toggles;
try {
  toggles = require('./config/toggles');
  logger.info({ event: 'boot.module_loaded', module: 'toggles' }, 'Server toggles loaded successfully');
} catch (error) {
  logger.error(
    { event: 'boot.module_load_failed', module: 'toggles', error: error.message },
    'Failed to load toggles module'
  );
  toggles = {
    env: 'production',
    logLevel: 'info',
    blockCmsScans: false,
    corsDebug: false,
    exposeDebugRoutes: false,
    logLegacyStaticHits: false,
  };
}

// New security middleware (wired via bootstrap/coreMiddleware)
const methodGuard = require('./middleware/methodGuard');
const credentialGuard = require('./middleware/credentialGuard');
const { generateCspNonce, securityHeaders } = require('./middleware/securityHeaders');
const cacheControl = require('./middleware/cacheControl');
const trustProxyIp = require('./middleware/trustProxyIp');
const corsAllowlist = require('./middleware/corsAllowlist');
const {
  generalLimiter,
  loginLimiter,
  registerLimiter,
  logoutLimiter,
  cookieSetLimiter,
} = require('./middleware/rateLimiter');

// STEP 1: Application Initialization

const app = express();
app.disable('x-powered-by');

// Shutdown posture flags (used by readiness/guards if you add them later)
app.locals.isShuttingDown = false;

// Start privacy-safe total request timing before preflight, Redis, cookies, or auth.
const { requestTiming } = require('./middleware/requestTiming');
app.use(requestTiming({ logger }));

const { registerStaticAssets } = require('./bootstrap/staticAssets');
registerStaticAssets(app, { logger });

// Initialize Redis status tracking
app.locals.redisReady = false;
app.locals.rateLimitStoreReady = false;

// Trust proxy for Cloudflare/ALB hops (from config)
app.set('trust proxy', config.server.trustProxyHops);

// Canonical host redirect (optional)
if (config.server.canonicalHost) {
  const { isHttps } = require('./lib/authCookie');
  app.use((req, res, next) => {
    const targetHost = config.server.canonicalHost.trim().toLowerCase();
    const reqHost = String(req.hostname || req.get('host') || '').toLowerCase();
    if (targetHost && reqHost && reqHost !== targetHost) {
      const proto = isHttps(req) ? 'https' : 'http';
      return res.redirect(301, `${proto}://${targetHost}${req.originalUrl || req.url || ''}`);
    }
    next();
  });
}

/**
 * ABSOLUTE TOP: Preflight short-circuit (ALLOWLISTED)
 *
 * IMPORTANT:
 * - Do NOT reflect arbitrary Origin.
 * - Only allow Origins that your config would allow.
 */
function isAllowedPreflightOrigin(origin) {
  const env = config?.server?.nodeEnv || process.env.NODE_ENV || 'development';
  const allowed = Array.isArray(config?.security?.allowedOrigins) ? config.security.allowedOrigins : [];

  if (typeof origin !== 'string' || !origin) return false;

  const o = origin.trim();
  if (allowed.includes(o)) return true;

  // Dev convenience: allow local origins when not production
  if (env !== 'production') {
    const localRe = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;
    if (localRe.test(o)) return true;
  }

  return false;
}

app.use((req, res, next) => {
  if (req.method !== 'OPTIONS') return next();

  const origin = req.get('Origin');
  const acrh = req.get('Access-Control-Request-Headers') || 'Content-Type, Authorization, X-CSRF-Token';
  const acrm = req.get('Access-Control-Request-Method') || 'GET,POST,PUT,PATCH,DELETE,OPTIONS';

  res.set('Vary', 'Origin, Access-Control-Request-Headers, Access-Control-Request-Method');

  if (origin) {
    if (!isAllowedPreflightOrigin(origin)) {
      return res.status(403).end();
    }
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Access-Control-Allow-Credentials', 'true');
  } else {
    res.set('Access-Control-Allow-Origin', '*');
  }

  res.set('Access-Control-Allow-Methods', acrm);
  res.set('Access-Control-Allow-Headers', acrh);
  res.set('Access-Control-Max-Age', '600');

  return res.status(204).end();
});

// Request tracker (for shutdown drain diagnostics)
// Mount AFTER OPTIONS short-circuit so it doesn’t count preflights.
let requestTracker = null;
try {
  const shutdownModule = require('./bootstrap/shutdown');
  if (typeof shutdownModule.createRequestTracker === 'function') {
    requestTracker = shutdownModule.createRequestTracker({ logger });
    app.use(requestTracker.middleware);
  } else {
    logger.warn(
      { event: 'boot.request_tracker_unavailable' },
      'createRequestTracker not exported; request draining diagnostics disabled'
    );
  }
} catch (err) {
  logger.warn(
    { event: 'boot.request_tracker_load_failed', error: err.message },
    'Failed to initialize request tracker; request draining diagnostics disabled'
  );
}

/**
 * STEP 1.5: Toggle-Based Middleware
 */

// Block common CMS scanner paths (WordPress, PHP, etc.)
if (toggles.blockCmsScans) {
  const blockCmsScans = require('./middleware/blockCmsScans');
  app.use(blockCmsScans());
  logger.info({ event: 'boot.toggle_enabled', toggle: 'blockCmsScans' }, 'Toggle: CMS scan blocking enabled');
}

logger.info(
  { event: 'boot.server_starting', appName: config.branding.appName },
  `${config.branding.appName} server starting...`
);

try {
  if (typeof logConfigSummary === 'function') {
    logConfigSummary();
  } else {
    logger.warn(
      { event: 'boot.config_summary_unavailable' },
      '[couplebinder] logConfigSummary is not a function; skipping config summary log'
    );
  }
} catch (err) {
  logger.error({ event: 'boot.config_summary_failed', error: err.message }, '[couplebinder] Failed to log config summary');
}

// STEP 3: Redis Client Creation and Connection

let redisClient = null;

// IMPORTANT: default noop so async initRedis can safely call it immediately.
let updateRedisStatus = () => {};

try {
  const { updateRedisStatus: updateStatus } = require('./routes/health');
  updateRedisStatus = updateStatus;
} catch {
  // keep noop
}

try {
  const { client, connectRedis } = require('./utils/redisClient');
  redisClient = client;
  logger.info({ event: 'boot.module_loaded', module: 'redisClient' }, 'Redis client module loaded successfully');

  const initRedis = async () => {
    try {
      await connectRedis();
      app.locals.redisReady = true;
      app.locals.rateLimitStoreReady = true;
      updateRedisStatus(true, new Date().toISOString());
      logger.info({ event: 'boot.redis_connected' }, 'Redis connection established successfully');
    } catch (error) {
      logger.error({ event: 'boot.redis_connection_failed', error: error.message }, 'Redis connection failed');
      logger.info({ event: 'boot.redis_degrade' }, 'Redis-dependent features will fall back or degrade gracefully');
      app.locals.redisReady = false;
      app.locals.rateLimitStoreReady = false;
      updateRedisStatus(false, new Date().toISOString());
    }
  };

  initRedis(); // non-blocking

  redisClient.on('connect', () => {
    app.locals.redisReady = true;
    app.locals.rateLimitStoreReady = true;
  });

  redisClient.on('error', () => {
    app.locals.redisReady = false;
    app.locals.rateLimitStoreReady = false;
  });

  redisClient.on('end', () => {
    app.locals.redisReady = false;
    app.locals.rateLimitStoreReady = false;
  });
} catch (error) {
  logger.error(
    { event: 'boot.module_load_failed', module: 'redisClient', error: error.message },
    'Redis client module load failed'
  );
  logger.info({ event: 'boot.redis_unavailable' }, 'Continuing without Redis...');
  app.locals.redisReady = false;
  app.locals.rateLimitStoreReady = false;
}

// Maintenance Guard factory (mounted in registerCoreMiddleware)
const createMaintenanceGuard = require('./middleware/maintenanceGuard');

// Degrade guard
logger.info({ event: 'boot.middleware_ready', middleware: 'degradeGuard' }, 'Security: Redis degrade guard ready (mounted once, early)');

// STEP 4: Security and Core Middleware Registration

const { registerCoreMiddleware } = require('./bootstrap/coreMiddleware');
const enforceHttps = require('./middleware/enforceHttps');
const parseCookies = require('./middleware/cookieGuardian');
const appConfig = require('./middleware/appConfig');
const authBridge = require('./middleware/authBridge');
const { requireAuth } = require('./middleware/requireAuth');
const { mountStripeWebhook } = require('./routes/stripeWebhook');
const { router: healthRouter } = require('./routes/health');
const { ipFirewall } = require('./middleware/ipFirewall');
const degradeGuard = require('./middleware/degradeGuard');

registerCoreMiddleware({
  app,
  config,
  toggles,
  logger,
  consoleLogger,
  csrfLite,
  corsAllowlist,
  trustProxyIp,
  cacheControl,
  methodGuard,
  credentialGuard,
  generateCspNonce,
  securityHeaders,
  enforceHttps,
  corsDebugMiddleware: require('./middleware/corsDebug'),
  rateLimiters: {
    generalLimiter,
    loginLimiter,
    registerLimiter,
    logoutLimiter,
    cookieSetLimiter,
  },
  authBridge,
  requireAuth,
  cookieGuardian: parseCookies,
  appConfig,
  mountStripeWebhook,
  degradeGuard,
  ipFirewall,
  createMaintenanceGuard,
  healthRouter,
  requestIdMiddleware,
  redisClient,
});

// STEP 5: View Engine and Static Assets

app.set('view engine', 'ejs');
app.set('views', path.resolve(__dirname, 'ejs'));

if (config?.server?.nodeEnv === 'production') {
  app.set('view cache', true);
  logger.info({ event: 'boot.view_cache_enabled' }, 'View caching enabled for production');
} else {
  app.set('view cache', false);
  logger.info(
    { event: 'boot.view_cache_disabled', env: config?.server?.nodeEnv || 'development' },
    'View caching disabled for development'
  );
}

consoleLogger.formatMiddlewareRegistration('View engine and static assets');

// STEP 7: Routes Registration

const { registerRoutes } = require('./bootstrap/routes');
const { routeTiming } = require('./middleware/requestTiming');

// Measure routing, page-model work, and rendering after shared middleware has completed.
app.use(routeTiming);

registerRoutes({
  app,
  config,
  toggles,
  requireAuth,
  logger,
  consoleLogger,
  csrfLite,
});

consoleLogger.formatMiddlewareRegistration('Routes');

// STEP 8: Error Handling

const { registerErrorHandlers } = require('./bootstrap/errors');
registerErrorHandlers({ app, logger, config, consoleLogger });

// STEP 9: Server Startup

const PORT = config.server.port;
const HOST = config.server.host;

// Hold a stop handle for the outbox processor (so shutdown can stop it first)
let stopOutboxProcessor = null;

const server = app.listen(PORT, HOST, () => {
  consoleLogger.formatServerStartup({
    host: HOST,
    port: PORT,
    nodeEnv: config.server.nodeEnv,
    database: config.database,
    rateLimit: 'handled at Cloudflare edge (PRIMARY) + Redis app limiters (SECONDARY)',
    textLimits: `${config.limits.textMinLength}-${config.limits.textMaxLength} chars`,
    maxSubmissions: config.limits.maxSubmissions,
  });

  try {
    const { startOutboxProcessor } = require('./jobs/outboxProcessor');

    // We support multiple possible return shapes safely:
    // - function (stop)
    // - { stop() }
    // - interval-like object with .unref/.ref (not ideal), but we still can clearInterval if it looks like one
    const started = startOutboxProcessor(30000);

    if (typeof started === 'function') {
      stopOutboxProcessor = started;
    } else if (started && typeof started.stop === 'function') {
      stopOutboxProcessor = () => started.stop();
    } else if (started && typeof started === 'object' && typeof started.hasRef === 'function') {
      // looks like a Timer, best-effort
      stopOutboxProcessor = () => clearInterval(started);
    }

    logger.info({ event: 'boot.outbox_processor_started' }, 'Outbox processor started successfully');
  } catch (error) {
    logger.error(
      { event: 'boot.outbox_processor_failed', error: error.message },
      'Failed to start outbox processor'
    );
  }
});

// STEP 10: Graceful Shutdown System (step-based + draining + ordered cleanups)

const { registerShutdownSystem } = require('./bootstrap/shutdown');

// Cleanups run in order (more predictable)
const cleanups = [];

// 1) Stop outbox processor FIRST (prevents new background work during shutdown)
cleanups.push({
  name: 'outbox.stop',
  fn: async () => {
    try {
      if (typeof stopOutboxProcessor === 'function') {
        await stopOutboxProcessor();
      }
    } catch {
      // Shutdown continues with Redis and socket cleanup even if the outbox stop already failed.
    }
  },
});

// 2) Redis shutdown (use redisClient helpers so “disconnect” logs are not errors on purpose)
let markRedisShuttingDown = null;
let disconnectRedis = null;

try {
  const redisMod = require('./utils/redisClient');

  if (redisMod && typeof redisMod.markShuttingDown === 'function') {
    markRedisShuttingDown = redisMod.markShuttingDown;
  }
  if (redisMod && typeof redisMod.disconnectRedis === 'function') {
    disconnectRedis = redisMod.disconnectRedis;
  }
} catch {
  // Some minimal deployments omit Redis, so shutdown can continue without its helpers.
}

// Prefer disconnectRedis() (it should flip shutdown mode + quit safely)
if (typeof disconnectRedis === 'function') {
  cleanups.push({
    name: 'redis.quit',
    fn: async () => {
      try {
        await disconnectRedis();
      } catch {
        // The shutdown coordinator still needs to run its remaining cleanup tasks.
      }
    },
  });
} else if (redisClient && typeof redisClient.quit === 'function') {
  // Fallback if helper isn't present yet
  cleanups.push({
    name: 'redis.quit',
    fn: async () => {
      try {
        await redisClient.quit();
      } catch {
        // The shutdown coordinator still needs to run its remaining cleanup tasks.
      }
    },
  });
}

registerShutdownSystem({
  server,
  logger,
  config,
  consoleLogger,
  cleanups,
  requestTracker,
  onShutdownStart: () => {
    app.locals.isShuttingDown = true;

    // Critical: tells redisClient module “shutdown is intentional”
    // so its 'end' event can log INFO instead of ERROR.
    try {
      if (typeof markRedisShuttingDown === 'function') {
        markRedisShuttingDown('app_shutdown');
      }
    } catch {
      // Redis may already be gone; the remaining shutdown work must still proceed.
    }

    // If you ever add readiness, this is where you flip readiness=false.
  },
});

// Export for testing
module.exports = app;
