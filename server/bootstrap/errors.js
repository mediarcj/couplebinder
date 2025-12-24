'use strict';

// File: server/bootstrap/errors.js
// Description: Central place to register error handlers for the app
// Purpose: Separates error handling from main server boot file
// Notes: All error handlers are registered here with secure, consistent responses

const { respondError } = require('../utils/errorResponder');

function statusToCode(status) {
  const map = {
    400: 'bad_request',
    401: 'unauthorized',
    403: 'forbidden',
    404: 'not_found',
    405: 'method_not_allowed',
    409: 'conflict',
    413: 'payload_too_large',
    415: 'unsupported_media_type',
    422: 'unprocessable_entity',
    429: 'rate_limited',
    500: 'internal_error',
  };
  return map[status];
}

function statusToMessage(status) {
  const map = {
    400: 'The request was invalid.',
    401: 'Authentication is required.',
    403: 'You do not have permission to access this resource.',
    404: 'The requested resource was not found.',
    405: 'That method is not allowed for this endpoint.',
    409: 'The request could not be completed due to a conflict.',
    413: 'The request payload is too large.',
    415: 'Unsupported media type.',
    422: 'The request could not be processed.',
    429: 'Too many requests. Please try again later.',
    500: 'An unexpected error occurred.',
  };
  return map[status] || 'An unexpected error occurred.';
}

/**
 * @param {Object} params
 * @param {Object} params.app
 * @param {Object} params.logger
 * @param {Object} params.config
 * @param {Object} [params.consoleLogger]
 */
function registerErrorHandlers({ app, logger, config, consoleLogger }) {
  const isProd = config?.server?.nodeEnv === 'production';

  // 404 handler (no route matched)
  app.use((req, res) => {
    respondError(req, res, {
      status: 404,
      message: statusToMessage(404),
      code: statusToCode(404),
    });
  });

  // Centralized error handler (must have 4 args)
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);

    const rawStatus = err?.status || err?.statusCode || 500;

    // Normalize file-system-ish error codes
    let finalStatus = rawStatus;
    if (err?.code === 'ENOENT') finalStatus = 404;
    if (err?.code === 'EACCES') finalStatus = 403;

    // Static asset requests should not receive an HTML error page
    const p = req?.path || '';
    const isStaticReq =
      p.startsWith('/images/') ||
      p.startsWith('/css/') ||
      p.startsWith('/js/') ||
      p === '/favicon.ico' ||
      p === '/robots.txt';

    if (isStaticReq && (finalStatus === 404 || finalStatus === 403)) {
      return res.status(finalStatus).end();
    }

    // Server-side logging only (never leak internals to the client)
    try {
      logger.error(
        {
          event: 'http.error',
          requestId: req.requestId || 'unknown',
          status: finalStatus,
          method: req.method,
          url: req.originalUrl || req.url,
          ip: req.ip,
          err: {
            name: err?.name,
            message: err?.message,
            code: err?.code,
            type: err?.type,
            // Keep stack out of client responses; logs are server-side only
            stack: err?.stack,
          },
        },
        'Request error'
      );
    } catch {
      // ignore logging failures
    }

    // 429 hint: if upstream rate limiter set retryAfter seconds, reflect it safely
    if (finalStatus === 429 && err?.retryAfter) {
      res.set('Retry-After', String(err.retryAfter));
    }

    // Only show a custom message if the server explicitly marked it public
    const publicMessage =
      typeof err?.publicMessage === 'string' && err.publicMessage.trim()
        ? err.publicMessage.trim()
        : null;

    const message = publicMessage || statusToMessage(finalStatus);
    const code = finalStatus === 500 ? 'internal_error' : statusToCode(finalStatus);

    respondError(req, res, {
      status: finalStatus,
      message,
      code,
      extra: isProd
        ? {}
        : {
            // Dev-only hint; do not rely on this in production.
            detail: err?.message,
            type: err?.type || err?.code,
          },
    });
  });

  if (consoleLogger && typeof consoleLogger.formatMiddlewareRegistration === 'function') {
    consoleLogger.formatMiddlewareRegistration('Error handling');
  } else {
    logger.info({ event: 'boot.errors_registered' }, 'Error handling registered');
  }
}

module.exports = { registerErrorHandlers };