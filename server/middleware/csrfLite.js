/**
 * File: server/middleware/csrfLite.js
 * Description: Smart CSRF protection  enforce for cookie-based mutations, skip for Bearer
 *
 * WHAT:
 * Double-submit cookie: we set a readable CSRF cookie and require clients to echo it
 * in the x-csrf-token header (or form field) for state-changing requests.
 *
 * WHY:
 * Blocks cross-site request forgery. Attackers cannot read your cookies, so they cannot
 * produce a matching token.
 *
 * HOW:
 * - Issues a CSRF cookie on idempotent requests (GET/HEAD/OPTIONS).
 * - Enforces token match on POST/PUT/PATCH/DELETE when cookies are present.
 * - Skips CSRF if Authorization: Bearer is used (pure API clients) or for auth cookie endpoints.
 * - Uses timing-safe compare to prevent subtle timing attacks.
 * - Configurable via environment variables for flexibility.
 */

const crypto = require('crypto');
// I am loading `../utils/logger` into `logger` so this file can reuse that dependency below.
const logger = require('../utils/logger');
// I am loading `../config` into `config` so this file can reuse that dependency below.
const { config } = require('../config');

// ============================================================
// Configuration (from centralized config)
// ============================================================
const CSRF_COOKIE_NAME = config.csrf.cookieName;
// I am saving `CSRF_HEADER_NAME` here so the nearby steps can reuse the same value without rebuilding it each time.
const CSRF_HEADER_NAME = config.csrf.headerName;
const AUTH_COOKIE_DOMAIN = config.auth.cookieDomain; // keep undefined when using __Host- cookies
// I am saving `IS_PROD` here so the nearby steps can reuse the same value without rebuilding it each time.
const IS_PROD = config.server?.nodeEnv === 'production';

// ============================================================
// Helper Functions
// ============================================================
const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

