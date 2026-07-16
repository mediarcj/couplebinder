// File: server/utils/errorResponder.js
// Description: Centralized error response handler for consistent error UX
// Purpose: Single source of truth for error responses (HTML/JSON/text)
// Notes: No stack traces or internal paths leaked to clients

/**
 * WHAT:
 * Centralized error responder that handles errors consistently across the app.
 * 
 * WHY:
 * Scattered error responses create inconsistent UX and risk leaking internals.
 * Single responder ensures security, proper headers, and content negotiation.
 * 
 * HOW:
 * Detects client preference (HTML/JSON/text) and responds appropriately.
 * Sets security headers (X-Robots-Tag, Cache-Control).
 * Renders dedicated error views with minimal info (no stack traces).
 * Includes request ID for support tracing.
 */

// ============================================================
// Status code mapping
// ============================================================
const { config } = require('../config');

// I am saving `STATUS_TITLES` here so the nearby steps can reuse the same value without rebuilding it each time.
const STATUS_TITLES = {
  // I am keeping this line here because the surrounding errorResponder.js workflow expects this value or operation before it continues.
  401: 'auth_required',
  // I am keeping this line here because the surrounding errorResponder.js workflow expects this value or operation before it continues.
  403: 'forbidden',
  // I am keeping this line here because the surrounding errorResponder.js workflow expects this value or operation before it continues.
  404: 'not_found',
  // I am keeping this line here because the surrounding errorResponder.js workflow expects this value or operation before it continues.
  429: 'too_many_requests',
  // I am keeping this line here because the surrounding errorResponder.js workflow expects this value or operation before it continues.
  500: 'internal_error',
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
};

/**
 * WHAT:
 * Choose the appropriate error view template based on status code.
 * 
 * WHY:
 * Different errors need different messaging and UX.
 * Dedicated views provide better user experience.
 * 
 * HOW:
 * Map status codes to specific templates.
 * Fall back to generic 500 for unmapped codes.
 */
function chooseView(status) {
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (status === 401) return 'errors/401';
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (status === 403) return 'errors/403';
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (status === 404) return 'errors/404';
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (status === 429) return 'errors/429';
  // This return sends the completed value or response back to the code that called this function.
  return 'errors/500';
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * WHAT:
 * Centralized error response handler.
 * 
 * WHY:
 * Ensures consistent error handling across all routes.
 * Prevents accidental information leakage.
 * Provides proper content negotiation (HTML/JSON/text).
 * 
 * HOW:
 * 1. Build safe payload (no stack traces, no internal paths)
 * 2. Set security headers (X-Robots-Tag, Cache-Control)
 * 3. Detect client preference (HTML/JSON/text)
 * 4. Respond with appropriate format
 * 5. Always include request ID for support tracing
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Object} options - Error options
 *   {number} status - HTTP status code (default: 500)
 *   {string} message - User-facing error message
 *   {string} code - Machine-readable error code
 *   {Object} extra - Additional safe fields for JSON responses
 */
function respondError(req, res, { status = 500, message, code, extra = {} }) {
  // Check if headers already sent to prevent double-send errors
  if (res.headersSent) {
    // This return sends the completed value or response back to the code that called this function.
    return;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
  
  // I am saving `wantsHTML` here so the nearby steps can reuse the same value without rebuilding it each time.
  const wantsHTML = req.accepts(['html', 'json', 'text']) === 'html';
  // I am saving `errorCode` here so the nearby steps can reuse the same value without rebuilding it each time.
  const errorCode = code || STATUS_TITLES[status] || 'error';
  // I am saving `requestId` here so the nearby steps can reuse the same value without rebuilding it each time.
  const requestId = req.requestId || 'unknown';
  
  // Build safe payload (no stack traces, no internal paths)
  const payload = {
    // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
    error: errorCode,
    // I am keeping the `message` field in this object so the receiving code can read that value by its expected name.
    message: message || (status === 500 ? 'An unexpected error occurred.' : 'Request could not be completed.'),
    // I am keeping this line here because the surrounding errorResponder.js workflow expects this value or operation before it continues.
    requestId,
    // I am keeping this line here because the surrounding errorResponder.js workflow expects this value or operation before it continues.
    ...extra,
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  };

  /**
   * WHAT:
   * Set security headers for error responses.
   * 
   * WHY:
   * Error pages should not be indexed by search engines.
   * Error pages should not be cached (they're dynamic).
   * 
   * HOW:
   * X-Robots-Tag: noindex, nofollow (prevent search engine indexing)
   * Cache-Control: no-store (prevent caching)
   */
  res.status(status)
    // I am continuing the existing call chain here so this option stays attached to the same operation started above.
    .set('X-Robots-Tag', 'noindex, nofollow')
    // I am continuing the existing call chain here so this option stays attached to the same operation started above.
    .set('Cache-Control', 'no-store');

  // HTML response (browser)
  if (wantsHTML) {
    // This return sends the completed value or response back to the code that called this function.
    return res.render(chooseView(status), {
      // I am keeping the `page` field in this object so the receiving code can read that value by its expected name.
      page: { 
        // I am keeping the `title` field in this object so the receiving code can read that value by its expected name.
        title: payload.message, 
        // I am keeping the `nonce` field in this object so the receiving code can read that value by its expected name.
        nonce: res.locals.nonce || '',
        // I am keeping the `assetVersion` field in this object so the receiving code can read that value by its expected name.
        assetVersion: res.locals.assetVersion || ''
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      },
      // I am keeping the `app_info` field in this object so the receiving code can read that value by its expected name.
      app_info: { name: config.branding.appName },
      // I am keeping the `ui` field in this object so the receiving code can read that value by its expected name.
      ui: res.locals.ui || {},
      // I am keeping this line here because the surrounding errorResponder.js workflow expects this value or operation before it continues.
      requestId,
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // JSON response (API clients)
  if (req.accepts('json')) {
    // This return sends the completed value or response back to the code that called this function.
    return res.json(payload);
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // Plain text fallback
  return res.type('text').send(`${status} ${errorCode}: ${payload.message} (id: ${requestId})`);
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am exporting this value here so another module can deliberately reuse the completed piece from errorResponder.js.
module.exports = { respondError };

