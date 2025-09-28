// File: server/middleware/rateLimiting.js
// Description: Rate limiting middleware for request throttling
// Purpose: Prevents abuse by limiting requests per IP address within a time window
// Notes: Uses in-memory storage for tracking request counts per IP

/**
 * WHAT:
 * We create a rate limiting middleware that tracks requests per IP address
 * and blocks requests that exceed the configured limits.
 *
 * WHY:
 * Rate limiting prevents abuse and protects the server from being overwhelmed
 * by too many requests from a single source.
 *
 * HOW:
 * We maintain a Map of IP addresses to request counts and timestamps,
 * cleaning up old entries and blocking requests that exceed the limit.
 */

const { config } = require('../config');

// In-memory storage for request tracking
const requestCounts = new Map();

/**
 * Rate limiting middleware factory
 * @param {object} options - Rate limiting configuration
 * @returns {function} Express middleware function
 */
function createRateLimit(options = {}) {
  const windowMs = options.windowMs || config.rateLimit.windowMs;
  const max = options.max || config.rateLimit.max;
  const message = options.message || config.rateLimit.message;

  return (req, res, next) => {
    const clientIP = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    
    // Clean up old entries to prevent memory leaks
    for (const [ip, data] of requestCounts.entries()) {
      if (now - data.firstRequest > windowMs) {
        requestCounts.delete(ip);
      }
    }
    
    // Check current IP
    if (!requestCounts.has(clientIP)) {
      // First request from this IP
      requestCounts.set(clientIP, { count: 1, firstRequest: now });
      console.log(`Rate limiting: New IP ${clientIP}, Count: 1`);
    } else {
      const data = requestCounts.get(clientIP);
      if (now - data.firstRequest > windowMs) {
        // Reset window for this IP
        requestCounts.set(clientIP, { count: 1, firstRequest: now });
        console.log(`Rate limiting: Reset window for IP ${clientIP}, Count: 1`);
      } else {
        // Increment count within window
        data.count++;
        console.log(`Rate limiting: IP ${clientIP}, Count: ${data.count}`);
        
        if (data.count > max) {
          // Rate limit exceeded
          console.log(`Rate limiting: Blocked IP ${clientIP}, Count: ${data.count}`);
          const retryAfter = Math.ceil((windowMs - (now - data.firstRequest)) / 1000);
          
          // 429 handler - Rate limit exceeded (handled by custom rate limiting middleware)
          return res.status(429).send(`
            <!DOCTYPE html>
            <html>
            <head>
              <title>Rate Limit Exceeded - Detechify</title>
              <style>
                body { font-family: Arial, sans-serif; text-align: center; margin-top: 100px; }
                .error { color: #dc3545; font-size: 24px; }
                .description { color: #666; margin: 20px 0; }
                .retry { color: #007bff; font-weight: bold; }
              </style>
            </head>
            <body>
              <h1 class="error">429 - Too Many Requests</h1>
              <p class="description">The server has blocked you because you've sent too many requests in a short period. Please try again later.</p>
              <p class="retry">You can try again in ${retryAfter} seconds</p>
              <p><a href="/">Return to Home</a></p>
            </body>
            </html>
          `);
        }
      }
    }
    
    next();
  };
}

/**
 * Get current rate limiting statistics
 * @returns {object} Current rate limiting stats
 */
function getRateLimitStats() {
  const now = Date.now();
  const stats = {
    totalIPs: requestCounts.size,
    activeIPs: 0,
    blockedIPs: 0
  };
  
  for (const [ip, data] of requestCounts.entries()) {
    if (now - data.firstRequest <= config.rateLimit.windowMs) {
      stats.activeIPs++;
      if (data.count > config.rateLimit.max) {
        stats.blockedIPs++;
      }
    }
  }
  
  return stats;
}

/**
 * Clear rate limiting data for a specific IP
 * @param {string} ip - IP address to clear
 */
function clearRateLimitForIP(ip) {
  requestCounts.delete(ip);
  console.log(`Rate limiting: Cleared data for IP ${ip}`);
}

/**
 * Clear all rate limiting data
 */
function clearAllRateLimits() {
  requestCounts.clear();
  console.log('Rate limiting: Cleared all data');
}

module.exports = {
  createRateLimit,
  getRateLimitStats,
  clearRateLimitForIP,
  clearAllRateLimits
};
