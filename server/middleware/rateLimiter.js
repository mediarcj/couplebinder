// File: server/middleware/rateLimiter.js
// Description: Application-layer rate limiting for defense-in-depth
// Purpose: Protect against abuse even if edge CDN fails or misconfigures
// Notes: Simple token-bucket implementation with automatic cleanup

/**
 * WHAT:
 * Local rate limiting as a safety net behind Cloudflare edge protection.
 *
 * WHY:
 * Defense-in-depth principle: never rely on a single layer.
 * If Cloudflare misconfigures or goes offline, we still have protection.
 *
 * HOW:
 * Token-bucket algorithm with in-memory storage. For distributed deployments,
 * consider Redis-backed rate limiting.
 */

const logger = require('../utils/logger');

// Configuration from environment with safe defaults
const GENERAL_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000); // 1 minute
const GENERAL_MAX = Number(process.env.RATE_LIMIT_MAX || 120); // 120 req/min

const AUTH_WINDOW_MS = Number(process.env.LOGIN_WINDOW_MS || 15 * 60_000); // 15 minutes
const AUTH_MAX = Number(process.env.LOGIN_MAX || 10); // 10 attempts per 15 min

// In-memory storage for rate limit tracking
// CRITICAL SECTION: Shared state accessed by concurrent requests
const generalLimits = new Map(); // key: IP, value: { count, resetAt }
const authLimits = new Map();    // key: IP, value: { count, resetAt }

// Cleanup old entries every 5 minutes to prevent memory leak
setInterval(() => {
  const now = Date.now();
  for (const [ip, data] of generalLimits.entries()) {
    if (now > data.resetAt) generalLimits.delete(ip);
  }
  for (const [ip, data] of authLimits.entries()) {
    if (now > data.resetAt) authLimits.delete(ip);
  }
}, 5 * 60_000);

/**
 * Generic rate limiter factory
 */
function createRateLimiter(store, windowMs, max, name = 'rate_limit') {
  return (req, res, next) => {
    const ip = req.clientIp || req.ip || 'unknown';
    const now = Date.now();
    
    // Get or create limit entry for this IP
    let entry = store.get(ip);
    
    if (!entry || now > entry.resetAt) {
      // Create new window
      entry = { count: 0, resetAt: now + windowMs };
      store.set(ip, entry);
    }
    
    // Increment request count
    entry.count += 1;
    
    // Check if limit exceeded
    if (entry.count > max) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      
      logger.info({
        event: `${name}.exceeded`,
        ip,
        count: entry.count,
        max,
        retryAfter,
        requestId: req.requestId
      }, 'Rate limit exceeded');
      
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({
        ok: false,
        error: 'Too many requests. Please try again later.',
        retryAfter
      });
    }
    
    // Set rate limit headers
    res.set('X-RateLimit-Limit', String(max));
    res.set('X-RateLimit-Remaining', String(Math.max(0, max - entry.count)));
    res.set('X-RateLimit-Reset', String(Math.ceil(entry.resetAt / 1000)));
    
    next();
  };
}

/**
 * General rate limiter for API endpoints
 */
function generalLimiter() {
  return createRateLimiter(generalLimits, GENERAL_WINDOW_MS, GENERAL_MAX, 'general_rate_limit');
}

/**
 * Strict rate limiter for authentication endpoints
 */
function authLimiter() {
  return createRateLimiter(authLimits, AUTH_WINDOW_MS, AUTH_MAX, 'auth_rate_limit');
}

module.exports = { generalLimiter, authLimiter };

