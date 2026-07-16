// File: server/middleware/blockCmsScans.js
// Description: Quick 404 for common Internet scanner paths
// Purpose: Reduce noise in logs and prevent unnecessary processing
// Notes: Default list is conservative; add/remove patterns as needed

/**
 * WHAT:
 * Middleware to block common CMS scanner paths (WordPress, PHP, etc.).
 * 
 * WHY:
 * Internet scanners constantly probe for vulnerable CMS installations.
 * These requests waste server resources and clutter logs.
 * 
 * HOW:
 * Check request path against a list of common scanner patterns.
 * Return 404 immediately without hitting routes or error handlers.
 */

/**
 * Create CMS scan blocking middleware
 * @returns {Function} Express middleware
 */
module.exports = function blockCmsScans() {
  /**
   * Common scanner patterns to block
   * 
   * WHAT:
   * Regex patterns matching common vulnerability scanner paths.
   * 
   * WHY:
   * These paths are never legitimate on our Node.js application.
   * Blocking them early saves processing and reduces log noise.
   * 
   * HOW:
   * Test request path against each pattern and return 404 on match.
   */
  const patterns = [
    /\.php$/i, // PHP files
    /^\/(wp-|xmlrpc|adminer|vendor|owa|config|phpmyadmin|muieblackcat)/i, // Common CMS/admin paths
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  ];

  // This return sends the completed value or response back to the code that called this function.
  return (req, res, next) => {
    // Check if path matches any scanner pattern
    if (patterns.some(rx => rx.test(req.path))) {
      // Return 404 immediately (no logging, no processing)
      return res.status(404).end();
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    // I am calling this helper here so the current workflow performs this step before it moves on.
    next();
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  };
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
};

