// File: server/routes/health.js
// Description: Health, liveness, readiness, and ops endpoints
// Purpose: Fast probes for LB/monitors + gated ops JSON
// Notes: Uses only config; no invented env names. Keeps legacy paths for Docker.

// ──────────────────────────────────────────────────────────────────────────────
// WHAT / WHY / HOW
// ─────────────────────────────────────────────────────────────────────────────-
/**
 * WHAT:
 *  - Liveness  : "/", "/healthz", "/livez", "/liveness"   (token/IP/public via healthShield)
 *  - Readiness : "/readyz", "/readiness"                  (token/IP/public via healthShield)
 *  - Ops JSON  : "/ops" and "/ops/health" (GET/HEAD)      (token/IP/public via config)
 *
 * WHY:
 *  - Liveness answers “Is the process up?” with near-zero work.
 *  - Readiness answers “Can it serve?” with a tiny Redis ping + flags.
 *  - Ops is deeper SRE info, gated to avoid leaking internals.
 *
 * HOW:
 *  - Gate cheap endpoints with your existing healthShield.
 *  - For Ops: allow if config.health.public === true, or
 *    header "X-Ops-Health-Token" === config.ops.token (also accepts "X-Ops-Token"),
 *    or IP in config.health.allowlist.
 *  - No hard dependency on a Redis client; we use req.app.locals if present.
 */

const express = require('express');
// I am saving `router` here so the nearby steps can reuse the same value without rebuilding it each time.
const router = express.Router();

// I am loading `../config` into `config` so this file can reuse that dependency below.
const { config } = require('../config');
// I am loading `../utils/logger` into `logger` so this file can reuse that dependency below.
const logger = require('../utils/logger');
// I am loading `../middleware/healthShield` into `healthShield` so this file can reuse that dependency below.
const healthShield = require('../middleware/healthShield');

