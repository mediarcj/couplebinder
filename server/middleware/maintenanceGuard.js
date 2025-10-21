// File: server/middleware/maintenanceGuard.js
// Description: Maintenance mode guard with Redis/env toggle and IP allowlist
// Purpose: Production-ready maintenance mode that can be toggled instantly without redeploy
// Notes: Follows existing middleware patterns and integrates with current security stack

/**
 * WHAT:
 * Maintenance mode middleware that blocks non-essential traffic during maintenance.
 * 
 * WHY:
 * Need instant maintenance toggle without redeploy for production operations.
 * Health checks and ops IPs must always pass through.
 * 
 * HOW:
 * 1. Check allowed paths (health, ACME) - always pass
 * 2. Check IP allowlist - pass if trusted
 * 3. Check maintenance mode (Redis key or env fallback)
 * 4. If maintenance ON: return 503 with Retry-After
 * 5. If maintenance OFF: continue to next middleware
 */

const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

// Configuration with sensible defaults
const MAINTENANCE_CONFIG = {
  // Redis key for maintenance toggle
  key: process.env.MAINTENANCE_KEY || 'maintenance:mode',
  
  // Environment fallback when Redis unavailable
  default: process.env.MAINTENANCE_DEFAULT || 'off',
  
  // IP allowlist (CSV format)
  allowlist: process.env.MAINTENANCE_ALLOWLIST 
    ? process.env.MAINTENANCE_ALLOWLIST.split(',').map(ip => ip.trim()).filter(Boolean)
    : ['127.0.0.1', '::1'],
  
  // Retry-After header value (seconds)
  retryAfter: parseInt(process.env.MAINTENANCE_RETRY_AFTER, 10) || 120,
  
  // Maintenance page path
  pagePath: process.env.MAINTENANCE_PAGE || path.join(__dirname, '../public/maintenance.html'),
  
  // Fallback message if page file missing
  message: process.env.MAINTENANCE_MESSAGE || 'We\'ll be back soon.',
  
  // Allowed paths that always pass through
  allowedPaths: [
    '/health/liveness',
    '/health/readiness',
    '/health',
    '/.well-known/acme-challenge/'
  ]
};

// Cache for maintenance page content (avoid reading file on every request)
let maintenancePageCache = null;
let maintenancePageCacheTime = 0;
const CACHE_TTL = 30000; // 30 seconds

/**
 * WHAT:
 * Load maintenance page content with caching to avoid file I/O on every request.
 * 
 * WHY:
 * File I/O on every maintenance request would slow down the response.
 * Cache the content and refresh periodically.
 * 
 * HOW:
 * Read file once, cache for 30 seconds, fallback to minimal HTML if file missing.
 */
