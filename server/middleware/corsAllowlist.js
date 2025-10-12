/**
 * File: server/middleware/corsAllowlist.js
 * Description: Strict CORS allowlist with environment-based configuration
 *
 * WHAT:
 * Configures CORS to only allow requests from explicitly approved origins.
 * Supports explicit list, subdomain patterns, and development localhost.
 *
 * WHY:
 * We never trust the client. Only our own domains should be able to make
 * cross-origin requests to our API.
 *
 * HOW:
 * 1. Check explicit CORS_ORIGINS env var
 * 2. Allow detechify.com and all subdomains
 * 3. Allow localhost in development
 * 4. Deny all others with error
 */

const cors = require('cors');

// Parse explicit allowed origins from environment
const allowedList = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

// Regex to match any subdomain of detechify.com
const allowDetechify = /^https?:\/\/([a-z0-9-]+\.)?detechify\.com(?::\d+)?$/i;

const corsOptions = {
  origin: (origin, callback) => {
    // Same-origin / server-to-server / mobile apps: allow (no Origin header)
    if (!origin) return callback(null, true);
    
    // Check explicit allow list from CORS_ORIGINS env var
    if (allowedList.length > 0 && allowedList.includes(origin)) {
      return callback(null, true);
    }
    
    // Check if origin matches *.detechify.com pattern
    if (allowDetechify.test(origin)) {
      return callback(null, true);
    }
    
    // Development: allow localhost
    const nodeEnv = process.env.NODE_ENV || 'production';
    if (nodeEnv === 'development' && origin.includes('localhost')) {
      return callback(null, true);
    }
    
    // Deny all other origins
    console.warn('CORS: Blocked origin', { origin, allowedList: allowedList.slice(0, 3) });
    return callback(new Error('Not allowed by CORS policy'));
  },
  
  // Allow credentials (cookies, authorization headers)
  credentials: true,
  
  // Allowed HTTP methods
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  
  // Allowed request headers
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-CSRF-Token',
    'X-Request-ID',
    'X-Idempotency-Key',
    'Accept',
    'Origin',
    'X-Requested-With'
  ],
  
  // Exposed headers (client can read these)
  exposedHeaders: ['X-CSRF-Token', 'X-Request-ID', 'X-RateLimit-Limit', 'X-RateLimit-Remaining'],
  
  // Cache preflight for 24 hours
  maxAge: 86400
};

module.exports = cors(corsOptions);
