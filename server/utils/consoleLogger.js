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
  if (!key || !value) return value;

  const lowerKey = String(key).toLowerCase();
  const sensitiveKeys = [
    'authorization',
    'sb-access-token', 'sb_access_token',
    'sb-refresh-token', 'sb_refresh_token',
    'access_token', 'refresh_token',
    'password', 'secret',
    'api_key', 'apikey', 'service_role_key',
    'jwt', 'jwt_secret'
  ];

  if (sensitiveKeys.some(term => lowerKey.includes(term))) {
    return '[REDACTED]';
  }
  return value;
}

/**
 * Safely stringify values for console output
 * @param {any} val - The value to stringify
 * @returns {string} - String representation of the value
 */
function safeStringify(val) {
  if (val === null || val === undefined) return String(val);
  if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') return String(val);
  if (val instanceof Error) return `${val.name}: ${val.message}`;
  try {
    return JSON.stringify(val);
  } catch {
    return '[Unserializable]';
  }
}

// We do not import app config here; this module formats output.
// If you pass us a config/serverInfo object, we’ll use it; otherwise we derive
// safe fallbacks from process.env so we never print undefined.

// ──────────────────────────────────────────────────────────────────────────────
// Shared helpers (kept tiny and explained)
// ──────────────────────────────────────────────────────────────────────────────

/** A single line we reuse to draw nice boxes in the terminal. */
const LINE = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';

/** Map some common HTTP codes to friendly labels. */
const STATUS_LABELS = new Map([
  [200, 'SUCCESS'],
  [201, 'CREATED'],
  [204, 'NO CONTENT'],
  [301, 'MOVED PERMANENTLY'],
  [302, 'FOUND'],
  [304, 'NOT MODIFIED'],
  [307, 'TEMP REDIRECT'],
  [308, 'PERM REDIRECT'],
  [400, 'BAD REQUEST'],
  [401, 'UNAUTHORIZED'],
  [403, 'FORBIDDEN'],
  [404, 'NOT FOUND'],
  [409, 'CONFLICT'],
  [429, 'TOO MANY REQUESTS'],
  [500, 'SERVER ERROR']
]);

/** Turn a status code into a short label. */
function statusLabel(status) {
  if (STATUS_LABELS.has(status)) return STATUS_LABELS.get(status);
  if (status >= 200 && status < 300) return 'SUCCESS';
  if (status >= 300 && status < 400) return 'REDIRECTION';
  if (status >= 400 && status < 500) return 'CLIENT ERROR';
  if (status >= 500) return 'SERVER ERROR';
  return 'UNKNOWN';
}

/** Ensure duration prints like "12ms" (no "msms"). */
function formatDurationMs(val) {
  if (typeof val === 'number' && isFinite(val)) {
    return `${Math.max(0, Math.round(val))}ms`;
  }
  if (typeof val === 'string') {
    return val.replace(/ms(ms)?$/i, 'ms');
  }
  return 'unknown';
}

/** Human timestamp for terminal. */
function formatTimestamp() {
  return new Date().toLocaleString();
}

/** Light email masker so we do not print full PII in logs. */
function maskEmail(s = '') {
  const at = s.indexOf('@');
  if (at <= 1) return '***';
  return s.slice(0, Math.min(2, at)) + '***' + s.slice(at);
}

// ──────────────────────────────────────────────────────────────────────────────
// DB summarization (provider-aware, with safe fallbacks)
// ──────────────────────────────────────────────────────────────────────────────

function int(v, def) {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
}

/**
 * Best-effort provider normalization.
 */
function normalizeProvider(p) {
  const s = (p || process.env.DB_PROVIDER || 'supabase-http').toLowerCase();
  if (s === 'postgres' || s === 'postgresql') return 'postgres';
  return s; // 'supabase-http' or anything else -> we’ll still be safe
}

/**
 * Parse DB host/port/name from env if they’re not provided by caller.
 * - For Supabase HTTP: derive host/port/name from SUPABASE_URL.
 * - For Postgres: use SUPABASE_DB_URL/DATABASE_URL if present; else DB_* trio.
 */
