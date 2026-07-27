// Description: Verifies Supabase JWT access tokens and attaches user identity to req.user
// Purpose: Stateless authentication using configured asymmetric JWT algorithms and Supabase JWKS
// Notes: Reads tokens from HttpOnly cookies or API Bearer headers and never logs token values

'use strict';

/**
 * Verify Supabase access tokens and identify the authenticated user.
 *
 * Stateless authentication does not trust browser-provided identity data.
 * Every token must pass signature and claim verification before req.user
 * is populated.
 *
 * 1. Read the access token from an HttpOnly cookie.
 * 2. For non-SSR/API requests, optionally accept Authorization: Bearer.
 * 3. Decode only the protected header to inspect the requested algorithm.
 * 4. Reject algorithms not allowed by config.jwt.allowedAlgorithms.
 * 5. Verify the signature through Supabase JWKS.
 * 6. Validate issuer, audience, expiration, not-before, and clock tolerance.
 * 7. Attach the verified identity to req.user.
 */

const {
  createRemoteJWKSet,
  jwtVerify,
  decodeProtectedHeader
} = require('jose');

const { config } = require('../config');
const logger = require('../utils/logger');
const { timeAsync } = require('./requestTiming');
const { setVerifiedAuth } = require('../lib/verifiedAuth');

// JWT configuration
const JWKS_URL = (
  config.jwt?.jwksUrl || ''
).trim();

const EXPECTED_ISSUER = (
  config.jwt?.issuer || ''
).trim();

const EXPECTED_AUDIENCE =
  config.jwt?.expectedAud ||
  'authenticated';

const CLOCK_SKEW_SEC =
  config.jwt?.clockSkewSec ?? 60;

const ALLOWED_ALGORITHMS =
  Array.isArray(config.jwt?.allowedAlgorithms)
    ? config.jwt.allowedAlgorithms
    : [];

if (!JWKS_URL) {
  throw new Error(
    'SUPABASE_JWKS_URL configuration is required by authBridge'
  );
}

if (!EXPECTED_ISSUER) {
  throw new Error(
    'SUPABASE_ISSUER configuration is required by authBridge'
  );
}

if (!ALLOWED_ALGORITHMS.length) {
  throw new Error(
    'At least one JWT algorithm must be configured for authBridge'
  );
}

// authBridge verifies tokens using the public JWKS endpoint.
// Symmetric HS algorithms cannot be verified through JWKS.
const unsupportedAlgorithms =
  ALLOWED_ALGORITHMS.filter(
    (algorithm) =>
      !['RS256', 'ES256'].includes(algorithm)
  );

if (unsupportedAlgorithms.length) {
  throw new Error(
    'authBridge received unsupported JWKS algorithms: ' +
      unsupportedAlgorithms.join(', ')
  );
}

// JWKS resolver
// createRemoteJWKSet performs public-key lookup by JWT kid and caches keys.
// It can refresh automatically when Supabase rotates signing keys.
const JWKS = createRemoteJWKSet(
  new URL(JWKS_URL),
  {
    cooldownDuration: 600_000,
    timeoutDuration: 3_000
  }
);

// Route classification
/**
 * Determine whether a request must use cookie-only authentication.
 *
 * SSR routes must not silently authenticate through a Bearer header.
 * /api/auth/status is also cookie-only so it reports the browser's real
 * application-cookie state.
 */
function isCookieOnlyRequest(req) {
  const path = req.path || '';
  const acceptsHtml =
    req.headers.accept?.includes('text/html');

  const isPageRoute =
    !path.startsWith('/api/') &&
    !path.startsWith('/auth/') &&
    (
      acceptsHtml ||
      path.startsWith('/dashboard') ||
      path === '/' ||
      path === '/login'
    );

  return (
    isPageRoute ||
    path === '/api/auth/status'
  );
}

// Token extraction
/**
 * Read an access token without logging its contents.
 *
 * Priority:
 * 1. Current HttpOnly application cookie.
 * 2. Legacy cookies retained for migration compatibility.
 * 3. Bearer header for non-cookie-only requests.
 */
