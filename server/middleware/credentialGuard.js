// File: server/middleware/credentialGuard.js
// Description: Prevent credentials from appearing in GET requests
// Purpose: Critical security guard against credential leakage in URLs
// Notes: Blocks email, password, token in query parameters

/**
 * WHAT:
 * Block any GET request that contains sensitive credentials in query parameters.
 *
 * WHY:
 * CRITICAL SECURITY: Credentials in URLs are logged in server logs, browser history,
 * proxy logs, and can leak via Referer headers. This is a severe security violation.
 *
 * HOW:
 * Check GET requests for sensitive fields (email, password, token, etc.) in query params.
 * If found, immediately return 400 Bad Request and log the violation.
 */

const logger = require('../utils/logger');

// Sensitive fields that should NEVER appear in GET params
const FORBIDDEN_PARAMS = [
  'password',
  'email',
  'token',
  'access_token',
  'refresh_token',
  '_csrf', // CSRF should be in headers or body, not URL
  'auth',
  'authorization',
  'bearer'
];

function credentialGuard(req, res, next) {
  // Only check GET requests
  if (req.method !== 'GET') {
    return next();
  }
  
  // Check if any forbidden parameter exists
  const queryKeys = Object.keys(req.query || {}).map(k => k.toLowerCase());
  const foundForbidden = FORBIDDEN_PARAMS.filter(fp => queryKeys.includes(fp));
  
  if (foundForbidden.length > 0) {
    // CRITICAL VIOLATION: Log and block
    logger.error({
      event: 'credential_guard.violation',
      method: req.method,
      path: req.path,
      forbiddenParams: foundForbidden,
      requestId: req.requestId,
      ip: req.clientIp || req.ip
    }, 'Credentials detected in GET request');
    
    return res.status(400).json({
      ok: false,
      error: 'Bad Request: Sensitive data not allowed in URL'
    });
  }
  
  next();
}

module.exports = credentialGuard;

