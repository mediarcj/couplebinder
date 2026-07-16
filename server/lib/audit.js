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
  // This return sends the completed value or response back to the code that called this function.
  return req.headers['cf-connecting-ip']
      // I am keeping this line here because the surrounding audit.js workflow expects this value or operation before it continues.
      || req.headers['x-forwarded-for']
      // I am keeping this line here because the surrounding audit.js workflow expects this value or operation before it continues.
      || req.ip
      // I am keeping this line here because the surrounding audit.js workflow expects this value or operation before it continues.
      || null;
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
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
  // I am saving `now` here so the nearby steps can reuse the same value without rebuilding it each time.
  const now = new Date().toISOString();
  // I am saving `base` here so the nearby steps can reuse the same value without rebuilding it each time.
  const base = { ts: now, event };

  // Add request context if available
  if (req) {
    // I am keeping this line here because the surrounding audit.js workflow expects this value or operation before it continues.
    base.request_id = req.id || req.headers['x-request-id'] || null;
    // I am keeping this line here because the surrounding audit.js workflow expects this value or operation before it continues.
    base.ip = pickIp(req);
    // I am keeping this line here because the surrounding audit.js workflow expects this value or operation before it continues.
    base.path = req.originalUrl || req.url || null;
    // I am keeping this line here because the surrounding audit.js workflow expects this value or operation before it continues.
    base.method = req.method;
    // I am keeping this line here because the surrounding audit.js workflow expects this value or operation before it continues.
    base.user_id = req.user?.id || null;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // Merge custom data
  const line = { ...base, ...data };
  
  // Write as JSON line (stdout -> journalctl -> CloudWatch)
  // Use logger.info which outputs JSON in production mode
  try {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.info(line, '');
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (err) {
    // If JSON serialization fails, log a fallback message
    logger.error({
      // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
      event: 'audit.serialization_failed',
      // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
      error: err.message
    // I am keeping this line here because the surrounding audit.js workflow expects this value or operation before it continues.
    }, 'Failed to serialize audit log');
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am exporting this value here so another module can deliberately reuse the completed piece from audit.js.
module.exports = { audit };

