// File: server/middleware/ipFirewall.js
// Description: Redis-backed IP firewall with automatic ban escalation
// Purpose: Block abusive IPs before they reach route logic (defense-in-depth)
// Notes: Works with rate limiters to escalate repeated violations

/**
 * WHAT:
 * IP firewall that blocks abusive IPs using Redis for multi-instance safety.
 *
 * WHY:
 * When an IP repeatedly hits rate limits, we want to block them entirely
 * to save server resources. This runs early in the middleware stack.
 *
 * HOW:
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
// I am loading `../config` into `config` so this file can reuse that dependency below.
const { config } = require('../config');

// ============================================================
// Config / Sensitivity
// ============================================================

/**
 * WHAT:
 * Decide which requests are "sensitive" and should fail-closed when Redis
 * is down or errors. Also allow ops to disable fail-closed if needed.
 *
 * WHY:
 * We want to protect authenticated and state-changing surfaces first.
 *
 * HOW:
 * - Prefix list for sensitive routes
 * - Treat any non-GET as sensitive
 * - config.firewall.failClosed (default: true) to enable fail-closed
 */
const SENSITIVE_PREFIXES = ['/dashboard', '/api', '/auth', '/payments'];
// I am saving `FAIL_CLOSED` here so the nearby steps can reuse the same value without rebuilding it each time.
const FAIL_CLOSED = config.firewall.failClosed;

