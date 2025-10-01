// File: server/middleware/csrfLite.js
// Description: Smart CSRF protection - skip for Bearer tokens, enforce for cookies
// Notes: CSRF only needed for cookie-based requests, not Bearer token API calls

const crypto = require('crypto');

/**
 * WHAT:
 * We provide CSRF protection using double-submit cookie pattern, but only when needed.
 * 
 * WHY:
 * CSRF attacks only work with cookies. Bearer tokens in Authorization headers
 * cannot be exploited via CSRF because browsers don't automatically send them.
 * 
 * HOW:
 * - Skip CSRF for requests with Authorization: Bearer tokens
 * - Skip CSRF for /api/* routes (typically use Bearer tokens)
 * - Enforce CSRF for form submissions using cookies
 * - Add Origin/Referer validation for additional security
 */

function setCookie(res, name, val) {
  // HttpOnly=false on purpose so browser can send token in a form/body
  // Secure flag for production, SameSite=Strict for CSRF protection
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${name}=${encodeURIComponent(val)}; Path=/; SameSite=Strict${secure}`);
}

/**
 * Check if request uses Bearer token authentication
 */
function hasBearerToken(req) {
  const authz = req.headers.authorization || '';
  return authz.startsWith('Bearer ');
}

/**
 * Check if request is to API route
 */
function isApiRoute(req) {
  return req.path.startsWith('/api/');
}

/**
 * Check if request is to auth cookie management endpoints
 * 
 * WHAT:
 * Identifies requests to /auth/set-cookie and /auth/clear-cookie endpoints.
 * 
 * WHY:
 * These endpoints use Bearer tokens for authentication (not cookies), so they
 * don't need CSRF protection. CSRF only applies to cookie-based authentication.
 * 
 * HOW:
 * Check if the request path matches the auth cookie endpoints exactly.
 */
function isAuthCookieEndpoint(req) {
  return req.path === '/auth/set-cookie' || req.path === '/auth/clear-cookie';
}

/**
 * Validate Origin/Referer for form submissions
 */
function validateOrigin(req) {
  const origin = req.get('origin');
  const referer = req.get('referer');
  const host = req.get('host');
  
  // Allow same-origin requests
  if (origin && origin.includes(host)) return true;
  if (referer && referer.includes(host)) return true;
  
  // Allow localhost in development
  if (process.env.NODE_ENV === 'development') {
    if (origin && origin.includes('localhost')) return true;
    if (referer && referer.includes('localhost')) return true;
  }
  
  return false;
}

module.exports = function csrfLite(req, res, next) {
  /**
   * WHAT:
   * We apply CSRF protection only where it's needed (cookie-based requests).
   * 
   * WHY:
   * CSRF attacks exploit the browser's automatic cookie sending. If a request
   * uses Bearer tokens (which browsers don't auto-send), CSRF doesn't apply.
   * 
   * HOW:
   * Skip CSRF for:
   * 1. Requests with Authorization: Bearer headers
   * 2. API routes (typically use Bearer tokens)
   * 3. Auth cookie endpoints (use Bearer tokens to set/clear cookies)
   * Enforce CSRF for: Form posts and other cookie-based requests
   */
  try {
    // Skip CSRF for Bearer token requests (CSRF doesn't apply)
    if (hasBearerToken(req)) {
      return next();
    }

    // Skip CSRF for API routes (typically use Bearer tokens)
    if (isApiRoute(req)) {
      return next();
    }

    // Skip CSRF for auth cookie endpoints (use Bearer tokens)
    if (isAuthCookieEndpoint(req)) {
      return next();
    }

    const cookie = req.headers.cookie || '';
    const match = cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
    let csrfToken = match ? decodeURIComponent(match[1]) : null;

    // For idempotent requests, ensure a token exists and make it available to views
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
      if (!csrfToken) {
        csrfToken = crypto.randomBytes(32).toString('base64url');
        setCookie(res, 'csrf_token', csrfToken);
      }
      res.locals.csrfToken = csrfToken;
      return next();
    }

    // For state-changing requests, verify CSRF token
    const headerToken = req.get('x-csrf-token');
    const bodyToken = req.body?._csrf;
    const provided = headerToken || bodyToken;

    if (!csrfToken || !provided || provided !== csrfToken) {
      return res.status(403).send('CSRF check failed');
    }

    // Additional security: validate Origin/Referer for form submissions
    if (req.get('content-type')?.includes('application/x-www-form-urlencoded')) {
      if (!validateOrigin(req)) {
        return res.status(403).send('Origin validation failed');
      }
    }

    return next();
  } catch {
    return res.status(403).send('CSRF check failed');
  }
};
