// File: zorvalon.js
// Description: Entry point for Detechify server
// Boot order: Express → Helmet → CORS → RateLimit → Parsers → Logging → Views → Routes → Error Handling → Start Server
// Notes: Console logs mark important checkpoints for audit and debugging

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const RedisStore = require('connect-redis').default;
const redis = require('redis');
const morgan = require('morgan');
const { v4: uuidv4 } = require('uuid');
const { config, logConfigSummary } = require('./config');
const { testConnection } = require('./db/connection');

// ============================================================
// STEP 1: Create Express App
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
logConfigSummary();

// ============================================================
// STEP 1.5: Database Connection Test
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
 * We call a test function that tries to connect and run a simple query.
 * If it fails, we log the error but continue startup so the app can still serve static pages.
 */
async function initializeDatabase() {
  try {
    const connected = await testConnection();
    if (connected) {
        console.log('Database connection established');
      } else {
        console.log('Database connection failed - continuing without database');
    }
  } catch (error) {
    console.log('Database initialization error:', error.message);
  }
}

// Initialize database connection
initializeDatabase();

// ============================================================
// STEP 1.6: Redis Client Creation
// ============================================================

/**
 * WHAT:
 * We create a Redis client for storing user sessions and caching data.
 *
 * WHY:
 * Redis provides fast, persistent session storage that survives server restarts.
 * This is essential for production scalability and session security.
 *
 * HOW:
 * We configure the Redis client with connection settings from environment variables.
 * If Redis is unavailable, we fall back to in-memory session storage.
 */
let redisClient;

      try {
        const redisConfig = {
          socket: {
            host: config.redis.host,
            port: config.redis.port,
            connectTimeout: 5000,
            lazyConnect: true
          },
          retry_strategy: (options) => {
            if (options.error && options.error.code === 'ECONNREFUSED') {
              return new Error('Redis server connection refused');
            }
            if (options.total_retry_time > 1000 * 60 * 60) {
              return new Error('Retry time exhausted');
            }
            if (options.attempt > 10) {
              return undefined;
            }
            return Math.min(options.attempt * 100, 3000);
          }
        };

        // Add password only if provided
        if (config.redis.password) {
          redisConfig.password = config.redis.password;
        }

        redisClient = redis.createClient(redisConfig);

  redisClient.on('error', (err) => {
    console.error('Redis client error:', err.message);
    updateRedisStatus(false);
  });

  redisClient.on('connect', () => {
    console.log('Redis client connected');
    updateRedisStatus(true);
  });

  console.log('Redis client created');
} catch (error) {
  console.log('Redis client creation failed:', error.message);
}

// ============================================================
// STEP 1.7: Redis Connection Initialization
// ============================================================

/**
 * WHAT:
 * We establish the actual connection to the Redis server after creating the client.
 *
 * WHY:
 * The Redis client needs to connect to the server before we can store session data.
 * Without this connection, session storage will fail and users won't stay logged in.
 *
 * HOW:
 * We attempt to connect to Redis using the configured client.
 * If connection fails, we log the error but continue startup with memory sessions.
 */
async function initializeRedis() {
  if (!redisClient) {
    console.log('Redis client not available - skipping Redis initialization');
    return;
  }
  
  try {
    await redisClient.connect();
    console.log('Redis connection established');
    updateRedisStatus(true);
  } catch (error) {
    console.log('Redis connection failed - continuing without Redis sessions:', error.message);
    updateRedisStatus(false);
  }
}

// Initialize Redis connection
initializeRedis();

// ============================================================
// STEP 1.8: In-Memory Storage
// ============================================================

/**
 * WHAT:
 * We set up temporary in-memory storage for user submissions and data.
 *
 * WHY:
 * This provides a fallback storage mechanism when the database is unavailable.
 * It also serves as a simple data store for development and testing.
 *
 * HOW:
 * We create arrays to hold user data and apply size limits from configuration.
 * Data is lost when the server restarts, which is expected for this temporary storage.
 */
const submissions = [];
const MAX_SUBMISSIONS = config.limits.maxSubmissions;

console.log('In-memory storage initialized');

