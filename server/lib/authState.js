// File: server/lib/authState.js
// Description: Helpers to detect authentication state for session expiration logic
// Purpose: Distinguish between expired sessions and never-authenticated requests
// Notes: Used by requireAuth middleware to determine if user should see inactivity message

const { AUTH_COOKIE_NAME } = require('./authCookie');
// I am loading `../config` into `config` so this file can reuse that dependency below.
const { config } = require('../config');

/**
 * WHAT:
 * Check if the request has any auth cookie (canonical or legacy).
 * 
 * WHY:
 * We need to know if a user had a session cookie, even if it's now invalid/expired.
 * This helps distinguish "expired session" from "never logged in".
 * 
 * HOW:
 * Check for canonical cookie name (with __Host- prefix in prod), plain name, and legacy names.
 * Returns true if ANY auth cookie is present, false otherwise.
 * 
 * @param {import('express').Request} req - Express request object
 * @returns {boolean} True if any auth cookie is present
 */
function hasAuthCookie(req) {
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!req.cookies) return false;
  
  // I am saving `cookieName` here so the nearby steps can reuse the same value without rebuilding it each time.
  const cookieName = AUTH_COOKIE_NAME;
  // I am saving `hostPrefixed` here so the nearby steps can reuse the same value without rebuilding it each time.
  const hostPrefixed = `__Host-${cookieName.replace(/^__Host-/, '')}`;
  
  // Check canonical names (current + host-prefixed)
  if (req.cookies[cookieName] || req.cookies[hostPrefixed]) {
    // This return sends the completed value or response back to the code that called this function.
    return true;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
  
  // Check legacy cookie names (still accepted by authBridge)
  if (req.cookies['sb-access-token'] || req.cookies['sb_session']) {
    // This return sends the completed value or response back to the code that called this function.
    return true;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
  
  // This return sends the completed value or response back to the code that called this function.
  return false;
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * WHAT:
 * Check if the manual logout sentinel cookie is present and active.
 * 
 * WHY:
 * Manual logout sets a sentinel cookie. If it's present, we should NOT treat
 * the request as "expired due to inactivity" - it was a deliberate logout.
 * 
 * HOW:
 * Check for the sentinel cookie name. If sentinel feature is disabled (SENTINEL_MS = 0),
 * always return false (no sentinel to check).
 * 
 * @param {import('express').Request} req - Express request object
 * @returns {boolean} True if sentinel cookie is present and active
 */
function hasManualLogoutSentinel(req) {
  // I am saving `SENTINEL_COOKIE_NAME` here so the nearby steps can reuse the same value without rebuilding it each time.
  const SENTINEL_COOKIE_NAME = 'auth_logout';
  // I am saving `SENTINEL_MS` here so the nearby steps can reuse the same value without rebuilding it each time.
  const SENTINEL_MS = Number(config.auth?.sentinelMs ?? 0);
  
  // If sentinel feature is disabled, there's no sentinel to check
  if (SENTINEL_MS <= 0) {
    // This return sends the completed value or response back to the code that called this function.
    return false;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
  
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!req.cookies) return false;
  
  // Sentinel cookie value is '1' when active
  const sentinelValue = String(req.cookies[SENTINEL_COOKIE_NAME] || '');
  // This return sends the completed value or response back to the code that called this function.
  return sentinelValue === '1';
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * WHAT:
 * Determine if this request likely represents an expired/invalid session (not just unauthenticated).
 * 
 * WHY:
 * We want to show "logged out due to inactivity" message only for users who HAD a session
 * that expired, not for bots/crawlers who never logged in.
 * 
 * HOW:
 * Returns true ONLY if:
 * - An auth cookie is present (user had a session)
 * - req.user is null (token verification failed - expired/invalid)
 * - Manual logout sentinel is NOT present (not a deliberate logout)
 * 
 * @param {import('express').Request} req - Express request object
 * @returns {boolean} True if this looks like an expired session
 */
function isLikelyExpiredSession(req) {
  // Must have had an auth cookie
  if (!hasAuthCookie(req)) {
    // This return sends the completed value or response back to the code that called this function.
    return false;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
  
  // Must have failed verification (req.user is null)
  if (req.user?.id) {
    // This return sends the completed value or response back to the code that called this function.
    return false;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
  
  // Must NOT be a manual logout (no sentinel)
  if (hasManualLogoutSentinel(req)) {
    // This return sends the completed value or response back to the code that called this function.
    return false;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
  
  // This return sends the completed value or response back to the code that called this function.
  return true;
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am exporting this value here so another module can deliberately reuse the completed piece from authState.js.
module.exports = {
  // I am keeping this line here because the surrounding authState.js workflow expects this value or operation before it continues.
  hasAuthCookie,
  // I am keeping this line here because the surrounding authState.js workflow expects this value or operation before it continues.
  hasManualLogoutSentinel,
  // I am keeping this line here because the surrounding authState.js workflow expects this value or operation before it continues.
  isLikelyExpiredSession
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
};

