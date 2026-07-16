/**
 * File: server/middleware/trustProxyIp.js
 * Description: Trust first proxy and expose req.clientIp using Cloudflare header.
 *
 * WHAT:
 * Configures Express to trust the first proxy (Cloudflare) and extracts the real
 * client IP address from Cloudflare headers.
 *
 * WHY:
 * When behind Cloudflare/AWS, req.ip shows the proxy IP, not the real user IP.
 * We need the real IP for logs, rate limiting, and security audit trails.
 *
 * HOW:
 * Sets Express 'trust proxy' to 1 (trust first hop). Then extracts IP from
 * cf-connecting-ip (Cloudflare) or x-forwarded-for (standard), falling back to req.ip.
 * Exposes it as req.clientIp for easy access in routes and middleware.
 */

module.exports = function trustProxyIp(app) {
  // ============================================================
  // Trust proxy configuration (already set in zorvalon.js)
  // ============================================================
  // NOTE: trust proxy is set in zorvalon.js before this middleware
  // We do NOT override it here - just extract the client IP
  
  // ============================================================
  // Extract and expose real client IP
  // ============================================================
  return function (req, res, next) {
    // Cloudflare provides cf-connecting-ip with the real client IP
    // Fall back to x-forwarded-for (first IP) or req.ip
    req.clientIp =
      // I am keeping this line here because the surrounding trustProxyIp.js workflow expects this value or operation before it continues.
      req.headers['cf-connecting-ip'] ||
      // I am keeping this line here because the surrounding trustProxyIp.js workflow expects this value or operation before it continues.
      (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
      // I am keeping this line here because the surrounding trustProxyIp.js workflow expects this value or operation before it continues.
      req.ip;
    
    // I am calling this helper here so the current workflow performs this step before it moves on.
    next();
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  };
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
};

