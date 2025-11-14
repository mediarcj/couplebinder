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
const STATUS_TITLES = {
  401: 'auth_required',
  403: 'forbidden',
  404: 'not_found',
  429: 'too_many_requests',
  500: 'internal_error',
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
  if (status === 401) return 'errors/401';
  if (status === 403) return 'errors/403';
  if (status === 404) return 'errors/404';
  if (status === 429) return 'errors/429';
  return 'errors/500';
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
    return;
  }
  
  const wantsHTML = req.accepts(['html', 'json', 'text']) === 'html';
  const errorCode = code || STATUS_TITLES[status] || 'error';
  const requestId = req.requestId || 'unknown';
  
  // Build safe payload (no stack traces, no internal paths)
  const payload = {
    error: errorCode,
    message: message || (status === 500 ? 'An unexpected error occurred.' : 'Request could not be completed.'),
    requestId,
    ...extra,
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
    .set('X-Robots-Tag', 'noindex, nofollow')
    .set('Cache-Control', 'no-store');

  // HTML response (browser)
  if (wantsHTML) {
    return res.render(chooseView(status), {
      page: { 
        title: payload.message, 
        nonce: res.locals.nonce || '',
        assetVersion: res.locals.assetVersion || Date.now()
      },
      app_info: { name: process.env.APP_NAME || 'Application' },
      ui: res.locals.ui || {},
      requestId,
    });
  }

  // JSON response (API clients)
  if (req.accepts('json')) {
    return res.json(payload);
  }

  // Plain text fallback
  return res.type('text').send(`${status} ${errorCode}: ${payload.message} (id: ${requestId})`);
}

module.exports = { respondError };

