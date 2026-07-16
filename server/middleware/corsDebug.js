// Description: Logs CORS preflight details & outcomes for debugging
// Purpose: Temporary troubleshooting tool for CORS issues
// Notes: Keep disabled in production unless actively debugging

const logger = require('../utils/logger');

/**
 * Middleware to log CORS request details for debugging.
 * 
 * CORS issues can be difficult to debug without visibility into
 * preflight requests and origin headers.
 * 
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
      
      logger.warn({
        event: 'cors.debug',
        ...debugInfo
      }, 'CORS debug info');
    }
    next();
  };
};

