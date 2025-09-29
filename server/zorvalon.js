// File: zorvalon.js
// Description: Entry point for Detechify server - Refactored for better organization
// Boot order: Express → Database → Redis → Security → Middleware → Routes → Error Handling → Start Server → Graceful Shutdown
// Notes: Console logs mark important checkpoints for audit and debugging

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const session = require('express-session');
const redis = require('redis');
const morgan = require('morgan');
const path = require('path');
const crypto = require('node:crypto');

// Application Configuration and Dependencies
const { config, logConfigSummary } = require('./config');
const { testConnection } = require('./db/connection');
const { addCSRFToken, validateCSRF } = require('./middleware/csrf');
const requestIdMiddleware = require('./middleware/requestId');
const logger = require('./utils/logger');
const consoleLogger = require('./utils/consoleLogger');
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

console.log('Detechify server starting...');
consoleLogger.formatConfigSummary(config);

// ============================================================
// STEP 2: Database Connection and Testing
// ============================================================

/**
 * WHAT:
 * We test the database connection to ensure we can store and retrieve data.
 *
 * WHY:
 * The database is critical for user authentication, sessions, and data storage.
 * We need to know if it's working before accepting user requests.
 *
 * HOW:
 * We call the testConnection function which handles errors gracefully.
 * If the database is unavailable, we log the error but continue startup.
 */
testConnection()
    .then(() => {
        console.log('Database connection established');
    })
    .catch((error) => {
        console.error('Database connection failed:', error.message);
        console.log('Continuing startup without database...');
    });

// ============================================================
// STEP 3: Redis Client Creation and Connection
// ============================================================

/**
 * WHAT:
 * We create and configure a Redis client for session storage and caching.
 *
 * WHY:
 * Redis provides persistent session storage across server restarts and enables
 * horizontal scaling with multiple server instances.
 *
 * HOW:
 * We use the improved Redis client with retry strategy and error handling.
 * If Redis is unavailable, we fall back to in-memory session storage.
 */
let redisClient = null;
let RedisStore = null;

try {
    // Import RedisStore and improved Redis client
    RedisStore = require('connect-redis').default;
    const { client, connectRedis } = require('./utils/redisClient');
    
    redisClient = client;
    
    // Initialize Redis connection
    const initializeRedis = async () => {
        try {
            await connectRedis();
            updateRedisStatus(true, new Date().toISOString());
        } catch (error) {
            console.error('Redis connection failed:', error.message);
            console.log('Continuing without Redis sessions...');
            updateRedisStatus(false, new Date().toISOString());
        }
    };
    
    initializeRedis().catch(() => {
        // Error already handled in initializeRedis
    });
    
} catch (error) {
    console.error('Redis client creation failed:', error.message);
    console.log('Continuing without Redis sessions...');
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

// Nonce generation middleware for CSP
app.use((req, res, next) => {
  // Generate a unique nonce for each request
  const nonce = crypto.randomBytes(16).toString('base64');
  res.locals.nonce = nonce;
  next();
});

// Security headers (Helmet) - Enterprise-level security without CSP (handled by custom middleware)
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
      "connect-src 'self' https://api.detechify.com wss://detechify.com https://www.google-analytics.com https://analytics.google.com https://maps.googleapis.com",
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

// CORS configuration - Enterprise-level balance of security and usability
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    
    // In development, allow all origins for easier testing
    if (config.server.nodeEnv === 'development') {
      return callback(null, true);
    }
    
    // In production, allow specific trusted domains
    const allowedOrigins = [
      'https://detechify.com',
      'https://www.detechify.com',
      'https://app.detechify.com',
      'https://admin.detechify.com'
    ];
    
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    // Log blocked origins for monitoring
    logger.warn('CORS blocked origin', { origin, nodeEnv: config.server.nodeEnv });
    callback(new Error('Not allowed by CORS policy'));
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

// HTTP request logging middleware
app.use(morgan('combined', {
  stream: {
    write: (message) => {
      // Use structured logger for HTTP requests
      logger.info('HTTP request', { message: message.trim() });
    }
  }
}));

// Body parsers with size limits
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Cookie parsing middleware - must be before sessions and CSRF
const parseCookies = require('./middleware/cookieGuardian');
app.use(parseCookies);

// Session middleware with Redis store (if available) or memory store
// Enterprise-level session configuration for better user experience
if (redisClient && RedisStore) {
  app.use(session({
    store: new RedisStore({ 
      client: redisClient,
      ttl: 7 * 24 * 60 * 60 // 7 days in Redis
    }),
    secret: config.security.sessionSecret,
    resave: false,
    saveUninitialized: false,
    rolling: true, // Reset expiration on activity
    cookie: {
      secure: config.server.nodeEnv === 'production',
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days (enterprise standard)
      sameSite: 'lax' // Better UX than 'strict' while maintaining security
    },
    name: 'detechify.sid'
  }));
  console.log('Session middleware configured with Redis store');
} else {
  app.use(session({
    secret: config.security.sessionSecret,
    resave: false,
    saveUninitialized: false,
    rolling: true, // Reset expiration on activity
    cookie: {
      secure: false,
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days (enterprise standard)
      sameSite: 'lax' // Better UX than 'strict' while maintaining security
    },
    name: 'detechify.sid'
  }));
  console.log('Session middleware configured with memory store');
}

// Request ID middleware - add unique ID to every request
app.use(requestIdMiddleware);

// Request timing middleware for formatted logging
app.use((req, res, next) => {
  const startTime = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    // Use structured logger for file/JSON logs
    logger.request(req, res, duration);
    // Use formatted logger for terminal display
    consoleLogger.formatRequest(req, res, duration);
  });
  
  next();
});

consoleLogger.formatMiddlewareRegistration('Core middleware');

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
// Add CSRF protection middleware
app.use(addCSRFToken);

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

// Import modular routes with CSRF protection for state-changing requests
app.use('/api/auth', validateCSRF, require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/page', require('./routes/pageApi'));
app.use('/api', validateCSRF, require('./routes/api'));
app.use('/api', validateCSRF, require('./routes/submissions'));

// Import health routes with Redis status update function
const { router: healthRouter, updateRedisStatus } = require('./routes/health');
app.use('/health', healthRouter);
app.use('/dashboard', require('./routes/dashboard'));

// Initialize submissions route with shared storage
const submissionsRouter = require('./routes/submissions');
const submissions = [];
submissionsRouter.setSubmissions(submissions);

// Import presenters
const { buildHomePageModel } = require('./ui_contract/presenters');

// Home page route
app.get('/', (req, res) => {
  try {
    // Build page model using presenter
    const pageModel = buildHomePageModel(req, res);
    
    // Add nonce to page model for EJS template
    pageModel.nonce = res.locals.nonce;
    
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
  const errorId = req.requestId || crypto.randomUUID();
  
  logger.error('Server error occurred', {
    requestId: errorId,
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip
  });
  
  res.status(500).json({ 
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
    database: `${config.database.host}:${config.database.port}/${config.database.name}`,
    redis: redisClient ? 'Connected' : 'Not available',
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
      
      // Close Redis connection
      if (redisClient) {
        const { disconnectRedis } = require('./utils/redisClient');
        disconnectRedis().then(() => {
          finalizeShutdown(code);
        }).catch((err) => {
          console.error('Error closing Redis connection:', err.message);
          finalizeShutdown(code);
        });
      } else {
        finalizeShutdown(code);
      }
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