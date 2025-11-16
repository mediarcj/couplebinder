// File: server/middleware/rateLimiter.js
// Description: Origin Redis rate limiters (secondary, defense-in-depth)
// Purpose: Shared rate limiting across instances + escalation to IP firewall
// Notes: Cloudflare edge is primary; origin Redis is secondary + auto-ban escalation
//
// RATE LIMITING ARCHITECTURE:
// ===========================
// This application uses DUAL-LAYER rate limiting for comprehensive protection:
//
// LAYER 1 (PRIMARY): Cloudflare Edge
// - Handles volumetric DDoS attacks and massive traffic floods
// - Provides geographic filtering and bot protection
// - Blocks traffic before it reaches the origin server
// - Configured at Cloudflare dashboard level (not in this code)
//
// LAYER 2 (SECONDARY): This Redis-based middleware
// - Handles application-specific rate limiting logic
// - Provides granular per-endpoint limits (login strict, logout lenient)
// - Escalates repeated violations to IP firewall blocking
// - Works across multiple server instances via Redis
// - Falls back to memory if Redis unavailable
//
// EVIDENCE: Both layers are active and working together:
// - See zorvalon.js line 522: "Rate limiting: Edge (primary) → Origin/Redis (secondary)"
// - See zorvalon.js line 898: "rateLimit: 'handled at Cloudflare edge'"
// - This middleware is applied to specific routes in zorvalon.js lines 566-577

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
const { blockIp } = require('./ipFirewall');
const { config } = require('../config');

// ============================================================
// Configuration (from centralized config)
// ============================================================
// NOTE: These rate limiters work IN ADDITION to Cloudflare edge protection
// Cloudflare handles volumetric attacks; these handle application-specific logic
const isProd = config.server.nodeEnv === 'production';
const isTest = config.server.nodeEnv === 'test';
const enabled = config.rateLimit.enabled;
const skipInDev = config.rateLimit.skipInDev;
const skipInTest = config.rateLimit.skipInTest;

// ============================================================
// Per-Route Configurations (Application-Specific Limits)
// ============================================================
// These limits are applied AFTER Cloudflare edge filtering
// They provide granular control for different endpoint types
const GENERAL_WINDOW_S   = config.rateLimit.windows.general.windowMs / 1000;
const GENERAL_MAX        = config.rateLimit.windows.general.max;

const LOGIN_WINDOW_S     = config.rateLimit.windows.login.windowMs / 1000;
const LOGIN_MAX          = config.rateLimit.windows.login.max;

const SIGNUP_WINDOW_S    = config.rateLimit.windows.signup.windowMs / 1000;
const SIGNUP_MAX         = config.rateLimit.windows.signup.max;

const LOGOUT_WINDOW_S    = config.rateLimit.windows.logout.windowMs / 1000;
const LOGOUT_MAX         = config.rateLimit.windows.logout.max;

const COOKIE_SET_WINDOW_S= config.rateLimit.windows.cookieSet.windowMs / 1000;
const COOKIE_SET_MAX     = config.rateLimit.windows.cookieSet.max;

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
 * This is the SECONDARY layer of rate limiting (after Cloudflare edge).
 * 
 * WHY:
 * Redis provides shared counters across instances.
 * Memory fallback ensures app works even if Redis is down.
 * 
 * HOW:
 * Try Redis first; if unavailable, use in-memory limiter.
 * Both implement the same consume() API.
 * 
 * IMPORTANT: This works IN ADDITION to Cloudflare edge protection.
 * Cloudflare handles volumetric attacks; this handles app-specific logic.
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
      // Skip if disabled
      if (!enabled) return next();
      
      // Skip in test mode if flag is set (only honored when NODE_ENV=test)
      if (isTest && skipInTest) return next();
      
      // Skip in dev mode if flag is set (only when not in production)
      if (!isProd && skipInDev) return next();

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
       * X-RateLimit-Source: Only set on 429s to keep normal responses clean
       */
      const resetAt = Math.ceil((Date.now() + rlRes.msBeforeNext) / 1000);
      res.set('X-RateLimit-Limit', String(limit));
      res.set('X-RateLimit-Remaining', String(Math.max(0, limit - rlRes.consumedPoints)));
      res.set('X-RateLimit-Reset', String(resetAt));
      // X-RateLimit-Source only set on 429s (keeps normal responses clean)

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
       * For login limiter: escalate to IP firewall after repeated violations.
       */
      const ms = typeof rejRes?.msBeforeNext === 'number' ? rejRes.msBeforeNext : windowSeconds * 1000;
      const retryAfter = Math.ceil(ms / 1000);
      const ip = req.clientIp || req.ip || 'unknown';
      const pathForLog = req.originalUrl || `${req.baseUrl || ''}${req.path || ''}` || '/';

      logger.info({
        event: `${name}.exceeded`,
        ip,
        path: pathForLog,
        retryAfter,
        requestId: req.requestId
      }, 'Rate limit exceeded');

      /**
       * WHAT:
       * Escalate login rate limit violations to IP firewall.
       * 
       * WHY:
       * Repeated login attempts indicate brute force attack.
       * Block the IP entirely to save server resources.
       * 
       * HOW:
       * Track exceeds per IP in Redis (10 minute window).
       * After 3 exceeds, block IP for 15 minutes.
       * Only applies to login limiter.
       */
      if (name === 'login_rate_limit' && redisClient && ip !== 'unknown') {
        try {
          const hitsKey = `abuse:login:exceeds:${ip}`;
          const hits = await redisClient.incr(hitsKey);
          if (hits === 1) {
            await redisClient.expire(hitsKey, 600); // 10 min window
          }
          if (hits >= 3) {
            await blockIp(ip, 15 * 60, 'login-exceed');
            logger.warn({
              event: 'login_rate_limit.escalated_to_firewall',
              ip,
              hits,
              requestId: req.requestId
            }, 'IP escalated to firewall after repeated login violations');
          }
        } catch (escalateErr) {
          logger.error({
            event: 'login_rate_limit.escalation_error',
            ip,
            error: escalateErr.message
          }, 'Failed to escalate to IP firewall');
        }
      }

      res.set('Retry-After', String(retryAfter));
      res.set('X-RateLimit-Limit', String(limit));
      res.set('X-RateLimit-Remaining', '0');
      res.set('X-RateLimit-Reset', String(Math.ceil((Date.now() + ms) / 1000)));
      res.set('X-RateLimit-Source', 'origin-redis'); // Origin enforced this limit

      return res.status(429).json({
        ok: false,
        error: 'Too many requests. Please try again later.',
        retryAfter
      });
    }
  };
}

// ============================================================
// Public API (Application-Specific Rate Limiters)
// ============================================================
// These limiters are applied to specific routes in zorvalon.js
// They work IN ADDITION to Cloudflare edge protection

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
