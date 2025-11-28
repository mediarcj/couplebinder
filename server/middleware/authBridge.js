// File: server/middleware/authBridge.js
// Description: Verifies Supabase JWT access tokens and attaches user identity to req.user
// Purpose: Stateless authentication using HS256 signature verification
// Notes: Reads token from HttpOnly cookie, verifies signature/claims, never logs tokens

/**
 * WHAT:
 * We verify Supabase access tokens to identify users on every request.
 * 
 * WHY:
 * Stateless authentication means no server-side sessions. We trust tokens
 * only after verifying their cryptographic signature and claims.
 * 
 * HOW:
 * 1. Read token from HttpOnly cookie (or Bearer header for API tools)
 * 2. Verify signature using SUPABASE_JWT_SECRET (HS256) or JWKS (RS256)
 * 3. Validate issuer, audience, and expiration with clock skew tolerance
 * 4. Attach verified user data to req.user for downstream middleware
 */

const { createRemoteJWKSet, jwtVerify, decodeProtectedHeader } = require('jose');
const { config } = require('../config');
const logger = require('../utils/logger');

// JWKS fetcher with automatic caching and key rotation support
let jwks;
function jwksFetcher() {
  if (!jwks) jwks = createRemoteJWKSet(new URL(config.jwt.jwksUrl));
  return jwks;
}

/**
 * Read access token from HttpOnly cookie or Authorization header
 * 
 * WHAT:
 * Extract the Supabase access token from the request.
 * 
 * WHY:
 * For SSR pages (HTML), we ONLY use HttpOnly cookies to prevent hidden re-authentication.
 * For API routes (JSON), we support Bearer tokens for API tools/CLI.
 * 
 * HOW:
 * 1. Always check HttpOnly cookie first (cookie-only for SSR)
 * 2. For API routes only: fallback to Authorization: Bearer header
 * 3. Return null if no token found
 */
function readAccessToken(req, cookieOnly = false) {
  const { AUTH_COOKIE_NAME } = require('../lib/authCookie');
  const cookieName = AUTH_COOKIE_NAME;
  const hostPrefixed = `__Host-${cookieName}`;
  
  // Priority 1: HttpOnly cookie (web pages) - env-driven name + legacy fallback
  const cookieToken = req.cookies?.[hostPrefixed]
    || req.cookies?.[cookieName]
    || req.cookies?.['sb-access-token']   // legacy
    || req.cookies?.['sb_session']        // legacy
    || null;

  // Debug logging for cookie read attempt (only when AUTH_DEBUG=true)
  if (config.auth.debug) {
    logger.debug({
      event: 'auth.cookie.read.attempt',
      cookieOnly,
      hasHostPrefixed: !!(req.cookies?.[hostPrefixed]),
      hasPlain: !!(req.cookies?.[cookieName]),
      hasLegacy1: !!(req.cookies?.['sb-access-token']),
      hasLegacy2: !!(req.cookies?.['sb_session']),
      allCookieNames: req.cookies ? Object.keys(req.cookies) : []
    }, 'Cookie read attempt');
  }

  if (cookieToken) return cookieToken;
  
  // Priority 2: Bearer header (API tools, CLI) - ONLY for API routes, not SSR
  if (!cookieOnly) {
    const auth = req.headers.authorization || '';
    if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
  }
  
  return null;
}

/**
 * Main middleware: Verify Supabase JWT and attach req.user
 * 
 * WHAT:
 * We check if the request has a valid Supabase access token and verify it.
 * 
 * WHY:
 * This is our gatekeeper. Protected routes need to know WHO is making the request.
 * We verify cryptographically so we can trust the identity without sessions.
 * 
 * HOW:
 * 1. Read token from HttpOnly cookie (web) or Bearer header (API tools)
 * 2. Decode header to check algorithm (HS256, RS256, ES256)
 * 3. Verify signature + claims (iss, aud, exp) using appropriate method
 * 4. On success: attach req.user with verified identity
 * 5. On failure: set req.user = null and continue (let requireAuth block if needed)
 */
