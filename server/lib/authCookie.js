/**
 * WHAT:
 * Centralized authentication cookie helpers for setting and clearing auth cookies with strict security rules.
 *
 * WHY:
 * Single-cookie auth helper with strict __Host- rules in production prevents subdomain attacks and ensures
 * consistent cookie naming across the app. Multiple parallel cookie names caused confusion and cleanup pain.
 *
 * HOW:
 * - In production: sets ONLY "__Host-<basename>" cookie (Secure; Path=/; NO Domain).
 * - In non-prod: sets ONLY "<basename>" cookie (host-only; secure may be false).
 * - Never sets "domain" attribute (host-only required for __Host-).
 * - Clears legacy cookie names on logout for migration safety.
 *
 * Public API:
 *   AUTH_COOKIE_NAME : string   // the one canonical name for this process
 *   setAuthCookie(res, req, token, ttlMs)
 *   clearAuthCookie(res, req, clearAll = false)
 *   isHttps(req) : boolean      // exported for callers that need scheme checks elsewhere
 */

const logger = require('../utils/logger');
// I am loading `../config` into `config` so this file can reuse that dependency below.
const { config } = require('../config');

// ───────────────────────────────────────────────────────────────────────────────
// Environment & naming
// ───────────────────────────────────────────────────────────────────────────────

// Determine production mode from config (config.server.nodeEnv is the source of truth)
const IS_PROD = config.server && config.server.nodeEnv === 'production';

// Allow apps to override the base cookie name via config.auth.cookieName.
// If someone misconfigures this with a "__Host-" prefix, strip it so we can
// add the prefix ourselves in prod without getting "__Host-__Host-...".
const RAW_BASENAME = (config.auth && config.auth.cookieName) || 'sb_session';
// I am saving `BASENAME` here so the nearby steps can reuse the same value without rebuilding it each time.
const BASENAME = RAW_BASENAME.replace(/^__Host-/, '');

// The ONLY name we will use in this process.
const AUTH_COOKIE_NAME = IS_PROD ? `__Host-${BASENAME}` : BASENAME;

// Optional aliases to clear on logout (legacy clean-up).
const COOKIE_ALIASES = Array.isArray(config.auth?.cookieAliases)
  // I am keeping this line here because the surrounding authCookie.js workflow expects this value or operation before it continues.
  ? config.auth.cookieAliases
  // I am keeping this line here because the surrounding authCookie.js workflow expects this value or operation before it continues.
  : [];

// If you used to set Domain cookies, we try to clear them too.
const LEGACY_COOKIE_DOMAIN =
  // I am keeping this line here because the surrounding authCookie.js workflow expects this value or operation before it continues.
  config.branding?.legacyCookieDomain ||
  config.auth?.cookieDomain || // legacy field if it ever existed
  // I am keeping this line here because the surrounding authCookie.js workflow expects this value or operation before it continues.
  undefined;

// ───────────────────────────────────────────────────────────────────────────────
// Utilities
// ───────────────────────────────────────────────────────────────────────────────

/**
 * WHAT:
 * Determines if the request effectively arrived over HTTPS from the user's point of view.
 *
 * WHY:
 * Keeps HTTPS detection logic in one place for callers that need this check elsewhere (cookie security, redirects, etc.).
 *
 * HOW:
 * Checks multiple signals in priority order: x-forwarded-proto header, Cloudflare CF-Visitor header, Express req.secure flag.
 *
 * @param {import('express').Request} req - Express request object
 * @returns {boolean} True if request is effectively HTTPS
 */
