// File: zorvalon.js
// Description: Entry point for Detechify server
// Boot order: Express → Helmet → CORS → RateLimit → Parsers → Routes → Error Handling → Start Server
// Notes: Console logs mark important checkpoints for audit and debugging

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

// ============================================================
// STEP 1: Create Express App
// ============================================================
const app = express();
const PORT = process.env.PORT || 3000;

console.log('Detechify server starting...');

// ============================================================
// STEP 2: Core Middleware Registration (ENFORCED ORDER)
// Helmet → CORS → RateLimit → Parsers → Routes
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

console.log('Core middleware loaded: Helmet, CORS, Rate Limit, Body Parsers');

// ============================================================
// STEP 3: Routes
// ============================================================

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Detechify server is running' });
});

// Hello world endpoint (as required by building laws)
app.get('/api/hello', (req, res) => {
  res.json({ message: 'hello world' });
});

// ============================================================
// STEP 4: Error Handling
// ============================================================
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ============================================================
// STEP 5: Start Server
// ============================================================
app.listen(PORT, () => {
  console.log(`Detechify server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`Hello endpoint: http://localhost:${PORT}/api/hello`);
});
