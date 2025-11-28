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
const { config } = require('../config');
const { setAuthCookie, clearAuthCookie, AUTH_COOKIE_NAME } = require('../lib/authCookie');
const { getLastLogoutAt, setLastLogoutNow } = require('../lib/logoutWatermark');
const { verifyTurnstileRequest } = require('../lib/turnstile');

// =======================
// Configuration
// =======================
const COOKIE_NAME = AUTH_COOKIE_NAME; // Use centralized name
const COOKIE_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days
const LEGACY_DOMAIN = config.branding?.legacyCookieDomain || null; // used only to clear old cookies

// Sentinel (fallback only). If 0 or falsy => disabled.
// Priority: config.auth.sentinelMs (which reads from ENV with default 0)
const SENTINEL_COOKIE_NAME = 'auth_logout';
const SENTINEL_MS = Number(config.auth?.sentinelMs ?? 0);

// Fresh-token grace when watermark is unavailable. If unset, default 20s.
// Priority: config.auth.freshLoginGraceSec (which reads from ENV with default 20)
const FRESH_LOGIN_GRACE_SEC = Number(config.auth?.freshLoginGraceSec ?? 20);

// =======================
// Helpers
// =======================

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

// Decide if cookies should be marked Secure for this request
function shouldUseSecureCookies(req) {
  // Explicit override wins if set
  if (typeof config.auth?.cookieSecure === 'boolean') {
    return !!config.auth.cookieSecure;
  }
  const xfProto = String(req.headers['x-forwarded-proto'] || '');
  return (config.server?.nodeEnv === 'production') ||
         req.secure === true ||
         xfProto.toLowerCase().startsWith('https');
}

