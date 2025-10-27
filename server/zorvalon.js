// File: zorvalon.js
// Description: Entry point for application server - Refactored for better organization
// Boot order: Express  Database  Redis  SecurityHeaders  CORS  TrustProxy  RequestID  IPFirewall  Parsers  CacheControl  Auth  Sessions  CSRF  Routes  Errors
// Notes: Console logs mark important checkpoints for audit and debugging

// CRITICAL: Global error handlers - exit immediately on unhandled errors
process.on('uncaughtException', (err) => {
  console.error('FATAL: Uncaught exception detected', err);
  console.error('Server cannot continue safely. Exiting.');
  process.exit(1);
});

process.on('unhandledRejection', (err) => {
  console.error('FATAL: Unhandled promise rejection detected', err);
  console.error('Server cannot continue safely. Exiting.');
  process.exit(1);
});

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const path = require('path');
const crypto = require('node:crypto');
const fs = require('fs');

// Install console shim early to intercept JSON event logs
try {
  const { installJsonLogShim } = require('./utils/consoleLogger');
  installJsonLogShim();
} catch (err) {
  console.error('Failed to install console shim:', err.message);
}

// Application Configuration and Dependencies
// CRITICAL SECTION: Safe module loading to prevent crashes
let config, logConfigSummary, csrfLite, requestIdMiddleware, logger, consoleLogger;

try {
  const configModule = require('./config');
  config = configModule.config;
  logConfigSummary = configModule.logConfigSummary;
  console.log('Configuration module loaded successfully');
} catch (error) {
  console.error('Failed to load config module:', error.message);
  process.exit(1); // Critical module - cannot continue without config
}

try {
  csrfLite = require('./middleware/csrfLite');
  console.log('CSRF middleware loaded successfully');
} catch (error) {
  console.error('FATAL: Cannot load CSRF middleware:', error);
  console.error('CRITICAL: CSRF protection is mandatory. Server cannot start.');
  process.exit(1);
}

try {
  requestIdMiddleware = require('./middleware/requestId');
  console.log('Request ID middleware loaded successfully');
} catch (error) {
  console.error('FATAL: Cannot load request ID middleware:', error);
  console.error('CRITICAL: Request tracking is mandatory for audit trails. Server cannot start.');
  process.exit(1);
}

try {
  logger = require('./utils/logger');
  console.log('Logger module loaded successfully');
} catch (error) {
  console.error('Failed to load logger module:', error.message);
  logger = { info: () => {}, error: () => {}, warn: () => {} };
}

try {
  consoleLogger = require('./utils/consoleLogger');
  console.log('Console logger module loaded successfully');
} catch (error) {
  console.error('Failed to load console logger module:', error.message);
  consoleLogger = { formatConfigSummary: () => {}, formatMiddlewareRegistration: () => {} };
}

// Server toggles (feature flags for ops)
let toggles;
try {
  toggles = require('./config/toggles');
  console.log('Server toggles loaded successfully');
} catch (error) {
  console.error('Failed to load toggles module:', error.message);
  // Safe defaults if toggles fail to load
  toggles = { env: 'production', logLevel: 'info', blockCmsScans: false, corsDebug: false, exposeDebugRoutes: false };
}

// New security middleware
const methodGuard = require('./middleware/methodGuard');
const credentialGuard = require('./middleware/credentialGuard');
const { generateCspNonce, securityHeaders } = require('./middleware/securityHeaders');
const cacheControl = require('./middleware/cacheControl');
const trustProxyIp = require('./middleware/trustProxyIp');
const corsAllowlist = require('./middleware/corsAllowlist');
const { generalLimiter, loginLimiter, signupLimiter, logoutLimiter, cookieSetLimiter } = require('./middleware/rateLimiter');

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

// Trust proxy for Cloudflare (required for HTTPS redirects)
app.set('trust proxy', 1);

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

  const origin = req.get('Origin') || '*';
  const reqHeaders = req.get('Access-Control-Request-Headers') || 'Content-Type, Authorization';

  res.set('Vary', 'Origin');
  res.set('Access-Control-Allow-Origin', origin);
  res.set('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.set('Access-Control-Allow-Headers', reqHeaders);
  res.set('Access-Control-Allow-Credentials', 'true');

  return res.status(204).end(); // NOTE: no next()
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
  console.log('Toggle: CMS scan blocking enabled');
}

