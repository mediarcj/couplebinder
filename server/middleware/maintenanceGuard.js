// File: server/middleware/maintenanceGuard.js
// Description: Ultra-hardened maintenance mode guard (Redis/env toggle, IP allowlist, header bypass)
// Purpose: Lock down the app during maintenance while still allowing health + ACME; zero data leaks
// Notes: Defensive headers, strict CSP, constant-time bypass token, safe HTML escaping, light file caching

/**
 * WHAT:
 * A middleware that, when maintenance is ON, returns a locked-down 503 response for everyone
 * except health/ACME, ops allowlisted IPs, or an optional secret bypass header.
 *
 * WHY:
 * During maintenance you want all “gates closed”: no API, no pages, no hints, no indexing.
 *
 * HOW (order matters):
 * 1) Allow health + ACME paths
 * 2) Allow IP allowlist (ops)
 * 3) If maintenance ON:
 *    3a) Allow optional header bypass (constant-time compare) if configured
 *    3b) Otherwise, return 503 with strict headers and a minimal, safe HTML page (or JSON for API)
 * 4) If maintenance OFF: continue
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const logger = require('../utils/logger');

// ──────────────────────────────────────────────────────────────────────────────
// Configuration (env-driven with safe defaults)
// ──────────────────────────────────────────────────────────────────────────────
const MAINTENANCE_CONFIG = {
  // Redis key controlling ON/OFF
  key: process.env.MAINTENANCE_KEY || 'maintenance:mode',

  // Fallback if Redis unavailable
  default: process.env.MAINTENANCE_DEFAULT || 'off',

  // CSV allowlist of IPs that can pass during maintenance (e.g., ops)
  allowlist: process.env.MAINTENANCE_ALLOWLIST
    ? process.env.MAINTENANCE_ALLOWLIST.split(',').map(s => s.trim()).filter(Boolean)
    : ['127.0.0.1', '::1'],

  // Retry-After seconds (hint for clients/loaders)
  retryAfter: Number.parseInt(process.env.MAINTENANCE_RETRY_AFTER, 10) || 120,

  // Absolute path inside the container for a dedicated HTML page
  // NOTE: default points to /app/server/public which exists in your image
  pagePath: process.env.MAINTENANCE_PAGE || '/app/server/public/maintenance.html',

  // Simple message if page file is missing (we escape this before injecting)
  message: process.env.MAINTENANCE_MESSAGE || 'We will be back soon.',

  // Optional owner bypass token (header: x-maintenance-bypass). If unset, bypass is disabled.
  bypassToken: process.env.MAINTENANCE_BYPASS_TOKEN ? String(process.env.MAINTENANCE_BYPASS_TOKEN) : null,

  // Paths that should always work (strict, prefix match)
  allowedPaths: [
    '/health/liveness',
    '/health/readiness',
    '/health',
    '/.well-known/acme-challenge/'
  ]
};

// ──────────────────────────────────────────────────────────────────────────────
// Small helpers
// ──────────────────────────────────────────────────────────────────────────────

/** Constant-time string compare. If either side is missing or lengths differ, returns false without leaking timing. */
function safeEquals(a, b) {
  if (!a || !b) return false;
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) {
    // consume roughly the same code path to avoid obvious timing differences
    const pad = Buffer.alloc(Math.max(ab.length, bb.length) || 1, 0);
    try { crypto.timingSafeEqual(pad, pad); } catch {}
    return false;
  }
  try {
    return crypto.timingSafeEqual(ab, bb);
  } catch {
    return false;
  }
}

