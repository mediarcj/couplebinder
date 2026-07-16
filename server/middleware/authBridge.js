// File: server/middleware/authBridge.js
// Description: Verifies Supabase JWT access tokens and attaches user identity to req.user
// Purpose: Stateless authentication using configured asymmetric JWT algorithms and Supabase JWKS
// Notes: Reads tokens from HttpOnly cookies or API Bearer headers and never logs token values

'use strict';

/**
 * WHAT:
 * Verify Supabase access tokens and identify the authenticated user.
 *
 * WHY:
 * Stateless authentication does not trust browser-provided identity data.
 * Every token must pass signature and claim verification before req.user
 * is populated.
 *
 * HOW:
 * 1. Read the access token from an HttpOnly cookie.
 * 2. For non-SSR/API requests, optionally accept Authorization: Bearer.
 * 3. Decode only the protected header to inspect the requested algorithm.
 * 4. Reject algorithms not allowed by config.jwt.allowedAlgorithms.
 * 5. Verify the signature through Supabase JWKS.
 * 6. Validate issuer, audience, expiration, not-before, and clock tolerance.
 * 7. Attach the verified identity to req.user.
 */

const {
  // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
  createRemoteJWKSet,
  // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
  jwtVerify,
  // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
  decodeProtectedHeader
// I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
} = require('jose');

// I am loading `../config` into `config` so this file can reuse that dependency below.
const { config } = require('../config');
// I am loading `../utils/logger` into `logger` so this file can reuse that dependency below.
const logger = require('../utils/logger');

// ──────────────────────────────────────────────────────────────────────────────
// JWT configuration
// ──────────────────────────────────────────────────────────────────────────────
const JWKS_URL = (
  // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
  config.jwt?.jwksUrl || ''
// I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
).trim();

// I am saving `EXPECTED_ISSUER` here so the nearby steps can reuse the same value without rebuilding it each time.
const EXPECTED_ISSUER = (
  // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
  config.jwt?.issuer || ''
// I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
).trim();

// I am saving `EXPECTED_AUDIENCE` here so the nearby steps can reuse the same value without rebuilding it each time.
const EXPECTED_AUDIENCE =
  // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
  config.jwt?.expectedAud ||
  // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
  'authenticated';

// I am saving `CLOCK_SKEW_SEC` here so the nearby steps can reuse the same value without rebuilding it each time.
const CLOCK_SKEW_SEC =
  // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
  config.jwt?.clockSkewSec ?? 60;

// I am saving `ALLOWED_ALGORITHMS` here so the nearby steps can reuse the same value without rebuilding it each time.
const ALLOWED_ALGORITHMS =
  // I am calling this helper here so the current workflow performs this step before it moves on.
  Array.isArray(config.jwt?.allowedAlgorithms)
    // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
    ? config.jwt.allowedAlgorithms
    // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
    : [];