// I am keeping `isSensitive` as a named helper so the surrounding workflow can call this step when it needs it.
function isSensitive(req) {
  // I am saving `p` here so the nearby steps can reuse the same value without rebuilding it each time.
  const p = req.path || req.originalUrl || '/';
  // I am saving `prefixMatch` here so the nearby steps can reuse the same value without rebuilding it each time.
  const prefixMatch = SENSITIVE_PREFIXES.some((pre) => p.startsWith(pre));
  // Any non-GET is considered sensitive (write-ish)
  return prefixMatch || req.method !== 'GET';
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// ============================================================
// Tiny in-memory fallback limiter for public GETs
// ============================================================

/**
 * WHAT:
 * Minimal memory-based limiter to keep public GETs safe when Redis is down.
 *
 * WHY:
 * Avoid total fail-closed for the entire site during transient cache issues,
 * while still applying a basic cap per IP.
 *
 * HOW:
 * Sliding-ish window using a simple bucket with reset time.
 * Defaults: 60 req / 60s per IP for GETs only when Redis is unavailable/errored.
 */
const WINDOW_MS = 60_000;
// I am saving `MAX_REQ` here so the nearby steps can reuse the same value without rebuilding it each time.
const MAX_REQ = 60;
// I am saving `memBucket` here so the nearby steps can reuse the same value without rebuilding it each time.
const memBucket = new Map();

// I am keeping `allowViaMemory` as a named helper so the surrounding workflow can call this step when it needs it.
function allowViaMemory(ip) {
  // I am saving `now` here so the nearby steps can reuse the same value without rebuilding it each time.
  const now = Date.now();
  // I am saving `rec` here so the nearby steps can reuse the same value without rebuilding it each time.
  const rec = memBucket.get(ip) || { count: 0, reset: now + WINDOW_MS };
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (now > rec.reset) {
    // I am keeping this line here because the surrounding ipFirewall.js workflow expects this value or operation before it continues.
    rec.count = 0;
    // I am keeping this line here because the surrounding ipFirewall.js workflow expects this value or operation before it continues.
    rec.reset = now + WINDOW_MS;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
  // I am keeping this line here because the surrounding ipFirewall.js workflow expects this value or operation before it continues.
  rec.count += 1;
  // I am calling this helper here so the current workflow performs this step before it moves on.
  memBucket.set(ip, rec);
  // This return sends the completed value or response back to the code that called this function.
  return rec.count <= MAX_REQ;
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// ============================================================
// Redis Client Setup
// ============================================================
let redis = null;
// I am starting a guarded operation here because a request, parser, or dependency used below may fail.
try {
  // I am loading `../utils/redisClient` into `client` so this file can reuse that dependency below.
  const { client } = require('../utils/redisClient');
  // Prefer known API (node-redis v4 has ping); if not present, still try to use it
  redis = client && typeof client.exists === 'function' ? client : null;
// I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
} catch {
  // No Redis available, firewall will operate in degraded mode
}

// ============================================================
// Redis Key Helpers
// ============================================================

/**
 * WHAT:
 * Generate Redis key for a blocked IP.
 *
 * WHY:
 * Consistent key naming for easy management and debugging.
 *
 * HOW:
 * Use ip:block: prefix to group all blocked IPs.
 *
 * @param {string} ip - IP address to block
 * @returns {string} Redis key
 */
const KEY = (ip) => `ip:block:${ip}`;

/**
 * WHAT:
 * Redis set key for maintaining a list of all blocked IPs.
 *
 * WHY:
 * Useful for health checks and debugging.
 * Can query how many IPs are currently blocked.
 *
 * HOW:
 * Single set key that holds all blocked IP addresses.
 */
const LIST_KEY = 'ip:block:list';

// ============================================================
// Core Functions
// ============================================================

/**
 * WHAT:
 * Check if an IP is currently blocked.
 *
 * WHY:
 * Fast check before processing any request.
 * Saves server resources by rejecting bad actors early.
 *
 * HOW:
 * Query Redis for the IP block key.
 * Return true if key exists, false otherwise.
 * Safe fallback if Redis is unavailable.
 *
 * @param {string} ip - IP address to check
 * @returns {Promise<boolean>} True if blocked, false otherwise
 */
async function isBlocked(ip) {
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!redis || !ip) return false;

  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // I am saving `exists` here so the nearby steps can reuse the same value without rebuilding it each time.
    const exists = await redis.exists(KEY(ip));
    // This return sends the completed value or response back to the code that called this function.
    return exists === 1;
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (error) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.error({
      // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
      event: 'ip_firewall.check_error',
      // I am keeping this line here because the surrounding ipFirewall.js workflow expects this value or operation before it continues.
      ip,
      // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
      error: error.message
    // I am keeping this line here because the surrounding ipFirewall.js workflow expects this value or operation before it continues.
    }, 'IP firewall check failed');
    // NOTE: Do not change legacy behavior here to avoid regressions.
    // Fail-closed is enforced in the middleware’s catch/unavailable path.
    return false;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * WHAT:
 * Block an IP address for a specified duration.
 *
 * WHY:
 * Escalate from rate limiting to full block for repeat offenders.
 * Prevents resource exhaustion from persistent attackers.
 *
 * HOW:
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
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!redis || !ip) return;

  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // I am waiting for this asynchronous step here so the next line does not use its result before it is ready.
    await redis.multi()
      // I am continuing the existing call chain here so this option stays attached to the same operation started above.
      .set(KEY(ip), reason, { EX: ttlSec })
      // I am continuing the existing call chain here so this option stays attached to the same operation started above.
      .sAdd(LIST_KEY, ip)
      .expire(LIST_KEY, 24 * 3600) // Keep list for 24 hours
      // I am continuing the existing call chain here so this option stays attached to the same operation started above.
      .exec();

    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.warn({
      // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
      event: 'ip_firewall.blocked',
      // I am keeping this line here because the surrounding ipFirewall.js workflow expects this value or operation before it continues.
      ip,
      // I am keeping this line here because the surrounding ipFirewall.js workflow expects this value or operation before it continues.
      reason,
      // I am keeping this line here because the surrounding ipFirewall.js workflow expects this value or operation before it continues.
      ttlSec
    // I am keeping this line here because the surrounding ipFirewall.js workflow expects this value or operation before it continues.
    }, `IP blocked for ${ttlSec}s`);
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (error) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.error({
      // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
      event: 'ip_firewall.block_error',
      // I am keeping this line here because the surrounding ipFirewall.js workflow expects this value or operation before it continues.
      ip,
      // I am keeping this line here because the surrounding ipFirewall.js workflow expects this value or operation before it continues.
      reason,
      // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
      error: error.message
    // I am keeping this line here because the surrounding ipFirewall.js workflow expects this value or operation before it continues.
    }, 'Failed to block IP');
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * WHAT:
 * Manually unblock an IP address.
 *
 * WHY:
 * Allow manual intervention for false positives.
 * Useful for debugging and customer support.
 *
 * HOW:
 * Delete the IP block key and remove from set.
 *
 * @param {string} ip - IP address to unblock
 * @returns {Promise<void>}
 */
async function unblockIp(ip) {
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!redis || !ip) return;

  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // I am waiting for this asynchronous step here so the next line does not use its result before it is ready.
    await redis.multi()
      // I am continuing the existing call chain here so this option stays attached to the same operation started above.
      .del(KEY(ip))
      // I am continuing the existing call chain here so this option stays attached to the same operation started above.
      .sRem(LIST_KEY, ip)
      // I am continuing the existing call chain here so this option stays attached to the same operation started above.
      .exec();

    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.info({
      // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
      event: 'ip_firewall.unblocked',
      // I am keeping this line here because the surrounding ipFirewall.js workflow expects this value or operation before it continues.
      ip
    // I am keeping this line here because the surrounding ipFirewall.js workflow expects this value or operation before it continues.
    }, 'IP unblocked');
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (error) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.error({
      // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
      event: 'ip_firewall.unblock_error',
      // I am keeping this line here because the surrounding ipFirewall.js workflow expects this value or operation before it continues.
      ip,
      // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
      error: error.message
    // I am keeping this line here because the surrounding ipFirewall.js workflow expects this value or operation before it continues.
    }, 'Failed to unblock IP');
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// ============================================================
// Middleware
// ============================================================

/**
 * WHAT:
 * Express middleware that checks if IP is blocked. On Redis errors or
 * unavailability, fail-closed for sensitive paths, and allow public GETs
 * with a tiny memory limiter as a safety net.
 *
 * WHY:
 * Previous behavior failed open on cache errors; critique requested
 * closing that gap to strengthen defense-in-depth.
 *
 * HOW:
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
 * WHAT:
 * Extract client IP with robust header support for tests/dev.
 *
 * WHY:
 * Tests set X-Forwarded-For, so we need to respect it.
 * Production uses Cloudflare headers.
 *
 * HOW:
 * Prefer X-Forwarded-For (first IP), then X-Real-IP, then Express fallback.
 */
function getClientIp(req) {
  // I am saving `xf` here so the nearby steps can reuse the same value without rebuilding it each time.
  const xf = req.headers['x-forwarded-for'];
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (xf) return xf.split(',')[0].trim();
  // I am saving `xr` here so the nearby steps can reuse the same value without rebuilding it each time.
  const xr = req.headers['x-real-ip'];
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (xr) return xr.trim();
  return req.ip; // Express' parsed fallback
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * WHAT:
 * Check if IP is blocked (static blocklist or Redis).
 *
 * WHY:
 * Support both static env blocklist (for tests) and Redis-backed list (for prod).
 *
 * HOW:
 * Check static blocklist first, then Redis if available.
 */
async function isBlockedIp(ip, redis) {
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (STATIC_BLOCKLIST.includes(ip)) return true;
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (redis) {
    // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
    try {
      // I am saving `exists` here so the nearby steps can reuse the same value without rebuilding it each time.
      const exists = await redis.exists(KEY(ip));
      // This return sends the completed value or response back to the code that called this function.
      return exists === 1;
    // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
    } catch {
      // This return sends the completed value or response back to the code that called this function.
      return false;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
  // This return sends the completed value or response back to the code that called this function.
  return false;
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `ipFirewall` as a named helper so the surrounding workflow can call this step when it needs it.
function ipFirewall() {
  // This return sends the completed value or response back to the code that called this function.
  return async (req, res, next) => {
    // I am saving `ip` here so the nearby steps can reuse the same value without rebuilding it each time.
    const ip = getClientIp(req);

    // Helper: handle fail mode depending on sensitivity and env
    const handleFailMode = () => {
      // Unknown IPs: keep legacy behavior (avoid regressing CF proxy edges)
      if (ip === 'unknown') return next();

      // Fail-closed for sensitive or any non-GET when enabled
      if (FAIL_CLOSED && isSensitive(req)) {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        logger.warn({
          // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
          event: 'ip_firewall.fail_closed',
          // I am keeping this line here because the surrounding ipFirewall.js workflow expects this value or operation before it continues.
          ip,
          // I am keeping the `path` field in this object so the receiving code can read that value by its expected name.
          path: req.originalUrl || req.path,
          // I am keeping the `method` field in this object so the receiving code can read that value by its expected name.
          method: req.method,
          // I am keeping the `requestId` field in this object so the receiving code can read that value by its expected name.
          requestId: req.requestId
        // I am keeping this line here because the surrounding ipFirewall.js workflow expects this value or operation before it continues.
        }, 'Redis unavailable/error → fail-closed (503) on sensitive path');

        // This return sends the completed value or response back to the code that called this function.
        return res.status(503).json({
          // I am keeping the `ok` field in this object so the receiving code can read that value by its expected name.
          ok: false,
          // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
          error: 'Service temporarily unavailable'
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        });
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }

      // For public GETs, allow through with tiny memory limiter
      if (!allowViaMemory(ip)) {
        // I am building or sending the Express response here with the status, data, or page already chosen by this route.
        res.set('Retry-After', '60');
        // This return sends the completed value or response back to the code that called this function.
        return res.status(429).json({ ok: false, error: 'Too many requests' });
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
      // This return sends the completed value or response back to the code that called this function.
      return next();
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    };

    // If Redis client is missing, operate in degraded mode
    if (!redis) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      logger.warn({
        // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
        event: 'ip_firewall.redis_unavailable',
        // I am keeping this line here because the surrounding ipFirewall.js workflow expects this value or operation before it continues.
        ip,
        // I am keeping the `path` field in this object so the receiving code can read that value by its expected name.
        path: req.originalUrl || req.path,
        // I am keeping the `method` field in this object so the receiving code can read that value by its expected name.
        method: req.method,
        // I am keeping the `requestId` field in this object so the receiving code can read that value by its expected name.
        requestId: req.requestId
      // I am keeping this line here because the surrounding ipFirewall.js workflow expects this value or operation before it continues.
      }, 'Redis not available for firewall; entering degraded mode');
      // This return sends the completed value or response back to the code that called this function.
      return handleFailMode();
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // Unknown IPs: preserve legacy behavior
    if (ip === 'unknown') {
      // This return sends the completed value or response back to the code that called this function.
      return next();
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
    try {
      // I am saving `blocked` here so the nearby steps can reuse the same value without rebuilding it each time.
      const blocked = await isBlockedIp(ip, redis);

      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (blocked) {
        /**
         * WHAT:
         * Return 429 Too Many Requests for blocked IPs.
         *
         * WHY:
         * Standard HTTP status for rate limiting and blocking.
         * Tests expect { ok: false, reason: 'blocked' }.
         *
         * HOW:
         * Set Retry-After to 1 hour (default block duration).
         * Return JSON response matching test expectations.
         * Log the blocked attempt for monitoring.
         */
        logger.warn({
          // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
          event: 'ip_firewall.blocked_attempt',
          // I am keeping this line here because the surrounding ipFirewall.js workflow expects this value or operation before it continues.
          ip,
          // I am keeping the `path` field in this object so the receiving code can read that value by its expected name.
          path: req.originalUrl || req.path,
          // I am keeping the `method` field in this object so the receiving code can read that value by its expected name.
          method: req.method,
          // I am keeping the `requestId` field in this object so the receiving code can read that value by its expected name.
          requestId: req.requestId,
          reason: 'blocklist', // Distinguish from rate limit (429)
          // I am keeping the `source` field in this object so the receiving code can read that value by its expected name.
          source: STATIC_BLOCKLIST.includes(ip) ? 'static' : 'redis'
        // I am keeping this line here because the surrounding ipFirewall.js workflow expects this value or operation before it continues.
        }, 'Blocked IP attempted access (blocklist, not rate limit)');

        // I am building or sending the Express response here with the status, data, or page already chosen by this route.
        res.set('Retry-After', '3600');
        // This return sends the completed value or response back to the code that called this function.
        return res.status(429).json({
          // I am keeping the `ok` field in this object so the receiving code can read that value by its expected name.
          ok: false,
          // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
          error: 'Too many requests'
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        });
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }

      // IP is not blocked, continue
      return next();
    // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
    } catch (error) {
      /**
       * WHAT:
       * Redis call errored; enter degraded mode.
       *
       * WHY:
       * Close the previous fail-open gap for sensitive surfaces.
       *
       * HOW:
       * Fail-closed (503) for sensitive or non-GET; public GETs allowed via memory limiter.
       */
      logger.warn({
        // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
        event: 'ip_firewall.redis_error',
        // I am keeping this line here because the surrounding ipFirewall.js workflow expects this value or operation before it continues.
        ip,
        // I am keeping the `path` field in this object so the receiving code can read that value by its expected name.
        path: req.originalUrl || req.path,
        // I am keeping the `method` field in this object so the receiving code can read that value by its expected name.
        method: req.method,
        // I am keeping the `requestId` field in this object so the receiving code can read that value by its expected name.
        requestId: req.requestId,
        // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
        error: error.message
      // I am keeping this line here because the surrounding ipFirewall.js workflow expects this value or operation before it continues.
      }, 'Firewall Redis error; entering degraded mode');
      // This return sends the completed value or response back to the code that called this function.
      return handleFailMode();
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  };
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// ============================================================
// Exports
// ============================================================

module.exports = {
  // I am keeping this line here because the surrounding ipFirewall.js workflow expects this value or operation before it continues.
  ipFirewall,
  // I am keeping this line here because the surrounding ipFirewall.js workflow expects this value or operation before it continues.
  blockIp,
  // I am keeping this line here because the surrounding ipFirewall.js workflow expects this value or operation before it continues.
  unblockIp,
  // I am keeping this line here because the surrounding ipFirewall.js workflow expects this value or operation before it continues.
  isBlocked
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
};