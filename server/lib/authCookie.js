// File: server/lib/authCookie.js
// Centralized helpers for setting/clearing the auth cookie(s).
// Dev/local: plain host-only cookie (secure=false).
// Public HTTPS: ALSO set __Host- cookie (secure=true, no Domain).
// Always avoid Domain on set (host-only) to dodge subdomain pitfalls.

const logger = require('../utils/logger');
const { config } = require('../config');

// Base name from config (already normalized, no __Host- prefix)
const AUTH_COOKIE_BASENAME = config.auth.cookieName;

// Optional, comma-separated extra legacy names you want cleared on logout.
const AUTH_COOKIE_ALIASES = config.auth.cookieAliases || [];

// Legacy domains you might need to clear from old deployments.
const LEGACY_COOKIE_DOMAIN = config.branding.legacyCookieDomain || config.auth.cookieDomain || undefined;

function isLocalhostHost(h) {
  if (!h) return false;
  const host = String(h).toLowerCase();
  return (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host === '127.0.0.1' ||
    host.startsWith('127.') ||
    host === '::1'
  );
}

// Detect if request is effectively HTTPS from the client's POV.
function isHttps(req) {
  try {
    // 1) Honor X-Forwarded-Proto from the edge/proxy chain (highest priority)
    const xf = (req.get('x-forwarded-proto') || '').split(',')[0].trim().toLowerCase();
    if (xf === 'https') return true;
    if (xf === 'http') return false; // Explicitly http means not https

    // 2) Cloudflare header (JSON-ish), e.g. {"scheme":"https"}
    const cfv = req.get('cf-visitor') || req.get('CF-Visitor') || '';
    if (cfv && cfv.toLowerCase().includes('"https"')) return true;

    // 3) Express hint (works when trust proxy is set correctly)
    if (req.secure) return true;

    return false;
  } catch {
    return false;
  }
}

// Consider the host “public” when it’s not a localhost address.
function isPublicHost(req) {
  const h = req.hostname || req.get('host') || '';
  return !isLocalhostHost(h);
}

// Build the name we prefer for host-only cookies (no prefix).
function plainCookieName() {
  return AUTH_COOKIE_BASENAME;
}

// Build the __Host- variant name.
function hostPrefixedName() {
  return `__Host-${AUTH_COOKIE_BASENAME}`;
}

// Options for a host-only cookie (never set Domain on set).
function buildCookieOpts({ secure, ttlMs }) {
  const opts = {
    path: '/',
    httpOnly: true,
    sameSite: config.auth.cookieSameSite,
  };
  if (typeof ttlMs === 'number' && Number.isFinite(ttlMs)) {
    opts.maxAge = Math.max(0, Math.floor(ttlMs));
  }
  // Respect config.auth.cookieSecure if set, otherwise use secure parameter
  if (config.auth.cookieSecure === true) {
    opts.secure = true;
  } else if (config.auth.cookieSecure === false) {
    opts.secure = false;
  } else if (secure) {
    opts.secure = true;
  } else {
    // When not secure, omit .secure; default is false.
  }
  return opts;
}

/**
 * Set auth cookie(s).
 * - Always set a host-only plain cookie.
 * - If public HTTPS, also set a __Host- twin (requires secure + no Domain).
 */
function setAuthCookie(res, req, token, ttlMs) {
  const publicHost = isPublicHost(req);
  const https = isHttps(req);
  
  // Determine secure flag: respect config.auth.cookieSecure, or use publicHost && https
  const forceSecure = config.auth.cookieSecure === true;
  const forceInsecure = config.auth.cookieSecure === false;
  const shouldBeSecure = forceSecure || (!forceInsecure && publicHost && https);

  // Debug logging for cookie set detection (only when config.auth.debug=true)
  if (config.auth.debug) {
    logger.debug({
      event: 'auth.cookie.set.detection',
      publicHost,
      https,
      reqSecure: !!req.secure,
      xForwardedProto: req.get('x-forwarded-proto'),
      hostname: req.hostname || req.get('host'),
      willSetPlain: true,
      willSetHost: publicHost && https,
      plainSecure: shouldBeSecure,
      cookieSecureConfig: config.auth.cookieSecure !== undefined ? String(config.auth.cookieSecure) : '(auto-detect)'
    }, 'Cookie set detection');
  }

  // Always write the plain host-only cookie (works in dev & prod).
  const plainName = plainCookieName();
  const plainOpts = buildCookieOpts({ secure: shouldBeSecure, ttlMs });
  res.cookie(plainName, token, plainOpts);
  
  // Log cookie set details for debugging (only when config.auth.debug=true)
  if (config.auth.debug) {
    logger.debug({
      event: 'auth.cookie.set.plain',
      cookieName: plainName,
      secure: plainOpts.secure,
      publicHost,
      https,
      reqSecure: !!req.secure,
      xForwardedProto: req.get('x-forwarded-proto'),
      cfVisitor: req.get('cf-visitor') || req.get('CF-Visitor') || null,
      hostname: req.hostname || req.get('host'),
      path: plainOpts.path,
      sameSite: plainOpts.sameSite,
      httpOnly: plainOpts.httpOnly,
      maxAge: plainOpts.maxAge,
      hasDomain: !!plainOpts.domain,
      domain: plainOpts.domain || '(none)'
    }, 'Setting plain auth cookie');
  }

  // On public HTTPS, ALSO write the __Host- cookie (hardened).
  // On localhost, only set __Host- if explicitly forced secure (for testing)
  const shouldSetHostCookie = (publicHost && https) || (forceSecure && !publicHost);
  if (shouldSetHostCookie) {
    const hostName = hostPrefixedName();
    const hostOpts = buildCookieOpts({ secure: true, ttlMs });
    res.cookie(hostName, token, hostOpts);
  }

  if (config.auth.debug) {
    logger.debug({
      event: 'auth.cookie.set',
      plainName,
      plainSecure: Boolean(plainOpts.secure),
      hostName: publicHost && https ? hostPrefixedName() : null,
      httpOnly: true,
      sameSite: 'Lax',
      path: '/',
      maxAge: ttlMs || null
    }, 'Auth cookie(s) set');
  }
}