function readAccessToken(req, cookieOnly = false) {
  const {
    AUTH_COOKIE_NAME
  } = require('../lib/authCookie');

  const cookieName = AUTH_COOKIE_NAME;
  const hostPrefixedName =
    `__Host-${cookieName}`;

  const hostPrefixedToken =
    req.cookies?.[hostPrefixedName];

  const plainCookieToken =
    req.cookies?.[cookieName];

  const legacyAccessToken =
    req.cookies?.['sb-access-token'];

  const legacySessionToken =
    req.cookies?.['sb_session'];

  const legacyToken =
    legacyAccessToken ||
    legacySessionToken ||
    null;

  if (legacyToken) {
    logger.info(
      {
        event: 'legacy.cookie_used',
        cookieName: legacyAccessToken
          ? 'sb-access-token'
          : 'sb_session'
      },
      'Legacy auth cookie was accepted'
    );
  }

  const cookieToken =
    hostPrefixedToken ||
    plainCookieToken ||
    legacyToken ||
    null;

  if (config.auth.debug) {
    logger.debug(
      {
        event: 'auth.cookie.read.attempt',
        cookieOnly,
        hasHostPrefixed:
          Boolean(hostPrefixedToken),
        hasPlain:
          Boolean(plainCookieToken),
        hasLegacyAccessToken:
          Boolean(legacyAccessToken),
        hasLegacySessionToken:
          Boolean(legacySessionToken),
        cookieNames:
          req.cookies
            ? Object.keys(req.cookies)
            : []
      },
      'Cookie read attempt'
    );
  }

  if (cookieToken) {
    return {
      token: cookieToken,
      source: 'cookie'
    };
  }

  if (!cookieOnly) {
    const authorizationHeader =
      req.headers.authorization || '';

    const bearerMatch =
      authorizationHeader.match(
        /^Bearer\s+(.+)$/i
      );

    if (bearerMatch?.[1]) {
      return {
        token: bearerMatch[1].trim(),
        source: 'bearer'
      };
    }
  }

  return {
    token: null,
    source: 'none'
  };
}

// Rejection helper
function continueUnauthenticated(
  req,
  next,
  reason,
  metadata = {}
) {
  req.user = null;

  if (config.auth.debug) {
    logger.debug(
      {
        event: 'auth.bridge.rejected',
        reason,
        path: req.originalUrl,
        requestId: req.requestId,
        ...metadata
      },
      'Authentication token was not accepted'
    );
  }

  return next();
}

