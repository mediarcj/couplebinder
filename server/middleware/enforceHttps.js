// File: server/middleware/enforceHttps.js
// Description: HTTPS enforcement middleware for production behind Cloudflare
// Purpose: Redirect HTTP to HTTPS using canonical public origin
// Notes: Respects X-Forwarded-Proto, CF-Visitor, and PUBLIC_ORIGIN env var

/**
 * WHAT:
 * We enforce HTTPS in production by redirecting HTTP requests to HTTPS.
 *
 * WHY:
 * Security requires all traffic to be encrypted. Behind Cloudflare, we need
 * to trust proxy headers and use the canonical public domain, not internal IPs.
 *
 * HOW:
 * Check X-Forwarded-Proto and CF-Visitor headers. If HTTP, redirect to
 * PUBLIC_ORIGIN + path. Use 308 to preserve method/body for POST requests.
 */

/**
 * Parse Cloudflare visitor header (JSON)
 * @param {string} header - CF-Visitor header value
 * @returns {Object} - Parsed object or empty object if invalid
 */
function parseCfVisitor(header) {
  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // This return sends the completed value or response back to the code that called this function.
    return JSON.parse(header || '{}');
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch {
    // This return sends the completed value or response back to the code that called this function.
    return {};
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * Build canonical base URL for redirects
 * 
 * WHAT:
 * Determine the public-facing base URL for redirects.
 * 
 * WHY:
 * We never want to redirect to internal IPs or guess the domain.
 * PUBLIC_ORIGIN env var is the source of truth.
 * 
 * HOW:
 * 1. Prefer PUBLIC_ORIGIN from env (explicit, no guessing)
 * 2. Fallback: derive from Host header, strip port, assume https
 * 3. Never use req.socket.localAddress or req.ip
 * 
 * @param {Object} req - Express request object
 * @returns {string} - Canonical base URL (e.g., from PUBLIC_ORIGIN env)
 */
function buildCanonicalBase(req) {
  // I am loading `../config` into `config` so this file can reuse that dependency below.
  const { config } = require('../config');
  // Prefer explicitly-set PUBLIC_ORIGIN (best practice, no guessing)
  if (config.publicOrigin) {
    // This return sends the completed value or response back to the code that called this function.
    return config.publicOrigin;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // Fallback: derive from Host header (strip any port)
  const host = (req.headers.host || '').replace(/:\d+$/, '');
  // This return sends the completed value or response back to the code that called this function.
  return `https://${host}`;
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * Check if request is already HTTPS
 * 
 * WHAT:
 * Determine if the request arrived over HTTPS at Cloudflare.
 * 
 * WHY:
 * With trust proxy enabled, req.secure reflects X-Forwarded-Proto.
 * We also check CF-Visitor for Cloudflare-specific detection.
 * 
 * HOW:
 * 1. Check req.secure (trust proxy makes this work)
 * 2. Check X-Forwarded-Proto header
 * 3. Check CF-Visitor.scheme (Cloudflare-specific)
 * 
 * @param {Object} req - Express request object
 * @returns {boolean} - True if HTTPS, false otherwise
 */
function isAlreadyHttps(req) {
  // With trust proxy, req.secure reflects X-Forwarded-Proto
  if (req.secure) return true;

  // I am saving `xfp` here so the nearby steps can reuse the same value without rebuilding it each time.
  const xfp = (req.headers['x-forwarded-proto'] || '').toLowerCase();
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (xfp === 'https') return true;

  // I am saving `cf` here so the nearby steps can reuse the same value without rebuilding it each time.
  const cf = parseCfVisitor(req.headers['cf-visitor']);
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (cf.scheme === 'https') return true;

  // This return sends the completed value or response back to the code that called this function.
  return false;
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * Main HTTPS enforcement middleware
 * 
 * WHAT:
 * Redirect HTTP requests to HTTPS using canonical public origin.
 * 
 * WHY:
 * All traffic must be encrypted in production. We respect Cloudflare
 * proxy headers and never leak internal IPs in redirect URLs.
 * 
 * HOW:
 * 1. Check if ENFORCE_HTTPS is enabled
 * 2. Check if request is already HTTPS
 * 3. Build canonical redirect URL with PUBLIC_ORIGIN
 * 4. Redirect with 308 (preserves method/body)
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
function enforceHttps(req, res, next) {
  // Load config once and use it for the guard
  const { config } = require('../config');
  // Allow HTTP in local dev or when explicitly disabled
  if (config.server.nodeEnv === 'development' || !config.security.enforceHttps) {
    // This return sends the completed value or response back to the code that called this function.
    return next();
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // Stripe webhooks must never be redirected or mutated. They require the original raw body for signature verification.
  // Let them pass through exactly as-is.
  if (req.path === '/api/stripe/webhook') return next();

  // (config-based checks already handled above)

  // Skip if request is already HTTPS
  if (isAlreadyHttps(req)) {
    // This return sends the completed value or response back to the code that called this function.
    return next();
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // Build canonical redirect URL (never uses internal IPs)
  const base = buildCanonicalBase(req);   // e.g., from PUBLIC_ORIGIN env
  const loc = base + req.originalUrl;     // preserve path and query

  // Use 308 to preserve method/body for POSTs if they ever hit HTTP
  // (Cloudflare should always upgrade, but defense in depth)
  return res.redirect(308, loc);
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am exporting this value here so another module can deliberately reuse the completed piece from enforceHttps.js.
module.exports = enforceHttps;

