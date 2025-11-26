// File: server/bootstrap/errors.js
// Description: Central place to register error handlers for the app
// Purpose: Separates error handling from main server boot file
// Notes: All error handlers are registered here with secure, consistent responses

const { respondError } = require('../utils/errorResponder');

/**
 * WHAT:
 * Register error handlers for 404 and centralized error handling.
 *
 * WHY:
 * Centralized error handling prevents information leakage (no stack traces, no internal paths).
 * Provides consistent UX across HTML/JSON/text responses.
 * Single source of truth for error handling.
 *
 * HOW:
 * We register two error handlers:
 * 1. 404 handler for routes that don't match any route
 * 2. Centralized error handler for all thrown errors
 * Both use respondError for consistent response formatting.
 *
 * @param {Object} params - Error handler registration parameters
 * @param {Object} params.app - Express application instance
 * @param {Object} params.logger - Structured logger instance
 * @param {Object} params.config - Application configuration object
 * @param {Object} params.consoleLogger - Console logger with formatting
 */
function registerErrorHandlers({ app, logger, config, consoleLogger }) {
  const isProd = config.server.nodeEnv === 'production';

  /**
   * WHAT:
   * Centralized error handling with secure, consistent responses.
   *
   * WHY:
   * Prevents information leakage (no stack traces, no internal paths).
   * Provides consistent UX across HTML/JSON/text responses.
   * Single source of truth for error handling.
   *
   * HOW:
   * Use errorResponder module for all error responses.
   * Log errors server-side with full context.
   * Send minimal, safe info to clients.
   * Support content negotiation (HTML/JSON/text).
   */

  // 404 handler (no route matched)
  app.use((req, res) => {
    respondError(req, res, {
      status: 404,
      message: 'The requested resource was not found.',
      code: 'not_found',
    });
  });

  // Centralized error handler (must have 4 args)
  app.use((err, req, res, next) => {
    // Check if headers were already sent (prevents "headers already sent" errors)
    if (res.headersSent) {
      return next(err);
    }
    
    // Do not leak internals to clients
    const status = err.status || err.statusCode || 500;

    // Handle static file errors appropriately
    const isStaticReq = req.path.startsWith('/images/') || 
                        req.path.startsWith('/css/') || 
                        req.path.startsWith('/js/') ||
                        req.path === '/favicon.ico' || 
                        req.path === '/robots.txt';
    
    // Determine status based on error code
    let finalStatus = status;
    if (err.code === 'ENOENT') {
      finalStatus = 404;
    } else if (err.code === 'EACCES') {
      finalStatus = 403;
    }
    
    // For static requests, return proper status without HTML error page
    if (isStaticReq && (err.code === 'ENOENT' || err.code === 'EACCES' || finalStatus === 404 || finalStatus === 403)) {
      return res.status(finalStatus).end();
    }

    /**
     * WHAT:
     * Log full error details server-side only.
     * 
     * WHY:
     * Need complete error context for debugging.
     * But never send stack traces or internals to clients.
     * 
     * HOW:
     * Use structured logger with full context.
     * Include stack trace in logs only.
     * Client gets generic message only.
     */
    try {
      logger.error('Uncaught error', {
        requestId: req.requestId || 'unknown',
        status,
        name: err.name,
        message: err.message,
        code: err.code,
        url: req.url,
        method: req.method,
        ip: req.ip,
        syscall: err.syscall, // Added for ENOENT diagnosis
        // Stack trace in logs only (not sent to client)
        stack: isProd ? undefined : err.stack,
      });
    } catch {
      // Fail silently if logging fails
    }

    // 429 hint: if upstream rate limiter set retryAfter seconds, reflect it safely
    if (status === 429 && err.retryAfter) {
      res.set('Retry-After', String(err.retryAfter));
    }

    respondError(req, res, {
      status,
      message: status === 500 ? 'An unexpected error occurred.' : (err.publicMessage || err.message),
      code: status === 500 ? 'internal_error' : undefined,
      // Never send stack/details in prod responses
      extra: isProd ? {} : { detail: err.type || err.code },
    });
  });

  consoleLogger.formatMiddlewareRegistration('Error handling');
}

module.exports = { registerErrorHandlers };

