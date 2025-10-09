// File: zorvalon.js
// Description: Entry point for application server - Refactored for better organization
// Boot order: Express → MethodGuard → SecurityHeaders → CORS → TrustProxy → Parsers → CacheControl → Auth → CSRF → Routes → Errors
// Notes: Console logs mark important checkpoints for audit and debugging

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const path = require('path');
const crypto = require('node:crypto');

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
  console.error('Failed to load CSRF middleware:', error.message);
  csrfLite = { addCSRFToken: () => {}, validateCSRF: () => (req, res, next) => next() };
}

try {
  requestIdMiddleware = require('./middleware/requestId');
  console.log('Request ID middleware loaded successfully');
} catch (error) {
  console.error('Failed to load request ID middleware:', error.message);
  requestIdMiddleware = (req, res, next) => next();
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
const securityHeaders = require('./middleware/securityHeaders');
const cacheControl = require('./middleware/cacheControl');
const trustProxyIp = require('./middleware/trustProxyIp');
const corsAllowlist = require('./middleware/corsAllowlist');

// Rate limiting removed - handled at Cloudflare edge

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

// 1. Method guard: reject PROPFIND, TRACE, and unknown methods
app.use(methodGuard());
console.log('Security: Method guard enabled');

// 2. Cache control: no-store for dynamic routes
app.use(cacheControl());
console.log('Security: Cache control enabled');

// 3. Trust proxy and expose real client IP
app.use(trustProxyIp(app));
console.log('Security: Trust proxy and clientIp extraction enabled');

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
 */
console.log('Database: Supabase (HTTP API)');

// ============================================================
// STEP 3: Redis decommissioned — stateless auth enabled
// ============================================================

/**
 * WHAT:
 * Redis has been removed in favor of stateless authentication.
 *
 * WHY:
 * We now use Supabase Auth tokens and stateless CSRF protection,
 * eliminating the need for server-side session storage.
 *
 * HOW:
 * Authentication is handled by authBridge middleware using Supabase tokens.
 * CSRF protection uses double-submit cookie pattern without server storage.
 */

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

// Nonce generation middleware for CSP
app.use((req, res, next) => {
  // Generate a unique nonce for each request
  const nonce = crypto.randomBytes(16).toString('base64');
  res.locals.nonce = nonce;
  next();
});

// HTTPS redirect middleware (for production behind Cloudflare)
// NOTE: OPTIONS requests are handled by the preflight short-circuit at the top
if (config.cors.enforceHttps) {
  app.use((req, res, next) => {
    // Trust proxy headers from Cloudflare
    const forwardedProto = req.get('x-forwarded-proto');
    const host = req.get('host');
    
    // Redirect HTTP to HTTPS
    if (forwardedProto !== 'https') {
      const httpsUrl = `https://${host}${req.originalUrl}`;
      logger.info('HTTPS redirect', { 
        from: req.originalUrl, 
        to: httpsUrl,
        forwardedProto 
      });
      return res.redirect(301, httpsUrl);
    }
    
    next();
  });
}

// Security headers (Helmet) - Enterprise-level security without CSP (handled by custom middleware)
// NOTE: We keep the existing custom CSP with nonces for now to avoid breaking inline scripts.
// The new securityHeaders middleware will be used for future routes/services.
app.use(helmet({
  contentSecurityPolicy: false, // Disable Helmet's CSP, use custom middleware instead
  crossOriginEmbedderPolicy: false, // Disable for better compatibility
  crossOriginOpenerPolicy: { policy: "same-origin" },
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// Custom CSP middleware to add nonces
app.use((req, res, next) => {
  const nonce = res.locals.nonce;
  
  if (nonce) {
    // Set CSP header with nonces
    const cspDirectives = [
      "default-src 'self'",
      `script-src 'self' 'nonce-${nonce}' https://cdn.jsdelivr.net https://unpkg.com https://www.googletagmanager.com https://www.google-analytics.com https://maps.googleapis.com https://www.gstatic.com`,
      `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net https://unpkg.com`,
      "img-src 'self' data: https: blob: https://maps.googleapis.com https://maps.gstatic.com",
      "font-src 'self' https://fonts.gstatic.com https://cdn.jsdelivr.net https://unpkg.com",
      "connect-src 'self' https://www.google-analytics.com https://analytics.google.com https://maps.googleapis.com https://zwrstlnfyiqsxbuggiiz.supabase.co",
      "frame-src 'self' https://www.google.com https://maps.google.com",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'"
    ];
    
    const cspHeader = cspDirectives.join('; ');
    res.setHeader('Content-Security-Policy', cspHeader);
  }
  
  next();
});

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

// CORS configuration - Enterprise-level balance of security and usability
/**
 * WHAT:
 * CORS origin validation for non-OPTIONS requests.
 * 
 * WHY:
 * OPTIONS preflight is handled at the absolute top unconditionally.
 * This validates actual requests (GET, POST, etc.) against allowed origins.
 * 
 * HOW:
 * 1. Allow exact matches from CORS_ORIGINS env var
 * 2. Allow any subdomain of detechify.com (e.g., www, app, dashboard)
 * 3. Allow localhost in development
 * 4. Block and log everything else
 */

// Parse explicit allowed origins from environment
const allowedList = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

// Regex to match any subdomain of detechify.com
// Format: https?://[subdomain.]detechify.com[:port]
const allowDetechify = /^https?:\/\/([a-z0-9-]+\.)?detechify\.com(?::\d+)?$/i;

app.use(cors({
  origin: (origin, callback) => {
    // Same-origin / server-to-server / mobile apps: allow
    if (!origin) return callback(null, true);
    
    // Check explicit allow list from env
    if (allowedList.includes(origin)) {
      return callback(null, true);
    }
    
    // Check if origin matches *.detechify.com pattern
    if (allowDetechify.test(origin)) {
      return callback(null, true);
    }
    
    // Development: allow localhost
    if (config.server.nodeEnv === 'development' && origin.includes('localhost')) {
      return callback(null, true);
    }
    
    // Block and log unknown origins for monitoring
    console.warn('CORS block', { origin, allowedList });
    logger.warn('CORS blocked origin', { 
      origin, 
      allowedList,
      nodeEnv: config.server.nodeEnv 
    });
    return callback(new Error('Not allowed by CORS policy'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'X-CSRF-Token', 
    'X-Request-ID',
    'Accept',
    'Origin',
    'X-Requested-With'
  ],
  exposedHeaders: ['X-CSRF-Token', 'X-Request-ID'],
  maxAge: 86400 // Cache preflight for 24 hours
}));

// Rate limiting will be applied after static files


// Body parsers with size limits
// Body size limits (32KB to match text input limits and prevent abuse)
app.use(express.json({ limit: '32kb' }));
app.use(express.urlencoded({ extended: false, limit: '32kb' }));

// Cookie parsing middleware - must be before sessions and CSRF
const parseCookies = require('./middleware/cookieGuardian');
app.use(parseCookies);

// Stateless authentication bridge - reads Supabase tokens
const authBridge = require('./middleware/authBridge');
app.use(authBridge);

// Centralized authentication middleware
const { requireAuth } = require('./middleware/requireAuth');

// Session middleware removed - using stateless authentication with Supabase tokens
console.log('Stateless authentication enabled - no server-side sessions');

// Request ID middleware - add unique ID to every request
app.use(requestIdMiddleware);

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
app.use(express.static(publicPath));

// Rate limiting removed - handled at Cloudflare edge

consoleLogger.formatMiddlewareRegistration('View engine and static assets');
consoleLogger.formatMiddlewareRegistration('Rate limiting (Cloudflare edge)');

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

// Initialize submissions route with shared storage
try {
  const submissionsRouter = require('./routes/submissions');
  const submissions = [];
  submissionsRouter.setSubmissions(submissions);
  console.log('Submissions storage initialized successfully');
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
 * We register global error handling middleware for graceful error management.
 *
 * WHY:
 * Error handling ensures the application doesn't crash on unexpected errors
 * and provides meaningful error responses to clients.
 *
 * HOW:
 * We register error middleware that catches all unhandled errors,
 * logs them with context, and returns appropriate HTTP responses.
 */
app.use((err, req, res, next) => {
  const errorId = req.requestId || req.id || req.headers['x-request-id'] || crypto.randomUUID();
  
  // Log to structured logger
  logger.error('Server error occurred', {
    requestId: errorId,
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip
  });
  
  // Also log full stack to console for debugging (especially useful in production logs)
  console.error('[ERROR]', errorId, err && err.stack ? err.stack : err);
  
  // Check if headers were already sent (prevents "headers already sent" errors)
  if (res.headersSent) {
    return next(err);
  }
  
  res.status(err.status || 500).json({ 
    error: 'Internal server error',
    requestId: errorId,
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Not found',
    message: `The requested resource ${req.url} was not found on this server.`,
    requestId: req.requestId,
    timestamp: new Date().toISOString()
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
    database: config.database.url ? 'Supabase PostgreSQL' : `${config.database.host}:${config.database.port}/${config.database.name}`,
    rateLimit: 'handled at Cloudflare edge',
    textLimits: `${config.limits.textMinLength}-${config.limits.textMaxLength} chars`,
    maxSubmissions: config.limits.maxSubmissions
  });
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

let isShuttingDown = false;
let activeConnections = new Set();
let shutdownTimeout = null;

// Track active connections for graceful draining
server.on('connection', (socket) => {
  if (isShuttingDown) {
    socket.destroy();
    return;
  }
  
  activeConnections.add(socket);
  
  socket.on('close', () => {
    activeConnections.delete(socket);
  });
});

/**
 * Gracefully shutdown the server and all resources
 * @param {string} signal - The signal that triggered shutdown
 * @param {number} code - Exit code
 */
function gracefulShutdown(signal, code = 0) {
  if (isShuttingDown) {
    console.log('Shutdown already in progress, forcing exit');
    process.exit(1);
  }
  
  isShuttingDown = true;
  consoleLogger.formatGracefulShutdown(signal);
  
  // Set shutdown timeout (30 seconds max)
  shutdownTimeout = setTimeout(() => {
    console.error('Graceful shutdown timeout reached, forcing exit');
    process.exit(1);
  }, 30000);
  
  // Stop accepting new connections
  server.close(() => {
    console.log('HTTP server closed');
    
    // Close all active connections
    const closePromises = Array.from(activeConnections).map(socket => {
      return new Promise((resolve) => {
        socket.end(() => {
          socket.destroy();
          resolve();
        });
      });
    });
    
    Promise.all(closePromises).then(() => {
      console.log('All active connections closed');
      
      // Redis decommissioned - proceed to finalize
      finalizeShutdown(code);
    });
  });
}

/**
 * Finalize the shutdown process
 * @param {number} code - Exit code
 */
function finalizeShutdown(code) {
  if (shutdownTimeout) {
    clearTimeout(shutdownTimeout);
  }
  
  console.log('Graceful shutdown completed');
  process.exit(code);
}

// Handle termination signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM', 0));
process.on('SIGINT', () => gracefulShutdown('SIGINT', 0));

// Handle uncaught exceptions and unhandled rejections
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  gracefulShutdown('UNCAUGHT_EXCEPTION', 1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('UNHANDLED_REJECTION', 1);
});

consoleLogger.formatMiddlewareRegistration('Graceful shutdown system');

// Export for testing
module.exports = app;