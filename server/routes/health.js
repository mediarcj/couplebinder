// Description: Health, liveness, readiness, and ops endpoints
// Purpose: Fast probes for LB/monitors + gated ops JSON
// Notes: Uses only config; no invented env names. Keeps legacy paths for Docker.

// WHAT / WHY / HOW
/**
 *  - Liveness  : "/", "/healthz", "/livez", "/liveness"   (token/IP/public via healthShield)
 *  - Readiness : "/readyz", "/readiness"                  (token/IP/public via healthShield)
 *  - Ops JSON  : "/ops" and "/ops/health" (GET/HEAD)      (token/IP/public via config)
 *
 *  - Liveness answers “Is the process up?” with near-zero work.
 *  - Readiness answers “Can it serve?” with a tiny Redis ping + flags.
 *  - Ops is deeper SRE info, gated to avoid leaking internals.
 *
 *  - Gate cheap endpoints with your existing healthShield.
 *  - For Ops: allow if config.health.public === true, or
 *    header "X-Ops-Health-Token" === config.ops.token (also accepts "X-Ops-Token"),
 *    or IP in config.health.allowlist.
 *  - No hard dependency on a Redis client; we use req.app.locals if present.
 */

const express = require('express');
const router = express.Router();

const { config } = require('../config');
const logger = require('../utils/logger');
const healthShield = require('../middleware/healthShield');

// Optional Supabase admin client; skip DB probe if unavailable.
let supabaseAdmin = null;
try {
  ({ supabaseAdmin } = require('../utils/supabaseClient'));
} catch {
  supabaseAdmin = null;
}

// Redis status snapshot (updated by zorvalon.js)
let redisStatus = { connected: false, lastCheck: null };

/**
 *  Update Redis connectivity snapshot for health views.
 *
 *  Health endpoints should reflect current Redis status without tight coupling.
 *
 *  Called by server init/redis handlers:
 *    const { updateRedisStatus } = require('./routes/health');
 *    updateRedisStatus(true/false);
 */
function updateRedisStatus(connected, lastCheck = null) {
  redisStatus = {
    connected: !!connected,
    lastCheck: lastCheck || new Date().toISOString()
  };
}

/**
 * Auth helper for Ops JSON
 * - public: config.health.public === true
 * - header: X-Ops-Health-Token (preferred) or X-Ops-Token matches configured token
 * - ip:     req.clientIp/req.ip is in config.health.allowlist[]
 */
function isOpsAuthorized(req) {
  if (config?.health?.public === true) return true;

  const want =
    (config?.ops?.token || config?.health?.token || '').trim();
  const got =
    String(req.get('X-Ops-Health-Token') || req.get('X-Ops-Token') || '').trim();
  if (want && got && want === got) return true;

  const ip = (req.clientIp || req.ip || '').toString();
  const allow = new Set((config?.health?.allowlist || []).map(String));
  return ip && allow.has(ip);
}

// Small helpers
async function tryRedisPing(req) {
  const out = { ok: false, pingMs: null, snapshot: redisStatus };
  try {
    const c =
      req?.app?.locals?.redisClient ||
      req?.app?.locals?.redis ||
      req?.app?.locals?.cache ||
      null;

    if (!c || typeof c.ping !== 'function') {
      out.ok = !!redisStatus.connected; // fall back to snapshot
      return out;
    }
    const t0 = Date.now();
    const pong = await c.ping();
    out.ok = pong === 'PONG';
    out.pingMs = Date.now() - t0;
    return out;
  } catch {
    return out;
  }
}

// Replace your tryDbProbe() with this version
async function tryDbProbe() {
  if (!supabaseAdmin) return { ok: null, latencyMs: null, note: 'skipped:no_admin' };

  // Use config for DB probe settings
  const table = config.opsHealth.dbProbeTable;
  const rpc   = config.opsHealth.dbProbeRpc;

  try {
    const t0 = Date.now();
    let error = null;

    if (rpc) {
      // Simple RPC, e.g. public.app_ops_ping() returns 1
      const { error: e } = await supabaseAdmin.rpc(rpc);
      error = e || null;
    } else {
      // HEAD + COUNT probe; no column names so it won’t 400 on missing columns
      const { error: e } = await supabaseAdmin
        .from(table)
        .select('*', { head: true, count: 'exact' })
        .limit(1);
      error = e || null;
    }

    const ms = Date.now() - t0;
    if (!error) return { ok: true, latencyMs: ms };

    // Normalize common “harmless” dev cases to neutral (ok:null)
    const msg = String(error.message || '').toLowerCase();
    const code = String(error.code || '');

    const missingTable =
      msg.includes('does not exist') && (msg.includes('relation') || msg.includes(table));
    const missingColumn =
      code === '42703' || (msg.includes('column') && msg.includes('does not exist'));
    const forbidden =
      msg.includes('permission denied') || msg.includes('forbidden');

    if (missingTable)  return { ok: null, latencyMs: ms, note: `table_missing:${table}` };
    if (missingColumn) return { ok: null, latencyMs: ms, note: 'column_missing' };
    if (forbidden)     return { ok: false, latencyMs: ms, error: 'forbidden' };

    return { ok: false, latencyMs: ms, error: 'unknown' };
  } catch {
    return { ok: false, latencyMs: null, error: 'unreachable' };
  }
}

