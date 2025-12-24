'use strict';

// File: server/bootstrap/shutdown.js
// Description: Step-based graceful shutdown with request draining + diagnostics
// Purpose: Correct, observable shutdown (drain requests, run cleanups, kill lingering sockets)
// Notes: Still uses a hard deadline because Docker/K8s can hang forever otherwise.

function nowMs() {
  return Date.now();
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Create a request tracker middleware so shutdown can *confirm* active requests drained.
 *
 * HOW:
 * - middleware increments inFlight at request start
 * - decrements on res.finish/res.close
 * - tracks a small sample of active requests for diagnostics if we time out
 */
function createRequestTracker({ logger } = {}) {
  const log = logger || require('../utils/logger');

  let inFlight = 0;
  const active = new Map(); // id -> { method, url, startMs }

  let nextId = 1;

  function middleware(req, res, next) {
    const id = nextId++;
    const startMs = nowMs();

    inFlight += 1;
    active.set(id, {
      method: String(req.method || ''),
      url: String(req.originalUrl || req.url || ''),
      startMs
    });

    const done = () => {
      if (!active.has(id)) return;
      active.delete(id);
      inFlight = Math.max(0, inFlight - 1);
    };

    res.on('finish', done);
    res.on('close', done);

    next();
  }

  function getInFlight() {
    return inFlight;
  }

  function snapshotActive(limit = 10) {
    const out = [];
    const t = nowMs();
    for (const v of active.values()) {
      out.push({
        method: v.method,
        url: v.url,
        ms: t - v.startMs
      });
      if (out.length >= limit) break;
    }
    // sort longest first (useful when diagnosing)
    out.sort((a, b) => (b.ms || 0) - (a.ms || 0));
    return out;
  }

  async function waitForDrain({ timeoutMs = 10_000, pollMs = 150 } = {}) {
    const deadline = nowMs() + Math.max(0, timeoutMs);
    while (nowMs() < deadline) {
      if (inFlight <= 0) return { drained: true, inFlight: 0 };
      await sleep(pollMs);
    }
    return { drained: false, inFlight, active: snapshotActive(10) };
  }

  // Low-noise informational log (only once at boot)
  log.info(
    { event: 'boot.request_tracker_registered' },
    'Request tracker registered (supports shutdown draining)'
  );

  return { middleware, getInFlight, snapshotActive, waitForDrain };
}

/**
 * Graceful shutdown registrar (step-based).
 *
 * Params additions (new):
 * @param {Object} [params.requestTracker] - object returned by createRequestTracker()
 * @param {Function} [params.onShutdownStart] - callback invoked once at shutdown start (e.g., flip readiness flag)
 */
function registerShutdownSystem({
  server,
  logger,
  config,
  consoleLogger,
  cleanups = [],
  requestTracker,
  onShutdownStart
}) {
  const log = logger || require('../utils/logger');

  // Tune from config if present, otherwise allow env overrides, otherwise defaults.
  const envGrace = Number(process.env.SHUTDOWN_GRACE_MS);
  const envDrain = Number(process.env.SHUTDOWN_DRAIN_MS);

  const GRACE_MS =
    Number(config?.shutdown?.graceMs) > 0
      ? Number(config.shutdown.graceMs)
      : (Number.isFinite(envGrace) && envGrace > 0 ? envGrace : 28_000);

  // time we spend waiting for active requests to finish before we start culling sockets
  const DRAIN_MS =
    Number(config?.shutdown?.drainMs) > 0
      ? Number(config.shutdown.drainMs)
      : (Number.isFinite(envDrain) && envDrain > 0 ? envDrain : Math.min(20_000, Math.max(0, GRACE_MS - 6_000)));

  // Cull sockets near the end (leave ~2s for final logging/exit)
  const SOCKET_CULL_MS = Math.max(0, GRACE_MS - 2_000);

  let shuttingDown = false;

  const sockets = new Set();

  // Track open connections (keep-alive sockets can keep a process alive)
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

  function destroyAllSockets(reason = 'destroy') {
    let count = 0;
    for (const s of sockets) {
      try {
        s.destroy();
        count += 1;
      } catch {
        // ignore
      }
    }
    if (count > 0) {
      log.warn(
        { event: 'shutdown.sockets_destroyed', reason, count },
        'Destroyed lingering sockets'
      );
    }
  }

  function summarizeState(signal, exitCode, phase, extra = {}) {
    const inFlight = requestTracker && typeof requestTracker.getInFlight === 'function'
      ? requestTracker.getInFlight()
      : undefined;

    const active = requestTracker && typeof requestTracker.snapshotActive === 'function'
      ? requestTracker.snapshotActive(6)
      : undefined;

    return {
      event: 'shutdown.summary',
      signal,
      exitCode,
      phase,
      sockets: sockets.size,
      inFlight,
      active,
      ...extra
    };
  }

  async function closeServer(signal) {
    if (!server || typeof server.close !== 'function') return;

    await new Promise((resolve) => {
      try {
        server.close((err) => {
          if (err) {
            log.error(
              { event: 'shutdown.server_close_error', signal, error: err.message },
              'HTTP server close error'
            );
          } else {
            log.info({ event: 'shutdown.server_closed', signal }, 'HTTP server stopped accepting new connections');
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

  async function runCleanups(signal) {
    if (!Array.isArray(cleanups) || cleanups.length === 0) return { ok: 0, failed: 0 };

    let ok = 0;
    let failed = 0;

    // Run in order (more predictable; you can control dependency ordering)
    for (const c of cleanups) {
      const name = c?.name || 'cleanup';
      const fn = c?.fn;

      if (typeof fn !== 'function') {
        log.warn({ event: 'shutdown.cleanup_skipped', signal, cleanup: name }, 'Cleanup skipped (no function)');
        continue;
      }

      const t0 = nowMs();
      try {
        await fn();
        ok += 1;
        log.info(
          { event: 'shutdown.cleanup_ok', signal, cleanup: name, ms: nowMs() - t0 },
          'Cleanup completed'
        );
      } catch (err) {
        failed += 1;
        log.error(
          { event: 'shutdown.cleanup_failed', signal, cleanup: name, error: err?.message || String(err) },
          'Cleanup failed'
        );
      }
    }

    return { ok, failed };
  }

  async function runStep(name, fn, timeoutMs, signal, exitCode) {
    const t0 = nowMs();
    const ms = Math.max(0, Number(timeoutMs) || 0);

    log.info({ event: 'shutdown.step_start', step: name, signal }, 'Shutdown step started');

    let timedOut = false;

    const timeout = ms
      ? new Promise((_, reject) => {
          const t = setTimeout(() => {
            timedOut = true;
            reject(new Error(`Step timeout after ${ms}ms`));
          }, ms);
          t.unref?.();
        })
      : null;

    try {
      if (timeout) {
        await Promise.race([fn(), timeout]);
      } else {
        await fn();
      }

      log.info(
        { event: 'shutdown.step_ok', step: name, signal, ms: nowMs() - t0 },
        'Shutdown step completed'
      );

      return { ok: true, ms: nowMs() - t0 };
    } catch (err) {
      const meta = summarizeState(signal, exitCode, name, {
        stepError: err?.message || String(err),
        timedOut
      });

      // This is important: show state if a step fails, so you know what hung.
      log.error(meta, 'Shutdown step failed');
      return { ok: false, ms: nowMs() - t0, error: err };
    }
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

    // Allow app to flip readiness, stop accepting new work, etc.
    try {
      if (typeof onShutdownStart === 'function') onShutdownStart();
    } catch (e) {
      log.warn(
        { event: 'shutdown.on_start_failed', signal, error: e?.message || String(e) },
        'onShutdownStart threw (ignored)'
      );
    }

    // Global failsafes (Docker will SIGKILL after its grace period, but we also self-enforce)
    const socketCullTimer = setTimeout(() => {
      log.warn(
        summarizeState(signal, exitCode, 'socket_cull'),
        'Culling lingering sockets near deadline'
      );
      destroyAllSockets('cull');
    }, SOCKET_CULL_MS);
    socketCullTimer.unref?.();

    const forcedExitTimer = setTimeout(() => {
      log.error(
        summarizeState(signal, exitCode, 'force_exit', { graceMs: GRACE_MS }),
        'Graceful shutdown deadline reached; forcing exit'
      );
      destroyAllSockets('force_exit');
      process.exit(exitCode);
    }, GRACE_MS);
    forcedExitTimer.unref?.();

    // Step 1: stop taking new connections
    await runStep(
      'close_server',
      async () => closeServer(signal),
      Math.min(5_000, Math.max(1_000, Math.floor(GRACE_MS / 4))),
      signal,
      exitCode
    );

    // Step 2: drain in-flight requests (if tracker wired in)
    if (requestTracker && typeof requestTracker.waitForDrain === 'function') {
      await runStep(
        'drain_requests',
        async () => {
          const res = await requestTracker.waitForDrain({ timeoutMs: DRAIN_MS });
          if (!res.drained) {
            // Not fatal by itself; we log state and continue to cleanup then socket cull may handle the rest.
            log.warn(
              summarizeState(signal, exitCode, 'drain_requests', { drainMs: DRAIN_MS }),
              'Request drain timed out; continuing shutdown'
            );
          } else {
            log.info({ event: 'shutdown.requests_drained', signal, drainMs: DRAIN_MS }, 'All in-flight requests drained');
          }
        },
        DRAIN_MS + 500, // small buffer for final check/log
        signal,
        exitCode
      );
    }

    // Step 3: run cleanup hooks (redis quit, stop outbox interval, etc.)
    await runStep(
      'cleanups',
      async () => {
        await runCleanups(signal);
      },
      Math.max(2_000, Math.floor(GRACE_MS / 2)),
      signal,
      exitCode
    );

    // Final socket cleanup (best-effort)
    if (sockets.size > 0) {
      destroyAllSockets('final');
    }

    // Clear timers
    try {
      clearTimeout(socketCullTimer);
      clearTimeout(forcedExitTimer);
    } catch {
      // ignore
    }

    log.info(summarizeState(signal, exitCode, 'completed'), 'Graceful shutdown completed');
    process.exit(exitCode);
  }

  // SIGTERM/SIGINT are normal stop signals => exit(0)
  process.once('SIGTERM', () => gracefulShutdown('SIGTERM', 0));
  process.once('SIGINT', () => gracefulShutdown('SIGINT', 0));

  // Crash scenarios => exit(1) (still attempt drain)
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

module.exports = {
  registerShutdownSystem,
  createRequestTracker
};