module.exports = async function authBridge(req, res, next) {
  try {
    // Determine if this is an SSR route (HTML) or API route (JSON)
    // SSR routes must ONLY use cookies to prevent hidden re-authentication
    // Status endpoint is special: cookie-only to reflect actual cookie state
    const isSSR = (!req.path.startsWith('/api/') && 
                   !req.path.startsWith('/auth/') &&
                   (req.headers.accept?.includes('text/html') || 
                    req.path.startsWith('/dashboard') ||
                    req.path === '/' ||
                    req.path === '/login')) ||
                  req.path === '/api/auth/status'; // Status endpoint is cookie-only
    
    // Debug logging (controlled by config.auth.debug)
    if (config.auth.debug) {
      const { AUTH_COOKIE_NAME } = require('../lib/authCookie');
      const cookieName = AUTH_COOKIE_NAME;
      const hasBearer = /^Bearer\s+/.test(req.headers.authorization || '');
      const hasCookie = !!(req.cookies && Object.prototype.hasOwnProperty.call(req.cookies, cookieName));
      
      logger.debug({
        event: 'auth.debug',
        method: req.method,
        path: req.originalUrl,
        isSSR,
        hasBearer,
        hasCookie,
        cookieName,
        authSource: hasCookie ? 'cookie' : (hasBearer ? 'bearer' : 'none')
      }, 'Auth bridge debug info');
    }
    
    // Step 1: Read token - cookie-only for SSR, cookie+header for API
    const token = readAccessToken(req, isSSR);
    if (!token) {
      req.user = null;
      // Log auth source for SSR routes (debug level only - expected when not logged in)
      if (isSSR && config.auth.debug) {
        const { AUTH_COOKIE_NAME } = require('../lib/authCookie');
        const cookieName = AUTH_COOKIE_NAME;
        const hostPrefixed = `__Host-${cookieName}`;
        logger.debug({
          event: 'auth.ssr.no_token',
          path: req.path,
          requestId: req.requestId,
          authSource: 'none',
          cookieName,
          hostPrefixed,
          hasHostPrefixed: !!(req.cookies?.[hostPrefixed]),
          hasPlain: !!(req.cookies?.[cookieName]),
          hasLegacy1: !!(req.cookies?.['sb-access-token']),
          hasLegacy2: !!(req.cookies?.['sb_session']),
          allCookieNames: req.cookies ? Object.keys(req.cookies) : [],
          cookieHeaderLength: req.headers.cookie ? req.headers.cookie.length : 0,
          cookieHeaderPreview: req.headers.cookie ? req.headers.cookie.substring(0, 100) : '(none)',
          cookiesObjectKeys: req.cookies ? Object.keys(req.cookies) : [],
          cookiesObjectSize: req.cookies ? Object.keys(req.cookies).length : 0
        }, 'SSR route: no auth cookie (cookie-only) - expected when not logged in');
      }
      return next();
    }
    
    // Log auth source (debug level, PII-safe)
    const { AUTH_COOKIE_NAME } = require('../lib/authCookie');
    const cookieName = AUTH_COOKIE_NAME;
    const hostPrefixed = `__Host-${cookieName}`;
    // Check all cookie variants to determine source
    const hasCookie = !!(req.cookies?.[hostPrefixed] || 
                        req.cookies?.[cookieName] || 
                        req.cookies?.['sb-access-token'] || 
                        req.cookies?.['sb_session']);
    const authSource = hasCookie ? 'cookie' : 'bearer';
    logger.debug({
      event: 'auth.verified',
      path: req.path,
      isSSR,
      authSource,
      requestId: req.requestId
    }, `Auth verified (${isSSR ? 'SSR' : 'API'}, source: ${authSource})`);

    // Step 2: Decode header to check algorithm (don't verify yet)
    let header;
    try {
      header = decodeProtectedHeader(token);
    } catch (e) {
      // Invalid JWT format - silently reject
      req.user = null;
      return next();
    }

    const alg = header.alg || 'unknown';
    
    // Step 3: Verify based on algorithm
    let payload;
    
    if (alg.startsWith('HS')) {
      /**
       * HS256 Verification (symmetric key)
       * 
       * WHAT: Verify token signature using shared secret (SUPABASE_JWT_SECRET)
       * WHY: Supabase projects use HS256 by default for simplicity
       * HOW: Use jose.jwtVerify with secret key and validate all claims
       */
      if (!config.jwt.secret) {
        // Missing secret - silently reject
        req.user = null;
        return next();
      }
      
      const secret = new TextEncoder().encode(config.jwt.secret);
      const result = await jwtVerify(token, secret, {
        algorithms: ['HS256'],  // Only accept HS256 for symmetric verification
        issuer: config.jwt.issuer,  // e.g., https://xxx.supabase.co/auth/v1
        audience: config.jwt.expectedAud,  // usually "authenticated"
        clockTolerance: config.jwt.clockSkewSec  // allow small time drift (default: 30s)
      });
      payload = result.payload;
      
    } else if (alg.startsWith('RS') || alg.startsWith('ES')) {
      /**
       * RS256/ES256 Verification (asymmetric key)
       * 
       * WHAT: Verify token signature using Supabase JWKS (public keys)
       * WHY: Production-grade, supports key rotation automatically
       * HOW: Use jose.jwtVerify with JWKS fetcher and validate all claims
       */
      const result = await jwtVerify(token, jwksFetcher(), {
        issuer: config.jwt.issuer,
        audience: config.jwt.expectedAud,
        clockTolerance: config.jwt.clockSkewSec
      });
      payload = result.payload;
      
    } else {
      // Unsupported algorithm - silently reject
      req.user = null;
      return next();
    }

    // Step 4: Attach verified user identity to request
    req.user = {
      id: payload.sub,  // Supabase user ID
      email: payload.email || null,
      role: payload.role || 'authenticated',
      app_metadata: payload.app_metadata || {},
      user_metadata: payload.user_metadata || {}
    };

    return next();
    
  } catch (error) {
    /**
     * Verification failed
     * 
     * WHAT: Token signature invalid, expired, or claims don't match
     * WHY: Could be tampered token, expired session, or wrong issuer/audience
     * HOW: Silently reject (don't log error details or tokens)
     */
    req.user = null;
    return next();
  }
};