function basePayload(req) {
  return {
    ok: true,
    status: 'ok',
    version: (config?.app?.version || config?.version || 'dev'),
    now: new Date().toISOString(),
    uptimeSec: Math.round(process.uptime()),
    requestId: req?.requestId || req?.id || null
  };
}

// Liveness — keep legacy paths so Docker healthcheck never 404s
// Base /health endpoint (JSON for tests)
router.get('/', healthShield, (req, res) => {
  res.set('Cache-Control', 'no-store');
  const body = basePayload(req);
  return res.status(200).json(body);
});

const LIVENESS_PATHS = ['/healthz', '/livez'];
for (const p of LIVENESS_PATHS) {
  router.get(p, healthShield, (_req, res) => res.status(200).send('OK'));
  router.head(p, healthShield, (_req, res) => res.status(204).end());
}

// Liveness JSON endpoint (for tests and monitoring)
router.get('/liveness', healthShield, (req, res) => {
  res.set('Cache-Control', 'no-store');
  const body = basePayload(req);
  body.status = 'healthy';
  body.timestamp = new Date().toISOString();
  body.uptime = Math.round(process.uptime());
  return res.status(200).json(body);
});

// Readiness — minimal + tiny Redis ping
async function readinessHandler(req, res) {
  try {
    const body = basePayload(req);
    const redisCheck = await tryRedisPing(req);

    body.readiness = {
      redis: redisCheck,
      redisReadyFlag: !!req.app?.locals?.redisReady,
      rateLimitReadyFlag: !!req.app?.locals?.rateLimitStoreReady
    };

    if (!redisCheck.ok) {
      body.ok = false;
      body.status = 'degraded';
      return res.status(503).json(body);
    }
    return res.status(200).json(body);
  } catch (err) {
    logger.warn(
      { event: 'health.ready.error', message: err?.message },
      'Readiness probe failed'
    );
    return res.status(503).json({ ok: false, status: 'error' });
  }
}

// Support both new and legacy paths
router.get('/readyz', healthShield, readinessHandler);
router.head('/readyz', healthShield, (_req, res) => res.status(204).end());
// Readiness JSON endpoint (simplified for tests - must return status: 'ready')
router.get('/readiness', healthShield, async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    const body = basePayload(req);
    body.status = 'ready';
    body.timestamp = new Date().toISOString();
    const redisCheck = await tryRedisPing(req);
    body.readiness = {
      redis: redisCheck,
      redisReadyFlag: !!req.app?.locals?.redisReady,
      rateLimitReadyFlag: !!req.app?.locals?.rateLimitStoreReady
    };
    if (!redisCheck.ok) {
      body.ok = false;
      body.status = 'degraded';
      return res.status(503).json(body);
    }
    return res.status(200).json(body);
  } catch (err) {
    logger.warn(
      { event: 'health.ready.error', message: err?.message },
      'Readiness probe failed'
    );
    return res.status(503).json({ ok: false, status: 'error' });
  }
});
router.head('/readiness', healthShield, (_req, res) => res.status(204).end());

// Ops JSON — gated detail for SREs (alias: /ops and /ops/health)
async function handleOpsHealth(req, res) {
  if (!isOpsAuthorized(req)) {
    // Keep non-authorized silent but JSON; avoids jq parse errors while not leaking internals
    return res.status(404).json({ ok: false, status: 'not_found' });
  }

  const start = Date.now();
  const body = basePayload(req);
  const [redisCheck, dbCheck] = await Promise.all([tryRedisPing(req), tryDbProbe()]);

  body.services = { redis: redisCheck, database: dbCheck };
  body.system = {
    memory: process.memoryUsage(),
    cpu: process.cpuUsage(),
    node: process.version,
    platform: process.platform,
    arch: process.arch
  };
  body.request = { method: req.method, path: req.path, id: req.requestId || null };
  body.responseTimeMs = Date.now() - start;

  const healthy = (redisCheck.ok !== false) && (dbCheck.ok !== false);
  body.ok = healthy;
  body.status = healthy ? 'ok' : 'degraded';

  res.status(healthy ? 200 : 503).json(body);
}

// Both paths map to the same handler
router.get('/ops', handleOpsHealth);
router.head('/ops', (req, res) => {
  if (!isOpsAuthorized(req)) return res.status(404).json({ ok: false, status: 'not_found' });
  res.status(204).end();
});
router.get('/ops/health', handleOpsHealth);
router.head('/ops/health', (req, res) => {
  if (!isOpsAuthorized(req)) return res.status(404).json({ ok: false, status: 'not_found' });
  res.status(204).end();
});

// Optional legacy “detailed” alias → same payload as ops health (gated)
router.get('/detailed', handleOpsHealth);

// Exports (support both import styles)
module.exports = { router, updateRedisStatus };
module.exports.router = router;
module.exports.updateRedisStatus = updateRedisStatus;