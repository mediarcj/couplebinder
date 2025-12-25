// File: server/routes/authCookie.js
// Description: Set and clear the auth cookie using __Host- rules (big-tech style watermark)
// Notes:
// - Verifies the token with JWKS (verifyToken)
// - Blocks only *stale* tokens (iat <= last_logout_at[uid])
// - Allows instant re-login with a *fresh* token (no cooldown)
// - Lockout + Turnstile are controlled by config (env-driven)
// - Cookie attributes are enforced by the centralized authCookie helper
// - Fallback sentinel is only used when watermark is unavailable (e.g., Redis down)

'use strict';

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
const COOKIE_NAME = AUTH_COOKIE_NAME; // canonical name for this process
const COOKIE_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days
const LEGACY_DOMAIN = config.branding?.legacyCookieDomain || null;

// Sentinel (fallback only). If 0 => disabled.
const SENTINEL_COOKIE_NAME = 'auth_logout';
const SENTINEL_MS = Number(config.auth?.sentinelMs ?? 0);
const FRESH_LOGIN_GRACE_SEC = Number(config.auth?.freshLoginGraceSec ?? 20);

const ENFORCE_SET_COOKIE_LOCKOUT = !!config.auth?.setCookie?.enforceLockout;
const ENFORCE_SET_COOKIE_TURNSTILE = !!config.auth?.setCookie?.enforceTurnstile;

// =======================
// Helpers
// =======================

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

function shouldUseSecureCookies(req) {
  if (typeof config.auth?.cookieSecure === 'boolean') {
    return !!config.auth.cookieSecure;
  }
  const xfProto = String(req.headers['x-forwarded-proto'] || '');
  return (config.server?.nodeEnv === 'production') ||
         req.secure === true ||
         xfProto.toLowerCase().startsWith('https');
}

// =======================
// Routes
// =======================

/**
 * POST /auth/set-cookie
 *
 * Flow:
 * 1) Fast-path no-op when already authenticated (avoids noisy re-hydration calls)
 * 2) (Optional) Turnstile check (env-controlled)
 * 3) Verify Bearer JWT (JWKS)
 * 4) (Optional) lockout check (env-controlled)
 * 5) Reject stale tokens using logout watermark
 * 6) Sentinel fallback only when watermark missing
 * 7) Set canonical cookie (authCookie helper)
 */
router.post('/set-cookie', async (req, res) => {
  res.vary('Origin'); res.vary('Cookie'); res.vary('Authorization'); res.vary('Accept');
  res.set('Cache-Control', 'no-store');

  if (SENTINEL_MS > 0) {
    try {
      const sentinelActive = req.cookies && String(req.cookies[SENTINEL_COOKIE_NAME] || '') === '1';
      res.set('X-Auth-Sentinel', sentinelActive ? 'active' : 'inactive');
    } catch (_) {}
  }

  try {
    // Fast-path: already has authenticated session and canonical cookie -> no-op
    try {
      const hasCanonicalCookie = !!(req.cookies && req.cookies[COOKIE_NAME]);
      const hasUser = !!req.user;
      if (hasUser && hasCanonicalCookie) {
        logger.info(
          { event: 'auth.set_cookie.skip', reason: 'already_authenticated', requestId: req.requestId },
          'Set-cookie skipped: request already has authenticated session'
        );
        return res.status(200).json({ ok: true, alreadyAuthenticated: true });
      }
    } catch (_) {
      // fall through
    }

    // Optional Turnstile gating (env-controlled)
    if (ENFORCE_SET_COOKIE_TURNSTILE && config.turnstile?.enabled) {
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
          'Turnstile verification failed for set-cookie flow'
        );
        return res.status(400).json({ ok: false, error: 'Verification failed. Please try again.' });
      }
    }

    // Extract Bearer token
    const auth = req.get('authorization') || '';
    const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : null;
    if (!token) {
      return res.status(400).json({ ok: false, error: 'Missing bearer token in Authorization header' });
    }

    // Verify token (signature, issuer, audience, exp, etc.)
    let payload;
    try {
      payload = await verifyToken(token);
    } catch (verifyError) {
      // Only record a failed attempt if we have a real identity hint.
      // Never use an 'ip-only' bucket for this route.
      const ip = req.clientIp || req.ip || 'unknown';
      const emailHint = (req.body?.email || '').toLowerCase().trim();

      if (ENFORCE_SET_COOKIE_LOCKOUT && emailHint) {
        await recordFailedAttempt(emailHint, ip);
      }

      logger.warn(
        { event: 'auth.set_cookie.rejected', code: verifyError?.code || 'verify_failed', requestId: req.requestId },
        'Set-cookie token verification failed'
      );
      audit('auth.set_cookie.fail', { reason: verifyError?.code || 'verify_failed' }, req);
      return res.status(401).json({ ok: false, error: 'Invalid token' });
    }

    const uid = payload.sub;
    const tokenIatSec = Number(payload.iat || 0);
    const ip = req.clientIp || req.ip || 'unknown';

    // Identity key for lockout (real user signal)
    const emailFromJwt = (payload.email || '').toLowerCase().trim();
    const identityKey = emailFromJwt || uid;

    // Optional lockout check (env-controlled)
    if (ENFORCE_SET_COOKIE_LOCKOUT) {
      const lock = await checkAccountLockout(identityKey, ip);
      if (lock.locked) {
        res.set('Retry-After', String(lock.remainingTime || 60));
        return res.status(429).json({ ok: false, error: lock.message });
      }
    }

    // Logout watermark
    const lastLogoutSec = await getLastLogoutAt(uid);
    if (config.auth?.debug) {
      res.set('X-Auth-Watermark', String(lastLogoutSec || 0));
    }

    // Reject stale tokens (iat <= watermark)
    if (lastLogoutSec && tokenIatSec && tokenIatSec <= lastLogoutSec) {
      logger.info(
        { event: 'auth.set_cookie.denied_stale_token', uid, tokenIatSec, lastLogoutSec, requestId: req.requestId },
        'Re-auth blocked: token predates last logout'
      );
      audit('auth.set_cookie.stale', { uid }, req);
      return res.status(401).json({ ok: false, error: 'Stale token (logged out)' });
    }

    // Sentinel fallback only when watermark missing
    if (!lastLogoutSec && sentinelBlocks(req, tokenIatSec)) {
      logger.info(
        { event: 'auth.set_cookie.hydrate_denied_by_sentinel', requestId: req.requestId },
        'Hydration blocked by sentinel fallback'
      );
      if (SENTINEL_MS > 0) res.set('X-Auth-Sentinel', 'active');
      return res.status(204).end();
    }

    // Success: clear failures (env-controlled)
    if (ENFORCE_SET_COOKIE_LOCKOUT) {
      await clearFailedAttempts(identityKey, ip);
    }

    // Optional: clear legacy domain-scoped cookies before setting the new one
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

    // Set canonical cookie
    setAuthCookie(res, req, token, COOKIE_TTL_MS);

    // Rotate CSRF token so the new session starts clean
    try {
      const name = config.csrf.cookieName;
      const fresh = require('crypto').randomBytes(32).toString('base64url');
      res.cookie(name, fresh, {
        path: '/',
        sameSite: 'Strict',
        secure: shouldUseSecureCookies(req),
        httpOnly: false,
        maxAge: COOKIE_TTL_MS
      });
    } catch (_) {}

    // Clear legacy cookie names (but don’t clear the one we just set)
    const legacyNames = ['sb-access-token', 'sb_session'].filter((n) => n !== COOKIE_NAME);
    legacyNames.forEach((n) => {
      if (LEGACY_DOMAIN) res.clearCookie(n, { path: '/', domain: LEGACY_DOMAIN });
      res.clearCookie(n, { path: '/' });
    });

    audit('auth.set_cookie.ok', { uid, ttl_ms: COOKIE_TTL_MS }, req);
    return res.json({ ok: true, userId: uid });
  } catch (error) {
    logger.error(
      { event: 'auth.set_cookie.exception', error: error.message, requestId: req.requestId },
      'Set-cookie route exception'
    );
    return res.status(500).json({ ok: false, error: 'Failed to set cookie' });
  }
});

