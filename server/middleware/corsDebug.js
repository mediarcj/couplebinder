// File: server/middleware/corsDebug.js
// Description: Logs CORS preflight details & outcomes for debugging
// Purpose: Temporary troubleshooting tool for CORS issues
// Notes: Keep disabled in production unless actively debugging

const logger = require('../utils/logger');

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
  // This return sends the completed value or response back to the code that called this function.
  return (req, res, next) => {
    // Only log CORS-related requests
    if (req.method === 'OPTIONS' || req.headers.origin) {
      // I am saving `debugInfo` here so the nearby steps can reuse the same value without rebuilding it each time.
      const debugInfo = {
        // I am keeping the `path` field in this object so the receiving code can read that value by its expected name.
        path: req.path,
        // I am keeping the `method` field in this object so the receiving code can read that value by its expected name.
        method: req.method,
        // I am keeping the `origin` field in this object so the receiving code can read that value by its expected name.
        origin: req.headers.origin,
        // I am keeping the `acrm` field in this object so the receiving code can read that value by its expected name.
        acrm: req.headers['access-control-request-method'],
        // I am keeping the `acrh` field in this object so the receiving code can read that value by its expected name.
        acrh: req.headers['access-control-request-headers'],
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      };
      
      // I am calling this helper here so the current workflow performs this step before it moves on.
      logger.warn({
        // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
        event: 'cors.debug',
        // I am keeping this line here because the surrounding corsDebug.js workflow expects this value or operation before it continues.
        ...debugInfo
      // I am keeping this line here because the surrounding corsDebug.js workflow expects this value or operation before it continues.
      }, 'CORS debug info');
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    // I am calling this helper here so the current workflow performs this step before it moves on.
    next();
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  };
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
};