function isHttps(req) {
  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // Highest priority hint from proxy chain
    const xf = (req.get('x-forwarded-proto') || '').split(',')[0].trim().toLowerCase();
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (xf === 'https') return true;
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (xf === 'http') return false;

    // Cloudflare hint: {"scheme":"https"}
    const cfv = req.get('cf-visitor') || req.get('CF-Visitor') || '';
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (cfv && cfv.toLowerCase().includes('"https"')) return true;

    // Express flag (requires trust proxy set correctly)
    if (req.secure) return true;

    // This return sends the completed value or response back to the code that called this function.
    return false;
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch {
    // This return sends the completed value or response back to the code that called this function.
    return false;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * WHAT:
 * Build cookie options for writing the canonical authentication cookie.
 *
 * WHY:
 * Centralizes cookie attribute logic (Secure, SameSite, HttpOnly, Path) so they stay consistent.
 *
 * HOW:
 * Uses config.auth.cookieSameSite and config.server.nodeEnv to set security attributes correctly.
 * Never sets "domain" attribute (host-only required for __Host- cookies).
 *
 * @param {number} ttlMs - Max-Age in milliseconds
 * @returns {object} Cookie options object
 */
function buildWriteOpts(ttlMs) {
  // I am saving `sameSite` here so the nearby steps can reuse the same value without rebuilding it each time.
  const sameSite = (config.auth && config.auth.cookieSameSite) || 'lax';

  // In prod we force Secure, even if the caller forgets.
  // In non-prod, allow config override to force Secure for testing if desired.
  const secureFromConfig = config.auth && typeof config.auth.cookieSecure === 'boolean'
    // I am keeping this line here because the surrounding authCookie.js workflow expects this value or operation before it continues.
    ? config.auth.cookieSecure
    // I am keeping this line here because the surrounding authCookie.js workflow expects this value or operation before it continues.
    : undefined;

  // I am saving `secure` here so the nearby steps can reuse the same value without rebuilding it each time.
  const secure =
    // I am keeping this line here because the surrounding authCookie.js workflow expects this value or operation before it continues.
    IS_PROD ? true :
    // I am keeping this line here because the surrounding authCookie.js workflow expects this value or operation before it continues.
    secureFromConfig !== undefined ? secureFromConfig :
    // I am keeping this line here because the surrounding authCookie.js workflow expects this value or operation before it continues.
    false;

  // I am saving `opts` here so the nearby steps can reuse the same value without rebuilding it each time.
  const opts = {
    // I am keeping the `path` field in this object so the receiving code can read that value by its expected name.
    path: '/',
    // I am keeping the `httpOnly` field in this object so the receiving code can read that value by its expected name.
    httpOnly: true,
    // I am keeping this line here because the surrounding authCookie.js workflow expects this value or operation before it continues.
    sameSite,
    // I am keeping this line here because the surrounding authCookie.js workflow expects this value or operation before it continues.
    secure
    // IMPORTANT: no "domain" on purpose
  };

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (typeof ttlMs === 'number' && Number.isFinite(ttlMs)) {
    // I am keeping this line here because the surrounding authCookie.js workflow expects this value or operation before it continues.
    opts.maxAge = Math.max(0, Math.floor(ttlMs));
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
  // This return sends the completed value or response back to the code that called this function.
  return opts;
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * Defensive check before writing: if someone added "domain" by accident,
 * strip it and warn. Also, ensure Secure in production.
 */
function hardenWriteOpts(opts) {
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!opts || typeof opts !== 'object') return;
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if ('domain' in opts) {
    // I am saving `bad` here so the nearby steps can reuse the same value without rebuilding it each time.
    const bad = opts.domain;
    // I am keeping this line here because the surrounding authCookie.js workflow expects this value or operation before it continues.
    delete opts.domain;
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.warn({ event: 'auth.cookie.write.domain_stripped', bad }, 'Removed domain from auth cookie options');
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (IS_PROD && opts.secure !== true) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.warn({ event: 'auth.cookie.write.secure_forced' }, 'Forced secure=true for auth cookie in production');
    // I am keeping this line here because the surrounding authCookie.js workflow expects this value or operation before it continues.
    opts.secure = true;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// ───────────────────────────────────────────────────────────────────────────────
// Public functions
// ───────────────────────────────────────────────────────────────────────────────

/**
 * WHAT:
 * Set the primary authentication cookie for a logged-in user.
 *
 * WHY:
 * Centralizes cookie naming, flags, and security attributes so they stay consistent across the app.
 *
 * HOW:
 * Uses config.auth.cookieName and config.server.nodeEnv to set Secure, HttpOnly, and SameSite correctly.
 * In production, forces Secure=true and uses __Host- prefix. Never sets Domain attribute.
 *
 * @param {import('express').Response} res - Express response object
 * @param {import('express').Request} _req - Express request object (unused but kept for API consistency)
 * @param {string} token - JWT or session token value
 * @param {number} ttlMs - Max-Age in milliseconds
 */
function setAuthCookie(res, _req, token, ttlMs) {
  // I am saving `opts` here so the nearby steps can reuse the same value without rebuilding it each time.
  const opts = buildWriteOpts(ttlMs);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  hardenWriteOpts(opts);

  // I am building or sending the Express response here with the status, data, or page already chosen by this route.
  res.cookie(AUTH_COOKIE_NAME, token, opts);

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (config.auth?.debug) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.debug({
      // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
      event: 'auth.cookie.set',
      // I am keeping the `name` field in this object so the receiving code can read that value by its expected name.
      name: AUTH_COOKIE_NAME,
      // I am keeping the `secure` field in this object so the receiving code can read that value by its expected name.
      secure: opts.secure,
      // I am keeping the `sameSite` field in this object so the receiving code can read that value by its expected name.
      sameSite: opts.sameSite,
      // I am keeping the `path` field in this object so the receiving code can read that value by its expected name.
      path: opts.path,
      // I am keeping the `maxAge` field in this object so the receiving code can read that value by its expected name.
      maxAge: opts.maxAge
    // I am keeping this line here because the surrounding authCookie.js workflow expects this value or operation before it continues.
    }, 'Set auth cookie');
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * WHAT:
 * Clear the authentication cookie and all legacy cookie names for complete logout.
 *
 * WHY:
 * Ensures complete cookie cleanup on logout, including legacy names from previous deployments or client versions.
 *
 * HOW:
 * Clears the canonical cookie first, then attempts to clear all known legacy names (sb-access-token, sb_session, etc.)
 * with various path/domain combinations to catch cookies set by old code paths.
 *
 * @param {import('express').Response} res - Express response object
 * @param {import('express').Request} req - Express request object (used to detect hostname for domain clearing)
 * @param {boolean} clearAll - When true, tries even more historical cookie name variants
 */
function clearAuthCookie(res, req, clearAll = false) {
  // Clear the current canonical cookie first.
  const secureFlag = IS_PROD ? true : !!(config.auth && config.auth.cookieSecure === true);
  res.clearCookie(AUTH_COOKIE_NAME, { path: '/', secure: secureFlag }); // no domain

  // Build the set of legacy names to clear.
  const legacyNames = new Set([
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    'sb_session',
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    '__Host-sb_session',
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    'sb-access-token',
    // I am keeping this line here because the surrounding authCookie.js workflow expects this value or operation before it continues.
    ...COOKIE_ALIASES
  // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
  ]);

  // Host-only clears (no domain)
  for (const n of legacyNames) {
    // I am building or sending the Express response here with the status, data, or page already chosen by this route.
    res.clearCookie(n, { path: '/' });
    // Also try secure:true for any former __Host- style names
    res.clearCookie(n, { path: '/', secure: true });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // Best-effort domain variant (e.g., ".example.com") in case old deployments used it
  const host = (req.hostname || (req.headers.host || '')).split(':')[0];
  // I am saving `parts` here so the nearby steps can reuse the same value without rebuilding it each time.
  const parts = host.split('.').filter(Boolean);
  // I am saving `base` here so the nearby steps can reuse the same value without rebuilding it each time.
  const base = parts.length >= 2 ? '.' + parts.slice(-2).join('.') : null;
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (base) {
    // I am repeating the next block one item at a time so every value in the existing collection receives the same handling.
    for (const n of legacyNames) {
      // I am building or sending the Express response here with the status, data, or page already chosen by this route.
      res.clearCookie(n, { path: '/', domain: base });
      // I am building or sending the Express response here with the status, data, or page already chosen by this route.
      res.clearCookie(n, { path: '/', domain: base, secure: true });
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // Configured legacy domain (stronger belt-and-suspenders)
  if (LEGACY_COOKIE_DOMAIN) {
    // I am repeating the next block one item at a time so every value in the existing collection receives the same handling.
    for (const n of legacyNames) {
      // I am building or sending the Express response here with the status, data, or page already chosen by this route.
      res.clearCookie(n, { path: '/', domain: LEGACY_COOKIE_DOMAIN });
      // I am building or sending the Express response here with the status, data, or page already chosen by this route.
      res.clearCookie(n, { path: '/', domain: LEGACY_COOKIE_DOMAIN, secure: true });
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // Optional extra variants
  if (clearAll) {
    // I am saving `extras` here so the nearby steps can reuse the same value without rebuilding it each time.
    const extras = [
      // I am keeping this line here because the surrounding authCookie.js workflow expects this value or operation before it continues.
      BASENAME,
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      `__Host-${BASENAME}`,
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      'sb_access_token',
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      'sb-refresh-token',
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      'sb_refresh_token'
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    ];
    // I am repeating the next block one item at a time so every value in the existing collection receives the same handling.
    for (const n of extras) {
      // I am building or sending the Express response here with the status, data, or page already chosen by this route.
      res.clearCookie(n, { path: '/' });
      // I am building or sending the Express response here with the status, data, or page already chosen by this route.
      res.clearCookie(n, { path: '/', secure: true });
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (base) {
        // I am building or sending the Express response here with the status, data, or page already chosen by this route.
        res.clearCookie(n, { path: '/', domain: base });
        // I am building or sending the Express response here with the status, data, or page already chosen by this route.
        res.clearCookie(n, { path: '/', domain: base, secure: true });
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (LEGACY_COOKIE_DOMAIN) {
        // I am building or sending the Express response here with the status, data, or page already chosen by this route.
        res.clearCookie(n, { path: '/', domain: LEGACY_COOKIE_DOMAIN });
        // I am building or sending the Express response here with the status, data, or page already chosen by this route.
        res.clearCookie(n, { path: '/', domain: LEGACY_COOKIE_DOMAIN, secure: true });
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (config.auth?.debug) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.debug({
      // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
      event: 'auth.cookie.cleared',
      // I am keeping the `current` field in this object so the receiving code can read that value by its expected name.
      current: AUTH_COOKIE_NAME,
      // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
      legacy: Array.from(legacyNames),
      // I am keeping the `legacyDomain` field in this object so the receiving code can read that value by its expected name.
      legacyDomain: LEGACY_COOKIE_DOMAIN || null
    // I am keeping this line here because the surrounding authCookie.js workflow expects this value or operation before it continues.
    }, 'Cleared auth cookie(s)');
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// ───────────────────────────────────────────────────────────────────────────────
// Exports
// ───────────────────────────────────────────────────────────────────────────────

module.exports = {
  // I am keeping this line here because the surrounding authCookie.js workflow expects this value or operation before it continues.
  AUTH_COOKIE_NAME,
  // I am keeping this line here because the surrounding authCookie.js workflow expects this value or operation before it continues.
  setAuthCookie,
  // I am keeping this line here because the surrounding authCookie.js workflow expects this value or operation before it continues.
  clearAuthCookie,
  // I am keeping this line here because the surrounding authCookie.js workflow expects this value or operation before it continues.
  isHttps
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
};