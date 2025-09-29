// File: server/core/api.js
// Description: Generic API response utilities
// Purpose: Provides consistent API response formatting across all endpoints
// Notes: Domain-agnostic utilities for standardized API responses

/**
 * WHAT:
 * We provide generic API utilities for consistent response formatting
 * and error handling across all endpoints.
 *
 * WHY:
 * This ensures consistent API behavior and makes the system easier to
 * maintain and extend for different applications.
 *
 * HOW:
 * We use standardized response formats and error codes that can be
 * reused across different modules and applications.
 */

/**
 * Standard API response codes
 */
const API_CODES = {
  SUCCESS: 'SUCCESS',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',
  NOT_FOUND: 'NOT_FOUND',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  INTERNAL_ERROR: 'INTERNAL_ERROR'
};

/**
 * Create a successful API response
 * @param {Object} data - Response data
 * @param {string} message - Success message
 * @param {Object} meta - Additional metadata
 * @returns {Object} Formatted success response
 */
function successResponse(data = null, message = 'Operation completed successfully', meta = {}) {
  return {
    success: true,
    code: API_CODES.SUCCESS,
    message,
    data,
    meta: {
      timestamp: new Date().toISOString(),
      ...meta
    }
  };
}

/**
 * Create an error API response
 * @param {string} code - Error code
 * @param {string} message - Error message
 * @param {Object} details - Additional error details
 * @param {Object} meta - Additional metadata
 * @returns {Object} Formatted error response
 */
function errorResponse(code, message, details = null, meta = {}) {
  return {
    success: false,
    code,
    message,
    details,
    meta: {
      timestamp: new Date().toISOString(),
      ...meta
    }
  };
}

/**
 * Create a validation error response
 * @param {string} message - Error message
 * @param {Object} validationErrors - Validation error details
 * @param {Object} meta - Additional metadata
 * @returns {Object} Formatted validation error response
 */
function validationErrorResponse(message, validationErrors = null, meta = {}) {
  return errorResponse(API_CODES.VALIDATION_ERROR, message, validationErrors, meta);
}

/**
 * Create a quota exceeded error response
 * @param {string} message - Error message
 * @param {Object} quotaInfo - Quota information
 * @param {Object} meta - Additional metadata
 * @returns {Object} Formatted quota error response
 */
function quotaExceededResponse(message, quotaInfo = null, meta = {}) {
  return errorResponse(API_CODES.QUOTA_EXCEEDED, message, quotaInfo, meta);
}

/**
 * Create a not found error response
 * @param {string} message - Error message
 * @param {Object} meta - Additional metadata
 * @returns {Object} Formatted not found error response
 */
function notFoundResponse(message = 'Resource not found', meta = {}) {
  return errorResponse(API_CODES.NOT_FOUND, message, null, meta);
}

/**
 * Create an unauthorized error response
 * @param {string} message - Error message
 * @param {Object} meta - Additional metadata
 * @returns {Object} Formatted unauthorized error response
 */
function unauthorizedResponse(message = 'Authentication required', meta = {}) {
  return errorResponse(API_CODES.UNAUTHORIZED, message, null, meta);
}

/**
 * Create a forbidden error response
 * @param {string} message - Error message
 * @param {Object} meta - Additional metadata
 * @returns {Object} Formatted forbidden error response
 */
function forbiddenResponse(message = 'Access denied', meta = {}) {
  return errorResponse(API_CODES.FORBIDDEN, message, null, meta);
}

/**
 * Create an internal error response
 * @param {string} message - Error message
 * @param {Object} meta - Additional metadata
 * @returns {Object} Formatted internal error response
 */
function internalErrorResponse(message = 'Internal server error', meta = {}) {
  return errorResponse(API_CODES.INTERNAL_ERROR, message, null, meta);
}

/**
 * Send a standardized API response
 * @param {Object} res - Express response object
 * @param {Object} response - API response object
 * @param {number} statusCode - HTTP status code
 */
function sendResponse(res, response, statusCode = 200) {
  res.status(statusCode).json(response);
}

/**
 * Send a successful response
 * @param {Object} res - Express response object
 * @param {Object} data - Response data
 * @param {string} message - Success message
 * @param {Object} meta - Additional metadata
 * @param {number} statusCode - HTTP status code
 */
function sendSuccess(res, data = null, message = 'Operation completed successfully', meta = {}, statusCode = 200) {
  const response = successResponse(data, message, meta);
  sendResponse(res, response, statusCode);
}

/**
 * Send an error response
 * @param {Object} res - Express response object
 * @param {string} code - Error code
 * @param {string} message - Error message
 * @param {Object} details - Error details
 * @param {Object} meta - Additional metadata
 * @param {number} statusCode - HTTP status code
 */
function sendError(res, code, message, details = null, meta = {}, statusCode = 400) {
  const response = errorResponse(code, message, details, meta);
  sendResponse(res, response, statusCode);
}

module.exports = {
  API_CODES,
  successResponse,
  errorResponse,
  validationErrorResponse,
  quotaExceededResponse,
  notFoundResponse,
  unauthorizedResponse,
  forbiddenResponse,
  internalErrorResponse,
  sendResponse,
  sendSuccess,
  sendError
};
