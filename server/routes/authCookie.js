// File: server/routes/authCookie.js
// Description: Set and clear the auth cookie using __Host- rules (big-tech style watermark)
// Notes:
// - Verifies the token with JWKS (verifyToken)
// - Blocks only *stale* tokens (iat <= last_logout_at[uid])
// - Allows instant re-login with a *fresh* token (no cooldown)
// - Keeps account/IP lockout protections
// - __Host- cookies: Secure + Path=/ + no Domain
// - Fallback sentinel is only used when watermark is unavailable (e.g., Redis down)

// =======================
// Imports
// =======================
const express = require('express');
const router = express.Router();

const { verifyToken } = require('../middleware/auth/supabaseJwt');
const { audit } = require('../lib/audit');
const {
  checkAccountLockout,
  recordFailedAttempt,
  clearFailedAttempts
} = require('../middleware/lockout');
const logger = require('../utils/logger');

// =======================
// Redis client (optional)
// =======================
let redis = null;
try {
  const { client } = require('../utils/redisClient');
  redis = client;
} catch {
  // No Redis available -> watermark will be unavailable; sentinel fallback will be used.
}

// =======================
// Configuration
// =======================
const COOKIE_NAME = process.env.AUTH_COOKIE_NAME || 'sb_session';
const COOKIE_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days
const LEGACY_DOMAIN = process.env.LEGACY_COOKIE_DOMAIN || '.detechify.com'; // used only to clear old cookies

// Watermark storage (seconds precision, per-user)
const LAST_LOGOUT_KEY = (uid) => `auth:last_logout_at:${uid}`;
const LAST_LOGOUT_TTL_SEC = parseInt(process.env.AUTH_LAST_LOGOUT_TTL_SEC || `${60 * 60 * 24 * 14}`, 10); // default 14 days

// Sentinel (fallback only). Keep small to reduce friction if used.
const SENTINEL_COOKIE_NAME = 'auth_logout';
const SENTINEL_MS = Math.min(
  Math.max(parseInt(process.env.AUTH_LOGOUT_SENTINEL_MS || '10000', 10), 0),
  30000
); // 0..30000 ms (default 10s, capped at 30s)

// If Redis watermark missing, allow *fresh* tokens to pass immediately, even if sentinel present.
// A newly issued token will usually have iat within a few seconds of "now".
const FRESH_LOGIN_GRACE_SEC = parseInt(process.env.AUTH_FRESH_LOGIN_GRACE_SEC || '20', 10);

// Base attributes for our auth cookie
const baseCookie = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  path: '/', // REQUIRED for __Host-
};

// =======================
// Helpers
// =======================

/**
 * Return the user logout watermark (seconds since epoch).
 * Returns 0 if watermark not found or Redis unavailable.
 */
async function getLastLogoutAt(uid) {
  if (!uid || !redis) return 0;
  try {
    const s = await redis.get(LAST_LOGOUT_KEY(uid));
    return s ? Number(s) || 0 : 0;
  } catch {
    return 0;
  }
}

/**
 * Set the user logout watermark to "now" (seconds) with TTL.
 * No-op if Redis unavailable.
 */
async function setLastLogoutNow(uid) {
  if (!uid || !redis) return;
  try {
    const nowSec = Math.floor(Date.now() / 1000);
    await redis.set(LAST_LOGOUT_KEY(uid), String(nowSec), { EX: LAST_LOGOUT_TTL_SEC });
  } catch (err) {
    logger.warn({ event: 'auth.set_last_logout.failed', error: err.message }, 'Failed to set logout watermark');
  }
}

/**
 * Determine if the sentinel (fallback) should block this request.
 * Only applied when watermark is unavailable (0).
 * We *allow* tokens that look fresh (iat within FRESH_LOGIN_GRACE_SEC),
 * and block the rest while the sentinel is active.
 */
function sentinelBlocks(req, tokenIatSec) {
  try {
    const sentinelActive =
      req.cookies && String(req.cookies[SENTINEL_COOKIE_NAME] || '') === '1';
    if (!sentinelActive) return false;

    // Allow *fresh* tokens to pass (interactive login just happened)
    const nowSec = Math.floor(Date.now() / 1000);
    if (tokenIatSec && nowSec - tokenIatSec <= FRESH_LOGIN_GRACE_SEC) {
      return false;
    }

    // Otherwise treat as stale background re-hydration while sentinel is active.
    return true;
  } catch {
    return false;
  }
}

