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

// I am loading `express` into `express` so this file can reuse that dependency below.
const express = require('express');
// I am saving `router` here so the nearby steps can reuse the same value without rebuilding it each time.
const router = express.Router();

// I am loading `../middleware/auth/supabaseJwt` into `verifyToken` so this file can reuse that dependency below.
const { verifyToken } = require('../middleware/auth/supabaseJwt');
// I am loading `../lib/audit` into `audit` so this file can reuse that dependency below.
const { audit } = require('../lib/audit');
// I am saving this value here so the nearby steps can reuse the same value without rebuilding it each time.
const {
  // I am keeping this line here because the surrounding authCookie.js workflow expects this value or operation before it continues.
  checkAccountLockout,
  // I am keeping this line here because the surrounding authCookie.js workflow expects this value or operation before it continues.
  recordFailedAttempt,
  // I am keeping this line here because the surrounding authCookie.js workflow expects this value or operation before it continues.
  clearFailedAttempts
// I am keeping this line here because the surrounding authCookie.js workflow expects this value or operation before it continues.
} = require('../middleware/lockout');
// I am loading `../utils/logger` into `logger` so this file can reuse that dependency below.
const logger = require('../utils/logger');
// I am loading `../config` into `config` so this file can reuse that dependency below.
const { config } = require('../config');
// I am loading `../lib/authCookie` into `setAuthCookie` so this file can reuse that dependency below.
const { setAuthCookie, clearAuthCookie, AUTH_COOKIE_NAME } = require('../lib/authCookie');
// I am loading `../lib/logoutWatermark` into `getLastLogoutAt` so this file can reuse that dependency below.
const { getLastLogoutAt, setLastLogoutNow } = require('../lib/logoutWatermark');
// I am loading `../lib/turnstile` into `verifyTurnstileRequest` so this file can reuse that dependency below.
const { verifyTurnstileRequest } = require('../lib/turnstile');

// =======================
// Configuration
// =======================
const COOKIE_NAME = AUTH_COOKIE_NAME; // canonical name for this process
const COOKIE_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days
// I am saving `LEGACY_DOMAIN` here so the nearby steps can reuse the same value without rebuilding it each time.
const LEGACY_DOMAIN = config.branding?.legacyCookieDomain || null;

// Sentinel (fallback only). If 0 => disabled.
const SENTINEL_COOKIE_NAME = 'auth_logout';
// I am saving `SENTINEL_MS` here so the nearby steps can reuse the same value without rebuilding it each time.
const SENTINEL_MS = Number(config.auth?.sentinelMs ?? 0);
// I am saving `FRESH_LOGIN_GRACE_SEC` here so the nearby steps can reuse the same value without rebuilding it each time.
const FRESH_LOGIN_GRACE_SEC = Number(config.auth?.freshLoginGraceSec ?? 20);

// I am saving `ENFORCE_SET_COOKIE_LOCKOUT` here so the nearby steps can reuse the same value without rebuilding it each time.
const ENFORCE_SET_COOKIE_LOCKOUT = !!config.auth?.setCookie?.enforceLockout;
// I am saving `ENFORCE_SET_COOKIE_TURNSTILE` here so the nearby steps can reuse the same value without rebuilding it each time.
const ENFORCE_SET_COOKIE_TURNSTILE = !!config.auth?.setCookie?.enforceTurnstile;

// =======================
// Helpers
// =======================