/** Escape minimal HTML entities so env text can’t break tags if it’s ever customized. */
function escapeHtml(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** ACME + health allowed paths */
function isAllowedPath(req) {
  const p = req.path || req.url || '';
  for (const prefix of MAINTENANCE_CONFIG.allowedPaths) {
    if (p.startsWith(prefix)) return true;
  }
  return false;
}

/** Prefer Cloudflare’s real IP header, with IPv6-mapped IPv4 normalization */
function clientIp(req) {
  const raw = req.get('CF-Connecting-IP') || req.ip || '';
  return raw.replace(/^::ffff:/, '');
}

/** IP allowlist check */
function isAllowedIP(req) {
  const ip = clientIp(req);
  return MAINTENANCE_CONFIG.allowlist.some(allow => ip === allow.replace(/^::ffff:/, '') || ip === allow);
}

// ──────────────────────────────────────────────────────────────────────────────
// Minimal maintenance page cache (avoid disk I/O every request)
// ─────────────────────────────────────────────────────────────────────────────-
let maintenancePageCache = null;
let maintenancePageCacheTime = 0;
const CACHE_TTL_MS = 30_000;

/** Load the dedicated maintenance page if present; else return a tiny safe inline HTML. */
function loadMaintenancePage() {
  const now = Date.now();

  if (maintenancePageCache && (now - maintenancePageCacheTime) < CACHE_TTL_MS) {
    return maintenancePageCache;
  }

  try {
    if (fs.existsSync(MAINTENANCE_CONFIG.pagePath)) {
      maintenancePageCache = fs.readFileSync(MAINTENANCE_CONFIG.pagePath, 'utf8');
      maintenancePageCacheTime = now;
      return maintenancePageCache;
    }
  } catch (err) {
    logger.warn(
      { event: 'maintenance.page_load_failed', path: MAINTENANCE_CONFIG.pagePath, error: err.message },
      'Failed to load dedicated maintenance page file'
    );
  }

  // Safe fallback (minified and escaped)
  const msg = escapeHtml(MAINTENANCE_CONFIG.message);
  maintenancePageCache =
    '<!doctype html><html lang="en"><head><meta charset="utf-8">'+
    '<meta name="viewport" content="width=device-width,initial-scale=1">'+
    '<title>Maintenance</title>'+
    // inline CSS only; no scripts; no external refs
    '<style>body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,"Helvetica Neue",Arial,sans-serif;background:#f5f5f5;color:#111}'+
    '.wrap{max-width:640px;margin:12vh auto;background:#fff;padding:32px 28px;border-radius:10px;box-shadow:0 2px 12px rgba(0,0,0,.08);text-align:center}'+
    'h1{margin:0 0 8px 0;font-size:26px;font-weight:700}p{margin:8px 0 0 0;line-height:1.55;color:#444}</style>'+
    '</head><body><main class="wrap"><h1>Maintenance Mode</h1>'+
    `<p>${msg}</p><p>Please check back shortly.</p>`+
    '</main></body></html>';

  maintenancePageCacheTime = now;
  return maintenancePageCache;
}

// ──────────────────────────────────────────────────────────────────────────────
// Maintenance state (Redis first, then env default)
// ─────────────────────────────────────────────────────────────────────────────-
async function getMaintenanceMode(redisClient) {
  try {
    if (redisClient && redisClient.isReady) {
      const v = await redisClient.get(MAINTENANCE_CONFIG.key);
      return v || MAINTENANCE_CONFIG.default;
    }
  } catch (err) {
    logger.debug(
      { event: 'maintenance.redis_check_failed', error: err.message },
      'Redis maintenance check failed; falling back to env default'
    );
  }
  return MAINTENANCE_CONFIG.default;
}

// ──────────────────────────────────────────────────────────────────────────────
function sendMaintenanceResponse(req, res) {
  // Very strict, minimal headers
  res.set({
    // Do not cache, anywhere
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    'Pragma': 'no-cache',
    'Expires': '0',

    // Retry hint
    'Retry-After': String(MAINTENANCE_CONFIG.retryAfter),

    // SEO: never index the maintenance page
    'X-Robots-Tag': 'noindex, nofollow, noarchive',

    // Lock everything down
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Permissions-Policy':
      'accelerometer=(),camera=(),display-capture=(),document-domain=(),encrypted-media=(),geolocation=(),' +
      'gyroscope=(),magnetometer=(),microphone=(),midi=(),payment=(),usb=(),sync-xhr=()',

    // We vary on Accept (HTML vs JSON)
    'Vary': 'Accept'
  });

  // Content negotiation
  const acceptsJson = req.path.startsWith('/api/') || (req.get('Accept') || '').includes('application/json');
  if (acceptsJson) {
    return res.status(503).json({
      error: 'maintenance_mode',
      message: 'Service temporarily unavailable for maintenance',
      retryAfter: MAINTENANCE_CONFIG.retryAfter
    });
  }

  // Tightest possible CSP to render the tiny HTML/CSS only
  res.set(
    'Content-Security-Policy',
    "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; " +
    "img-src 'self' data:; style-src 'unsafe-inline';"
  );

  res.type('html').status(503).send(loadMaintenancePage());
}

// ─────────────────────────────────────────────────────────────────────────────-
function createMaintenanceGuard(redisClient) {
  return async (req, res, next) => {
    try {
      // 1) Health + ACME must always pass
      if (isAllowedPath(req)) return next();

      // 2) Ops IPs always pass
      if (isAllowedIP(req)) {
        logger.debug(
          { event: 'maintenance.allow_passthrough', clientIp: clientIp(req), path: req.path, method: req.method },
          'Maintenance allowlist passthrough'
        );
        return next();
      }

      // 3) Check mode
      const mode = await getMaintenanceMode(redisClient);
      if (mode === 'on') {
        // 3a) Optional owner bypass (if token is configured)
        if (MAINTENANCE_CONFIG.bypassToken) {
          const presented = req.get('x-maintenance-bypass');
          if (safeEquals(presented, MAINTENANCE_CONFIG.bypassToken)) {
            logger.debug(
              { event: 'maintenance.bypass_token_ok', path: req.path, method: req.method },
              'Maintenance bypass token accepted'
            );
            return next();
          }
        }

        // 3b) Otherwise block with 503
        logger.info(
          {
            event: 'maintenance.block',
            clientIp: clientIp(req),
            path: req.path,
            method: req.method,
            ua: req.get('User-Agent'),
            retryAfter: MAINTENANCE_CONFIG.retryAfter
          },
          'Request blocked during maintenance'
        );

        return sendMaintenanceResponse(req, res);
      }

      // 4) Not in maintenance
      return next();
    } catch (err) {
      // Fail open: never brick the site because of the guard itself
      logger.error(
        { event: 'maintenance.guard_error', error: err.message, clientIp: clientIp(req), path: req.path },
        'Maintenance guard error - allowing request through'
      );
      return next();
    }
  };
}

module.exports = createMaintenanceGuard;