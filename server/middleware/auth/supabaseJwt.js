/**
 * File: server/middleware/auth/supabaseJwt.js
 * Description: Verify Supabase JWT via JWKS (signature + iss + aud). Adds req.user on success.
 * Notes: Uses jose with remote JWKS. Works with Supabase RS256 keys. Keep comments short and clear.
 *
 * ============================================================
 * WHAT
 * Validate Supabase Auth tokens on the server using Supabases JWKS (public keys).
 *
 * WHY
 * The browser is not trusted. Every protected route must verify the tokens signature and claims.
 *
 * HOW
 * 1) Build a JWKS URL for this project.
 * 2) Fetch and cache the keys (server only).
 * 3) Verify signature (RS256), issuer, audience, and time.
 * 4) On success: set req.user = { id, email, role }. On failure: return 401.
 * ============================================================
 */

const { createRemoteJWKSet, jwtVerify } = require('jose');
const { audit } = require('../../lib/audit');

// ============================================================
// STEP 1: Read env (fail fast on missing core vars)
// ------------------------------------------------------------
// WHAT: Resolve base URL and anon key. Normalize URL (no trailing slash).
// WHY: We need the project URL to reach JWKS, and many projects require apikey to read JWKS.
// HOW: Read SUPABASE_URL and SUPABASE_ANON_KEY. Warn if anon key is missing (JWKS may 401).
// ============================================================
const SUPABASE_URL = process.env.SUPABASE_URL?.replace(/\/+$/, '');
if (!SUPABASE_URL) throw new Error('SUPABASE_URL env is required');

const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
if (!SUPABASE_ANON_KEY) {
  // We can still boot, but some projects will reject JWKS without an apikey.
  console.warn('[auth] Warning: SUPABASE_ANON_KEY missing; JWKS fetch may be unauthorized.');
}

// ============================================================
// STEP 2: Build JWKS endpoint
// ------------------------------------------------------------
// WHAT: Use the GoTrue JWKS path. Add apikey query so Supabase authorizes the read.
// WHY: Without apikey, many projects return 401. This call is server-side only.
// HOW: Prefer /auth/v1/jwks. Allow SUPABASE_JWKS_URL override for rare setups.
// ============================================================
const JWKS_URL =
  process.env.SUPABASE_JWKS_URL?.trim() ||
  `${SUPABASE_URL}/auth/v1/jwks${SUPABASE_ANON_KEY ? `?apikey=${encodeURIComponent(SUPABASE_ANON_KEY)}` : ''}`;

const JWKS = createRemoteJWKSet(new URL(JWKS_URL), {
  cache: true,
  cooldownDuration: 600_000 // 10 minutes between failed refetch attempts
});

// ============================================================
// STEP 3: Expected claims
// ------------------------------------------------------------
// WHAT: Set the issuer(s), audience, and clock tolerance.
// WHY: These claims help prove the token came from your project and is still valid.
// HOW: Supabase default aud is "authenticated"; issuer usually ends with /auth/v1.
// ============================================================
const EXPECTED_AUD = process.env.SUPABASE_EXPECTED_AUD || 'authenticated';
const ALLOWED_ISSUERS = [
  `${SUPABASE_URL}/auth/v1`, // common shape
  SUPABASE_URL               // lenient fallback (some tokens may use base URL)
];

const CLOCK_SKEW_SEC = Number(process.env.JWT_CLOCK_SKEW_SEC || 60); // allow 60s time drift

// ============================================================
// STEP 4: Read token from request
// ------------------------------------------------------------
// WHAT: Try "Authorization: Bearer <token>" first, then cookie.
// WHY: Supports both API clients (header) and browsers (cookie).
// HOW: Cookie name is configurable; default "sb_session" (Supabase new default).
// ============================================================
function readToken(req) {
  // 1) Preferred: Authorization header
  const h = req.headers.authorization || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (m && m[1]) return m[1].trim();

  // 2) Cookie fallback (env-driven + legacy for migration safety)
  const cookieName = process.env.AUTH_COOKIE_NAME || 'sb_session';
  return (
    req.cookies?.[cookieName] ||
    req.cookies?.['sb-access-token'] || // legacy
    req.cookies?.['sb_session'] ||      // legacy
    null
  );
}

// ============================================================
// STEP 5: Verify token
// ------------------------------------------------------------
// WHAT: Validate signature, issuer, audience, exp/nbf with jose and remote JWKS.
// WHY: This is the core security gate. Reject anything that does not match.
// HOW: Limit algorithms to RS256 (matches your current Supabase setup).
//      If you later rotate to ES256, update algorithms accordingly.
// ============================================================
async function verifyToken(token) {
  if (!token) {
    const err = new Error('missing_token');
    err.code = 'missing_token';
    throw err;
  }

  try {
    const { payload } = await jwtVerify(token, JWKS, {
      algorithms: ['RS256'],
      issuer: ALLOWED_ISSUERS,
      audience: EXPECTED_AUD,
      clockTolerance: CLOCK_SKEW_SEC
    });

    // Basic sanity: sub must exist
    if (!payload?.sub) {
      const err = new Error('missing_sub');
      err.code = 'missing_sub';
      throw err;
    }

    return payload;
  } catch (err) {
    // Keep details in server logs only
    const reason = err?.code || err?.message || 'verify_failed';
    const meta = {
      name: err?.name,
      code: err?.code,
      claim: err?.claim,
      iss: err?.payload?.iss,
      aud: err?.payload?.aud
    };
    console.warn('[auth] JWT verification failed:', reason, JSON.stringify(meta));
    
    // ============================================================
    // Audit log: JWT verification failure
    // ============================================================
    audit('auth.verify.fail', { reason, claim: err?.claim }, null);
    
    // Return a generic error to client
    const clientErr = new Error('invalid_token');
    clientErr.code = reason;
    clientErr.cause = err;
    throw clientErr;
  }
}

// ============================================================
// STEP 6: Express middleware (authRequired)
// ------------------------------------------------------------
// WHAT: Require a valid Supabase JWT for protected routes.
// WHY: Enforces auth on the server even if the UI hides things.
// HOW: Read  verify  set req.user  next(), else 401.
// ============================================================
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