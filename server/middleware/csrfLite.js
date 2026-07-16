/**
 * Description: Smart CSRF protection  enforce for cookie-based mutations, skip for Bearer
 *
 * Double-submit cookie: we set a readable CSRF cookie and require clients to echo it
 * in the x-csrf-token header (or form field) for state-changing requests.
 *
 * Blocks cross-site request forgery. Attackers cannot read your cookies, so they cannot
 * produce a matching token.
 *
 * - Issues a CSRF cookie on idempotent requests (GET/HEAD/OPTIONS).
 * - Enforces token match on POST/PUT/PATCH/DELETE when cookies are present.
 * - Skips CSRF if Authorization: Bearer is used (pure API clients) or for auth cookie endpoints.
 * - Uses timing-safe compare to prevent subtle timing attacks.
 * - Configurable via environment variables for flexibility.
 */

const crypto = require('crypto');
const logger = require('../utils/logger');
const { config } = require('../config');

// Configuration (from centralized config)
const CSRF_COOKIE_NAME = config.csrf.cookieName;
const CSRF_HEADER_NAME = config.csrf.headerName;
const AUTH_COOKIE_DOMAIN = config.auth.cookieDomain; // keep undefined when using __Host- cookies
const IS_PROD = config.server?.nodeEnv === 'production';

// Helper Functions
const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

function hasBearerToken(req) {
  const authz = req.headers.authorization || '';
  return /^Bearer\s+/i.test(authz);
}

function usesCookies(req) {
  return Boolean(req.headers.cookie);
}

function getCsrfFromCookie(req) {
  // Prefer cookie-parser if present
  if (req.cookies && Object.prototype.hasOwnProperty.call(req.cookies, CSRF_COOKIE_NAME)) {
    const val = req.cookies[CSRF_COOKIE_NAME];
    // Ensure we return a trimmed string (cookie-parser should handle this, but be defensive)
    return val ? String(val).trim() : null;
  }
  // Fallback: parse header manually
  const cookie = req.headers.cookie || '';
  const escapedName = CSRF_COOKIE_NAME.replace(/[-.$?*|{}()[\]\\/+^]/g, '\\$&');
  const m = cookie.match(new RegExp('(?:^|;\\s*)' + escapedName + '=([^;]+)'));
  if (!m) return null;
  // Decode and trim the cookie value
  const decoded = decodeURIComponent(m[1]);
  return decoded ? String(decoded).trim() : null;
}

function getProvidedToken(req) {
  // For JSON requests (like PUT /api/profile/me and POST /account/password),
  // the token is sent in the X-CSRF-Token header. For form-encoded requests,
  // it may be in req.body._csrf. We check header first, then body as fallback.
  const name = String(CSRF_HEADER_NAME || '');
  const hdr =
    req.get?.(name) ||
    req.get?.(name.toLowerCase()) ||
    req.get?.('x-csrf-token') ||
    req.get?.('csrf-token') ||
    req.get?.('x-xsrf-token') ||
    req.headers?.[name] ||
    req.headers?.[name.toLowerCase()];
  if (hdr) {
    const trimmed = String(hdr).trim();
    // Header found - use it (this is the standard for JSON API requests)
    return trimmed;
  }
  // Fallback: check body for form-encoded requests
  const b = req.body || {};
  return b._csrf || b.csrf || b.csrf_token || null;
}

/**
 * Timing-safe string comparison
 *
 * Compares two strings in constant time to prevent timing attacks.
 *
 * Standard string comparison (===) can leak information about where strings differ
 * via timing. This prevents attackers from guessing tokens character by character.
 *
 * Uses crypto.timingSafeEqual which compares buffers in constant time regardless
 * of where they differ.
 */
function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const A = Buffer.from(a);
  const B = Buffer.from(b);
  if (A.length !== B.length) return false;
  try { return crypto.timingSafeEqual(A, B); } catch { return false; }
}

function isAuthCookieEndpoint(req) {
  // These endpoints authenticate with Bearer, then set/clear cookies server-side
  return req.path === '/auth/set-cookie' || req.path === '/auth/clear-cookie';
}

function isWebhookEndpoint(req) {
  // Webhook endpoints are CSRF-exempt (they use HMAC verification instead)
  // Stripe webhook is mounted at /api/stripe/webhook before body parsers and CSRF
  return req.path === '/api/stripe/webhook' || req.path.startsWith('/api/stripe/webhook');
}

function wantsJson(req) {
  const acc = req.get('accept') || '';
  const ct  = req.get('content-type') || '';
  return req.path.startsWith('/api/') || acc.includes('application/json') || ct.includes('application/json');
}

