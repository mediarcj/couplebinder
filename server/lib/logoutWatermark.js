// Description: Helpers for setting and reading logout watermarks in Redis
// Notes: Keeps auth cookie routes and account lifecycle flows in sync

const logger = require('../utils/logger');

let redis = null;
try {
  const { client } = require('../utils/redisClient');
  redis = client;
} catch {
  redis = null;
}

const LAST_LOGOUT_TTL_SEC = 60 * 60 * 24 * 14; // 14 days
const keyForUser = (uid) => `auth:last_logout_at:${uid}`;

/**
 * Store the logout watermark to block stale tokens (per-user).
 *
 * After logout or account deletion we must deny background re-hydration attempts.
 *
 * Write seconds-since-epoch to Redis with TTL. If Redis is unavailable we skip quietly.
 */
async function setLastLogoutNow(uid) {
  if (!uid || !redis) return;
  try {
    const nowSec = Math.floor(Date.now() / 1000);
    await redis.set(keyForUser(uid), String(nowSec), { EX: LAST_LOGOUT_TTL_SEC });
  } catch (err) {
    logger.warn({ event: 'logout_watermark.set_failed', userId: uid, error: err.message }, 'Failed to set logout watermark');
  }
}

/**
 * Retrieve the stored logout watermark for a user.
 *
 * Auth cookie logic needs this to reject stale tokens.
 *
 * Read Redis value, cast to number, return 0 when unavailable.
 */
async function getLastLogoutAt(uid) {
  if (!uid || !redis) return 0;
  try {
    const val = await redis.get(keyForUser(uid));
    return val ? Number(val) || 0 : 0;
  } catch {
    return 0;
  }
}

module.exports = {
  setLastLogoutNow,
  getLastLogoutAt
};

