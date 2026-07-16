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
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'password',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'email',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'token',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'access_token',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'refresh_token',
  '_csrf', // CSRF should be in headers or body, not URL
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'auth',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'authorization',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'bearer'
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
];

// I am keeping `credentialGuard` as a named helper so the surrounding workflow can call this step when it needs it.
function credentialGuard(req, res, next) {
  // Only check GET requests
  if (req.method !== 'GET') {
    // This return sends the completed value or response back to the code that called this function.
    return next();
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
  
  // Check if any forbidden parameter exists
  const queryKeys = Object.keys(req.query || {}).map(k => k.toLowerCase());
  // I am saving `foundForbidden` here so the nearby steps can reuse the same value without rebuilding it each time.
  const foundForbidden = FORBIDDEN_PARAMS.filter(fp => queryKeys.includes(fp));
  
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (foundForbidden.length > 0) {
    // CRITICAL VIOLATION: Log and block
    logger.error({
      // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
      event: 'credential_guard.violation',
      // I am keeping the `method` field in this object so the receiving code can read that value by its expected name.
      method: req.method,
      // I am keeping the `path` field in this object so the receiving code can read that value by its expected name.
      path: req.path,
      // I am keeping the `forbiddenParams` field in this object so the receiving code can read that value by its expected name.
      forbiddenParams: foundForbidden,
      // I am keeping the `requestId` field in this object so the receiving code can read that value by its expected name.
      requestId: req.requestId,
      // I am keeping the `ip` field in this object so the receiving code can read that value by its expected name.
      ip: req.clientIp || req.ip
    // I am keeping this line here because the surrounding credentialGuard.js workflow expects this value or operation before it continues.
    }, 'Credentials detected in GET request');
    
    // This return sends the completed value or response back to the code that called this function.
    return res.status(400).json({
      // I am keeping the `ok` field in this object so the receiving code can read that value by its expected name.
      ok: false,
      // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
      error: 'Bad Request: Sensitive data not allowed in URL'
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
  
  // I am calling this helper here so the current workflow performs this step before it moves on.
  next();
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am exporting this value here so another module can deliberately reuse the completed piece from credentialGuard.js.
module.exports = credentialGuard;

