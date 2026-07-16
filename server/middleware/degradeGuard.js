// File: server/middleware/degradeGuard.js
// Description: Degrade sensitive paths when Redis is unavailable
// Purpose: Fail-closed for sensitive operations when Redis is down
// Notes: Mounts early, after request-id & security headers, before routes

const logger = require('../utils/logger');

/**
 * WHAT:
 * We block sensitive paths when Redis is unavailable to prevent data inconsistency.
 *
 * WHY:
 * Sensitive operations require Redis for rate limiting, sessions, and caching.
 * Without Redis, we risk data corruption or security bypasses.
 *
 * HOW:
 * We check app.locals.redisReady and return 503 for sensitive paths.
 * Non-sensitive paths continue to work normally.
 */

// Sensitive paths that require Redis
const SENSITIVE_PATHS = [
  // I am keeping this line here because the surrounding degradeGuard.js workflow expects this value or operation before it continues.
  /^\/api\/(auth|users|profile|submissions)/,
  // I am keeping this line here because the surrounding degradeGuard.js workflow expects this value or operation before it continues.
  /^\/dashboard/,
  // I am keeping this line here because the surrounding degradeGuard.js workflow expects this value or operation before it continues.
  /^\/profile/
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
];

/**
 * Check if a path is sensitive and requires Redis
 * @param {string} path - Request path
 * @returns {boolean} - True if path is sensitive
 */
function isSensitivePath(path) {
  // This return sends the completed value or response back to the code that called this function.
  return SENSITIVE_PATHS.some(pattern => pattern.test(path));
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * Redis degrade guard middleware
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
function degradeGuard(req, res, next) {
  // I am saving `path` here so the nearby steps can reuse the same value without rebuilding it each time.
  const path = req.path || '';
  
  // Skip if Redis is ready
  if (req.app.locals.redisReady) {
    // This return sends the completed value or response back to the code that called this function.
    return next();
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
  
  // Skip non-sensitive paths
  if (!isSensitivePath(path)) {
    // This return sends the completed value or response back to the code that called this function.
    return next();
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
  
  // Block sensitive paths when Redis is down
  logger.warn({
    // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
    event: 'degrade.blocked_sensitive_path',
    // I am keeping this line here because the surrounding degradeGuard.js workflow expects this value or operation before it continues.
    path,
    // I am keeping the `method` field in this object so the receiving code can read that value by its expected name.
    method: req.method,
    // I am keeping the `clientIp` field in this object so the receiving code can read that value by its expected name.
    clientIp: req.clientIp || req.ip,
    // I am keeping the `reason` field in this object so the receiving code can read that value by its expected name.
    reason: 'redis_unavailable'
  // I am keeping this line here because the surrounding degradeGuard.js workflow expects this value or operation before it continues.
  }, 'Blocking sensitive path due to Redis outage');
  
  // I am building or sending the Express response here with the status, data, or page already chosen by this route.
  res.status(503).json({
    // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
    error: 'degraded_mode',
    // I am keeping the `message` field in this object so the receiving code can read that value by its expected name.
    message: 'Service temporarily unavailable',
    // I am keeping the `reason` field in this object so the receiving code can read that value by its expected name.
    reason: 'redis_unavailable',
    // I am keeping the `retryAfter` field in this object so the receiving code can read that value by its expected name.
    retryAfter: 30
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am exporting this value here so another module can deliberately reuse the completed piece from degradeGuard.js.
module.exports = degradeGuard;
