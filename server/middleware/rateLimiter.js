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
// I am loading `../utils/logger` into `logger` so this file can reuse that dependency below.
const logger = require('../utils/logger');
// I am loading `./ipFirewall` into `blockIp` so this file can reuse that dependency below.
const { blockIp } = require('./ipFirewall');
// I am loading `../config` into `config` so this file can reuse that dependency below.
const { config } = require('../config');

// ============================================================
// Configuration (from centralized config)
// ============================================================
// NOTE: These rate limiters work IN ADDITION to Cloudflare edge protection
// Cloudflare handles volumetric attacks; these handle application-specific logic
const isProd = config.server.nodeEnv === 'production';
// I am saving `isTest` here so the nearby steps can reuse the same value without rebuilding it each time.
const isTest = config.server.nodeEnv === 'test';
// I am saving `enabled` here so the nearby steps can reuse the same value without rebuilding it each time.
const enabled = config.rateLimit.enabled;
// I am saving `skipInDev` here so the nearby steps can reuse the same value without rebuilding it each time.
const skipInDev = config.rateLimit.skipInDev;
// I am saving `skipInTest` here so the nearby steps can reuse the same value without rebuilding it each time.
const skipInTest = config.rateLimit.skipInTest;

// ============================================================
// Per-Route Configurations (Application-Specific Limits)
// ============================================================
// These limits are applied AFTER Cloudflare edge filtering
// They provide granular control for different endpoint types
const GENERAL_WINDOW_S   = config.rateLimit.windows.general.windowMs / 1000;
// I am saving `GENERAL_MAX` here so the nearby steps can reuse the same value without rebuilding it each time.
const GENERAL_MAX        = config.rateLimit.windows.general.max;

// I am saving `LOGIN_WINDOW_S` here so the nearby steps can reuse the same value without rebuilding it each time.
const LOGIN_WINDOW_S     = config.rateLimit.windows.login.windowMs / 1000;
// I am saving `LOGIN_MAX` here so the nearby steps can reuse the same value without rebuilding it each time.
const LOGIN_MAX          = config.rateLimit.windows.login.max;

// I am saving `REGISTER_WINDOW_S` here so the nearby steps can reuse the same value without rebuilding it each time.
const REGISTER_WINDOW_S    = config.rateLimit.windows.signup.windowMs / 1000;
// I am saving `REGISTER_MAX` here so the nearby steps can reuse the same value without rebuilding it each time.
const REGISTER_MAX         = config.rateLimit.windows.signup.max;

// I am saving `LOGOUT_WINDOW_S` here so the nearby steps can reuse the same value without rebuilding it each time.
const LOGOUT_WINDOW_S    = config.rateLimit.windows.logout.windowMs / 1000;
// I am saving `LOGOUT_MAX` here so the nearby steps can reuse the same value without rebuilding it each time.
const LOGOUT_MAX         = config.rateLimit.windows.logout.max;

// I am saving `COOKIE_SET_WINDOW_S` here so the nearby steps can reuse the same value without rebuilding it each time.
const COOKIE_SET_WINDOW_S= config.rateLimit.windows.cookieSet.windowMs / 1000;
// I am saving `COOKIE_SET_MAX` here so the nearby steps can reuse the same value without rebuilding it each time.
const COOKIE_SET_MAX     = config.rateLimit.windows.cookieSet.max;

// Binder-specific rate limits (hardcoded for now; can be moved to config later)
const BINDER_PHOTO_WINDOW_S = 300;  // 5 minutes
const BINDER_PHOTO_MAX      = 20;   // 20 upload requests per 5 minutes
const BINDER_LAYOUT_WINDOW_S = 60;  // 1 minute
const BINDER_LAYOUT_MAX     = 30;   // 30 layout saves per minute
const BINDER_EXPORT_WINDOW_S = 600; // 10 minutes
const BINDER_EXPORT_MAX     = 5;    // 5 exports per 10 minutes

