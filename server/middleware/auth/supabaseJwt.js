/**
 * File: server/middleware/auth/supabaseJwt.js
 * Description: Verify Supabase JWTs through JWKS.
 * Notes: Validates signature, issuer, audience, time claims, and subject.
 *
 * ============================================================
 * WHAT
 * Validate Supabase Auth access tokens on the server.
 *
 * WHY
 * The browser is not trusted. Protected routes must verify the
 * token signature and claims before trusting the user's identity.
 *
 * HOW
 * 1. Resolve the project's JWKS endpoint.
 * 2. Fetch and cache public signing keys.
 * 3. Restrict verification to config.jwt.allowedAlgorithms.
 * 4. Validate issuer, audience, expiration, not-before, and subject.
 * 5. Attach the verified identity to req.user.
 * ============================================================
 */

'use strict';

// I am saving this value here so the nearby steps can reuse the same value without rebuilding it each time.
const {
  // I am keeping this line here because the surrounding supabaseJwt.js workflow expects this value or operation before it continues.
  createRemoteJWKSet,
  // I am keeping this line here because the surrounding supabaseJwt.js workflow expects this value or operation before it continues.
  jwtVerify
// I am keeping this line here because the surrounding supabaseJwt.js workflow expects this value or operation before it continues.
} = require('jose');

// I am loading `../../lib/audit` into `audit` so this file can reuse that dependency below.
const { audit } = require('../../lib/audit');
// I am loading `../../utils/logger` into `logger` so this file can reuse that dependency below.
const logger = require('../../utils/logger');
// I am loading `../../config` into `config` so this file can reuse that dependency below.
const { config } = require('../../config');

// ============================================================
// STEP 1: Read and validate configuration
// ============================================================
const SUPABASE_URL = (
  // I am keeping this line here because the surrounding supabaseJwt.js workflow expects this value or operation before it continues.
  config.supabase?.url || ''
// I am keeping this line here because the surrounding supabaseJwt.js workflow expects this value or operation before it continues.
).replace(/\/+$/, '');

