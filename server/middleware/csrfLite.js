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

// ============================================================
// Configuration (override with env for flexibility)
// ============================================================
const CSRF_COOKIE_NAME = process.env.CSRF_COOKIE_NAME || 'csrf_token';
const CSRF_HEADER_NAME = (process.env.CSRF_HEADER_NAME || 'x-csrf-token').toLowerCase();
const AUTH_COOKIE_DOMAIN = process.env.AUTH_COOKIE_DOMAIN || undefined; // leave undefined if you ever switch to __Host- cookies

// ============================================================
// Helper Functions
// ============================================================
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
    return req.cookies[CSRF_COOKIE_NAME];
  }
  // Fallback: parse header manually
  const cookie = req.headers.cookie || '';
  const escapedName = CSRF_COOKIE_NAME.replace(/[-.$?*|{}()[\]\\/+^]/g, '\\$&');
  const m = cookie.match(new RegExp('(?:^|;\\s*)' + escapedName + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : null;
}

function getProvidedToken(req) {
  // Header first (case-insensitive)
  const hdr = req.headers[CSRF_HEADER_NAME];
  if (hdr) return String(hdr);
  // Classic HTML forms (URL-encoded)
  const b = req.body || {};
  return b._csrf || b.csrf || b.csrf_token || null;
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

function wantsJson(req) {
  const acc = req.get('accept') || '';
  const ct  = req.get('content-type') || '';
  return req.path.startsWith('/api/') || acc.includes('application/json') || ct.includes('application/json');
}

// ============================================================
// Main Middleware
// ============================================================
module.exports = function csrfLite(req, res, next) {
  try {
    // ============================================================
    // 1) Idempotent requests: just ensure the cookie exists
    // ============================================================
    if (SAFE.has(req.method)) {
      let csrfToken = getCsrfFromCookie(req);
      if (!csrfToken) {
        csrfToken = crypto.randomBytes(32).toString('base64url');
        // Not HttpOnly so JS can read and echo it
        res.cookie(CSRF_COOKIE_NAME, csrfToken, {
          domain: AUTH_COOKIE_DOMAIN, // omit this if you ever switch to __Host- cookies
          path: '/',
          sameSite: 'Strict',
          secure: true,
          httpOnly: false,
          maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        });
      }
      res.locals.csrfToken = csrfToken;
      return next();
    }

    // ============================================================
    // 2) Non-idempotent: mutation request
    // ============================================================
    // Skip CSRF if:
    //   - Bearer token present (pure API client), or
    //   - This is an auth-cookie endpoint (set/clear happens after JWT verify)
    if (hasBearerToken(req) || isAuthCookieEndpoint(req)) {
      return next();
    }

    // ============================================================
    // 3) If client sent no cookies, likely not a browser + cookie flow
    // ============================================================
    if (!usesCookies(req)) {
      return next();
    }

    // ============================================================
    // 4) Enforce double-submit match with timing-safe compare
    // ============================================================
    const cookieVal  = getCsrfFromCookie(req);
    const headerVal  = getProvidedToken(req);

    if (!cookieVal || !headerVal) {
      const body = { error: 'csrf_invalid', code: 'missing' };
      console.warn('[csrf] missing token', {
        method: req.method, path: req.path,
        cookie: Boolean(cookieVal), header: Boolean(headerVal),
        reqId: req.headers['x-request-id'] || null
      });
      return wantsJson(req) ? res.status(403).json(body) : res.status(403).send('CSRF check failed');
    }

    if (!timingSafeEqual(cookieVal, headerVal)) {
      const body = { error: 'csrf_invalid', code: 'mismatch' };
      console.warn('[csrf] mismatch', {
        method: req.method, path: req.path,
        reqId: req.headers['x-request-id'] || null
      });
      return wantsJson(req) ? res.status(403).json(body) : res.status(403).send('CSRF check failed');
    }

    return next();
  } catch (err) {
    const body = { error: 'csrf_invalid', code: 'exception' };
    console.error('[csrf] exception', {
      message: err.message,
      reqId: req.headers['x-request-id'] || null
    });
    return wantsJson(req) ? res.status(403).json(body) : res.status(403).send('CSRF check failed');
  }
};