// ============================================================
// STEP 2: Core Middleware Registration (ENFORCED ORDER)
// Helmet → CORS → RateLimit → Parsers → Session → Logging → Routes
// ============================================================

/**
 * WHAT:
 * We register all core middleware in a specific order that ensures proper security and functionality.
 *
 * WHY:
 * Middleware order matters because each layer processes requests before the next.
 * Security middleware must come first to protect against attacks.
 *
 * HOW:
 * We apply middleware in this order: security headers, CORS, rate limiting, body parsing, sessions, logging.
 * Each middleware runs on every request before reaching our route handlers.
 */

// Security headers (Helmet)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  crossOriginEmbedderPolicy: false
}));

// CORS configuration
app.use(cors({
  origin: config.server.nodeEnv === 'production' ? false : true,
  credentials: true,
  optionsSuccessStatus: 200
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  message: {
    error: config.rateLimit.message
  },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Body parsers with size limits
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Session middleware with Redis store (if available) or memory store
if (redisClient && RedisStore) {
  app.use(session({
    store: new RedisStore({ client: redisClient }),
    secret: config.security.sessionSecret,
    resave: false,
    saveUninitialized: false, // Changed to false for production security
    cookie: {
      secure: false, // Set to false for development/testing
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      sameSite: 'lax' // Set to lax for development
    },
    name: 'detechify.sid' // Custom session cookie name
  }));
  console.log('Session middleware configured with Redis store');
} else {
  app.use(session({
    secret: config.security.sessionSecret,
    resave: false,
    saveUninitialized: true,
    cookie: {
      secure: false, // Set to false for development
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      sameSite: 'lax'
    }
  }));
  console.log('Session middleware configured with memory store (fallback)');
}

// Request ID middleware - add unique ID to every request
app.use((req, res, next) => {
  req.requestId = uuidv4();
  res.setHeader('X-Request-ID', req.requestId);
  next();
});

// Structured logging with Morgan
app.use(morgan(':method :url :status :response-time ms - :req[X-Request-ID]', {
  stream: {
    write: (message) => {
      console.log(`[${new Date().toISOString()}] ${message.trim()}`);
    }
  }
}));

console.log('Core middleware loaded: Helmet, CORS, Rate Limit, Body Parsers, Session, Logging');

// ============================================================
// STEP 3: View Engine / Static Assets
// ============================================================

// Set EJS as the view engine
app.set('view engine', 'ejs');
app.set('views', './ejs');

// Serve static files from public directory
app.use(express.static('public'));

console.log('View engine and static assets configured');

// ============================================================
// STEP 4: Routes
// ============================================================

// Import modular routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api', require('./routes/api'));
app.use('/api', require('./routes/submissions'));
// Import health routes with Redis status update function
const { router: healthRouter, updateRedisStatus } = require('./routes/health');
app.use('/health', healthRouter);
app.use('/dashboard', require('./routes/dashboard'));

// Initialize submissions route with shared storage
const submissionsRouter = require('./routes/submissions');
submissionsRouter.setSubmissions(submissions);

// Home page route
app.get('/', (req, res) => {
  res.render('index', { 
    title: 'Detechify',
    message: 'Welcome to Detechify - Building the future of tech detection',
    textMinLength: config.limits.textMinLength,
    textMaxLength: config.limits.textMaxLength
  });
});

// ============================================================
// STEP 5: Error Handling
// ============================================================
app.use((err, req, res, next) => {
  const errorId = req.requestId || uuidv4();
  console.error(`[${new Date().toISOString()}] Server error [${errorId}]:`, {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method
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
    requestId: req.requestId,
    timestamp: new Date().toISOString()
  });
});

// ============================================================
// STEP 6: Start Server
// ============================================================
app.listen(config.server.port, config.server.host, () => {
  console.log(`Detechify server running on ${config.server.host}:${config.server.port}`);
  console.log(`Health check: http://localhost:${config.server.port}/health`);
  console.log(`Hello endpoint: http://localhost:${config.server.port}/api/hello`);
  console.log(`UI config endpoint: http://localhost:${config.server.port}/api/ui-config`);
  console.log(`Submissions endpoint: http://localhost:${config.server.port}/api/submissions`);
});
