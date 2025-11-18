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
try {
  const { client } = require('../utils/redisClient');
  redis = client;
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
  return crypto.createHash('sha256').update(String(input)).digest('hex').slice(0, 32);
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
const kUserLock  = (email) => `lock:login:lock:user:${h(email)}`;
const kIpCount   = (ip)    => `lock:login:count:ip:${ip}`;
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
  const ttl = await redis.ttl(key);
  return ttl > 0 ? ttl : 0;
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
  if (!redis) {
    // Graceful fallback: no lockouts if Redis unavailable
    return { locked: false };
  }

  const [userTTL, ipTTL] = await Promise.all([
    ttlIfLocked(kUserLock(email)),
    ttlIfLocked(kIpLock(ip)),
  ]);

  if (userTTL > 0) {
    return {
      locked: true,
      message: `Account locked. Try again in ${userTTL}s.`,
      remainingTime: userTTL
    };
  }
  
  if (ipTTL > 0) {
    return {
      locked: true,
      message: `IP locked. Try again in ${ipTTL}s.`,
      remainingTime: ipTTL
    };
  }
  
  return { locked: false };
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
  if (!redis) {
    // Graceful fallback: no persistence if Redis unavailable
    return;
  }

  // CRITICAL SECTION: Atomic increment and lock setting
  const multi = redis.multi();

  multi.incr(kUserCount(email));
  multi.expire(kUserCount(email), COUNTS_TTL_SECONDS);
  multi.incr(kIpCount(ip));
  multi.expire(kIpCount(ip), COUNTS_TTL_SECONDS);

  const results = await multi.exec();
  
  // Extract counts from multi results
  const userCount = Number(results[0]) || 1;
  const ipCount = Number(results[2]) || 1;

  // Derive step indexes (progressive backoff)
  const userIdx = Math.min(userCount - 1, USER_LOCK_STEPS.length - 1);
  const ipIdx   = Math.min(ipCount - 1, IP_LOCK_STEPS.length - 1);

  const userLockSec = USER_LOCK_STEPS[userIdx];
  const ipLockSec   = IP_LOCK_STEPS[ipIdx];

  // Set/extend locks with new TTL
  const m2 = redis.multi();
  m2.set(kUserLock(email), '1', { EX: userLockSec });
  m2.set(kIpLock(ip), '1', { EX: ipLockSec });

  await m2.exec();
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
  if (!redis) {
    // Graceful fallback: nothing to clear if Redis unavailable
    return;
  }

  const keys = [
    kUserCount(email),
    kUserLock(email),
    kIpCount(ip),
    kIpLock(ip)
  ];
  
  const deleted = await redis.del(keys);
  
  // Log lockout clearing for debugging (only if keys were actually deleted)
  if (deleted > 0) {
    const logger = require('../utils/logger');
    logger.info({
      event: 'lockout.cleared',
      email: email ? 'present' : 'missing',
      ip: ip || 'unknown',
      keysDeleted: deleted
    }, 'Cleared account lockouts after successful authentication');
  }
}

module.exports = {
  checkAccountLockout,
  recordFailedAttempt,
  clearFailedAttempts,
};

