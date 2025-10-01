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

/**
 * Sanitize sensitive values from logging
 * @param {string} key - The key name
 * @param {string} value - The value to potentially sanitize
 * @returns {string} - Sanitized value or original if not sensitive
 */
function sanitizeSensitiveValue(key, value) {
  if (!key || !value) return value;
  
  const lowerKey = key.toLowerCase();
  const sensitiveKeys = [
    'authorization',
    'sb-access-token',
    'sb_access_token',
    'access_token',
    'refresh_token',
    'password',
    'secret',
    'api_key',
    'apikey'
  ];
  
  // Check if key contains any sensitive term
  if (sensitiveKeys.some(term => lowerKey.includes(term))) {
    return '[REDACTED]';
  }
  
  return value;
}

// We do not import config here. This file only formats output.
// If you ever need config values inside logs, you can import when needed.
// const { config } = require('../config');

// ───────────────────────────────────────────────────────────────────────────────
// Shared helpers (kept tiny and explained)
// ───────────────────────────────────────────────────────────────────────────────

/**
 * A single line we reuse to draw nice boxes in the terminal.
 */
const LINE = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';

/**
 * Map some common HTTP codes to friendly labels.
 * NOTE: 304 is "NOT MODIFIED", not a redirect. We fix that here.
 */
