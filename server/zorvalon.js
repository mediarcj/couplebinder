// File: zorvalon.js
// Description: Entry point for Detechify server
// Boot order: Express → Helmet → CORS → RateLimit → Parsers → Logging → Views → Routes → Error Handling → Start Server
// Notes: Console logs mark important checkpoints for audit and debugging

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const { v4: uuidv4 } = require('uuid');

// ============================================================
// STEP 1: Create Express App
// ============================================================
const app = express();
const PORT = process.env.PORT || 3000;

console.log('Detechify server starting...');

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
  origin: process.env.NODE_ENV === 'production' ? false : true,
  credentials: true,
  optionsSuccessStatus: 200
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Body parsers with size limits
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

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

console.log('Core middleware loaded: Helmet, CORS, Rate Limit, Body Parsers, Logging');

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

// Home page route
app.get('/', (req, res) => {
  res.render('index', { 
    title: 'Detechify',
    message: 'Welcome to Detechify - Building the future of tech detection'
  });
});

// Health check endpoints (following building laws)
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'Detechify server is running',
    timestamp: new Date().toISOString(),
    requestId: req.requestId
  });
});

app.get('/health/liveness', (req, res) => {
  res.json({ 
    status: 'alive',
    timestamp: new Date().toISOString(),
    requestId: req.requestId
  });
});

app.get('/health/readiness', (req, res) => {
  // Check if server is ready to accept requests
  const isReady = true; // In future, check database, Redis, etc.
  
  if (isReady) {
    res.json({ 
      status: 'ready',
      timestamp: new Date().toISOString(),
      requestId: req.requestId
    });
  } else {
    res.status(503).json({ 
      status: 'not ready',
      timestamp: new Date().toISOString(),
      requestId: req.requestId
    });
  }
});

// Hello world endpoint (as required by building laws)
app.get('/api/hello', (req, res) => {
  res.json({ message: 'hello world' });
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
app.listen(PORT, () => {
  console.log(`Detechify server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`Hello endpoint: http://localhost:${PORT}/api/hello`);
});
