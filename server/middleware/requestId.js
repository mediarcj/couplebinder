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
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!v || typeof v !== 'string' || v.length > 128) return false;
  // This return sends the completed value or response back to the code that called this function.
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
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
  
  // I am keeping this line here because the surrounding requestId.js workflow expects this value or operation before it continues.
  req.id = serverId;
  // I am keeping this line here because the surrounding requestId.js workflow expects this value or operation before it continues.
  req.requestId = serverId;
  // I am keeping this line here because the surrounding requestId.js workflow expects this value or operation before it continues.
  res.locals.requestId = serverId;
  // I am building or sending the Express response here with the status, data, or page already chosen by this route.
  res.set('x-request-id', serverId);
  
  // Optionally store validated client ID separately (for correlation, not canonical)
  const clientHdr = req.get('x-request-id');
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (clientHdr && isUuid(clientHdr)) {
    // I am keeping this line here because the surrounding requestId.js workflow expects this value or operation before it continues.
    req.clientRequestId = clientHdr;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
  
  // I am calling this helper here so the current workflow performs this step before it moves on.
  next();
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am exporting this value here so another module can deliberately reuse the completed piece from requestId.js.
module.exports = requestIdMiddleware;