// CORS debug logging (noisy, keep off unless actively debugging)
if (toggles.corsDebug) {
  const corsDebug = require('./middleware/corsDebug');
  app.use(corsDebug());
  console.log('Toggle: CORS debug logging enabled');
}

// ============================================================
// NEW SECURITY MIDDLEWARE (Step-by-step integration)
// ============================================================

/**
 * WHAT:
 * Apply new security middleware in the correct order for enterprise-grade protection.
 * 
 * WHY:
 * Middleware order matters. Guards must run before parsers, headers before CORS,
 * and trust proxy before any IP-based logic.
 * 
 * HOW:
 * 1. Method guard blocks dangerous HTTP verbs
 * 2. Security headers (Helmet with strict CSP)
 * 3. Cache control (no-store for dynamic routes)
 * 4. Trust proxy and extract real client IP
 */

// 0. Generate CSP nonce for each request (MUST come first for security headers)
app.use(generateCspNonce());
console.log('Security: CSP nonce generation enabled');

// 1. Method guard: reject PROPFIND, TRACE, and unknown methods
app.use(methodGuard());
console.log('Security: Method guard enabled');

// Credential guard (block credentials in GET params - CRITICAL)
app.use(credentialGuard);
console.log('Security: Credential guard enabled (blocks credentials in GET)');

// 2. Strict security headers with nonce-based CSP
app.use(securityHeaders());
console.log('Security: Strict CSP and security headers enabled');

// 3. Cache control: no-store for dynamic routes
app.use(cacheControl());
console.log('Security: Cache control enabled');

// 4. Trust proxy and expose real client IP
app.use(trustProxyIp(app));
console.log('Security: Trust proxy and clientIp extraction enabled');

// 5. Request ID middleware - add unique ID to every request (must be early for logging)
app.use(requestIdMiddleware);
console.log('Security: Request ID tracking enabled');

// 6. IP Firewall - block abusive IPs before they reach route logic
const { ipFirewall } = require('./middleware/ipFirewall');
app.use(ipFirewall());
console.log('Security: IP firewall enabled (Redis-backed auto-ban)');

console.log(`${process.env.APP_NAME || 'Application'} server starting...`);
consoleLogger.formatConfigSummary(config);

// ============================================================
// STEP 2: Database Connection and Testing
// ============================================================

/**
 * WHAT:
 * Database connection testing removed - now using Supabase HTTP API.
 *
 * WHY:
 * Supabase provides a managed PostgreSQL database accessible via HTTP API.
 * No local database connection testing needed.
 *
 * HOW:
 * All database operations go through Supabase client which handles connectivity.
 * Database info is now logged once in the configuration summary above.
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
 * Session middleware needs the Redis client reference.
 * Actual connection happens asynchronously after sessions are mounted.
 * 
 * HOW:
 * Import Redis client with lazyConnect enabled.
 * Store client reference for session middleware.
 * Connection will be initiated after middleware is configured.
 */