// This check helps me choose or stop the next path before any work that depends on this condition runs.
if (!JWKS_URL) {
  // I am stopping this path with the existing error here because the caller should not continue with an invalid result.
  throw new Error(
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    'SUPABASE_JWKS_URL configuration is required by authBridge'
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  );
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// This check helps me choose or stop the next path before any work that depends on this condition runs.
if (!EXPECTED_ISSUER) {
  // I am stopping this path with the existing error here because the caller should not continue with an invalid result.
  throw new Error(
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    'SUPABASE_ISSUER configuration is required by authBridge'
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  );
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// This check helps me choose or stop the next path before any work that depends on this condition runs.
if (!ALLOWED_ALGORITHMS.length) {
  // I am stopping this path with the existing error here because the caller should not continue with an invalid result.
  throw new Error(
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    'At least one JWT algorithm must be configured for authBridge'
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  );
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// authBridge verifies tokens using the public JWKS endpoint.
// Symmetric HS algorithms cannot be verified through JWKS.
const unsupportedAlgorithms =
  // I am filtering the collection here so only items that pass the nearby check continue to the next step.
  ALLOWED_ALGORITHMS.filter(
    // I am defining this small callback here so the surrounding API can run it with the value it supplies.
    (algorithm) =>
      // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
      !['RS256', 'ES256'].includes(algorithm)
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  );

// This check helps me choose or stop the next path before any work that depends on this condition runs.
if (unsupportedAlgorithms.length) {
  // I am stopping this path with the existing error here because the caller should not continue with an invalid result.
  throw new Error(
    // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
    'authBridge received unsupported JWKS algorithms: ' +
      // I am calling this helper here so the current workflow performs this step before it moves on.
      unsupportedAlgorithms.join(', ')
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  );
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// ──────────────────────────────────────────────────────────────────────────────
// JWKS resolver
// ──────────────────────────────────────────────────────────────────────────────
// createRemoteJWKSet performs public-key lookup by JWT kid and caches keys.
// It can refresh automatically when Supabase rotates signing keys.
const JWKS = createRemoteJWKSet(
  // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
  new URL(JWKS_URL),
  // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
  {
    // I am keeping the `cooldownDuration` field in this object so the receiving code can read that value by its expected name.
    cooldownDuration: 600_000
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
);

// ──────────────────────────────────────────────────────────────────────────────
// Route classification
// ──────────────────────────────────────────────────────────────────────────────
/**
 * Determine whether a request must use cookie-only authentication.
 *
 * SSR routes must not silently authenticate through a Bearer header.
 * /api/auth/status is also cookie-only so it reports the browser's real
 * application-cookie state.
 */
function isCookieOnlyRequest(req) {
  // I am saving `path` here so the nearby steps can reuse the same value without rebuilding it each time.
  const path = req.path || '';
  // I am saving `acceptsHtml` here so the nearby steps can reuse the same value without rebuilding it each time.
  const acceptsHtml =
    // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
    req.headers.accept?.includes('text/html');

  // I am saving `isPageRoute` here so the nearby steps can reuse the same value without rebuilding it each time.
  const isPageRoute =
    // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
    !path.startsWith('/api/') &&
    // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
    !path.startsWith('/auth/') &&
    // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
    (
      // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
      acceptsHtml ||
      // I am calling this helper here so the current workflow performs this step before it moves on.
      path.startsWith('/dashboard') ||
      // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
      path === '/' ||
      // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
      path === '/login'
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    );

  // This return sends the completed value or response back to the code that called this function.
  return (
    // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
    isPageRoute ||
    // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
    path === '/api/auth/status'
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  );
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// ──────────────────────────────────────────────────────────────────────────────
// Token extraction
// ──────────────────────────────────────────────────────────────────────────────
/**
 * Read an access token without logging its contents.
 *
 * Priority:
 * 1. Current HttpOnly application cookie.
 * 2. Legacy cookies retained for migration compatibility.
 * 3. Bearer header for non-cookie-only requests.
 */
function readAccessToken(req, cookieOnly = false) {
  // I am saving this value here so the nearby steps can reuse the same value without rebuilding it each time.
  const {
    // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
    AUTH_COOKIE_NAME
  // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
  } = require('../lib/authCookie');

  // I am saving `cookieName` here so the nearby steps can reuse the same value without rebuilding it each time.
  const cookieName = AUTH_COOKIE_NAME;
  // I am saving `hostPrefixedName` here so the nearby steps can reuse the same value without rebuilding it each time.
  const hostPrefixedName =
    // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
    `__Host-${cookieName}`;

  // I am saving `hostPrefixedToken` here so the nearby steps can reuse the same value without rebuilding it each time.
  const hostPrefixedToken =
    // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
    req.cookies?.[hostPrefixedName];

  // I am saving `plainCookieToken` here so the nearby steps can reuse the same value without rebuilding it each time.
  const plainCookieToken =
    // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
    req.cookies?.[cookieName];

  // I am saving `legacyAccessToken` here so the nearby steps can reuse the same value without rebuilding it each time.
  const legacyAccessToken =
    // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
    req.cookies?.['sb-access-token'];

  // I am saving `legacySessionToken` here so the nearby steps can reuse the same value without rebuilding it each time.
  const legacySessionToken =
    // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
    req.cookies?.['sb_session'];

  // I am saving `legacyToken` here so the nearby steps can reuse the same value without rebuilding it each time.
  const legacyToken =
    // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
    legacyAccessToken ||
    // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
    legacySessionToken ||
    // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
    null;

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (legacyToken) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.info(
      // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
      {
        // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
        event: 'legacy.cookie_used',
        // I am keeping the `cookieName` field in this object so the receiving code can read that value by its expected name.
        cookieName: legacyAccessToken
          // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
          ? 'sb-access-token'
          // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
          : 'sb_session'
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      },
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      'Legacy auth cookie was accepted'
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    );
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am saving `cookieToken` here so the nearby steps can reuse the same value without rebuilding it each time.
  const cookieToken =
    // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
    hostPrefixedToken ||
    // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
    plainCookieToken ||
    // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
    legacyToken ||
    // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
    null;

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (config.auth.debug) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.debug(
      // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
      {
        // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
        event: 'auth.cookie.read.attempt',
        // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
        cookieOnly,
        // I am keeping the `hasHostPrefixed` field in this object so the receiving code can read that value by its expected name.
        hasHostPrefixed:
          // I am calling this helper here so the current workflow performs this step before it moves on.
          Boolean(hostPrefixedToken),
        // I am keeping the `hasPlain` field in this object so the receiving code can read that value by its expected name.
        hasPlain:
          // I am calling this helper here so the current workflow performs this step before it moves on.
          Boolean(plainCookieToken),
        // I am keeping the `hasLegacyAccessToken` field in this object so the receiving code can read that value by its expected name.
        hasLegacyAccessToken:
          // I am calling this helper here so the current workflow performs this step before it moves on.
          Boolean(legacyAccessToken),
        // I am keeping the `hasLegacySessionToken` field in this object so the receiving code can read that value by its expected name.
        hasLegacySessionToken:
          // I am calling this helper here so the current workflow performs this step before it moves on.
          Boolean(legacySessionToken),
        // I am keeping the `cookieNames` field in this object so the receiving code can read that value by its expected name.
        cookieNames:
          // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
          req.cookies
            // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
            ? Object.keys(req.cookies)
            // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
            : []
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      },
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      'Cookie read attempt'
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    );
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (cookieToken) {
    // This return sends the completed value or response back to the code that called this function.
    return {
      // I am keeping the `token` field in this object so the receiving code can read that value by its expected name.
      token: cookieToken,
      // I am keeping the `source` field in this object so the receiving code can read that value by its expected name.
      source: 'cookie'
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    };
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!cookieOnly) {
    // I am saving `authorizationHeader` here so the nearby steps can reuse the same value without rebuilding it each time.
    const authorizationHeader =
      // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
      req.headers.authorization || '';

    // I am saving `bearerMatch` here so the nearby steps can reuse the same value without rebuilding it each time.
    const bearerMatch =
      // I am calling this helper here so the current workflow performs this step before it moves on.
      authorizationHeader.match(
        // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
        /^Bearer\s+(.+)$/i
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      );

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (bearerMatch?.[1]) {
      // This return sends the completed value or response back to the code that called this function.
      return {
        // I am keeping the `token` field in this object so the receiving code can read that value by its expected name.
        token: bearerMatch[1].trim(),
        // I am keeping the `source` field in this object so the receiving code can read that value by its expected name.
        source: 'bearer'
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      };
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // This return sends the completed value or response back to the code that called this function.
  return {
    // I am keeping the `token` field in this object so the receiving code can read that value by its expected name.
    token: null,
    // I am keeping the `source` field in this object so the receiving code can read that value by its expected name.
    source: 'none'
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  };
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// ──────────────────────────────────────────────────────────────────────────────
// Rejection helper
// ──────────────────────────────────────────────────────────────────────────────
function continueUnauthenticated(
  // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
  req,
  // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
  next,
  // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
  reason,
  // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
  metadata = {}
// I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
) {
  // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
  req.user = null;

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (config.auth.debug) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.debug(
      // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
      {
        // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
        event: 'auth.bridge.rejected',
        // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
        reason,
        // I am keeping the `path` field in this object so the receiving code can read that value by its expected name.
        path: req.originalUrl,
        // I am keeping the `requestId` field in this object so the receiving code can read that value by its expected name.
        requestId: req.requestId,
        // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
        ...metadata
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      },
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      'Authentication token was not accepted'
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    );
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // This return sends the completed value or response back to the code that called this function.
  return next();
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// ──────────────────────────────────────────────────────────────────────────────
// Main middleware
// ──────────────────────────────────────────────────────────────────────────────
module.exports = async function authBridge(
  // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
  req,
  // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
  res,
  // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
  next
// I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
) {
  // I am saving `cookieOnly` here so the nearby steps can reuse the same value without rebuilding it each time.
  const cookieOnly =
    // I am calling this helper here so the current workflow performs this step before it moves on.
    isCookieOnlyRequest(req);

  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // I am saving this value here so the nearby steps can reuse the same value without rebuilding it each time.
    const {
      // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
      AUTH_COOKIE_NAME
    // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
    } = require('../lib/authCookie');

    // I am saving `cookieName` here so the nearby steps can reuse the same value without rebuilding it each time.
    const cookieName =
      // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
      AUTH_COOKIE_NAME;

    // I am saving `hostPrefixedName` here so the nearby steps can reuse the same value without rebuilding it each time.
    const hostPrefixedName =
      // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
      `__Host-${cookieName}`;

    // I am saving `hasBearer` here so the nearby steps can reuse the same value without rebuilding it each time.
    const hasBearer =
      // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
      /^Bearer\s+/.test(
        // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
        req.headers.authorization || ''
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      );

    // I am saving `hasCurrentCookie` here so the nearby steps can reuse the same value without rebuilding it each time.
    const hasCurrentCookie =
      // I am calling this helper here so the current workflow performs this step before it moves on.
      Boolean(
        // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
        req.cookies?.[hostPrefixedName] ||
        // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
        req.cookies?.[cookieName]
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      );

    // I am saving `hasLegacyCookie` here so the nearby steps can reuse the same value without rebuilding it each time.
    const hasLegacyCookie =
      // I am calling this helper here so the current workflow performs this step before it moves on.
      Boolean(
        // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
        req.cookies?.['sb-access-token'] ||
        // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
        req.cookies?.['sb_session']
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      );

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (config.auth.debug) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      logger.debug(
        // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
        {
          // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
          event: 'auth.debug',
          // I am keeping the `method` field in this object so the receiving code can read that value by its expected name.
          method: req.method,
          // I am keeping the `path` field in this object so the receiving code can read that value by its expected name.
          path: req.originalUrl,
          // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
          cookieOnly,
          // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
          hasBearer,
          // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
          hasCurrentCookie,
          // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
          hasLegacyCookie,
          // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
          cookieName,
          // I am keeping the `authSource` field in this object so the receiving code can read that value by its expected name.
          authSource:
            // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
            hasCurrentCookie ||
            // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
            hasLegacyCookie
              // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
              ? 'cookie'
              // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
              : hasBearer
                // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
                ? 'bearer'
                // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
                : 'none'
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        },
        // I am listing this entry here because the surrounding collection processes each allowed value in order.
        'Auth bridge debug information'
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      );
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // Step 1: Read token.
    const {
      // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
      token,
      // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
      source
    // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
    } = readAccessToken(
      // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
      req,
      // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
      cookieOnly
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    );

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!token) {
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (
        // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
        cookieOnly &&
        // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
        config.auth.debug
      // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
      ) {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        logger.debug(
          // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
          {
            // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
            event: 'auth.ssr.no_token',
            // I am keeping the `path` field in this object so the receiving code can read that value by its expected name.
            path: req.path,
            // I am keeping the `requestId` field in this object so the receiving code can read that value by its expected name.
            requestId: req.requestId,
            // I am keeping the `authSource` field in this object so the receiving code can read that value by its expected name.
            authSource: 'none',
            // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
            cookieName,
            // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
            hostPrefixedName,
            // I am keeping the `hasHostPrefixed` field in this object so the receiving code can read that value by its expected name.
            hasHostPrefixed:
              // I am calling this helper here so the current workflow performs this step before it moves on.
              Boolean(
                // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
                req.cookies?.[
                  // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
                  hostPrefixedName
                // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
                ]
              // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
              ),
            // I am keeping the `hasPlain` field in this object so the receiving code can read that value by its expected name.
            hasPlain:
              // I am calling this helper here so the current workflow performs this step before it moves on.
              Boolean(
                // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
                req.cookies?.[cookieName]
              // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
              ),
            // I am keeping the `hasLegacyAccessToken` field in this object so the receiving code can read that value by its expected name.
            hasLegacyAccessToken:
              // I am calling this helper here so the current workflow performs this step before it moves on.
              Boolean(
                // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
                req.cookies?.[
                  // I am listing this entry here because the surrounding collection processes each allowed value in order.
                  'sb-access-token'
                // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
                ]
              // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
              ),
            // I am keeping the `hasLegacySessionToken` field in this object so the receiving code can read that value by its expected name.
            hasLegacySessionToken:
              // I am calling this helper here so the current workflow performs this step before it moves on.
              Boolean(
                // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
                req.cookies?.[
                  // I am listing this entry here because the surrounding collection processes each allowed value in order.
                  'sb_session'
                // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
                ]
              // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
              ),
            // I am keeping the `cookieNames` field in this object so the receiving code can read that value by its expected name.
            cookieNames:
              // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
              req.cookies
                // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
                ? Object.keys(
                    // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
                    req.cookies
                  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
                  )
                // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
                : [],
            // I am keeping the `cookieCount` field in this object so the receiving code can read that value by its expected name.
            cookieCount:
              // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
              req.cookies
                // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
                ? Object.keys(
                    // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
                    req.cookies
                  // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
                  ).length
                // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
                : 0
          // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
          },
          // I am listing this entry here because the surrounding collection processes each allowed value in order.
          'Cookie-only route has no authentication cookie'
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        );
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }

      // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
      req.user = null;
      // This return sends the completed value or response back to the code that called this function.
      return next();
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // Step 2: Decode only the protected header so we can enforce the
    // configured algorithm allowlist before attempting verification.
    let protectedHeader;

    // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
    try {
      // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
      protectedHeader =
        // I am calling this helper here so the current workflow performs this step before it moves on.
        decodeProtectedHeader(token);
    // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
    } catch {
      // This return sends the completed value or response back to the code that called this function.
      return continueUnauthenticated(
        // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
        req,
        // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
        next,
        // I am listing this entry here because the surrounding collection processes each allowed value in order.
        'invalid_jwt_header',
        // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
        {
          // I am keeping the `authSource` field in this object so the receiving code can read that value by its expected name.
          authSource: source,
          // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
          cookieOnly
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      );
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // I am saving `algorithm` here so the nearby steps can reuse the same value without rebuilding it each time.
    const algorithm =
      // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
      protectedHeader.alg || '';

    // Step 3: Centralized algorithm enforcement.
    //
    // The config module is the source of truth. A token using an algorithm
    // outside JWT_ALLOWED_ALGS is rejected before key lookup.
    if (
      // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
      !ALLOWED_ALGORITHMS.includes(
        // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
        algorithm
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      )
    // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
    ) {
      // This return sends the completed value or response back to the code that called this function.
      return continueUnauthenticated(
        // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
        req,
        // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
        next,
        // I am listing this entry here because the surrounding collection processes each allowed value in order.
        'algorithm_not_allowed',
        // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
        {
          // I am keeping the `algorithm` field in this object so the receiving code can read that value by its expected name.
          algorithm:
            // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
            algorithm || 'missing',
          // I am keeping the `authSource` field in this object so the receiving code can read that value by its expected name.
          authSource: source,
          // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
          cookieOnly
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      );
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
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
      // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
      payload
    // I am waiting for this asynchronous step here so the next line does not use its result before it is ready.
    } = await jwtVerify(
      // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
      token,
      // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
      JWKS,
      // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
      {
        // I am keeping the `algorithms` field in this object so the receiving code can read that value by its expected name.
        algorithms:
          // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
          ALLOWED_ALGORITHMS,
        // I am keeping the `issuer` field in this object so the receiving code can read that value by its expected name.
        issuer:
          // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
          EXPECTED_ISSUER,
        // I am keeping the `audience` field in this object so the receiving code can read that value by its expected name.
        audience:
          // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
          EXPECTED_AUDIENCE,
        // I am keeping the `clockTolerance` field in this object so the receiving code can read that value by its expected name.
        clockTolerance:
          // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
          CLOCK_SKEW_SEC
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    );

    // Supabase user JWTs must contain sub.
    if (!payload?.sub) {
      // This return sends the completed value or response back to the code that called this function.
      return continueUnauthenticated(
        // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
        req,
        // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
        next,
        // I am listing this entry here because the surrounding collection processes each allowed value in order.
        'missing_sub',
        // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
        {
          // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
          algorithm,
          // I am keeping the `authSource` field in this object so the receiving code can read that value by its expected name.
          authSource: source,
          // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
          cookieOnly
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      );
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // Step 5: Attach only verified identity claims.
    req.user = {
      // I am keeping the `id` field in this object so the receiving code can read that value by its expected name.
      id: payload.sub,
      // I am keeping the `email` field in this object so the receiving code can read that value by its expected name.
      email:
        // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
        payload.email || null,
      // I am keeping the `role` field in this object so the receiving code can read that value by its expected name.
      role:
        // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
        payload.role ||
        // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
        payload.user_role ||
        // I am listing this entry here because the surrounding collection processes each allowed value in order.
        'authenticated',
      // I am keeping the `app_metadata` field in this object so the receiving code can read that value by its expected name.
      app_metadata:
        // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
        payload.app_metadata || {},
      // I am keeping the `user_metadata` field in this object so the receiving code can read that value by its expected name.
      user_metadata:
        // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
        payload.user_metadata || {}
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    };

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (config.auth.debug) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      logger.debug(
        // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
        {
          // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
          event: 'auth.verified',
          // I am keeping the `path` field in this object so the receiving code can read that value by its expected name.
          path: req.path,
          // I am keeping the `requestId` field in this object so the receiving code can read that value by its expected name.
          requestId: req.requestId,
          // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
          cookieOnly,
          // I am keeping the `authSource` field in this object so the receiving code can read that value by its expected name.
          authSource: source,
          // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
          algorithm
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        },
        // I am listing this entry here because the surrounding collection processes each allowed value in order.
        `Authentication verified (${cookieOnly ? 'cookie-only' : 'API-capable'}, source: ${source})`
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      );
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // This return sends the completed value or response back to the code that called this function.
    return next();
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (error) {
    // Verification failures are treated as unauthenticated requests.
    //
    // requireAuth remains responsible for deciding whether the current
    // route permits anonymous access or returns a redirect/401 response.
    const reason =
      // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
      error?.code ||
      // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
      error?.message ||
      // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
      'verification_failed';

    // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
    req.user = null;

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (config.auth.debug) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      logger.debug(
        // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
        {
          // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
          event:
            // I am listing this entry here because the surrounding collection processes each allowed value in order.
            'auth.bridge.verification_failed',
          // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
          reason,
          // I am keeping the `name` field in this object so the receiving code can read that value by its expected name.
          name: error?.name,
          // I am keeping the `code` field in this object so the receiving code can read that value by its expected name.
          code: error?.code,
          // I am keeping the `claim` field in this object so the receiving code can read that value by its expected name.
          claim: error?.claim,
          // I am keeping the `path` field in this object so the receiving code can read that value by its expected name.
          path: req.originalUrl,
          // I am keeping the `requestId` field in this object so the receiving code can read that value by its expected name.
          requestId: req.requestId,
          // I am keeping this line here because the surrounding authBridge.js workflow expects this value or operation before it continues.
          cookieOnly
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        },
        // I am listing this entry here because the surrounding collection processes each allowed value in order.
        'JWT verification failed'
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      );
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // This return sends the completed value or response back to the code that called this function.
    return next();
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
};