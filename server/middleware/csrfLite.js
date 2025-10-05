// File: server/middleware/csrfLite.js
// Description: Smart CSRF protection — enforce for cookie-based mutations, skip for Bearer
// Notes: Double-submit cookie pattern; Origin check for form posts

const crypto = require('crypto');

/**
 * DEV TEST (curl)
 *
 *   # start clean
 *   rm -f jar.txt
 *
 *   # 0) Prime CSRF cookie (this sets `csrf_token`)
 *   curl -i -c jar.txt http://localhost:3000/login
 *
 *   # 1) Grab the CSRF token from the cookie jar
 *   CSRF=$(awk '$6~"csrf_token"{print $7}' jar.txt); echo "CSRF=$CSRF"
 *
 *   # 2) Log in (correct route!)
 *   curl -i -b jar.txt -c jar.txt \
 *     -H 'Content-Type: application/json' \
 *     -H "X-CSRF-Token: $CSRF" \
 *     -X POST http://localhost:3000/api/auth/login \
 *     -d '{"email":"YOUR_EMAIL","password":"YOUR_PASSWORD"}'
 *
 *   # 3) Call the protected endpoint using the auth cookie
 *   curl -i -b jar.txt http://localhost:3000/api/profile/me
 */

/* ----------------- helpers ----------------- */

function setCookie(res, name, val) {
  // HttpOnly=false by design for double-submit pattern (form can read/send value)
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `${name}=${encodeURIComponent(val)}; Path=/; SameSite=Strict${secure}`
  );
}

function hasBearerToken(req) {
  const authz = req.headers.authorization || '';
  return /^Bearer\s+/i.test(authz);
}

function isIdempotent(req) {
  return req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS';
}

function usesCookies(req) {
  return Boolean(req.headers.cookie);
}

function getCsrfFromCookie(req) {
  const cookie = req.headers.cookie || '';
  const m = cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

function getProvidedToken(req) {
  return req.get('x-csrf-token') || (req.body ? req.body._csrf : null) || null;
}

/**
 * Skip CSRF for these cookie-management endpoints (they authenticate with Bearer)
 */
function isAuthCookieEndpoint(req) {
  return req.path === '/auth/set-cookie' || req.path === '/auth/clear-cookie';
}

function validateOrigin(req) {
  const origin  = req.get('origin');
  const referer = req.get('referer');
  const host    = req.get('host');

  if (origin && origin.includes(host))  return true;
  if (referer && referer.includes(host)) return true;

  if (process.env.NODE_ENV === 'development') {
    if (origin && origin.includes('localhost'))  return true;
    if (referer && referer.includes('localhost')) return true;
  }
  return false;
}

function wantsJson(req) {
  const acc = req.get('accept') || '';
  const ct  = req.get('content-type') || '';
  // Treat API and JSON clients as JSON responders
  return req.path.startsWith('/api/') || acc.includes('application/json') || ct.includes('application/json');
}

/* ----------------- middleware ----------------- */

module.exports = function csrfLite(req, res, next) {
  try {
    // For idempotent requests, ensure a CSRF token cookie exists and expose it to views
    if (isIdempotent(req)) {
      let csrfToken = getCsrfFromCookie(req);
      if (!csrfToken) {
        csrfToken = crypto.randomBytes(32).toString('base64url');
        setCookie(res, 'csrf_token', csrfToken);
      }
      res.locals.csrfToken = csrfToken;
      return next();
    }

    // Not idempotent → mutation
    // If the request uses Bearer (no CSRF risk) or is an auth-cookie endpoint → skip CSRF
    if (hasBearerToken(req) || isAuthCookieEndpoint(req)) {
      return next();
    }

    // If there are no cookies at all, we're likely a pure API client → skip CSRF
    if (!usesCookies(req)) {
      return next();
    }

    // Enforce double-submit token for cookie-based mutations
    const csrfCookie  = getCsrfFromCookie(req);
    const provided    = getProvidedToken(req);

    if (!csrfCookie || !provided || provided !== csrfCookie) {
      const body = { success: false, message: 'CSRF check failed' };
      return wantsJson(req) ? res.status(403).json(body) : res.status(403).send(body.message);
    }

    // Extra safety: verify same-origin for form posts
    if ((req.get('content-type') || '').includes('application/x-www-form-urlencoded')) {
      if (!validateOrigin(req)) {
        const body = { success: false, message: 'Origin validation failed' };
        return wantsJson(req) ? res.status(403).json(body) : res.status(403).send(body.message);
      }
    }

    return next();
  } catch {
    const body = { success: false, message: 'CSRF check failed' };
    return wantsJson(req) ? res.status(403).json(body) : res.status(403).send(body.message);
  }
};