function parseDbFromEnv(provider) {
  provider = normalizeProvider(provider);

  try {
    if (provider === 'supabase-http') {
      const supa = process.env.SUPABASE_URL;
      if (supa) {
        const u = new URL(supa);
        const host = u.host || 'unknown';
        const port = u.port ? int(u.port, 443) : (u.protocol === 'https:' ? 443 : 80);
        const name = (host.split('.')[0] || 'supabase');
        return { host, port, name, provider };
      }
      // No SUPABASE_URL—fall back to "unknown" but keep valid numbers/strings.
      return { host: 'unknown', port: 443, name: 'supabase', provider };
    }

    // postgres
    const url = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
    if (url) {
      const u = new URL(url);
      const host = u.hostname || 'localhost';
      const port = u.port ? int(u.port, 5432) : 5432;
      const name = (u.pathname || '/').replace(/^\//, '') || process.env.DB_NAME || 'postgres';
      return { host, port, name, provider: 'postgres' };
    }
    // discrete vars
    return {
      host: process.env.DB_HOST || 'localhost',
      port: int(process.env.DB_PORT, 5432),
      name: process.env.DB_NAME || 'postgres',
      provider: 'postgres'
    };
  } catch {
    // Never crash log formatting
    if (provider === 'supabase-http') {
      return { host: 'unknown', port: 443, name: 'supabase', provider };
    }
    return { host: 'localhost', port: 5432, name: 'postgres', provider: 'postgres' };
  }
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
  const provider = normalizeProvider(db.provider);
  const envParts = parseDbFromEnv(provider);

  const host = db.host || envParts.host;
  const port = Number.isFinite(db.port) ? db.port : envParts.port;
  const name = db.name || envParts.name;

  const flavor = provider === 'supabase-http' ? 'Supabase (HTTP API)' : 'PostgreSQL';
  return `${host}:${port}/${name} — ${flavor}`;
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
  const status = res.statusCode;
  const method = req.method;
  const url = req.originalUrl || req.url;
  const requestId = req.requestId || 'unknown';

  // Color by status range
  let statusColor = '';
  if (status >= 200 && status < 300) statusColor = '\x1b[32m';      // Green
  else if (status >= 300 && status < 400) statusColor = '\x1b[33m'; // Yellow
  else if (status >= 400 && status < 500) statusColor = '\x1b[31m'; // Red
  else if (status >= 500) statusColor = '\x1b[35m';                 // Magenta
  const resetColor = '\x1b[0m';

  const label = statusLabel(status);
  const dur = formatDurationMs(duration);
  const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';

  console.log(`\n${statusColor}${LINE}${resetColor}`);
  console.log(`${statusColor}REQUEST${resetColor}     ${method} ${url}`);
  console.log(`${statusColor}STATUS${resetColor}      ${statusColor}${status}${resetColor} (${label})`);
  console.log(`${statusColor}DURATION${resetColor}    ${dur}`);
  console.log(`${statusColor}REQUEST ID${resetColor}   ${requestId}`);
  console.log(`${statusColor}CLIENT IP${resetColor}    ${ip}`);
  console.log(`${statusColor}TIMESTAMP${resetColor}    ${formatTimestamp()}`);
  console.log(`${statusColor}${LINE}${resetColor}`);
}

// ──────────────────────────────────────────────────────────────────────────────
// Domain event blocks (Auth, Security, DB, Errors, etc.)
// ──────────────────────────────────────────────────────────────────────────────

function formatAuthEvent(event, meta = {}) {
  const requestId = meta.requestId || 'system';
  const ip = meta.ip || 'unknown';
  const outcome = meta.outcome || 'unknown';
  const user = meta.user ? maskEmail(meta.user) : undefined;

  console.log(`\n${LINE}`);
  console.log(`AUTH EVENT`);
  console.log(`   Event: ${event}`);
  if (user) console.log(`   User: ${user}`);
  console.log(`   Outcome: ${outcome}`);
  console.log(`   Request ID: ${requestId}`);
  console.log(`   Client IP: ${ip}`);
  console.log(`   Time: ${formatTimestamp()}`);
  console.log(`${LINE}`);
}

function formatSecurityEvent(event, meta = {}) {
  const requestId = meta.requestId || 'system';
  const ip = meta.ip || 'unknown';

  console.log(`\n${LINE}`);
  console.log(`SECURITY ALERT`);
  console.log(`   Event: ${event}`);
  console.log(`   Request ID: ${requestId}`);
  console.log(`   Client IP: ${ip}`);
  console.log(`   Time: ${formatTimestamp()}`);
  console.log(`${LINE}`);
}

function formatDatabaseOperation(operation, table, meta = {}) {
  const requestId = meta.requestId || 'system';
  const duration = formatDurationMs(meta.duration);

  console.log(`\n${LINE}`);
  console.log(`DATABASE`);
  console.log(`   Operation: ${operation}`);
  console.log(`   Table: ${table}`);
  console.log(`   Duration: ${duration}`);
  console.log(`   Request ID: ${requestId}`);
  console.log(`   Time: ${formatTimestamp()}`);
  console.log(`${LINE}`);
}

function formatError(message, meta = {}) {
  const requestId = meta.requestId || 'system';
  const err = meta.err || meta.error;

  const toSafeString = (x) => {
    if (x instanceof Error) return `${x.message}\n${x.stack}`;
    if (x && typeof x === 'object') {
      try { return JSON.stringify(x, null, 2); } catch { return String(x); }
    }
    return String(x);
  };

  const msg = toSafeString(message);
  const details = err ? toSafeString(err) : 'No details available';

  console.log(`\n${LINE}`);
  console.log(`ERROR OCCURRED`);
  console.log(`   Message: ${msg}`);
  console.log(`   Details: ${details}`);
  console.log(`   Request ID: ${requestId}`);
  console.log(`   Time: ${formatTimestamp()}`);
  console.log(`${LINE}`);
}

function formatInfo(message, meta = {}) {
  const requestId = meta.requestId || 'system';

  console.log(`\n${LINE}`);
  console.log(`INFO`);
  console.log(`   Message: ${message}`);
  console.log(`   Request ID: ${requestId}`);
  console.log(`   Time: ${formatTimestamp()}`);
  console.log(`${LINE}`);
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
  const dbSummary = serverInfo.databaseSummary || summarizeDb(serverInfo.database || {});

  const rate = serverInfo.rateLimit || 'handled at Cloudflare edge';
  const textLimits = serverInfo.textLimits || 'unknown';
  const maxSubs = (typeof serverInfo.maxSubmissions !== 'undefined')
    ? serverInfo.maxSubmissions
    : 'unknown';

  console.log(`\n${process.env.APP_NAME || 'APPLICATION'} SERVER STARTING`);
  console.log(`${LINE}`);
  console.log(`Server: ${serverInfo.host}:${serverInfo.port}`);
  console.log(`Environment: ${serverInfo.nodeEnv}`);
  console.log(`Database: ${dbSummary}`);
  console.log(`Auth: Stateless (Supabase RS256 + JWKS)`);
  console.log(`Rate Limiting: ${rate}`);
  console.log(`Text Limits: ${textLimits}`);
  console.log(`Max Submissions: ${maxSubs}`);
  console.log(`${LINE}`);
  console.log(`Server startup completed successfully`);
  console.log(`Started at: ${formatTimestamp()}`);
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
  const dbSummary = summarizeDb(config.database || {});
  const minLen = config?.limits?.textMinLength ?? 'unknown';
  const maxLen = config?.limits?.textMaxLength ?? 'unknown';
  const maxSubs = config?.limits?.maxSubmissions ?? 'unknown';

  const rl = config?.rateLimit || {};
  const label = (k) => ({
    'cloudflare-edge': 'Cloudflare edge',
    cloudflare: 'Cloudflare edge',
    redis: 'Redis origin limiters',
    'redis-origin': 'Redis origin limiters'
  }[k] || k || 'Cloudflare edge');

  const primary = label(rl.primary);
  const secondary = label(rl.secondary) || 'Redis origin limiters';

  console.log(`\nCONFIGURATION LOADED`);
  console.log(`   Server: ${config?.server?.host}:${config?.server?.port} (${config?.server?.nodeEnv})`);
  console.log(`   Database: ${dbSummary}`);
  console.log(`   Auth: Stateless (Supabase RS256 + JWKS)`);
  console.log(`   Rate Limiting: ${primary} (PRIMARY) + ${secondary} (SECONDARY)`);
  console.log(`   Text Limits: ${minLen}-${maxLen} chars`);
  console.log(`   Max Submissions: ${maxSubs}`);
}

// ──────────────────────────────────────────────────────────────────────────────
// Other operational blocks
// ──────────────────────────────────────────────────────────────────────────────

function formatMiddlewareRegistration(middleware) {
  console.log(`${middleware} registered`);
}

function formatGracefulShutdown(signal) {
  console.log(`\nGRACEFUL SHUTDOWN INITIATED`);
  console.log(`   Signal: ${signal}`);
  console.log(`   Time: ${formatTimestamp()}`);
  console.log(`   Shutting down gracefully...`);
}

function formatCookieParsing(meta = {}) {
  const count = meta.count || 0;

  console.log(`\n${LINE}`);
  console.log(`COOKIE PARSING`);
  console.log(`   Message: Cookies parsed and attached to request`);
  console.log(`   Count: ${count}`);
  console.log(`   Time: ${formatTimestamp()}`);
  console.log(`${LINE}`);
}

function formatCSRFToken(action, meta = {}) {
  const requestId = meta.requestId || 'system';

  console.log(`\n${LINE}`);
  console.log(`CSRF TOKEN`);
  console.log(`   Action: ${action}`);
  console.log(`   Request ID: ${requestId}`);
  console.log(`   Time: ${formatTimestamp()}`);
  console.log(`${LINE}`);
}

function formatSecurityClearance(event, meta = {}) {
  const userMasked = meta.user ? maskEmail(meta.user) : 'unknown';
  const ip = meta.ip || 'unknown';

  console.log(`\n${LINE}`);
  console.log(`SECURITY CLEARANCE`);
  console.log(`   Event: ${event}`);
  console.log(`   User: ${userMasked}`);
  console.log(`   IP: ${ip}`);
  console.log(`   Time: ${formatTimestamp()}`);
  console.log(`${LINE}`);
}

function formatSessionEvent(action, meta = {}) {
  const requestId = meta.requestId || 'system';

  console.log(`\n${LINE}`);
  console.log(`SESSION EVENT`);
  console.log(`   Action: ${action}`);
  console.log(`   Request ID: ${requestId}`);
  console.log(`   Time: ${formatTimestamp()}`);
  console.log(`${LINE}`);
}

function formatWarning(message, meta = {}) {
  const requestId = meta.requestId || 'system';

  console.log(`\n${LINE}`);
  console.log(`WARNING`);
  console.log(`   Message: ${message}`);
  console.log(`   Request ID: ${requestId}`);
  console.log(`   Time: ${formatTimestamp()}`);
  console.log(`${LINE}`);
}

// ──────────────────────────────────────────────────────────────────────────────
// Pretty-print structured JSON events like {"event":"auth.set_cookie.ok",...}
// ──────────────────────────────────────────────────────────────────────────────

function formatIsoTimestamp(isoLike) {
  try {
    if (!isoLike) return formatTimestamp();
    const d = new Date(isoLike);
    if (Number.isNaN(d.getTime())) return formatTimestamp();
    return d.toLocaleString();
  } catch {
    return formatTimestamp();
  }
}

function formatTtlMs(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n)) return String(ms);

  let rest = Math.max(0, Math.floor(n));
  const dayMs = 24 * 60 * 60 * 1000;
  const hourMs = 60 * 60 * 1000;
  const minMs = 60 * 1000;
  const secMs = 1000;

  const days = Math.floor(rest / dayMs); rest -= days * dayMs;
  const hours = Math.floor(rest / hourMs); rest -= hours * hourMs;
  const minutes = Math.floor(rest / minMs); rest -= minutes * minMs;
  const seconds = Math.floor(rest / secMs);

  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours || days) parts.push(`${hours}h`);
  if (minutes || hours || days) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);

  return `${parts.join(' ')} (${n} ms)`;
}

