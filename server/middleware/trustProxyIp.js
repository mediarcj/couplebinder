/**
 * Description: Expose the client IP already resolved by Express's trusted proxy chain.
 *
 * Configures Express to trust the first proxy (Cloudflare) and extracts the real
 * client IP address from Cloudflare headers.
 *
 * When behind Cloudflare/AWS, req.ip shows the proxy IP, not the real user IP.
 * We need the real IP for logs, rate limiting, and security audit trails.
 *
 * Nginx accepts Cloudflare's real-IP header only from configured Cloudflare networks.
 * Express then resolves req.ip using its configured proxy-hop boundary.
 * Exposes it as req.clientIp for easy access in routes and middleware.
 */

module.exports = function trustProxyIp(_app) {
  // Trust proxy configuration (already set in zorvalon.js)
  // NOTE: trust proxy is set in zorvalon.js before this middleware
  // We do NOT override it here - just extract the client IP
  
  // Never read forwarding headers directly here. Direct-origin requests must not be
  // able to choose the address used by security controls.
  return function (req, res, next) {
    req.clientIp = req.ip;
    next();
  };
};