try {
    const { client, connectRedis } = require('./utils/redisClient');
    redisClient = client;
    console.log('Redis client module loaded successfully');
    
    // Initialize Redis connection asynchronously
    const initRedis = async () => {
        try {
            await connectRedis();
            app.locals.redisReady = true;
            app.locals.rateLimitStoreReady = true;
            updateRedisStatus(true, new Date().toISOString());
            console.log('Redis connection established successfully');
        } catch (error) {
            console.error('Redis connection failed:', error.message);
            console.log('Sessions will use memory store fallback');
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
    console.error('Redis client module load failed:', error.message);
    console.log('Continuing without Redis...');
    app.locals.redisReady = false;
    app.locals.rateLimitStoreReady = false;
}

// 7. Maintenance Guard - instant maintenance mode toggle (after Redis client is available)
const createMaintenanceGuard = require('./middleware/maintenanceGuard');
app.use(createMaintenanceGuard(redisClient));
console.log('Security: Maintenance guard enabled (Redis/env toggle)');

// 8. Redis Degrade Guard - block sensitive paths when Redis is down
const degradeGuard = require('./middleware/degradeGuard');
app.use(degradeGuard);
console.log('Security: Redis degrade guard enabled (503 for sensitive paths when Redis down)');

// 9. Default-Deny Auth Guard will be mounted after authBridge (see below)

/**
 * WHAT:
 * Function to update Redis status for health checks.
 * 
 * WHY:
 * Health endpoints need to know if Redis is connected.
 * This allows monitoring systems to track Redis availability.
 * 
 * HOW:
 * Import and call updateRedisStatus from health routes.
 * Pass connection status and timestamp for monitoring.
 * 
 * @param {boolean} connected - Whether Redis is connected
 * @param {string} lastCheck - Timestamp of last check
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
// STEP 4: Security and Core Middleware Registration
// ============================================================

/**
 * WHAT:
 * We register all security middleware, parsers, and core functionality.
 *
 * WHY:
 * Security middleware must be registered early in the middleware stack
 * to protect all subsequent routes and handlers.
 *
 * HOW:
 * We register middleware in the correct order: security headers, CORS,
 * rate limiting, body parsing, sessions, and custom middleware.
 */

// HTTPS enforcement (respects Cloudflare proxy headers, uses canonical PUBLIC_ORIGIN)
// NOTE: OPTIONS requests are handled by the preflight short-circuit at the top
const enforceHttps = require('./middleware/enforceHttps');
app.use(enforceHttps);

// Note: CSP with nonce is now handled by securityHeaders() middleware above
// No additional Helmet configuration needed here

// Permissions-Policy header - Enterprise-grade browser feature restrictions
app.use((req, res, next) => {
  res.setHeader(
    'Permissions-Policy',
    [
      'camera=()',
      'microphone=()',
      'geolocation=()',
      'payment=()',
      'usb=()',
      'serial=()',
      'bluetooth=()'
    ].join(', ')
  );
  next();
});

// CORS configuration using dedicated middleware
/**
 * WHAT:
 * CORS origin validation using centralized corsAllowlist middleware.
 * 
 * WHY:
 * OPTIONS preflight is handled at the absolute top unconditionally.
 * This validates actual requests (GET, POST, etc.) against allowed origins.
 * 
 * HOW:
 * Uses corsAllowlist.js which supports:
 * 1. Explicit CORS_ORIGINS env var
 * 2. Any subdomain of detechify.com (*.detechify.com)
 * 3. Localhost in development
 * 4. Blocks and logs all others
 */
app.use(corsAllowlist);

// Rate limiting will be applied after static files


// Body parsers with size limits
// Stripe webhook (raw body, CSRF bypass) - must be before body parsers
try {
  const { mountStripeWebhook } = require('./routes/stripeWebhook');
  mountStripeWebhook(app);
  console.log('Stripe webhook mounted (raw body, CSRF bypass).');
} catch (e) {
  console.error('Failed to mount Stripe webhook:', e.message);
}

// Body size limits (32KB to match text input limits and prevent abuse)
app.use(express.json({ limit: '32kb' }));
app.use(express.urlencoded({ extended: false, limit: '32kb' }));

// Cookie parsing middleware - must be before sessions and CSRF
const parseCookies = require('./middleware/cookieGuardian');
app.use(parseCookies);

// App config injection (makes config available to all views)
const appConfig = require('./middleware/appConfig');
app.use(appConfig);

// Stateless authentication bridge - reads Supabase tokens
const authBridge = require('./middleware/authBridge');
app.use(authBridge);

// 10. Default-Deny Auth Guard - enforce authentication for protected prefixes (AFTER authBridge)
const requireAuthByDefault = require('./middleware/requireAuthByDefault');

// Public paths that should remain accessible without authentication
const publicGlobs = [
  '/', '/login',
  '/css/**', '/js/**', '/images/**', '/favicon.ico',
  '/health/**',
  '/api/auth/set-cookie', '/api/auth/clear-cookie'
  // Note: All /dashboard paths are protected by requireAuth middleware,
  // but the default-deny guard needs to allow authenticated access
  // The guard checks for req.user, so authenticated users pass through
];

// Mount default-deny guard for API and dashboard prefixes
app.use(['/api', '/dashboard'], requireAuthByDefault({
  publicGlobs,
  logger
}));
console.log('Security: Default-deny auth guard enabled for /api and /dashboard prefixes');

// Centralized authentication middleware
const { requireAuth } = require('./middleware/requireAuth');

/**
 * WHAT:
 * Session middleware is disabled - using stateless authentication only.
 * 
 * WHY:
 * No routes use req.session, so sessions are not needed.
 * Stateless Supabase JWT authentication is sufficient.
 * 
 * HOW:
 * Sessions are completely disabled to reduce attack surface.
 * All authentication is handled via Supabase JWT tokens.
 */

console.log('Authentication: Stateless only (Supabase JWT tokens)');

// Request timing middleware for formatted logging
app.use((req, res, next) => {
  const startTime = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    // Use formatted logger for terminal display
    consoleLogger.formatRequest(req, res, duration);
  });
  
  next();
});