/**
 * Pretty block for auth cookie events (set/clear/etc).
 * Keeps the same visual style as COOKIE PARSING.
 *
 * @param {Object} payload - structured event
 *   { ts, event, request_id, ip, path, method, user_id, ttl_ms }
 */
function formatAuthCookieEvent(payload = {}) {
  const {
    ts,
    event = 'auth.event',
    request_id = 'system',
    ip = 'unknown',
    path = 'unknown',
    method = 'unknown',
    user_id = 'unknown',
    ttl_ms
  } = payload;

  console.log(`\n${LINE}`);
  console.log(`AUTH COOKIE`);
  console.log(`   Event: ${event}`);
  console.log(`   Path: ${method} ${path}`);
  console.log(`   User ID: ${user_id}`);
  if (typeof ttl_ms !== 'undefined') {
    console.log(`   TTL: ${formatTtlMs(ttl_ms)}`);
  }
  console.log(`   Request ID: ${request_id ?? 'system'}`);
  console.log(`   Client IP: ${ip}`);
  console.log(`   Time: ${formatIsoTimestamp(ts)}`);
  console.log(`${LINE}`);
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
  const {
    ts,
    msg = 'profile.update',
    userId = 'unknown',
    fields = {},
    operation = '',
    status = '',
    level = 'info'
  } = payload;

  // Orange color for warmth and positivity (ANSI escape code)
  const ORANGE = '\x1b[38;5;214m';
  const RESET = '\x1b[0m';

  console.log(`\n${ORANGE}${LINE}${RESET}`);
  console.log(`${ORANGE}PROFILE UPDATE${RESET}`);
  console.log(`${ORANGE}Event:${RESET}      ${msg}`);
  console.log(`${ORANGE}User ID:${RESET}    ${userId}`);
  
  if (fields && typeof fields === 'object') {
    const fieldList = Array.isArray(fields) ? fields : Object.keys(fields);
    if (fieldList.length > 0) {
      console.log(`${ORANGE}Fields:${RESET}     ${fieldList.join(', ')}`);
    }
  }
  
  if (status) {
    console.log(`${ORANGE}Status:${RESET}     ${status}`);
  }
  
  if (operation) {
    console.log(`${ORANGE}Operation:${RESET}  ${operation}`);
  }
  
  console.log(`${ORANGE}Level:${RESET}      ${level}`);
  console.log(`${ORANGE}Time:${RESET}       ${formatIsoTimestamp(ts)}`);
  console.log(`${ORANGE}${LINE}${RESET}`);
}