// Main Middleware
module.exports = function csrfLite(req, res, next) {
  try {
    // 0) OPTIONS preflight: always allow (CORS handles it)
    if (req.method === 'OPTIONS') {
      return next();
    }
    
    // 1) Idempotent requests: just ensure the cookie exists
    if (SAFE.has(req.method)) {
      let csrfToken = getCsrfFromCookie(req);
      if (!csrfToken) {
        csrfToken = crypto.randomBytes(32).toString('base64url');
        const opts = {
          path: '/',
          sameSite: 'Strict',
          secure: IS_PROD,
          httpOnly: false,
          maxAge: 7 * 24 * 60 * 60 * 1000
        };
        if (AUTH_COOKIE_DOMAIN) opts.domain = AUTH_COOKIE_DOMAIN; // omit for __Host- style
        res.cookie(CSRF_COOKIE_NAME, csrfToken, opts);
      }
      res.locals.csrfToken = csrfToken;
      return next();
    }

    // 2) Non-idempotent: mutation request
    // Skip CSRF if:
    //   - Bearer token present (pure API client), or
    //   - This is an auth-cookie endpoint (set/clear happens after JWT verify), or
    //   - This is a webhook endpoint (uses HMAC verification instead)
    if (hasBearerToken(req) || isAuthCookieEndpoint(req) || isWebhookEndpoint(req)) {
      return next();
    }

    // 3) If client sent no cookies, check if this is a public auth endpoint
    // Public auth endpoints (login/register) don't need CSRF if no cookies
    if (!usesCookies(req)) {
      // Public auth endpoints are exempt from CSRF when no cookies
      const isPublicAuth = req.path.startsWith('/api/auth/login') || 
                          req.path.startsWith('/api/auth/register') ||
                          req.path.startsWith('/auth/login') ||
                          req.path.startsWith('/auth/register');
      if (isPublicAuth) {
        return next();
      }
      // For other unsafe methods without cookies, require CSRF token in header/body
      const headerVal = getProvidedToken(req);
      if (!headerVal) {
        logger.warn({
          event: 'csrf.token_missing_no_cookies',
          method: req.method,
          path: req.path,
          requestId: req.requestId
        }, 'CSRF token missing (no cookies, but unsafe method)');
        return res.status(403).json({ ok: false, error: 'Missing or invalid CSRF token' });
      }
      // No ambient cookies → nothing to forge. Header is enough here.
      res.locals.csrfToken = headerVal;
      return next();
    }

    // 4) Enforce double-submit match with timing-safe compare
    // For JSON requests (PUT /api/profile/me, POST /account/password):
    // - Token is sent in X-CSRF-Token header
    // - getProvidedToken() reads header first, then falls back to req.body._csrf
    // - Both cookie and header/body token must match (double-submit pattern)
    const cookieVal  = getCsrfFromCookie(req);
    const providedVal = getProvidedToken(req);

    if (!cookieVal || !providedVal) {
      logger.warn({
        event: 'csrf.token_missing',
        method: req.method,
        path: req.path,
        hasCookie: Boolean(cookieVal),
        hasProvided: Boolean(providedVal),
        contentType: req.get('content-type'),
        requestId: req.requestId
      }, 'CSRF token missing');
      return res.status(403).json({ ok: false, error: 'Missing or invalid CSRF token' });
    }

    if (!timingSafeEqual(cookieVal, providedVal)) {
      // Debug: Log first/last few chars to help diagnose without exposing full token
      const cookiePreview = cookieVal ? `${cookieVal.substring(0, 4)}...${cookieVal.substring(cookieVal.length - 4)}` : 'null';
      const providedPreview = providedVal ? `${providedVal.substring(0, 4)}...${providedVal.substring(providedVal.length - 4)}` : 'null';
      logger.warn({
        event: 'csrf.token_mismatch',
        method: req.method,
        path: req.path,
        contentType: req.get('content-type'),
        cookieLength: cookieVal?.length || 0,
        providedLength: providedVal?.length || 0,
        cookiePreview,
        providedPreview,
        cookieName: CSRF_COOKIE_NAME,
        requestId: req.requestId
      }, 'CSRF token mismatch');
      return res.status(403).json({ ok: false, error: 'Missing or invalid CSRF token' });
    }

    return next();
  } catch (err) {
    logger.error({
      event: 'csrf.exception',
      error: err.message,
      requestId: req.requestId
    }, 'CSRF validation exception');
    return res.status(403).json({ ok: false, error: 'Missing or invalid CSRF token' });
  }
};