consoleLogger.formatMiddlewareRegistration('Core middleware');

// Supabase Auth middleware (stateless token verification)
consoleLogger.formatMiddlewareRegistration('Supabase Auth (token verification)');

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
app.set('view engine', 'ejs');
app.set('views', './ejs');

// Serve static files from public directory
const publicPath = path.join(__dirname, 'public');
console.log('Static files path:', publicPath);

// Explicit static mount for images, css, js before generic static
app.use('/images', express.static(path.join(publicPath, 'images'), {
  fallthrough: true,
  etag: true,
  maxAge: '30d',
  immutable: true
}));
app.use('/css', express.static(path.join(publicPath, 'css'), {
  fallthrough: true,
  etag: true,
  maxAge: '7d'
}));
app.use('/js', express.static(path.join(publicPath, 'js'), {
  fallthrough: true,
  etag: true,
  maxAge: '7d'
}));

// Generic static mount as fallback
app.use(express.static(publicPath, {
  fallthrough: true,
  etag: true,
  maxAge: '7d'
}));

// Explicit fallback for trust badge
const trustBadgePath = path.join(publicPath, 'images', 'payments', 'trust-badge.png');
const DEV = process.env.NODE_ENV !== 'production';

// Log asset presence at boot (dev only)
if (DEV) {
  fs.promises.stat(trustBadgePath)
    .then(() => logger.info({ event: 'asset.present', path: trustBadgePath }, 'Trust badge present at boot'))
    .catch(e => logger.warn({ event: 'asset.missing', code: e.code, path: trustBadgePath }, 'Trust badge missing at boot'));
}

// Hard fallback route for trust badge
app.get('/images/payments/trust-badge.png', (req, res) => {
  res.sendFile(trustBadgePath, {
    headers: {
      'Cache-Control': 'public, max-age=2592000, immutable'
    }
  });
});

// Dev-only diagnostic endpoint
if (DEV) {
  app.get('/__diag/asset/trust-badge', async (req, res) => {
    try {
      await fs.promises.stat(trustBadgePath);
      return res.json({ ok: true, path: trustBadgePath });
    } catch (e) {
      return res.status(404).json({ ok: false, code: e.code, path: trustBadgePath });
    }
  });
}

consoleLogger.formatMiddlewareRegistration('View engine and static assets');
// Rate limiting configuration logged via structured logger
// EVIDENCE: Both Cloudflare edge AND Redis-based application limiters are active
logger.info({
  event: 'boot.rate_limit_stack',
  rateLimit: {
    primary: 'cloudflare',    // Handles volumetric DDoS attacks
    secondary: 'redis'        // Handles application-specific limits
  }
}, 'Rate limiting: Edge (primary) → Origin/Redis (secondary)');

// ============================================================
// STEP 6: Security Middleware Configuration
// ============================================================

