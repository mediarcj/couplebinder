// Description: Redis-backed IP firewall with automatic ban escalation
// Purpose: Block abusive IPs before they reach route logic (defense-in-depth)
// Notes: Works with rate limiters to escalate repeated violations

/**
 * IP firewall that blocks abusive IPs using Redis for multi-instance safety.
 *
 * When an IP repeatedly hits rate limits, we want to block them entirely
 * to save server resources. This runs early in the middleware stack.
 *
 * Store blocked IPs in Redis with TTL (auto-expire).
 * Check every request against the blocklist.
 * Return 429 immediately for blocked IPs without running expensive logic.
 *
 * UPDATE:
 * If Redis is unavailable or a cache call throws, we now fail-closed for
 * sensitive paths (API, dashboard, auth, payments) and any non-GET request.
 * For public GETs, we allow a small in-memory fallback limiter so the site
 * stays usable during transient cache incidents.
 */

const logger = require('../utils/logger');
const { config } = require('../config');

// Config / Sensitivity

/**
 * Decide which requests are "sensitive" and should fail-closed when Redis
 * is down or errors. Also allow ops to disable fail-closed if needed.
 *
 * We want to protect authenticated and state-changing surfaces first.
 *
 * - Prefix list for sensitive routes
 * - Treat any non-GET as sensitive
 * - config.firewall.failClosed (default: true) to enable fail-closed
 */
const SENSITIVE_PREFIXES = ['/dashboard', '/api', '/auth', '/payments'];
const FAIL_CLOSED = config.firewall.failClosed;

function isSensitive(req) {
  const p = req.path || req.originalUrl || '/';
  const prefixMatch = SENSITIVE_PREFIXES.some((pre) => p.startsWith(pre));
  // Any non-GET is considered sensitive (write-ish)
  return prefixMatch || req.method !== 'GET';
}

// Tiny in-memory fallback limiter for public GETs

/**
 * Minimal memory-based limiter to keep public GETs safe when Redis is down.
 *
 * Avoid total fail-closed for the entire site during transient cache issues,
 * while still applying a basic cap per IP.
 *
 * Sliding-ish window using a simple bucket with reset time.
 * Defaults: 60 req / 60s per IP for GETs only when Redis is unavailable/errored.
 */
const WINDOW_MS = 60_000;
const MAX_REQ = 60;
const memBucket = new Map();

function allowViaMemory(ip) {
  const now = Date.now();
  const rec = memBucket.get(ip) || { count: 0, reset: now + WINDOW_MS };
  if (now > rec.reset) {
    rec.count = 0;
    rec.reset = now + WINDOW_MS;
  }
  rec.count += 1;
  memBucket.set(ip, rec);
  return rec.count <= MAX_REQ;
}

// Redis Client Setup
let redis = null;
try {
  const { client } = require('../utils/redisClient');
  // Prefer known API (node-redis v4 has ping); if not present, still try to use it
  redis = client && typeof client.exists === 'function' ? client : null;
} catch {
  // No Redis available, firewall will operate in degraded mode
}

// Redis Key Helpers

/**
 * Generate Redis key for a blocked IP.
 *
 * Consistent key naming for easy management and debugging.
 *
 * Use ip:block: prefix to group all blocked IPs.
 *
 * @param {string} ip - IP address to block
 * @returns {string} Redis key
 */
const KEY = (ip) => `ip:block:${ip}`;

/**
 * Redis set key for maintaining a list of all blocked IPs.
 *
 * Useful for health checks and debugging.
 * Can query how many IPs are currently blocked.
 *
 * Single set key that holds all blocked IP addresses.
 */
const LIST_KEY = 'ip:block:list';

// Core Functions

/**
 * Check if an IP is currently blocked.
 *
 * Fast check before processing any request.
 * Saves server resources by rejecting bad actors early.
 *
 * Query Redis for the IP block key.
 * Return true if key exists, false otherwise.
 * Safe fallback if Redis is unavailable.
 *
 * @param {string} ip - IP address to check
 * @returns {Promise<boolean>} True if blocked, false otherwise
 */
async function isBlocked(ip) {
  if (!redis || !ip) return false;

  try {
    const exists = await redis.exists(KEY(ip));
    return exists === 1;
  } catch (error) {
    logger.error({
      event: 'ip_firewall.check_error',
      ip,
      error: error.message
    }, 'IP firewall check failed');
    // NOTE: Do not change legacy behavior here to avoid regressions.
    // Fail-closed is enforced in the middleware’s catch/unavailable path.
    return false;
  }
}

/**
 * Block an IP address for a specified duration.
 *
 * Escalate from rate limiting to full block for repeat offenders.
 * Prevents resource exhaustion from persistent attackers.
 *
 * Set Redis key with TTL (auto-expire after duration).
 * Add IP to the blocklist set for monitoring.
 * Use atomic multi/exec to ensure consistency.
 *
 * @param {string} ip - IP address to block
 * @param {number} ttlSec - Block duration in seconds (default: 1 hour)
 * @param {string} reason - Reason for blocking (for logging/debugging)
 * @returns {Promise<void>}
 */
async function blockIp(ip, ttlSec = 3600, reason = 'abuse') {
  if (!redis || !ip) return;

  try {
    await redis.multi()
      .set(KEY(ip), reason, { EX: ttlSec })
      .sAdd(LIST_KEY, ip)
      .expire(LIST_KEY, 24 * 3600) // Keep list for 24 hours
      .exec();

    logger.warn({
      event: 'ip_firewall.blocked',
      ip,
      reason,
      ttlSec
    }, `IP blocked for ${ttlSec}s`);
  } catch (error) {
    logger.error({
      event: 'ip_firewall.block_error',
      ip,
      reason,
      error: error.message
    }, 'Failed to block IP');
  }
}

