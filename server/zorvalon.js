// File: server/zorvalon.js
// Description: Entry point for application server - refactored and modular
// High-level boot order (see detailed comment below):
//   Express → preflight OPTIONS → toggles → trust proxy/canonical host →
//   core security + health/degrade/cors/rate limiters → Stripe webhook + parsers + cookies →
//   app config → auth bridge + default-deny → views/static → routes → errors → shutdown
// Notes: Console logs mark important checkpoints for audit and debugging.

const express = require('express');
const path = require('path');

// Install console shim early to intercept JSON event logs
// Note: Logger not available yet, so we use console.error for this early boot error
try {
  const { installJsonLogShim } = require('./utils/consoleLogger');
  installJsonLogShim();
} catch (err) {
  // Logger not available yet - this is acceptable for early boot errors
  console.error('Failed to install console shim:', err.message);
}

// Application Configuration and Dependencies
// CRITICAL SECTION: Safe module loading to prevent crashes
let config, logConfigSummary, csrfLite, requestIdMiddleware, logger, consoleLogger;

// Note: Logger not available yet for these early boot messages
// These console calls are acceptable as they occur before logger is loaded
try {
  const configModule = require('./config');
  config = configModule.config;
  logConfigSummary = configModule.logConfigSummary;
  // Logger not available yet - acceptable for early boot
  console.log('Configuration module loaded successfully');
} catch (error) {
  console.error('Failed to load config module:', error.message);
  // Note: NODE_ENV check is allowed in global error handlers (before config loads)
  if ((process.env.NODE_ENV || 'development') !== 'test') process.exit(1);
  throw error;
}

try {
  csrfLite = require('./middleware/csrfLite');
  // Logger not available yet - acceptable for early boot
  console.log('CSRF middleware loaded successfully');
} catch (error) {
  console.error('FATAL: Cannot load CSRF middleware:', error);
  console.error('CRITICAL: CSRF protection is mandatory. Server cannot start.');
  // Note: NODE_ENV check is allowed in global error handlers (before config loads)
  if ((process.env.NODE_ENV || 'development') !== 'test') process.exit(1);
  throw error;
}

try {
  requestIdMiddleware = require('./middleware/requestId');
  // Logger not available yet - acceptable for early boot
  console.log('Request ID middleware loaded successfully');
} catch (error) {
  console.error('FATAL: Cannot load request ID middleware:', error);
  console.error('CRITICAL: Request tracking is mandatory for audit trails. Server cannot start.');
  // Note: NODE_ENV check is allowed in global error handlers (before config loads)
  if ((process.env.NODE_ENV || 'development') !== 'test') process.exit(1);
  throw error;
}

try {
  logger = require('./utils/logger');
  // Logger just loaded - use it going forward
  logger.info({ event: 'boot.module_loaded', module: 'logger' }, 'Logger module loaded successfully');
} catch (error) {
  console.error('Failed to load logger module:', error.message);
  logger = { info: () => {}, error: () => {}, warn: () => {} };
}

try {
  consoleLogger = require('./utils/consoleLogger');
  logger.info({ event: 'boot.module_loaded', module: 'consoleLogger' }, 'Console logger module loaded successfully');
} catch (error) {
  logger.error({ event: 'boot.module_load_failed', module: 'consoleLogger', error: error.message }, 'Failed to load console logger module');
  consoleLogger = { formatConfigSummary: () => {}, formatMiddlewareRegistration: () => {} };
}

// Server toggles (feature flags for ops)
let toggles;
try {
  toggles = require('./config/toggles');
  logger.info({ event: 'boot.module_loaded', module: 'toggles' }, 'Server toggles loaded successfully');
} catch (error) {
  logger.error({ event: 'boot.module_load_failed', module: 'toggles', error: error.message }, 'Failed to load toggles module');
  // Safe defaults if toggles fail to load
  toggles = { env: 'production', logLevel: 'info', blockCmsScans: false, corsDebug: false, exposeDebugRoutes: false };
}

