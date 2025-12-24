'use strict';

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
 * - Track open sockets for connection draining
 * - Close the HTTP server (stop accepting new connections)
 * - Cull lingering keep-alive sockets after a short delay
 * - Run optional cleanup hooks (redis, queues, etc.)
 * - Use correct exit codes:
 *   - SIGTERM/SIGINT => exit(0)
 *   - uncaughtException/unhandledRejection => exit(1)
 *
 * @param {Object} params
 * @param {Object} params.server - HTTP server instance from app.listen()
 * @param {Object} params.logger - Structured logger instance (pino-style recommended)
 * @param {Object} params.config - Application configuration object
 * @param {Object} [params.consoleLogger] - Console logger with formatting
 * @param {Array<{name:string, fn:Function}>} [params.cleanups] - Optional cleanup hooks
 */
function registerShutdownSystem({ server, logger, config, consoleLogger, cleanups = [] }) {
  const log = logger || require('../utils/logger');

  const GRACE_MS =
    Number(config?.shutdown?.graceMs) > 0 ? Number(config.shutdown.graceMs) : 15_000;

  // Give the server most of the grace period, then kill lingering sockets near the end
  const SOCKET_CULL_MS = Math.max(0, GRACE_MS - 2_000);

  let shuttingDown = false;
  let forcedExitTimer = null;
  let socketCullTimer = null;

  const sockets = new Set();

  // Track active connections for graceful draining
  if (server && typeof server.on === 'function') {
    server.on('connection', (sock) => {
      sockets.add(sock);
      sock.on('close', () => sockets.delete(sock));
    });
  }

  function safeFormatRegistered() {
    if (consoleLogger && typeof consoleLogger.formatMiddlewareRegistration === 'function') {
      consoleLogger.formatMiddlewareRegistration('Graceful shutdown system');
      return;
    }
    log.info({ event: 'boot.shutdown_registered' }, 'Graceful shutdown system registered');
  }

  async function runCleanups(signal) {
    if (!Array.isArray(cleanups) || cleanups.length === 0) return;

    const results = await Promise.allSettled(
      cleanups.map(async (c) => {
        const name = c?.name || 'cleanup';
        const fn = c?.fn;
        if (typeof fn !== 'function') {
          return { name, skipped: true };
        }
        await fn();
        return { name, ok: true };
      })
    );

    // Log results in a structured way
    for (const r of results) {
      if (r.status === 'fulfilled') {
        log.info(
          { event: 'shutdown.cleanup_ok', signal, cleanup: r.value?.name },
          'Shutdown cleanup completed'
        );
      } else {
        log.error(
          {
            event: 'shutdown.cleanup_failed',
            signal,
            error: r.reason?.message || String(r.reason),
          },
          'Shutdown cleanup failed'
        );
      }
    }
  }

  function destroyAllSockets() {
    for (const s of sockets) {
      try {
        s.destroy();
      } catch {
        // ignore
      }
    }
  }

  function scheduleFailsafes(exitCode, signal) {
    // Cull lingering sockets (keep-alive, long polls)
    socketCullTimer = setTimeout(() => {
      log.warn(
        { event: 'shutdown.socket_cull', signal, sockets: sockets.size },
        'Culling lingering sockets'
      );
      destroyAllSockets();
    }, SOCKET_CULL_MS);
    socketCullTimer.unref?.();

    // Final failsafe: force exit if server.close callback never happens
    forcedExitTimer = setTimeout(() => {
      log.error(
        { event: 'shutdown.force_exit', signal, exitCode },
        'Graceful shutdown timeout reached; forcing exit'
      );
      destroyAllSockets();
      process.exit(exitCode);
    }, GRACE_MS);
    forcedExitTimer.unref?.();
  }

  async function closeServer(signal) {
    if (!server || typeof server.close !== 'function') return;

    // If server isn't listening, close() can still callback immediately; handle both
    await new Promise((resolve) => {
      try {
        server.close((err) => {
          if (err) {
            log.error(
              { event: 'shutdown.server_close_error', signal, error: err.message },
              'HTTP server close error'
            );
          } else {
            log.info({ event: 'shutdown.server_closed', signal }, 'HTTP server closed');
          }
          resolve();
        });
      } catch (err) {
        log.error(
          { event: 'shutdown.server_close_throw', signal, error: err.message },
          'HTTP server close threw'
        );
        resolve();
      }
    });
  }

  /**
   * @param {string} signal
   * @param {number} exitCode
   * @param {Error} [cause]
   */
  async function gracefulShutdown(signal, exitCode, cause) {
    if (shuttingDown) {
      log.warn(
        { event: 'shutdown.duplicate_signal', signal, exitCode },
        'Shutdown already in progress (duplicate signal ignored)'
      );
      return;
    }
    shuttingDown = true;

    const errMeta = cause
      ? { error: cause.message, stack: cause.stack, name: cause.name }
      : undefined;

    log.info(
      { event: 'shutdown.initiated', signal, exitCode, ...(errMeta ? { cause: errMeta } : {}) },
      'GRACEFUL SHUTDOWN INITIATED'
    );

    scheduleFailsafes(exitCode, signal);

    // Stop accepting new connections and begin draining
    await closeServer(signal);

    // Run cleanup hooks (redis quit, queue drain, etc.)
    await runCleanups(signal);

    // Clear timers (best effort)
    try {
      if (socketCullTimer) clearTimeout(socketCullTimer);
      if (forcedExitTimer) clearTimeout(forcedExitTimer);
    } catch {
      // ignore
    }

    log.info({ event: 'shutdown.completed', signal, exitCode }, 'Graceful shutdown completed');
    process.exit(exitCode);
  }

  // SIGTERM/SIGINT are normal orchestrator/user stop signals => exit(0)
  process.once('SIGTERM', () => gracefulShutdown('SIGTERM', 0));
  process.once('SIGINT', () => gracefulShutdown('SIGINT', 0));

  // These are crash scenarios => exit(1) (but still attempt graceful drain)
  process.once('uncaughtException', (error) => {
    log.error(
      { event: 'shutdown.uncaught_exception', error: error.message, stack: error.stack },
      'Uncaught Exception'
    );
    gracefulShutdown('UNCAUGHT_EXCEPTION', 1, error);
  });

  process.once('unhandledRejection', (reason) => {
    const msg = reason instanceof Error ? reason.message : String(reason);
    const stack = reason instanceof Error ? reason.stack : undefined;

    log.error(
      { event: 'shutdown.unhandled_rejection', reason: msg, stack },
      'Unhandled Rejection'
    );
    gracefulShutdown('UNHANDLED_REJECTION', 1, reason instanceof Error ? reason : undefined);
  });

  safeFormatRegistered();
}

module.exports = { registerShutdownSystem };