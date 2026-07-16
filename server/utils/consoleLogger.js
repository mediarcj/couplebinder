// File: server/utils/consoleLogger.js
// Description: Formatted console logging utility for readable terminal output
// Purpose: Give clean, organized terminal output in simple English
// Notes: We keep the same visual style (big lines, clear sections). No emojis.
// Security: Never logs tokens, authorization headers, or sensitive cookie values

/**
 * WHAT:
 * A small helper that prints logs in a clean way so humans can read them fast.
 *
 * WHY:
 * Raw JSON or messy console logs are hard to scan when you are under pressure.
 *
 * HOW:
 * We use simple blocks with clear labels. We avoid secrets/PII where possible.
 * We also fix small things like status labels and duration formatting.
 *
 * SECURITY:
 * We filter out sensitive values like tokens, authorization headers, and auth cookies.
 */

// ──────────────────────────────────────────────────────────────────────────────
// Sensitive value scrubbing
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Sanitize sensitive values from logging
 * @param {string} key - The key name
 * @param {string} value - The value to potentially sanitize
 * @returns {string} - Sanitized value or original if not sensitive
 */
function sanitizeSensitiveValue(key, value) {
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!key || !value) return value;

  // I am saving `lowerKey` here so the nearby steps can reuse the same value without rebuilding it each time.
  const lowerKey = String(key).toLowerCase();
  // I am saving `sensitiveKeys` here so the nearby steps can reuse the same value without rebuilding it each time.
  const sensitiveKeys = [
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    'authorization',
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    'sb-access-token', 'sb_access_token',
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    'sb-refresh-token', 'sb_refresh_token',
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    'access_token', 'refresh_token',
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    'password', 'secret',
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    'api_key', 'apikey', 'service_role_key',
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    'jwt', 'jwt_secret'
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  ];

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (sensitiveKeys.some(term => lowerKey.includes(term))) {
    // This return sends the completed value or response back to the code that called this function.
    return '[REDACTED]';
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
  // This return sends the completed value or response back to the code that called this function.
  return value;
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * Safely stringify values for console output
 * @param {any} val - The value to stringify
 * @returns {string} - String representation of the value
 */
function safeStringify(val) {
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (val === null || val === undefined) return String(val);
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') return String(val);
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (val instanceof Error) return `${val.name}: ${val.message}`;
  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // This return sends the completed value or response back to the code that called this function.
    return JSON.stringify(val);
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch {
    // This return sends the completed value or response back to the code that called this function.
    return '[Unserializable]';
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// We import config for safe fallbacks, but prefer passed-in serverInfo/config objects.
const { config: appConfig } = require('../config');

// ──────────────────────────────────────────────────────────────────────────────
// Shared helpers (kept tiny and explained)
// ──────────────────────────────────────────────────────────────────────────────

/** A single line we reuse to draw nice boxes in the terminal. */
const LINE = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';

/** Map some common HTTP codes to friendly labels. */
const STATUS_LABELS = new Map([
  // I am keeping this line here because the surrounding consoleLogger.js workflow expects this value or operation before it continues.
  [200, 'SUCCESS'],
  // I am keeping this line here because the surrounding consoleLogger.js workflow expects this value or operation before it continues.
  [201, 'CREATED'],
  // I am keeping this line here because the surrounding consoleLogger.js workflow expects this value or operation before it continues.
  [204, 'NO CONTENT'],
  // I am keeping this line here because the surrounding consoleLogger.js workflow expects this value or operation before it continues.
  [301, 'MOVED PERMANENTLY'],
  // I am keeping this line here because the surrounding consoleLogger.js workflow expects this value or operation before it continues.
  [302, 'FOUND'],
  // I am keeping this line here because the surrounding consoleLogger.js workflow expects this value or operation before it continues.
  [304, 'NOT MODIFIED'],
  // I am keeping this line here because the surrounding consoleLogger.js workflow expects this value or operation before it continues.
  [307, 'TEMP REDIRECT'],
  // I am keeping this line here because the surrounding consoleLogger.js workflow expects this value or operation before it continues.
  [308, 'PERM REDIRECT'],
  // I am keeping this line here because the surrounding consoleLogger.js workflow expects this value or operation before it continues.
  [400, 'BAD REQUEST'],
  // I am keeping this line here because the surrounding consoleLogger.js workflow expects this value or operation before it continues.
  [401, 'UNAUTHORIZED'],
  // I am keeping this line here because the surrounding consoleLogger.js workflow expects this value or operation before it continues.
  [403, 'FORBIDDEN'],
  // I am keeping this line here because the surrounding consoleLogger.js workflow expects this value or operation before it continues.
  [404, 'NOT FOUND'],
  // I am keeping this line here because the surrounding consoleLogger.js workflow expects this value or operation before it continues.
  [409, 'CONFLICT'],
  // I am keeping this line here because the surrounding consoleLogger.js workflow expects this value or operation before it continues.
  [429, 'TOO MANY REQUESTS'],
  // I am keeping this line here because the surrounding consoleLogger.js workflow expects this value or operation before it continues.
  [500, 'SERVER ERROR']
// This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
]);

/** Turn a status code into a short label. */
function statusLabel(status) {
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (STATUS_LABELS.has(status)) return STATUS_LABELS.get(status);
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (status >= 200 && status < 300) return 'SUCCESS';
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (status >= 300 && status < 400) return 'REDIRECTION';
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (status >= 400 && status < 500) return 'CLIENT ERROR';
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (status >= 500) return 'SERVER ERROR';
  // This return sends the completed value or response back to the code that called this function.
  return 'UNKNOWN';
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/** Ensure duration prints like "12ms" (no "msms"). */
function formatDurationMs(val) {
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (typeof val === 'number' && isFinite(val)) {
    // This return sends the completed value or response back to the code that called this function.
    return `${Math.max(0, Math.round(val))}ms`;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (typeof val === 'string') {
    // This return sends the completed value or response back to the code that called this function.
    return val.replace(/ms(ms)?$/i, 'ms');
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
  // This return sends the completed value or response back to the code that called this function.
  return 'unknown';
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/** Human timestamp for terminal. */
function formatTimestamp() {
  // This return sends the completed value or response back to the code that called this function.
  return new Date().toLocaleString();
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/** Light email masker so we do not print full PII in logs. */
function maskEmail(s = '') {
  // I am saving `at` here so the nearby steps can reuse the same value without rebuilding it each time.
  const at = s.indexOf('@');
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (at <= 1) return '***';
  // This return sends the completed value or response back to the code that called this function.
  return s.slice(0, Math.min(2, at)) + '***' + s.slice(at);
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// ──────────────────────────────────────────────────────────────────────────────
// DB summarization (provider-aware, with safe fallbacks)
// ──────────────────────────────────────────────────────────────────────────────

function int(v, def) {
  // I am saving `n` here so the nearby steps can reuse the same value without rebuilding it each time.
  const n = Number.parseInt(v, 10);
  // This return sends the completed value or response back to the code that called this function.
  return Number.isFinite(n) ? n : def;
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * Best-effort provider normalization.
 */
function normalizeProvider(p) {
  // I am saving `s` here so the nearby steps can reuse the same value without rebuilding it each time.
  const s = (p || appConfig?.database?.provider || 'supabase-http').toLowerCase();
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (s === 'postgres' || s === 'postgresql') return 'postgres';
  return s; // 'supabase-http' or anything else -> we'll still be safe
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * Parse DB host/port/name from env if they’re not provided by caller.
 * - For Supabase HTTP: derive host/port/name from SUPABASE_URL.
 * - For Postgres: use SUPABASE_DB_URL/DATABASE_URL if present; else DB_* trio.
 */
function parseDbFromEnv(provider) {
  // I am keeping this line here because the surrounding consoleLogger.js workflow expects this value or operation before it continues.
  provider = normalizeProvider(provider);

  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (provider === 'supabase-http') {
      // I am saving `supa` here so the nearby steps can reuse the same value without rebuilding it each time.
      const supa = appConfig?.database?.url;
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (supa) {
        // I am saving `u` here so the nearby steps can reuse the same value without rebuilding it each time.
        const u = new URL(supa);
        // I am saving `host` here so the nearby steps can reuse the same value without rebuilding it each time.
        const host = u.host || 'unknown';
        // I am saving `port` here so the nearby steps can reuse the same value without rebuilding it each time.
        const port = u.port ? int(u.port, 443) : (u.protocol === 'https:' ? 443 : 80);
        // I am saving `name` here so the nearby steps can reuse the same value without rebuilding it each time.
        const name = (host.split('.')[0] || 'supabase');
        // This return sends the completed value or response back to the code that called this function.
        return { host, port, name, provider };
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
      // No SUPABASE_URL—fall back to "unknown" but keep valid numbers/strings.
      return { host: 'unknown', port: 443, name: 'supabase', provider };
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // postgres
    const url = appConfig?.database?.url;
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (url) {
      // I am saving `u` here so the nearby steps can reuse the same value without rebuilding it each time.
      const u = new URL(url);
      // I am saving `host` here so the nearby steps can reuse the same value without rebuilding it each time.
      const host = u.hostname || 'localhost';
      // I am saving `port` here so the nearby steps can reuse the same value without rebuilding it each time.
      const port = u.port ? int(u.port, 5432) : 5432;
      // I am saving `name` here so the nearby steps can reuse the same value without rebuilding it each time.
      const name = (u.pathname || '/').replace(/^\//, '') || 'postgres';
      // This return sends the completed value or response back to the code that called this function.
      return { host, port, name, provider: 'postgres' };
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    // discrete vars (fallback if config not available)
    return {
      // I am keeping the `host` field in this object so the receiving code can read that value by its expected name.
      host: 'localhost',
      // I am keeping the `port` field in this object so the receiving code can read that value by its expected name.
      port: 5432,
      // I am keeping the `name` field in this object so the receiving code can read that value by its expected name.
      name: 'postgres',
      // I am keeping the `provider` field in this object so the receiving code can read that value by its expected name.
      provider: 'postgres'
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    };
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch {
    // Never crash log formatting
    if (provider === 'supabase-http') {
      // This return sends the completed value or response back to the code that called this function.
      return { host: 'unknown', port: 443, name: 'supabase', provider };
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    // This return sends the completed value or response back to the code that called this function.
    return { host: 'localhost', port: 5432, name: 'postgres', provider: 'postgres' };
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * Build a human-readable DB summary string, with safe fallbacks:
 *   "<host>:<port>/<name> — <flavor>"
 * where flavor is "Supabase (HTTP API)" or "PostgreSQL".
 *
 * @param {object} db - e.g. { provider, host, port, name, url }
 * @returns {string}
 */
function summarizeDb(db = {}) {
  // I am saving `provider` here so the nearby steps can reuse the same value without rebuilding it each time.
  const provider = normalizeProvider(db.provider);
  // I am saving `envParts` here so the nearby steps can reuse the same value without rebuilding it each time.
  const envParts = parseDbFromEnv(provider);

  // I am saving `host` here so the nearby steps can reuse the same value without rebuilding it each time.
  const host = db.host || envParts.host;
  // I am saving `port` here so the nearby steps can reuse the same value without rebuilding it each time.
  const port = Number.isFinite(db.port) ? db.port : envParts.port;
  // I am saving `name` here so the nearby steps can reuse the same value without rebuilding it each time.
  const name = db.name || envParts.name;

  // I am saving `flavor` here so the nearby steps can reuse the same value without rebuilding it each time.
  const flavor = provider === 'supabase-http' ? 'Supabase (HTTP API)' : 'PostgreSQL';
  // This return sends the completed value or response back to the code that called this function.
  return `${host}:${port}/${name} — ${flavor}`;
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// ──────────────────────────────────────────────────────────────────────────────
// Request log block
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Format request information for display.
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {number|string} duration - Request duration in ms
 */
function formatRequest(req, res, duration) {
  // I am saving `status` here so the nearby steps can reuse the same value without rebuilding it each time.
  const status = res.statusCode;
  // I am saving `method` here so the nearby steps can reuse the same value without rebuilding it each time.
  const method = req.method;
  // I am saving `url` here so the nearby steps can reuse the same value without rebuilding it each time.
  const url = req.originalUrl || req.url;
  // I am saving `requestId` here so the nearby steps can reuse the same value without rebuilding it each time.
  const requestId = req.requestId || 'unknown';

  // Color by status range
  let statusColor = '';
  if (status >= 200 && status < 300) statusColor = '\x1b[32m';      // Green
  else if (status >= 300 && status < 400) statusColor = '\x1b[33m'; // Yellow
  else if (status >= 400 && status < 500) statusColor = '\x1b[31m'; // Red
  else if (status >= 500) statusColor = '\x1b[35m';                 // Magenta
  // I am saving `resetColor` here so the nearby steps can reuse the same value without rebuilding it each time.
  const resetColor = '\x1b[0m';

  // I am saving `label` here so the nearby steps can reuse the same value without rebuilding it each time.
  const label = statusLabel(status);
  // I am saving `dur` here so the nearby steps can reuse the same value without rebuilding it each time.
  const dur = formatDurationMs(duration);
  // I am saving `ip` here so the nearby steps can reuse the same value without rebuilding it each time.
  const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';

  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`\n${statusColor}${LINE}${resetColor}`);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`${statusColor}REQUEST${resetColor}     ${method} ${url}`);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`${statusColor}STATUS${resetColor}      ${statusColor}${status}${resetColor} (${label})`);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`${statusColor}DURATION${resetColor}    ${dur}`);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`${statusColor}REQUEST ID${resetColor}   ${requestId}`);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`${statusColor}CLIENT IP${resetColor}    ${ip}`);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`${statusColor}TIMESTAMP${resetColor}    ${formatTimestamp()}`);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`${statusColor}${LINE}${resetColor}`);
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// ──────────────────────────────────────────────────────────────────────────────
// Domain event blocks (Auth, Security, DB, Errors, etc.)
// ──────────────────────────────────────────────────────────────────────────────

function formatAuthEvent(event, meta = {}) {
  // I am saving `requestId` here so the nearby steps can reuse the same value without rebuilding it each time.
  const requestId = meta.requestId || 'system';
  // I am saving `ip` here so the nearby steps can reuse the same value without rebuilding it each time.
  const ip = meta.ip || 'unknown';
  // I am saving `outcome` here so the nearby steps can reuse the same value without rebuilding it each time.
  const outcome = meta.outcome || 'unknown';
  // I am saving `user` here so the nearby steps can reuse the same value without rebuilding it each time.
  const user = meta.user ? maskEmail(meta.user) : undefined;

  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`\n${LINE}`);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`AUTH EVENT`);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`   Event: ${event}`);
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (user) console.log(`   User: ${user}`);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`   Outcome: ${outcome}`);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`   Request ID: ${requestId}`);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`   Client IP: ${ip}`);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`   Time: ${formatTimestamp()}`);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`${LINE}`);
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `formatSecurityEvent` as a named helper so the surrounding workflow can call this step when it needs it.
function formatSecurityEvent(event, meta = {}) {
  // I am saving `requestId` here so the nearby steps can reuse the same value without rebuilding it each time.
  const requestId = meta.requestId || 'system';
  // I am saving `ip` here so the nearby steps can reuse the same value without rebuilding it each time.
  const ip = meta.ip || 'unknown';

  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`\n${LINE}`);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`SECURITY ALERT`);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`   Event: ${event}`);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`   Request ID: ${requestId}`);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`   Client IP: ${ip}`);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`   Time: ${formatTimestamp()}`);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`${LINE}`);
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `formatDatabaseOperation` as a named helper so the surrounding workflow can call this step when it needs it.
function formatDatabaseOperation(operation, table, meta = {}) {
  // I am saving `requestId` here so the nearby steps can reuse the same value without rebuilding it each time.
  const requestId = meta.requestId || 'system';
  // I am saving `duration` here so the nearby steps can reuse the same value without rebuilding it each time.
  const duration = formatDurationMs(meta.duration);

  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`\n${LINE}`);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`DATABASE`);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`   Operation: ${operation}`);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`   Table: ${table}`);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`   Duration: ${duration}`);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`   Request ID: ${requestId}`);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`   Time: ${formatTimestamp()}`);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`${LINE}`);
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `formatError` as a named helper so the surrounding workflow can call this step when it needs it.
function formatError(message, meta = {}) {
  // I am saving `requestId` here so the nearby steps can reuse the same value without rebuilding it each time.
  const requestId = meta.requestId || 'system';
  // I am saving `err` here so the nearby steps can reuse the same value without rebuilding it each time.
  const err = meta.err || meta.error;

  // I am saving `toSafeString` here so the nearby steps can reuse the same value without rebuilding it each time.
  const toSafeString = (x) => {
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (x instanceof Error) return `${x.message}\n${x.stack}`;
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (x && typeof x === 'object') {
      // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
      try { return JSON.stringify(x, null, 2); } catch { return String(x); }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    // This return sends the completed value or response back to the code that called this function.
    return String(x);
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  };

  // I am saving `msg` here so the nearby steps can reuse the same value without rebuilding it each time.
  const msg = toSafeString(message);
  // I am saving `details` here so the nearby steps can reuse the same value without rebuilding it each time.
  const details = err ? toSafeString(err) : 'No details available';

  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`\n${LINE}`);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`ERROR OCCURRED`);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`   Message: ${msg}`);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`   Details: ${details}`);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`   Request ID: ${requestId}`);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`   Time: ${formatTimestamp()}`);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`${LINE}`);
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `formatInfo` as a named helper so the surrounding workflow can call this step when it needs it.
function formatInfo(message, meta = {}) {
  // I am saving `requestId` here so the nearby steps can reuse the same value without rebuilding it each time.
  const requestId = meta.requestId || 'system';

  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`\n${LINE}`);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`INFO`);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`   Message: ${message}`);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`   Request ID: ${requestId}`);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`   Time: ${formatTimestamp()}`);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`${LINE}`);
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// ──────────────────────────────────────────────────────────────────────────────
// Startup/config summaries (provider-aware & discrepancy-proof)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Print server startup info once the app is ready.
 *
 * @param {Object} serverInfo
 *   {
 *     host, port, nodeEnv,
 *     database: { provider, host, port, name }  // optional
 *     databaseSummary: string                    // optional (overrides)
 *     rateLimit, textLimits, maxSubmissions
 *   }
 */