// ============================================================
// Redis Client Setup
// Reuse the singleton Redis client from the app
// ============================================================
let redisClient = null;
// I am starting a guarded operation here because a request, parser, or dependency used below may fail.
try {
  // I am loading `../utils/redisClient` into `client` so this file can reuse that dependency below.
  const { client } = require('../utils/redisClient');
  // I am keeping this line here because the surrounding rateLimiter.js workflow expects this value or operation before it continues.
  redisClient = client && typeof client.ping === 'function' ? client : null;
// I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
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
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (redisClient) {
    // This return sends the completed value or response back to the code that called this function.
    return new RateLimiterRedis({
      // I am keeping the `storeClient` field in this object so the receiving code can read that value by its expected name.
      storeClient: redisClient,
      // I am keeping this line here because the surrounding rateLimiter.js workflow expects this value or operation before it continues.
      keyPrefix,
      // I am keeping this line here because the surrounding rateLimiter.js workflow expects this value or operation before it continues.
      points,
      // I am keeping the `duration` field in this object so the receiving code can read that value by its expected name.
      duration: durationSeconds,
      execEvenly: false, // Small jitter helps burst shaping
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
  
  // Fallback to memory (per-process only, but better than nothing)
  return new RateLimiterMemory({
    // I am keeping this line here because the surrounding rateLimiter.js workflow expects this value or operation before it continues.
    keyPrefix,
    // I am keeping this line here because the surrounding rateLimiter.js workflow expects this value or operation before it continues.
    points,
    // I am keeping the `duration` field in this object so the receiving code can read that value by its expected name.
    duration: durationSeconds,
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// ============================================================
// Create Limiters for Each Route Type
// ============================================================
const limiters = {
  // I am keeping the `general` field in this object so the receiving code can read that value by its expected name.
  general:   buildLimiter({ keyPrefix: 'rl:general',    points: GENERAL_MAX,   durationSeconds: GENERAL_WINDOW_S }),
  // I am keeping the `login` field in this object so the receiving code can read that value by its expected name.
  login:     buildLimiter({ keyPrefix: 'rl:login',      points: LOGIN_MAX,     durationSeconds: LOGIN_WINDOW_S }),
  // I am keeping the `register` field in this object so the receiving code can read that value by its expected name.
  register:  buildLimiter({ keyPrefix: 'rl:register',   points: REGISTER_MAX,  durationSeconds: REGISTER_WINDOW_S }),
  // I am keeping the `logout` field in this object so the receiving code can read that value by its expected name.
  logout:    buildLimiter({ keyPrefix: 'rl:logout',     points: LOGOUT_MAX,    durationSeconds: LOGOUT_WINDOW_S }),
  // I am keeping the `cookieSet` field in this object so the receiving code can read that value by its expected name.
  cookieSet: buildLimiter({ keyPrefix: 'rl:cookieSet',  points: COOKIE_SET_MAX,durationSeconds: COOKIE_SET_WINDOW_S }),
  // I am keeping the `binderPhoto` field in this object so the receiving code can read that value by its expected name.
  binderPhoto: buildLimiter({ keyPrefix: 'rl:binder:photo', points: BINDER_PHOTO_MAX, durationSeconds: BINDER_PHOTO_WINDOW_S }),
  // I am keeping the `binderLayout` field in this object so the receiving code can read that value by its expected name.
  binderLayout: buildLimiter({ keyPrefix: 'rl:binder:layout', points: BINDER_LAYOUT_MAX, durationSeconds: BINDER_LAYOUT_WINDOW_S }),
  // I am keeping the `binderExport` field in this object so the receiving code can read that value by its expected name.
  binderExport: buildLimiter({ keyPrefix: 'rl:binder:export', points: BINDER_EXPORT_MAX, durationSeconds: BINDER_EXPORT_WINDOW_S }),
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
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
  // I am saving `ip` here so the nearby steps can reuse the same value without rebuilding it each time.
  const ip = req.clientIp || req.ip || 'unknown';
  // I am saving `method` here so the nearby steps can reuse the same value without rebuilding it each time.
  const method = req.method || 'GET';
  // I am saving `path` here so the nearby steps can reuse the same value without rebuilding it each time.
  const path = `${req.baseUrl || ''}${req.path || ''}`;
  // This return sends the completed value or response back to the code that called this function.
  return `${ip}:${method}:${path}`;
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
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
  // This return sends the completed value or response back to the code that called this function.
  return async (req, res, next) => {
    // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
    try {
      // Skip if disabled
      if (!enabled) return next();
      
      // Skip in test mode if flag is set (only honored when NODE_ENV=test)
      if (isTest && skipInTest) return next();
      
      // Skip in dev mode if flag is set (only when not in production)
      if (!isProd && skipInDev) return next();

      // I am saving `key` here so the nearby steps can reuse the same value without rebuilding it each time.
      const key = keyFor(req);
      // I am saving `rlRes` here so the nearby steps can reuse the same value without rebuilding it each time.
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
      // I am building or sending the Express response here with the status, data, or page already chosen by this route.
      res.set('X-RateLimit-Limit', String(limit));
      // I am building or sending the Express response here with the status, data, or page already chosen by this route.
      res.set('X-RateLimit-Remaining', String(Math.max(0, limit - rlRes.consumedPoints)));
      // I am building or sending the Express response here with the status, data, or page already chosen by this route.
      res.set('X-RateLimit-Reset', String(resetAt));
      // X-RateLimit-Source only set on 429s (keeps normal responses clean)

      return next();
    // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
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
      // I am saving `retryAfter` here so the nearby steps can reuse the same value without rebuilding it each time.
      const retryAfter = Math.ceil(ms / 1000);
      // I am saving `ip` here so the nearby steps can reuse the same value without rebuilding it each time.
      const ip = req.clientIp || req.ip || 'unknown';
      // I am saving `pathForLog` here so the nearby steps can reuse the same value without rebuilding it each time.
      const pathForLog = req.originalUrl || `${req.baseUrl || ''}${req.path || ''}` || '/';

      // I am calling this helper here so the current workflow performs this step before it moves on.
      logger.info({
        // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
        event: `${name}.exceeded`,
        // I am keeping this line here because the surrounding rateLimiter.js workflow expects this value or operation before it continues.
        ip,
        // I am keeping the `path` field in this object so the receiving code can read that value by its expected name.
        path: pathForLog,
        // I am keeping this line here because the surrounding rateLimiter.js workflow expects this value or operation before it continues.
        retryAfter,
        // I am keeping the `requestId` field in this object so the receiving code can read that value by its expected name.
        requestId: req.requestId
      // I am keeping this line here because the surrounding rateLimiter.js workflow expects this value or operation before it continues.
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
        // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
        try {
          // I am saving `hitsKey` here so the nearby steps can reuse the same value without rebuilding it each time.
          const hitsKey = `abuse:login:exceeds:${ip}`;
          // I am saving `hits` here so the nearby steps can reuse the same value without rebuilding it each time.
          const hits = await redisClient.incr(hitsKey);
          // This check helps me choose or stop the next path before any work that depends on this condition runs.
          if (hits === 1) {
            await redisClient.expire(hitsKey, 600); // 10 min window
          // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
          }
          // This check helps me choose or stop the next path before any work that depends on this condition runs.
          if (hits >= 3) {
            // I am waiting for this asynchronous step here so the next line does not use its result before it is ready.
            await blockIp(ip, 15 * 60, 'login-exceed');
            // I am calling this helper here so the current workflow performs this step before it moves on.
            logger.warn({
              // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
              event: 'login_rate_limit.escalated_to_firewall',
              // I am keeping this line here because the surrounding rateLimiter.js workflow expects this value or operation before it continues.
              ip,
              // I am keeping this line here because the surrounding rateLimiter.js workflow expects this value or operation before it continues.
              hits,
              // I am keeping the `requestId` field in this object so the receiving code can read that value by its expected name.
              requestId: req.requestId
            // I am keeping this line here because the surrounding rateLimiter.js workflow expects this value or operation before it continues.
            }, 'IP escalated to firewall after repeated login violations');
          // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
          }
        // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
        } catch (escalateErr) {
          // I am calling this helper here so the current workflow performs this step before it moves on.
          logger.error({
            // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
            event: 'login_rate_limit.escalation_error',
            // I am keeping this line here because the surrounding rateLimiter.js workflow expects this value or operation before it continues.
            ip,
            // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
            error: escalateErr.message
          // I am keeping this line here because the surrounding rateLimiter.js workflow expects this value or operation before it continues.
          }, 'Failed to escalate to IP firewall');
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }

      // I am building or sending the Express response here with the status, data, or page already chosen by this route.
      res.set('Retry-After', String(retryAfter));
      // I am building or sending the Express response here with the status, data, or page already chosen by this route.
      res.set('X-RateLimit-Limit', String(limit));
      // I am building or sending the Express response here with the status, data, or page already chosen by this route.
      res.set('X-RateLimit-Remaining', '0');
      // I am building or sending the Express response here with the status, data, or page already chosen by this route.
      res.set('X-RateLimit-Reset', String(Math.ceil((Date.now() + ms) / 1000)));
      res.set('X-RateLimit-Source', 'origin-redis'); // Origin enforced this limit

      // This return sends the completed value or response back to the code that called this function.
      return res.status(429).json({
        // I am keeping the `ok` field in this object so the receiving code can read that value by its expected name.
        ok: false,
        // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
        error: 'Too many requests. Please try again later.',
        // I am keeping this line here because the surrounding rateLimiter.js workflow expects this value or operation before it continues.
        retryAfter
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      });
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  };
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
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
  // This return sends the completed value or response back to the code that called this function.
  return limiterMiddleware(limiters.general, 'general_rate_limit', GENERAL_MAX, GENERAL_WINDOW_S);
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * Strict rate limiter for login attempts
 */
function loginLimiter() {
  // This return sends the completed value or response back to the code that called this function.
  return limiterMiddleware(limiters.login, 'login_rate_limit', LOGIN_MAX, LOGIN_WINDOW_S);
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * Very strict rate limiter for registration attempts
 */
function registerLimiter() {
  // This return sends the completed value or response back to the code that called this function.
  return limiterMiddleware(limiters.register, 'register_rate_limit', REGISTER_MAX, REGISTER_WINDOW_S);
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * Lenient rate limiter for logout
 */
function logoutLimiter() {
  // This return sends the completed value or response back to the code that called this function.
  return limiterMiddleware(limiters.logout, 'logout_rate_limit', LOGOUT_MAX, LOGOUT_WINDOW_S);
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * Lenient rate limiter for cookie set
 */
function cookieSetLimiter() {
  // This return sends the completed value or response back to the code that called this function.
  return limiterMiddleware(limiters.cookieSet, 'cookie_set_rate_limit', COOKIE_SET_MAX, COOKIE_SET_WINDOW_S);
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * Rate limiter for binder photo uploads
 */
function binderPhotoLimiter() {
  // This return sends the completed value or response back to the code that called this function.
  return limiterMiddleware(limiters.binderPhoto, 'binder_photo_rate_limit', BINDER_PHOTO_MAX, BINDER_PHOTO_WINDOW_S);
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * Rate limiter for binder layout operations (apply and auto)
 */
function binderLayoutLimiter() {
  // This return sends the completed value or response back to the code that called this function.
  return limiterMiddleware(limiters.binderLayout, 'binder_layout_rate_limit', BINDER_LAYOUT_MAX, BINDER_LAYOUT_WINDOW_S);
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * Rate limiter for binder PDF exports
 */
function binderExportLimiter() {
  // This return sends the completed value or response back to the code that called this function.
  return limiterMiddleware(limiters.binderExport, 'binder_export_rate_limit', BINDER_EXPORT_MAX, BINDER_EXPORT_WINDOW_S);
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am exporting this value here so another module can deliberately reuse the completed piece from rateLimiter.js.
module.exports = {
  // I am keeping this line here because the surrounding rateLimiter.js workflow expects this value or operation before it continues.
  generalLimiter,
  // I am keeping this line here because the surrounding rateLimiter.js workflow expects this value or operation before it continues.
  loginLimiter,
  // I am keeping this line here because the surrounding rateLimiter.js workflow expects this value or operation before it continues.
  registerLimiter,
  // I am keeping this line here because the surrounding rateLimiter.js workflow expects this value or operation before it continues.
  logoutLimiter,
  // I am keeping this line here because the surrounding rateLimiter.js workflow expects this value or operation before it continues.
  cookieSetLimiter,
  // I am keeping this line here because the surrounding rateLimiter.js workflow expects this value or operation before it continues.
  binderPhotoLimiter,
  // I am keeping this line here because the surrounding rateLimiter.js workflow expects this value or operation before it continues.
  binderLayoutLimiter,
  // I am keeping this line here because the surrounding rateLimiter.js workflow expects this value or operation before it continues.
  binderExportLimiter
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
};
