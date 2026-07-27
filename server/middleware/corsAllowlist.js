/**
 * Description: Strict CORS allowlist with environment-based configuration
 *
 * Configures CORS to only allow requests from explicitly approved origins.
 * Supports an explicit origin list and development localhost.
 *
 * We never trust the client. Only our own domains should be able to make
 * cross-origin requests to our API.
 *
 * 1. Check explicit CORS_ORIGINS env var
 * 2. Allow localhost in development
 * 3. Deny all others with error
 */

const cors = require('cors');
const logger = require('../utils/logger');
const { config } = require('../config');

// Parse explicit allowed origins from config
const allowedList = (config.security.allowedOrigins || []);

const corsOptions = {
  origin: (origin, callback) => {
    // Same-origin / server-to-server / mobile apps: allow (no Origin header)
    if (!origin) return callback(null, true);
    
    // Check explicit allow list from CORS_ORIGINS env var
    if (allowedList.length > 0 && allowedList.includes(origin)) {
      return callback(null, true);
    }
    
    // Development: allow localhost
    const nodeEnv = config.server.nodeEnv;
    if (
      nodeEnv === 'development' &&
      /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/i.test(origin)
    ) {
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