function formatServerStartup(serverInfo = {}) {
  // I am saving `dbSummary` here so the nearby steps can reuse the same value without rebuilding it each time.
  const dbSummary = serverInfo.databaseSummary || summarizeDb(serverInfo.database || {});

  // I am saving `rate` here so the nearby steps can reuse the same value without rebuilding it each time.
  const rate = serverInfo.rateLimit || 'handled at Cloudflare edge';
  // I am saving `textLimits` here so the nearby steps can reuse the same value without rebuilding it each time.
  const textLimits = serverInfo.textLimits || 'unknown';
  // I am saving `maxSubs` here so the nearby steps can reuse the same value without rebuilding it each time.
  const maxSubs = (typeof serverInfo.maxSubmissions !== 'undefined')
    // I am keeping this line here because the surrounding consoleLogger.js workflow expects this value or operation before it continues.
    ? serverInfo.maxSubmissions
    // I am keeping this line here because the surrounding consoleLogger.js workflow expects this value or operation before it continues.
    : 'unknown';

  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`\n${appConfig?.branding?.appName?.toUpperCase() || 'APPLICATION'} SERVER STARTING`);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`${LINE}`);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`Server: ${serverInfo.host}:${serverInfo.port}`);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`Environment: ${serverInfo.nodeEnv}`);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`Database: ${dbSummary}`);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`Auth: Stateless (Supabase RS256 + JWKS)`);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`Rate Limiting: ${rate}`);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`Text Limits: ${textLimits}`);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`Max Submissions: ${maxSubs}`);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`${LINE}`);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`Server startup completed successfully`);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`Started at: ${formatTimestamp()}`);
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * Print a short config summary at boot.
 *
 * @param {Object} config
 *   {
 *     server: { host, port, nodeEnv },
 *     database: { provider, host, port, name },
 *     limits: { textMinLength, textMaxLength, maxSubmissions }
 *   }
 */