function sentinelBlocks(req, tokenIatSec) {
  // The sentinel is only a fallback when the server-side logout watermark is unavailable.
  // A freshly issued token must still permit an intentional login after logout.
  try {
    // I am saving `sentinelActive` here so the nearby steps can reuse the same value without rebuilding it each time.
    const sentinelActive =
      // I am keeping this line here because the surrounding authCookie.js workflow expects this value or operation before it continues.
      req.cookies && String(req.cookies[SENTINEL_COOKIE_NAME] || '') === '1';
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!sentinelActive) return false;

    // Allow *fresh* tokens to pass (interactive login just happened)
    const nowSec = Math.floor(Date.now() / 1000);
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (tokenIatSec && nowSec - tokenIatSec <= FRESH_LOGIN_GRACE_SEC) {
      // This return sends the completed value or response back to the code that called this function.
      return false;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // Otherwise treat as stale background re-hydration while sentinel is active.
    return true;
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch {
    // This return sends the completed value or response back to the code that called this function.
    return false;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `shouldUseSecureCookies` as a named helper so the surrounding workflow can call this step when it needs it.
function shouldUseSecureCookies(req) {
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (typeof config.auth?.cookieSecure === 'boolean') {
    // This return sends the completed value or response back to the code that called this function.
    return !!config.auth.cookieSecure;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
  // I am saving `xfProto` here so the nearby steps can reuse the same value without rebuilding it each time.
  const xfProto = String(req.headers['x-forwarded-proto'] || '');
  // This return sends the completed value or response back to the code that called this function.
  return (config.server?.nodeEnv === 'production') ||
         // I am keeping this line here because the surrounding authCookie.js workflow expects this value or operation before it continues.
         req.secure === true ||
         // I am calling this helper here so the current workflow performs this step before it moves on.
         xfProto.toLowerCase().startsWith('https');
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
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
  // The browser cannot choose cookie attributes directly. This endpoint verifies the JWT
  // and logout state before wrapping that token in the application's HttpOnly cookie.
  res.vary('Origin'); res.vary('Cookie'); res.vary('Authorization'); res.vary('Accept');
  // I am building or sending the Express response here with the status, data, or page already chosen by this route.
  res.set('Cache-Control', 'no-store');

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (SENTINEL_MS > 0) {
    // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
    try {
      // I am saving `sentinelActive` here so the nearby steps can reuse the same value without rebuilding it each time.
      const sentinelActive = req.cookies && String(req.cookies[SENTINEL_COOKIE_NAME] || '') === '1';
      // I am building or sending the Express response here with the status, data, or page already chosen by this route.
      res.set('X-Auth-Sentinel', sentinelActive ? 'active' : 'inactive');
    // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
    } catch (_) {}
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // Fast-path: already has authenticated session and canonical cookie -> no-op
    try {
      // I am saving `hasCanonicalCookie` here so the nearby steps can reuse the same value without rebuilding it each time.
      const hasCanonicalCookie = !!(req.cookies && req.cookies[COOKIE_NAME]);
      // I am saving `hasUser` here so the nearby steps can reuse the same value without rebuilding it each time.
      const hasUser = !!req.user;
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (hasUser && hasCanonicalCookie) {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        logger.info(
          // I am keeping this line here because the surrounding authCookie.js workflow expects this value or operation before it continues.
          { event: 'auth.set_cookie.skip', reason: 'already_authenticated', requestId: req.requestId },
          // I am listing this entry here because the surrounding collection processes each allowed value in order.
          'Set-cookie skipped: request already has authenticated session'
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        );
        // This return sends the completed value or response back to the code that called this function.
        return res.status(200).json({ ok: true, alreadyAuthenticated: true });
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
    } catch (_) {
      // fall through
    }

    // Optional Turnstile gating (env-controlled)
    if (ENFORCE_SET_COOKIE_TURNSTILE && config.turnstile?.enabled) {
      // I am saving `turnstileCheck` here so the nearby steps can reuse the same value without rebuilding it each time.
      const turnstileCheck = await verifyTurnstileRequest(req, {
        // I am keeping the `intent` field in this object so the receiving code can read that value by its expected name.
        intent: req.body?.turnstileIntent || 'interactive-login'
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      });

      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (!turnstileCheck.ok) {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        logger.warn(
          // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
          {
            // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
            event: 'auth.turnstile.denied',
            // I am keeping the `requestId` field in this object so the receiving code can read that value by its expected name.
            requestId: req.requestId,
            // I am keeping the `code` field in this object so the receiving code can read that value by its expected name.
            code: turnstileCheck.code,
            // I am keeping the `errors` field in this object so the receiving code can read that value by its expected name.
            errors: turnstileCheck.errors,
            // I am keeping the `intent` field in this object so the receiving code can read that value by its expected name.
            intent: req.body?.turnstileIntent || null
          // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
          },
          // I am listing this entry here because the surrounding collection processes each allowed value in order.
          'Turnstile verification failed for set-cookie flow'
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        );
        // This return sends the completed value or response back to the code that called this function.
        return res.status(400).json({ ok: false, error: 'Verification failed. Please try again.' });
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // Extract Bearer token
    const auth = req.get('authorization') || '';
    // I am saving `token` here so the nearby steps can reuse the same value without rebuilding it each time.
    const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : null;
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!token) {
      // This return sends the completed value or response back to the code that called this function.
      return res.status(400).json({ ok: false, error: 'Missing bearer token in Authorization header' });
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // Verify token (signature, issuer, audience, exp, etc.)
    let payload;
    // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
    try {
      // I am waiting for this asynchronous step here so the next line does not use its result before it is ready.
      payload = await verifyToken(token);
    // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
    } catch (verifyError) {
      // Only record a failed attempt if we have a real identity hint.
      // Never use an 'ip-only' bucket for this route.
      const ip = req.clientIp || req.ip || 'unknown';
      // I am saving `emailHint` here so the nearby steps can reuse the same value without rebuilding it each time.
      const emailHint = (req.body?.email || '').toLowerCase().trim();

      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (ENFORCE_SET_COOKIE_LOCKOUT && emailHint) {
        // I am waiting for this asynchronous step here so the next line does not use its result before it is ready.
        await recordFailedAttempt(emailHint, ip);
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }

      // I am calling this helper here so the current workflow performs this step before it moves on.
      logger.warn(
        // I am keeping this line here because the surrounding authCookie.js workflow expects this value or operation before it continues.
        { event: 'auth.set_cookie.rejected', code: verifyError?.code || 'verify_failed', requestId: req.requestId },
        // I am listing this entry here because the surrounding collection processes each allowed value in order.
        'Set-cookie token verification failed'
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      );
      // I am calling this helper here so the current workflow performs this step before it moves on.
      audit('auth.set_cookie.fail', { reason: verifyError?.code || 'verify_failed' }, req);
      // This return sends the completed value or response back to the code that called this function.
      return res.status(401).json({ ok: false, error: 'Invalid token' });
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // I am saving `uid` here so the nearby steps can reuse the same value without rebuilding it each time.
    const uid = payload.sub;
    // I am saving `tokenIatSec` here so the nearby steps can reuse the same value without rebuilding it each time.
    const tokenIatSec = Number(payload.iat || 0);
    // I am saving `ip` here so the nearby steps can reuse the same value without rebuilding it each time.
    const ip = req.clientIp || req.ip || 'unknown';

    // Identity key for lockout (real user signal)
    const emailFromJwt = (payload.email || '').toLowerCase().trim();
    // I am saving `identityKey` here so the nearby steps can reuse the same value without rebuilding it each time.
    const identityKey = emailFromJwt || uid;

    // Optional lockout check (env-controlled)
    if (ENFORCE_SET_COOKIE_LOCKOUT) {
      // I am saving `lock` here so the nearby steps can reuse the same value without rebuilding it each time.
      const lock = await checkAccountLockout(identityKey, ip);
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (lock.locked) {
        // I am building or sending the Express response here with the status, data, or page already chosen by this route.
        res.set('Retry-After', String(lock.remainingTime || 60));
        // This return sends the completed value or response back to the code that called this function.
        return res.status(429).json({ ok: false, error: lock.message });
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // Logout watermark
    const lastLogoutSec = await getLastLogoutAt(uid);
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (config.auth?.debug) {
      // I am building or sending the Express response here with the status, data, or page already chosen by this route.
      res.set('X-Auth-Watermark', String(lastLogoutSec || 0));
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // Reject stale tokens (iat <= watermark)
    if (lastLogoutSec && tokenIatSec && tokenIatSec <= lastLogoutSec) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      logger.info(
        // I am keeping this line here because the surrounding authCookie.js workflow expects this value or operation before it continues.
        { event: 'auth.set_cookie.denied_stale_token', uid, tokenIatSec, lastLogoutSec, requestId: req.requestId },
        // I am listing this entry here because the surrounding collection processes each allowed value in order.
        'Re-auth blocked: token predates last logout'
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      );
      // I am calling this helper here so the current workflow performs this step before it moves on.
      audit('auth.set_cookie.stale', { uid }, req);
      // This return sends the completed value or response back to the code that called this function.
      return res.status(401).json({ ok: false, error: 'Stale token (logged out)' });
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // Sentinel fallback only when watermark missing
    if (!lastLogoutSec && sentinelBlocks(req, tokenIatSec)) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      logger.info(
        // I am keeping this line here because the surrounding authCookie.js workflow expects this value or operation before it continues.
        { event: 'auth.set_cookie.hydrate_denied_by_sentinel', requestId: req.requestId },
        // I am listing this entry here because the surrounding collection processes each allowed value in order.
        'Hydration blocked by sentinel fallback'
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      );
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (SENTINEL_MS > 0) res.set('X-Auth-Sentinel', 'active');
      // This return sends the completed value or response back to the code that called this function.
      return res.status(204).end();
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // Success: clear failures (env-controlled)
    if (ENFORCE_SET_COOKIE_LOCKOUT) {
      // I am waiting for this asynchronous step here so the next line does not use its result before it is ready.
      await clearFailedAttempts(identityKey, ip);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // Optional: clear legacy domain-scoped cookies before setting the new one
    try {
      // I am saving `hostForDomain` here so the nearby steps can reuse the same value without rebuilding it each time.
      const hostForDomain = (req.hostname || (req.headers.host || '')).split(':')[0];
      // I am saving `parts` here so the nearby steps can reuse the same value without rebuilding it each time.
      const parts = (hostForDomain || '').split('.').filter(Boolean);
      // I am saving `baseFromHost` here so the nearby steps can reuse the same value without rebuilding it each time.
      const baseFromHost = parts.length >= 2 ? parts.slice(-2).join('.') : null;
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (baseFromHost) {
        // I am defining this small callback here so the surrounding API can run it with the value it supplies.
        ['sb_session', 'sb-access-token'].forEach((n) => {
          // I am building or sending the Express response here with the status, data, or page already chosen by this route.
          res.clearCookie(n, { path: '/', domain: '.' + baseFromHost });
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        });
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
    } catch (_) {}

    // Set canonical cookie
    setAuthCookie(res, req, token, COOKIE_TTL_MS);

    // Rotate CSRF state at the authentication boundary so a pre-login token is not carried
    // into the newly authenticated session.
    try {
      // I am saving `name` here so the nearby steps can reuse the same value without rebuilding it each time.
      const name = config.csrf.cookieName;
      // I am loading `crypto` into `fresh` so this file can reuse that dependency below.
      const fresh = require('crypto').randomBytes(32).toString('base64url');
      // I am building or sending the Express response here with the status, data, or page already chosen by this route.
      res.cookie(name, fresh, {
        // I am keeping the `path` field in this object so the receiving code can read that value by its expected name.
        path: '/',
        // I am keeping the `sameSite` field in this object so the receiving code can read that value by its expected name.
        sameSite: 'Strict',
        // I am keeping the `secure` field in this object so the receiving code can read that value by its expected name.
        secure: shouldUseSecureCookies(req),
        // I am keeping the `httpOnly` field in this object so the receiving code can read that value by its expected name.
        httpOnly: false,
        // I am keeping the `maxAge` field in this object so the receiving code can read that value by its expected name.
        maxAge: COOKIE_TTL_MS
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      });
    // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
    } catch (_) {}

    // Clear legacy cookie names (but don’t clear the one we just set)
    const legacyNames = ['sb-access-token', 'sb_session'].filter((n) => n !== COOKIE_NAME);
    // I am defining this small callback here so the surrounding API can run it with the value it supplies.
    legacyNames.forEach((n) => {
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (LEGACY_DOMAIN) res.clearCookie(n, { path: '/', domain: LEGACY_DOMAIN });
      // I am building or sending the Express response here with the status, data, or page already chosen by this route.
      res.clearCookie(n, { path: '/' });
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am calling this helper here so the current workflow performs this step before it moves on.
    audit('auth.set_cookie.ok', { uid, ttl_ms: COOKIE_TTL_MS }, req);
    // This return sends the completed value or response back to the code that called this function.
    return res.json({ ok: true, userId: uid });
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (error) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.error(
      // I am keeping this line here because the surrounding authCookie.js workflow expects this value or operation before it continues.
      { event: 'auth.set_cookie.exception', error: error.message, requestId: req.requestId },
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      'Set-cookie route exception'
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    );
    // This return sends the completed value or response back to the code that called this function.
    return res.status(500).json({ ok: false, error: 'Failed to set cookie' });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
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
  // Read the verified user before clearing cookies so logout can record a watermark. That
  // watermark prevents an older Supabase token from silently recreating the session.
  try {
    // I am building or sending the Express response here with the status, data, or page already chosen by this route.
    res.set('Cache-Control', 'no-store');
    // I am calling this helper here so the current workflow performs this step before it moves on.
    res.vary('Origin'); res.vary('Cookie'); res.vary('Accept'); res.vary('X-Requested-With');

    // Capture uid from existing auth cookie BEFORE clearing it
    let uidFromCookie = null;
    // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
    try {
      // I am saving `raw` here so the nearby steps can reuse the same value without rebuilding it each time.
      const raw = req.cookies?.[AUTH_COOKIE_NAME] || null;
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (raw) {
        // I am saving `payload` here so the nearby steps can reuse the same value without rebuilding it each time.
        const payload = await verifyToken(raw).catch(() => null);
        // I am keeping this line here because the surrounding authCookie.js workflow expects this value or operation before it continues.
        uidFromCookie = payload?.sub || null;
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
    } catch {
      // ignore
    }

    // Clear cookies (new + legacy) - use clearAll if ?all=1 query param
    const clearAll = req.query?.all === '1' || req.query?.all === 'true';
    // I am updating or clearing this saved state here so the interface reflects the result of the action above.
    clearAuthCookie(res, req, clearAll);

    // Write logout watermark
    if (uidFromCookie) {
      // I am waiting for this asynchronous step here so the next line does not use its result before it is ready.
      await setLastLogoutNow(uidFromCookie);
      // I am calling this helper here so the current workflow performs this step before it moves on.
      audit('auth.clear_cookie.ok', { uid: uidFromCookie }, req);
    // This alternative runs only when the condition above did not use its first path.
    } else {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      audit('auth.clear_cookie.ok', {}, req);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // Optional sentinel fallback
    if (SENTINEL_MS > 0) {
      // I am saving `sentinelActive` here so the nearby steps can reuse the same value without rebuilding it each time.
      const sentinelActive = (req.cookies && String(req.cookies[SENTINEL_COOKIE_NAME] || '') === '1');
      // I am building or sending the Express response here with the status, data, or page already chosen by this route.
      res.set('X-Auth-Sentinel', sentinelActive ? 'active' : 'inactive');

      // I am building or sending the Express response here with the status, data, or page already chosen by this route.
      res.cookie(SENTINEL_COOKIE_NAME, '1', {
        // I am keeping the `httpOnly` field in this object so the receiving code can read that value by its expected name.
        httpOnly: false,
        // I am keeping the `sameSite` field in this object so the receiving code can read that value by its expected name.
        sameSite: 'lax',
        // I am keeping the `secure` field in this object so the receiving code can read that value by its expected name.
        secure: shouldUseSecureCookies(req),
        // I am keeping the `path` field in this object so the receiving code can read that value by its expected name.
        path: '/',
        // I am keeping the `maxAge` field in this object so the receiving code can read that value by its expected name.
        maxAge: SENTINEL_MS
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      });
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // Negotiation: HTML submit -> redirect; XHR -> JSON
    const accept = String(req.headers.accept || '');
    // I am saving `isXHR` here so the nearby steps can reuse the same value without rebuilding it each time.
    const isXHR = (req.xhr === true) ||
      // I am keeping this line here because the surrounding authCookie.js workflow expects this value or operation before it continues.
      (String(req.headers['x-requested-with'] || '').toLowerCase() === 'xmlhttprequest');
    // I am saving `isJSONy` here so the nearby steps can reuse the same value without rebuilding it each time.
    const isJSONy = accept.includes('application/json') || accept.includes('text/json');

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!isXHR && !isJSONy && accept.includes('text/html')) {
      // This return sends the completed value or response back to the code that called this function.
      return res.redirect(303, '/?logged_out=1');
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    // This return sends the completed value or response back to the code that called this function.
    return res.status(200).json({ ok: true });
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (error) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.error(
      // I am keeping this line here because the surrounding authCookie.js workflow expects this value or operation before it continues.
      { event: 'auth.clear_cookie.exception', error: error.message, requestId: req.requestId },
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      'Clear-cookie route exception'
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    );

    // I am saving `accept` here so the nearby steps can reuse the same value without rebuilding it each time.
    const accept = String(req.headers.accept || '');
    // I am saving `wantsHTML` here so the nearby steps can reuse the same value without rebuilding it each time.
    const wantsHTML = accept.includes('text/html') && !accept.includes('application/json');
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (wantsHTML) {
      // This return sends the completed value or response back to the code that called this function.
      return res.redirect(303, '/?logged_out=0');
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    // This return sends the completed value or response back to the code that called this function.
    return res.status(500).json({ ok: false, error: 'Failed to clear cookie' });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
});

// I am exporting this value here so another module can deliberately reuse the completed piece from authCookie.js.
module.exports = router;