// Main middleware
module.exports = async function authBridge(
  req,
  res,
  next
) {
  const cookieOnly =
    isCookieOnlyRequest(req);

  try {
    const {
      AUTH_COOKIE_NAME
    } = require('../lib/authCookie');

    const cookieName =
      AUTH_COOKIE_NAME;

    const hostPrefixedName =
      `__Host-${cookieName}`;

    const hasBearer =
      /^Bearer\s+/.test(
        req.headers.authorization || ''
      );

    const hasCurrentCookie =
      Boolean(
        req.cookies?.[hostPrefixedName] ||
        req.cookies?.[cookieName]
      );

    const hasLegacyCookie =
      Boolean(
        req.cookies?.['sb-access-token'] ||
        req.cookies?.['sb_session']
      );

    if (config.auth.debug) {
      logger.debug(
        {
          event: 'auth.debug',
          method: req.method,
          path: req.originalUrl,
          cookieOnly,
          hasBearer,
          hasCurrentCookie,
          hasLegacyCookie,
          cookieName,
          authSource:
            hasCurrentCookie ||
            hasLegacyCookie
              ? 'cookie'
              : hasBearer
                ? 'bearer'
                : 'none'
        },
        'Auth bridge debug information'
      );
    }

    // Step 1: Read token.
    const {
      token,
      source
    } = readAccessToken(
      req,
      cookieOnly
    );

    if (!token) {
      if (
        cookieOnly &&
        config.auth.debug
      ) {
        logger.debug(
          {
            event: 'auth.ssr.no_token',
            path: req.path,
            requestId: req.requestId,
            authSource: 'none',
            cookieName,
            hostPrefixedName,
            hasHostPrefixed:
              Boolean(
                req.cookies?.[
                  hostPrefixedName
                ]
              ),
            hasPlain:
              Boolean(
                req.cookies?.[cookieName]
              ),
            hasLegacyAccessToken:
              Boolean(
                req.cookies?.[
                  'sb-access-token'
                ]
              ),
            hasLegacySessionToken:
              Boolean(
                req.cookies?.[
                  'sb_session'
                ]
              ),
            cookieNames:
              req.cookies
                ? Object.keys(
                    req.cookies
                  )
                : [],
            cookieCount:
              req.cookies
                ? Object.keys(
                    req.cookies
                  ).length
                : 0
          },
          'Cookie-only route has no authentication cookie'
        );
      }

      req.user = null;
      return next();
    }

    // Step 2: Decode only the protected header so we can enforce the
    // configured algorithm allowlist before attempting verification.
    let protectedHeader;

    try {
      protectedHeader =
        decodeProtectedHeader(token);
    } catch {
      return continueUnauthenticated(
        req,
        next,
        'invalid_jwt_header',
        {
          authSource: source,
          cookieOnly
        }
      );
    }

    const algorithm =
      protectedHeader.alg || '';

    // Step 3: Centralized algorithm enforcement.
    //
    // The config module is the source of truth. A token using an algorithm
    // outside JWT_ALLOWED_ALGS is rejected before key lookup.
    if (
      !ALLOWED_ALGORITHMS.includes(
        algorithm
      )
    ) {
      return continueUnauthenticated(
        req,
        next,
        'algorithm_not_allowed',
        {
          algorithm:
            algorithm || 'missing',
          authSource: source,
          cookieOnly
        }
      );
    }

    // Step 4: Verify the token through Supabase JWKS.
    //
    // jose validates:
    // - Cryptographic signature
    // - Allowed algorithm
    // - Issuer
    // - Audience
    // - exp
    // - nbf
    // - Clock tolerance
    const {
      payload
    } = await timeAsync(
      req,
      'jwt',
      () => jwtVerify(
        token,
        JWKS,
        {
          algorithms:
            ALLOWED_ALGORITHMS,
          issuer:
            EXPECTED_ISSUER,
          audience:
            EXPECTED_AUDIENCE,
          clockTolerance:
            CLOCK_SKEW_SEC
        }
      )
    );

    // Supabase user JWTs must contain sub.
    if (!payload?.sub) {
      return continueUnauthenticated(
        req,
        next,
        'missing_sub',
        {
          algorithm,
          authSource: source,
          cookieOnly
        }
      );
    }

    // Step 5: Attach only verified identity claims.
    const trustedRoles = Array.from(new Set(
      [
        ...(Array.isArray(payload.app_metadata?.roles) ? payload.app_metadata.roles : []),
        payload.app_metadata?.role,
        payload.user_role,
      ]
        .filter(Boolean)
        .map((role) => String(role).toLowerCase())
    ));

    req.user = {
      id: payload.sub,
      email:
        payload.email || null,
      role:
        payload.role ||
        payload.user_role ||
        'authenticated',
      app_metadata:
        payload.app_metadata || {},
      user_metadata:
        payload.user_metadata || {},
      roles: trustedRoles
    };
    setVerifiedAuth(req, { token, payload, source });

    if (config.auth.debug) {
      logger.debug(
        {
          event: 'auth.verified',
          path: req.path,
          requestId: req.requestId,
          cookieOnly,
          authSource: source,
          algorithm
        },
        `Authentication verified (${cookieOnly ? 'cookie-only' : 'API-capable'}, source: ${source})`
      );
    }

    return next();
  } catch (error) {
    // Verification failures are treated as unauthenticated requests.
    //
    // requireAuth remains responsible for deciding whether the current
    // route permits anonymous access or returns a redirect/401 response.
    const reason =
      error?.code ||
      error?.message ||
      'verification_failed';

    req.user = null;

    if (config.auth.debug) {
      logger.debug(
        {
          event:
            'auth.bridge.verification_failed',
          reason,
          name: error?.name,
          code: error?.code,
          claim: error?.claim,
          path: req.originalUrl,
          requestId: req.requestId,
          cookieOnly
        },
        'JWT verification failed'
      );
    }

    return next();
  }
};
