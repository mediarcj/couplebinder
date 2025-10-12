// File: server/middleware/rateLimiter.js
// Description: Per-route rate limiting for defense-in-depth
// Purpose: Protect against abuse with appropriate limits per endpoint type
// Notes: Login strict, logout lenient, dev skip available

/**
 * WHAT:
 * Per-route rate limiting as a safety net behind Cloudflare edge protection.
 *
 * WHY:
 * Defense-in-depth principle: never rely on a single layer.
 * Different routes need different limits (login strict, logout lenient).
 *
 * HOW:
 * Token-bucket algorithm with in-memory storage per route type.
 * Dev mode can skip limits for local testing.
 */

const logger = require('../utils/logger');

// Environment configuration
const isDev = process.env.NODE_ENV !== 'production';
const enabled = process.env.RATE_LIMIT_ENABLED !== 'false'; // default ON
const skipInDev = process.env.SKIP_RATE_LIMIT_IN_DEV === 'true';

// Per-route configurations
const GENERAL_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000); // 1 minute
const GENERAL_MAX = Number(process.env.RATE_LIMIT_MAX || 300); // generous default

const LOGIN_WINDOW_MS = Number(process.env.LOGIN_WINDOW_MS || 15 * 60_000); // 15 minutes
const LOGIN_MAX = Number(process.env.LOGIN_MAX || 10); // strict

const SIGNUP_WINDOW_MS = Number(process.env.SIGNUP_WINDOW_MS || 60 * 60_000); // 1 hour
const SIGNUP_MAX = Number(process.env.SIGNUP_MAX || 5); // very strict

const LOGOUT_WINDOW_MS = Number(process.env.LOGOUT_WINDOW_MS || 10 * 60_000); // 10 minutes
const LOGOUT_MAX = Number(process.env.LOGOUT_MAX || 120); // very lenient

const COOKIE_SET_WINDOW_MS = Number(process.env.COOKIE_SET_WINDOW_MS || 60_000); // 1 minute
const COOKIE_SET_MAX = Number(process.env.COOKIE_SET_MAX || 300); // very lenient

// In-memory storage per route type
// CRITICAL SECTION: Shared state accessed by concurrent requests
const generalLimits = new Map();
const loginLimits = new Map();
const signupLimits = new Map();
const logoutLimits = new Map();
const cookieSetLimits = new Map();

// Cleanup old entries every 5 minutes to prevent memory leak
setInterval(() => {
  const now = Date.now();
  const stores = [generalLimits, loginLimits, signupLimits, logoutLimits, cookieSetLimits];
  stores.forEach(store => {
    for (const [key, data] of store.entries()) {
      if (now > data.resetAt) store.delete(key);
    }
  });
}, 5 * 60_000);

/**
 * Generic rate limiter factory
 */
function createRateLimiter(store, windowMs, max, name = 'rate_limit') {
  return (req, res, next) => {
    // Skip in dev if configured
    if (isDev && skipInDev) {
      return next();
    }
    
    // Skip if globally disabled
    if (!enabled) {
      return next();
    }
    
    const ip = req.clientIp || req.ip || 'unknown';
    const now = Date.now();
    
    // Per-route key: IP + method + path
    const key = `${ip}:${req.method}:${req.baseUrl || ''}${req.path}`;
    
    // Get or create limit entry for this key
    let entry = store.get(key);
    
    if (!entry || now > entry.resetAt) {
      // Create new window
      entry = { count: 0, resetAt: now + windowMs };
      store.set(key, entry);
    }
    
    // Increment request count
    entry.count += 1;
    
    // Check if limit exceeded
    if (entry.count > max) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      
      logger.info({
        event: `${name}.exceeded`,
        ip,
        path: req.path,
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
 * Strict rate limiter for login attempts
 */
function loginLimiter() {
  return createRateLimiter(loginLimits, LOGIN_WINDOW_MS, LOGIN_MAX, 'login_rate_limit');
}

/**
 * Very strict rate limiter for signup attempts
 */
function signupLimiter() {
  return createRateLimiter(signupLimits, SIGNUP_WINDOW_MS, SIGNUP_MAX, 'signup_rate_limit');
}

/**
 * Lenient rate limiter for logout (users click around a lot)
 */
function logoutLimiter() {
  return createRateLimiter(logoutLimits, LOGOUT_WINDOW_MS, LOGOUT_MAX, 'logout_rate_limit');
}

/**
 * Lenient rate limiter for cookie set (post-login flow)
 */
function cookieSetLimiter() {
  return createRateLimiter(cookieSetLimits, COOKIE_SET_WINDOW_MS, COOKIE_SET_MAX, 'cookie_set_rate_limit');
}

module.exports = {
  generalLimiter,
  loginLimiter,
  signupLimiter,
  logoutLimiter,
  cookieSetLimiter
};