// New security middleware (wired via bootstrap/coreMiddleware)
const methodGuard = require('./middleware/methodGuard');
const credentialGuard = require('./middleware/credentialGuard');
const { generateCspNonce, securityHeaders } = require('./middleware/securityHeaders');
const cacheControl = require('./middleware/cacheControl');
const trustProxyIp = require('./middleware/trustProxyIp');
const corsAllowlist = require('./middleware/corsAllowlist');
const { generalLimiter, loginLimiter, registerLimiter, logoutLimiter, cookieSetLimiter } = require('./middleware/rateLimiter');

// ============================================================
// STEP 0: Boot Order
// ============================================================

/**
 * Detailed boot order (after refactor, via bootstrap modules):
 *
 * Express → preflight OPTIONS → toggles →
 * trust proxy + canonical host redirect →
 * CSP nonce → method guard → credential guard →
 * security headers → cache-control → trust proxy IP → request ID →
 * /health + degrade guard (early) → IP firewall →
 * Redis client init (async) + maintenance guard →
 * HTTPS enforce → CORS allowlist (+ optional CORS debug) →
 * Stripe webhook (raw body, CSRF bypass) →
 * body parsers → cookie guardian → app config →
 * auth bridge → default-deny guard (/api, /dashboard) →
 * static + view engine → CSRF →
 * app rate limiters → routes → error handlers → graceful shutdown.
 */


// ============================================================
// STEP 1: Application Initialization
// ============================================================

/**
 * WHAT:
 * We create the main Express application instance and start the server initialization.
 *
 * WHY:
 * Express is our web framework that handles HTTP requests, middleware, and routing.
 * We need this as the foundation before adding any middleware or routes.
 *
 * HOW:
 * We create the app instance and immediately log startup messages for debugging.
 * If this fails, the process will exit and we'll see the error in logs.
 */
const app = express();
app.disable('x-powered-by');
// Initialize Redis status tracking
app.locals.redisReady = false;
app.locals.rateLimitStoreReady = false;

// Trust proxy for Cloudflare (required for HTTPS redirects)
// Trust proxy configuration (Cloudflare + ALB = 2 hops)
// From centralized config
app.set('trust proxy', config.server.trustProxyHops);

// Canonical host redirect (optional, disabled by default)
// Redirects requests to a canonical host if config.server.canonicalHost is set
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
 * ABSOLUTE TOP: Unconditional preflight short-circuit
 * 
 * WHAT:
 * Handle ALL OPTIONS requests immediately before any other middleware.
 * 
 * WHY:
 * CORS preflight requests must succeed without hitting auth/CSRF/validation.
 * Any middleware that throws on missing headers will cause 500 errors.
 * 
 * HOW:
 * Check for OPTIONS method first, set CORS headers, return 204 immediately.
 * CRITICAL: Never call next() after res.end() - this prevents "headers already sent" errors.
 */
app.use((req, res, next) => {
  if (req.method !== 'OPTIONS') return next();

  const origin = req.get('Origin');
  const acrh = req.get('Access-Control-Request-Headers') || 'Content-Type, Authorization, X-CSRF-Token';
  const acrm = req.get('Access-Control-Request-Method') || 'GET,POST,PUT,PATCH,DELETE,OPTIONS';

  // Vary on all the usual suspects
  res.set('Vary', 'Origin, Access-Control-Request-Headers, Access-Control-Request-Method');

  if (origin) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Access-Control-Allow-Credentials', 'true');
  } else {
    res.set('Access-Control-Allow-Origin', '*');
    // no Allow-Credentials with "*"
  }

  res.set('Access-Control-Allow-Methods', acrm);
  res.set('Access-Control-Allow-Headers', acrh);
  res.set('Access-Control-Max-Age', '600');

  return res.status(204).end();
});

/**
 * STEP 1.5: Toggle-Based Middleware (Feature Flags)
 * 
 * WHAT:
 * Register optional middleware based on operational toggles (feature flags).
 * 
 * WHY:
 * Allow ops/devops to enable/disable features without code changes.
 * Useful for debugging, traffic hygiene, and gradual rollouts.
 * 
 * HOW:
 * Check toggle values and conditionally register middleware.
 * Toggles are read once at boot from environment variables.
 */

// Block common CMS scanner paths (WordPress, PHP, etc.)
if (toggles.blockCmsScans) {
  const blockCmsScans = require('./middleware/blockCmsScans');
  app.use(blockCmsScans());
  logger.info({ event: 'boot.toggle_enabled', toggle: 'blockCmsScans' }, 'Toggle: CMS scan blocking enabled');
}

