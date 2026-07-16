// File: server/middleware/lockout.js
// Description: Redis-backed account and IP lockouts for multi-instance safety
// Purpose: Progressive lockout system that persists across server restarts
// Notes: Replaces in-memory Maps with Redis for shared state

/**
 * WHAT:
 * Centralized account and IP lockout system using Redis.
 *
 * WHY:
 * In-memory lockouts don't work across multiple instances or restarts.
 * Redis provides shared, persistent lockout state.
 *
 * HOW:
 * Track failed attempts in Redis with progressive backoff.
 * Hash email addresses to avoid storing PII in Redis keys.
 * Use atomic Redis operations for consistency.
 *
 * IMPORTANT: Lockouts are ONLY triggered by failed authentication attempts
 * in the /auth/set-cookie route (server/routes/authCookie.js). Other routes
 * such as password change, account deletion, and profile updates do NOT
 * trigger lockouts because they require authentication (user is already logged in).
 *
 * Lockout triggers:
 * - Invalid token verification in /auth/set-cookie
 * - Stale token (predates last logout) in /auth/set-cookie
 *
 * Lockout clearing:
 * - Successful authentication in /auth/set-cookie
 * - Successful password verification in /account/password (after password change)
 */

const crypto = require('node:crypto');

// ============================================================
// Redis Client Setup
// Reuse the singleton Redis client from the app
// ============================================================
let redis = null;
// I am starting a guarded operation here because a request, parser, or dependency used below may fail.
try {
  // I am loading `../utils/redisClient` into `client` so this file can reuse that dependency below.
  const { client } = require('../utils/redisClient');
  // I am keeping this line here because the surrounding lockout.js workflow expects this value or operation before it continues.
  redis = client;
// I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
} catch {
  // No Redis available, lockouts will be disabled
}

/**
 * WHAT:
 * Hash PII (email) before using as Redis key segment.
 * 
 * WHY:
 * Avoid storing raw email addresses in Redis keys.
 * Prevents PII exposure if Redis is compromised.
 * 
 * HOW:
 * Use SHA-256 hash, take first 32 characters.
 * 
 * @param {string} input - Email or other PII
 * @returns {string} Hashed value (32 chars)
 */