// Cookie helpers now use centralized module (setAuthCookie, clearAuthCookie)

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
  res.vary('Origin'); res.vary('Cookie'); res.vary('Authorization'); res.vary('Accept');
  res.set('Cache-Control', 'no-store');
  // For debugging in DevTools; only emit when the sentinel feature is enabled
  if (SENTINEL_MS > 0) {
    try {
      const sentinelActive = req.cookies && String(req.cookies[SENTINEL_COOKIE_NAME] || '') === '1';
      res.set('X-Auth-Sentinel', sentinelActive ? 'active' : 'inactive');
    } catch (_) {}
  }

  try {
    // Fast-path: if this request already has a valid authenticated user and the
    // canonical auth cookie, treat it as a no-op and skip Turnstile  heavy checks.
    // This avoids noisy warnings when background/client code "re-hydrates" auth
    // after the user is already logged in.
    try {
      const hasCanonicalCookie = !!(req.cookies && req.cookies[COOKIE_NAME]);
      const hasUser = !!req.user;
      if (hasUser && hasCanonicalCookie) {
        logger.info(
          {
            event: 'auth.set_cookie.skip',
            reason: 'already_authenticated',
            requestId: req.requestId
          },
          'Set-cookie skipped: request already has authenticated session'
        );
        return res.status(200).json({ ok: true, alreadyAuthenticated: true });
      }
    } catch (_) {
      // If inspection fails for any reason, fall through to normal flow.
    }

    const turnstileCheck = await verifyTurnstileRequest(req, {
      intent: req.body?.turnstileIntent || 'interactive-login'
    });
    
    if (!turnstileCheck.ok) {
      logger.warn(
        {
          event: 'auth.turnstile.denied',
          requestId: req.requestId,
          code: turnstileCheck.code,
          errors: turnstileCheck.errors,
          intent: req.body?.turnstileIntent || null
        },
        'Turnstile verification failed for login flow'
      );
      return res.status(400).json({ ok: false, error: 'Verification failed. Please try again.' });
    }

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
    if (config.auth?.debug) {
      res.set('X-Auth-Watermark', String(lastLogoutSec || 0));
    }

    // Primary rule: reject stale tokens (token issued at or before last logout)
    if (lastLogoutSec && tokenIatSec && tokenIatSec <= lastLogoutSec) {
      logger.info(
        { event: 'auth.set_cookie.denied_stale_token', uid, tokenIatSec, lastLogoutSec, requestId: req.requestId },
        'Re-auth blocked: token predates last logout'
      );
      audit('auth.set_cookie.stale', { uid }, req);
      // DO NOT record as failed attempt: stale tokens are expected after logout/password change
      // They are not authentication failures, just expired sessions
      return res.status(401).json({ ok: false, error: 'Stale token (logged out)' });
    }

    // Fallback: watermark missing (Redis unavailable or no key) -> apply small sentinel rule
    if (!lastLogoutSec && sentinelBlocks(req, tokenIatSec)) {
      // Deny only silent/background hydration while sentinel active
      logger.info(
        { event: 'auth.set_cookie.hydrate_denied_by_sentinel', requestId: req.requestId },
        'Hydration blocked by sentinel fallback'
      );
      if (SENTINEL_MS > 0) res.set('X-Auth-Sentinel', 'active');
      // 204 so client backoff can retry quietly; interactive flows should not hit this due to fresh iat
      return res.status(204).end();
    }

    // Success path: token is valid and not stale -> clear failures, set cookie
    await clearFailedAttempts(emailFromBody || 'ip-only', ip);

    // Optional: aggressively clear legacy domain-scoped Supabase cookies before setting the new one
    try {
      const hostForDomain = (req.hostname || (req.headers.host || '')).split(':')[0];
      const parts = (hostForDomain || '').split('.').filter(Boolean);
      const baseFromHost = parts.length >= 2 ? parts.slice(-2).join('.') : null;
      if (baseFromHost) {
        ['sb_session', 'sb-access-token'].forEach((n) => {
          res.clearCookie(n, { path: '/', domain: '.' + baseFromHost });
        });
      }
    } catch (_) {}

    // Use centralized cookie helper (ensures consistent attributes)
    setAuthCookie(res, req, token, COOKIE_TTL_MS);

    // Optional: rotate a fresh CSRF token so the new session starts clean
    try {
      const name = config.csrf.cookieName;
      const fresh = require('crypto').randomBytes(32).toString('base64url');
      const secureFlag = shouldUseSecureCookies(req);
      res.cookie(name, fresh, {
        path: '/',
        sameSite: 'Strict',
        secure: secureFlag,
        httpOnly: false,
        maxAge: 7 * 24 * 60 * 60 * 1000
      });
    } catch (_) {}
    // Clean up legacy cookie names to prevent conflicts
    // BUT: Don't clear the cookie we just set (COOKIE_NAME)
    const legacyNames = ['sb-access-token', 'sb_session'].filter(n => n !== COOKIE_NAME);
    legacyNames.forEach((n) => {
      if (LEGACY_DOMAIN) {
        res.clearCookie(n, { path: '/', domain: LEGACY_DOMAIN });
      }
      res.clearCookie(n, { path: '/' });
    });

    audit('auth.set_cookie.ok', { uid, ttl_ms: COOKIE_TTL_MS }, req);
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
    res.set('Cache-Control', 'no-store');
    res.vary('Origin'); res.vary('Cookie'); res.vary('Accept'); res.vary('X-Requested-With');
    // Try to capture uid from the existing auth cookie BEFORE clearing it
    let uidFromCookie = null;
    try {
      const raw = req.cookies?.[AUTH_COOKIE_NAME] || null; // read the one canonical name
      if (raw) {
        const payload = await verifyToken(raw).catch(() => null);
        uidFromCookie = payload?.sub || null;
      }
    } catch {
      // ignore
    }

    // Clear cookies (new + legacy) - use clearAll if ?all=1 query param
    const clearAll = req.query?.all === '1' || req.query?.all === 'true';
    clearAuthCookie(res, req, clearAll);

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
      const sentinelActive = (req.cookies && String(req.cookies[SENTINEL_COOKIE_NAME] || '') === '1');
      res.set('X-Auth-Sentinel', sentinelActive ? 'active' : 'inactive');

      const secureFlag = shouldUseSecureCookies(req);
      res.cookie(SENTINEL_COOKIE_NAME, '1', {
        httpOnly: false, // must be readable by client JS (fallback behavior)
        sameSite: 'lax',
        secure: secureFlag,
        path: '/',
        maxAge: SENTINEL_MS
      });
    }

    // Negotiation: HTML submit -> redirect; XHR -> JSON
    const accept = String(req.headers.accept || '');
    const isXHR = (req.xhr === true) || (String(req.headers['x-requested-with'] || '').toLowerCase() === 'xmlhttprequest');
    const isJSONy = accept.includes('application/json') || accept.includes('text/json');
    // res.set('Vary', 'Accept, X-Requested-With');
    // Already added above with res.vary(...); don't overwrite the header here.
    // (Keep the earlier: res.vary('Origin'); res.vary('Cookie'); res.vary('Accept'); res.vary('X-Requested-With');)

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