function loadMaintenancePage() {
  const now = Date.now();
  
  // Return cached version if still valid
  if (maintenancePageCache && (now - maintenancePageCacheTime) < CACHE_TTL) {
    return maintenancePageCache;
  }
  
  try {
    // Try to read the maintenance page file
    if (fs.existsSync(MAINTENANCE_CONFIG.pagePath)) {
      maintenancePageCache = fs.readFileSync(MAINTENANCE_CONFIG.pagePath, 'utf8');
      maintenancePageCacheTime = now;
      return maintenancePageCache;
    }
  } catch (error) {
    logger.warn({
      event: 'maintenance.page_load_failed',
      path: MAINTENANCE_CONFIG.pagePath,
      error: error.message
    }, 'Failed to load maintenance page file');
  }
  
  // Fallback to minimal HTML
  const fallbackHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Maintenance</title>
    <style>
        body { font-family: system-ui, sans-serif; text-align: center; padding: 50px; background: #f5f5f5; }
        .container { max-width: 600px; margin: 0 auto; background: white; padding: 40px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        h1 { color: #333; margin-bottom: 20px; }
        p { color: #666; line-height: 1.6; }
    </style>
</head>
<body>
    <div class="container">
        <h1>Maintenance Mode</h1>
        <p>${MAINTENANCE_CONFIG.message}</p>
        <p>Please check back in a few minutes.</p>
    </div>
</body>
</html>`;
  
  maintenancePageCache = fallbackHtml;
  maintenancePageCacheTime = now;
  return maintenancePageCache;
}

/**
 * WHAT:
 * Check if the request path is in the allowed paths list.
 * 
 * WHY:
 * Health checks and ACME challenges must always work during maintenance.
 * 
 * HOW:
 * Check if request path starts with any allowed path pattern.
 */
function isAllowedPath(req) {
  return MAINTENANCE_CONFIG.allowedPaths.some(allowedPath => 
    req.path.startsWith(allowedPath)
  );
}

/**
 * WHAT:
 * Check if the client IP is in the maintenance allowlist.
 * 
 * WHY:
 * Ops team needs access during maintenance for monitoring and debugging.
 * 
 * HOW:
 * Use CF-Connecting-IP header (preferred) or req.ip as fallback.
 * Compare against allowlist with IPv4/IPv6 support.
 */
function isAllowedIP(req) {
  // Prefer Cloudflare real IP header
  const clientIP = req.get('CF-Connecting-IP') || req.ip;
  
  // Handle IPv6-mapped IPv4 addresses
  const normalizedIP = clientIP.replace(/^::ffff:/, '');
  
  return MAINTENANCE_CONFIG.allowlist.some(allowedIP => {
    const normalizedAllowed = allowedIP.replace(/^::ffff:/, '');
    return normalizedIP === normalizedAllowed || normalizedIP === allowedIP;
  });
}

/**
 * WHAT:
 * Check maintenance mode status from Redis or environment fallback.
 * 
 * WHY:
 * Need instant toggle capability without server restart.
 * Redis provides real-time control, env provides fallback.
 * 
 * HOW:
 * Try Redis first, fall back to environment variable if Redis unavailable.
 */
async function getMaintenanceMode(redisClient) {
  try {
    if (redisClient && redisClient.isReady) {
      const mode = await redisClient.get(MAINTENANCE_CONFIG.key);
      return mode || MAINTENANCE_CONFIG.default;
    }
  } catch (error) {
    logger.debug({
      event: 'maintenance.redis_check_failed',
      error: error.message
    }, 'Redis maintenance check failed, using env fallback');
  }
  
  return MAINTENANCE_CONFIG.default;
}

/**
 * WHAT:
 * Send maintenance response with appropriate content type and headers.
 * 
 * WHY:
 * Must return proper 503 status with Retry-After for client behavior.
 * Content negotiation between JSON (API) and HTML (browser) requests.
 * 
 * HOW:
 * Set cache headers, Retry-After, and return appropriate content.
 */
function sendMaintenanceResponse(req, res) {
  // Set maintenance-specific headers
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    'Retry-After': MAINTENANCE_CONFIG.retryAfter.toString(),
    'Vary': 'Accept'
  });
  
  // Content negotiation: JSON for API requests, HTML for browsers
  const isApiRequest = req.path.startsWith('/api/') || 
                      req.get('Accept')?.includes('application/json');
  
  if (isApiRequest) {
    res.status(503).json({
      error: 'maintenance_mode',
      message: 'Service temporarily unavailable for maintenance',
      retryAfter: MAINTENANCE_CONFIG.retryAfter
    });
  } else {
    // For HTML requests, set a narrow CSP that allows the maintenance page
    // This is the only place we modify CSP - only for maintenance responses
    res.set('Content-Security-Policy', 
      "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; font-src 'self'");
    
    res.status(503).send(loadMaintenancePage());
  }
}

/**
 * WHAT:
 * Main maintenance guard middleware function.
 * 
 * WHY:
 * Must integrate with existing middleware stack and security headers.
 * Should run after IP firewall but before auth/session middleware.
 * 
 * HOW:
 * 1. Check allowed paths - always pass
 * 2. Check IP allowlist - pass if trusted  
 * 3. Check maintenance mode - block if ON
 * 4. Continue to next middleware if OFF
 */
function createMaintenanceGuard(redisClient) {
  return async (req, res, next) => {
    try {
      // Step 1: Always allow health checks and ACME challenges
      if (isAllowedPath(req)) {
        return next();
      }
      
      // Step 2: Always allow ops team IPs
      if (isAllowedIP(req)) {
        // Log once per boot to avoid noise, then at debug level
        logger.debug({
          event: 'maintenance.allow_passthrough',
          clientIp: req.get('CF-Connecting-IP') || req.ip,
          path: req.path,
          method: req.method
        }, 'Maintenance allowlist passthrough');
        return next();
      }
      
      // Step 3: Check maintenance mode status
      const mode = await getMaintenanceMode(redisClient);
      
      if (mode === 'on') {
        // Log the maintenance block
        logger.info({
          event: 'maintenance.block',
          clientIp: req.get('CF-Connecting-IP') || req.ip,
          path: req.path,
          method: req.method,
          userAgent: req.get('User-Agent'),
          retryAfter: MAINTENANCE_CONFIG.retryAfter
        }, 'Request blocked during maintenance mode');
        
        // Send maintenance response
        sendMaintenanceResponse(req, res);
        return; // Don't call next()
      }
      
      // Step 4: Maintenance mode is OFF - continue to next middleware
      next();
      
    } catch (error) {
      // If maintenance guard fails, log error but don't block requests
      logger.error({
        event: 'maintenance.guard_error',
        error: error.message,
        clientIp: req.get('CF-Connecting-IP') || req.ip,
        path: req.path
      }, 'Maintenance guard error - allowing request through');
      
      // Fail open - allow request to continue
      next();
    }
  };
}

module.exports = createMaintenanceGuard;
