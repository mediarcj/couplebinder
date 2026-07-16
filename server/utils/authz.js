// File: server/utils/authz.js
// Description: Authorization utilities and helpers
// Purpose: Provide safe access to user data and prevent naked req.user usage
// Notes: Use assertUser() instead of direct req.user access

/**
 * WHAT:
 * We provide a safe way to access user data from requests.
 *
 * WHY:
 * Direct req.user access can lead to security issues and inconsistent error handling.
 * This helper ensures proper authentication checks and consistent error responses.
 *
 * HOW:
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
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!req.user || !req.user.id) {
    // I am saving `err` here so the nearby steps can reuse the same value without rebuilding it each time.
    const err = new Error('Authentication required');
    // I am keeping this line here because the surrounding authz.js workflow expects this value or operation before it continues.
    err.status = 401;
    // I am stopping this path with the existing error here because the caller should not continue with an invalid result.
    throw err;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
  // This return sends the completed value or response back to the code that called this function.
  return req.user;
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * Check if the request has an authenticated user (without throwing)
 * @param {Object} req - Express request object
 * @returns {boolean} - True if user is authenticated
 */
function hasUser(req) {
  // This return sends the completed value or response back to the code that called this function.
  return !!(req.user && req.user.id);
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * Get user ID safely (returns null if not authenticated)
 * @param {Object} req - Express request object
 * @returns {string|null} - User ID or null
 */
function getUserId(req) {
  // This return sends the completed value or response back to the code that called this function.
  return req.user?.id || null;
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * Get user email safely (returns null if not authenticated)
 * @param {Object} req - Express request object
 * @returns {string|null} - User email or null
 */
function getUserEmail(req) {
  // This return sends the completed value or response back to the code that called this function.
  return req.user?.email || null;
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am exporting this value here so another module can deliberately reuse the completed piece from authz.js.
module.exports = {
  // I am keeping this line here because the surrounding authz.js workflow expects this value or operation before it continues.
  assertUser,
  // I am keeping this line here because the surrounding authz.js workflow expects this value or operation before it continues.
  hasUser,
  // I am keeping this line here because the surrounding authz.js workflow expects this value or operation before it continues.
  getUserId,
  // I am keeping this line here because the surrounding authz.js workflow expects this value or operation before it continues.
  getUserEmail
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
};