/**
 * Clear auth cookie(s).
 * - Clears both the plain and __Host- names.
 * - Clears common legacy names and Domain variants if configured.
 * - If clearAll=true, tries extra variations for safety.
 * 
 * CRITICAL: Express clearCookie requires exact same options as setCookie.
 * For __Host- cookies, must include secure: true and no domain.
 */
function clearAuthCookie(res, req, clearAll = false) {
  const names = new Set([
    plainCookieName(),
    hostPrefixedName(),
    // legacy fallbacks
    'sb-access-token',
    'sb_session',
    ...AUTH_COOKIE_ALIASES
  ]);

  // Determine secure flag to match how cookies were set
  const publicHost = isPublicHost(req);
  const https = isHttps(req);
  const forceSecure = config.auth.cookieSecure === true;
  const forceInsecure = config.auth.cookieSecure === false;
  const shouldBeSecure = forceSecure || (!forceInsecure && publicHost && https);

  // Express clearCookie only requires matching: path, domain, secure
  // Clear plain cookies (may be secure or not, depending on context)
  for (const n of names) {
    // Try both secure and non-secure variants to ensure we clear it
    if (shouldBeSecure || forceSecure) {
      res.clearCookie(n, { path: '/', secure: true });
    }
    if (!forceSecure) {
      res.clearCookie(n, { path: '/', secure: false });
    }
    // Also try without secure specified (Express default)
    res.clearCookie(n, { path: '/' });
  }

  // Clear __Host- prefixed cookies (always secure, no domain)
  const hostNames = names.has(hostPrefixedName()) ? [hostPrefixedName()] : [];
  if (clearAll) {
    hostNames.push(`__Host-${AUTH_COOKIE_BASENAME}`);
  }
  for (const n of hostNames) {
    // __Host- cookies MUST have secure: true and NO domain
    res.clearCookie(n, { path: '/', secure: true });
  }

  // If you formerly set a Domain, also clear those variants.
  if (LEGACY_COOKIE_DOMAIN) {
    for (const n of names) {
      res.clearCookie(n, { path: '/', domain: LEGACY_COOKIE_DOMAIN, secure: shouldBeSecure });
    }
  }

  // Extra belt-and-suspenders when requested.
  if (clearAll) {
    // Try removing some common typos/variants.
    const extras = [
      `${AUTH_COOKIE_BASENAME}`,
      `__Host-${AUTH_COOKIE_BASENAME}`,
      'sb_access_token',
      'sb-refresh-token',
      'sb_refresh_token'
    ];
    for (const n of extras) {
      // Try both secure variants
      res.clearCookie(n, { path: '/', secure: true });
      res.clearCookie(n, { path: '/', secure: false });
      res.clearCookie(n, { path: '/' });
      
      if (LEGACY_COOKIE_DOMAIN) {
        res.clearCookie(n, { path: '/', domain: LEGACY_COOKIE_DOMAIN, secure: shouldBeSecure });
      }
    }
  }

  if (config.auth.debug) {
    logger.debug({
      event: 'auth.cookie.cleared',
      names: Array.from(names),
      clearAll,
      legacyDomain: LEGACY_COOKIE_DOMAIN || null,
      secure: shouldBeSecure,
      publicHost,
      https
    }, 'Auth cookie(s) cleared');
  }
}

module.exports = {
  // Export the *base* name so other code can derive both variants.
  AUTH_COOKIE_NAME: AUTH_COOKIE_BASENAME,
  AUTH_COOKIE_ALIASES,
  setAuthCookie,
  clearAuthCookie,
  isHttps  // Export for canonical host middleware and tests
};