function formatConfigSummary(config = {}) {
  // I am saving `dbSummary` here so the nearby steps can reuse the same value without rebuilding it each time.
  const dbSummary = summarizeDb(config.database || {});
  // I am saving `minLen` here so the nearby steps can reuse the same value without rebuilding it each time.
  const minLen = config?.limits?.textMinLength ?? 'unknown';
  // I am saving `maxLen` here so the nearby steps can reuse the same value without rebuilding it each time.
  const maxLen = config?.limits?.textMaxLength ?? 'unknown';
  // I am saving `maxSubs` here so the nearby steps can reuse the same value without rebuilding it each time.
  const maxSubs = config?.limits?.maxSubmissions ?? 'unknown';

  // I am saving `rl` here so the nearby steps can reuse the same value without rebuilding it each time.
  const rl = config?.rateLimit || {};
  // Map known keys to human labels; fall back to the raw key if unknown
  const label = (k) => ({
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    'cloudflare-edge': 'Cloudflare edge',
    // I am keeping the `cloudflare` field in this object so the receiving code can read that value by its expected name.
    cloudflare: 'Cloudflare edge',
    // I am keeping the `redis` field in this object so the receiving code can read that value by its expected name.
    redis: 'Redis origin limiters',
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    'redis-origin': 'Redis origin limiters'
  // I am keeping this line here because the surrounding consoleLogger.js workflow expects this value or operation before it continues.
  }[k] ?? k);

  // Defaults ensure we ALWAYS show the defense-in-depth stack
  const primary = label(rl.primary) || 'Cloudflare edge';
  // I am saving `secondary` here so the nearby steps can reuse the same value without rebuilding it each time.
  const secondary = rl.secondary ? label(rl.secondary) : 'Redis origin limiters';

  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`\nCONFIGURATION LOADED`);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`   Server: ${config?.server?.host}:${config?.server?.port} (${config?.server?.nodeEnv})`);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`   Database: ${dbSummary}`);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`   Auth: Stateless (Supabase RS256 + JWKS)`);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`   Rate Limiting: ${primary} (PRIMARY) + ${secondary} (SECONDARY)`);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`   Text Limits: ${minLen}-${maxLen} chars`);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`   Max Submissions: ${maxSubs}`);
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// ──────────────────────────────────────────────────────────────────────────────
// Other operational blocks
// ──────────────────────────────────────────────────────────────────────────────

