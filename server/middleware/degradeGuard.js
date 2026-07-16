// Description: Degrade sensitive paths when Redis is unavailable
// Purpose: Fail-closed for sensitive operations when Redis is down
// Notes: Mounts early, after request-id & security headers, before routes

const logger = require('../utils/logger');

/**
 * We block sensitive paths when Redis is unavailable to prevent data inconsistency.
 *
 * Sensitive operations require Redis for rate limiting, sessions, and caching.
 * Without Redis, we risk data corruption or security bypasses.
 *
 * We check app.locals.redisReady and return 503 for sensitive paths.
 * Non-sensitive paths continue to work normally.
 */

// Sensitive paths that require Redis
const SENSITIVE_PATHS = [
  /^\/api\/(auth|users|profile|submissions)/,
  /^\/dashboard/,
  /^\/profile/
];

/**
 * Check if a path is sensitive and requires Redis
 * @param {string} path - Request path
 * @returns {boolean} - True if path is sensitive
 */
function isSensitivePath(path) {
  return SENSITIVE_PATHS.some(pattern => pattern.test(path));
}

/**
 * Redis degrade guard middleware
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
function degradeGuard(req, res, next) {
  const path = req.path || '';
  
  // Skip if Redis is ready
  if (req.app.locals.redisReady) {
    return next();
  }
  
  // Skip non-sensitive paths
  if (!isSensitivePath(path)) {
    return next();
  }
  
  // Block sensitive paths when Redis is down
  logger.warn({
    event: 'degrade.blocked_sensitive_path',
    path,
    method: req.method,
    clientIp: req.clientIp || req.ip,
    reason: 'redis_unavailable'
  }, 'Blocking sensitive path due to Redis outage');
  
  res.status(503).json({
    error: 'degraded_mode',
    message: 'Service temporarily unavailable',
    reason: 'redis_unavailable',
    retryAfter: 30
  });
}

module.exports = degradeGuard;