// Optional Supabase admin client; skip DB probe if unavailable.
let supabaseAdmin = null;
// I am starting a guarded operation here because a request, parser, or dependency used below may fail.
try {
  // I am keeping this line here because the surrounding health.js workflow expects this value or operation before it continues.
  ({ supabaseAdmin } = require('../utils/supabaseClient'));
// I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
} catch {
  // I am keeping this line here because the surrounding health.js workflow expects this value or operation before it continues.
  supabaseAdmin = null;
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// ──────────────────────────────────────────────────────────────────────────────
// Redis status snapshot (updated by zorvalon.js)
// ─────────────────────────────────────────────────────────────────────────────-
let redisStatus = { connected: false, lastCheck: null };

/**
 * WHAT:
 *  Update Redis connectivity snapshot for health views.
 *
 * WHY:
 *  Health endpoints should reflect current Redis status without tight coupling.
 *
 * HOW:
 *  Called by server init/redis handlers:
 *    const { updateRedisStatus } = require('./routes/health');
 *    updateRedisStatus(true/false);
 */
function updateRedisStatus(connected, lastCheck = null) {
  // I am keeping this line here because the surrounding health.js workflow expects this value or operation before it continues.
  redisStatus = {
    // I am keeping the `connected` field in this object so the receiving code can read that value by its expected name.
    connected: !!connected,
    // I am keeping the `lastCheck` field in this object so the receiving code can read that value by its expected name.
    lastCheck: lastCheck || new Date().toISOString()
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  };
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// ──────────────────────────────────────────────────────────────────────────────
/**
 * Auth helper for Ops JSON
 * - public: config.health.public === true
 * - header: X-Ops-Health-Token (preferred) or X-Ops-Token matches configured token
 * - ip:     req.clientIp/req.ip is in config.health.allowlist[]
 */
function isOpsAuthorized(req) {
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (config?.health?.public === true) return true;

  // I am saving `want` here so the nearby steps can reuse the same value without rebuilding it each time.
  const want =
    // I am keeping this line here because the surrounding health.js workflow expects this value or operation before it continues.
    (config?.ops?.token || config?.health?.token || '').trim();
  // I am saving `got` here so the nearby steps can reuse the same value without rebuilding it each time.
  const got =
    // I am calling this helper here so the current workflow performs this step before it moves on.
    String(req.get('X-Ops-Health-Token') || req.get('X-Ops-Token') || '').trim();
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (want && got && want === got) return true;

  // I am saving `ip` here so the nearby steps can reuse the same value without rebuilding it each time.
  const ip = (req.clientIp || req.ip || '').toString();
  // I am saving `allow` here so the nearby steps can reuse the same value without rebuilding it each time.
  const allow = new Set((config?.health?.allowlist || []).map(String));
  // This return sends the completed value or response back to the code that called this function.
  return ip && allow.has(ip);
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// ──────────────────────────────────────────────────────────────────────────────
// Small helpers
// ─────────────────────────────────────────────────────────────────────────────-
async function tryRedisPing(req) {
  // I am saving `out` here so the nearby steps can reuse the same value without rebuilding it each time.
  const out = { ok: false, pingMs: null, snapshot: redisStatus };
  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // I am saving `c` here so the nearby steps can reuse the same value without rebuilding it each time.
    const c =
      // I am keeping this line here because the surrounding health.js workflow expects this value or operation before it continues.
      req?.app?.locals?.redisClient ||
      // I am keeping this line here because the surrounding health.js workflow expects this value or operation before it continues.
      req?.app?.locals?.redis ||
      // I am keeping this line here because the surrounding health.js workflow expects this value or operation before it continues.
      req?.app?.locals?.cache ||
      // I am keeping this line here because the surrounding health.js workflow expects this value or operation before it continues.
      null;

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!c || typeof c.ping !== 'function') {
      out.ok = !!redisStatus.connected; // fall back to snapshot
      // This return sends the completed value or response back to the code that called this function.
      return out;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    // I am saving `t0` here so the nearby steps can reuse the same value without rebuilding it each time.
    const t0 = Date.now();
    // I am saving `pong` here so the nearby steps can reuse the same value without rebuilding it each time.
    const pong = await c.ping();
    // I am keeping this line here because the surrounding health.js workflow expects this value or operation before it continues.
    out.ok = pong === 'PONG';
    // I am keeping this line here because the surrounding health.js workflow expects this value or operation before it continues.
    out.pingMs = Date.now() - t0;
    // This return sends the completed value or response back to the code that called this function.
    return out;
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch {
    // This return sends the completed value or response back to the code that called this function.
    return out;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// Replace your tryDbProbe() with this version
async function tryDbProbe() {
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!supabaseAdmin) return { ok: null, latencyMs: null, note: 'skipped:no_admin' };

  // Use config for DB probe settings
  const table = config.opsHealth.dbProbeTable;
  // I am saving `rpc` here so the nearby steps can reuse the same value without rebuilding it each time.
  const rpc   = config.opsHealth.dbProbeRpc;

  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // I am saving `t0` here so the nearby steps can reuse the same value without rebuilding it each time.
    const t0 = Date.now();
    // I am saving `error` here so the nearby steps can reuse the same value without rebuilding it each time.
    let error = null;

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (rpc) {
      // Simple RPC, e.g. public.app_ops_ping() returns 1
      const { error: e } = await supabaseAdmin.rpc(rpc);
      // I am keeping this line here because the surrounding health.js workflow expects this value or operation before it continues.
      error = e || null;
    // This alternative runs only when the condition above did not use its first path.
    } else {
      // HEAD + COUNT probe; no column names so it won’t 400 on missing columns
      const { error: e } = await supabaseAdmin
        // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
        .from(table)
        // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
        .select('*', { head: true, count: 'exact' })
        // I am continuing the existing call chain here so this option stays attached to the same operation started above.
        .limit(1);
      // I am keeping this line here because the surrounding health.js workflow expects this value or operation before it continues.
      error = e || null;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // I am saving `ms` here so the nearby steps can reuse the same value without rebuilding it each time.
    const ms = Date.now() - t0;
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!error) return { ok: true, latencyMs: ms };

    // Normalize common “harmless” dev cases to neutral (ok:null)
    const msg = String(error.message || '').toLowerCase();
    // I am saving `code` here so the nearby steps can reuse the same value without rebuilding it each time.
    const code = String(error.code || '');

    // I am saving `missingTable` here so the nearby steps can reuse the same value without rebuilding it each time.
    const missingTable =
      // I am calling this helper here so the current workflow performs this step before it moves on.
      msg.includes('does not exist') && (msg.includes('relation') || msg.includes(table));
    // I am saving `missingColumn` here so the nearby steps can reuse the same value without rebuilding it each time.
    const missingColumn =
      // I am keeping this line here because the surrounding health.js workflow expects this value or operation before it continues.
      code === '42703' || (msg.includes('column') && msg.includes('does not exist'));
    // I am saving `forbidden` here so the nearby steps can reuse the same value without rebuilding it each time.
    const forbidden =
      // I am calling this helper here so the current workflow performs this step before it moves on.
      msg.includes('permission denied') || msg.includes('forbidden');

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (missingTable)  return { ok: null, latencyMs: ms, note: `table_missing:${table}` };
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (missingColumn) return { ok: null, latencyMs: ms, note: 'column_missing' };
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (forbidden)     return { ok: false, latencyMs: ms, error: 'forbidden' };

    // This return sends the completed value or response back to the code that called this function.
    return { ok: false, latencyMs: ms, error: 'unknown' };
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch {
    // This return sends the completed value or response back to the code that called this function.
    return { ok: false, latencyMs: null, error: 'unreachable' };
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `basePayload` as a named helper so the surrounding workflow can call this step when it needs it.
function basePayload(req) {
  // This return sends the completed value or response back to the code that called this function.
  return {
    // I am keeping the `ok` field in this object so the receiving code can read that value by its expected name.
    ok: true,
    // I am keeping the `status` field in this object so the receiving code can read that value by its expected name.
    status: 'ok',
    // I am keeping the `version` field in this object so the receiving code can read that value by its expected name.
    version: (config?.app?.version || config?.version || 'dev'),
    // I am keeping the `now` field in this object so the receiving code can read that value by its expected name.
    now: new Date().toISOString(),
    // I am keeping the `uptimeSec` field in this object so the receiving code can read that value by its expected name.
    uptimeSec: Math.round(process.uptime()),
    // I am keeping the `requestId` field in this object so the receiving code can read that value by its expected name.
    requestId: req?.requestId || req?.id || null
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  };
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// ──────────────────────────────────────────────────────────────────────────────
// Liveness — keep legacy paths so Docker healthcheck never 404s
// ─────────────────────────────────────────────────────────────────────────────-
// Base /health endpoint (JSON for tests)
router.get('/', healthShield, (req, res) => {
  // I am building or sending the Express response here with the status, data, or page already chosen by this route.
  res.set('Cache-Control', 'no-store');
  // I am saving `body` here so the nearby steps can reuse the same value without rebuilding it each time.
  const body = basePayload(req);
  // This return sends the completed value or response back to the code that called this function.
  return res.status(200).json(body);
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
});

// I am saving `LIVENESS_PATHS` here so the nearby steps can reuse the same value without rebuilding it each time.
const LIVENESS_PATHS = ['/healthz', '/livez'];
// I am repeating the next block one item at a time so every value in the existing collection receives the same handling.
for (const p of LIVENESS_PATHS) {
  // I am building or sending the Express response here with the status, data, or page already chosen by this route.
  router.get(p, healthShield, (_req, res) => res.status(200).send('OK'));
  // I am building or sending the Express response here with the status, data, or page already chosen by this route.
  router.head(p, healthShield, (_req, res) => res.status(204).end());
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// Liveness JSON endpoint (for tests and monitoring)
router.get('/liveness', healthShield, (req, res) => {
  // I am building or sending the Express response here with the status, data, or page already chosen by this route.
  res.set('Cache-Control', 'no-store');
  // I am saving `body` here so the nearby steps can reuse the same value without rebuilding it each time.
  const body = basePayload(req);
  // I am keeping this line here because the surrounding health.js workflow expects this value or operation before it continues.
  body.status = 'healthy';
  // I am keeping this line here because the surrounding health.js workflow expects this value or operation before it continues.
  body.timestamp = new Date().toISOString();
  // I am keeping this line here because the surrounding health.js workflow expects this value or operation before it continues.
  body.uptime = Math.round(process.uptime());
  // This return sends the completed value or response back to the code that called this function.
  return res.status(200).json(body);
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
});

// ──────────────────────────────────────────────────────────────────────────────
// Readiness — minimal + tiny Redis ping
// ─────────────────────────────────────────────────────────────────────────────-
async function readinessHandler(req, res) {
  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // I am saving `body` here so the nearby steps can reuse the same value without rebuilding it each time.
    const body = basePayload(req);
    // I am saving `redisCheck` here so the nearby steps can reuse the same value without rebuilding it each time.
    const redisCheck = await tryRedisPing(req);

    // I am keeping this line here because the surrounding health.js workflow expects this value or operation before it continues.
    body.readiness = {
      // I am keeping the `redis` field in this object so the receiving code can read that value by its expected name.
      redis: redisCheck,
      // I am keeping the `redisReadyFlag` field in this object so the receiving code can read that value by its expected name.
      redisReadyFlag: !!req.app?.locals?.redisReady,
      // I am keeping the `rateLimitReadyFlag` field in this object so the receiving code can read that value by its expected name.
      rateLimitReadyFlag: !!req.app?.locals?.rateLimitStoreReady
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    };

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!redisCheck.ok) {
      // I am keeping this line here because the surrounding health.js workflow expects this value or operation before it continues.
      body.ok = false;
      // I am keeping this line here because the surrounding health.js workflow expects this value or operation before it continues.
      body.status = 'degraded';
      // This return sends the completed value or response back to the code that called this function.
      return res.status(503).json(body);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    // This return sends the completed value or response back to the code that called this function.
    return res.status(200).json(body);
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (err) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.warn(
      // I am keeping this line here because the surrounding health.js workflow expects this value or operation before it continues.
      { event: 'health.ready.error', message: err?.message },
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      'Readiness probe failed'
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    );
    // This return sends the completed value or response back to the code that called this function.
    return res.status(503).json({ ok: false, status: 'error' });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// Support both new and legacy paths
router.get('/readyz', healthShield, readinessHandler);
// I am building or sending the Express response here with the status, data, or page already chosen by this route.
router.head('/readyz', healthShield, (_req, res) => res.status(204).end());
// Readiness JSON endpoint (simplified for tests - must return status: 'ready')
router.get('/readiness', healthShield, async (req, res) => {
  // I am building or sending the Express response here with the status, data, or page already chosen by this route.
  res.set('Cache-Control', 'no-store');
  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // I am saving `body` here so the nearby steps can reuse the same value without rebuilding it each time.
    const body = basePayload(req);
    // I am keeping this line here because the surrounding health.js workflow expects this value or operation before it continues.
    body.status = 'ready';
    // I am keeping this line here because the surrounding health.js workflow expects this value or operation before it continues.
    body.timestamp = new Date().toISOString();
    // I am saving `redisCheck` here so the nearby steps can reuse the same value without rebuilding it each time.
    const redisCheck = await tryRedisPing(req);
    // I am keeping this line here because the surrounding health.js workflow expects this value or operation before it continues.
    body.readiness = {
      // I am keeping the `redis` field in this object so the receiving code can read that value by its expected name.
      redis: redisCheck,
      // I am keeping the `redisReadyFlag` field in this object so the receiving code can read that value by its expected name.
      redisReadyFlag: !!req.app?.locals?.redisReady,
      // I am keeping the `rateLimitReadyFlag` field in this object so the receiving code can read that value by its expected name.
      rateLimitReadyFlag: !!req.app?.locals?.rateLimitStoreReady
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    };
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!redisCheck.ok) {
      // I am keeping this line here because the surrounding health.js workflow expects this value or operation before it continues.
      body.ok = false;
      // I am keeping this line here because the surrounding health.js workflow expects this value or operation before it continues.
      body.status = 'degraded';
      // This return sends the completed value or response back to the code that called this function.
      return res.status(503).json(body);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    // This return sends the completed value or response back to the code that called this function.
    return res.status(200).json(body);
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (err) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.warn(
      // I am keeping this line here because the surrounding health.js workflow expects this value or operation before it continues.
      { event: 'health.ready.error', message: err?.message },
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      'Readiness probe failed'
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    );
    // This return sends the completed value or response back to the code that called this function.
    return res.status(503).json({ ok: false, status: 'error' });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
});
// I am building or sending the Express response here with the status, data, or page already chosen by this route.
router.head('/readiness', healthShield, (_req, res) => res.status(204).end());

// ──────────────────────────────────────────────────────────────────────────────
// Ops JSON — gated detail for SREs (alias: /ops and /ops/health)
// ─────────────────────────────────────────────────────────────────────────────-
async function handleOpsHealth(req, res) {
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!isOpsAuthorized(req)) {
    // Keep non-authorized silent but JSON; avoids jq parse errors while not leaking internals
    return res.status(404).json({ ok: false, status: 'not_found' });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am saving `start` here so the nearby steps can reuse the same value without rebuilding it each time.
  const start = Date.now();
  // I am saving `body` here so the nearby steps can reuse the same value without rebuilding it each time.
  const body = basePayload(req);
  // I am saving `redisCheck` here so the nearby steps can reuse the same value without rebuilding it each time.
  const [redisCheck, dbCheck] = await Promise.all([tryRedisPing(req), tryDbProbe()]);

  // I am keeping this line here because the surrounding health.js workflow expects this value or operation before it continues.
  body.services = { redis: redisCheck, database: dbCheck };
  // I am keeping this line here because the surrounding health.js workflow expects this value or operation before it continues.
  body.system = {
    // I am keeping the `memory` field in this object so the receiving code can read that value by its expected name.
    memory: process.memoryUsage(),
    // I am keeping the `cpu` field in this object so the receiving code can read that value by its expected name.
    cpu: process.cpuUsage(),
    // I am keeping the `node` field in this object so the receiving code can read that value by its expected name.
    node: process.version,
    // I am keeping the `platform` field in this object so the receiving code can read that value by its expected name.
    platform: process.platform,
    // I am keeping the `arch` field in this object so the receiving code can read that value by its expected name.
    arch: process.arch
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  };
  // I am keeping this line here because the surrounding health.js workflow expects this value or operation before it continues.
  body.request = { method: req.method, path: req.path, id: req.requestId || null };
  // I am keeping this line here because the surrounding health.js workflow expects this value or operation before it continues.
  body.responseTimeMs = Date.now() - start;

  // I am saving `healthy` here so the nearby steps can reuse the same value without rebuilding it each time.
  const healthy = (redisCheck.ok !== false) && (dbCheck.ok !== false);
  // I am keeping this line here because the surrounding health.js workflow expects this value or operation before it continues.
  body.ok = healthy;
  // I am keeping this line here because the surrounding health.js workflow expects this value or operation before it continues.
  body.status = healthy ? 'ok' : 'degraded';

  // I am building or sending the Express response here with the status, data, or page already chosen by this route.
  res.status(healthy ? 200 : 503).json(body);
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// Both paths map to the same handler
router.get('/ops', handleOpsHealth);
// I am defining this small callback here so the surrounding API can run it with the value it supplies.
router.head('/ops', (req, res) => {
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!isOpsAuthorized(req)) return res.status(404).json({ ok: false, status: 'not_found' });
  // I am building or sending the Express response here with the status, data, or page already chosen by this route.
  res.status(204).end();
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
});
// This registers the GET `/ops/health` route so Express can send matching requests through the handlers listed here.
router.get('/ops/health', handleOpsHealth);
// I am defining this small callback here so the surrounding API can run it with the value it supplies.
router.head('/ops/health', (req, res) => {
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!isOpsAuthorized(req)) return res.status(404).json({ ok: false, status: 'not_found' });
  // I am building or sending the Express response here with the status, data, or page already chosen by this route.
  res.status(204).end();
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
});

// Optional legacy “detailed” alias → same payload as ops health (gated)
router.get('/detailed', handleOpsHealth);

// ──────────────────────────────────────────────────────────────────────────────
// Exports (support both import styles)
// ─────────────────────────────────────────────────────────────────────────────-
module.exports = { router, updateRedisStatus };
// I am exporting this value here so another module can deliberately reuse the completed piece from health.js.
module.exports.router = router;
// I am exporting this value here so another module can deliberately reuse the completed piece from health.js.
module.exports.updateRedisStatus = updateRedisStatus;