/** Generic pretty printer for future JSON events. */
function formatJsonEvent(payload = {}) {
  const { event = '', msg = '' } = payload;
  
  // Auth cookie events
  if (event.startsWith('auth.set_cookie') || event.startsWith('auth.clear_cookie')) {
    return formatAuthCookieEvent(payload);
  }
  
  // Profile update events
  if (msg && (msg.startsWith('profile.update.') || msg === 'profile.update')) {
    return formatProfileUpdateEvent(payload);
  }

  // Generic fallback
  console.log(`\n${LINE}`);
  console.log(`EVENT`);
  console.log(`   Type: ${payload.event || payload.msg || 'unknown'}`);
  Object.entries(payload).forEach(([k, v]) => {
    if (k === 'event' || k === 'msg') return;
    console.log(`   ${k}: ${safeStringify(v)}`);
  });
  console.log(`   Time: ${formatIsoTimestamp(payload.ts)}`);
  console.log(`${LINE}`);
}

/**
 * Install console shim that pretty-prints JSON event lines
 */
function installJsonLogShim(options = {}) {
  const { interceptInfo = true } = options;

  if (console.__jsonPrettyShimInstalled) return;
  console.__jsonPrettyShimInstalled = true;

  const originalLog = console.log.bind(console);
  const originalInfo = console.info ? console.info.bind(console) : originalLog;

  let inPretty = false;

  function tryPrettyPrint(args, fallback) {
    if (inPretty) return fallback(...args);

    try {
      if (args.length === 1 && args[0] && typeof args[0] === 'object' && !Array.isArray(args[0])) {
        const obj = args[0];
        if (obj.event) {
          inPretty = true;
          formatJsonEvent(obj);
          inPretty = false;
          return;
        }
      }

      if (args.length === 1 && typeof args[0] === 'string') {
        const s = args[0].trim();
        if (s.startsWith('{') && s.endsWith('}')) {
          try {
            const obj = JSON.parse(s);
            if (obj && typeof obj === 'object' && obj.event) {
              inPretty = true;
              formatJsonEvent(obj);
              inPretty = false;
              return;
            }
          } catch {
            // Not JSON, fall through
          }
        }
      }
    } catch {
      // Swallow errors and fall back
    }
    return fallback(...args);
  }

  console.log = (...args) => tryPrettyPrint(args, originalLog);
  if (interceptInfo) {
    console.info = (...args) => tryPrettyPrint(args, originalInfo);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Exports
// ──────────────────────────────────────────────────────────────────────────────

module.exports = {
  // Request
  formatRequest,

  // Domain/event blocks
  formatAuthEvent,
  formatSecurityEvent,
  formatDatabaseOperation,
  formatError,
  formatInfo,
  formatWarning,

  // Startup/config summaries
  formatServerStartup,
  formatConfigSummary,

  // Ops lifecycle
  formatMiddlewareRegistration,
  formatGracefulShutdown,

  // Cookie/CSRF/session/security extras
  sanitizeSensitiveValue,
  safeStringify,
  formatCookieParsing,
  formatCSRFToken,
  formatSecurityClearance,
  formatSessionEvent,

  // Structured JSON events
  formatAuthCookieEvent,
  formatProfileUpdateEvent,
  formatJsonEvent,
  installJsonLogShim,

  // Useful helper (optional import by callers)
  summarizeDb,
};