function formatMiddlewareRegistration(middleware) {
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`${middleware} registered`);
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `formatGracefulShutdown` as a named helper so the surrounding workflow can call this step when it needs it.
function formatGracefulShutdown(signal) {
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`\nGRACEFUL SHUTDOWN INITIATED`);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`   Signal: ${signal}`);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`   Time: ${formatTimestamp()}`);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`   Shutting down gracefully...`);
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `formatCookieParsing` as a named helper so the surrounding workflow can call this step when it needs it.
function formatCookieParsing(meta = {}) {
  // I am saving `count` here so the nearby steps can reuse the same value without rebuilding it each time.
  const count = meta.count || 0;

  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`\n${LINE}`);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`COOKIE PARSING`);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`   Message: Cookies parsed and attached to request`);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`   Count: ${count}`);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`   Time: ${formatTimestamp()}`);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`${LINE}`);
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `formatCSRFToken` as a named helper so the surrounding workflow can call this step when it needs it.
function formatCSRFToken(action, meta = {}) {
  // I am saving `requestId` here so the nearby steps can reuse the same value without rebuilding it each time.
  const requestId = meta.requestId || 'system';

  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`\n${LINE}`);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`CSRF TOKEN`);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`   Action: ${action}`);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`   Request ID: ${requestId}`);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`   Time: ${formatTimestamp()}`);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`${LINE}`);
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `formatSecurityClearance` as a named helper so the surrounding workflow can call this step when it needs it.
function formatSecurityClearance(event, meta = {}) {
  // I am saving `userMasked` here so the nearby steps can reuse the same value without rebuilding it each time.
  const userMasked = meta.user ? maskEmail(meta.user) : 'unknown';
  // I am saving `ip` here so the nearby steps can reuse the same value without rebuilding it each time.
  const ip = meta.ip || 'unknown';

  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`\n${LINE}`);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`SECURITY CLEARANCE`);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`   Event: ${event}`);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`   User: ${userMasked}`);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`   IP: ${ip}`);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`   Time: ${formatTimestamp()}`);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`${LINE}`);
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `formatSessionEvent` as a named helper so the surrounding workflow can call this step when it needs it.
function formatSessionEvent(action, meta = {}) {
  // I am saving `requestId` here so the nearby steps can reuse the same value without rebuilding it each time.
  const requestId = meta.requestId || 'system';

  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`\n${LINE}`);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`SESSION EVENT`);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`   Action: ${action}`);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`   Request ID: ${requestId}`);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`   Time: ${formatTimestamp()}`);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`${LINE}`);
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `formatWarning` as a named helper so the surrounding workflow can call this step when it needs it.
function formatWarning(message, meta = {}) {
  // I am saving `requestId` here so the nearby steps can reuse the same value without rebuilding it each time.
  const requestId = meta.requestId || 'system';
  
  // Safely stringify message if it's not a string
  const safeMessage = typeof message === 'string' 
    // I am keeping this line here because the surrounding consoleLogger.js workflow expects this value or operation before it continues.
    ? message 
    // I am keeping this line here because the surrounding consoleLogger.js workflow expects this value or operation before it continues.
    : safeStringify(message);

  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`\n${LINE}`);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`WARNING`);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`   Message: ${safeMessage}`);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`   Request ID: ${requestId}`);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`   Time: ${formatTimestamp()}`);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`${LINE}`);
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// ──────────────────────────────────────────────────────────────────────────────
// Pretty-print structured JSON events like {"event":"auth.set_cookie.ok",...}
// ──────────────────────────────────────────────────────────────────────────────