/**
 * Build cookie options honoring __Host- rules.
 */
function buildCookieOpts() {
  const opts = { ...baseCookie };
  // If cookie name starts with __Host-, DO NOT set domain.
  if (!COOKIE_NAME.startsWith('__Host-') && process.env.AUTH_COOKIE_DOMAIN) {
    opts.domain = process.env.AUTH_COOKIE_DOMAIN;
  }
  return opts;
}

/**
 * Clear current and legacy cookies safely.
 */
function clearAllAuthCookies(res) {
  // Clear current name and legacy names
  ['__Host-sb_session', COOKIE_NAME, 'sb-access-token', 'sb_session'].forEach((n) => {
    const clearOpts = n.startsWith('__Host-')
      ? { httpOnly: true, secure: true, sameSite: 'lax', path: '/' } // NO domain for __Host-
      : { path: '/', domain: process.env.AUTH_COOKIE_DOMAIN || undefined };

    res.clearCookie(n, clearOpts);
  });
}

// =======================
// Routes
// =======================

/**
 * POST /auth/set-cookie
 *
 * Big-tech flow:
 * 1) Verify the Bearer token server-side (JWKS).
 * 2) Fetch user's logout watermark (last_logout_at) from Redis.
 * 3) Reject only *stale* tokens: token.iat <= last_logout_at.
 * 4) Allow *fresh* tokens immediately (no cooldown).
 * 5) If watermark unavailable (Redis down), use a *small* sentinel fallback:
 *    deny background re-hydration while sentinel active, but allow fresh tokens.
 */
router.post('/set-cookie', async (req, res) => {
  res.set('Vary', 'Cookie, Authorization, Accept');
  // For debugging in DevTools; safe meta only
  try {
    const sentinelActive = (req.cookies && String(req.cookies[SENTINEL_COOKIE_NAME] || '') === '1');
    res.set('X-Auth-Sentinel', sentinelActive ? 'active' : 'inactive');
  } catch (_) {}

  try {
    // Extract Bearer token
    const auth = req.get('authorization') || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : null;
    if (!token) {
      return res.status(400).json({ ok: false, error: 'Missing bearer token in Authorization header' });
    }

    // Verify token (signature, issuer, audience, exp, etc.)
    let payload;
    try {
      payload = await verifyToken(token);
    } catch (verifyError) {
      const ip = req.clientIp || req.ip || 'unknown';
      const emailFromBody = (req.body?.email || '').toLowerCase().trim();
      await recordFailedAttempt(emailFromBody || 'ip-only', ip);
      logger.warn({ event: 'auth.set_cookie.rejected', code: verifyError?.code || 'verify_failed', requestId: req.requestId }, 'Set-cookie token verification failed');
      audit('auth.set_cookie.fail', { reason: verifyError?.code || 'verify_failed' }, req);
      return res.status(401).json({ ok: false, error: 'Invalid token' });
    }

    const uid = payload.sub;
    const tokenIatSec = Number(payload.iat || 0); // JWT iat is seconds
    const ip = req.clientIp || req.ip || 'unknown';
    const emailFromBody = (req.body?.email || '').toLowerCase().trim();

    // Pre-auth brute-force guard
    const lock = await checkAccountLockout(emailFromBody || 'ip-only', ip);
    if (lock.locked) {
      res.set('Retry-After', String(lock.remainingTime || 60));
      return res.status(429).json({ ok: false, error: lock.message });
    }

    // User logout watermark
    const lastLogoutSec = await getLastLogoutAt(uid);
    res.set('X-Auth-Watermark', String(lastLogoutSec || 0));

    // Primary rule: reject stale tokens (token issued at or before last logout)
    if (lastLogoutSec && tokenIatSec && tokenIatSec <= lastLogoutSec) {
      logger.info(
        { event: 'auth.set_cookie.denied_stale_token', uid, tokenIatSec, lastLogoutSec, requestId: req.requestId },
        'Re-auth blocked: token predates last logout'
      );
      audit('auth.set_cookie.stale', { uid }, req);
      await recordFailedAttempt(emailFromBody || 'ip-only', ip); // count as failure for lockout
      return res.status(401).json({ ok: false, error: 'Stale token (logged out)' });
    }

    // Fallback: watermark missing (Redis unavailable or no key) -> apply small sentinel rule
    if (!lastLogoutSec && sentinelBlocks(req, tokenIatSec)) {
      // Deny only silent/background hydration while sentinel active
      logger.info(
        { event: 'auth.set_cookie.hydrate_denied_by_sentinel', requestId: req.requestId },
        'Hydration blocked by sentinel fallback'
      );
      res.set('X-Auth-Sentinel', 'active');
      // 204 so client backoff can retry quietly; interactive flows should not hit this due to fresh iat
      return res.status(204).end();
    }

    // Success path: token is valid and not stale -> clear failures, set cookie
    await clearFailedAttempts(emailFromBody || 'ip-only', ip);

    const opts = buildCookieOpts();
    res.cookie(COOKIE_NAME, token, { ...opts, maxAge: COOKIE_TTL_MS });

    // Clean up legacy cookie names to prevent conflicts
    ['sb-access-token', 'sb_session'].forEach((n) => {
      res.clearCookie(n, { path: '/', domain: LEGACY_DOMAIN });
      res.clearCookie(n, { path: '/' });
    });

    audit('auth.set_cookie.ok', { ttl_ms: COOKIE_TTL_MS }, req);
    return res.json({ ok: true, userId: uid });
  } catch (error) {
    logger.error({ event: 'auth.set_cookie.exception', error: error.message, requestId: req.requestId }, 'Set-cookie route exception');
    return res.status(500).json({ ok: false, error: 'Failed to set cookie' });
  }
});