// CORS debug logging is now handled in registerCoreMiddleware

logger.info({ event: 'boot.server_starting', appName: config.branding.appName }, `${config.branding.appName} server starting...`);
try {
  if (typeof logConfigSummary === 'function') {
    logConfigSummary();
  } else {
    logger.warn({ event: 'boot.config_summary_unavailable' }, '[detechify] logConfigSummary is not a function; skipping config summary log');
  }
} catch (err) {
  logger.error({ event: 'boot.config_summary_failed', error: err.message }, '[detechify] Failed to log config summary');
}

// ============================================================
// STEP 2: Database Connection and Testing
// ============================================================

/**
 * WHAT:
 * Database bootstrap for the app - no direct database connection is created here.
 *
 * WHY:
 * This app uses Supabase over HTTPS instead of a direct DB driver connection, so there is no local pool to initialize.
 * Supabase handles all database connectivity via its HTTP API, eliminating the need for connection pooling or startup-time handshakes.
 *
 * HOW:
 * We rely on Supabase client modules (supabaseClient.js, routes that use Supabase) that call the HTTP API at runtime.
 * There is no startup-time database connection or connection testing here - connectivity is handled on-demand by Supabase's HTTP API.
 * Database configuration and status are logged once in the configuration summary above.
 */

// ============================================================
// STEP 3: Redis Client Creation and Connection
// ============================================================

/**
 * WHAT:
 * We create and configure a Redis client for rate limiting and caching.
 *
 * WHY:
 * Redis provides rate limiting and caching capabilities for the application.
 *
 * HOW:
 * We use the improved Redis client with retry strategy and error handling.
 * Redis is used for rate limiting and caching only.
 */
let redisClient = null;

/**
 * WHAT:
 * Load Redis client module and prepare for connection.
 *
 * WHY:
 * Redis is used for rate limiting, IP firewall, maintenance guard, and
 * degrade guard. These features need a shared client reference.
 *
 * HOW:
 * Import Redis client with lazyConnect enabled.
 * Store client reference on this module and app.locals.
 * Connection is initiated asynchronously during boot.
 */
try {
    const { client, connectRedis } = require('./utils/redisClient');
    redisClient = client;
    logger.info({ event: 'boot.module_loaded', module: 'redisClient' }, 'Redis client module loaded successfully');
    
    // Initialize Redis connection asynchronously
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
    
    // Start connection process (non-blocking)
    initRedis();
    
    // Set up Redis event handlers to update app locals
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
    logger.error({ event: 'boot.module_load_failed', module: 'redisClient', error: error.message }, 'Redis client module load failed');
    logger.info({ event: 'boot.redis_unavailable' }, 'Continuing without Redis...');
    app.locals.redisReady = false;
    app.locals.rateLimitStoreReady = false;
}

// 7. Maintenance Guard factory (will be mounted in registerCoreMiddleware)
const createMaintenanceGuard = require('./middleware/maintenanceGuard');

// 8. Redis Degrade Guard — mounted early inside registerCoreMiddleware to protect sensitive paths
logger.info({ event: 'boot.middleware_ready', middleware: 'degradeGuard' }, 'Security: Redis degrade guard ready (mounted once, early)');

// 9. Default-Deny Auth Guard will be mounted after authBridge (see below)

/**
 * WHAT:
 * Function to update Redis status for health checks.
 *
 * WHY:
 * Health endpoints need to know if Redis is connected so monitoring
 * can track availability and partial-degrade behavior.
 *
 * HOW:
 * Import and call updateRedisStatus from routes/health. If health
 * routes are not available (e.g. during tests), fall back to a no-op.
 *
 * @param {boolean} connected - Whether Redis is connected
 * @param {string} lastCheck - Timestamp of last health check
 */
let updateRedisStatus;
try {
  const { updateRedisStatus: updateStatus } = require('./routes/health');
  updateRedisStatus = updateStatus;
} catch (error) {
  // Health routes not available yet, create a stub
  updateRedisStatus = () => {};
}

// ============================================================
// STEP 4: Security and Core Middleware Registration (delegated to bootstrap)
// ============================================================

