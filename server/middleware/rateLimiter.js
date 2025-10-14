// File: server/middleware/rateLimiter.js
// Description: Redis-backed rate limiters for multi-instance safety
// Purpose: Shared rate limiting across all server instances using Redis
// Notes: Defense-in-depth behind Cloudflare edge protection

/**
 * WHAT:
 * Redis-backed rate limiters that work across multiple server instances.
 *
 * WHY:
 * In-memory rate limiters don't work across multiple instances or restarts.
 * Redis provides shared, persistent rate limit counters.
 *
 * HOW:
 * Use rate-limiter-flexible with Redis store.
 * Fall back to memory if Redis is unavailable.
 * Maintain same API as old in-memory version.
 */

const { RateLimiterRedis, RateLimiterMemory } = require('rate-limiter-flexible');
const logger = require('../utils/logger');

// ============================================================
// Environment Configuration
// ============================================================
const isProd = process.env.NODE_ENV === 'production';
const enabled = process.env.RATE_LIMIT_ENABLED !== 'false';         // default ON
const skipInDev = process.env.SKIP_RATE_LIMIT_IN_DEV === 'true';    // optional skip

// ============================================================
// Per-Route Configurations (same as before)
// ============================================================
const GENERAL_WINDOW_S   = Number(process.env.RATE_LIMIT_WINDOW_MS  || 60_000) / 1000;         // 60s
const GENERAL_MAX        = Number(process.env.RATE_LIMIT_MAX        || 300);

const LOGIN_WINDOW_S     = Number(process.env.LOGIN_WINDOW_MS       || 15 * 60_000) / 1000;    // 15m
const LOGIN_MAX          = Number(process.env.LOGIN_MAX             || 10);

const SIGNUP_WINDOW_S    = Number(process.env.SIGNUP_WINDOW_MS      || 60 * 60_000) / 1000;    // 1h
const SIGNUP_MAX         = Number(process.env.SIGNUP_MAX            || 5);

const LOGOUT_WINDOW_S    = Number(process.env.LOGOUT_WINDOW_MS      || 10 * 60_000) / 1000;    // 10m
const LOGOUT_MAX         = Number(process.env.LOGOUT_MAX            || 120);

const COOKIE_SET_WINDOW_S= Number(process.env.COOKIE_SET_WINDOW_MS  || 60_000) / 1000;         // 60s
const COOKIE_SET_MAX     = Number(process.env.COOKIE_SET_MAX        || 300);

// ============================================================
// Redis Client Setup
// Reuse the singleton Redis client from the app
// ============================================================
let redisClient = null;
try {
  const { client } = require('../utils/redisClient');
  redisClient = client && typeof client.ping === 'function' ? client : null;
} catch {
  // No Redis available, will use memory fallback
}

/**
 * WHAT:
 * Factory to build a rate limiter with Redis or memory fallback.
 * 
 * WHY:
 * Redis provides shared counters across instances.
 * Memory fallback ensures app works even if Redis is down.
 * 
 * HOW:
 * Try Redis first; if unavailable, use in-memory limiter.
 * Both implement the same consume() API.
 * 
 * @param {Object} options - Limiter configuration
 * @returns {RateLimiterRedis|RateLimiterMemory} Configured limiter
 */
function buildLimiter({ keyPrefix, points, durationSeconds }) {
  if (redisClient) {
    return new RateLimiterRedis({
      storeClient: redisClient,
      keyPrefix,
      points,
      duration: durationSeconds,
      execEvenly: false, // Small jitter helps burst shaping
    });
  }
  
  // Fallback to memory (per-process only, but better than nothing)
  return new RateLimiterMemory({
    keyPrefix,
    points,
    duration: durationSeconds,
  });
}

// ============================================================
// Create Limiters for Each Route Type
// ============================================================
const limiters = {
  general:   buildLimiter({ keyPrefix: 'rl:general',    points: GENERAL_MAX,   durationSeconds: GENERAL_WINDOW_S }),
  login:     buildLimiter({ keyPrefix: 'rl:login',      points: LOGIN_MAX,     durationSeconds: LOGIN_WINDOW_S }),
  signup:    buildLimiter({ keyPrefix: 'rl:signup',     points: SIGNUP_MAX,    durationSeconds: SIGNUP_WINDOW_S }),
  logout:    buildLimiter({ keyPrefix: 'rl:logout',     points: LOGOUT_MAX,    durationSeconds: LOGOUT_WINDOW_S }),
  cookieSet: buildLimiter({ keyPrefix: 'rl:cookieSet',  points: COOKIE_SET_MAX,durationSeconds: COOKIE_SET_WINDOW_S }),
};

