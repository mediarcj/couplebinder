// Description: Authorization utilities and helpers
// Purpose: Provide safe access to user data and prevent naked req.user usage
// Notes: Use assertUser() instead of direct req.user access

/**
 * We provide a safe way to access user data from requests.
 *
 * Direct req.user access can lead to security issues and inconsistent error handling.
 * This helper ensures proper authentication checks and consistent error responses.
 *
 * Call assertUser(req) to get the authenticated user or throw a 401 error.
 * Use this instead of direct req.user access in route handlers.
 */

/**
 * Assert that the request has an authenticated user
 * @param {Object} req - Express request object
 * @returns {Object} - Authenticated user object
 * @throws {Error} - 401 error if user is not authenticated
 */
function assertUser(req) {
  if (!req.user || !req.user.id) {
    const err = new Error('Authentication required');
    err.status = 401;
    throw err;
  }
  return req.user;
}

/**
 * Check if the request has an authenticated user (without throwing)
 * @param {Object} req - Express request object
 * @returns {boolean} - True if user is authenticated
 */
function hasUser(req) {
  return !!(req.user && req.user.id);
}

/**
 * Get user ID safely (returns null if not authenticated)
 * @param {Object} req - Express request object
 * @returns {string|null} - User ID or null
 */
function getUserId(req) {
  return req.user?.id || null;
}

/**
 * Get user email safely (returns null if not authenticated)
 * @param {Object} req - Express request object
 * @returns {string|null} - User email or null
 */
function getUserEmail(req) {
  return req.user?.email || null;
}

module.exports = {
  assertUser,
  hasUser,
  getUserId,
  getUserEmail
};