/**
 * WHAT:
 * We register all security middleware, parsers, and core functionality.
 *
 * WHY:
 * Security middleware must be registered early in the middleware stack
 * to protect all subsequent routes and handlers.
 * Middleware registration is delegated to bootstrap/coreMiddleware.js for better organization.
 *
 * HOW:
 * We call registerCoreMiddleware from bootstrap/coreMiddleware.js which handles all middleware
 * registration in the correct order: security headers, CORS, rate limiting, body parsing, etc.
 */

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

// ============================================================
// STEP 5: View Engine and Static Assets
// ============================================================

/**
 * WHAT:
 * We configure the view engine and static file serving.
 *
 * WHY:
 * EJS templating provides dynamic content generation and static files
 * serve client-side assets like CSS and JavaScript.
 *
 * HOW:
 * We set EJS as the view engine and configure the public directory
 * for static asset serving.
 */
// ===== View engine =====
app.set('view engine', 'ejs');
app.set('views', path.resolve(__dirname, 'ejs'));

// Enable view caching in production for performance
// WHAT: Caches compiled EJS templates in memory to avoid recompiling on every request
// WHY: Significantly improves response times in production by avoiding template recompilation
// HOW: Only enabled when NODE_ENV is 'production'; disabled in development for fast iteration
if (config?.server?.nodeEnv === 'production') {
  app.set('view cache', true);
  logger.info({ event: 'boot.view_cache_enabled' }, 'View caching enabled for production');
} else {
  app.set('view cache', false);
  logger.info({ event: 'boot.view_cache_disabled', env: config?.server?.nodeEnv || 'development' }, 'View caching disabled for development');
}

// ===== Static roots =====
// Primary (canonical): repo-root /public
const PUBLIC_DIR_PRIMARY = path.resolve(__dirname, '../public');
// Legacy (back-compat): /server/public
const PUBLIC_DIR_LEGACY = path.resolve(__dirname, 'public');

logger.info({ event: 'boot.static_paths', primary: PUBLIC_DIR_PRIMARY, legacy: PUBLIC_DIR_LEGACY }, 'Static files configured');

// Subdirs (primary first, then legacy; fallthrough enabled)
function mountStatic(prefix, subdir, maxAge, immutable = false) {
  const opts = { etag: true, maxAge, fallthrough: true };
  if (immutable) opts.immutable = true;

  // Primary first
  app.use(prefix, express.static(path.join(PUBLIC_DIR_PRIMARY, subdir), opts));
  
  // Legacy second - with monitoring to track usage
  // Note: This middleware only runs if primary static didn't serve the file
  app.use(prefix, (req, res, next) => {
    // If we reach here, primary didn't serve it - check if legacy has it
    const fs = require('fs');
    const filePath = req.path.replace(prefix, '');
    const legacyPath = path.join(PUBLIC_DIR_LEGACY, subdir, filePath);
    try {
      if (fs.existsSync(legacyPath) && fs.statSync(legacyPath).isFile()) {
        logger.info({
          event: 'legacy.static_path_used',
          url: req.url,
          pathRoot: '/server/public',
          subdir: subdir
        }, 'Legacy static asset path served');
      }
    } catch {
      // Ignore errors checking file existence
    }
    next();
  }, express.static(path.join(PUBLIC_DIR_LEGACY, subdir), opts));
}

// Images: long-lived
mountStatic('/images', 'images', '30d', true);
// CSS/JS: shorter cache
mountStatic('/css', 'css', '7d');
mountStatic('/js', 'js', '7d');

// Generic fallbacks (primary then legacy)
app.use(express.static(PUBLIC_DIR_PRIMARY, { etag: true, maxAge: '7d', fallthrough: true }));

// Legacy static path with monitoring
// Note: This middleware only runs if primary static didn't serve the file
app.use((req, res, next) => {
  // If we reach here, primary didn't serve it - check if legacy has it
  const fs = require('fs');
  const legacyPath = path.join(PUBLIC_DIR_LEGACY, req.path);
  try {
    if (fs.existsSync(legacyPath) && fs.statSync(legacyPath).isFile()) {
      logger.info({
        event: 'legacy.static_path_used',
        url: req.url,
        pathRoot: '/server/public'
      }, 'Legacy static asset path served');
    }
  } catch {
    // Ignore errors checking file existence
  }
  next();
}, express.static(PUBLIC_DIR_LEGACY, { etag: true, maxAge: '7d', fallthrough: true }));

