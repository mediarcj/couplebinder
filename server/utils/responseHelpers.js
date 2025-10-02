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
  res.status(statusCode).json({
    success: true,
    message,
    data,
    requestId: res.locals.requestId || 'unknown',
    timestamp: new Date().toISOString()
  });
}

/**
 * Send an error response
 * @param {Object} res - Express response object
 * @param {string} error - Error message
 * @param {number} statusCode - HTTP status code
 * @param {Object} details - Additional error details
 */
function sendError(res, error, statusCode = 400, details = null) {
  res.status(statusCode).json({
    success: false,
    error,
    details,
    requestId: res.locals.requestId || 'unknown',
    timestamp: new Date().toISOString()
  });
}

/**
 * Send a validation error response
 * @param {Object} res - Express response object
 * @param {string} error - Validation error message
 * @param {Object} validationErrors - Validation error details
 */
function sendValidationError(res, error, validationErrors = null) {
  sendError(res, error, 400, validationErrors);
}

/**
 * Send a quota exceeded error response
 * @param {Object} res - Express response object
 * @param {Object} quotaInfo - Quota information
 */
function sendQuotaExceeded(res, quotaInfo = null) {
  sendError(res, 'Quota limit exceeded', 429, quotaInfo);
}

/**
 * Send a not found error response
 * @param {Object} res - Express response object
 * @param {string} resource - Resource that was not found
 */
function sendNotFound(res, resource = 'Resource') {
  sendError(res, `${resource} not found`, 404);
}

/**
 * Send an unauthorized error response
 * @param {Object} res - Express response object
 * @param {string} message - Unauthorized message
 */
function sendUnauthorized(res, message = 'Authentication required') {
  sendError(res, message, 401);
}

/**
 * Send a forbidden error response
 * @param {Object} res - Express response object
 * @param {string} message - Forbidden message
 */
function sendForbidden(res, message = 'Access denied') {
  sendError(res, message, 403);
}

/**
 * Send an internal server error response
 * @param {Object} res - Express response object
 * @param {string} message - Error message
 */
function sendInternalError(res, message = 'Internal server error') {
  sendError(res, message, 500);
}


/**
 * Simple validation helper
 * @param {Object} data - Data to validate
 * @param {Object} rules - Validation rules
 * @returns {Object} Validation result
 */
function validate(data, rules) {
  const errors = {};
  
  for (const [field, rule] of Object.entries(rules)) {
    const value = data[field];
    
    if (rule.required && (!value || value.toString().trim() === '')) {
      errors[field] = `${field} is required`;
      continue;
    }
    
    if (value && rule.min && value.length < rule.min) {
      errors[field] = `${field} must be at least ${rule.min} characters`;
    }
    
    if (value && rule.max && value.length > rule.max) {
      errors[field] = `${field} must not exceed ${rule.max} characters`;
    }
    
    if (value && rule.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      errors[field] = `${field} must be a valid email address`;
    }
  }
  
  return {
    valid: Object.keys(errors).length === 0,
    errors
  };
}

module.exports = {
  sendSuccess,
  sendError,
  sendValidationError,
  sendQuotaExceeded,
  sendNotFound,
  sendUnauthorized,
  sendForbidden,
  sendInternalError,
  validate
};
