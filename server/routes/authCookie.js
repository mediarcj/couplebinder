// File: server/routes/authCookie.js
// Description: Set and clear the auth cookie using __Host- rules
// Notes: __Host- cookies must be Secure, Path=/, and have no Domain

/**
 * WHAT:
 * Set the cookie named from env (default: sb_session) and, if it starts
 * with "__Host-", do NOT set a Domain. Clear old cookie names for safety.
 *
 * WHY:
 * "__Host-" prevents subdomain fixation. Clearing old names avoids
 * conflicting cookies lingering on browsers.
 *
 * HOW:
 * 1) Use env-driven cookie name (AUTH_COOKIE_NAME)
 * 2) If cookie name starts with "__Host-", omit domain (required by spec)
 * 3) Clear legacy cookie names on set/clear for migration safety
 */

const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth/supabaseJwt');
const { audit } = require('../lib/audit');
const { checkAccountLockout, recordFailedAttempt, clearFailedAttempts } = require('../middleware/lockout');
const logger = require('../utils/logger');

// ============================================================
// Configuration
// ============================================================
const COOKIE_NAME = process.env.AUTH_COOKIE_NAME || 'sb_session';
const COOKIE_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days
const LEGACY_DOMAIN = '.detechify.com'; // used only to clear old cookies

// Base attributes for our auth cookie
const baseCookie = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  path: '/', // REQUIRED for __Host-
};

/**
 * POST /auth/set-cookie
 * 
 * WHAT:
 * Accepts a Bearer token from the Authorization header, verifies it server-side,
 * and sets it as an HttpOnly cookie only if valid. Supports __Host- prefix.
 * 
 * WHY:
 * We never trust the client. Before storing a token in a secure cookie, we must
 * verify it's legitimate. __Host- prefix prevents subdomain cookie attacks.
 * 
 * HOW:
 * 1. Extract token from Authorization: Bearer header
 * 2. Verify token signature, issuer, audience, and expiration via JWKS
 * 3. Set cookie with proper flags (omit domain if __Host-)
 * 4. Clear legacy cookie names for migration safety
 * 5. Return user ID on success for client confirmation
 */