/**
 * WHAT:
 * Normalize a per-request key for rate limiting.
 * 
 * WHY:
 * Consistent key format ensures accurate rate limiting.
 * Uses IP + method + path for granular control.
 * 
 * HOW:
 * Prefer Cloudflare-extracted IP (req.clientIp).
 * Combine with HTTP method and path.
 * 
 * @param {Object} req - Express request object
 * @returns {string} Rate limit key
 */
function keyFor(req) {
  const ip = req.clientIp || req.ip || 'unknown';
  const method = req.method || 'GET';
  const path = `${req.baseUrl || ''}${req.path || ''}`;
  return `${ip}:${method}:${path}`;
}

/**
 * WHAT:
 * Generic middleware factory for rate limiting.
 * 
 * WHY:
 * Reusable pattern for all route types.
 * Consistent error handling and headers.
 * 
 * HOW:
 * Try to consume from limiter.
 * On success: set headers and continue.
 * On rejection: return 429 with Retry-After.
 * 
 * @param {RateLimiter} limiter - Configured rate limiter
 * @param {string} name - Limiter name for logging
 * @param {number} limit - Max requests allowed
 * @param {number} windowSeconds - Time window in seconds
 * @returns {Function} Express middleware
 */
function limiterMiddleware(limiter, name, limit, windowSeconds) {
  return async (req, res, next) => {
    try {
      // Skip if disabled or in dev mode with skip flag
      if (!enabled || (!isProd && skipInDev)) {
        return next();
      }

      const key = keyFor(req);
      const rlRes = await limiter.consume(key, 1);

      /**
       * WHAT:
       * Set rate limit headers for client visibility.
       * 
       * WHY:
       * Clients and proxies need to know their limit status.
       * Standard headers enable better client behavior.
       * 
       * HOW:
       * X-RateLimit-Limit: Total allowed
       * X-RateLimit-Remaining: Requests left
       * X-RateLimit-Reset: Unix timestamp when window resets
       */
      const resetAt = Math.ceil((Date.now() + rlRes.msBeforeNext) / 1000);
      res.set('X-RateLimit-Limit', String(limit));
      res.set('X-RateLimit-Remaining', String(Math.max(0, limit - rlRes.consumedPoints)));
      res.set('X-RateLimit-Reset', String(resetAt));

      return next();
    } catch (rejRes) {
      /**
       * WHAT:
       * Handle rate limit exceeded (429 response).
       * 
       * WHY:
       * Client needs to know they're throttled and when to retry.
       * 
       * HOW:
       * Calculate retry time from rejection response.
       * Set Retry-After header.
       * Return 429 with error message.
       */
      const ms = typeof rejRes?.msBeforeNext === 'number' ? rejRes.msBeforeNext : windowSeconds * 1000;
      const retryAfter = Math.ceil(ms / 1000);

      logger.info({
        event: `${name}.exceeded`,
        ip: req.clientIp || req.ip,
        path: req.path,
        retryAfter,
        requestId: req.requestId
      }, 'Rate limit exceeded');

      res.set('Retry-After', String(retryAfter));
      res.set('X-RateLimit-Limit', String(limit));
      res.set('X-RateLimit-Remaining', '0');
      res.set('X-RateLimit-Reset', String(Math.ceil((Date.now() + ms) / 1000)));

      return res.status(429).json({
        ok: false,
        error: 'Too many requests. Please try again later.',
        retryAfter
      });
    }
  };
}

// ============================================================
// Public API (same names as before for backward compatibility)
// ============================================================

/**
 * General rate limiter for API endpoints
 */
function generalLimiter()  {
  return limiterMiddleware(limiters.general, 'general_rate_limit', GENERAL_MAX, GENERAL_WINDOW_S);
}

/**
 * Strict rate limiter for login attempts
 */
function loginLimiter() {
  return limiterMiddleware(limiters.login, 'login_rate_limit', LOGIN_MAX, LOGIN_WINDOW_S);
}

/**
 * Very strict rate limiter for signup attempts
 */
function signupLimiter() {
  return limiterMiddleware(limiters.signup, 'signup_rate_limit', SIGNUP_MAX, SIGNUP_WINDOW_S);
}

/**
 * Lenient rate limiter for logout
 */
function logoutLimiter() {
  return limiterMiddleware(limiters.logout, 'logout_rate_limit', LOGOUT_MAX, LOGOUT_WINDOW_S);
}

/**
 * Lenient rate limiter for cookie set
 */
function cookieSetLimiter() {
  return limiterMiddleware(limiters.cookieSet, 'cookie_set_rate_limit', COOKIE_SET_MAX, COOKIE_SET_WINDOW_S);
}

module.exports = {
  generalLimiter,
  loginLimiter,
  signupLimiter,
  logoutLimiter,
  cookieSetLimiter
};