/**
 * WHAT:
 * We register security middleware for CSRF protection.
 *
 * WHY:
 * CSRF protection prevents cross-site request forgery attacks
 * by validating tokens on state-changing requests.
 *
 * HOW:
 * We add CSRF token generation middleware and configure
 * validation for protected routes.
 */
// Add CSRF protection middleware (stateless double-submit)
app.use(csrfLite);

consoleLogger.formatMiddlewareRegistration('Security middleware');

// ============================================================
// STEP 6.5: Application-Layer Rate Limiting (Defense-in-Depth)
// ============================================================

/**
 * WHAT:
 * Per-route rate limiting at the application layer (SECONDARY layer).
 *
 * WHY:
 * Defense-in-depth behind Cloudflare edge protection (PRIMARY layer).
 * Different routes need different limits (login strict, logout lenient).
 *
 * HOW:
 * DUAL-LAYER RATE LIMITING ARCHITECTURE:
 * 
 * LAYER 1 (PRIMARY): Cloudflare Edge
 * - Handles volumetric DDoS attacks and massive traffic floods
 * - Provides geographic filtering and bot protection
 * - Blocks traffic before it reaches this origin server
 * - Configured at Cloudflare dashboard level
 *
 * LAYER 2 (SECONDARY): Application-specific limiters (this section)
 * - Five tiers of rate limiting for different endpoint types:
 *   1. General API limiter (300 req/min) - generous for normal use
 *   2. Cookie set limiter (300 req/min) - lenient for post-login flow
 *   3. Logout limiter (120 req/10min) - very lenient, users click around
 *   4. Login limiter (10 attempts/15min) - strict to prevent brute force
 *   5. Signup limiter (5 attempts/hour) - very strict to prevent abuse
 * - Escalates repeated violations to IP firewall blocking
 * - Uses Redis for shared state across multiple server instances
 *
 * EVIDENCE: Both layers are active:
 * - Line 522: "Rate limiting: Edge (primary) → Origin/Redis (secondary)"
 * - Line 898: "rateLimit: 'handled at Cloudflare edge'"
 */
// Apply general rate limiting to API endpoints (SECONDARY layer)
// This works IN ADDITION to Cloudflare edge protection (PRIMARY layer)
app.use(['/api'], generalLimiter());
// General limiter enabled (300 req/min) - logged via structured logger above

// Apply per-route rate limiting to auth endpoints (SECONDARY layer)
// These are application-specific limits after Cloudflare edge filtering
app.use('/auth/set-cookie', cookieSetLimiter());
// Cookie set limiter enabled (300 req/min) - logged via structured logger above

app.use('/auth/clear-cookie', logoutLimiter());
// Logout limiter enabled (120 req/10min) - logged via structured logger above
// NOTE: This is SECONDARY layer - Cloudflare edge handles volumetric attacks first

app.use(['/auth/login', '/api/auth/login'], loginLimiter());
// Login limiter enabled (10 attempts per 15 min) - logged via structured logger above
// NOTE: This is SECONDARY layer - Cloudflare edge handles volumetric attacks first

app.use(['/auth/signup', '/api/auth/signup'], signupLimiter());
// Signup limiter enabled (5 attempts per hour) - logged via structured logger above
// NOTE: This is SECONDARY layer - Cloudflare edge handles volumetric attacks first

// ============================================================
// STEP 7: Routes Registration
// ============================================================

/**
 * WHAT:
 * We register all application routes with appropriate middleware.
 *
 * WHY:
 * Routes define the API endpoints and page handlers for the application.
 * We organize them by functionality and apply appropriate middleware.
 *
 * HOW:
 * We register routes with CSRF protection for state-changing requests
 * and organize them by functional areas (auth, API, dashboard, health).
 */

// Import modular routes (CSRF protection handled globally by csrfLite)
// CRITICAL SECTION: Safe route loading to prevent crashes

const profileRouter = require('./routes/profile');

app.use('/api/profile', requireAuth, profileRouter);

