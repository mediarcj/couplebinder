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
 * 2. Allow BASE_DOMAIN (if set) and all subdomains, or fallback to couplebinder.com (legacy)
 * 3. Allow localhost in development
 * 4. Deny all others with error
 */

const cors = require('cors');
const logger = require('../utils/logger');
const { config } = require('../config');

// Parse explicit allowed origins from config
const allowedList = (config.security.allowedOrigins || []);

// Helper to escape regex special characters
function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Build regex from BASE_DOMAIN if set, otherwise null
const BASE_DOMAIN = config.branding.baseDomain;
const allowBaseDomain = BASE_DOMAIN
  ? new RegExp(`^https?:\\/\\/([a-z0-9-]+\\.)?${escapeRegex(BASE_DOMAIN)}(?::\\d+)?$`, 'i')
  : null;

// Regex to match any subdomain of couplebinder.com (legacy fallback)
const allowCouplebinder = /^https?:\/\/([a-z0-9-]+\.)?couplebinder\.com(?::\d+)?$/i;

const corsOptions = {
  origin: (origin, callback) => {
    // Same-origin / server-to-server / mobile apps: allow (no Origin header)
    if (!origin) return callback(null, true);
    
    // Check explicit allow list from CORS_ORIGINS env var
    if (allowedList.length > 0 && allowedList.includes(origin)) {
      return callback(null, true);
    }
    
    // Allow *.BASE_DOMAIN if set; otherwise fallback to *.couplebinder.com (legacy)
    if ((allowBaseDomain && allowBaseDomain.test(origin)) || allowCouplebinder.test(origin)) {
      return callback(null, true);
    }
    
    // Development: allow localhost
    const nodeEnv = config.server.nodeEnv;
    if (nodeEnv === 'development' && origin.includes('localhost')) {
      return callback(null, true);
    }
    
    // Deny all other origins
    logger.warn({
      event: 'cors.blocked_origin',
      origin,
      allowedList: allowedList.slice(0, 3)
    }, 'CORS blocked origin');
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
