// File: server/middleware/requestId.js
// Description: Request ID middleware for tracking requests across the application
// Purpose: Adds unique request ID to all requests for logging and debugging
// Notes: Generates UUID for each request and adds to headers and request object

/**
 * WHAT:
 * We add a unique request ID to every incoming request for tracking and logging.
 *
 * WHY:
 * Request IDs help trace requests through the application and correlate logs.
 *
 * HOW:
 * We generate a UUID for each request and attach it to the request object and response headers.
 */

const crypto = require('node:crypto');

/**
 * Request ID middleware
 * Adds unique request ID to request and response
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
function requestIdMiddleware(req, res, next) {
  // Generate unique request ID
  const requestId = crypto.randomUUID();
  
  // Add to request object
  req.requestId = requestId;
  
  // Add to response headers
  res.setHeader('X-Request-ID', requestId);
  
  // Continue to next middleware
  next();
}

module.exports = requestIdMiddleware;