try {
  app.use('/auth', require('./routes/authCookie'));  // HttpOnly cookie management (set/clear)
  console.log('Auth cookie routes loaded successfully');
} catch (error) {
  console.error('Failed to load auth cookie routes:', error.message);
}

try {
  app.use('/api/auth', require('./routes/auth'));
  console.log('Auth API routes loaded successfully');
} catch (error) {
  console.error('Failed to load auth API routes:', error.message);
}

// Debug route (enabled via AUTH_DEBUG=true env var)
if (String(process.env.AUTH_DEBUG).toLowerCase() === 'true') {
  try {
    app.use('/api/auth', require('./routes/authDebug'));
    console.log('Auth debug routes loaded (AUTH_DEBUG=true)');
  } catch (error) {
    console.error('Failed to load auth debug routes:', error.message);
  }
}

try {
  // Admin routes (require admin role)
  app.use('/api/admin', requireAuth, require('./routes/admin'));
  
  // User routes (require ownership)
  app.use('/api/users', requireAuth, require('./routes/users'));
  console.log('Users API routes loaded successfully');
} catch (error) {
  console.error('Failed to load users API routes:', error.message);
}

try {
  app.use('/api/page', requireAuth, require('./routes/pageApi'));
  console.log('Page API routes loaded successfully');
} catch (error) {
  console.error('Failed to load page API routes:', error.message);
}

try {
  app.use('/api/submit', requireAuth, require('./routes/submissions'));
  console.log('Submissions API routes loaded successfully');
} catch (error) {
  console.error('Failed to load submissions API routes:', error.message);
}

try {
  app.use('/api/pay', requireAuth, require('./routes/payments'));
  console.log('Payments API routes loaded successfully');
} catch (error) {
  console.error('Failed to load payments API routes:', error.message);
}

try {
  app.use('/api', require('./routes/api'));
  console.log('General API routes loaded successfully');
} catch (error) {
  console.error('Failed to load general API routes:', error.message);
}

// Debug routes (toggle-based, off by default)
/**
 * WHAT:
 * Debug routes for operational visibility (/_debug).
 * 
 * WHY:
 * Ops/devops need visibility into feature flags and basic health
 * without exposing sensitive data or creating security risks.
 * 
 * HOW:
 * Only mount /_debug when EXPOSE_DEBUG_ROUTES=true.
 * You can guard it further (e.g., IP allowlist) if needed.
 */
if (toggles.exposeDebugRoutes) {
  try {
    app.use('/_debug', require('./routes/debug'));
    console.log('Toggle: Debug routes enabled (/_debug)');
  } catch (error) {
    console.error('Failed to load debug routes:', error.message);
  }
}

// Import health routes
try {
  const { router: healthRouter } = require('./routes/health');
  app.use('/health', healthRouter);
  console.log('Health routes loaded successfully');
} catch (error) {
  console.error('Failed to load health routes:', error.message);
}

try {
  app.use('/dashboard', requireAuth, require('./routes/dashboard'));
  console.log('Dashboard routes loaded successfully');
} catch (error) {
  console.error('Failed to load dashboard routes:', error.message);
}

try {
  app.use('/dashboard/billing', require('./routes/dashboard-billing'));
  console.log('Billing dashboard route loaded');
} catch (e) {
  console.error('Failed to load /dashboard/billing:', e.message);
}

// Login page route (public)
app.get('/login', (req, res) => {
  try {
    // If user is already authenticated, redirect to dashboard
    if (req.user?.id) {
      return res.redirect('/dashboard');
    }
    
    // Build page model for login page
    const pageModel = buildHomePageModel(req, res);
    
    // Add nonce for EJS template
    pageModel.page.nonce = res.locals.nonce;
    
    // Add Supabase credentials for client initialization
    pageModel.ui = {
      supabaseUrl: process.env.SUPABASE_URL,
      supabaseAnonKey: process.env.SUPABASE_ANON_KEY
    };
    
    // Render login page (reuse index.ejs which has login modal)
    res.render('index', pageModel);
  } catch (error) {
    console.error('Login page error:', error);
    res.status(500).render('error', {
      title: 'Login Error',
      message: 'Unable to load login page',
      page: { nonce: res.locals.nonce }
    });
  }
});