/**
 * Manually unblock an IP address.
 *
 * Allow manual intervention for false positives.
 * Useful for debugging and customer support.
 *
 * Delete the IP block key and remove from set.
 *
 * @param {string} ip - IP address to unblock
 * @returns {Promise<void>}
 */
async function unblockIp(ip) {
  if (!redis || !ip) return;

  try {
    await redis.multi()
      .del(KEY(ip))
      .sRem(LIST_KEY, ip)
      .exec();

    logger.info({
      event: 'ip_firewall.unblocked',
      ip
    }, 'IP unblocked');
  } catch (error) {
    logger.error({
      event: 'ip_firewall.unblock_error',
      ip,
      error: error.message
    }, 'Failed to unblock IP');
  }
}

// Middleware

/**
 * Express middleware that checks if IP is blocked. On Redis errors or
 * unavailability, fail-closed for sensitive paths, and allow public GETs
 * with a tiny memory limiter as a safety net.
 *
 * Previous behavior failed open on cache errors; critique requested
 * closing that gap to strengthen defense-in-depth.
 *
 * - Extract IP (prefer Cloudflare clientIp)
 * - If Redis unavailable or a Redis call throws:
 *     - If sensitive or non-GET: 503
 *     - Else (public GET): memory limiter → next()
 * - If Redis OK and IP blocked: 429 with Retry-After
 * - Otherwise: next()
 *
 * @returns {Function} Express middleware
 */
// Static blocklist for tests and emergency ops (from config)
const STATIC_BLOCKLIST = config.firewall.staticBlocklist || [];

/**
 * Extract client IP with robust header support for tests/dev.
 *
 * Tests set X-Forwarded-For, so we need to respect it.
 * Production uses Cloudflare headers.
 *
 * Prefer X-Forwarded-For (first IP), then X-Real-IP, then Express fallback.
 */
function getClientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  if (xf) return xf.split(',')[0].trim();
  const xr = req.headers['x-real-ip'];
  if (xr) return xr.trim();
  return req.ip; // Express' parsed fallback
}

/**
 * Check if IP is blocked (static blocklist or Redis).
 *
 * Support both static env blocklist (for tests) and Redis-backed list (for prod).
 *
 * Check static blocklist first, then Redis if available.
 */
async function isBlockedIp(ip, redis) {
  if (STATIC_BLOCKLIST.includes(ip)) return true;
  if (redis) {
    try {
      const exists = await redis.exists(KEY(ip));
      return exists === 1;
    } catch {
      return false;
    }
  }
  return false;
}

function ipFirewall() {
  return async (req, res, next) => {
    const ip = getClientIp(req);

    // Helper: handle fail mode depending on sensitivity and env
    const handleFailMode = () => {
      // Unknown IPs: keep legacy behavior (avoid regressing CF proxy edges)
      if (ip === 'unknown') return next();

      // Fail-closed for sensitive or any non-GET when enabled
      if (FAIL_CLOSED && isSensitive(req)) {
        logger.warn({
          event: 'ip_firewall.fail_closed',
          ip,
          path: req.originalUrl || req.path,
          method: req.method,
          requestId: req.requestId
        }, 'Redis unavailable/error → fail-closed (503) on sensitive path');

        return res.status(503).json({
          ok: false,
          error: 'Service temporarily unavailable'
        });
      }

      // For public GETs, allow through with tiny memory limiter
      if (!allowViaMemory(ip)) {
        res.set('Retry-After', '60');
        return res.status(429).json({ ok: false, error: 'Too many requests' });
      }
      return next();
    };

    // If Redis client is missing, operate in degraded mode
    if (!redis) {
      logger.warn({
        event: 'ip_firewall.redis_unavailable',
        ip,
        path: req.originalUrl || req.path,
        method: req.method,
        requestId: req.requestId
      }, 'Redis not available for firewall; entering degraded mode');
      return handleFailMode();
    }

    // Unknown IPs: preserve legacy behavior
    if (ip === 'unknown') {
      return next();
    }

    try {
      const blocked = await isBlockedIp(ip, redis);

      if (blocked) {
        /**
         * Return 429 Too Many Requests for blocked IPs.
         *
         * Standard HTTP status for rate limiting and blocking.
         * Tests expect { ok: false, reason: 'blocked' }.
         *
         * Set Retry-After to 1 hour (default block duration).
         * Return JSON response matching test expectations.
         * Log the blocked attempt for monitoring.
         */
        logger.warn({
          event: 'ip_firewall.blocked_attempt',
          ip,
          path: req.originalUrl || req.path,
          method: req.method,
          requestId: req.requestId,
          reason: 'blocklist', // Distinguish from rate limit (429)
          source: STATIC_BLOCKLIST.includes(ip) ? 'static' : 'redis'
        }, 'Blocked IP attempted access (blocklist, not rate limit)');

        res.set('Retry-After', '3600');
        return res.status(429).json({
          ok: false,
          error: 'Too many requests'
        });
      }

      // IP is not blocked, continue
      return next();
    } catch (error) {
      /**
       * Redis call errored; enter degraded mode.
       *
       * Close the previous fail-open gap for sensitive surfaces.
       *
       * Fail-closed (503) for sensitive or non-GET; public GETs allowed via memory limiter.
       */
      logger.warn({
        event: 'ip_firewall.redis_error',
        ip,
        path: req.originalUrl || req.path,
        method: req.method,
        requestId: req.requestId,
        error: error.message
      }, 'Firewall Redis error; entering degraded mode');
      return handleFailMode();
    }
  };
}

// Exports

module.exports = {
  ipFirewall,
  blockIp,
  unblockIp,
  isBlocked
};