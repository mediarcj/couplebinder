/**
 * File: requireAuthByDefault.js
 * Description: Default-deny authentication guard for sensitive path prefixes
 * Purpose: Prevents accidental anonymous access to protected areas by enforcing authentication at the router level
 * Security: Backend as source of truth - explicit allowlist of public paths
 */

const micromatch = require('micromatch');
const logger = require('../utils/logger');

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
  return Array.isArray(globs) ? globs.filter(Boolean) : [];
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
  const {
    publicGlobs = [],
    logger: customLogger = logger
  } = opts;

  const whitelist = compilePublicGlobs(publicGlobs);

  return function guard(req, res, next) {
    const path = req.path || req.url || '';
    const isPublic = whitelist.length && micromatch.isMatch(path, whitelist);

    if (isPublic) {
      return next();
    }

    // If route is not public, require authenticated user
    if (req.user && req.user.id) {
      return next();
    }

    // Log the blocked request for security monitoring
    if (customLogger) {
      customLogger.info({
        event: 'auth.default_deny',
        path,
        method: req.method,
        requestId: req.requestId,
        reason: 'no_authenticated_user'
      }, 'Default-deny guard: Blocking unauthenticated request');
    }

    res.status(401).json({ 
      error: 'auth_required',
      message: 'Authentication required for this endpoint'
    });
  };
}

module.exports = requireAuthByDefault;
