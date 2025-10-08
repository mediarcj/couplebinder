// File: server/middleware/corsDebug.js
// Description: Logs CORS preflight details & outcomes for debugging
// Purpose: Temporary troubleshooting tool for CORS issues
// Notes: Keep disabled in production unless actively debugging

/**
 * WHAT:
 * Middleware to log CORS request details for debugging.
 * 
 * WHY:
 * CORS issues can be difficult to debug without visibility into
 * preflight requests and origin headers.
 * 
 * HOW:
 * Log details of OPTIONS requests and requests with Origin headers.
 * Output is JSON for easy parsing in log aggregation tools.
 */

/**
 * Create CORS debug logging middleware
 * @returns {Function} Express middleware
 */
module.exports = function corsDebug() {
  return (req, res, next) => {
    // Only log CORS-related requests
    if (req.method === 'OPTIONS' || req.headers.origin) {
      const debugInfo = {
        path: req.path,
        method: req.method,
        origin: req.headers.origin,
        acrm: req.headers['access-control-request-method'],
        acrh: req.headers['access-control-request-headers'],
      };
      
      // Log to console (visible in journalctl/cloudwatch)
      // eslint-disable-next-line no-console
      console.warn('[CORS-DEBUG]', JSON.stringify(debugInfo));
    }
    next();
  };
};