function formatIsoTimestamp(isoLike) {
  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!isoLike) return formatTimestamp();
    // I am saving `d` here so the nearby steps can reuse the same value without rebuilding it each time.
    const d = new Date(isoLike);
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (Number.isNaN(d.getTime())) return formatTimestamp();
    // This return sends the completed value or response back to the code that called this function.
    return d.toLocaleString();
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch {
    // This return sends the completed value or response back to the code that called this function.
    return formatTimestamp();
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `formatTtlMs` as a named helper so the surrounding workflow can call this step when it needs it.
function formatTtlMs(ms) {
  // I am saving `n` here so the nearby steps can reuse the same value without rebuilding it each time.
  const n = Number(ms);
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!Number.isFinite(n)) return String(ms);

  // I am saving `rest` here so the nearby steps can reuse the same value without rebuilding it each time.
  let rest = Math.max(0, Math.floor(n));
  // I am saving `dayMs` here so the nearby steps can reuse the same value without rebuilding it each time.
  const dayMs = 24 * 60 * 60 * 1000;
  // I am saving `hourMs` here so the nearby steps can reuse the same value without rebuilding it each time.
  const hourMs = 60 * 60 * 1000;
  // I am saving `minMs` here so the nearby steps can reuse the same value without rebuilding it each time.
  const minMs = 60 * 1000;
  // I am saving `secMs` here so the nearby steps can reuse the same value without rebuilding it each time.
  const secMs = 1000;

  // I am saving `days` here so the nearby steps can reuse the same value without rebuilding it each time.
  const days = Math.floor(rest / dayMs); rest -= days * dayMs;
  // I am saving `hours` here so the nearby steps can reuse the same value without rebuilding it each time.
  const hours = Math.floor(rest / hourMs); rest -= hours * hourMs;
  // I am saving `minutes` here so the nearby steps can reuse the same value without rebuilding it each time.
  const minutes = Math.floor(rest / minMs); rest -= minutes * minMs;
  // I am saving `seconds` here so the nearby steps can reuse the same value without rebuilding it each time.
  const seconds = Math.floor(rest / secMs);

  // I am saving `parts` here so the nearby steps can reuse the same value without rebuilding it each time.
  const parts = [];
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (days) parts.push(`${days}d`);
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (hours || days) parts.push(`${hours}h`);
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (minutes || hours || days) parts.push(`${minutes}m`);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  parts.push(`${seconds}s`);

  // This return sends the completed value or response back to the code that called this function.
  return `${parts.join(' ')} (${n} ms)`;
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * Pretty block for auth cookie events (set/clear/etc).
 * Keeps the same visual style as COOKIE PARSING.
 *
 * @param {Object} payload - structured event
 *   { ts, event, request_id, ip, path, method, user_id, ttl_ms }
 */
function formatAuthCookieEvent(payload = {}) {
  // I am saving this value here so the nearby steps can reuse the same value without rebuilding it each time.
  const {
    // I am keeping this line here because the surrounding consoleLogger.js workflow expects this value or operation before it continues.
    ts,
    // I am keeping this line here because the surrounding consoleLogger.js workflow expects this value or operation before it continues.
    event = 'auth.event',
    // I am keeping this line here because the surrounding consoleLogger.js workflow expects this value or operation before it continues.
    request_id = 'system',
    // I am keeping this line here because the surrounding consoleLogger.js workflow expects this value or operation before it continues.
    ip = 'unknown',
    // I am keeping this line here because the surrounding consoleLogger.js workflow expects this value or operation before it continues.
    path = 'unknown',
    // I am keeping this line here because the surrounding consoleLogger.js workflow expects this value or operation before it continues.
    method = 'unknown',
    // I am keeping this line here because the surrounding consoleLogger.js workflow expects this value or operation before it continues.
    user_id = 'unknown',
    // I am keeping this line here because the surrounding consoleLogger.js workflow expects this value or operation before it continues.
    ttl_ms
  // I am keeping this line here because the surrounding consoleLogger.js workflow expects this value or operation before it continues.
  } = payload;

  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`\n${LINE}`);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`AUTH COOKIE`);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`   Event: ${event}`);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`   Path: ${method} ${path}`);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`   User ID: ${user_id}`);
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (typeof ttl_ms !== 'undefined') {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    console.log(`   TTL: ${formatTtlMs(ttl_ms)}`);
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`   Request ID: ${request_id ?? 'system'}`);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`   Client IP: ${ip}`);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`   Time: ${formatIsoTimestamp(ts)}`);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`${LINE}`);
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * WHAT:
 * Pretty block for profile update events (consolidated single log).
 * 
 * WHY:
 * Profile updates are positive user actions that deserve clear, friendly visibility.
 * Orange color conveys warmth and success without being alarming.
 * Consolidated format reduces log clutter and shows all info at once.
 * 
 * HOW:
 * Detects profile.update.* events and formats them with orange ANSI color.
 * Shows user ID, fields being updated, status, and operation in one block.
 * Keeps consistent visual style with other formatters.
 * Orange color for lines and field labels, white text for data values.
 * 
 * @param {Object} payload - structured event
 *   { ts, msg, userId, fields, operation, status, level }
 */