// This check helps me choose or stop the next path before any work that depends on this condition runs.
if (!SUPABASE_URL) {
  // I am stopping this path with the existing error here because the caller should not continue with an invalid result.
  throw new Error(
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    'SUPABASE_URL configuration is required'
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  );
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am saving `JWKS_URL` here so the nearby steps can reuse the same value without rebuilding it each time.
const JWKS_URL =
  // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
  (
    // I am keeping this line here because the surrounding supabaseJwt.js workflow expects this value or operation before it continues.
    config.jwt?.jwksUrl || ''
  // I am keeping this line here because the surrounding supabaseJwt.js workflow expects this value or operation before it continues.
  ).trim() ||
  // I am keeping this line here because the surrounding supabaseJwt.js workflow expects this value or operation before it continues.
  `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`;

// I am saving `EXPECTED_ISSUER` here so the nearby steps can reuse the same value without rebuilding it each time.
const EXPECTED_ISSUER = (
  // I am keeping this line here because the surrounding supabaseJwt.js workflow expects this value or operation before it continues.
  config.jwt?.issuer || ''
// I am keeping this line here because the surrounding supabaseJwt.js workflow expects this value or operation before it continues.
).trim();

// This check helps me choose or stop the next path before any work that depends on this condition runs.
if (!EXPECTED_ISSUER) {
  // I am stopping this path with the existing error here because the caller should not continue with an invalid result.
  throw new Error(
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    'SUPABASE_ISSUER configuration is required'
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  );
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am saving `EXPECTED_AUDIENCE` here so the nearby steps can reuse the same value without rebuilding it each time.
const EXPECTED_AUDIENCE =
  // I am keeping this line here because the surrounding supabaseJwt.js workflow expects this value or operation before it continues.
  config.jwt?.expectedAud ||
  // I am keeping this line here because the surrounding supabaseJwt.js workflow expects this value or operation before it continues.
  'authenticated';

// I am saving `CLOCK_SKEW_SEC` here so the nearby steps can reuse the same value without rebuilding it each time.
const CLOCK_SKEW_SEC =
  // I am keeping this line here because the surrounding supabaseJwt.js workflow expects this value or operation before it continues.
  config.jwt?.clockSkewSec ?? 60;

// I am saving `ALLOWED_ALGORITHMS` here so the nearby steps can reuse the same value without rebuilding it each time.
const ALLOWED_ALGORITHMS =
  // I am calling this helper here so the current workflow performs this step before it moves on.
  Array.isArray(
    // I am keeping this line here because the surrounding supabaseJwt.js workflow expects this value or operation before it continues.
    config.jwt?.allowedAlgorithms
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  )
    // I am keeping this line here because the surrounding supabaseJwt.js workflow expects this value or operation before it continues.
    ? config.jwt.allowedAlgorithms
    // I am keeping this line here because the surrounding supabaseJwt.js workflow expects this value or operation before it continues.
    : [];

// This check helps me choose or stop the next path before any work that depends on this condition runs.
if (!ALLOWED_ALGORITHMS.length) {
  // I am stopping this path with the existing error here because the caller should not continue with an invalid result.
  throw new Error(
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    'At least one JWT verification algorithm must be configured'
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  );
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// This middleware verifies tokens through a public JWKS endpoint.
// Symmetric algorithms such as HS256 cannot be verified through JWKS.
const invalidAlgorithms =
  // I am filtering the collection here so only items that pass the nearby check continue to the next step.
  ALLOWED_ALGORITHMS.filter(
    // I am defining this small callback here so the surrounding API can run it with the value it supplies.
    (algorithm) =>
      // I am keeping this line here because the surrounding supabaseJwt.js workflow expects this value or operation before it continues.
      !['RS256', 'ES256'].includes(
        // I am keeping this line here because the surrounding supabaseJwt.js workflow expects this value or operation before it continues.
        algorithm
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      )
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  );

// This check helps me choose or stop the next path before any work that depends on this condition runs.
if (invalidAlgorithms.length) {
  // I am stopping this path with the existing error here because the caller should not continue with an invalid result.
  throw new Error(
    // I am keeping this line here because the surrounding supabaseJwt.js workflow expects this value or operation before it continues.
    'Unsupported JWKS algorithms configured: ' +
      // I am calling this helper here so the current workflow performs this step before it moves on.
      invalidAlgorithms.join(', ')
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  );
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// The anon key is not required to read the standard public JWKS endpoint.
// Keep this warning because other Supabase client operations may still need it.
const SUPABASE_ANON_KEY =
  // I am keeping this line here because the surrounding supabaseJwt.js workflow expects this value or operation before it continues.
  config.supabase?.anonKey || '';

// This check helps me choose or stop the next path before any work that depends on this condition runs.
if (!SUPABASE_ANON_KEY) {
  // I am calling this helper here so the current workflow performs this step before it moves on.
  logger.warn(
    // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
    {
      // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
      event: 'auth.config.anon_key_missing',
      // I am keeping the `warning` field in this object so the receiving code can read that value by its expected name.
      warning:
        // I am listing this entry here because the surrounding collection processes each allowed value in order.
        'Supabase client operations may fail even though JWKS verification can still work'
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    },
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    'SUPABASE_ANON_KEY missing'
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  );
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// ============================================================
// STEP 2: Create remote JWKS resolver
// ============================================================
const JWKS = createRemoteJWKSet(
  // I am keeping this line here because the surrounding supabaseJwt.js workflow expects this value or operation before it continues.
  new URL(JWKS_URL),
  // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
  {
    // I am keeping the `cooldownDuration` field in this object so the receiving code can read that value by its expected name.
    cooldownDuration: 600_000
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
);

// ============================================================
// STEP 3: Read token from request
// ============================================================
function readToken(req) {
  // API clients use the Authorization header first.
  const authorizationHeader =
    // I am keeping this line here because the surrounding supabaseJwt.js workflow expects this value or operation before it continues.
    req.headers.authorization || '';

  // I am saving `bearerMatch` here so the nearby steps can reuse the same value without rebuilding it each time.
  const bearerMatch =
    // I am calling this helper here so the current workflow performs this step before it moves on.
    authorizationHeader.match(
      // I am keeping this line here because the surrounding supabaseJwt.js workflow expects this value or operation before it continues.
      /^Bearer\s+(.+)$/i
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    );

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (bearerMatch?.[1]) {
    // This return sends the completed value or response back to the code that called this function.
    return bearerMatch[1].trim();
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // Browser fallback: application HttpOnly cookie.
  const cookieName =
    // I am keeping this line here because the surrounding supabaseJwt.js workflow expects this value or operation before it continues.
    config.auth?.cookieName ||
    // I am keeping this line here because the surrounding supabaseJwt.js workflow expects this value or operation before it continues.
    'sb_session';

  // I am saving `hostCookieName` here so the nearby steps can reuse the same value without rebuilding it each time.
  const hostCookieName =
    // I am keeping this line here because the surrounding supabaseJwt.js workflow expects this value or operation before it continues.
    `__Host-${cookieName}`;

  // This return sends the completed value or response back to the code that called this function.
  return (
    // I am keeping this line here because the surrounding supabaseJwt.js workflow expects this value or operation before it continues.
    req.cookies?.[hostCookieName] ||
    // I am keeping this line here because the surrounding supabaseJwt.js workflow expects this value or operation before it continues.
    req.cookies?.[cookieName] ||
    // I am keeping this line here because the surrounding supabaseJwt.js workflow expects this value or operation before it continues.
    req.cookies?.['sb-access-token'] ||
    // I am keeping this line here because the surrounding supabaseJwt.js workflow expects this value or operation before it continues.
    req.cookies?.['sb_session'] ||
    // I am keeping this line here because the surrounding supabaseJwt.js workflow expects this value or operation before it continues.
    null
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  );
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// ============================================================
// STEP 4: Verify token
// ============================================================
async function verifyToken(token) {
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!token) {
    // I am saving `error` here so the nearby steps can reuse the same value without rebuilding it each time.
    const error = new Error(
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      'missing_token'
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    );

    // I am keeping this line here because the surrounding supabaseJwt.js workflow expects this value or operation before it continues.
    error.code = 'missing_token';
    // I am stopping this path with the existing error here because the caller should not continue with an invalid result.
    throw error;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // I am saving `payload` here so the nearby steps can reuse the same value without rebuilding it each time.
    const { payload } = await jwtVerify(
      // I am keeping this line here because the surrounding supabaseJwt.js workflow expects this value or operation before it continues.
      token,
      // I am keeping this line here because the surrounding supabaseJwt.js workflow expects this value or operation before it continues.
      JWKS,
      // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
      {
        // I am keeping the `algorithms` field in this object so the receiving code can read that value by its expected name.
        algorithms: ALLOWED_ALGORITHMS,
        // I am keeping the `issuer` field in this object so the receiving code can read that value by its expected name.
        issuer: EXPECTED_ISSUER,
        // I am keeping the `audience` field in this object so the receiving code can read that value by its expected name.
        audience: EXPECTED_AUDIENCE,
        // I am keeping the `clockTolerance` field in this object so the receiving code can read that value by its expected name.
        clockTolerance: CLOCK_SKEW_SEC
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    );

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!payload?.sub) {
      // I am saving `error` here so the nearby steps can reuse the same value without rebuilding it each time.
      const error = new Error(
        // I am listing this entry here because the surrounding collection processes each allowed value in order.
        'missing_sub'
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      );

      // I am keeping this line here because the surrounding supabaseJwt.js workflow expects this value or operation before it continues.
      error.code = 'missing_sub';
      // I am stopping this path with the existing error here because the caller should not continue with an invalid result.
      throw error;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // This return sends the completed value or response back to the code that called this function.
    return payload;
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (error) {
    // I am saving `reason` here so the nearby steps can reuse the same value without rebuilding it each time.
    const reason =
      // I am keeping this line here because the surrounding supabaseJwt.js workflow expects this value or operation before it continues.
      error?.code ||
      // I am keeping this line here because the surrounding supabaseJwt.js workflow expects this value or operation before it continues.
      error?.message ||
      // I am keeping this line here because the surrounding supabaseJwt.js workflow expects this value or operation before it continues.
      'verify_failed';

    // I am saving `metadata` here so the nearby steps can reuse the same value without rebuilding it each time.
    const metadata = {
      // I am keeping the `name` field in this object so the receiving code can read that value by its expected name.
      name: error?.name,
      // I am keeping the `code` field in this object so the receiving code can read that value by its expected name.
      code: error?.code,
      // I am keeping the `claim` field in this object so the receiving code can read that value by its expected name.
      claim: error?.claim,
      // I am keeping the `iss` field in this object so the receiving code can read that value by its expected name.
      iss: error?.payload?.iss,
      // I am keeping the `aud` field in this object so the receiving code can read that value by its expected name.
      aud: error?.payload?.aud
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    };

    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.warn(
      // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
      {
        // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
        event:
          // I am listing this entry here because the surrounding collection processes each allowed value in order.
          'auth.jwt_verification.failed',
        // I am keeping this line here because the surrounding supabaseJwt.js workflow expects this value or operation before it continues.
        reason,
        // I am keeping this line here because the surrounding supabaseJwt.js workflow expects this value or operation before it continues.
        ...metadata
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      },
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      'JWT verification failed'
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    );

    // I am calling this helper here so the current workflow performs this step before it moves on.
    audit(
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      'auth.verify.fail',
      // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
      {
        // I am keeping this line here because the surrounding supabaseJwt.js workflow expects this value or operation before it continues.
        reason,
        // I am keeping the `claim` field in this object so the receiving code can read that value by its expected name.
        claim: error?.claim
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      },
      // I am keeping this line here because the surrounding supabaseJwt.js workflow expects this value or operation before it continues.
      null
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    );

    // I am saving `clientError` here so the nearby steps can reuse the same value without rebuilding it each time.
    const clientError = new Error(
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      'invalid_token'
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    );

    // I am keeping this line here because the surrounding supabaseJwt.js workflow expects this value or operation before it continues.
    clientError.code = reason;
    // I am keeping this line here because the surrounding supabaseJwt.js workflow expects this value or operation before it continues.
    clientError.cause = error;

    // I am stopping this path with the existing error here because the caller should not continue with an invalid result.
    throw clientError;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// ============================================================
// STEP 5: Express middleware
// ============================================================
function authRequired(req, res, next) {
  // I am saving `token` here so the nearby steps can reuse the same value without rebuilding it each time.
  const token = readToken(req);

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!token) {
    // This return sends the completed value or response back to the code that called this function.
    return res.status(401).json({
      // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
      error: 'missing token'
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am calling this helper here so the current workflow performs this step before it moves on.
  verifyToken(token)
    // I am defining this small callback here so the surrounding API can run it with the value it supplies.
    .then((payload) => {
      // I am keeping this line here because the surrounding supabaseJwt.js workflow expects this value or operation before it continues.
      req.user = {
        // I am keeping the `id` field in this object so the receiving code can read that value by its expected name.
        id: payload.sub,
        // I am keeping the `email` field in this object so the receiving code can read that value by its expected name.
        email: payload.email || null,
        // I am keeping the `role` field in this object so the receiving code can read that value by its expected name.
        role:
          // I am keeping this line here because the surrounding supabaseJwt.js workflow expects this value or operation before it continues.
          payload.role ||
          // I am keeping this line here because the surrounding supabaseJwt.js workflow expects this value or operation before it continues.
          payload.user_role ||
          // I am listing this entry here because the surrounding collection processes each allowed value in order.
          'user',
        // I am keeping the `app_metadata` field in this object so the receiving code can read that value by its expected name.
        app_metadata:
          // I am keeping this line here because the surrounding supabaseJwt.js workflow expects this value or operation before it continues.
          payload.app_metadata || {},
        // I am keeping the `user_metadata` field in this object so the receiving code can read that value by its expected name.
        user_metadata:
          // I am keeping this line here because the surrounding supabaseJwt.js workflow expects this value or operation before it continues.
          payload.user_metadata || {}
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      };

      // This return sends the completed value or response back to the code that called this function.
      return next();
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    })
    // I am defining this small callback here so the surrounding API can run it with the value it supplies.
    .catch(() =>
      // I am building or sending the Express response here with the status, data, or page already chosen by this route.
      res.status(401).json({
        // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
        error: 'invalid token'
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      })
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    );
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am exporting this value here so another module can deliberately reuse the completed piece from supabaseJwt.js.
module.exports = {
  // I am keeping this line here because the surrounding supabaseJwt.js workflow expects this value or operation before it continues.
  authRequired,
  // I am keeping this line here because the surrounding supabaseJwt.js workflow expects this value or operation before it continues.
  verifyToken
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
};