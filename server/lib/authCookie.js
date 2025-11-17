// File: server/lib/authCookie.js
// Centralized helpers for setting/clearing the auth cookie(s).
// Dev/local: plain host-only cookie (secure=false).
// Public HTTPS: ALSO set __Host- cookie (secure=true, no Domain).
// Always avoid Domain on set (host-only) to dodge subdomain pitfalls.

/**
 *
 * Purpose
 * =======
 * Single-cookie auth helper with strict __Host- rules in production.
 * - In production: sets ONLY "__Host-sb_session" (Secure; Path=/; NO Domain).
 * - In non-prod   : sets ONLY "sb_session" (host-only; secure may be false).
 *
 * Why single-cookie?
 * ------------------
 * Multiple parallel names (plain + __Host-) caused confusion and cleanup pain.
 * This module makes the name deterministic and exports it for other modules.
 *
 * Invariants we enforce
 * ---------------------
 * 1) Never set "domain" when writing the cookie (host-only).
 * 2) In production, cookie must be Secure and named "__Host-<basename>".
 * 3) Clear legacy names on logout (__Host-sb_session, sb_session, sb-access-token, plus aliases).
 *
 * Public API
 * ----------
 *   AUTH_COOKIE_NAME : string   // the one canonical name for this process
 *   setAuthCookie(res, req, token, ttlMs)
 *   clearAuthCookie(res, req, clearAll = false)
 *   isHttps(req) : boolean      // exported for callers that need scheme checks elsewhere
 */

const logger = require('../utils/logger');
const { config } = require('../config');

// ───────────────────────────────────────────────────────────────────────────────
// Environment & naming
// ───────────────────────────────────────────────────────────────────────────────

const IS_PROD =
  (config.server && config.server.nodeEnv === 'production') ||
  process.env.NODE_ENV === 'production';

// Allow apps to override the base cookie name via config.auth.cookieName.
// If someone misconfigures this with a "__Host-" prefix, strip it so we can
// add the prefix ourselves in prod without getting "__Host-__Host-...".
const RAW_BASENAME = (config.auth && config.auth.cookieName) || 'sb_session';
const BASENAME = RAW_BASENAME.replace(/^__Host-/, '');

// The ONLY name we will use in this process.
const AUTH_COOKIE_NAME = IS_PROD ? `__Host-${BASENAME}` : BASENAME;

// Optional aliases to clear on logout (legacy clean-up).
const COOKIE_ALIASES = Array.isArray(config.auth?.cookieAliases)
  ? config.auth.cookieAliases
  : [];

// If you used to set Domain cookies, we try to clear them too.
const LEGACY_COOKIE_DOMAIN =
  config.branding?.legacyCookieDomain ||
  config.auth?.cookieDomain || // legacy field if it ever existed
  undefined;

// ───────────────────────────────────────────────────────────────────────────────
// Utilities
// ───────────────────────────────────────────────────────────────────────────────

/**
 * True if the request effectively arrived over HTTPS from the user's point of view.
 * Keeps logic in one place for callers that need this check elsewhere.
 */
function isHttps(req) {
  try {
    // Highest priority hint from proxy chain
    const xf = (req.get('x-forwarded-proto') || '').split(',')[0].trim().toLowerCase();
    if (xf === 'https') return true;
    if (xf === 'http') return false;

    // Cloudflare hint: {"scheme":"https"}
    const cfv = req.get('cf-visitor') || req.get('CF-Visitor') || '';
    if (cfv && cfv.toLowerCase().includes('"https"')) return true;

    // Express flag (requires trust proxy set correctly)
    if (req.secure) return true;

    return false;
  } catch {
    return false;
  }
}

/**
 * Build cookie options for writing the canonical cookie.
 * We never put a Domain attribute here; host-only is required for __Host-.
 */
function buildWriteOpts(ttlMs) {
  const sameSite = (config.auth && config.auth.cookieSameSite) || 'lax';

  // In prod we force Secure, even if the caller forgets.
  // In non-prod, allow config override to force Secure for testing if desired.
  const secureFromConfig = config.auth && typeof config.auth.cookieSecure === 'boolean'
    ? config.auth.cookieSecure
    : undefined;

  const secure =
    IS_PROD ? true :
    secureFromConfig !== undefined ? secureFromConfig :
    false;

  const opts = {
    path: '/',
    httpOnly: true,
    sameSite,
    secure
    // IMPORTANT: no "domain" on purpose
  };

  if (typeof ttlMs === 'number' && Number.isFinite(ttlMs)) {
    opts.maxAge = Math.max(0, Math.floor(ttlMs));
  }
  return opts;
}