function h(input) {
  // This return sends the completed value or response back to the code that called this function.
  return crypto.createHash('sha256').update(String(input)).digest('hex').slice(0, 32);
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// ============================================================
// Progressive Lockout Ladders (seconds)
// ============================================================
const USER_LOCK_STEPS = [60, 300, 900, 1800, 3600];    // 1m, 5m, 15m, 30m, 60m
const IP_LOCK_STEPS   = [300, 900, 1800, 3600, 7200]; // 5m, 15m, 30m, 60m, 120m

// TTL horizon for counting attempts (how long history sticks around)
const COUNTS_TTL_SECONDS = 90 * 24 * 60 * 60; // 90 days

// ============================================================
// Redis Key Helpers
// ============================================================
const kUserCount = (email) => `lock:login:count:user:${h(email)}`;
// I am saving `kUserLock` here so the nearby steps can reuse the same value without rebuilding it each time.
const kUserLock  = (email) => `lock:login:lock:user:${h(email)}`;
// I am saving `kIpCount` here so the nearby steps can reuse the same value without rebuilding it each time.
const kIpCount   = (ip)    => `lock:login:count:ip:${ip}`;
// I am saving `kIpLock` here so the nearby steps can reuse the same value without rebuilding it each time.
const kIpLock    = (ip)    => `lock:login:lock:ip:${ip}`;

/**
 * WHAT:
 * Check if a key is currently locked.
 * 
 * WHY:
 * Need to know remaining lock time before allowing action.
 * 
 * HOW:
 * Use Redis TTL command to get remaining seconds.
 * Return 0 if not locked or expired.
 * 
 * @param {string} key - Redis key to check
 * @returns {Promise<number>} Remaining seconds (0 if not locked)
 */
async function ttlIfLocked(key) {
  // I am saving `ttl` here so the nearby steps can reuse the same value without rebuilding it each time.
  const ttl = await redis.ttl(key);
  // This return sends the completed value or response back to the code that called this function.
  return ttl > 0 ? ttl : 0;
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * WHAT:
 * Check current lock state for user and IP.
 * 
 * WHY:
 * Must verify lockout status before allowing login attempts.
 * Prevents brute force attacks.
 * 
 * HOW:
 * Check both user and IP lock keys in parallel.
 * Return locked status with remaining time.
 * 
 * @param {string} email - User email address
 * @param {string} ip - Client IP address
 * @returns {Promise<Object>} { locked: boolean, message?: string, remainingTime?: number }
 */
async function checkAccountLockout(email, ip) {
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!redis) {
    // Graceful fallback: no lockouts if Redis unavailable
    return { locked: false };
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am saving `userTTL` here so the nearby steps can reuse the same value without rebuilding it each time.
  const [userTTL, ipTTL] = await Promise.all([
    // I am calling this helper here so the current workflow performs this step before it moves on.
    ttlIfLocked(kUserLock(email)),
    // I am calling this helper here so the current workflow performs this step before it moves on.
    ttlIfLocked(kIpLock(ip)),
  // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
  ]);

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (userTTL > 0) {
    // This return sends the completed value or response back to the code that called this function.
    return {
      // I am keeping the `locked` field in this object so the receiving code can read that value by its expected name.
      locked: true,
      // I am keeping the `message` field in this object so the receiving code can read that value by its expected name.
      message: `Account locked. Try again in ${userTTL}s.`,
      // I am keeping the `remainingTime` field in this object so the receiving code can read that value by its expected name.
      remainingTime: userTTL
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    };
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
  
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (ipTTL > 0) {
    // This return sends the completed value or response back to the code that called this function.
    return {
      // I am keeping the `locked` field in this object so the receiving code can read that value by its expected name.
      locked: true,
      // I am keeping the `message` field in this object so the receiving code can read that value by its expected name.
      message: `IP locked. Try again in ${ipTTL}s.`,
      // I am keeping the `remainingTime` field in this object so the receiving code can read that value by its expected name.
      remainingTime: ipTTL
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    };
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
  
  // This return sends the completed value or response back to the code that called this function.
  return { locked: false };
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * WHAT:
 * Record a failed login attempt with progressive backoff.
 * 
 * WHY:
 * Each failure increases lockout duration to deter brute force.
 * Separate tracking for user and IP prevents bypass.
 * 
 * HOW:
 * Increment failure counters for user and IP.
 * Calculate lockout duration based on failure count.
 * Set lock keys with appropriate TTL.
 * Use Redis MULTI for atomic operations.
 * 
 * @param {string} email - User email address
 * @param {string} ip - Client IP address
 * @returns {Promise<void>}
 */
async function recordFailedAttempt(email, ip) {
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!redis) {
    // Graceful fallback: no persistence if Redis unavailable
    return;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // CRITICAL SECTION: Atomic increment and lock setting
  const multi = redis.multi();

  // I am calling this helper here so the current workflow performs this step before it moves on.
  multi.incr(kUserCount(email));
  // I am calling this helper here so the current workflow performs this step before it moves on.
  multi.expire(kUserCount(email), COUNTS_TTL_SECONDS);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  multi.incr(kIpCount(ip));
  // I am calling this helper here so the current workflow performs this step before it moves on.
  multi.expire(kIpCount(ip), COUNTS_TTL_SECONDS);

  // I am saving `results` here so the nearby steps can reuse the same value without rebuilding it each time.
  const results = await multi.exec();
  
  // Extract counts from multi results
  const userCount = Number(results[0]) || 1;
  // I am saving `ipCount` here so the nearby steps can reuse the same value without rebuilding it each time.
  const ipCount = Number(results[2]) || 1;

  // Derive step indexes (progressive backoff)
  const userIdx = Math.min(userCount - 1, USER_LOCK_STEPS.length - 1);
  // I am saving `ipIdx` here so the nearby steps can reuse the same value without rebuilding it each time.
  const ipIdx   = Math.min(ipCount - 1, IP_LOCK_STEPS.length - 1);

  // I am saving `userLockSec` here so the nearby steps can reuse the same value without rebuilding it each time.
  const userLockSec = USER_LOCK_STEPS[userIdx];
  // I am saving `ipLockSec` here so the nearby steps can reuse the same value without rebuilding it each time.
  const ipLockSec   = IP_LOCK_STEPS[ipIdx];

  // Set/extend locks with new TTL
  const m2 = redis.multi();
  // I am calling this helper here so the current workflow performs this step before it moves on.
  m2.set(kUserLock(email), '1', { EX: userLockSec });
  // I am calling this helper here so the current workflow performs this step before it moves on.
  m2.set(kIpLock(ip), '1', { EX: ipLockSec });

  // I am waiting for this asynchronous step here so the next line does not use its result before it is ready.
  await m2.exec();
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * WHAT:
 * Clear all failure counts and locks after successful authentication.
 * 
 * WHY:
 * Successful authentication should reset lockout state.
 * Prevents legitimate users from being locked out.
 * 
 * HOW:
 * Delete all count and lock keys for user and IP.
 * Use single DEL command for efficiency.
 * 
 * NOTE: Lockouts are ONLY triggered by failed authentication attempts
 * in /auth/set-cookie route. Other routes (password change, account deletion,
 * profile updates) do NOT trigger lockouts as they require authentication.
 * 
 * @param {string} email - User email address
 * @param {string} ip - Client IP address
 * @returns {Promise<void>}
 */
async function clearFailedAttempts(email, ip) {
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!redis) {
    // Graceful fallback: nothing to clear if Redis unavailable
    return;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am saving `keys` here so the nearby steps can reuse the same value without rebuilding it each time.
  const keys = [
    // I am calling this helper here so the current workflow performs this step before it moves on.
    kUserCount(email),
    // I am calling this helper here so the current workflow performs this step before it moves on.
    kUserLock(email),
    // I am calling this helper here so the current workflow performs this step before it moves on.
    kIpCount(ip),
    // I am calling this helper here so the current workflow performs this step before it moves on.
    kIpLock(ip)
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  ];
  
  // Also try to clear IPv6-mapped IPv4 format if IP looks like IPv4
  // Cloudflare sometimes normalizes IPv4 to ::ffff:x.x.x.x format
  // Also handle case where IP might be stored in different formats
  const additionalKeys = [];
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (ip && ip.includes('.')) {
    // IPv4 address - also try IPv6-mapped format
    const ipv6Mapped = `::ffff:${ip}`;
    // I am calling this helper here so the current workflow performs this step before it moves on.
    additionalKeys.push(kIpCount(ipv6Mapped), kIpLock(ipv6Mapped));
  // I am checking this next possibility only because the earlier condition did not choose its path.
  } else if (ip && ip.startsWith('::ffff:')) {
    // IPv6-mapped IPv4 - also try pure IPv4
    const ipv4 = ip.replace(/^::ffff:/, '');
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (ipv4.includes('.')) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      additionalKeys.push(kIpCount(ipv4), kIpLock(ipv4));
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
  
  // Normalize IPv6 addresses (remove leading zeros, lowercase)
  // This helps catch cases where the same IP might be stored in different formats
  if (ip && ip.includes(':')) {
    // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
    try {
      // Try to normalize IPv6 (basic normalization)
      const normalized = ip.toLowerCase().replace(/(^|:)0+([0-9a-f])/g, '$1$2');
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (normalized !== ip) {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        additionalKeys.push(kIpCount(normalized), kIpLock(normalized));
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
    } catch {
      // Ignore normalization errors
    }
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
  
  // I am saving `allKeys` here so the nearby steps can reuse the same value without rebuilding it each time.
  const allKeys = [...keys, ...additionalKeys];
  // I am saving `deleted` here so the nearby steps can reuse the same value without rebuilding it each time.
  const deleted = await redis.del(allKeys);
  
  // Log lockout clearing for debugging (only if keys were actually deleted)
  if (deleted > 0) {
    // I am loading `../utils/logger` into `logger` so this file can reuse that dependency below.
    const logger = require('../utils/logger');
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.info({
      // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
      event: 'lockout.cleared',
      // I am keeping the `email` field in this object so the receiving code can read that value by its expected name.
      email: email ? 'present' : 'missing',
      // I am keeping the `ip` field in this object so the receiving code can read that value by its expected name.
      ip: ip || 'unknown',
      // I am keeping the `keysDeleted` field in this object so the receiving code can read that value by its expected name.
      keysDeleted: deleted,
      // I am keeping the `keysAttempted` field in this object so the receiving code can read that value by its expected name.
      keysAttempted: allKeys.length
    // I am keeping this line here because the surrounding lockout.js workflow expects this value or operation before it continues.
    }, 'Cleared account and IP lockouts after successful authentication');
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am exporting this value here so another module can deliberately reuse the completed piece from lockout.js.
module.exports = {
  // I am keeping this line here because the surrounding lockout.js workflow expects this value or operation before it continues.
  checkAccountLockout,
  // I am keeping this line here because the surrounding lockout.js workflow expects this value or operation before it continues.
  recordFailedAttempt,
  // I am keeping this line here because the surrounding lockout.js workflow expects this value or operation before it continues.
  clearFailedAttempts,
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
};