/**
 * POST /auth/clear-cookie
 *
 * - Clears current and legacy cookies (complete logout).
 * - Sets per-user logout watermark in Redis (last_logout_at = now).
 * - Optionally sets a *small* client sentinel cookie as a fallback
 *   if Redis watermark is unavailable to the server later.
 * - Content negotiation: HTML forms -> redirect 303; XHR/fetch -> JSON.
 */
router.post('/clear-cookie', async (req, res) => {
  try {
    // Try to capture uid from the existing auth cookie BEFORE clearing it
    let uidFromCookie = null;
    try {
      const raw = req.cookies?.[COOKIE_NAME];
      if (raw) {
        const payload = await verifyToken(raw).catch(() => null);
        uidFromCookie = payload?.sub || null;
      }
    } catch {
      // ignore
    }

    // Clear cookies (new + legacy)
    clearAllAuthCookies(res);

    // Write logout watermark for this user (if we could identify them)
    if (uidFromCookie) {
      await setLastLogoutNow(uidFromCookie);
      audit('auth.clear_cookie.ok', { uid: uidFromCookie }, req);
    } else {
      audit('auth.clear_cookie.ok', {}, req);
    }

    // Optional: tiny client sentinel as a fallback if Redis is down somewhere later.
    // This does NOT block fresh tokens (see set-cookie logic).
    if (SENTINEL_MS > 0) {
      const isProd = process.env.NODE_ENV === 'production';
      res.cookie(SENTINEL_COOKIE_NAME, '1', {
        httpOnly: false, // must be readable by client JS (fallback behavior)
        sameSite: 'Lax',
        secure: isProd,
        maxAge: SENTINEL_MS
      });
    }

    // Negotiation: HTML submit -> redirect; XHR -> JSON
    const accept = String(req.headers.accept || '');
    const isXHR = (req.xhr === true) || (String(req.headers['x-requested-with'] || '').toLowerCase() === 'xmlhttprequest');
    const isJSONy = accept.includes('application/json') || accept.includes('text/json');
    res.set('Vary', 'Accept, X-Requested-With');

    if (!isXHR && !isJSONy && accept.includes('text/html')) {
      return res.redirect(303, '/?logged_out=1');
    }
    return res.status(200).json({ ok: true });
  } catch (error) {
    logger.error({ event: 'auth.clear_cookie.exception', error: error.message, requestId: req.requestId }, 'Clear-cookie route exception');

    const accept = String(req.headers.accept || '');
    const wantsHTML = accept.includes('text/html') && !accept.includes('application/json');
    if (wantsHTML) {
      return res.redirect(303, '/?logged_out=0');
    }
    return res.status(500).json({ ok: false, error: 'Failed to clear cookie' });
  }
});

module.exports = router;