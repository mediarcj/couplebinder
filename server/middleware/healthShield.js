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
  // I am saving `cfIp` here so the nearby steps can reuse the same value without rebuilding it each time.
  const cfIp = req.headers['cf-connecting-ip'];
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (cfIp) return cfIp;

  // I am saving `xff` here so the nearby steps can reuse the same value without rebuilding it each time.
  const xff = req.headers['x-forwarded-for'];
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (xff) {
    // Take first IP if multiple
    const firstIp = String(xff).split(',')[0].trim();
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (firstIp) return firstIp;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am saving `directIp` here so the nearby steps can reuse the same value without rebuilding it each time.
  const directIp = req.ip;
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (directIp) return directIp.replace('::ffff:', '');

  // I am saving `remote` here so the nearby steps can reuse the same value without rebuilding it each time.
  const remote = req.connection && req.connection.remoteAddress;
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (remote) return remote.replace('::ffff:', '');

  // This return sends the completed value or response back to the code that called this function.
  return '';
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * Check if request is authorized to access health endpoints
 * @param {Object} req - Express request object
 * @returns {Object} - { authorized: boolean, reason: string }
 */
function checkAccess(req) {
  // Public mode (dev/local only) - use config.health.public
  if (config.health?.public === true) {
    // This return sends the completed value or response back to the code that called this function.
    return { authorized: true, reason: 'public_mode' };
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // Token-based auth - use config.ops.token or config.health.token
  const expectedToken = (config.ops?.token || config.health?.token || '').trim();
  // I am saving `providedToken` here so the nearby steps can reuse the same value without rebuilding it each time.
  const providedToken = req.get('X-Ops-Token') || req.get('X-Health-Token') || '';
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (expectedToken && providedToken && expectedToken === providedToken) {
    // This return sends the completed value or response back to the code that called this function.
    return { authorized: true, reason: 'token_match' };
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // IP allowlist - use config.health.allowlist
  const ip = getClientIp(req);
  // I am saving `allowlist` here so the nearby steps can reuse the same value without rebuilding it each time.
  const allowlist = (config.health?.allowlist || []).map(String);

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (allowlist.includes(ip)) {
    // This return sends the completed value or response back to the code that called this function.
    return { authorized: true, reason: 'ip_allowlist' };
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // This return sends the completed value or response back to the code that called this function.
  return { authorized: false, reason: 'no_match' };
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
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
  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // I am saving `authorized` here so the nearby steps can reuse the same value without rebuilding it each time.
    const { authorized } = checkAccess(req);

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (authorized) {
      // This return sends the completed value or response back to the code that called this function.
      return next();
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // Deny access
    res.set('Cache-Control', 'no-store');
    // This return sends the completed value or response back to the code that called this function.
    return res.status(403).json({
      // I am keeping the `ok` field in this object so the receiving code can read that value by its expected name.
      ok: false,
      // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
      error: 'forbidden'
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (e) {
    // Fail closed on any error
    res.set('Cache-Control', 'no-store');
    // This return sends the completed value or response back to the code that called this function.
    return res.status(403).json({
      // I am keeping the `ok` field in this object so the receiving code can read that value by its expected name.
      ok: false,
      // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
      error: 'forbidden'
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am exporting this value here so another module can deliberately reuse the completed piece from healthShield.js.
module.exports = healthShield;