// Initialize submissions storage (now using database)
try {
  const submissionsRouter = require('./routes/submissions');
  if (submissionsRouter.initSubmissionsStorage) {
    submissionsRouter.initSubmissionsStorage();
  }
  console.log('Submissions storage initialized successfully (Supabase database)');
} catch (error) {
  console.error('Failed to initialize submissions storage:', error.message);
}

// Import presenters
let buildHomePageModel;
try {
  const presentersModule = require('./ui_contract/presenters');
  buildHomePageModel = presentersModule.buildHomePageModel;
  console.log('Presenters module loaded successfully');
} catch (error) {
  console.error('Failed to load presenters module:', error.message);
  buildHomePageModel = () => ({ page: { title: 'Error', description: 'Service unavailable' } });
}


// Home page route
app.get('/', (req, res) => {
  try {
    // Build page model using presenter
    const pageModel = buildHomePageModel(req, res);
    
    // Add nonce to page model for EJS template
    pageModel.page.nonce = res.locals.nonce;
    
    // Add Supabase credentials for client initialization
    pageModel.ui = {
      supabaseUrl: process.env.SUPABASE_URL,
      supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
      csrfToken: res.locals.csrfToken || ''
    };
    
    // Render EJS template with page model
    res.render('index', pageModel);
  } catch (error) {
    console.error('Home page error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message,
      requestId: req.requestId,
      timestamp: new Date().toISOString()
    });
  }
});

consoleLogger.formatMiddlewareRegistration('Routes');

// ============================================================
// STEP 8: Error Handling
// ============================================================

/**
 * WHAT:
 * Centralized error handling with secure, consistent responses.
 *
 * WHY:
 * Prevents information leakage (no stack traces, no internal paths).
 * Provides consistent UX across HTML/JSON/text responses.
 * Single source of truth for error handling.
 *
 * HOW:
 * Use errorResponder module for all error responses.
 * Log errors server-side with full context.
 * Send minimal, safe info to clients.
 * Support content negotiation (HTML/JSON/text).
 */
const { respondError } = require('./utils/errorResponder');
const isProd = process.env.NODE_ENV === 'production';

// 404 handler (no route matched)
app.use((req, res) => {
  respondError(req, res, {
    status: 404,
    message: 'The requested resource was not found.',
    code: 'not_found',
  });
});

// Centralized error handler (must have 4 args)
app.use((err, req, res, next) => {
  // Check if headers were already sent (prevents "headers already sent" errors)
  if (res.headersSent) {
    return next(err);
  }
  
  // Do not leak internals to clients
  const status = err.status || err.statusCode || 500;

  // If static file is missing, respond 404 instead of 500
  const isStaticReq = req.path.startsWith('/images/') || 
                      req.path.startsWith('/css/') || 
                      req.path.startsWith('/js/');
  
  if (isStaticReq && (err.code === 'ENOENT' || status === 404)) {
    return res.status(404).end();
  }

  /**
   * WHAT:
   * Log full error details server-side only.
   * 
   * WHY:
   * Need complete error context for debugging.
   * But never send stack traces or internals to clients.
   * 
   * HOW:
   * Use structured logger with full context.
   * Include stack trace in logs only.
   * Client gets generic message only.
   */
  try {
    logger.error('Uncaught error', {
      requestId: req.requestId || 'unknown',
      status,
      name: err.name,
      message: err.message,
      code: err.code,
      url: req.url,
      method: req.method,
      ip: req.ip,
      syscall: err.syscall, // Added for ENOENT diagnosis
      // Stack trace in logs only (not sent to client)
      stack: isProd ? undefined : err.stack,
    });
  } catch {
    // Fail silently if logging fails
  }

  // 429 hint: if upstream rate limiter set retryAfter seconds, reflect it safely
  if (status === 429 && err.retryAfter) {
    res.set('Retry-After', String(err.retryAfter));
  }

  respondError(req, res, {
    status,
    message: status === 500 ? 'An unexpected error occurred.' : (err.publicMessage || err.message),
    code: status === 500 ? 'internal_error' : undefined,
    // Never send stack/details in prod responses
    extra: isProd ? {} : { detail: err.type || err.code },
  });
});

