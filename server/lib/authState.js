// File: server/lib/authState.js
// Description: Helpers to detect authentication state for session expiration logic
// Purpose: Distinguish between expired sessions and never-authenticated requests
// Notes: Used by requireAuth middleware to determine if user should see inactivity message

const { AUTH_COOKIE_NAME } = require('./authCookie');
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
  if (!req.cookies) return false;
  
  const cookieName = AUTH_COOKIE_NAME;
  const hostPrefixed = `__Host-${cookieName.replace(/^__Host-/, '')}`;
  
  // Check canonical names (current + host-prefixed)
  if (req.cookies[cookieName] || req.cookies[hostPrefixed]) {
    return true;
  }
  
  // Check legacy cookie names (still accepted by authBridge)
  if (req.cookies['sb-access-token'] || req.cookies['sb_session']) {
    return true;
  }
  
  return false;
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
  const SENTINEL_COOKIE_NAME = 'auth_logout';
  const SENTINEL_MS = Number(config.auth?.sentinelMs ?? 0);
  
  // If sentinel feature is disabled, there's no sentinel to check
  if (SENTINEL_MS <= 0) {
    return false;
  }
  
  if (!req.cookies) return false;
  
  // Sentinel cookie value is '1' when active
  const sentinelValue = String(req.cookies[SENTINEL_COOKIE_NAME] || '');
  return sentinelValue === '1';
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
    return false;
  }
  
  // Must have failed verification (req.user is null)
  if (req.user?.id) {
    return false;
  }
  
  // Must NOT be a manual logout (no sentinel)
  if (hasManualLogoutSentinel(req)) {
    return false;
  }
  
  return true;
}

module.exports = {
  hasAuthCookie,
  hasManualLogoutSentinel,
  isLikelyExpiredSession
};

