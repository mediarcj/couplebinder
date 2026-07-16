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
// I am loading `path` into `path` so this file can reuse that dependency below.
const path = require('path');
// I am loading `crypto` into `crypto` so this file can reuse that dependency below.
const crypto = require('crypto');
// I am loading `../utils/logger` into `logger` so this file can reuse that dependency below.
const logger = require('../utils/logger');
// I am loading `../config` into `config` so this file can reuse that dependency below.
const { config } = require('../config');

// ──────────────────────────────────────────────────────────────────────────────
// Configuration (from centralized config module)
// ──────────────────────────────────────────────────────────────────────────────
const MAINTENANCE_CONFIG = {
  // Redis key controlling ON/OFF
  key: config.maintenance.key,

  // Fallback if Redis unavailable
  default: config.maintenance.default,

  // CSV allowlist of IPs that can pass during maintenance (e.g., ops)
  allowlist: config.maintenance.allowlist,

  // Retry-After seconds (hint for clients/loaders)
  retryAfter: config.maintenance.retryAfter,

  // Absolute path inside the container for a dedicated HTML page
  // NOTE: default points to /app/server/public which exists in your image
  pagePath: config.maintenance.pagePath,

  // Simple message if page file is missing (we escape this before injecting)
  message: config.maintenance.message,

  // Optional owner bypass token (header: x-maintenance-bypass). If unset, bypass is disabled.
  bypassToken: config.maintenance.bypassToken || null,

  // Paths that should always work (strict, prefix match)
  allowedPaths: Array.isArray(config.maintenance.allowedPaths) && config.maintenance.allowedPaths.length
    // I am keeping this line here because the surrounding maintenanceGuard.js workflow expects this value or operation before it continues.
    ? config.maintenance.allowedPaths
    // I am keeping this line here because the surrounding maintenanceGuard.js workflow expects this value or operation before it continues.
    : [
        // I am listing this entry here because the surrounding collection processes each allowed value in order.
        '/health/liveness',
        // I am listing this entry here because the surrounding collection processes each allowed value in order.
        '/health/readiness',
        // I am listing this entry here because the surrounding collection processes each allowed value in order.
        '/health',
        // I am listing this entry here because the surrounding collection processes each allowed value in order.
        '/.well-known/acme-challenge/',
        // I am listing this entry here because the surrounding collection processes each allowed value in order.
        '/api/stripe/webhook'
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      ]
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
};

// ──────────────────────────────────────────────────────────────────────────────
// Small helpers
// ──────────────────────────────────────────────────────────────────────────────

