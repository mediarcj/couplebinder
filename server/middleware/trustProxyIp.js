/**
 * Description: Trust first proxy and expose req.clientIp using Cloudflare header.
 *
 * Configures Express to trust the first proxy (Cloudflare) and extracts the real
 * client IP address from Cloudflare headers.
 *
 * When behind Cloudflare/AWS, req.ip shows the proxy IP, not the real user IP.
 * We need the real IP for logs, rate limiting, and security audit trails.
 *
 * Sets Express 'trust proxy' to 1 (trust first hop). Then extracts IP from
 * cf-connecting-ip (Cloudflare) or x-forwarded-for (standard), falling back to req.ip.
 * Exposes it as req.clientIp for easy access in routes and middleware.
 */

module.exports = function trustProxyIp(app) {
  // Trust proxy configuration (already set in zorvalon.js)
  // NOTE: trust proxy is set in zorvalon.js before this middleware
  // We do NOT override it here - just extract the client IP
  
  // Extract and expose real client IP
  return function (req, res, next) {
    // Cloudflare provides cf-connecting-ip with the real client IP
    // Fall back to x-forwarded-for (first IP) or req.ip
    req.clientIp =
      req.headers['cf-connecting-ip'] ||
      (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
      req.ip;
    
    next();
  };
};

