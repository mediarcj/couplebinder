// File: server/lib/logoutWatermark.js
// Description: Helpers for setting and reading logout watermarks in Redis
// Notes: Keeps auth cookie routes and account lifecycle flows in sync

const logger = require('../utils/logger');

// I am saving `redis` here so the nearby steps can reuse the same value without rebuilding it each time.
let redis = null;
// I am starting a guarded operation here because a request, parser, or dependency used below may fail.
try {
  // I am loading `../utils/redisClient` into `client` so this file can reuse that dependency below.
  const { client } = require('../utils/redisClient');
  // I am keeping this line here because the surrounding logoutWatermark.js workflow expects this value or operation before it continues.
  redis = client;
// I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
} catch {
  // I am keeping this line here because the surrounding logoutWatermark.js workflow expects this value or operation before it continues.
  redis = null;
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

const LAST_LOGOUT_TTL_SEC = 60 * 60 * 24 * 14; // 14 days
// I am saving `keyForUser` here so the nearby steps can reuse the same value without rebuilding it each time.
const keyForUser = (uid) => `auth:last_logout_at:${uid}`;

/**
 * WHAT:
 * Store the logout watermark to block stale tokens (per-user).
 *
 * WHY:
 * After logout or account deletion we must deny background re-hydration attempts.
 *
 * HOW:
 * Write seconds-since-epoch to Redis with TTL. If Redis is unavailable we skip quietly.
 */
async function setLastLogoutNow(uid) {
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!uid || !redis) return;
  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // I am saving `nowSec` here so the nearby steps can reuse the same value without rebuilding it each time.
    const nowSec = Math.floor(Date.now() / 1000);
    // I am waiting for this asynchronous step here so the next line does not use its result before it is ready.
    await redis.set(keyForUser(uid), String(nowSec), { EX: LAST_LOGOUT_TTL_SEC });
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (err) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.warn({ event: 'logout_watermark.set_failed', userId: uid, error: err.message }, 'Failed to set logout watermark');
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * WHAT:
 * Retrieve the stored logout watermark for a user.
 *
 * WHY:
 * Auth cookie logic needs this to reject stale tokens.
 *
 * HOW:
 * Read Redis value, cast to number, return 0 when unavailable.
 */
async function getLastLogoutAt(uid) {
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!uid || !redis) return 0;
  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // I am saving `val` here so the nearby steps can reuse the same value without rebuilding it each time.
    const val = await redis.get(keyForUser(uid));
    // This return sends the completed value or response back to the code that called this function.
    return val ? Number(val) || 0 : 0;
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch {
    // This return sends the completed value or response back to the code that called this function.
    return 0;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am exporting this value here so another module can deliberately reuse the completed piece from logoutWatermark.js.
module.exports = {
  // I am keeping this line here because the surrounding logoutWatermark.js workflow expects this value or operation before it continues.
  setLastLogoutNow,
  // I am keeping this line here because the surrounding logoutWatermark.js workflow expects this value or operation before it continues.
  getLastLogoutAt
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
};

