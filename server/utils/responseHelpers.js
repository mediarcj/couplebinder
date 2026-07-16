// File: server/utils/responseHelpers.js
// Description: Simple response helpers for consistent API responses
// Purpose: Provides clean, simple functions for common response patterns
// Notes: Keeps response logic simple and consistent across all routes

/**
 * WHAT:
 * We provide simple helper functions for common API response patterns.
 *
 * WHY:
 * This keeps response logic consistent and makes the code easier to read
 * and maintain across all routes.
 *
 * HOW:
 * We use small, focused functions that handle one response type each.
 */

/**
 * Send a success response
 * @param {Object} res - Express response object
 * @param {Object} data - Response data
 * @param {string} message - Success message
 * @param {number} statusCode - HTTP status code
 */
function sendSuccess(res, data = null, message = 'Success', statusCode = 200) {
  // I am building or sending the Express response here with the status, data, or page already chosen by this route.
  res.status(statusCode).json({
    // I am keeping the `success` field in this object so the receiving code can read that value by its expected name.
    success: true,
    // I am keeping this line here because the surrounding responseHelpers.js workflow expects this value or operation before it continues.
    message,
    // I am keeping this line here because the surrounding responseHelpers.js workflow expects this value or operation before it continues.
    data,
    // I am keeping the `requestId` field in this object so the receiving code can read that value by its expected name.
    requestId: res.locals.requestId || 'unknown',
    // I am keeping the `timestamp` field in this object so the receiving code can read that value by its expected name.
    timestamp: new Date().toISOString()
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * Send an error response
 * @param {Object} res - Express response object
 * @param {string} error - Error message
 * @param {number} statusCode - HTTP status code
 * @param {Object} details - Additional error details
 */
function sendError(res, error, statusCode = 400, details = null) {
  // I am building or sending the Express response here with the status, data, or page already chosen by this route.
  res.status(statusCode).json({
    // I am keeping the `success` field in this object so the receiving code can read that value by its expected name.
    success: false,
    // I am keeping this line here because the surrounding responseHelpers.js workflow expects this value or operation before it continues.
    error,
    // I am keeping this line here because the surrounding responseHelpers.js workflow expects this value or operation before it continues.
    details,
    // I am keeping the `requestId` field in this object so the receiving code can read that value by its expected name.
    requestId: res.locals.requestId || 'unknown',
    // I am keeping the `timestamp` field in this object so the receiving code can read that value by its expected name.
    timestamp: new Date().toISOString()
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * Send a validation error response
 * @param {Object} res - Express response object
 * @param {string} error - Validation error message
 * @param {Object} validationErrors - Validation error details
 */
function sendValidationError(res, error, validationErrors = null) {
  // I am calling this helper here so the current workflow performs this step before it moves on.
  sendError(res, error, 400, validationErrors);
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * Send a quota exceeded error response
 * @param {Object} res - Express response object
 * @param {Object} quotaInfo - Quota information
 */
function sendQuotaExceeded(res, quotaInfo = null) {
  // I am calling this helper here so the current workflow performs this step before it moves on.
  sendError(res, 'Quota limit exceeded', 429, quotaInfo);
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * Send a not found error response
 * @param {Object} res - Express response object
 * @param {string} resource - Resource that was not found
 */
function sendNotFound(res, resource = 'Resource') {
  // I am calling this helper here so the current workflow performs this step before it moves on.
  sendError(res, `${resource} not found`, 404);
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * Send an unauthorized error response
 * @param {Object} res - Express response object
 * @param {string} message - Unauthorized message
 */
function sendUnauthorized(res, message = 'Authentication required') {
  // I am calling this helper here so the current workflow performs this step before it moves on.
  sendError(res, message, 401);
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * Send a forbidden error response
 * @param {Object} res - Express response object
 * @param {string} message - Forbidden message
 */
function sendForbidden(res, message = 'Access denied') {
  // I am calling this helper here so the current workflow performs this step before it moves on.
  sendError(res, message, 403);
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * Send an internal server error response
 * @param {Object} res - Express response object
 * @param {string} message - Error message
 */
function sendInternalError(res, message = 'Internal server error') {
  // I am calling this helper here so the current workflow performs this step before it moves on.
  sendError(res, message, 500);
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}


/**
 * Simple validation helper
 * @param {Object} data - Data to validate
 * @param {Object} rules - Validation rules
 * @returns {Object} Validation result
 */
function validate(data, rules) {
  // I am saving `errors` here so the nearby steps can reuse the same value without rebuilding it each time.
  const errors = {};
  
  // I am repeating the next block one item at a time so every value in the existing collection receives the same handling.
  for (const [field, rule] of Object.entries(rules)) {
    // I am saving `value` here so the nearby steps can reuse the same value without rebuilding it each time.
    const value = data[field];
    
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (rule.required && (!value || value.toString().trim() === '')) {
      // I am keeping this line here because the surrounding responseHelpers.js workflow expects this value or operation before it continues.
      errors[field] = `${field} is required`;
      // I am changing the loop flow here once the condition above has decided this item needs no further work in this pass.
      continue;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (value && rule.min && value.length < rule.min) {
      // I am keeping this line here because the surrounding responseHelpers.js workflow expects this value or operation before it continues.
      errors[field] = `${field} must be at least ${rule.min} characters`;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (value && rule.max && value.length > rule.max) {
      // I am keeping this line here because the surrounding responseHelpers.js workflow expects this value or operation before it continues.
      errors[field] = `${field} must not exceed ${rule.max} characters`;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (value && rule.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      // I am keeping this line here because the surrounding responseHelpers.js workflow expects this value or operation before it continues.
      errors[field] = `${field} must be a valid email address`;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
  
  // This return sends the completed value or response back to the code that called this function.
  return {
    // I am keeping the `valid` field in this object so the receiving code can read that value by its expected name.
    valid: Object.keys(errors).length === 0,
    // I am keeping this line here because the surrounding responseHelpers.js workflow expects this value or operation before it continues.
    errors
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  };
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am exporting this value here so another module can deliberately reuse the completed piece from responseHelpers.js.
module.exports = {
  // I am keeping this line here because the surrounding responseHelpers.js workflow expects this value or operation before it continues.
  sendSuccess,
  // I am keeping this line here because the surrounding responseHelpers.js workflow expects this value or operation before it continues.
  sendError,
  // I am keeping this line here because the surrounding responseHelpers.js workflow expects this value or operation before it continues.
  sendValidationError,
  // I am keeping this line here because the surrounding responseHelpers.js workflow expects this value or operation before it continues.
  sendQuotaExceeded,
  // I am keeping this line here because the surrounding responseHelpers.js workflow expects this value or operation before it continues.
  sendNotFound,
  // I am keeping this line here because the surrounding responseHelpers.js workflow expects this value or operation before it continues.
  sendUnauthorized,
  // I am keeping this line here because the surrounding responseHelpers.js workflow expects this value or operation before it continues.
  sendForbidden,
  // I am keeping this line here because the surrounding responseHelpers.js workflow expects this value or operation before it continues.
  sendInternalError,
  // I am keeping this line here because the surrounding responseHelpers.js workflow expects this value or operation before it continues.
  validate
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
};