/**
 * POST /auth/clear-cookie
 *
 * - Clears current and legacy cookies (complete logout).
 * - Sets per-user logout watermark in Redis (last_logout_at = now).
 * - Optionally sets a small client sentinel cookie as a fallback.
 * - Content negotiation: HTML forms -> redirect 303; XHR/fetch -> JSON.
 */
router.post('/clear-cookie', async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    res.vary('Origin'); res.vary('Cookie'); res.vary('Accept'); res.vary('X-Requested-With');

    // Capture uid from existing auth cookie BEFORE clearing it
    let uidFromCookie = null;
    try {
      const raw = req.cookies?.[AUTH_COOKIE_NAME] || null;
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

    // Write logout watermark
    if (uidFromCookie) {
      await setLastLogoutNow(uidFromCookie);
      audit('auth.clear_cookie.ok', { uid: uidFromCookie }, req);
    } else {
      audit('auth.clear_cookie.ok', {}, req);
    }

    // Optional sentinel fallback
    if (SENTINEL_MS > 0) {
      const sentinelActive = (req.cookies && String(req.cookies[SENTINEL_COOKIE_NAME] || '') === '1');
      res.set('X-Auth-Sentinel', sentinelActive ? 'active' : 'inactive');

      res.cookie(SENTINEL_COOKIE_NAME, '1', {
        httpOnly: false,
        sameSite: 'lax',
        secure: shouldUseSecureCookies(req),
        path: '/',
        maxAge: SENTINEL_MS
      });
    }

    // Negotiation: HTML submit -> redirect; XHR -> JSON
    const accept = String(req.headers.accept || '');
    const isXHR = (req.xhr === true) ||
      (String(req.headers['x-requested-with'] || '').toLowerCase() === 'xmlhttprequest');
    const isJSONy = accept.includes('application/json') || accept.includes('text/json');

    if (!isXHR && !isJSONy && accept.includes('text/html')) {
      return res.redirect(303, '/?logged_out=1');
    }
    return res.status(200).json({ ok: true });
  } catch (error) {
    logger.error(
      { event: 'auth.clear_cookie.exception', error: error.message, requestId: req.requestId },
      'Clear-cookie route exception'
    );

    const accept = String(req.headers.accept || '');
    const wantsHTML = accept.includes('text/html') && !accept.includes('application/json');
    if (wantsHTML) {
      return res.redirect(303, '/?logged_out=0');
    }
    return res.status(500).json({ ok: false, error: 'Failed to clear cookie' });
  }
});

module.exports = router;