/**
 * File: server/lib/audit.js
 * Description: Small JSON logger for auth and security events.
 * Notes: Do not log secrets. Keep fields simple and consistent.
 *
 * WHAT:
 * Writes one JSON line per important event (auth ok/fail, cookie set/clear).
 *
 * WHY:
 * Makes it easy to filter and alert on problems (spikes, failures).
 *
 * HOW:
 * 1) Call audit(event, data, req) in key spots (login, logout, verify fail).
 * 2) Lines appear in journalctl. Ship to CloudWatch later for alerts.
 */

const logger = require('../utils/logger');

/**
 * Extract real client IP from request
 *
 * WHAT:
 * Gets the real client IP from Cloudflare or proxy headers.
 *
 * WHY:
 * For security audit trails, we need the real user IP, not the proxy IP.
 *
 * HOW:
 * Prefers cf-connecting-ip, falls back to x-forwarded-for, then req.ip.
 */
function pickIp(req) {
  return req.headers['cf-connecting-ip']
      || req.headers['x-forwarded-for']
      || req.ip
      || null;
}

/**
 * Log structured audit event
 *
 * WHAT:
 * Writes a single JSON line to stdout for important security events.
 *
 * WHY:
 * Structured logs are easy to filter, search, and alert on in production.
 *
 * HOW:
 * Creates a JSON object with timestamp, event name, request context, and custom data.
 * Logs to stdout (captured by systemd/CloudWatch).
 *
 * Example output:
 * {"ts":"2025-10-10T06:00:00.000Z","event":"auth.set_cookie.ok","request_id":"abc123","ip":"1.2.3.4","path":"/auth/set-cookie","method":"POST","user_id":"user-uuid","ttl_ms":604800000}
 */
function audit(event, data = {}, req = null) {
  const now = new Date().toISOString();
  const base = { ts: now, event };

  // Add request context if available
  if (req) {
    base.request_id = req.id || req.headers['x-request-id'] || null;
    base.ip = pickIp(req);
    base.path = req.originalUrl || req.url || null;
    base.method = req.method;
    base.user_id = req.user?.id || null;
  }

  // Merge custom data
  const line = { ...base, ...data };
  
  // Write as JSON line (stdout -> journalctl -> CloudWatch)
  // Use logger.info which outputs JSON in production mode
  try {
    logger.info(line, '');
  } catch (err) {
    // If JSON serialization fails, log a fallback message
    logger.error({
      event: 'audit.serialization_failed',
      error: err.message
    }, 'Failed to serialize audit log');
  }
}

module.exports = { audit };