// Route for favicon
app.get('/favicon.ico', (req, res) => {
  res.sendFile(path.resolve(__dirname, '../public/images/favicon.ico'));
});

// If a static request got this far, it wasn't found by either root.
// Return an empty 404 so the browser doesn't treat an HTML body as CSS/JS.
app.get(
  [
    '/images/*',
    '/css/*',
    '/js/*',
    '/robots.txt',
  ],
  (req, res, next) => {
    res.status(404).end();
  }
);

consoleLogger.formatMiddlewareRegistration('View engine and static assets');

// ============================================================
// STEP 7: Routes Registration (delegated to bootstrap)
// ============================================================

/**
 * WHAT:
 * We register all application routes with appropriate middleware.
 *
 * WHY:
 * Routes define the API endpoints and page handlers for the application.
 * Route registration is delegated to bootstrap/routes.js for better organization.
 *
 * HOW:
 * We call registerRoutes from bootstrap/routes.js which handles all route
 * registration with CSRF protection and appropriate middleware.
 */

const { registerRoutes } = require('./bootstrap/routes');

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

// ============================================================
// STEP 8: Error Handling (delegated to bootstrap)
// ============================================================

/**
 * WHAT:
 * Centralized error handling with secure, consistent responses.
 *
 * WHY:
 * Prevents information leakage (no stack traces, no internal paths).
 * Provides consistent UX across HTML/JSON/text responses.
 * Error handling is delegated to bootstrap/errors.js for better organization.
 *
 * HOW:
 * We call registerErrorHandlers from bootstrap/errors.js which handles all error
 * handling including 404 responses and centralized error handler.
 */

const { registerErrorHandlers } = require('./bootstrap/errors');

registerErrorHandlers({ app, logger, config, consoleLogger });

// ============================================================
// STEP 9: Server Startup
// ============================================================

/**
 * WHAT:
 * We start the HTTP server and listen for incoming connections.
 *
 * WHY:
 * The server needs to listen on a port to accept HTTP requests.
 *
 * HOW:
 * We start the server on the configured port and host, log the final
 * startup summary, and then register the graceful shutdown system below.
 */
const PORT = config.server.port;
const HOST = config.server.host;

const server = app.listen(PORT, HOST, () => {
  consoleLogger.formatServerStartup({
    host: HOST,
    port: PORT,
    nodeEnv: config.server.nodeEnv,
    database: config.database,  // pass provider-aware object
    rateLimit: 'handled at Cloudflare edge (PRIMARY) + Redis app limiters (SECONDARY)',
    textLimits: `${config.limits.textMinLength}-${config.limits.textMaxLength} chars`,
    maxSubmissions: config.limits.maxSubmissions
  });
  
  // Start outbox processor for reliable event delivery
  try {
    const { startOutboxProcessor } = require('./jobs/outboxProcessor');
    startOutboxProcessor(30000); // Process every 30 seconds
    logger.info({ event: 'boot.outbox_processor_started' }, 'Outbox processor started successfully');
  } catch (error) {
    logger.error({ event: 'boot.outbox_processor_failed', error: error.message }, 'Failed to start outbox processor');
  }
});

// ============================================================
// STEP 10: Graceful Shutdown System (delegated to bootstrap)
// ============================================================

/**
 * WHAT:
 * We implement a comprehensive graceful shutdown system that handles
 * termination signals and ensures all resources are properly cleaned up.
 *
 * WHY:
 * Graceful shutdown prevents data corruption, ensures active requests
 * complete safely, and allows load balancers to drain connections properly.
 * Shutdown logic is delegated to bootstrap/shutdown.js for better organization.
 *
 * HOW:
 * We call registerShutdownSystem from bootstrap/shutdown.js which handles all
 * shutdown logic including signal handlers, connection draining, and cleanup.
 */

const { registerShutdownSystem } = require('./bootstrap/shutdown');

registerShutdownSystem({ server, logger, config, consoleLogger });

// Export for testing
module.exports = app;