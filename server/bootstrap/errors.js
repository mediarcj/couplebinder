// I am keeping this line here because the surrounding errors.js workflow expects this value or operation before it continues.
'use strict';

// File: server/bootstrap/errors.js
// Description: Central place to register error handlers for the app
// Purpose: Separates error handling from main server boot file
// Notes: All error handlers are registered here with secure, consistent responses

const { respondError } = require('../utils/errorResponder');

// I am keeping `statusToCode` as a named helper so the surrounding workflow can call this step when it needs it.
function statusToCode(status) {
  // I am saving `map` here so the nearby steps can reuse the same value without rebuilding it each time.
  const map = {
    // I am keeping this line here because the surrounding errors.js workflow expects this value or operation before it continues.
    400: 'bad_request',
    // I am keeping this line here because the surrounding errors.js workflow expects this value or operation before it continues.
    401: 'unauthorized',
    // I am keeping this line here because the surrounding errors.js workflow expects this value or operation before it continues.
    403: 'forbidden',
    // I am keeping this line here because the surrounding errors.js workflow expects this value or operation before it continues.
    404: 'not_found',
    // I am keeping this line here because the surrounding errors.js workflow expects this value or operation before it continues.
    405: 'method_not_allowed',
    // I am keeping this line here because the surrounding errors.js workflow expects this value or operation before it continues.
    409: 'conflict',
    // I am keeping this line here because the surrounding errors.js workflow expects this value or operation before it continues.
    413: 'payload_too_large',
    // I am keeping this line here because the surrounding errors.js workflow expects this value or operation before it continues.
    415: 'unsupported_media_type',
    // I am keeping this line here because the surrounding errors.js workflow expects this value or operation before it continues.
    422: 'unprocessable_entity',
    // I am keeping this line here because the surrounding errors.js workflow expects this value or operation before it continues.
    429: 'rate_limited',
    // I am keeping this line here because the surrounding errors.js workflow expects this value or operation before it continues.
    500: 'internal_error',
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  };
  // This return sends the completed value or response back to the code that called this function.
  return map[status];
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `statusToMessage` as a named helper so the surrounding workflow can call this step when it needs it.
function statusToMessage(status) {
  // I am saving `map` here so the nearby steps can reuse the same value without rebuilding it each time.
  const map = {
    // I am keeping this line here because the surrounding errors.js workflow expects this value or operation before it continues.
    400: 'The request was invalid.',
    // I am keeping this line here because the surrounding errors.js workflow expects this value or operation before it continues.
    401: 'Authentication is required.',
    // I am keeping this line here because the surrounding errors.js workflow expects this value or operation before it continues.
    403: 'You do not have permission to access this resource.',
    // I am keeping this line here because the surrounding errors.js workflow expects this value or operation before it continues.
    404: 'The requested resource was not found.',
    // I am keeping this line here because the surrounding errors.js workflow expects this value or operation before it continues.
    405: 'That method is not allowed for this endpoint.',
    // I am keeping this line here because the surrounding errors.js workflow expects this value or operation before it continues.
    409: 'The request could not be completed due to a conflict.',
    // I am keeping this line here because the surrounding errors.js workflow expects this value or operation before it continues.
    413: 'The request payload is too large.',
    // I am keeping this line here because the surrounding errors.js workflow expects this value or operation before it continues.
    415: 'Unsupported media type.',
    // I am keeping this line here because the surrounding errors.js workflow expects this value or operation before it continues.
    422: 'The request could not be processed.',
    // I am keeping this line here because the surrounding errors.js workflow expects this value or operation before it continues.
    429: 'Too many requests. Please try again later.',
    // I am keeping this line here because the surrounding errors.js workflow expects this value or operation before it continues.
    500: 'An unexpected error occurred.',
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  };
  // This return sends the completed value or response back to the code that called this function.
  return map[status] || 'An unexpected error occurred.';
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * @param {Object} params
 * @param {Object} params.app
 * @param {Object} params.logger
 * @param {Object} params.config
 * @param {Object} [params.consoleLogger]
 */
function registerErrorHandlers({ app, logger, config, consoleLogger }) {
  // I am saving `isProd` here so the nearby steps can reuse the same value without rebuilding it each time.
  const isProd = config?.server?.nodeEnv === 'production';

  // 404 handler (no route matched)
  app.use((req, res) => {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    respondError(req, res, {
      // I am keeping the `status` field in this object so the receiving code can read that value by its expected name.
      status: 404,
      // I am keeping the `message` field in this object so the receiving code can read that value by its expected name.
      message: statusToMessage(404),
      // I am keeping the `code` field in this object so the receiving code can read that value by its expected name.
      code: statusToCode(404),
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });

  // Centralized error handler (must have 4 args)
  app.use((err, req, res, next) => {
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (res.headersSent) return next(err);

    // I am saving `rawStatus` here so the nearby steps can reuse the same value without rebuilding it each time.
    const rawStatus = err?.status || err?.statusCode || 500;

    // Normalize file-system-ish error codes
    let finalStatus = rawStatus;
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (err?.code === 'ENOENT') finalStatus = 404;
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (err?.code === 'EACCES') finalStatus = 403;

    // Static asset requests should not receive an HTML error page
    const p = req?.path || '';
    // I am saving `isStaticReq` here so the nearby steps can reuse the same value without rebuilding it each time.
    const isStaticReq =
      // I am calling this helper here so the current workflow performs this step before it moves on.
      p.startsWith('/images/') ||
      // I am calling this helper here so the current workflow performs this step before it moves on.
      p.startsWith('/css/') ||
      // I am calling this helper here so the current workflow performs this step before it moves on.
      p.startsWith('/js/') ||
      // I am keeping this line here because the surrounding errors.js workflow expects this value or operation before it continues.
      p === '/favicon.ico' ||
      // I am keeping this line here because the surrounding errors.js workflow expects this value or operation before it continues.
      p === '/robots.txt';

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (isStaticReq && (finalStatus === 404 || finalStatus === 403)) {
      // This return sends the completed value or response back to the code that called this function.
      return res.status(finalStatus).end();
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // Server-side logging only (never leak internals to the client)
    try {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      logger.error(
        // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
        {
          // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
          event: 'http.error',
          // I am keeping the `requestId` field in this object so the receiving code can read that value by its expected name.
          requestId: req.requestId || 'unknown',
          // I am keeping the `status` field in this object so the receiving code can read that value by its expected name.
          status: finalStatus,
          // I am keeping the `method` field in this object so the receiving code can read that value by its expected name.
          method: req.method,
          // I am keeping the `url` field in this object so the receiving code can read that value by its expected name.
          url: req.originalUrl || req.url,
          // I am keeping the `ip` field in this object so the receiving code can read that value by its expected name.
          ip: req.ip,
          // I am keeping the `err` field in this object so the receiving code can read that value by its expected name.
          err: {
            // I am keeping the `name` field in this object so the receiving code can read that value by its expected name.
            name: err?.name,
            // I am keeping the `message` field in this object so the receiving code can read that value by its expected name.
            message: err?.message,
            // I am keeping the `code` field in this object so the receiving code can read that value by its expected name.
            code: err?.code,
            // I am keeping the `type` field in this object so the receiving code can read that value by its expected name.
            type: err?.type,
            // Keep stack out of client responses; logs are server-side only
            stack: err?.stack,
          // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
          },
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        },
        // I am listing this entry here because the surrounding collection processes each allowed value in order.
        'Request error'
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      );
    // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
    } catch {
      // ignore logging failures
    }

    // 429 hint: if upstream rate limiter set retryAfter seconds, reflect it safely
    if (finalStatus === 429 && err?.retryAfter) {
      // I am building or sending the Express response here with the status, data, or page already chosen by this route.
      res.set('Retry-After', String(err.retryAfter));
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // Only show a custom message if the server explicitly marked it public
    const publicMessage =
      // I am keeping this line here because the surrounding errors.js workflow expects this value or operation before it continues.
      typeof err?.publicMessage === 'string' && err.publicMessage.trim()
        // I am keeping this line here because the surrounding errors.js workflow expects this value or operation before it continues.
        ? err.publicMessage.trim()
        // I am keeping this line here because the surrounding errors.js workflow expects this value or operation before it continues.
        : null;

    // I am saving `message` here so the nearby steps can reuse the same value without rebuilding it each time.
    const message = publicMessage || statusToMessage(finalStatus);
    // I am saving `code` here so the nearby steps can reuse the same value without rebuilding it each time.
    const code = finalStatus === 500 ? 'internal_error' : statusToCode(finalStatus);

    // I am calling this helper here so the current workflow performs this step before it moves on.
    respondError(req, res, {
      // I am keeping the `status` field in this object so the receiving code can read that value by its expected name.
      status: finalStatus,
      // I am keeping this line here because the surrounding errors.js workflow expects this value or operation before it continues.
      message,
      // I am keeping this line here because the surrounding errors.js workflow expects this value or operation before it continues.
      code,
      // I am keeping the `extra` field in this object so the receiving code can read that value by its expected name.
      extra: isProd
        // I am keeping this line here because the surrounding errors.js workflow expects this value or operation before it continues.
        ? {}
        // I am keeping this line here because the surrounding errors.js workflow expects this value or operation before it continues.
        : {
            // Dev-only hint; do not rely on this in production.
            detail: err?.message,
            // I am keeping the `type` field in this object so the receiving code can read that value by its expected name.
            type: err?.type || err?.code,
          // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
          },
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (consoleLogger && typeof consoleLogger.formatMiddlewareRegistration === 'function') {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    consoleLogger.formatMiddlewareRegistration('Error handling');
  // This alternative runs only when the condition above did not use its first path.
  } else {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.info({ event: 'boot.errors_registered' }, 'Error handling registered');
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am exporting this value here so another module can deliberately reuse the completed piece from errors.js.
module.exports = { registerErrorHandlers };