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
// I am loading `../utils/logger` into `logger` so this file can reuse that dependency below.
const logger = require('../utils/logger');
// I am loading `../config` into `config` so this file can reuse that dependency below.
const { config } = require('../config');

// Parse explicit allowed origins from config
const allowedList = (config.security.allowedOrigins || []);

// Helper to escape regex special characters
function escapeRegex(s) {
  // This return sends the completed value or response back to the code that called this function.
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// Build regex from BASE_DOMAIN if set, otherwise null
const BASE_DOMAIN = config.branding.baseDomain;
// I am saving `allowBaseDomain` here so the nearby steps can reuse the same value without rebuilding it each time.
const allowBaseDomain = BASE_DOMAIN
  // I am keeping this line here because the surrounding corsAllowlist.js workflow expects this value or operation before it continues.
  ? new RegExp(`^https?:\\/\\/([a-z0-9-]+\\.)?${escapeRegex(BASE_DOMAIN)}(?::\\d+)?$`, 'i')
  // I am keeping this line here because the surrounding corsAllowlist.js workflow expects this value or operation before it continues.
  : null;

// Regex to match any subdomain of couplebinder.com (legacy fallback)
const allowCouplebinder = /^https?:\/\/([a-z0-9-]+\.)?couplebinder\.com(?::\d+)?$/i;

// I am saving `corsOptions` here so the nearby steps can reuse the same value without rebuilding it each time.
const corsOptions = {
  // I am keeping the `origin` field in this object so the receiving code can read that value by its expected name.
  origin: (origin, callback) => {
    // Same-origin / server-to-server / mobile apps: allow (no Origin header)
    if (!origin) return callback(null, true);
    
    // Check explicit allow list from CORS_ORIGINS env var
    if (allowedList.length > 0 && allowedList.includes(origin)) {
      // This return sends the completed value or response back to the code that called this function.
      return callback(null, true);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    
    // Allow *.BASE_DOMAIN if set; otherwise fallback to *.couplebinder.com (legacy)
    if ((allowBaseDomain && allowBaseDomain.test(origin)) || allowCouplebinder.test(origin)) {
      // This return sends the completed value or response back to the code that called this function.
      return callback(null, true);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    
    // Development: allow localhost
    const nodeEnv = config.server.nodeEnv;
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (nodeEnv === 'development' && origin.includes('localhost')) {
      // This return sends the completed value or response back to the code that called this function.
      return callback(null, true);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    
    // Deny all other origins
    logger.warn({
      // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
      event: 'cors.blocked_origin',
      // I am keeping this line here because the surrounding corsAllowlist.js workflow expects this value or operation before it continues.
      origin,
      // I am keeping the `allowedList` field in this object so the receiving code can read that value by its expected name.
      allowedList: allowedList.slice(0, 3)
    // I am keeping this line here because the surrounding corsAllowlist.js workflow expects this value or operation before it continues.
    }, 'CORS blocked origin');
    // This return sends the completed value or response back to the code that called this function.
    return callback(new Error('Not allowed by CORS policy'));
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  },
  
  // Allow credentials (cookies, authorization headers)
  credentials: true,
  
  // Allowed HTTP methods
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  
  // Allowed request headers
  allowedHeaders: [
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    'Content-Type',
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    'Authorization',
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    'X-CSRF-Token',
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    'X-Request-ID',
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    'X-Idempotency-Key',
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    'Accept',
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    'Origin',
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    'X-Requested-With'
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  ],
  
  // Exposed headers (client can read these)
  exposedHeaders: ['X-CSRF-Token', 'X-Request-ID', 'X-RateLimit-Limit', 'X-RateLimit-Remaining'],
  
  // Cache preflight for 24 hours
  maxAge: 86400
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
};

// I am exporting this value here so another module can deliberately reuse the completed piece from corsAllowlist.js.
module.exports = cors(corsOptions);