/**
 * Defensive check before writing: if someone added "domain" by accident,
 * strip it and warn. Also, ensure Secure in production.
 */
function hardenWriteOpts(opts) {
  if (!opts || typeof opts !== 'object') return;
  if ('domain' in opts) {
    const bad = opts.domain;
    delete opts.domain;
    logger.warn({ event: 'auth.cookie.write.domain_stripped', bad }, 'Removed domain from auth cookie options');
  }
  if (IS_PROD && opts.secure !== true) {
    logger.warn({ event: 'auth.cookie.write.secure_forced' }, 'Forced secure=true for auth cookie in production');
    opts.secure = true;
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// Public functions
// ───────────────────────────────────────────────────────────────────────────────

/**
 * Set the authentication cookie.
 * @param {import('express').Response} res
 * @param {import('express').Request} _req
 * @param {string} token - JWT or session token value
 * @param {number} ttlMs - Max-Age in milliseconds
 */
function setAuthCookie(res, _req, token, ttlMs) {
  const opts = buildWriteOpts(ttlMs);
  hardenWriteOpts(opts);

  res.cookie(AUTH_COOKIE_NAME, token, opts);

  if (config.auth?.debug) {
    logger.debug({
      event: 'auth.cookie.set',
      name: AUTH_COOKIE_NAME,
      secure: opts.secure,
      sameSite: opts.sameSite,
      path: opts.path,
      maxAge: opts.maxAge
    }, 'Set auth cookie');
  }
}

/**
 * Clear the authentication cookie and common legacy names.
 * Note: Express clearCookie must match important write options (path, domain, secure).
 * For __Host- cookies: use secure:true and NO domain.
 *
 * @param {import('express').Response} res
 * @param {import('express').Request} req
 * @param {boolean} clearAll - when true, tries even more historical variants
 */
function clearAuthCookie(res, req, clearAll = false) {
  // Clear the current canonical cookie first.
  const secureFlag = IS_PROD ? true : !!(config.auth && config.auth.cookieSecure === true);
  res.clearCookie(AUTH_COOKIE_NAME, { path: '/', secure: secureFlag }); // no domain

  // Build the set of legacy names to clear.
  const legacyNames = new Set([
    'sb_session',
    '__Host-sb_session',
    'sb-access-token',
    ...COOKIE_ALIASES
  ]);

  // Host-only clears (no domain)
  for (const n of legacyNames) {
    res.clearCookie(n, { path: '/' });
    // Also try secure:true for any former __Host- style names
    res.clearCookie(n, { path: '/', secure: true });
  }

  // Best-effort domain variant (e.g., ".example.com") in case old deployments used it
  const host = (req.hostname || (req.headers.host || '')).split(':')[0];
  const parts = host.split('.').filter(Boolean);
  const base = parts.length >= 2 ? '.' + parts.slice(-2).join('.') : null;
  if (base) {
    for (const n of legacyNames) {
      res.clearCookie(n, { path: '/', domain: base });
      res.clearCookie(n, { path: '/', domain: base, secure: true });
    }
  }

  // Configured legacy domain (stronger belt-and-suspenders)
  if (LEGACY_COOKIE_DOMAIN) {
    for (const n of legacyNames) {
      res.clearCookie(n, { path: '/', domain: LEGACY_COOKIE_DOMAIN });
      res.clearCookie(n, { path: '/', domain: LEGACY_COOKIE_DOMAIN, secure: true });
    }
  }

  // Optional extra variants
  if (clearAll) {
    const extras = [
      BASENAME,
      `__Host-${BASENAME}`,
      'sb_access_token',
      'sb-refresh-token',
      'sb_refresh_token'
    ];
    for (const n of extras) {
      res.clearCookie(n, { path: '/' });
      res.clearCookie(n, { path: '/', secure: true });
      if (base) {
        res.clearCookie(n, { path: '/', domain: base });
        res.clearCookie(n, { path: '/', domain: base, secure: true });
      }
      if (LEGACY_COOKIE_DOMAIN) {
        res.clearCookie(n, { path: '/', domain: LEGACY_COOKIE_DOMAIN });
        res.clearCookie(n, { path: '/', domain: LEGACY_COOKIE_DOMAIN, secure: true });
      }
    }
  }

  if (config.auth?.debug) {
    logger.debug({
      event: 'auth.cookie.cleared',
      current: AUTH_COOKIE_NAME,
      legacy: Array.from(legacyNames),
      legacyDomain: LEGACY_COOKIE_DOMAIN || null
    }, 'Cleared auth cookie(s)');
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// Exports
// ───────────────────────────────────────────────────────────────────────────────

module.exports = {
  AUTH_COOKIE_NAME,
  setAuthCookie,
  clearAuthCookie,
  isHttps
};