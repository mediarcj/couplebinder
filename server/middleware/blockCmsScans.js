// Description: Quick 404 for common Internet scanner paths
// Purpose: Reduce noise in logs and prevent unnecessary processing
// Notes: Default list is conservative; add/remove patterns as needed

/**
 * Middleware to block common CMS scanner paths (WordPress, PHP, etc.).
 * 
 * Internet scanners constantly probe for vulnerable CMS installations.
 * These requests waste server resources and clutter logs.
 * 
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
   * Regex patterns matching common vulnerability scanner paths.
   * 
   * These paths are never legitimate on our Node.js application.
   * Blocking them early saves processing and reduces log noise.
   * 
   * Test request path against each pattern and return 404 on match.
   */
  const patterns = [
    /\.php$/i, // PHP files
    /^\/(wp-|xmlrpc|adminer|vendor|owa|config|phpmyadmin|muieblackcat)/i, // Common CMS/admin paths
  ];

  return (req, res, next) => {
    // Check if path matches any scanner pattern
    if (patterns.some(rx => rx.test(req.path))) {
      // Return 404 immediately (no logging, no processing)
      return res.status(404).end();
    }
    next();
  };
};

