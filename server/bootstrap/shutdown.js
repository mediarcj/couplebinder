// File: server/bootstrap/shutdown.js
// Description: Central place to register graceful shutdown handlers for the app
// Purpose: Separates shutdown logic from main server boot file
// Notes: Handles SIGTERM, SIGINT, uncaught exceptions, and unhandled rejections

/**
 * WHAT:
 * Register graceful shutdown system that handles termination signals and ensures
 * all resources are properly cleaned up.
 *
 * WHY:
 * Graceful shutdown prevents data corruption, ensures active requests complete safely,
 * and allows load balancers to drain connections properly. This is essential for
 * production deployments and zero-downtime updates.
 *
 * HOW:
 * We track server state, implement connection draining, close the HTTP server cleanly,
 * and provide timeout fallbacks. All shutdown paths exit with code 0 to avoid systemd/npm
 * reporting failures during restarts.
 *
 * @param {Object} params - Shutdown system registration parameters
 * @param {Object} params.server - HTTP server instance from app.listen()
 * @param {Object} params.logger - Structured logger instance
 * @param {Object} params.config - Application configuration object
 * @param {Object} params.consoleLogger - Console logger with formatting
 */
function registerShutdownSystem({ server, logger, config, consoleLogger }) {
  // Use the logger passed in, or fallback to requiring it if not provided
  const log = logger || require('../utils/logger');
  // Graceful shutdown configuration
  const GRACE_MS = config.shutdown.graceMs;
  const SOCKET_CULL_MS = Math.max(0, GRACE_MS - 2000);

  let shuttingDown = false;
  const sockets = new Set();

  // Track active connections for graceful draining
  server.on('connection', (sock) => {
    sockets.add(sock);
    sock.on('close', () => sockets.delete(sock));
  });

  /**
   * Gracefully shutdown the server and all resources
   * 
   * WHAT:
   * Handle shutdown signals exactly once, close HTTP server cleanly, and exit(0).
   * 
   * WHY:
   * Duplicate signals or timeout exits with code 1 make systemd/npm report failures.
   * Always exit(0) for clean restarts.
   * 
   * HOW:
   * 1) Debounce with process.once and shuttingDown flag
   * 2) Close server and cull lingering sockets
   * 3) Always exit(0) so systemd doesn't mark restart as failed
   * 
   * @param {string} signal - The signal that triggered shutdown
   */
  function gracefulShutdown(signal) {
    if (shuttingDown) {
      log.info({ event: 'shutdown.duplicate_signal', signal }, 'Shutdown already in progress (ignored duplicate signal)');
      return; // Just return, don't exit(1)
    }
    shuttingDown = true;

    log.info({ event: 'shutdown.initiated', signal }, 'GRACEFUL SHUTDOWN INITIATED');
    
    // Stop accepting new connections
    server.close((err) => {
      if (err) {
        log.error({ event: 'shutdown.server_close_error', error: err.message }, 'HTTP server close error');
        // Still exit(0) to avoid npm/systemd "failed" spam during restarts
        process.exit(0);
        return;
      }
      log.info({ event: 'shutdown.completed' }, 'Graceful shutdown completed');
      process.exit(0); // IMPORTANT: exit(0) so systemd/npm doesn't mark it as failure
    });

    // After a short delay, kill any lingering sockets (keep-alive, long polls)
    setTimeout(() => {
      for (const s of sockets) {
        try { s.destroy(); } catch {}
      }
    }, SOCKET_CULL_MS).unref();

    // Final failsafe - if close callback never fires, exit(0) anyway
    setTimeout(() => {
      log.warn({ event: 'shutdown.timeout' }, 'Graceful shutdown timeout reached, forcing exit');
      process.exit(0); // exit(0) on timeout to avoid restart "failed" noise
    }, GRACE_MS).unref();
  }

  // Handle termination signals (use once() to prevent duplicate handlers)
  process.once('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.once('SIGINT', () => gracefulShutdown('SIGINT'));

  // Handle uncaught exceptions and unhandled rejections
  process.once('uncaughtException', (error) => {
    log.error({ event: 'shutdown.uncaught_exception', error: error.message, stack: error.stack }, 'Uncaught Exception');
    gracefulShutdown('UNCAUGHT_EXCEPTION');
  });

  process.once('unhandledRejection', (reason, promise) => {
    log.error({ event: 'shutdown.unhandled_rejection', reason: String(reason) }, 'Unhandled Rejection');
    gracefulShutdown('UNHANDLED_REJECTION');
  });

  if (consoleLogger && typeof consoleLogger.formatMiddlewareRegistration === 'function') {
    consoleLogger.formatMiddlewareRegistration('Graceful shutdown system');
  } else {
    log.info({ event: 'boot.shutdown_registered' }, 'Graceful shutdown system registered');
  }
}

module.exports = { registerShutdownSystem };