router.post('/set-cookie', async (req, res) => {
  try {
    /**
     * WHAT:
     * Check for account/IP lockouts before processing token.
     * 
     * WHY:
     * Prevent brute force attacks on token verification.
     * Lockouts must be checked server-side before any auth attempt.
     * 
     * HOW:
     * Extract IP from request.
     * Extract email from token payload if available (or use 'ip-only' as placeholder).
     * Check Redis for active lockouts.
     * Return 429 if locked with remaining time.
     */
    const ip = req.clientIp || req.ip || 'unknown';
    const emailFromBody = (req.body?.email || '').toLowerCase().trim();
    
    // Check lockout status before processing
    const lock = await checkAccountLockout(emailFromBody || 'ip-only', ip);
    if (lock.locked) {
      res.set('Retry-After', String(lock.remainingTime || 60));
      return res.status(429).json({
        ok: false,
        error: lock.message
      });
    }

    // Extract Bearer token from Authorization header
    const auth = req.get('authorization') || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : null;
    
    if (!token) {
      return res.status(400).json({ 
        ok: false, 
        error: 'Missing bearer token in Authorization header' 
      });
    }

    // Verify token server-side before setting cookie (CRITICAL SECURITY CHECK)
    let payload;
    try {
      payload = await verifyToken(token);
    } catch (verifyError) {
      /**
       * WHAT:
       * Record failed token verification attempt.
       * 
       * WHY:
       * Failed token verification indicates potential brute force attack.
       * Progressive lockout deters attackers.
       * 
       * HOW:
       * Record failure in Redis with user email (from payload if available) and IP.
       * Lockout duration increases with each failure.
       */
      const code = verifyError?.code || 'verify_failed';
      logger.warn({
        event: 'auth.set_cookie.rejected',
        code,
        requestId: req.requestId
      }, 'Set-cookie token verification failed');
      
      // Record failed attempt for lockout tracking
      await recordFailedAttempt(emailFromBody || 'ip-only', ip);
      
      // Audit log: failed cookie set
      audit('auth.set_cookie.fail', { reason: code }, req);
      
      return res.status(401).json({ 
        ok: false, 
        code: code,
        error: 'Invalid token' 
      });
    }

    /**
     * WHAT:
     * Clear failed attempts on successful token verification.
     * 
     * WHY:
     * Successful authentication should reset lockout state.
     * Prevents legitimate users from being locked out.
     * 
     * HOW:
     * Extract email from verified token payload.
     * Clear all lockout counters and locks in Redis.
     */
    const userEmail = payload.email || emailFromBody || 'ip-only';
    await clearFailedAttempts(userEmail, ip);

    // ============================================================
    // Set the new cookie with __Host- support
    // ============================================================
    // IMPORTANT: do not set Domain if using __Host- prefix (spec requirement)
    const opts = { ...baseCookie };
    if (!COOKIE_NAME.startsWith('__Host-') && process.env.AUTH_COOKIE_DOMAIN) {
      opts.domain = process.env.AUTH_COOKIE_DOMAIN;
    }

    // Set the new cookie
    res.cookie(COOKIE_NAME, token, { ...opts, maxAge: COOKIE_TTL_MS });

    // ============================================================
    // One-time cleanup of legacy cookie names (migration safety)
    // ============================================================
    // Clear old cookie names to prevent conflicts during migration
    ['sb-access-token', 'sb_session'].forEach((n) => {
      // Clear domain-scoped variant (old deployments)
      res.clearCookie(n, { path: '/', domain: LEGACY_DOMAIN });
      // Clear host-scoped variant (old deployments)
      res.clearCookie(n, { path: '/' });
    });

    // ============================================================
    // Audit log: successful cookie set
    // ============================================================
    audit('auth.set_cookie.ok', { ttl_ms: COOKIE_TTL_MS }, req);

    return res.json({ ok: true, userId: payload.sub });
  } catch (error) {
    logger.error({
      event: 'auth.set_cookie.exception',
      error: error.message,
      requestId: req.requestId
    }, 'Set-cookie route exception');
    return res.status(500).json({ 
      ok: false, 
      error: 'Failed to set cookie' 
    });
  }
});

/**
 * POST /auth/clear-cookie
 * 
 * WHAT:
 * Clears the auth cookie and legacy cookie names for complete logout.
 * 
 * WHY:
 * On logout, we need to remove all authentication cookies from the browser,
 * including legacy names from previous deployments.
 * 
 * HOW:
 * Clear the current cookie name and all legacy names with proper options.
 * __Host- cookies must NOT have domain set when clearing.
 */
router.post('/clear-cookie', (req, res) => {
  try {
    // ============================================================
    // Clear the new name and old names for complete logout
    // ============================================================
    ['__Host-sb_session', COOKIE_NAME, 'sb-access-token', 'sb_session'].forEach((n) => {
      const clearOpts = n.startsWith('__Host-')
        ? { httpOnly: true, secure: true, sameSite: 'lax', path: '/' } // NO domain (spec requirement)
        : { path: '/', domain: process.env.AUTH_COOKIE_DOMAIN || undefined };

      res.clearCookie(n, clearOpts);
    });

    // ============================================================
    // Audit log: successful cookie clear
    // ============================================================
    audit('auth.clear_cookie.ok', {}, req);

    return res.json({ ok: true });
  } catch (error) {
    logger.error({
      event: 'auth.clear_cookie.exception',
      error: error.message,
      requestId: req.requestId
    }, 'Clear-cookie route exception');
    return res.status(500).json({ 
      ok: false, 
      error: 'Failed to clear cookie' 
    });
  }
});

module.exports = router;
