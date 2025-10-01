// File: server/routes/authCookie.js
// Description: Server-side cookie management endpoints for secure authentication
// Purpose: Set and clear HttpOnly cookies for access tokens (secure, no JS access)
// Notes: Cookies are HttpOnly (JS can't read), Secure in prod, SameSite=Lax for redirects

/**
 * WHAT:
 * We provide two endpoints to manage the authentication cookie on the server side.
 * 
 * WHY:
 * HttpOnly cookies cannot be stolen via XSS. By setting them server-side, we keep
 * tokens invisible to JavaScript, making attacks much harder.
 * 
 * HOW:
 * - POST /set-cookie: reads Bearer token from header, sets sb-access-token cookie
 * - POST /clear-cookie: clears the sb-access-token cookie (logout)
 * Both use proper cookie flags: HttpOnly, Secure (prod), SameSite=Lax, Path=/
 */

const express = require('express');
const router = express.Router();

// Check if we're in production
const isProd = process.env.NODE_ENV === 'production';

/**
 * POST /auth/set-cookie
 * 
 * WHAT:
 * Accepts a Bearer token from the Authorization header and sets it as an HttpOnly cookie.
 * 
 * WHY:
 * After Supabase login on the client, we need to transfer the token to a secure cookie
 * that JavaScript cannot access, making it much harder to steal via XSS.
 * 
 * HOW:
 * 1. Extract token from Authorization: Bearer header
 * 2. Decode (don't verify yet) to get expiration time for Max-Age
 * 3. Set cookie with proper security flags
 * 4. Full verification happens in authBridge middleware on subsequent requests
 */
router.post('/set-cookie', (req, res) => {
  try {
    // Extract Bearer token from Authorization header
    const auth = req.get('authorization') || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : null;
    
    if (!token) {
      return res.status(400).json({ 
        ok: false, 
        error: 'Missing bearer token in Authorization header' 
      });
    }

    // Light parse to extract expiration for cookie Max-Age
    // We don't verify the token here - that happens in authBridge middleware
    let maxAgeMs = 3600_000; // Default: 1 hour
    try {
      const parts = token.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
        if (payload.exp) {
          const expiresInMs = Math.max(payload.exp * 1000 - Date.now(), 0);
          maxAgeMs = expiresInMs > 0 ? expiresInMs : 3600_000;
        }
      }
    } catch (parseError) {
      // If parsing fails, use default Max-Age
      // Token verification will happen in authBridge on next request
    }

    /**
     * Set HttpOnly cookie with proper security flags
     * 
     * WHAT:
     * We set the access token as a secure, HttpOnly cookie.
     * 
     * WHY:
     * HttpOnly prevents XSS attacks (JavaScript cannot read the cookie).
     * Secure ensures the cookie is only sent over HTTPS in production.
     * SameSite=Lax protects against CSRF while allowing normal navigation.
     * 
     * HOW:
     * Use Express res.cookie() with security flags:
     * - httpOnly: true (prevents JavaScript access - XSS protection)
     * - secure: true in production (HTTPS only - prevents MITM attacks)
     * - sameSite: 'lax' (prevents CSRF, allows top-level navigation)
     * - path: '/' (available to all routes)
     * - maxAge: calculated from token expiration
     */
    res.cookie('sb-access-token', token, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      path: '/',
      maxAge: maxAgeMs
    });

    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ 
      ok: false, 
      error: 'Failed to set cookie' 
    });
  }
});

/**
 * POST /auth/clear-cookie
 * 
 * WHAT:
 * Clears the sb-access-token cookie by setting Max-Age to 0.
 * 
 * WHY:
 * On logout, we need to remove the authentication cookie from the browser.
 * 
 * HOW:
 * Set the same cookie with Max-Age=0 and empty value, using same flags for consistency.
 */
router.post('/clear-cookie', (req, res) => {
  try {
    // Clear cookie by setting Max-Age to 0
    res.cookie('sb-access-token', '', {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      path: '/',
      maxAge: 0
    });

    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ 
      ok: false, 
      error: 'Failed to clear cookie' 
    });
  }
});

module.exports = router;

