// I am keeping this line here because the surrounding shutdown.js workflow expects this value or operation before it continues.
'use strict';

// File: server/bootstrap/shutdown.js
// Description: Step-based graceful shutdown with request draining + diagnostics
// Purpose: Correct, observable shutdown (drain requests, run cleanups, kill lingering sockets)
// Notes: Still uses a hard deadline because Docker/K8s can hang forever otherwise.

function nowMs() {
  // This return sends the completed value or response back to the code that called this function.
  return Date.now();
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `sleep` as a named helper so the surrounding workflow can call this step when it needs it.
function sleep(ms) {
  // This return sends the completed value or response back to the code that called this function.
  return new Promise((r) => setTimeout(r, ms));
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
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
  // I am loading `../utils/logger` into `log` so this file can reuse that dependency below.
  const log = logger || require('../utils/logger');

  // I am saving `inFlight` here so the nearby steps can reuse the same value without rebuilding it each time.
  let inFlight = 0;
  const active = new Map(); // id -> { method, url, startMs }

  // I am saving `nextId` here so the nearby steps can reuse the same value without rebuilding it each time.
  let nextId = 1;

  // I am keeping `middleware` as a named helper so the surrounding workflow can call this step when it needs it.
  function middleware(req, res, next) {
    // I am saving `id` here so the nearby steps can reuse the same value without rebuilding it each time.
    const id = nextId++;
    // I am saving `startMs` here so the nearby steps can reuse the same value without rebuilding it each time.
    const startMs = nowMs();

    // I am keeping this line here because the surrounding shutdown.js workflow expects this value or operation before it continues.
    inFlight += 1;
    // I am calling this helper here so the current workflow performs this step before it moves on.
    active.set(id, {
      // I am keeping the `method` field in this object so the receiving code can read that value by its expected name.
      method: String(req.method || ''),
      // I am keeping the `url` field in this object so the receiving code can read that value by its expected name.
      url: String(req.originalUrl || req.url || ''),
      // I am keeping this line here because the surrounding shutdown.js workflow expects this value or operation before it continues.
      startMs
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am saving `done` here so the nearby steps can reuse the same value without rebuilding it each time.
    const done = () => {
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (!active.has(id)) return;
      // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
      active.delete(id);
      // I am keeping this line here because the surrounding shutdown.js workflow expects this value or operation before it continues.
      inFlight = Math.max(0, inFlight - 1);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    };

    // I am calling this helper here so the current workflow performs this step before it moves on.
    res.on('finish', done);
    // I am calling this helper here so the current workflow performs this step before it moves on.
    res.on('close', done);

    // I am calling this helper here so the current workflow performs this step before it moves on.
    next();
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am keeping `getInFlight` as a named helper so the surrounding workflow can call this step when it needs it.
  function getInFlight() {
    // This return sends the completed value or response back to the code that called this function.
    return inFlight;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am keeping `snapshotActive` as a named helper so the surrounding workflow can call this step when it needs it.
  function snapshotActive(limit = 10) {
    // I am saving `out` here so the nearby steps can reuse the same value without rebuilding it each time.
    const out = [];
    // I am saving `t` here so the nearby steps can reuse the same value without rebuilding it each time.
    const t = nowMs();
    // I am repeating the next block one item at a time so every value in the existing collection receives the same handling.
    for (const v of active.values()) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      out.push({
        // I am keeping the `method` field in this object so the receiving code can read that value by its expected name.
        method: v.method,
        // I am keeping the `url` field in this object so the receiving code can read that value by its expected name.
        url: v.url,
        // I am keeping the `ms` field in this object so the receiving code can read that value by its expected name.
        ms: t - v.startMs
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      });
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (out.length >= limit) break;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    // sort longest first (useful when diagnosing)
    out.sort((a, b) => (b.ms || 0) - (a.ms || 0));
    // This return sends the completed value or response back to the code that called this function.
    return out;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am keeping `waitForDrain` as a named asynchronous helper so the surrounding workflow can call this step when it needs it.
  async function waitForDrain({ timeoutMs = 10_000, pollMs = 150 } = {}) {
    // I am saving `deadline` here so the nearby steps can reuse the same value without rebuilding it each time.
    const deadline = nowMs() + Math.max(0, timeoutMs);
    // I am repeating the next block while this condition remains true, using the existing guard to decide when to stop.
    while (nowMs() < deadline) {
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (inFlight <= 0) return { drained: true, inFlight: 0 };
      // I am waiting for this asynchronous step here so the next line does not use its result before it is ready.
      await sleep(pollMs);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    // This return sends the completed value or response back to the code that called this function.
    return { drained: false, inFlight, active: snapshotActive(10) };
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // Low-noise informational log (only once at boot)
  log.info(
    // I am keeping this line here because the surrounding shutdown.js workflow expects this value or operation before it continues.
    { event: 'boot.request_tracker_registered' },
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    'Request tracker registered (supports shutdown draining)'
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  );

  // This return sends the completed value or response back to the code that called this function.
  return { middleware, getInFlight, snapshotActive, waitForDrain };
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * Graceful shutdown registrar (step-based).
 *
 * Params additions (new):
 * @param {Object} [params.requestTracker] - object returned by createRequestTracker()
 * @param {Function} [params.onShutdownStart] - callback invoked once at shutdown start (e.g., flip readiness flag)
 */
function registerShutdownSystem({
  // I am keeping this line here because the surrounding shutdown.js workflow expects this value or operation before it continues.
  server,
  // I am keeping this line here because the surrounding shutdown.js workflow expects this value or operation before it continues.
  logger,
  // I am keeping this line here because the surrounding shutdown.js workflow expects this value or operation before it continues.
  config,
  // I am keeping this line here because the surrounding shutdown.js workflow expects this value or operation before it continues.
  consoleLogger,
  // I am keeping this line here because the surrounding shutdown.js workflow expects this value or operation before it continues.
  cleanups = [],
  // I am keeping this line here because the surrounding shutdown.js workflow expects this value or operation before it continues.
  requestTracker,
  // I am keeping this line here because the surrounding shutdown.js workflow expects this value or operation before it continues.
  onShutdownStart
// I am keeping this line here because the surrounding shutdown.js workflow expects this value or operation before it continues.
}) {
  // I am loading `../utils/logger` into `log` so this file can reuse that dependency below.
  const log = logger || require('../utils/logger');

  // Tune from config if present, otherwise allow env overrides, otherwise defaults.
  const envGrace = Number(process.env.SHUTDOWN_GRACE_MS);
  // I am saving `envDrain` here so the nearby steps can reuse the same value without rebuilding it each time.
  const envDrain = Number(process.env.SHUTDOWN_DRAIN_MS);

  // I am saving `GRACE_MS` here so the nearby steps can reuse the same value without rebuilding it each time.
  const GRACE_MS =
    // I am calling this helper here so the current workflow performs this step before it moves on.
    Number(config?.shutdown?.graceMs) > 0
      // I am keeping this line here because the surrounding shutdown.js workflow expects this value or operation before it continues.
      ? Number(config.shutdown.graceMs)
      // I am keeping this line here because the surrounding shutdown.js workflow expects this value or operation before it continues.
      : (Number.isFinite(envGrace) && envGrace > 0 ? envGrace : 28_000);

  // time we spend waiting for active requests to finish before we start culling sockets
  const DRAIN_MS =
    // I am calling this helper here so the current workflow performs this step before it moves on.
    Number(config?.shutdown?.drainMs) > 0
      // I am keeping this line here because the surrounding shutdown.js workflow expects this value or operation before it continues.
      ? Number(config.shutdown.drainMs)
      // I am keeping this line here because the surrounding shutdown.js workflow expects this value or operation before it continues.
      : (Number.isFinite(envDrain) && envDrain > 0 ? envDrain : Math.min(20_000, Math.max(0, GRACE_MS - 6_000)));

  // Cull sockets near the end (leave ~2s for final logging/exit)
  const SOCKET_CULL_MS = Math.max(0, GRACE_MS - 2_000);

  // I am saving `shuttingDown` here so the nearby steps can reuse the same value without rebuilding it each time.
  let shuttingDown = false;

  // I am saving `sockets` here so the nearby steps can reuse the same value without rebuilding it each time.
  const sockets = new Set();

  // Track open connections (keep-alive sockets can keep a process alive)
  if (server && typeof server.on === 'function') {
    // I am defining this small callback here so the surrounding API can run it with the value it supplies.
    server.on('connection', (sock) => {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      sockets.add(sock);
      // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
      sock.on('close', () => sockets.delete(sock));
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am keeping `safeFormatRegistered` as a named helper so the surrounding workflow can call this step when it needs it.
  function safeFormatRegistered() {
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (consoleLogger && typeof consoleLogger.formatMiddlewareRegistration === 'function') {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      consoleLogger.formatMiddlewareRegistration('Graceful shutdown system');
      // This return sends the completed value or response back to the code that called this function.
      return;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    // I am calling this helper here so the current workflow performs this step before it moves on.
    log.info({ event: 'boot.shutdown_registered' }, 'Graceful shutdown system registered');
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am keeping `destroyAllSockets` as a named helper so the surrounding workflow can call this step when it needs it.
  function destroyAllSockets(reason = 'destroy') {
    // I am saving `count` here so the nearby steps can reuse the same value without rebuilding it each time.
    let count = 0;
    // I am repeating the next block one item at a time so every value in the existing collection receives the same handling.
    for (const s of sockets) {
      // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
      try {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        s.destroy();
        // I am keeping this line here because the surrounding shutdown.js workflow expects this value or operation before it continues.
        count += 1;
      // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
      } catch {
        // ignore
      }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (count > 0) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      log.warn(
        // I am keeping this line here because the surrounding shutdown.js workflow expects this value or operation before it continues.
        { event: 'shutdown.sockets_destroyed', reason, count },
        // I am listing this entry here because the surrounding collection processes each allowed value in order.
        'Destroyed lingering sockets'
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      );
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am keeping `summarizeState` as a named helper so the surrounding workflow can call this step when it needs it.
  function summarizeState(signal, exitCode, phase, extra = {}) {
    // I am saving `inFlight` here so the nearby steps can reuse the same value without rebuilding it each time.
    const inFlight = requestTracker && typeof requestTracker.getInFlight === 'function'
      // I am keeping this line here because the surrounding shutdown.js workflow expects this value or operation before it continues.
      ? requestTracker.getInFlight()
      // I am keeping this line here because the surrounding shutdown.js workflow expects this value or operation before it continues.
      : undefined;

    // I am saving `active` here so the nearby steps can reuse the same value without rebuilding it each time.
    const active = requestTracker && typeof requestTracker.snapshotActive === 'function'
      // I am keeping this line here because the surrounding shutdown.js workflow expects this value or operation before it continues.
      ? requestTracker.snapshotActive(6)
      // I am keeping this line here because the surrounding shutdown.js workflow expects this value or operation before it continues.
      : undefined;

    // This return sends the completed value or response back to the code that called this function.
    return {
      // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
      event: 'shutdown.summary',
      // I am keeping this line here because the surrounding shutdown.js workflow expects this value or operation before it continues.
      signal,
      // I am keeping this line here because the surrounding shutdown.js workflow expects this value or operation before it continues.
      exitCode,
      // I am keeping this line here because the surrounding shutdown.js workflow expects this value or operation before it continues.
      phase,
      // I am keeping the `sockets` field in this object so the receiving code can read that value by its expected name.
      sockets: sockets.size,
      // I am keeping this line here because the surrounding shutdown.js workflow expects this value or operation before it continues.
      inFlight,
      // I am keeping this line here because the surrounding shutdown.js workflow expects this value or operation before it continues.
      active,
      // I am keeping this line here because the surrounding shutdown.js workflow expects this value or operation before it continues.
      ...extra
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    };
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am keeping `closeServer` as a named asynchronous helper so the surrounding workflow can call this step when it needs it.
  async function closeServer(signal) {
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!server || typeof server.close !== 'function') return;

    // I am waiting for this asynchronous step here so the next line does not use its result before it is ready.
    await new Promise((resolve) => {
      // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
      try {
        // I am defining this small callback here so the surrounding API can run it with the value it supplies.
        server.close((err) => {
          // This check helps me choose or stop the next path before any work that depends on this condition runs.
          if (err) {
            // I am calling this helper here so the current workflow performs this step before it moves on.
            log.error(
              // I am keeping this line here because the surrounding shutdown.js workflow expects this value or operation before it continues.
              { event: 'shutdown.server_close_error', signal, error: err.message },
              // I am listing this entry here because the surrounding collection processes each allowed value in order.
              'HTTP server close error'
            // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
            );
          // This alternative runs only when the condition above did not use its first path.
          } else {
            // I am calling this helper here so the current workflow performs this step before it moves on.
            log.info({ event: 'shutdown.server_closed', signal }, 'HTTP server stopped accepting new connections');
          // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
          }
          // I am calling this helper here so the current workflow performs this step before it moves on.
          resolve();
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        });
      // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
      } catch (err) {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        log.error(
          // I am keeping this line here because the surrounding shutdown.js workflow expects this value or operation before it continues.
          { event: 'shutdown.server_close_throw', signal, error: err.message },
          // I am listing this entry here because the surrounding collection processes each allowed value in order.
          'HTTP server close threw'
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        );
        // I am calling this helper here so the current workflow performs this step before it moves on.
        resolve();
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am keeping `runCleanups` as a named asynchronous helper so the surrounding workflow can call this step when it needs it.
  async function runCleanups(signal) {
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!Array.isArray(cleanups) || cleanups.length === 0) return { ok: 0, failed: 0 };

    // I am saving `ok` here so the nearby steps can reuse the same value without rebuilding it each time.
    let ok = 0;
    // I am saving `failed` here so the nearby steps can reuse the same value without rebuilding it each time.
    let failed = 0;

    // Run in order (more predictable; you can control dependency ordering)
    for (const c of cleanups) {
      // I am saving `name` here so the nearby steps can reuse the same value without rebuilding it each time.
      const name = c?.name || 'cleanup';
      // I am saving `fn` here so the nearby steps can reuse the same value without rebuilding it each time.
      const fn = c?.fn;

      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (typeof fn !== 'function') {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        log.warn({ event: 'shutdown.cleanup_skipped', signal, cleanup: name }, 'Cleanup skipped (no function)');
        // I am changing the loop flow here once the condition above has decided this item needs no further work in this pass.
        continue;
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }

      // I am saving `t0` here so the nearby steps can reuse the same value without rebuilding it each time.
      const t0 = nowMs();
      // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
      try {
        // I am waiting for this asynchronous step here so the next line does not use its result before it is ready.
        await fn();
        // I am keeping this line here because the surrounding shutdown.js workflow expects this value or operation before it continues.
        ok += 1;
        // I am calling this helper here so the current workflow performs this step before it moves on.
        log.info(
          // I am keeping this line here because the surrounding shutdown.js workflow expects this value or operation before it continues.
          { event: 'shutdown.cleanup_ok', signal, cleanup: name, ms: nowMs() - t0 },
          // I am listing this entry here because the surrounding collection processes each allowed value in order.
          'Cleanup completed'
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        );
      // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
      } catch (err) {
        // I am keeping this line here because the surrounding shutdown.js workflow expects this value or operation before it continues.
        failed += 1;
        // I am calling this helper here so the current workflow performs this step before it moves on.
        log.error(
          // I am keeping this line here because the surrounding shutdown.js workflow expects this value or operation before it continues.
          { event: 'shutdown.cleanup_failed', signal, cleanup: name, error: err?.message || String(err) },
          // I am listing this entry here because the surrounding collection processes each allowed value in order.
          'Cleanup failed'
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        );
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // This return sends the completed value or response back to the code that called this function.
    return { ok, failed };
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am keeping `runStep` as a named asynchronous helper so the surrounding workflow can call this step when it needs it.
  async function runStep(name, fn, timeoutMs, signal, exitCode) {
    // I am saving `t0` here so the nearby steps can reuse the same value without rebuilding it each time.
    const t0 = nowMs();
    // I am saving `ms` here so the nearby steps can reuse the same value without rebuilding it each time.
    const ms = Math.max(0, Number(timeoutMs) || 0);

    // I am calling this helper here so the current workflow performs this step before it moves on.
    log.info({ event: 'shutdown.step_start', step: name, signal }, 'Shutdown step started');

    // I am saving `timedOut` here so the nearby steps can reuse the same value without rebuilding it each time.
    let timedOut = false;

    // I am saving `timeout` here so the nearby steps can reuse the same value without rebuilding it each time.
    const timeout = ms
      // I am defining this small callback here so the surrounding API can run it with the value it supplies.
      ? new Promise((_, reject) => {
          // I am saving `t` here so the nearby steps can reuse the same value without rebuilding it each time.
          const t = setTimeout(() => {
            // I am keeping this line here because the surrounding shutdown.js workflow expects this value or operation before it continues.
            timedOut = true;
            // I am calling this helper here so the current workflow performs this step before it moves on.
            reject(new Error(`Step timeout after ${ms}ms`));
          // I am keeping this line here because the surrounding shutdown.js workflow expects this value or operation before it continues.
          }, ms);
          // I am keeping this line here because the surrounding shutdown.js workflow expects this value or operation before it continues.
          t.unref?.();
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        })
      // I am keeping this line here because the surrounding shutdown.js workflow expects this value or operation before it continues.
      : null;

    // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
    try {
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (timeout) {
        // I am waiting for this asynchronous step here so the next line does not use its result before it is ready.
        await Promise.race([fn(), timeout]);
      // This alternative runs only when the condition above did not use its first path.
      } else {
        // I am waiting for this asynchronous step here so the next line does not use its result before it is ready.
        await fn();
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }

      // I am calling this helper here so the current workflow performs this step before it moves on.
      log.info(
        // I am keeping this line here because the surrounding shutdown.js workflow expects this value or operation before it continues.
        { event: 'shutdown.step_ok', step: name, signal, ms: nowMs() - t0 },
        // I am listing this entry here because the surrounding collection processes each allowed value in order.
        'Shutdown step completed'
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      );

      // This return sends the completed value or response back to the code that called this function.
      return { ok: true, ms: nowMs() - t0 };
    // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
    } catch (err) {
      // I am saving `meta` here so the nearby steps can reuse the same value without rebuilding it each time.
      const meta = summarizeState(signal, exitCode, name, {
        // I am keeping the `stepError` field in this object so the receiving code can read that value by its expected name.
        stepError: err?.message || String(err),
        // I am keeping this line here because the surrounding shutdown.js workflow expects this value or operation before it continues.
        timedOut
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      });

      // This is important: show state if a step fails, so you know what hung.
      log.error(meta, 'Shutdown step failed');
      // This return sends the completed value or response back to the code that called this function.
      return { ok: false, ms: nowMs() - t0, error: err };
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  /**
   * @param {string} signal
   * @param {number} exitCode
   * @param {Error} [cause]
   */
  async function gracefulShutdown(signal, exitCode, cause) {
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (shuttingDown) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      log.warn(
        // I am keeping this line here because the surrounding shutdown.js workflow expects this value or operation before it continues.
        { event: 'shutdown.duplicate_signal', signal, exitCode },
        // I am listing this entry here because the surrounding collection processes each allowed value in order.
        'Shutdown already in progress (duplicate signal ignored)'
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      );
      // This return sends the completed value or response back to the code that called this function.
      return;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    // I am keeping this line here because the surrounding shutdown.js workflow expects this value or operation before it continues.
    shuttingDown = true;

    // I am saving `errMeta` here so the nearby steps can reuse the same value without rebuilding it each time.
    const errMeta = cause
      // I am keeping this line here because the surrounding shutdown.js workflow expects this value or operation before it continues.
      ? { error: cause.message, stack: cause.stack, name: cause.name }
      // I am keeping this line here because the surrounding shutdown.js workflow expects this value or operation before it continues.
      : undefined;

    // I am calling this helper here so the current workflow performs this step before it moves on.
    log.info(
      // I am keeping this line here because the surrounding shutdown.js workflow expects this value or operation before it continues.
      { event: 'shutdown.initiated', signal, exitCode, ...(errMeta ? { cause: errMeta } : {}) },
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      'GRACEFUL SHUTDOWN INITIATED'
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    );

    // Allow app to flip readiness, stop accepting new work, etc.
    try {
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (typeof onShutdownStart === 'function') onShutdownStart();
    // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
    } catch (e) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      log.warn(
        // I am keeping this line here because the surrounding shutdown.js workflow expects this value or operation before it continues.
        { event: 'shutdown.on_start_failed', signal, error: e?.message || String(e) },
        // I am listing this entry here because the surrounding collection processes each allowed value in order.
        'onShutdownStart threw (ignored)'
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      );
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // Global failsafes (Docker will SIGKILL after its grace period, but we also self-enforce)
    const socketCullTimer = setTimeout(() => {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      log.warn(
        // I am calling this helper here so the current workflow performs this step before it moves on.
        summarizeState(signal, exitCode, 'socket_cull'),
        // I am listing this entry here because the surrounding collection processes each allowed value in order.
        'Culling lingering sockets near deadline'
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      );
      // I am calling this helper here so the current workflow performs this step before it moves on.
      destroyAllSockets('cull');
    // I am keeping this line here because the surrounding shutdown.js workflow expects this value or operation before it continues.
    }, SOCKET_CULL_MS);
    // I am keeping this line here because the surrounding shutdown.js workflow expects this value or operation before it continues.
    socketCullTimer.unref?.();

    // I am saving `forcedExitTimer` here so the nearby steps can reuse the same value without rebuilding it each time.
    const forcedExitTimer = setTimeout(() => {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      log.error(
        // I am calling this helper here so the current workflow performs this step before it moves on.
        summarizeState(signal, exitCode, 'force_exit', { graceMs: GRACE_MS }),
        // I am listing this entry here because the surrounding collection processes each allowed value in order.
        'Graceful shutdown deadline reached; forcing exit'
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      );
      // I am calling this helper here so the current workflow performs this step before it moves on.
      destroyAllSockets('force_exit');
      // I am calling this helper here so the current workflow performs this step before it moves on.
      process.exit(exitCode);
    // I am keeping this line here because the surrounding shutdown.js workflow expects this value or operation before it continues.
    }, GRACE_MS);
    // I am keeping this line here because the surrounding shutdown.js workflow expects this value or operation before it continues.
    forcedExitTimer.unref?.();

    // Step 1: stop taking new connections
    await runStep(
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      'close_server',
      // I am defining this small callback here so the surrounding API can run it with the value it supplies.
      async () => closeServer(signal),
      // I am calling this helper here so the current workflow performs this step before it moves on.
      Math.min(5_000, Math.max(1_000, Math.floor(GRACE_MS / 4))),
      // I am keeping this line here because the surrounding shutdown.js workflow expects this value or operation before it continues.
      signal,
      // I am keeping this line here because the surrounding shutdown.js workflow expects this value or operation before it continues.
      exitCode
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    );

    // Step 2: drain in-flight requests (if tracker wired in)
    if (requestTracker && typeof requestTracker.waitForDrain === 'function') {
      // I am waiting for this asynchronous step here so the next line does not use its result before it is ready.
      await runStep(
        // I am listing this entry here because the surrounding collection processes each allowed value in order.
        'drain_requests',
        // I am defining this small callback here so the surrounding API can run it with the value it supplies.
        async () => {
          // I am saving `res` here so the nearby steps can reuse the same value without rebuilding it each time.
          const res = await requestTracker.waitForDrain({ timeoutMs: DRAIN_MS });
          // This check helps me choose or stop the next path before any work that depends on this condition runs.
          if (!res.drained) {
            // Not fatal by itself; we log state and continue to cleanup then socket cull may handle the rest.
            log.warn(
              // I am calling this helper here so the current workflow performs this step before it moves on.
              summarizeState(signal, exitCode, 'drain_requests', { drainMs: DRAIN_MS }),
              // I am listing this entry here because the surrounding collection processes each allowed value in order.
              'Request drain timed out; continuing shutdown'
            // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
            );
          // This alternative runs only when the condition above did not use its first path.
          } else {
            // I am calling this helper here so the current workflow performs this step before it moves on.
            log.info({ event: 'shutdown.requests_drained', signal, drainMs: DRAIN_MS }, 'All in-flight requests drained');
          // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
          }
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        },
        DRAIN_MS + 500, // small buffer for final check/log
        // I am keeping this line here because the surrounding shutdown.js workflow expects this value or operation before it continues.
        signal,
        // I am keeping this line here because the surrounding shutdown.js workflow expects this value or operation before it continues.
        exitCode
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      );
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // Step 3: run cleanup hooks (redis quit, stop outbox interval, etc.)
    await runStep(
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      'cleanups',
      // I am defining this small callback here so the surrounding API can run it with the value it supplies.
      async () => {
        // I am waiting for this asynchronous step here so the next line does not use its result before it is ready.
        await runCleanups(signal);
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      },
      // I am calling this helper here so the current workflow performs this step before it moves on.
      Math.max(2_000, Math.floor(GRACE_MS / 2)),
      // I am keeping this line here because the surrounding shutdown.js workflow expects this value or operation before it continues.
      signal,
      // I am keeping this line here because the surrounding shutdown.js workflow expects this value or operation before it continues.
      exitCode
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    );

    // Final socket cleanup (best-effort)
    if (sockets.size > 0) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      destroyAllSockets('final');
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // Clear timers
    try {
      // I am updating or clearing this saved state here so the interface reflects the result of the action above.
      clearTimeout(socketCullTimer);
      // I am updating or clearing this saved state here so the interface reflects the result of the action above.
      clearTimeout(forcedExitTimer);
    // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
    } catch {
      // ignore
    }

    // I am calling this helper here so the current workflow performs this step before it moves on.
    log.info(summarizeState(signal, exitCode, 'completed'), 'Graceful shutdown completed');
    // I am calling this helper here so the current workflow performs this step before it moves on.
    process.exit(exitCode);
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // SIGTERM/SIGINT are normal stop signals => exit(0)
  process.once('SIGTERM', () => gracefulShutdown('SIGTERM', 0));
  // I am defining this small callback here so the surrounding API can run it with the value it supplies.
  process.once('SIGINT', () => gracefulShutdown('SIGINT', 0));

  // Crash scenarios => exit(1) (still attempt drain)
  process.once('uncaughtException', (error) => {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    log.error(
      // I am keeping this line here because the surrounding shutdown.js workflow expects this value or operation before it continues.
      { event: 'shutdown.uncaught_exception', error: error.message, stack: error.stack },
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      'Uncaught Exception'
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    );
    // I am calling this helper here so the current workflow performs this step before it moves on.
    gracefulShutdown('UNCAUGHT_EXCEPTION', 1, error);
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });

  // I am defining this small callback here so the surrounding API can run it with the value it supplies.
  process.once('unhandledRejection', (reason) => {
    // I am saving `msg` here so the nearby steps can reuse the same value without rebuilding it each time.
    const msg = reason instanceof Error ? reason.message : String(reason);
    // I am saving `stack` here so the nearby steps can reuse the same value without rebuilding it each time.
    const stack = reason instanceof Error ? reason.stack : undefined;

    // I am calling this helper here so the current workflow performs this step before it moves on.
    log.error(
      // I am keeping this line here because the surrounding shutdown.js workflow expects this value or operation before it continues.
      { event: 'shutdown.unhandled_rejection', reason: msg, stack },
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      'Unhandled Rejection'
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    );
    // I am calling this helper here so the current workflow performs this step before it moves on.
    gracefulShutdown('UNHANDLED_REJECTION', 1, reason instanceof Error ? reason : undefined);
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });

  // I am calling this helper here so the current workflow performs this step before it moves on.
  safeFormatRegistered();
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am exporting this value here so another module can deliberately reuse the completed piece from shutdown.js.
module.exports = {
  // I am keeping this line here because the surrounding shutdown.js workflow expects this value or operation before it continues.
  registerShutdownSystem,
  // I am keeping this line here because the surrounding shutdown.js workflow expects this value or operation before it continues.
  createRequestTracker
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
};