// I am keeping this line here because the surrounding zorvalon.js workflow expects this value or operation before it continues.
'use strict';

// File: server/zorvalon.js
// Description: Entry point for application server - refactored and modular
// High-level boot order (see detailed comment below):
//   Express → preflight OPTIONS → toggles → trust proxy/canonical host →
//   core security + health/degrade/cors/rate limiters → Stripe webhook + parsers + cookies →
//   app config → auth bridge + default-deny → views/static → routes → errors → shutdown
// Notes: Console logs mark important checkpoints for audit and debugging.

const express = require('express');
// I am loading `path` into `path` so this file can reuse that dependency below.
const path = require('path');

// Install console shim early to intercept JSON event logs
try {
  // I am loading `./utils/consoleLogger` into `installJsonLogShim` so this file can reuse that dependency below.
  const { installJsonLogShim } = require('./utils/consoleLogger');
  // I am calling this helper here so the current workflow performs this step before it moves on.
  installJsonLogShim();
// I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
} catch (err) {
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.error('Failed to install console shim:', err.message);
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// Application Configuration and Dependencies
let config, logConfigSummary, csrfLite, requestIdMiddleware, logger, consoleLogger;

// I am starting a guarded operation here because a request, parser, or dependency used below may fail.
try {
  // I am loading `./config` into `configModule` so this file can reuse that dependency below.
  const configModule = require('./config');
  // I am keeping this line here because the surrounding zorvalon.js workflow expects this value or operation before it continues.
  config = configModule.config;
  // I am keeping this line here because the surrounding zorvalon.js workflow expects this value or operation before it continues.
  logConfigSummary = configModule.logConfigSummary;
// I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
} catch (error) {
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.error('Failed to load config module:', error.message);
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if ((process.env.NODE_ENV || 'development') !== 'test') process.exitCode = 1;
  // I am stopping this path with the existing error here because the caller should not continue with an invalid result.
  throw error;
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am starting a guarded operation here because a request, parser, or dependency used below may fail.
try {
  // I am keeping this line here because the surrounding zorvalon.js workflow expects this value or operation before it continues.
  csrfLite = require('./middleware/csrfLite');
// I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
} catch (error) {
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.error('FATAL: Cannot load CSRF middleware:', error);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.error('CRITICAL: CSRF protection is mandatory. Server cannot start.');
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if ((process.env.NODE_ENV || 'development') !== 'test') process.exitCode = 1;
  // I am stopping this path with the existing error here because the caller should not continue with an invalid result.
  throw error;
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am starting a guarded operation here because a request, parser, or dependency used below may fail.
try {
  // I am keeping this line here because the surrounding zorvalon.js workflow expects this value or operation before it continues.
  requestIdMiddleware = require('./middleware/requestId');
// I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
} catch (error) {
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.error('FATAL: Cannot load request ID middleware:', error);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.error('CRITICAL: Request tracking is mandatory for audit trails. Server cannot start.');
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if ((process.env.NODE_ENV || 'development') !== 'test') process.exitCode = 1;
  // I am stopping this path with the existing error here because the caller should not continue with an invalid result.
  throw error;
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am starting a guarded operation here because a request, parser, or dependency used below may fail.
try {
  // I am keeping this line here because the surrounding zorvalon.js workflow expects this value or operation before it continues.
  logger = require('./utils/logger');
  // I am calling this helper here so the current workflow performs this step before it moves on.
  logger.info({ event: 'boot.module_loaded', module: 'logger' }, 'Logger module loaded successfully');
// I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
} catch (error) {
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.error('Failed to load logger module:', error.message);
  // I am keeping this line here because the surrounding zorvalon.js workflow expects this value or operation before it continues.
  logger = { info: () => {}, error: () => {}, warn: () => {} };
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am starting a guarded operation here because a request, parser, or dependency used below may fail.
try {
  // I am keeping this line here because the surrounding zorvalon.js workflow expects this value or operation before it continues.
  consoleLogger = require('./utils/consoleLogger');
  // I am calling this helper here so the current workflow performs this step before it moves on.
  logger.info(
    // I am keeping this line here because the surrounding zorvalon.js workflow expects this value or operation before it continues.
    { event: 'boot.module_loaded', module: 'consoleLogger' },
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    'Console logger module loaded successfully'
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  );
// I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
} catch (error) {
  // I am calling this helper here so the current workflow performs this step before it moves on.
  logger.error(
    // I am keeping this line here because the surrounding zorvalon.js workflow expects this value or operation before it continues.
    { event: 'boot.module_load_failed', module: 'consoleLogger', error: error.message },
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    'Failed to load console logger module'
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  );
  // I am keeping this line here because the surrounding zorvalon.js workflow expects this value or operation before it continues.
  consoleLogger = {
    // I am keeping the `formatConfigSummary` field in this object so the receiving code can read that value by its expected name.
    formatConfigSummary: () => {},
    // I am keeping the `formatMiddlewareRegistration` field in this object so the receiving code can read that value by its expected name.
    formatMiddlewareRegistration: () => {},
    // I am keeping the `formatServerStartup` field in this object so the receiving code can read that value by its expected name.
    formatServerStartup: () => {},
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  };
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// Server toggles (feature flags for ops)
let toggles;
// I am starting a guarded operation here because a request, parser, or dependency used below may fail.
try {
  // I am keeping this line here because the surrounding zorvalon.js workflow expects this value or operation before it continues.
  toggles = require('./config/toggles');
  // I am calling this helper here so the current workflow performs this step before it moves on.
  logger.info({ event: 'boot.module_loaded', module: 'toggles' }, 'Server toggles loaded successfully');
// I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
} catch (error) {
  // I am calling this helper here so the current workflow performs this step before it moves on.
  logger.error(
    // I am keeping this line here because the surrounding zorvalon.js workflow expects this value or operation before it continues.
    { event: 'boot.module_load_failed', module: 'toggles', error: error.message },
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    'Failed to load toggles module'
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  );
  // I am keeping this line here because the surrounding zorvalon.js workflow expects this value or operation before it continues.
  toggles = {
    // I am keeping the `env` field in this object so the receiving code can read that value by its expected name.
    env: 'production',
    // I am keeping the `logLevel` field in this object so the receiving code can read that value by its expected name.
    logLevel: 'info',
    // I am keeping the `blockCmsScans` field in this object so the receiving code can read that value by its expected name.
    blockCmsScans: false,
    // I am keeping the `corsDebug` field in this object so the receiving code can read that value by its expected name.
    corsDebug: false,
    // I am keeping the `exposeDebugRoutes` field in this object so the receiving code can read that value by its expected name.
    exposeDebugRoutes: false,
    // I am keeping the `logLegacyStaticHits` field in this object so the receiving code can read that value by its expected name.
    logLegacyStaticHits: false,
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  };
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// New security middleware (wired via bootstrap/coreMiddleware)
const methodGuard = require('./middleware/methodGuard');
// I am loading `./middleware/credentialGuard` into `credentialGuard` so this file can reuse that dependency below.
const credentialGuard = require('./middleware/credentialGuard');
// I am loading `./middleware/securityHeaders` into `generateCspNonce` so this file can reuse that dependency below.
const { generateCspNonce, securityHeaders } = require('./middleware/securityHeaders');
// I am loading `./middleware/cacheControl` into `cacheControl` so this file can reuse that dependency below.
const cacheControl = require('./middleware/cacheControl');
// I am loading `./middleware/trustProxyIp` into `trustProxyIp` so this file can reuse that dependency below.
const trustProxyIp = require('./middleware/trustProxyIp');
// I am loading `./middleware/corsAllowlist` into `corsAllowlist` so this file can reuse that dependency below.
const corsAllowlist = require('./middleware/corsAllowlist');
// I am saving this value here so the nearby steps can reuse the same value without rebuilding it each time.
const {
  // I am keeping this line here because the surrounding zorvalon.js workflow expects this value or operation before it continues.
  generalLimiter,
  // I am keeping this line here because the surrounding zorvalon.js workflow expects this value or operation before it continues.
  loginLimiter,
  // I am keeping this line here because the surrounding zorvalon.js workflow expects this value or operation before it continues.
  registerLimiter,
  // I am keeping this line here because the surrounding zorvalon.js workflow expects this value or operation before it continues.
  logoutLimiter,
  // I am keeping this line here because the surrounding zorvalon.js workflow expects this value or operation before it continues.
  cookieSetLimiter,
// I am keeping this line here because the surrounding zorvalon.js workflow expects this value or operation before it continues.
} = require('./middleware/rateLimiter');

// ============================================================
// STEP 1: Application Initialization
// ============================================================

const app = express();
// I am calling this helper here so the current workflow performs this step before it moves on.
app.disable('x-powered-by');

// Shutdown posture flags (used by readiness/guards if you add them later)
app.locals.isShuttingDown = false;

// Initialize Redis status tracking
app.locals.redisReady = false;
// I am keeping this line here because the surrounding zorvalon.js workflow expects this value or operation before it continues.
app.locals.rateLimitStoreReady = false;

// Trust proxy for Cloudflare/ALB hops (from config)
app.set('trust proxy', config.server.trustProxyHops);

// Canonical host redirect (optional)
if (config.server.canonicalHost) {
  // I am loading `./lib/authCookie` into `isHttps` so this file can reuse that dependency below.
  const { isHttps } = require('./lib/authCookie');
  // I am attaching this middleware or router here so matching requests pass through it in the existing Express order.
  app.use((req, res, next) => {
    // I am saving `targetHost` here so the nearby steps can reuse the same value without rebuilding it each time.
    const targetHost = config.server.canonicalHost.trim().toLowerCase();
    // I am saving `reqHost` here so the nearby steps can reuse the same value without rebuilding it each time.
    const reqHost = String(req.hostname || req.get('host') || '').toLowerCase();
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (targetHost && reqHost && reqHost !== targetHost) {
      // I am saving `proto` here so the nearby steps can reuse the same value without rebuilding it each time.
      const proto = isHttps(req) ? 'https' : 'http';
      // This return sends the completed value or response back to the code that called this function.
      return res.redirect(301, `${proto}://${targetHost}${req.originalUrl || req.url || ''}`);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    // I am calling this helper here so the current workflow performs this step before it moves on.
    next();
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * ABSOLUTE TOP: Preflight short-circuit (ALLOWLISTED)
 *
 * IMPORTANT:
 * - Do NOT reflect arbitrary Origin.
 * - Only allow Origins that your config would allow.
 */
function isAllowedPreflightOrigin(origin) {
  // I am saving `env` here so the nearby steps can reuse the same value without rebuilding it each time.
  const env = config?.server?.nodeEnv || process.env.NODE_ENV || 'development';
  // I am saving `allowed` here so the nearby steps can reuse the same value without rebuilding it each time.
  const allowed = Array.isArray(config?.security?.allowedOrigins) ? config.security.allowedOrigins : [];

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (typeof origin !== 'string' || !origin) return false;

  // I am saving `o` here so the nearby steps can reuse the same value without rebuilding it each time.
  const o = origin.trim();
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (allowed.includes(o)) return true;

  // Dev convenience: allow local origins when not production
  if (env !== 'production') {
    // I am saving `localRe` here so the nearby steps can reuse the same value without rebuilding it each time.
    const localRe = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (localRe.test(o)) return true;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // This return sends the completed value or response back to the code that called this function.
  return false;
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am attaching this middleware or router here so matching requests pass through it in the existing Express order.
app.use((req, res, next) => {
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (req.method !== 'OPTIONS') return next();

  // I am saving `origin` here so the nearby steps can reuse the same value without rebuilding it each time.
  const origin = req.get('Origin');
  // I am saving `acrh` here so the nearby steps can reuse the same value without rebuilding it each time.
  const acrh = req.get('Access-Control-Request-Headers') || 'Content-Type, Authorization, X-CSRF-Token';
  // I am saving `acrm` here so the nearby steps can reuse the same value without rebuilding it each time.
  const acrm = req.get('Access-Control-Request-Method') || 'GET,POST,PUT,PATCH,DELETE,OPTIONS';

  // I am building or sending the Express response here with the status, data, or page already chosen by this route.
  res.set('Vary', 'Origin, Access-Control-Request-Headers, Access-Control-Request-Method');

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (origin) {
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!isAllowedPreflightOrigin(origin)) {
      // This return sends the completed value or response back to the code that called this function.
      return res.status(403).end();
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    // I am building or sending the Express response here with the status, data, or page already chosen by this route.
    res.set('Access-Control-Allow-Origin', origin);
    // I am building or sending the Express response here with the status, data, or page already chosen by this route.
    res.set('Access-Control-Allow-Credentials', 'true');
  // This alternative runs only when the condition above did not use its first path.
  } else {
    // I am building or sending the Express response here with the status, data, or page already chosen by this route.
    res.set('Access-Control-Allow-Origin', '*');
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am building or sending the Express response here with the status, data, or page already chosen by this route.
  res.set('Access-Control-Allow-Methods', acrm);
  // I am building or sending the Express response here with the status, data, or page already chosen by this route.
  res.set('Access-Control-Allow-Headers', acrh);
  // I am building or sending the Express response here with the status, data, or page already chosen by this route.
  res.set('Access-Control-Max-Age', '600');

  // This return sends the completed value or response back to the code that called this function.
  return res.status(204).end();
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
});

// ------------------------------------------------------------------
// Request tracker (for shutdown drain diagnostics)
// Mount AFTER OPTIONS short-circuit so it doesn’t count preflights.
// ------------------------------------------------------------------
let requestTracker = null;
// I am starting a guarded operation here because a request, parser, or dependency used below may fail.
try {
  // I am loading `./bootstrap/shutdown` into `shutdownModule` so this file can reuse that dependency below.
  const shutdownModule = require('./bootstrap/shutdown');
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (typeof shutdownModule.createRequestTracker === 'function') {
    // I am keeping this line here because the surrounding zorvalon.js workflow expects this value or operation before it continues.
    requestTracker = shutdownModule.createRequestTracker({ logger });
    // I am attaching this middleware or router here so matching requests pass through it in the existing Express order.
    app.use(requestTracker.middleware);
  // This alternative runs only when the condition above did not use its first path.
  } else {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.warn(
      // I am keeping this line here because the surrounding zorvalon.js workflow expects this value or operation before it continues.
      { event: 'boot.request_tracker_unavailable' },
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      'createRequestTracker not exported; request draining diagnostics disabled'
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    );
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
} catch (err) {
  // I am calling this helper here so the current workflow performs this step before it moves on.
  logger.warn(
    // I am keeping this line here because the surrounding zorvalon.js workflow expects this value or operation before it continues.
    { event: 'boot.request_tracker_load_failed', error: err.message },
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    'Failed to initialize request tracker; request draining diagnostics disabled'
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  );
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * STEP 1.5: Toggle-Based Middleware
 */

// Block common CMS scanner paths (WordPress, PHP, etc.)
if (toggles.blockCmsScans) {
  // I am loading `./middleware/blockCmsScans` into `blockCmsScans` so this file can reuse that dependency below.
  const blockCmsScans = require('./middleware/blockCmsScans');
  // I am attaching this middleware or router here so matching requests pass through it in the existing Express order.
  app.use(blockCmsScans());
  // I am calling this helper here so the current workflow performs this step before it moves on.
  logger.info({ event: 'boot.toggle_enabled', toggle: 'blockCmsScans' }, 'Toggle: CMS scan blocking enabled');
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am calling this helper here so the current workflow performs this step before it moves on.
logger.info(
  // I am keeping this line here because the surrounding zorvalon.js workflow expects this value or operation before it continues.
  { event: 'boot.server_starting', appName: config.branding.appName },
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  `${config.branding.appName} server starting...`
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
);

// I am starting a guarded operation here because a request, parser, or dependency used below may fail.
try {
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (typeof logConfigSummary === 'function') {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logConfigSummary();
  // This alternative runs only when the condition above did not use its first path.
  } else {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.warn(
      // I am keeping this line here because the surrounding zorvalon.js workflow expects this value or operation before it continues.
      { event: 'boot.config_summary_unavailable' },
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      '[couplebinder] logConfigSummary is not a function; skipping config summary log'
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    );
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
} catch (err) {
  // I am calling this helper here so the current workflow performs this step before it moves on.
  logger.error({ event: 'boot.config_summary_failed', error: err.message }, '[couplebinder] Failed to log config summary');
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// ============================================================
// STEP 3: Redis Client Creation and Connection
// ============================================================

let redisClient = null;

// IMPORTANT: default noop so async initRedis can safely call it immediately.
let updateRedisStatus = () => {};

// I am starting a guarded operation here because a request, parser, or dependency used below may fail.
try {
  // I am loading `./routes/health` into `updateRedisStatus` so this file can reuse that dependency below.
  const { updateRedisStatus: updateStatus } = require('./routes/health');
  // I am keeping this line here because the surrounding zorvalon.js workflow expects this value or operation before it continues.
  updateRedisStatus = updateStatus;
// I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
} catch {
  // keep noop
}

// I am starting a guarded operation here because a request, parser, or dependency used below may fail.
try {
  // I am loading `./utils/redisClient` into `client` so this file can reuse that dependency below.
  const { client, connectRedis } = require('./utils/redisClient');
  // I am keeping this line here because the surrounding zorvalon.js workflow expects this value or operation before it continues.
  redisClient = client;
  // I am calling this helper here so the current workflow performs this step before it moves on.
  logger.info({ event: 'boot.module_loaded', module: 'redisClient' }, 'Redis client module loaded successfully');

  // I am saving `initRedis` here so the nearby steps can reuse the same value without rebuilding it each time.
  const initRedis = async () => {
    // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
    try {
      // I am waiting for this asynchronous step here so the next line does not use its result before it is ready.
      await connectRedis();
      // I am keeping this line here because the surrounding zorvalon.js workflow expects this value or operation before it continues.
      app.locals.redisReady = true;
      // I am keeping this line here because the surrounding zorvalon.js workflow expects this value or operation before it continues.
      app.locals.rateLimitStoreReady = true;
      // I am calling this helper here so the current workflow performs this step before it moves on.
      updateRedisStatus(true, new Date().toISOString());
      // I am calling this helper here so the current workflow performs this step before it moves on.
      logger.info({ event: 'boot.redis_connected' }, 'Redis connection established successfully');
    // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
    } catch (error) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      logger.error({ event: 'boot.redis_connection_failed', error: error.message }, 'Redis connection failed');
      // I am calling this helper here so the current workflow performs this step before it moves on.
      logger.info({ event: 'boot.redis_degrade' }, 'Redis-dependent features will fall back or degrade gracefully');
      // I am keeping this line here because the surrounding zorvalon.js workflow expects this value or operation before it continues.
      app.locals.redisReady = false;
      // I am keeping this line here because the surrounding zorvalon.js workflow expects this value or operation before it continues.
      app.locals.rateLimitStoreReady = false;
      // I am calling this helper here so the current workflow performs this step before it moves on.
      updateRedisStatus(false, new Date().toISOString());
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  };

  initRedis(); // non-blocking

  // I am defining this small callback here so the surrounding API can run it with the value it supplies.
  redisClient.on('connect', () => {
    // I am keeping this line here because the surrounding zorvalon.js workflow expects this value or operation before it continues.
    app.locals.redisReady = true;
    // I am keeping this line here because the surrounding zorvalon.js workflow expects this value or operation before it continues.
    app.locals.rateLimitStoreReady = true;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });

  // I am defining this small callback here so the surrounding API can run it with the value it supplies.
  redisClient.on('error', () => {
    // I am keeping this line here because the surrounding zorvalon.js workflow expects this value or operation before it continues.
    app.locals.redisReady = false;
    // I am keeping this line here because the surrounding zorvalon.js workflow expects this value or operation before it continues.
    app.locals.rateLimitStoreReady = false;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });

  // I am defining this small callback here so the surrounding API can run it with the value it supplies.
  redisClient.on('end', () => {
    // I am keeping this line here because the surrounding zorvalon.js workflow expects this value or operation before it continues.
    app.locals.redisReady = false;
    // I am keeping this line here because the surrounding zorvalon.js workflow expects this value or operation before it continues.
    app.locals.rateLimitStoreReady = false;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });
// I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
} catch (error) {
  // I am calling this helper here so the current workflow performs this step before it moves on.
  logger.error(
    // I am keeping this line here because the surrounding zorvalon.js workflow expects this value or operation before it continues.
    { event: 'boot.module_load_failed', module: 'redisClient', error: error.message },
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    'Redis client module load failed'
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  );
  // I am calling this helper here so the current workflow performs this step before it moves on.
  logger.info({ event: 'boot.redis_unavailable' }, 'Continuing without Redis...');
  // I am keeping this line here because the surrounding zorvalon.js workflow expects this value or operation before it continues.
  app.locals.redisReady = false;
  // I am keeping this line here because the surrounding zorvalon.js workflow expects this value or operation before it continues.
  app.locals.rateLimitStoreReady = false;
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// Maintenance Guard factory (mounted in registerCoreMiddleware)
const createMaintenanceGuard = require('./middleware/maintenanceGuard');

// Degrade guard
logger.info({ event: 'boot.middleware_ready', middleware: 'degradeGuard' }, 'Security: Redis degrade guard ready (mounted once, early)');

// ============================================================
// STEP 4: Security and Core Middleware Registration
// ============================================================

const { registerCoreMiddleware } = require('./bootstrap/coreMiddleware');
// I am loading `./middleware/enforceHttps` into `enforceHttps` so this file can reuse that dependency below.
const enforceHttps = require('./middleware/enforceHttps');
// I am loading `./middleware/cookieGuardian` into `parseCookies` so this file can reuse that dependency below.
const parseCookies = require('./middleware/cookieGuardian');
// I am loading `./middleware/appConfig` into `appConfig` so this file can reuse that dependency below.
const appConfig = require('./middleware/appConfig');
// I am loading `./middleware/authBridge` into `authBridge` so this file can reuse that dependency below.
const authBridge = require('./middleware/authBridge');
// I am loading `./middleware/requireAuth` into `requireAuth` so this file can reuse that dependency below.
const { requireAuth } = require('./middleware/requireAuth');
// I am loading `./routes/stripeWebhook` into `mountStripeWebhook` so this file can reuse that dependency below.
const { mountStripeWebhook } = require('./routes/stripeWebhook');
// I am loading `./routes/health` into `router` so this file can reuse that dependency below.
const { router: healthRouter } = require('./routes/health');
// I am loading `./middleware/ipFirewall` into `ipFirewall` so this file can reuse that dependency below.
const { ipFirewall } = require('./middleware/ipFirewall');
// I am loading `./middleware/degradeGuard` into `degradeGuard` so this file can reuse that dependency below.
const degradeGuard = require('./middleware/degradeGuard');

// I am calling this helper here so the current workflow performs this step before it moves on.
registerCoreMiddleware({
  // I am keeping this line here because the surrounding zorvalon.js workflow expects this value or operation before it continues.
  app,
  // I am keeping this line here because the surrounding zorvalon.js workflow expects this value or operation before it continues.
  config,
  // I am keeping this line here because the surrounding zorvalon.js workflow expects this value or operation before it continues.
  toggles,
  // I am keeping this line here because the surrounding zorvalon.js workflow expects this value or operation before it continues.
  logger,
  // I am keeping this line here because the surrounding zorvalon.js workflow expects this value or operation before it continues.
  consoleLogger,
  // I am keeping this line here because the surrounding zorvalon.js workflow expects this value or operation before it continues.
  csrfLite,
  // I am keeping this line here because the surrounding zorvalon.js workflow expects this value or operation before it continues.
  corsAllowlist,
  // I am keeping this line here because the surrounding zorvalon.js workflow expects this value or operation before it continues.
  trustProxyIp,
  // I am keeping this line here because the surrounding zorvalon.js workflow expects this value or operation before it continues.
  cacheControl,
  // I am keeping this line here because the surrounding zorvalon.js workflow expects this value or operation before it continues.
  methodGuard,
  // I am keeping this line here because the surrounding zorvalon.js workflow expects this value or operation before it continues.
  credentialGuard,
  // I am keeping this line here because the surrounding zorvalon.js workflow expects this value or operation before it continues.
  generateCspNonce,
  // I am keeping this line here because the surrounding zorvalon.js workflow expects this value or operation before it continues.
  securityHeaders,
  // I am keeping this line here because the surrounding zorvalon.js workflow expects this value or operation before it continues.
  enforceHttps,
  // I am keeping the `corsDebugMiddleware` field in this object so the receiving code can read that value by its expected name.
  corsDebugMiddleware: require('./middleware/corsDebug'),
  // I am keeping the `rateLimiters` field in this object so the receiving code can read that value by its expected name.
  rateLimiters: {
    // I am keeping this line here because the surrounding zorvalon.js workflow expects this value or operation before it continues.
    generalLimiter,
    // I am keeping this line here because the surrounding zorvalon.js workflow expects this value or operation before it continues.
    loginLimiter,
    // I am keeping this line here because the surrounding zorvalon.js workflow expects this value or operation before it continues.
    registerLimiter,
    // I am keeping this line here because the surrounding zorvalon.js workflow expects this value or operation before it continues.
    logoutLimiter,
    // I am keeping this line here because the surrounding zorvalon.js workflow expects this value or operation before it continues.
    cookieSetLimiter,
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  },
  // I am keeping this line here because the surrounding zorvalon.js workflow expects this value or operation before it continues.
  authBridge,
  // I am keeping this line here because the surrounding zorvalon.js workflow expects this value or operation before it continues.
  requireAuth,
  // I am keeping the `cookieGuardian` field in this object so the receiving code can read that value by its expected name.
  cookieGuardian: parseCookies,
  // I am keeping this line here because the surrounding zorvalon.js workflow expects this value or operation before it continues.
  appConfig,
  // I am keeping this line here because the surrounding zorvalon.js workflow expects this value or operation before it continues.
  mountStripeWebhook,
  // I am keeping this line here because the surrounding zorvalon.js workflow expects this value or operation before it continues.
  degradeGuard,
  // I am keeping this line here because the surrounding zorvalon.js workflow expects this value or operation before it continues.
  ipFirewall,
  // I am keeping this line here because the surrounding zorvalon.js workflow expects this value or operation before it continues.
  createMaintenanceGuard,
  // I am keeping this line here because the surrounding zorvalon.js workflow expects this value or operation before it continues.
  healthRouter,
  // I am keeping this line here because the surrounding zorvalon.js workflow expects this value or operation before it continues.
  requestIdMiddleware,
  // I am keeping this line here because the surrounding zorvalon.js workflow expects this value or operation before it continues.
  redisClient,
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
});

// ============================================================
// STEP 5: View Engine and Static Assets
// ============================================================

app.set('view engine', 'ejs');
// I am calling this helper here so the current workflow performs this step before it moves on.
app.set('views', path.resolve(__dirname, 'ejs'));

// This check helps me choose or stop the next path before any work that depends on this condition runs.
if (config?.server?.nodeEnv === 'production') {
  // I am calling this helper here so the current workflow performs this step before it moves on.
  app.set('view cache', true);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  logger.info({ event: 'boot.view_cache_enabled' }, 'View caching enabled for production');
// This alternative runs only when the condition above did not use its first path.
} else {
  // I am calling this helper here so the current workflow performs this step before it moves on.
  app.set('view cache', false);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  logger.info(
    // I am keeping this line here because the surrounding zorvalon.js workflow expects this value or operation before it continues.
    { event: 'boot.view_cache_disabled', env: config?.server?.nodeEnv || 'development' },
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    'View caching disabled for development'
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  );
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am saving `PUBLIC_DIR_PRIMARY` here so the nearby steps can reuse the same value without rebuilding it each time.
const PUBLIC_DIR_PRIMARY = path.resolve(__dirname, '../public');
// I am saving `PUBLIC_DIR_LEGACY` here so the nearby steps can reuse the same value without rebuilding it each time.
const PUBLIC_DIR_LEGACY = path.resolve(__dirname, 'public');

// I am calling this helper here so the current workflow performs this step before it moves on.
logger.info(
  // I am keeping this line here because the surrounding zorvalon.js workflow expects this value or operation before it continues.
  { event: 'boot.static_paths', primary: PUBLIC_DIR_PRIMARY, legacy: PUBLIC_DIR_LEGACY },
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'Static files configured'
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
);

// I am keeping `mountStatic` as a named helper so the surrounding workflow can call this step when it needs it.
function mountStatic(prefix, subdir, maxAge, immutable = false) {
  // I am saving `opts` here so the nearby steps can reuse the same value without rebuilding it each time.
  const opts = { etag: true, maxAge, fallthrough: true };
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (immutable) opts.immutable = true;

  // I am attaching this middleware or router here so matching requests pass through it in the existing Express order.
  app.use(prefix, express.static(path.join(PUBLIC_DIR_PRIMARY, subdir), opts));

  // Legacy second; optional logging only if enabled
  app.use(
    // I am keeping this line here because the surrounding zorvalon.js workflow expects this value or operation before it continues.
    prefix,
    // I am defining this small callback here so the surrounding API can run it with the value it supplies.
    (req, res, next) => {
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (!toggles.logLegacyStaticHits) return next();

      // I am loading `fs` into `fs` so this file can reuse that dependency below.
      const fs = require('fs');
      // I am saving `filePath` here so the nearby steps can reuse the same value without rebuilding it each time.
      const filePath = req.path.replace(prefix, '');
      // I am saving `legacyPath` here so the nearby steps can reuse the same value without rebuilding it each time.
      const legacyPath = path.join(PUBLIC_DIR_LEGACY, subdir, filePath);
      // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
      try {
        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (fs.existsSync(legacyPath) && fs.statSync(legacyPath).isFile()) {
          // I am calling this helper here so the current workflow performs this step before it moves on.
          logger.info(
            // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
            {
              // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
              event: 'legacy.static_path_used',
              // I am keeping the `url` field in this object so the receiving code can read that value by its expected name.
              url: req.url,
              // I am keeping the `pathRoot` field in this object so the receiving code can read that value by its expected name.
              pathRoot: '/server/public',
              // I am keeping this line here because the surrounding zorvalon.js workflow expects this value or operation before it continues.
              subdir,
            // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
            },
            // I am listing this entry here because the surrounding collection processes each allowed value in order.
            'Legacy static asset path served'
          // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
          );
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }
      // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
      } catch {
        // ignore
      }
      // I am calling this helper here so the current workflow performs this step before it moves on.
      next();
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    },
    // I am calling this helper here so the current workflow performs this step before it moves on.
    express.static(path.join(PUBLIC_DIR_LEGACY, subdir), opts)
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  );
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am calling this helper here so the current workflow performs this step before it moves on.
mountStatic('/images', 'images', '30d', true);
// I am calling this helper here so the current workflow performs this step before it moves on.
mountStatic('/css', 'css', '7d');
// I am calling this helper here so the current workflow performs this step before it moves on.
mountStatic('/js', 'js', '7d');

// I am attaching this middleware or router here so matching requests pass through it in the existing Express order.
app.use(express.static(PUBLIC_DIR_PRIMARY, { etag: true, maxAge: '7d', fallthrough: true }));

// I am attaching this middleware or router here so matching requests pass through it in the existing Express order.
app.use(
  // I am defining this small callback here so the surrounding API can run it with the value it supplies.
  (req, res, next) => {
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!toggles.logLegacyStaticHits) return next();

    // I am loading `fs` into `fs` so this file can reuse that dependency below.
    const fs = require('fs');
    // I am saving `legacyPath` here so the nearby steps can reuse the same value without rebuilding it each time.
    const legacyPath = path.join(PUBLIC_DIR_LEGACY, req.path);
    // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
    try {
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (fs.existsSync(legacyPath) && fs.statSync(legacyPath).isFile()) {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        logger.info(
          // I am keeping this line here because the surrounding zorvalon.js workflow expects this value or operation before it continues.
          { event: 'legacy.static_path_used', url: req.url, pathRoot: '/server/public' },
          // I am listing this entry here because the surrounding collection processes each allowed value in order.
          'Legacy static asset path served'
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        );
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
    } catch {
      // ignore
    }
    // I am calling this helper here so the current workflow performs this step before it moves on.
    next();
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  },
  // I am calling this helper here so the current workflow performs this step before it moves on.
  express.static(PUBLIC_DIR_LEGACY, { etag: true, maxAge: '7d', fallthrough: true })
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
);

// This registers the GET `/favicon.ico` route so Express can send matching requests through the handlers listed here.
app.get('/favicon.ico', (req, res) => {
  // I am calling this helper here so the current workflow performs this step before it moves on.
  res.sendFile(path.resolve(__dirname, '../public/images/favicon.ico'));
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
});

// I am defining this small callback here so the surrounding API can run it with the value it supplies.
app.get(['/images/*', '/css/*', '/js/*', '/robots.txt'], (req, res) => {
  // I am building or sending the Express response here with the status, data, or page already chosen by this route.
  res.status(404).end();
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
});

// I am calling this helper here so the current workflow performs this step before it moves on.
consoleLogger.formatMiddlewareRegistration('View engine and static assets');

// ============================================================
// STEP 7: Routes Registration
// ============================================================

const { registerRoutes } = require('./bootstrap/routes');

// I am calling this helper here so the current workflow performs this step before it moves on.
registerRoutes({
  // I am keeping this line here because the surrounding zorvalon.js workflow expects this value or operation before it continues.
  app,
  // I am keeping this line here because the surrounding zorvalon.js workflow expects this value or operation before it continues.
  config,
  // I am keeping this line here because the surrounding zorvalon.js workflow expects this value or operation before it continues.
  toggles,
  // I am keeping this line here because the surrounding zorvalon.js workflow expects this value or operation before it continues.
  requireAuth,
  // I am keeping this line here because the surrounding zorvalon.js workflow expects this value or operation before it continues.
  logger,
  // I am keeping this line here because the surrounding zorvalon.js workflow expects this value or operation before it continues.
  consoleLogger,
  // I am keeping this line here because the surrounding zorvalon.js workflow expects this value or operation before it continues.
  csrfLite,
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
});

// I am calling this helper here so the current workflow performs this step before it moves on.
consoleLogger.formatMiddlewareRegistration('Routes');

// ============================================================
// STEP 8: Error Handling
// ============================================================

const { registerErrorHandlers } = require('./bootstrap/errors');
// I am calling this helper here so the current workflow performs this step before it moves on.
registerErrorHandlers({ app, logger, config, consoleLogger });

// ============================================================
// STEP 9: Server Startup
// ============================================================

const PORT = config.server.port;
// I am saving `HOST` here so the nearby steps can reuse the same value without rebuilding it each time.
const HOST = config.server.host;

// Hold a stop handle for the outbox processor (so shutdown can stop it first)
let stopOutboxProcessor = null;

// I am saving `server` here so the nearby steps can reuse the same value without rebuilding it each time.
const server = app.listen(PORT, HOST, () => {
  // I am calling this helper here so the current workflow performs this step before it moves on.
  consoleLogger.formatServerStartup({
    // I am keeping the `host` field in this object so the receiving code can read that value by its expected name.
    host: HOST,
    // I am keeping the `port` field in this object so the receiving code can read that value by its expected name.
    port: PORT,
    // I am keeping the `nodeEnv` field in this object so the receiving code can read that value by its expected name.
    nodeEnv: config.server.nodeEnv,
    // I am keeping the `database` field in this object so the receiving code can read that value by its expected name.
    database: config.database,
    // I am keeping the `rateLimit` field in this object so the receiving code can read that value by its expected name.
    rateLimit: 'handled at Cloudflare edge (PRIMARY) + Redis app limiters (SECONDARY)',
    // I am keeping the `textLimits` field in this object so the receiving code can read that value by its expected name.
    textLimits: `${config.limits.textMinLength}-${config.limits.textMaxLength} chars`,
    // I am keeping the `maxSubmissions` field in this object so the receiving code can read that value by its expected name.
    maxSubmissions: config.limits.maxSubmissions,
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });

  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // I am loading `./jobs/outboxProcessor` into `startOutboxProcessor` so this file can reuse that dependency below.
    const { startOutboxProcessor } = require('./jobs/outboxProcessor');

    // We support multiple possible return shapes safely:
    // - function (stop)
    // - { stop() }
    // - interval-like object with .unref/.ref (not ideal), but we still can clearInterval if it looks like one
    const started = startOutboxProcessor(30000);

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (typeof started === 'function') {
      // I am keeping this line here because the surrounding zorvalon.js workflow expects this value or operation before it continues.
      stopOutboxProcessor = started;
    // I am checking this next possibility only because the earlier condition did not choose its path.
    } else if (started && typeof started.stop === 'function') {
      // I am keeping this line here because the surrounding zorvalon.js workflow expects this value or operation before it continues.
      stopOutboxProcessor = () => started.stop();
    // I am checking this next possibility only because the earlier condition did not choose its path.
    } else if (started && typeof started === 'object' && typeof started.hasRef === 'function') {
      // looks like a Timer, best-effort
      stopOutboxProcessor = () => clearInterval(started);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.info({ event: 'boot.outbox_processor_started' }, 'Outbox processor started successfully');
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (error) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.error(
      // I am keeping this line here because the surrounding zorvalon.js workflow expects this value or operation before it continues.
      { event: 'boot.outbox_processor_failed', error: error.message },
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      'Failed to start outbox processor'
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    );
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
});

// ============================================================
// STEP 10: Graceful Shutdown System (step-based + draining + ordered cleanups)
// ============================================================

const { registerShutdownSystem } = require('./bootstrap/shutdown');

// Cleanups run in order (more predictable)
const cleanups = [];

// 1) Stop outbox processor FIRST (prevents new background work during shutdown)
cleanups.push({
  // I am keeping the `name` field in this object so the receiving code can read that value by its expected name.
  name: 'outbox.stop',
  // I am keeping the `fn` field in this object so the receiving code can read that value by its expected name.
  fn: async () => {
    // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
    try {
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (typeof stopOutboxProcessor === 'function') {
        // I am waiting for this asynchronous step here so the next line does not use its result before it is ready.
        await stopOutboxProcessor();
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
    } catch {
      // ignore
    }
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  },
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
});

// 2) Redis shutdown (use redisClient helpers so “disconnect” logs are not errors on purpose)
let markRedisShuttingDown = null;
// I am saving `disconnectRedis` here so the nearby steps can reuse the same value without rebuilding it each time.
let disconnectRedis = null;

// I am starting a guarded operation here because a request, parser, or dependency used below may fail.
try {
  // I am loading `./utils/redisClient` into `redisMod` so this file can reuse that dependency below.
  const redisMod = require('./utils/redisClient');

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (redisMod && typeof redisMod.markShuttingDown === 'function') {
    // I am keeping this line here because the surrounding zorvalon.js workflow expects this value or operation before it continues.
    markRedisShuttingDown = redisMod.markShuttingDown;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (redisMod && typeof redisMod.disconnectRedis === 'function') {
    // I am keeping this line here because the surrounding zorvalon.js workflow expects this value or operation before it continues.
    disconnectRedis = redisMod.disconnectRedis;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
} catch {
  // ignore (redis module not available)
}

// Prefer disconnectRedis() (it should flip shutdown mode + quit safely)
if (typeof disconnectRedis === 'function') {
  // I am calling this helper here so the current workflow performs this step before it moves on.
  cleanups.push({
    // I am keeping the `name` field in this object so the receiving code can read that value by its expected name.
    name: 'redis.quit',
    // I am keeping the `fn` field in this object so the receiving code can read that value by its expected name.
    fn: async () => {
      // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
      try {
        // I am waiting for this asynchronous step here so the next line does not use its result before it is ready.
        await disconnectRedis();
      // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
      } catch {
        // ignore
      }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    },
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });
// I am checking this next possibility only because the earlier condition did not choose its path.
} else if (redisClient && typeof redisClient.quit === 'function') {
  // Fallback if helper isn't present yet
  cleanups.push({
    // I am keeping the `name` field in this object so the receiving code can read that value by its expected name.
    name: 'redis.quit',
    // I am keeping the `fn` field in this object so the receiving code can read that value by its expected name.
    fn: async () => {
      // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
      try {
        // I am waiting for this asynchronous step here so the next line does not use its result before it is ready.
        await redisClient.quit();
      // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
      } catch {
        // ignore
      }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    },
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am calling this helper here so the current workflow performs this step before it moves on.
registerShutdownSystem({
  // I am keeping this line here because the surrounding zorvalon.js workflow expects this value or operation before it continues.
  server,
  // I am keeping this line here because the surrounding zorvalon.js workflow expects this value or operation before it continues.
  logger,
  // I am keeping this line here because the surrounding zorvalon.js workflow expects this value or operation before it continues.
  config,
  // I am keeping this line here because the surrounding zorvalon.js workflow expects this value or operation before it continues.
  consoleLogger,
  // I am keeping this line here because the surrounding zorvalon.js workflow expects this value or operation before it continues.
  cleanups,
  // I am keeping this line here because the surrounding zorvalon.js workflow expects this value or operation before it continues.
  requestTracker,
  // I am keeping the `onShutdownStart` field in this object so the receiving code can read that value by its expected name.
  onShutdownStart: () => {
    // I am keeping this line here because the surrounding zorvalon.js workflow expects this value or operation before it continues.
    app.locals.isShuttingDown = true;

    // Critical: tells redisClient module “shutdown is intentional”
    // so its 'end' event can log INFO instead of ERROR.
    try {
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (typeof markRedisShuttingDown === 'function') {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        markRedisShuttingDown('app_shutdown');
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
    } catch {
      // ignore
    }

    // If you ever add readiness, this is where you flip readiness=false.
  },
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
});

// Export for testing
module.exports = app;