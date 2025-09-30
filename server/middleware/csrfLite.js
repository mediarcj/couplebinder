// File: server/middleware/csrfLite.js
// Description: Simple CSRF using double-submit cookie. No Redis, no server-side session.
// Notes: Stateless CSRF protection using cookie + form token matching

const crypto = require('crypto');

/**
 * WHAT:
 * We provide CSRF protection using double-submit cookie pattern.
 * 
 * WHY:
 * CSRF attacks trick users into making unwanted requests. We need protection
 * without server-side session storage for stateless operation.
 * 
 * HOW:
 * We set a random token in a cookie and require the same token in forms/headers.
 * This prevents CSRF because attackers can't read the cookie due to same-origin policy.
 */

function setCookie(res, name, val) {
  // HttpOnly=false on purpose so browser can send token in a form/body; secure flags still applied
  res.setHeader('Set-Cookie', `${name}=${encodeURIComponent(val)}; Path=/; SameSite=Strict; Secure`);
}

module.exports = function csrfLite(req, res, next) {
  try {
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

    // For state-changing requests, verify token
    const headerToken = req.get('x-csrf-token');
    const bodyToken = req.body?._csrf;
    const provided = headerToken || bodyToken;

    if (!csrfToken || !provided || provided !== csrfToken) {
      return res.status(403).send('CSRF check failed');
    }
    return next();
  } catch {
    return res.status(403).send('CSRF check failed');
  }
};
