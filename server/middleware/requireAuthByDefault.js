/**
 * File: requireAuthByDefault.js
 * Description: Default-deny authentication guard for sensitive path prefixes
 * Purpose: Prevents accidental anonymous access to protected areas by enforcing authentication at the router level
 * Security: Backend as source of truth - explicit allowlist of public paths
 */

const micromatch = require('micromatch');
// I am loading `../utils/logger` into `logger` so this file can reuse that dependency below.
const logger = require('../utils/logger');
// I am loading `../utils/errorResponder` into `respondError` so this file can reuse that dependency below.
const { respondError } = require('../utils/errorResponder');

/**
 * WHAT:
 * Compiles and validates public path globs for the default-deny guard.
 * 
 * WHY:
 * We need a whitelist of paths that should remain public even in protected prefixes.
 * This prevents the guard from accidentally blocking legitimate public resources.
 * 
 * HOW:
 * Filters out empty/falsy values and returns a clean array of glob patterns.
 * 
 * @param {Array|undefined} globs - Array of glob patterns for public paths
 * @returns {Array} Cleaned array of glob patterns
 */
function compilePublicGlobs(globs = []) {
  // This return sends the completed value or response back to the code that called this function.
  return Array.isArray(globs) ? globs.filter(Boolean) : [];
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * WHAT:
 * Creates an Express middleware that enforces authentication by default for sensitive prefixes.
 * 
 * WHY:
 * The auth bridge currently fails open (sets req.user=null and continues). This creates a security risk
 * where future routes might accidentally allow anonymous access. This guard provides fail-closed behavior.
 * 
 * HOW:
 * Uses micromatch to check if the current path matches any public glob patterns.
 * If not public and no authenticated user, returns 401. Otherwise, continues to next middleware.
 * 
 * @param {Object} opts - Configuration options
 * @param {Array} opts.publicGlobs - Array of glob patterns for public paths
 * @param {Object} opts.logger - Logger instance (optional, defaults to module logger)
 * @returns {Function} Express middleware function
 */
function requireAuthByDefault(opts = {}) {
  // I am saving this value here so the nearby steps can reuse the same value without rebuilding it each time.
  const {
    // I am keeping this line here because the surrounding requireAuthByDefault.js workflow expects this value or operation before it continues.
    publicGlobs = [],
    // I am keeping the `logger` field in this object so the receiving code can read that value by its expected name.
    logger: customLogger = logger
  // I am keeping this line here because the surrounding requireAuthByDefault.js workflow expects this value or operation before it continues.
  } = opts;

  // I am saving `whitelist` here so the nearby steps can reuse the same value without rebuilding it each time.
  const whitelist = compilePublicGlobs(publicGlobs);

  // This return sends the completed value or response back to the code that called this function.
  return function guard(req, res, next) {
    // Use originalUrl for full path matching (includes /api prefix)
    const path = req.originalUrl || req.path || req.url || '';
    // I am saving `isPublic` here so the nearby steps can reuse the same value without rebuilding it each time.
    const isPublic = whitelist.length && micromatch.isMatch(path, whitelist);

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (isPublic) {
      // This return sends the completed value or response back to the code that called this function.
      return next();
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // If route is not public, require authenticated user
    if (req.user && req.user.id) {
      // This return sends the completed value or response back to the code that called this function.
      return next();
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // Log the blocked request for security monitoring
    if (customLogger) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      customLogger.info({
        // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
        event: 'auth.default_deny',
        // I am keeping this line here because the surrounding requireAuthByDefault.js workflow expects this value or operation before it continues.
        path,
        // I am keeping the `method` field in this object so the receiving code can read that value by its expected name.
        method: req.method,
        // I am keeping the `requestId` field in this object so the receiving code can read that value by its expected name.
        requestId: req.requestId,
        // I am keeping the `reason` field in this object so the receiving code can read that value by its expected name.
        reason: 'no_authenticated_user'
      // I am keeping this line here because the surrounding requireAuthByDefault.js workflow expects this value or operation before it continues.
      }, 'Default-deny guard: Blocking unauthenticated request');
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // Use centralized error responder for consistent HTML/JSON/text responses
    return respondError(req, res, {
      // I am keeping the `status` field in this object so the receiving code can read that value by its expected name.
      status: 401,
      // I am keeping the `message` field in this object so the receiving code can read that value by its expected name.
      message: 'Authentication required for this endpoint',
      // I am keeping the `code` field in this object so the receiving code can read that value by its expected name.
      code: 'auth_required'
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  };
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am exporting this value here so another module can deliberately reuse the completed piece from requireAuthByDefault.js.
module.exports = requireAuthByDefault;
