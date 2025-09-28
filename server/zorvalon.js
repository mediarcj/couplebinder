// File: zorvalon.js
// Description: Entry point for Detechify server
// Boot order: Express → Helmet → CORS → RateLimit → Parsers → Logging → Views → Routes → Error Handling → Start Server
// Notes: Console logs mark important checkpoints for audit and debugging

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const morgan = require('morgan');
const { v4: uuidv4 } = require('uuid');
const { config, logConfigSummary } = require('./config');
const { testConnection } = require('./db/connection');

// ============================================================
// STEP 1: Create Express App
// ============================================================
const app = express();

console.log('Detechify server starting...');
logConfigSummary();

// ============================================================
// STEP 1.5: Database Connection Test
// ============================================================
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
// STEP 1.6: In-Memory Storage
// ============================================================
const submissions = [];
const MAX_SUBMISSIONS = config.limits.maxSubmissions;

console.log('In-memory storage initialized');

// ============================================================
// STEP 2: Core Middleware Registration (ENFORCED ORDER)
// Helmet → CORS → RateLimit → Parsers → Logging → Routes
// ============================================================

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

// Session middleware
app.use(session({
  secret: config.security.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: config.server.nodeEnv === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: config.server.nodeEnv === 'production' ? 'strict' : 'lax'
  }
}));

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
app.use('/health', require('./routes/health'));

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
