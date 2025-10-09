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
const { verifyToken } = require('../middleware/auth/supabaseJwt');

// Check if we're in production
const isProd = process.env.NODE_ENV === 'production';

/**
 * POST /auth/set-cookie
 * 
 * WHAT:
 * Accepts a Bearer token from the Authorization header, verifies it server-side,
 * and sets it as an HttpOnly cookie only if valid.
 * 
 * WHY:
 * We never trust the client. Before storing a token in a secure cookie, we must
 * verify it's legitimate. This prevents attackers from injecting fake tokens.
 * 
 * HOW:
 * 1. Extract token from Authorization: Bearer header
 * 2. Verify token signature, issuer, audience, and expiration via JWKS
 * 3. Only set cookie if verification succeeds
 * 4. Return user ID on success for client confirmation
 */
router.post('/set-cookie', async (req, res) => {
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

    // Verify token server-side before setting cookie (CRITICAL SECURITY CHECK)
    let payload;
    try {
      payload = await verifyToken(token);
    } catch (verifyError) {
      // Token is invalid (signature, expiration, issuer, or audience mismatch)
      return res.status(401).json({ 
        ok: false, 
        error: 'Invalid token' 
      });
    }

    // Calculate Max-Age from verified expiration
    const maxAgeMs = payload.exp 
      ? Math.max(payload.exp * 1000 - Date.now(), 0) 
      : 3600_000; // Default: 1 hour

    /**
     * Set HttpOnly cookie with proper security flags
     * 
     * WHAT:
     * We set the verified access token as a secure, HttpOnly cookie.
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
     * - maxAge: calculated from verified token expiration
     */
    res.cookie('sb-access-token', token, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      path: '/',
      maxAge: maxAgeMs
    });

    return res.json({ ok: true, userId: payload.sub });
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