const STATUS_LABELS = new Map([
  [200, 'SUCCESS'],
  [201, 'CREATED'],
  [204, 'NO CONTENT'],
  [301, 'MOVED PERMANENTLY'],
  [302, 'FOUND'],
  [304, 'NOT MODIFIED'],        // correct label for 304
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

/**
 * Turn a status code into a short label.
 * If we do not have an exact match, fall back to a range-based label.
 */
function statusLabel(status) {
  if (STATUS_LABELS.has(status)) return STATUS_LABELS.get(status);
  if (status >= 200 && status < 300) return 'SUCCESS';
  if (status >= 300 && status < 400) return 'REDIRECTION';
  if (status >= 400 && status < 500) return 'CLIENT ERROR';
  if (status >= 500) return 'SERVER ERROR';
  return 'UNKNOWN';
}

/**
 * Make sure duration always prints once like "12ms" (no "msms").
 * - If a number comes in, clamp to a non-negative integer and add "ms".
 * - If a string comes in, remove any double "ms".
 */
function formatDurationMs(val) {
  if (typeof val === 'number' && isFinite(val)) {
    return `${Math.max(0, Math.round(val))}ms`;
  }
  if (typeof val === 'string') {
    return val.replace(/ms(ms)?$/i, 'ms');
  }
  return 'unknown';
}

/**
 * A simple human timestamp for the terminal.
 */
function formatTimestamp() {
  return new Date().toLocaleString();
}

/**
 * Light email masker so we don’t print full PII in logs.
 * Example: "admin@detechify.com" -> "ad***@detechify.com"
 */
function maskEmail(s = '') {
  const at = s.indexOf('@');
  if (at <= 1) return '***';
  return s.slice(0, Math.min(2, at)) + '***' + s.slice(at);
}

// ───────────────────────────────────────────────────────────────────────────────
// Request log block
// ───────────────────────────────────────────────────────────────────────────────

/**
 * Format request information for display.
 *
 * WHAT:
 * Shows method, path, status, duration, request id, client IP, and timestamp.
 *
 * WHY:
 * This is the basic "who hit what" line you look at first.
 *
 * HOW:
 * We color by status range, add a correct label, and make the duration clean.
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {number|string} duration - Request duration in ms
 */
function formatRequest(req, res, duration) {
  const status = res.statusCode;
  const method = req.method;
  const url = req.originalUrl || req.url;
  const requestId = req.requestId || 'unknown';

  // Color coding by status range
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

// ───────────────────────────────────────────────────────────────────────────────
// Domain event blocks (Auth, Security, DB, Errors, etc.)
// ───────────────────────────────────────────────────────────────────────────────

/**
 * Print an auth event.
 *
 * WHAT:
 * Login, logout, token refresh, etc.
 *
 * WHY:
 * Auth flows are sensitive. We want a clean, short record.
 *
 * HOW:
 * We show event name, optional masked user, outcome, request id, ip, time.
 *
 * @param {string} event - Event type
 * @param {Object} meta - { requestId, ip, outcome, user }
 */
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

/**
 * Print a security event.
 *
 * WHAT:
 * Things like blocked actions, policy checks, clearance events, etc.
 *
 * WHY:
 * Security events deserve their own box so they do not get lost.
 *
 * HOW:
 * Keep it short. Do not leak secrets or internal keys here.
 *
 * @param {string} event - Security event type
 * @param {Object} meta - { requestId, ip }
 */
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

/**
 * Print a database operation summary.
 *
 * WHAT:
 * Show which table and which type of query ran, with duration.
 *
 * WHY:
 * Useful to spot slow spots and to trace high-level DB activity.
 *
 * HOW:
 * We do not print SQL or secrets. Just operation, table, time, request id.
 *
 * @param {string} operation - SELECT/INSERT/UPDATE/DELETE
 * @param {string} table - Table name
 * @param {Object} meta - { requestId, duration }
 */
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

/**
 * Print an error block.
 *
 * WHAT:
 * A short error summary you can read quickly.
 *
 * WHY:
 * When things go wrong, you want the message and a little context.
 *
 * HOW:
 * Avoid dumping giant stacks by default. Keep it short unless debugging.
 *
 * @param {string} message - Error message
 * @param {Object} meta - { requestId, error }
 */
function formatError(message, meta = {}) {
  const requestId = meta.requestId || 'system';
  const error = meta.error || 'No details available';

  console.log(`\n${LINE}`);
  console.log(`ERROR OCCURRED`);
  console.log(`   Message: ${message}`);
  console.log(`   Details: ${error}`);
  console.log(`   Request ID: ${requestId}`);
  console.log(`   Time: ${formatTimestamp()}`);
  console.log(`${LINE}`);
}

/**
 * Print a plain info block.
 *
 * @param {string} message - Info message
 * @param {Object} meta - { requestId }
 */
function formatInfo(message, meta = {}) {
  const requestId = meta.requestId || 'system';

  console.log(`\n${LINE}`);
  console.log(`INFO`);
  console.log(`   Message: ${message}`);
  console.log(`   Request ID: ${requestId}`);
  console.log(`   Time: ${formatTimestamp()}`);
  console.log(`${LINE}`);
}

/**
 * Print server startup info once the app is ready.
 *
 * @param {Object} serverInfo - {
 *   host, port, nodeEnv, database, rateLimit, textLimits, maxSubmissions
 * }
 */
function formatServerStartup(serverInfo) {
  console.log(`\nDETECHIFY SERVER STARTING`);
  console.log(`${LINE}`);
  console.log(`Server: ${serverInfo.host}:${serverInfo.port}`);
  console.log(`Environment: ${serverInfo.nodeEnv}`);
  console.log(`Database: Supabase PostgreSQL`);
  console.log(`Auth: Stateless (Supabase RS256 + JWKS)`);
  console.log(`Rate Limiting: ${serverInfo.rateLimit}`);
  console.log(`Text Limits: ${serverInfo.textLimits}`);
  console.log(`Max Submissions: ${serverInfo.maxSubmissions}`);
  console.log(`${LINE}`);
  console.log(`Server startup completed successfully`);
  console.log(`Started at: ${formatTimestamp()}`);
}

/**
 * Print a short config summary at boot.
 *
 * @param {Object} config - full app config object
 */
function formatConfigSummary(config) {
  console.log(`\nCONFIGURATION LOADED`);
  console.log(`   Server: ${config.server.host}:${config.server.port} (${config.server.nodeEnv})`);
  console.log(`   Database: ${config.database.host}:${config.database.port}/${config.database.name}`);
  console.log(`   Auth: Stateless (Supabase)`);
  console.log(`   Rate Limiting: ${config.rateLimit ? 'enabled' : 'disabled'}`);
  console.log(`   Text Limits: ${config.limits.textMinLength}-${config.limits.textMaxLength} chars`);
  console.log(`   Max Submissions: ${config.limits.maxSubmissions}`);
}

/**
 * Print a one-line note when we register a middleware.
 *
 * @param {string} middleware - name of the middleware
 */
function formatMiddlewareRegistration(middleware) {
  console.log(`${middleware} registered`);
}

/**
 * Print a small block when we start a graceful shutdown.
 *
 * @param {string} signal - the signal received (e.g., SIGTERM)
 */
function formatGracefulShutdown(signal) {
  console.log(`\nGRACEFUL SHUTDOWN INITIATED`);
  console.log(`   Signal: ${signal}`);
  console.log(`   Time: ${formatTimestamp()}`);
  console.log(`   Shutting down gracefully...`);
}

/**
 * Print cookie parsing info.
 *
 * WHAT:
 * Just the count. No cookie values, no secrets.
 *
 * @param {Object} meta - { count }
 */
function formatCookieParsing(meta = {}) {
  const count = meta.count || 0;

  console.log(`\n${LINE}`);
  console.log(`COOKIE PARSING`);
  console.log(`   Message: Cookies parsed and attached to request`);
  console.log(`   Count: ${count}`);
  console.log(`   Time: ${formatTimestamp()}`);
  console.log(`${LINE}`);
}

/**
 * Print CSRF token events.
 *
 * WHAT:
 * When a token is generated or validated.
 *
 * @param {string} action - "generated" | "validated"
 * @param {Object} meta - { requestId }
 */
function formatCSRFToken(action, meta = {}) {
  const requestId = meta.requestId || 'system';

  console.log(`\n${LINE}`);
  console.log(`CSRF TOKEN`);
  console.log(`   Action: ${action}`);
  console.log(`   Request ID: ${requestId}`);
  console.log(`   Time: ${formatTimestamp()}`);
  console.log(`${LINE}`);
}

/**
 * Print security clearance events.
 *
 * WHAT:
 * Admin things like "cleared failed attempts".
 *
 * HOW:
 * Mask email if present. Never dump secrets.
 *
 * @param {string} event
 * @param {Object} meta - { user, ip }
 */
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

/**
 * Print session events like "saved" or "destroyed".
 *
 * @param {string} action
 * @param {Object} meta - { requestId }
 */
function formatSessionEvent(action, meta = {}) {
  const requestId = meta.requestId || 'system';

  console.log(`\n${LINE}`);
  console.log(`SESSION EVENT`);
  console.log(`   Action: ${action}`);
  console.log(`   Request ID: ${requestId}`);
  console.log(`   Time: ${formatTimestamp()}`);
  console.log(`${LINE}`);
}

/**
 * Print a warning block.
 *
 * @param {string} message
 * @param {Object} meta - { requestId }
 */
function formatWarning(message, meta = {}) {
  const requestId = meta.requestId || 'system';

  console.log(`\n${LINE}`);
  console.log(`WARNING`);
  console.log(`   Message: ${message}`);
  console.log(`   Request ID: ${requestId}`);
  console.log(`   Time: ${formatTimestamp()}`);
  console.log(`${LINE}`);
}

module.exports = {
  formatRequest,
  formatAuthEvent,
  formatSecurityEvent,
  formatDatabaseOperation,
  formatError,
  formatInfo,
  formatServerStartup,
  formatConfigSummary,
  formatMiddlewareRegistration,
  formatGracefulShutdown,
  sanitizeSensitiveValue,
  formatCookieParsing,
  formatCSRFToken,
  formatSecurityClearance,
  formatSessionEvent,
  formatWarning
};