consoleLogger.formatMiddlewareRegistration('Error handling');

// ============================================================
// STEP 9: Server Startup
// ============================================================

/**
 * WHAT:
 * We start the HTTP server and listen for incoming connections.
 *
 * WHY:
 * The server needs to listen on a port to accept HTTP requests.
 * We also set up graceful shutdown handling for production deployments.
 *
 * HOW:
 * We start the server on the configured port and host,
 * and set up signal handlers for graceful shutdown.
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
    console.log('Outbox processor started successfully');
  } catch (error) {
    console.error('Failed to start outbox processor:', error.message);
  }
});

// ============================================================
// STEP 10: Graceful Shutdown System
// ============================================================

/**
 * WHAT:
 * We implement a comprehensive graceful shutdown system that handles
 * termination signals and ensures all resources are properly cleaned up.
 *
 * WHY:
 * Graceful shutdown prevents data corruption, ensures active requests
 * complete safely, and allows load balancers to drain connections properly.
 * This is essential for production deployments and zero-downtime updates.
 *
 * HOW:
 * We track server state, implement connection draining, close database
 * connections, flush Redis data, and provide timeout fallbacks.
 */

// Graceful shutdown configuration
const GRACE_MS = Number(process.env.SHUTDOWN_GRACE_MS || 15000);
const SOCKET_CULL_MS = Math.max(0, GRACE_MS - 2000);

let shuttingDown = false;
const sockets = new Set();

// Track active connections for graceful draining
server.on('connection', (sock) => {
  sockets.add(sock);
  sock.on('close', () => sockets.delete(sock));
});

/**
 * Gracefully shutdown the server and all resources
 * 
 * WHAT:
 * Handle shutdown signals exactly once, close HTTP server cleanly, and exit(0).
 * 
 * WHY:
 * Duplicate signals or timeout exits with code 1 make systemd/npm report failures.
 * Always exit(0) for clean restarts.
 * 
 * HOW:
 * 1) Debounce with process.once and shuttingDown flag
 * 2) Close server and cull lingering sockets
 * 3) Always exit(0) so systemd doesn't mark restart as failed
 * 
 * @param {string} signal - The signal that triggered shutdown
 */
function gracefulShutdown(signal) {
  if (shuttingDown) {
    console.log('Shutdown already in progress (ignored duplicate signal)');
    return; // Just return, don't exit(1)
  }
  shuttingDown = true;

  console.log('GRACEFUL SHUTDOWN INITIATED');
  console.log(`   Signal: ${signal}`);
  console.log(`   Time: ${new Date().toLocaleString()}`);
  console.log('   Shutting down gracefully...');

  // Stop accepting new connections
  server.close((err) => {
    if (err) {
      console.error('HTTP server close error:', err);
      // Still exit(0) to avoid npm/systemd "failed" spam during restarts
      process.exit(0);
      return;
    }
    console.log('HTTP server closed');
    console.log('All active connections closed');
    console.log('Graceful shutdown completed');
    process.exit(0); // IMPORTANT: exit(0) so systemd/npm doesn't mark it as failure
  });

  // After a short delay, kill any lingering sockets (keep-alive, long polls)
  setTimeout(() => {
    for (const s of sockets) {
      try { s.destroy(); } catch {}
    }
  }, SOCKET_CULL_MS).unref();

  // Final failsafe - if close callback never fires, exit(0) anyway
  setTimeout(() => {
    console.warn('Graceful shutdown timeout reached, forcing exit');
    process.exit(0); // exit(0) on timeout to avoid restart "failed" noise
  }, GRACE_MS).unref();
}

// Handle termination signals (use once() to prevent duplicate handlers)
process.once('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.once('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions and unhandled rejections
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('UNHANDLED_REJECTION');
});

consoleLogger.formatMiddlewareRegistration('Graceful shutdown system');

// Export for testing
module.exports = app;