/**
 * File: server/middleware/auth/supabaseJwt.js
 * Description: Verify Supabase JWT via JWKS (signature + iss + aud). Adds req.user on success.
 *
 * WHAT:
 * This middleware validates Supabase JWTs by fetching the public keys from Supabase's JWKS endpoint
 * and verifying the token's signature, issuer, audience, and expiration.
 *
 * WHY:
 * We never trust the client. Every protected route must verify the JWT server-side to ensure
 * the request is from a legitimate, authenticated user.
 *
 * HOW:
 * On success, req.user is populated with { id, email, role }. On failure, returns 401.
 * Uses jose library for modern, secure JWT verification with JWKS support.
 */

const { createRemoteJWKSet, jwtVerify } = require('jose');

const SUPABASE_URL = process.env.SUPABASE_URL?.replace(/\/+$/, '');
if (!SUPABASE_URL) {
  // Keep startup failure obvious
  throw new Error('SUPABASE_URL env is required');
}

// ============================================================
// Supabase JWKS endpoint
// ============================================================
const JWKS_URL = `${SUPABASE_URL}/auth/v1/keys`;
const JWKS = createRemoteJWKSet(new URL(JWKS_URL));

// ============================================================
// Expected claims (Supabase defaults)
// ============================================================
// Supabase defaults: aud=authenticated, iss=https://<project>.supabase.co/auth/v1
const EXPECTED_AUD = process.env.SUPABASE_JWT_AUD || 'authenticated';
const EXPECTED_ISS = `${SUPABASE_URL}/auth/v1`;

/**
 * Extract bearer token or cookie fallback.
 *
 * WHAT:
 * Looks for token in Authorization header first, then falls back to cookies.
 *
 * WHY:
 * Supports both header-based (API clients) and cookie-based (browser) auth.
 *
 * HOW:
 * Returns token string if found, null otherwise.
 */
function readToken(req) {
  const h = req.headers.authorization || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (m && m[1]) return m[1].trim();
  
  // Optional cookie names (adjust to your cookie name)
  return req.cookies?.sb || req.cookies?.sb_session || null;
}

/**
 * Verify JWT using JWKS and expected claims.
 *
 * WHAT:
 * Performs full JWT verification: signature, issuer, audience, expiration.
 *
 * WHY:
 * This is the core security check. If verification fails, the token is invalid.
 *
 * HOW:
 * Uses jose's jwtVerify with remote JWKS. Returns payload on success, throws on failure.
 */
async function verifyToken(token) {
  const { payload } = await jwtVerify(token, JWKS, {
    issuer: EXPECTED_ISS,
    audience: EXPECTED_AUD
  });
  return payload;
}

/**
 * Middleware: require valid Supabase JWT
 *
 * WHAT:
 * Express middleware that enforces authentication on protected routes.
 *
 * WHY:
 * Every protected endpoint must validate the JWT before allowing access.
 *
 * HOW:
 * Reads token, verifies it, populates req.user on success. Returns 401 on failure.
 * Does not reveal specific error details to prevent information leakage.
 */
function authRequired(req, res, next) {
  const token = readToken(req);
  if (!token) return res.status(401).json({ error: 'missing token' });

  verifyToken(token)
    .then((payload) => {
      req.user = {
        id: payload.sub,
        email: payload.email,
        role: payload.role || payload.user_role || 'user'
      };
      next();
    })
    .catch(() => res.status(401).json({ error: 'invalid token' }));
}

module.exports = { authRequired, verifyToken };

