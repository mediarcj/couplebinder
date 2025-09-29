// File: server/middleware/cookieGuardian.js
// Description: Cookie parsing middleware with error handling and observability
// Purpose: Provides dependency-free cookie parsing with structured logging
// Notes: Must be used early in middleware chain before session and CSRF middleware

/**
 * WHAT:
 * We parse raw cookie headers into a structured JavaScript object for easy access.
 *
 * WHY:
 * Express doesn't parse cookies by default. We need this for session and CSRF middleware.
 *
 * HOW:
 * We manually parse the Cookie header, handle encoding errors, and attach results to req.cookies.
 */

const logger = require('../utils/logger');

/**
 * Cookie parsing middleware
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object  
 * @param {Function} next - Next middleware function
 */
function parseCookies(req, res, next) {
  // Step 1: Read the raw cookie header from the incoming HTTP request
  // This will return something like: "token=abc123; theme=dark; sessionId=xyz456"
  const raw = req.headers.cookie || ''; // Fallback to empty string if no cookies exist

  // Step 2: Initialize an empty object to store our parsed key-value pairs
  const parsed = {}; // This object will be built manually to avoid third-party dependencies

  // Step 3: Split the raw string into individual cookie strings using semicolon as delimiter
  // Example result: ["token=abc123", "theme=dark", "sessionId=xyz456"]
  const cookiePairs = raw.split(';');

  // Step 4: Iterate over each raw cookie pair string and extract the name and value
  cookiePairs.forEach((cookie) => {
    // Step 4.1: Trim leading/trailing spaces from each cookie string
    // Step 4.2: Split only on the first '=' to ensure the value can contain '=' characters
    const [key, ...val] = cookie.trim().split('=');

    // Step 4.3: Only continue if both key and value exist
    if (key && val.length > 0) {
      try {
        // Step 4.4: Decode the value using decodeURIComponent to handle special characters and encoding
        parsed[key] = decodeURIComponent(val.join('='));
      } catch (err) {
        // Step 4.5: If decoding fails, store the raw string value to avoid crashing the middleware
        logger.warn('Failed to decode cookie value', {
          key: key,
          error: err.message,
          requestId: req.requestId
        });
        parsed[key] = val.join('=');
      }
    }
  });

  // Step 5: Attach the final parsed cookie object to the request so other modules can use it
  req.cookies = parsed;

  // Step 6: Emit a log of how many cookies were successfully parsed for traceability and debugging
  const cookieCount = Object.keys(parsed).length;
  if (cookieCount > 0) {
    logger.info('Cookies parsed and attached to request', {
      count: cookieCount,
      requestId: req.requestId
    });
  }

  // Step 7: Move on to the next middleware in the Express chain
  next();
}

module.exports = parseCookies;