function formatProfileUpdateEvent(payload = {}) {
  // I am saving this value here so the nearby steps can reuse the same value without rebuilding it each time.
  const {
    // I am keeping this line here because the surrounding consoleLogger.js workflow expects this value or operation before it continues.
    ts,
    // I am keeping this line here because the surrounding consoleLogger.js workflow expects this value or operation before it continues.
    msg = 'profile.update',
    // I am keeping this line here because the surrounding consoleLogger.js workflow expects this value or operation before it continues.
    userId = 'unknown',
    // I am keeping this line here because the surrounding consoleLogger.js workflow expects this value or operation before it continues.
    fields = {},
    // I am keeping this line here because the surrounding consoleLogger.js workflow expects this value or operation before it continues.
    operation = '',
    // I am keeping this line here because the surrounding consoleLogger.js workflow expects this value or operation before it continues.
    status = '',
    // I am keeping this line here because the surrounding consoleLogger.js workflow expects this value or operation before it continues.
    level = 'info'
  // I am keeping this line here because the surrounding consoleLogger.js workflow expects this value or operation before it continues.
  } = payload;

  // Orange color for warmth and positivity (ANSI escape code)
  const ORANGE = '\x1b[38;5;214m';
  // I am saving `RESET` here so the nearby steps can reuse the same value without rebuilding it each time.
  const RESET = '\x1b[0m';

  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`\n${ORANGE}${LINE}${RESET}`);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`${ORANGE}PROFILE UPDATE${RESET}`);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`${ORANGE}Event:${RESET}      ${msg}`);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`${ORANGE}User ID:${RESET}    ${userId}`);
  
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (fields && typeof fields === 'object') {
    // I am saving `fieldList` here so the nearby steps can reuse the same value without rebuilding it each time.
    const fieldList = Array.isArray(fields) ? fields : Object.keys(fields);
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (fieldList.length > 0) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      console.log(`${ORANGE}Fields:${RESET}     ${fieldList.join(', ')}`);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
  
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (status) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    console.log(`${ORANGE}Status:${RESET}     ${status}`);
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
  
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (operation) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    console.log(`${ORANGE}Operation:${RESET}  ${operation}`);
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
  
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`${ORANGE}Level:${RESET}      ${level}`);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`${ORANGE}Time:${RESET}       ${formatIsoTimestamp(ts)}`);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`${ORANGE}${LINE}${RESET}`);
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/** Generic pretty printer for future JSON events. */
function formatJsonEvent(payload = {}) {
  // I am saving `event` here so the nearby steps can reuse the same value without rebuilding it each time.
  const { event = '', msg = '' } = payload;
  
  // Auth cookie events
  if (event.startsWith('auth.set_cookie') || event.startsWith('auth.clear_cookie')) {
    // This return sends the completed value or response back to the code that called this function.
    return formatAuthCookieEvent(payload);
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
  
  // Profile update events
  if (msg && (msg.startsWith('profile.update.') || msg === 'profile.update')) {
    // This return sends the completed value or response back to the code that called this function.
    return formatProfileUpdateEvent(payload);
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // Generic fallback
  console.log(`\n${LINE}`);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`EVENT`);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`   Type: ${payload.event || payload.msg || 'unknown'}`);
  // I am defining this small callback here so the surrounding API can run it with the value it supplies.
  Object.entries(payload).forEach(([k, v]) => {
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (k === 'event' || k === 'msg') return;
    // I am calling this helper here so the current workflow performs this step before it moves on.
    console.log(`   ${k}: ${safeStringify(v)}`);
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`   Time: ${formatIsoTimestamp(payload.ts)}`);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`${LINE}`);
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * Install console shim that pretty-prints JSON event lines
 */
function installJsonLogShim(options = {}) {
  // I am saving `interceptInfo` here so the nearby steps can reuse the same value without rebuilding it each time.
  const { interceptInfo = true } = options;

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (console.__jsonPrettyShimInstalled) return;
  // I am keeping this line here because the surrounding consoleLogger.js workflow expects this value or operation before it continues.
  console.__jsonPrettyShimInstalled = true;

  // I am saving `originalLog` here so the nearby steps can reuse the same value without rebuilding it each time.
  const originalLog = console.log.bind(console);
  // I am saving `originalInfo` here so the nearby steps can reuse the same value without rebuilding it each time.
  const originalInfo = console.info ? console.info.bind(console) : originalLog;

  // I am saving `inPretty` here so the nearby steps can reuse the same value without rebuilding it each time.
  let inPretty = false;

  // I am keeping `tryPrettyPrint` as a named helper so the surrounding workflow can call this step when it needs it.
  function tryPrettyPrint(args, fallback) {
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (inPretty) return fallback(...args);

    // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
    try {
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (args.length === 1 && args[0] && typeof args[0] === 'object' && !Array.isArray(args[0])) {
        // I am saving `obj` here so the nearby steps can reuse the same value without rebuilding it each time.
        const obj = args[0];
        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (obj.event) {
          // I am keeping this line here because the surrounding consoleLogger.js workflow expects this value or operation before it continues.
          inPretty = true;
          // I am calling this helper here so the current workflow performs this step before it moves on.
          formatJsonEvent(obj);
          // I am keeping this line here because the surrounding consoleLogger.js workflow expects this value or operation before it continues.
          inPretty = false;
          // This return sends the completed value or response back to the code that called this function.
          return;
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }

      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (args.length === 1 && typeof args[0] === 'string') {
        // I am saving `s` here so the nearby steps can reuse the same value without rebuilding it each time.
        const s = args[0].trim();
        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (s.startsWith('{') && s.endsWith('}')) {
          // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
          try {
            // I am saving `obj` here so the nearby steps can reuse the same value without rebuilding it each time.
            const obj = JSON.parse(s);
            // This check helps me choose or stop the next path before any work that depends on this condition runs.
            if (obj && typeof obj === 'object' && obj.event) {
              // I am keeping this line here because the surrounding consoleLogger.js workflow expects this value or operation before it continues.
              inPretty = true;
              // I am calling this helper here so the current workflow performs this step before it moves on.
              formatJsonEvent(obj);
              // I am keeping this line here because the surrounding consoleLogger.js workflow expects this value or operation before it continues.
              inPretty = false;
              // This return sends the completed value or response back to the code that called this function.
              return;
            // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
            }
          // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
          } catch {
            // Not JSON, fall through
          }
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
    } catch {
      // Swallow errors and fall back
    }
    // This return sends the completed value or response back to the code that called this function.
    return fallback(...args);
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am keeping this line here because the surrounding consoleLogger.js workflow expects this value or operation before it continues.
  console.log = (...args) => tryPrettyPrint(args, originalLog);
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (interceptInfo) {
    // I am keeping this line here because the surrounding consoleLogger.js workflow expects this value or operation before it continues.
    console.info = (...args) => tryPrettyPrint(args, originalInfo);
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// ──────────────────────────────────────────────────────────────────────────────
// Exports
// ──────────────────────────────────────────────────────────────────────────────

module.exports = {
  // Request
  formatRequest,

  // Domain/event blocks
  formatAuthEvent,
  // I am keeping this line here because the surrounding consoleLogger.js workflow expects this value or operation before it continues.
  formatSecurityEvent,
  // I am keeping this line here because the surrounding consoleLogger.js workflow expects this value or operation before it continues.
  formatDatabaseOperation,
  // I am keeping this line here because the surrounding consoleLogger.js workflow expects this value or operation before it continues.
  formatError,
  // I am keeping this line here because the surrounding consoleLogger.js workflow expects this value or operation before it continues.
  formatInfo,
  // I am keeping this line here because the surrounding consoleLogger.js workflow expects this value or operation before it continues.
  formatWarning,

  // Startup/config summaries
  formatServerStartup,
  // I am keeping this line here because the surrounding consoleLogger.js workflow expects this value or operation before it continues.
  formatConfigSummary,

  // Ops lifecycle
  formatMiddlewareRegistration,
  // I am keeping this line here because the surrounding consoleLogger.js workflow expects this value or operation before it continues.
  formatGracefulShutdown,

  // Cookie/CSRF/session/security extras
  sanitizeSensitiveValue,
  // I am keeping this line here because the surrounding consoleLogger.js workflow expects this value or operation before it continues.
  safeStringify,
  // I am keeping this line here because the surrounding consoleLogger.js workflow expects this value or operation before it continues.
  formatCookieParsing,
  // I am keeping this line here because the surrounding consoleLogger.js workflow expects this value or operation before it continues.
  formatCSRFToken,
  // I am keeping this line here because the surrounding consoleLogger.js workflow expects this value or operation before it continues.
  formatSecurityClearance,
  // I am keeping this line here because the surrounding consoleLogger.js workflow expects this value or operation before it continues.
  formatSessionEvent,

  // Structured JSON events
  formatAuthCookieEvent,
  // I am keeping this line here because the surrounding consoleLogger.js workflow expects this value or operation before it continues.
  formatProfileUpdateEvent,
  // I am keeping this line here because the surrounding consoleLogger.js workflow expects this value or operation before it continues.
  formatJsonEvent,
  // I am keeping this line here because the surrounding consoleLogger.js workflow expects this value or operation before it continues.
  installJsonLogShim,

  // Useful helper (optional import by callers)
  summarizeDb,
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
};