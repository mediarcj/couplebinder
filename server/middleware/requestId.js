// File: server/middleware/requestId.js
// Description: Request ID middleware for tracking requests across the application
// Purpose: Adds unique request ID to all requests for logging and debugging
// Notes: Accepts client-provided UUID if valid, otherwise generates per-request

/**
 * WHAT:
 * We add a unique request ID to every incoming request for tracking and logging.
 *
 * WHY:
 * Request IDs help trace requests through the application and correlate logs.
 * Server-generated IDs are canonical to prevent log correlation attacks.
 *
 * HOW:
 * Always generate a server UUID as the canonical request ID.
 * Optionally store a validated client-provided ID separately for correlation.
 * Never cache UUIDs in module scope (each request gets a fresh ID).
 */

const { randomUUID } = require('crypto');

/**
 * Validate UUID v4 format (strict)
 * @param {string} v - Value to validate
 * @returns {boolean} True if valid UUID v4
 */
function isUuid(v) {
  if (!v || typeof v !== 'string' || v.length > 128) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

/**
 * Request ID middleware
 * Adds unique request ID to request and response
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
function requestIdMiddleware(req, res, next) {
  // Always generate server ID as canonical (prevents log correlation attacks)
  const serverId = randomUUID();
  
  req.id = serverId;
  req.requestId = serverId;
  res.locals.requestId = serverId;
  res.set('x-request-id', serverId);
  
  // Optionally store validated client ID separately (for correlation, not canonical)
  const clientHdr = req.get('x-request-id');
  if (clientHdr && isUuid(clientHdr)) {
    req.clientRequestId = clientHdr;
  }
  
  next();
}

module.exports = requestIdMiddleware;