/** Constant-time string compare. If either side is missing or lengths differ, returns false without leaking timing. */
function safeEquals(a, b) {
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!a || !b) return false;
  // I am saving `ab` here so the nearby steps can reuse the same value without rebuilding it each time.
  const ab = Buffer.from(String(a));
  // I am saving `bb` here so the nearby steps can reuse the same value without rebuilding it each time.
  const bb = Buffer.from(String(b));
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (ab.length !== bb.length) {
    // consume roughly the same code path to avoid obvious timing differences
    const pad = Buffer.alloc(Math.max(ab.length, bb.length) || 1, 0);
    // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
    try { crypto.timingSafeEqual(pad, pad); } catch {}
    // This return sends the completed value or response back to the code that called this function.
    return false;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // This return sends the completed value or response back to the code that called this function.
    return crypto.timingSafeEqual(ab, bb);
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch {
    // This return sends the completed value or response back to the code that called this function.
    return false;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/** Escape minimal HTML entities so env text can’t break tags if it’s ever customized. */
function escapeHtml(s) {
  // This return sends the completed value or response back to the code that called this function.
  return String(s)
    // I am continuing the existing call chain here so this option stays attached to the same operation started above.
    .replaceAll('&', '&amp;')
    // I am continuing the existing call chain here so this option stays attached to the same operation started above.
    .replaceAll('<', '&lt;')
    // I am continuing the existing call chain here so this option stays attached to the same operation started above.
    .replaceAll('>', '&gt;')
    // I am continuing the existing call chain here so this option stays attached to the same operation started above.
    .replaceAll('"', '&quot;')
    // I am continuing the existing call chain here so this option stays attached to the same operation started above.
    .replaceAll("'", '&#39;');
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/** ACME + health allowed paths */
 function isAllowedPath(req) {
   // originalUrl survives proxies and raw-body middleware better
   const p = req.originalUrl || req.path || req.url || '';
  // I am repeating the next block one item at a time so every value in the existing collection receives the same handling.
  for (const prefix of MAINTENANCE_CONFIG.allowedPaths) {
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (p.startsWith(prefix)) return true;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
  // This return sends the completed value or response back to the code that called this function.
  return false;
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/** Prefer Cloudflare’s real IP header, with IPv6-mapped IPv4 normalization */
function clientIp(req) {
  // I am saving `raw` here so the nearby steps can reuse the same value without rebuilding it each time.
  const raw = req.get('CF-Connecting-IP') || req.ip || '';
  // This return sends the completed value or response back to the code that called this function.
  return raw.replace(/^::ffff:/, '');
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/** IP allowlist check */
function isAllowedIP(req) {
  // I am saving `ip` here so the nearby steps can reuse the same value without rebuilding it each time.
  const ip = clientIp(req);
  // This return sends the completed value or response back to the code that called this function.
  return MAINTENANCE_CONFIG.allowlist.some(allow => ip === allow.replace(/^::ffff:/, '') || ip === allow);
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// ──────────────────────────────────────────────────────────────────────────────
// Minimal maintenance page cache (avoid disk I/O every request)
// ─────────────────────────────────────────────────────────────────────────────-
let maintenancePageCache = null;
// I am saving `maintenancePageCacheTime` here so the nearby steps can reuse the same value without rebuilding it each time.
let maintenancePageCacheTime = 0;
// I am saving `CACHE_TTL_MS` here so the nearby steps can reuse the same value without rebuilding it each time.
const CACHE_TTL_MS = 30_000;

/** Load the dedicated maintenance page if present; else return a tiny safe inline HTML. */
function loadMaintenancePage() {
  // I am saving `now` here so the nearby steps can reuse the same value without rebuilding it each time.
  const now = Date.now();

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (maintenancePageCache && (now - maintenancePageCacheTime) < CACHE_TTL_MS) {
    // This return sends the completed value or response back to the code that called this function.
    return maintenancePageCache;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (fs.existsSync(MAINTENANCE_CONFIG.pagePath)) {
      // I am keeping this line here because the surrounding maintenanceGuard.js workflow expects this value or operation before it continues.
      maintenancePageCache = fs.readFileSync(MAINTENANCE_CONFIG.pagePath, 'utf8');
      // I am keeping this line here because the surrounding maintenanceGuard.js workflow expects this value or operation before it continues.
      maintenancePageCacheTime = now;
      // This return sends the completed value or response back to the code that called this function.
      return maintenancePageCache;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (err) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.warn(
      // I am keeping this line here because the surrounding maintenanceGuard.js workflow expects this value or operation before it continues.
      { event: 'maintenance.page_load_failed', path: MAINTENANCE_CONFIG.pagePath, error: err.message },
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      'Failed to load dedicated maintenance page file'
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    );
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // Safe fallback (minified and escaped)
  const msg = escapeHtml(MAINTENANCE_CONFIG.message);
  // I am keeping this line here because the surrounding maintenanceGuard.js workflow expects this value or operation before it continues.
  maintenancePageCache =
    // I am keeping this line here because the surrounding maintenanceGuard.js workflow expects this value or operation before it continues.
    '<!doctype html><html lang="en"><head><meta charset="utf-8">'+
    // I am keeping this line here because the surrounding maintenanceGuard.js workflow expects this value or operation before it continues.
    '<meta name="viewport" content="width=device-width,initial-scale=1">'+
    // I am keeping this line here because the surrounding maintenanceGuard.js workflow expects this value or operation before it continues.
    '<title>Maintenance</title>'+
    // inline CSS only; no scripts; no external refs
    '<style>body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,"Helvetica Neue",Arial,sans-serif;background:#f5f5f5;color:#111}'+
    // I am keeping this line here because the surrounding maintenanceGuard.js workflow expects this value or operation before it continues.
    '.wrap{max-width:640px;margin:12vh auto;background:#fff;padding:32px 28px;border-radius:10px;box-shadow:0 2px 12px rgba(0,0,0,.08);text-align:center}'+
    // I am keeping this line here because the surrounding maintenanceGuard.js workflow expects this value or operation before it continues.
    'h1{margin:0 0 8px 0;font-size:26px;font-weight:700}p{margin:8px 0 0 0;line-height:1.55;color:#444}</style>'+
    // I am keeping this line here because the surrounding maintenanceGuard.js workflow expects this value or operation before it continues.
    '</head><body><main class="wrap"><h1>Maintenance Mode</h1>'+
    // I am keeping this line here because the surrounding maintenanceGuard.js workflow expects this value or operation before it continues.
    `<p>${msg}</p><p>Please check back shortly.</p>`+
    // I am keeping this line here because the surrounding maintenanceGuard.js workflow expects this value or operation before it continues.
    '</main></body></html>';

  // I am keeping this line here because the surrounding maintenanceGuard.js workflow expects this value or operation before it continues.
  maintenancePageCacheTime = now;
  // This return sends the completed value or response back to the code that called this function.
  return maintenancePageCache;
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// ──────────────────────────────────────────────────────────────────────────────
// Maintenance state (Redis first, then env default)
// ─────────────────────────────────────────────────────────────────────────────-
async function getMaintenanceMode(redisClient) {
  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (redisClient && redisClient.isReady) {
      // I am saving `v` here so the nearby steps can reuse the same value without rebuilding it each time.
      const v = await redisClient.get(MAINTENANCE_CONFIG.key);
      // This return sends the completed value or response back to the code that called this function.
      return v || MAINTENANCE_CONFIG.default;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (err) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.debug(
      // I am keeping this line here because the surrounding maintenanceGuard.js workflow expects this value or operation before it continues.
      { event: 'maintenance.redis_check_failed', error: err.message },
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      'Redis maintenance check failed; falling back to env default'
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    );
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
  // This return sends the completed value or response back to the code that called this function.
  return MAINTENANCE_CONFIG.default;
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// ──────────────────────────────────────────────────────────────────────────────
function sendMaintenanceResponse(req, res) {
  // Very strict, minimal headers
  res.set({
    // Do not cache, anywhere
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    'Pragma': 'no-cache',
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    'Expires': '0',

    // Retry hint
    'Retry-After': String(MAINTENANCE_CONFIG.retryAfter),

    // SEO: never index the maintenance page
    'X-Robots-Tag': 'noindex, nofollow, noarchive',

    // Lock everything down
    'X-Frame-Options': 'DENY',
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    'X-Content-Type-Options': 'nosniff',
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    'Referrer-Policy': 'no-referrer',
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    'Cross-Origin-Opener-Policy': 'same-origin',
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    'Cross-Origin-Resource-Policy': 'same-origin',
    // I am keeping this line here because the surrounding maintenanceGuard.js workflow expects this value or operation before it continues.
    'Permissions-Policy':
      // I am keeping this line here because the surrounding maintenanceGuard.js workflow expects this value or operation before it continues.
      'accelerometer=(),camera=(),display-capture=(),document-domain=(),encrypted-media=(),geolocation=(),' +
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      'gyroscope=(),magnetometer=(),microphone=(),midi=(),payment=(),usb=(),sync-xhr=()',

    // We vary on Accept (HTML vs JSON)
    'Vary': 'Accept'
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });

  // Content negotiation
  const acceptsJson = req.path.startsWith('/api/') || (req.get('Accept') || '').includes('application/json');
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (acceptsJson) {
    // This return sends the completed value or response back to the code that called this function.
    return res.status(503).json({
      // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
      error: 'maintenance_mode',
      // I am keeping the `message` field in this object so the receiving code can read that value by its expected name.
      message: 'Service temporarily unavailable for maintenance',
      // I am keeping the `retryAfter` field in this object so the receiving code can read that value by its expected name.
      retryAfter: MAINTENANCE_CONFIG.retryAfter
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // Tightest possible CSP to render the tiny HTML/CSS only
  res.set(
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    'Content-Security-Policy',
    // I am keeping this line here because the surrounding maintenanceGuard.js workflow expects this value or operation before it continues.
    "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; " +
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    "img-src 'self' data:; style-src 'unsafe-inline';"
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  );

  // I am building or sending the Express response here with the status, data, or page already chosen by this route.
  res.type('html').status(503).send(loadMaintenancePage());
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// ─────────────────────────────────────────────────────────────────────────────-
function createMaintenanceGuard(redisClient) {
  // This return sends the completed value or response back to the code that called this function.
  return async (req, res, next) => {
    // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
    try {
      // 1) Health + ACME must always pass
      if (isAllowedPath(req)) return next();

      // 2) Ops IPs always pass
      if (isAllowedIP(req)) {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        logger.debug(
          // I am keeping this line here because the surrounding maintenanceGuard.js workflow expects this value or operation before it continues.
          { event: 'maintenance.allow_passthrough', clientIp: clientIp(req), path: req.path, method: req.method },
          // I am listing this entry here because the surrounding collection processes each allowed value in order.
          'Maintenance allowlist passthrough'
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        );
        // This return sends the completed value or response back to the code that called this function.
        return next();
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }

      // 3) Check mode
      const mode = await getMaintenanceMode(redisClient);
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (mode === 'on') {
        // 3a) Optional owner bypass (if token is configured)
        if (MAINTENANCE_CONFIG.bypassToken) {
          // I am saving `presented` here so the nearby steps can reuse the same value without rebuilding it each time.
          const presented = req.get('x-maintenance-bypass');
          // This check helps me choose or stop the next path before any work that depends on this condition runs.
          if (safeEquals(presented, MAINTENANCE_CONFIG.bypassToken)) {
            // I am calling this helper here so the current workflow performs this step before it moves on.
            logger.debug(
              // I am keeping this line here because the surrounding maintenanceGuard.js workflow expects this value or operation before it continues.
              { event: 'maintenance.bypass_token_ok', path: req.path, method: req.method },
              // I am listing this entry here because the surrounding collection processes each allowed value in order.
              'Maintenance bypass token accepted'
            // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
            );
            // This return sends the completed value or response back to the code that called this function.
            return next();
          // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
          }
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }

        // 3b) Otherwise block with 503
        logger.info(
          // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
          {
            // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
            event: 'maintenance.block',
            // I am keeping the `clientIp` field in this object so the receiving code can read that value by its expected name.
            clientIp: clientIp(req),
            // I am keeping the `path` field in this object so the receiving code can read that value by its expected name.
            path: req.path,
            // I am keeping the `method` field in this object so the receiving code can read that value by its expected name.
            method: req.method,
            // I am keeping the `ua` field in this object so the receiving code can read that value by its expected name.
            ua: req.get('User-Agent'),
            // I am keeping the `retryAfter` field in this object so the receiving code can read that value by its expected name.
            retryAfter: MAINTENANCE_CONFIG.retryAfter
          // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
          },
          // I am listing this entry here because the surrounding collection processes each allowed value in order.
          'Request blocked during maintenance'
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        );

        // This return sends the completed value or response back to the code that called this function.
        return sendMaintenanceResponse(req, res);
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }

      // 4) Not in maintenance
      return next();
    // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
    } catch (err) {
      // Fail open: never brick the site because of the guard itself
      logger.error(
        // I am keeping this line here because the surrounding maintenanceGuard.js workflow expects this value or operation before it continues.
        { event: 'maintenance.guard_error', error: err.message, clientIp: clientIp(req), path: req.path },
        // I am listing this entry here because the surrounding collection processes each allowed value in order.
        'Maintenance guard error - allowing request through'
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      );
      // This return sends the completed value or response back to the code that called this function.
      return next();
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  };
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am exporting this value here so another module can deliberately reuse the completed piece from maintenanceGuard.js.
module.exports = createMaintenanceGuard;