/**
 * Description: Verify Supabase JWTs through JWKS.
 * Notes: Validates signature, issuer, audience, time claims, and subject.
 *
 * Validate Supabase Auth access tokens on the server.
 *
 * The browser is not trusted. Protected routes must verify the
 * token signature and claims before trusting the user's identity.
 *
 * 1. Resolve the project's JWKS endpoint.
 * 2. Fetch and cache public signing keys.
 * 3. Restrict verification to config.jwt.allowedAlgorithms.
 * 4. Validate issuer, audience, expiration, not-before, and subject.
 * 5. Attach the verified identity to req.user.
 */

'use strict';

const {
  createRemoteJWKSet,
  jwtVerify
} = require('jose');

const { audit } = require('../../lib/audit');
const logger = require('../../utils/logger');
const { config } = require('../../config');

// STEP 1: Read and validate configuration
const SUPABASE_URL = (
  config.supabase?.url || ''
).replace(/\/+$/, '');

if (!SUPABASE_URL) {
  throw new Error(
    'SUPABASE_URL configuration is required'
  );
}

const JWKS_URL =
  (
    config.jwt?.jwksUrl || ''
  ).trim() ||
  `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`;

const EXPECTED_ISSUER = (
  config.jwt?.issuer || ''
).trim();

if (!EXPECTED_ISSUER) {
  throw new Error(
    'SUPABASE_ISSUER configuration is required'
  );
}

const EXPECTED_AUDIENCE =
  config.jwt?.expectedAud ||
  'authenticated';

const CLOCK_SKEW_SEC =
  config.jwt?.clockSkewSec ?? 60;

const ALLOWED_ALGORITHMS =
  Array.isArray(
    config.jwt?.allowedAlgorithms
  )
    ? config.jwt.allowedAlgorithms
    : [];

if (!ALLOWED_ALGORITHMS.length) {
  throw new Error(
    'At least one JWT verification algorithm must be configured'
  );
}

// This middleware verifies tokens through a public JWKS endpoint.
// Symmetric algorithms such as HS256 cannot be verified through JWKS.
const invalidAlgorithms =
  ALLOWED_ALGORITHMS.filter(
    (algorithm) =>
      !['RS256', 'ES256'].includes(
        algorithm
      )
  );

if (invalidAlgorithms.length) {
  throw new Error(
    'Unsupported JWKS algorithms configured: ' +
      invalidAlgorithms.join(', ')
  );
}

// The anon key is not required to read the standard public JWKS endpoint.
// Keep this warning because other Supabase client operations may still need it.
const SUPABASE_ANON_KEY =
  config.supabase?.anonKey || '';

if (!SUPABASE_ANON_KEY) {
  logger.warn(
    {
      event: 'auth.config.anon_key_missing',
      warning:
        'Supabase client operations may fail even though JWKS verification can still work'
    },
    'SUPABASE_ANON_KEY missing'
  );
}

// STEP 2: Create remote JWKS resolver
const JWKS = createRemoteJWKSet(
  new URL(JWKS_URL),
  {
    cooldownDuration: 600_000
  }
);

// STEP 3: Read token from request
function readToken(req) {
  // API clients use the Authorization header first.
  const authorizationHeader =
    req.headers.authorization || '';

  const bearerMatch =
    authorizationHeader.match(
      /^Bearer\s+(.+)$/i
    );

  if (bearerMatch?.[1]) {
    return bearerMatch[1].trim();
  }

  // Browser fallback: application HttpOnly cookie.
  const cookieName =
    config.auth?.cookieName ||
    'sb_session';

  const hostCookieName =
    `__Host-${cookieName}`;

  return (
    req.cookies?.[hostCookieName] ||
    req.cookies?.[cookieName] ||
    req.cookies?.['sb-access-token'] ||
    req.cookies?.['sb_session'] ||
    null
  );
}

// STEP 4: Verify token
async function verifyToken(token) {
  if (!token) {
    const error = new Error(
      'missing_token'
    );

    error.code = 'missing_token';
    throw error;
  }

  try {
    const { payload } = await jwtVerify(
      token,
      JWKS,
      {
        algorithms: ALLOWED_ALGORITHMS,
        issuer: EXPECTED_ISSUER,
        audience: EXPECTED_AUDIENCE,
        clockTolerance: CLOCK_SKEW_SEC
      }
    );

    if (!payload?.sub) {
      const error = new Error(
        'missing_sub'
      );

      error.code = 'missing_sub';
      throw error;
    }

    return payload;
  } catch (error) {
    const reason =
      error?.code ||
      error?.message ||
      'verify_failed';

    const metadata = {
      name: error?.name,
      code: error?.code,
      claim: error?.claim,
      iss: error?.payload?.iss,
      aud: error?.payload?.aud
    };

    logger.warn(
      {
        event:
          'auth.jwt_verification.failed',
        reason,
        ...metadata
      },
      'JWT verification failed'
    );

    audit(
      'auth.verify.fail',
      {
        reason,
        claim: error?.claim
      },
      null
    );

    const clientError = new Error(
      'invalid_token'
    );

    clientError.code = reason;
    clientError.cause = error;

    throw clientError;
  }
}

// STEP 5: Express middleware
function authRequired(req, res, next) {
  const token = readToken(req);

  if (!token) {
    return res.status(401).json({
      error: 'missing token'
    });
  }

  verifyToken(token)
    .then((payload) => {
      req.user = {
        id: payload.sub,
        email: payload.email || null,
        role:
          payload.role ||
          payload.user_role ||
          'user',
        app_metadata:
          payload.app_metadata || {},
        user_metadata:
          payload.user_metadata || {}
      };

      return next();
    })
    .catch(() =>
      res.status(401).json({
        error: 'invalid token'
      })
    );
}

module.exports = {
  authRequired,
  verifyToken
};