// I am keeping `hasBearerToken` as a named helper so the surrounding workflow can call this step when it needs it.
function hasBearerToken(req) {
  // I am saving `authz` here so the nearby steps can reuse the same value without rebuilding it each time.
  const authz = req.headers.authorization || '';
  // This return sends the completed value or response back to the code that called this function.
  return /^Bearer\s+/i.test(authz);
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `usesCookies` as a named helper so the surrounding workflow can call this step when it needs it.
function usesCookies(req) {
  // This return sends the completed value or response back to the code that called this function.
  return Boolean(req.headers.cookie);
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `getCsrfFromCookie` as a named helper so the surrounding workflow can call this step when it needs it.
function getCsrfFromCookie(req) {
  // Prefer cookie-parser if present
  if (req.cookies && Object.prototype.hasOwnProperty.call(req.cookies, CSRF_COOKIE_NAME)) {
    // I am saving `val` here so the nearby steps can reuse the same value without rebuilding it each time.
    const val = req.cookies[CSRF_COOKIE_NAME];
    // Ensure we return a trimmed string (cookie-parser should handle this, but be defensive)
    return val ? String(val).trim() : null;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
  // Fallback: parse header manually
  const cookie = req.headers.cookie || '';
  // I am saving `escapedName` here so the nearby steps can reuse the same value without rebuilding it each time.
  const escapedName = CSRF_COOKIE_NAME.replace(/[-.$?*|{}()[\]\\/+^]/g, '\\$&');
  // I am saving `m` here so the nearby steps can reuse the same value without rebuilding it each time.
  const m = cookie.match(new RegExp('(?:^|;\\s*)' + escapedName + '=([^;]+)'));
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!m) return null;
  // Decode and trim the cookie value
  const decoded = decodeURIComponent(m[1]);
  // This return sends the completed value or response back to the code that called this function.
  return decoded ? String(decoded).trim() : null;
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `getProvidedToken` as a named helper so the surrounding workflow can call this step when it needs it.
function getProvidedToken(req) {
  // For JSON requests (like PUT /api/profile/me and POST /account/password),
  // the token is sent in the X-CSRF-Token header. For form-encoded requests,
  // it may be in req.body._csrf. We check header first, then body as fallback.
  const name = String(CSRF_HEADER_NAME || '');
  // I am saving `hdr` here so the nearby steps can reuse the same value without rebuilding it each time.
  const hdr =
    // I am keeping this line here because the surrounding csrfLite.js workflow expects this value or operation before it continues.
    req.get?.(name) ||
    // I am keeping this line here because the surrounding csrfLite.js workflow expects this value or operation before it continues.
    req.get?.(name.toLowerCase()) ||
    // I am keeping this line here because the surrounding csrfLite.js workflow expects this value or operation before it continues.
    req.get?.('x-csrf-token') ||
    // I am keeping this line here because the surrounding csrfLite.js workflow expects this value or operation before it continues.
    req.get?.('csrf-token') ||
    // I am keeping this line here because the surrounding csrfLite.js workflow expects this value or operation before it continues.
    req.get?.('x-xsrf-token') ||
    // I am keeping this line here because the surrounding csrfLite.js workflow expects this value or operation before it continues.
    req.headers?.[name] ||
    // I am keeping this line here because the surrounding csrfLite.js workflow expects this value or operation before it continues.
    req.headers?.[name.toLowerCase()];
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (hdr) {
    // I am saving `trimmed` here so the nearby steps can reuse the same value without rebuilding it each time.
    const trimmed = String(hdr).trim();
    // Header found - use it (this is the standard for JSON API requests)
    return trimmed;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
  // Fallback: check body for form-encoded requests
  const b = req.body || {};
  // This return sends the completed value or response back to the code that called this function.
  return b._csrf || b.csrf || b.csrf_token || null;
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * Timing-safe string comparison
 *
 * WHAT:
 * Compares two strings in constant time to prevent timing attacks.
 *
 * WHY:
 * Standard string comparison (===) can leak information about where strings differ
 * via timing. This prevents attackers from guessing tokens character by character.
 *
 * HOW:
 * Uses crypto.timingSafeEqual which compares buffers in constant time regardless
 * of where they differ.
 */
function timingSafeEqual(a, b) {
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  // I am saving `A` here so the nearby steps can reuse the same value without rebuilding it each time.
  const A = Buffer.from(a);
  // I am saving `B` here so the nearby steps can reuse the same value without rebuilding it each time.
  const B = Buffer.from(b);
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (A.length !== B.length) return false;
  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try { return crypto.timingSafeEqual(A, B); } catch { return false; }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `isAuthCookieEndpoint` as a named helper so the surrounding workflow can call this step when it needs it.
function isAuthCookieEndpoint(req) {
  // These endpoints authenticate with Bearer, then set/clear cookies server-side
  return req.path === '/auth/set-cookie' || req.path === '/auth/clear-cookie';
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `isWebhookEndpoint` as a named helper so the surrounding workflow can call this step when it needs it.
function isWebhookEndpoint(req) {
  // Webhook endpoints are CSRF-exempt (they use HMAC verification instead)
  // Stripe webhook is mounted at /api/stripe/webhook before body parsers and CSRF
  return req.path === '/api/stripe/webhook' || req.path.startsWith('/api/stripe/webhook');
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `wantsJson` as a named helper so the surrounding workflow can call this step when it needs it.
function wantsJson(req) {
  // I am saving `acc` here so the nearby steps can reuse the same value without rebuilding it each time.
  const acc = req.get('accept') || '';
  // I am saving `ct` here so the nearby steps can reuse the same value without rebuilding it each time.
  const ct  = req.get('content-type') || '';
  // This return sends the completed value or response back to the code that called this function.
  return req.path.startsWith('/api/') || acc.includes('application/json') || ct.includes('application/json');
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// ============================================================
// Main Middleware
// ============================================================
module.exports = function csrfLite(req, res, next) {
  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // ============================================================
    // 0) OPTIONS preflight: always allow (CORS handles it)
    // ============================================================
    if (req.method === 'OPTIONS') {
      // This return sends the completed value or response back to the code that called this function.
      return next();
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    
    // ============================================================
    // 1) Idempotent requests: just ensure the cookie exists
    // ============================================================
    if (SAFE.has(req.method)) {
      // I am saving `csrfToken` here so the nearby steps can reuse the same value without rebuilding it each time.
      let csrfToken = getCsrfFromCookie(req);
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (!csrfToken) {
        // I am keeping this line here because the surrounding csrfLite.js workflow expects this value or operation before it continues.
        csrfToken = crypto.randomBytes(32).toString('base64url');
        // I am saving `opts` here so the nearby steps can reuse the same value without rebuilding it each time.
        const opts = {
          // I am keeping the `path` field in this object so the receiving code can read that value by its expected name.
          path: '/',
          // I am keeping the `sameSite` field in this object so the receiving code can read that value by its expected name.
          sameSite: 'Strict',
          // I am keeping the `secure` field in this object so the receiving code can read that value by its expected name.
          secure: IS_PROD,
          // I am keeping the `httpOnly` field in this object so the receiving code can read that value by its expected name.
          httpOnly: false,
          // I am keeping the `maxAge` field in this object so the receiving code can read that value by its expected name.
          maxAge: 7 * 24 * 60 * 60 * 1000
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        };
        if (AUTH_COOKIE_DOMAIN) opts.domain = AUTH_COOKIE_DOMAIN; // omit for __Host- style
        // I am building or sending the Express response here with the status, data, or page already chosen by this route.
        res.cookie(CSRF_COOKIE_NAME, csrfToken, opts);
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
      // I am keeping this line here because the surrounding csrfLite.js workflow expects this value or operation before it continues.
      res.locals.csrfToken = csrfToken;
      // This return sends the completed value or response back to the code that called this function.
      return next();
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // ============================================================
    // 2) Non-idempotent: mutation request
    // ============================================================
    // Skip CSRF if:
    //   - Bearer token present (pure API client), or
    //   - This is an auth-cookie endpoint (set/clear happens after JWT verify), or
    //   - This is a webhook endpoint (uses HMAC verification instead)
    if (hasBearerToken(req) || isAuthCookieEndpoint(req) || isWebhookEndpoint(req)) {
      // This return sends the completed value or response back to the code that called this function.
      return next();
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // ============================================================
    // 3) If client sent no cookies, check if this is a public auth endpoint
    // Public auth endpoints (login/register) don't need CSRF if no cookies
    // ============================================================
    if (!usesCookies(req)) {
      // Public auth endpoints are exempt from CSRF when no cookies
      const isPublicAuth = req.path.startsWith('/api/auth/login') || 
                          // I am calling this helper here so the current workflow performs this step before it moves on.
                          req.path.startsWith('/api/auth/register') ||
                          // I am calling this helper here so the current workflow performs this step before it moves on.
                          req.path.startsWith('/auth/login') ||
                          // I am calling this helper here so the current workflow performs this step before it moves on.
                          req.path.startsWith('/auth/register');
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (isPublicAuth) {
        // This return sends the completed value or response back to the code that called this function.
        return next();
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
      // For other unsafe methods without cookies, require CSRF token in header/body
      const headerVal = getProvidedToken(req);
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (!headerVal) {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        logger.warn({
          // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
          event: 'csrf.token_missing_no_cookies',
          // I am keeping the `method` field in this object so the receiving code can read that value by its expected name.
          method: req.method,
          // I am keeping the `path` field in this object so the receiving code can read that value by its expected name.
          path: req.path,
          // I am keeping the `requestId` field in this object so the receiving code can read that value by its expected name.
          requestId: req.requestId
        // I am keeping this line here because the surrounding csrfLite.js workflow expects this value or operation before it continues.
        }, 'CSRF token missing (no cookies, but unsafe method)');
        // This return sends the completed value or response back to the code that called this function.
        return res.status(403).json({ ok: false, error: 'Missing or invalid CSRF token' });
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
      // No ambient cookies → nothing to forge. Header is enough here.
      res.locals.csrfToken = headerVal;
      // This return sends the completed value or response back to the code that called this function.
      return next();
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // ============================================================
    // 4) Enforce double-submit match with timing-safe compare
    // ============================================================
    // For JSON requests (PUT /api/profile/me, POST /account/password):
    // - Token is sent in X-CSRF-Token header
    // - getProvidedToken() reads header first, then falls back to req.body._csrf
    // - Both cookie and header/body token must match (double-submit pattern)
    const cookieVal  = getCsrfFromCookie(req);
    // I am saving `providedVal` here so the nearby steps can reuse the same value without rebuilding it each time.
    const providedVal = getProvidedToken(req);

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!cookieVal || !providedVal) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      logger.warn({
        // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
        event: 'csrf.token_missing',
        // I am keeping the `method` field in this object so the receiving code can read that value by its expected name.
        method: req.method,
        // I am keeping the `path` field in this object so the receiving code can read that value by its expected name.
        path: req.path,
        // I am keeping the `hasCookie` field in this object so the receiving code can read that value by its expected name.
        hasCookie: Boolean(cookieVal),
        // I am keeping the `hasProvided` field in this object so the receiving code can read that value by its expected name.
        hasProvided: Boolean(providedVal),
        // I am keeping the `contentType` field in this object so the receiving code can read that value by its expected name.
        contentType: req.get('content-type'),
        // I am keeping the `requestId` field in this object so the receiving code can read that value by its expected name.
        requestId: req.requestId
      // I am keeping this line here because the surrounding csrfLite.js workflow expects this value or operation before it continues.
      }, 'CSRF token missing');
      // This return sends the completed value or response back to the code that called this function.
      return res.status(403).json({ ok: false, error: 'Missing or invalid CSRF token' });
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!timingSafeEqual(cookieVal, providedVal)) {
      // Debug: Log first/last few chars to help diagnose without exposing full token
      const cookiePreview = cookieVal ? `${cookieVal.substring(0, 4)}...${cookieVal.substring(cookieVal.length - 4)}` : 'null';
      // I am saving `providedPreview` here so the nearby steps can reuse the same value without rebuilding it each time.
      const providedPreview = providedVal ? `${providedVal.substring(0, 4)}...${providedVal.substring(providedVal.length - 4)}` : 'null';
      // I am calling this helper here so the current workflow performs this step before it moves on.
      logger.warn({
        // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
        event: 'csrf.token_mismatch',
        // I am keeping the `method` field in this object so the receiving code can read that value by its expected name.
        method: req.method,
        // I am keeping the `path` field in this object so the receiving code can read that value by its expected name.
        path: req.path,
        // I am keeping the `contentType` field in this object so the receiving code can read that value by its expected name.
        contentType: req.get('content-type'),
        // I am keeping the `cookieLength` field in this object so the receiving code can read that value by its expected name.
        cookieLength: cookieVal?.length || 0,
        // I am keeping the `providedLength` field in this object so the receiving code can read that value by its expected name.
        providedLength: providedVal?.length || 0,
        // I am keeping this line here because the surrounding csrfLite.js workflow expects this value or operation before it continues.
        cookiePreview,
        // I am keeping this line here because the surrounding csrfLite.js workflow expects this value or operation before it continues.
        providedPreview,
        // I am keeping the `cookieName` field in this object so the receiving code can read that value by its expected name.
        cookieName: CSRF_COOKIE_NAME,
        // I am keeping the `requestId` field in this object so the receiving code can read that value by its expected name.
        requestId: req.requestId
      // I am keeping this line here because the surrounding csrfLite.js workflow expects this value or operation before it continues.
      }, 'CSRF token mismatch');
      // This return sends the completed value or response back to the code that called this function.
      return res.status(403).json({ ok: false, error: 'Missing or invalid CSRF token' });
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // This return sends the completed value or response back to the code that called this function.
    return next();
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (err) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.error({
      // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
      event: 'csrf.exception',
      // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
      error: err.message,
      // I am keeping the `requestId` field in this object so the receiving code can read that value by its expected name.
      requestId: req.requestId
    // I am keeping this line here because the surrounding csrfLite.js workflow expects this value or operation before it continues.
    }, 'CSRF validation exception');
    // This return sends the completed value or response back to the code that called this function.
    return res.status(403).json({ ok: false, error: 'Missing or invalid CSRF token' });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
};
