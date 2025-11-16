// File: server/middleware/healthShield.js
// Description: Access control for health check endpoints
// Purpose: Protect health endpoints from public access while allowing monitoring
// Notes: Supports token, IP allowlist, and public mode for local development

const { config } = require('../config');

/**
 * WHAT:
 * We gate health endpoints to prevent public exposure of operational details.
 *
 * WHY:
 * Health endpoints can leak system architecture, versions, and infrastructure details
 * to attackers. We allow authorized monitoring tools while blocking random internet
 * requests.
 *
 * HOW:
 * 1. If HEALTH_PUBLIC=true, allow (dev/local only)
 * 2. If X-Health-Token header matches env var, allow
 * 3. If client IP is in allowlist, allow
 * 4. Otherwise 403 with no-store cache control
 */

/**
 * Extract client IP from request
 * Respects Cloudflare and other proxies
 * @param {Object} req - Express request object
 * @returns {string} - Normalized IP address
 */
function getClientIp(req) {
  const cfIp = req.headers['cf-connecting-ip'];
  if (cfIp) return cfIp;

  const xff = req.headers['x-forwarded-for'];
  if (xff) {
    // Take first IP if multiple
    const firstIp = String(xff).split(',')[0].trim();
    if (firstIp) return firstIp;
  }

  const directIp = req.ip;
  if (directIp) return directIp.replace('::ffff:', '');

  const remote = req.connection && req.connection.remoteAddress;
  if (remote) return remote.replace('::ffff:', '');

  return '';
}

/**
 * Check if request is authorized to access health endpoints
 * @param {Object} req - Express request object
 * @returns {Object} - { authorized: boolean, reason: string }
 */
function checkAccess(req) {
  // Public mode (dev/local only) - use config.health.public
  if (config.health?.public === true) {
    return { authorized: true, reason: 'public_mode' };
  }

  // Token-based auth - use config.ops.token or config.health.token
  const expectedToken = (config.ops?.token || config.health?.token || '').trim();
  const providedToken = req.get('X-Ops-Token') || req.get('X-Health-Token') || '';
  if (expectedToken && providedToken && expectedToken === providedToken) {
    return { authorized: true, reason: 'token_match' };
  }

  // IP allowlist - use config.health.allowlist
  const ip = getClientIp(req);
  const allowlist = (config.health?.allowlist || []).map(String);

  if (allowlist.includes(ip)) {
    return { authorized: true, reason: 'ip_allowlist' };
  }

  return { authorized: false, reason: 'no_match' };
}

/**
 * Health shield middleware
 * Gates /health endpoints based on token, IP, or public mode
 *
 * WHAT:
 * Blocks unauthorized access to health endpoints.
 *
 * WHY:
 * Health endpoints expose operational details that should not be public.
 *
 * HOW:
 * Check token header, IP allowlist, or public mode flag.
 * Return 403 if none match.
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
function healthShield(req, res, next) {
  try {
    const { authorized } = checkAccess(req);

    if (authorized) {
      return next();
    }

    // Deny access
    res.set('Cache-Control', 'no-store');
    return res.status(403).json({
      ok: false,
      error: 'forbidden'
    });
  } catch (e) {
    // Fail closed on any error
    res.set('Cache-Control', 'no-store');
    return res.status(403).json({
      ok: false,
      error: 'forbidden'
    });
  }
}

module.exports = healthShield;

