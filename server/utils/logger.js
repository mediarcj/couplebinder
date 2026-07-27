// Description: Structured logging with automatic PII redaction
// Purpose: Enterprise-grade logging that never exposes sensitive data
// Notes: Use logger.info/debug/error instead of console.log to prevent PII leaks

/**
 * Structured logging system with automatic PII and secret redaction.
 *
 * Logging raw user data or secrets violates compliance and aids attackers.
 * We need safe logging that strips all sensitive information automatically.
 *
 * Provides pino-like interface (logger.info/debug/error) with built-in redaction.
 * Logs structured JSON for machine parsing while protecting PII.
 * In production, outputs JSON. In development, outputs pretty format.
 */

const { config } = require('../config');
const consoleLogger = require('./consoleLogger');

// Comprehensive PII and sensitive data redaction patterns
const REDACT_PATTERNS = [
  // Email addresses
  /([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g,
  // Phone numbers (7+ digits)
  /(\b\d{7,}\b)/g,
  // Supabase access tokens
  /(sb-access-token=[^;]+)/g,
  // Generic tokens and secrets
  /\bpassword\b/gi,
  /\bsecret\b/gi,
  /\btoken\b/gi,
  /\bkey\b/gi,
  /\bauth\b/gi,
  /\bsession\b/gi,
  /\bcookie\b/gi,
  /\bbearer\b/gi,
  /\bauthorization\b/gi,
  /\bx-csrf-token\b/gi,
  /\b_csrf\b/gi,
  /\bcsrf-token\b/gi,
  // Stripe secrets (defense-in-depth for message strings)
  /(sk_(live|test)_[A-Za-z0-9]+)/gi,
  /(pk_(live|test)_[A-Za-z0-9]+)/gi,
  /(whsec_[A-Za-z0-9]+)/gi
];

// Control characters that could be used for log injection
const CONTROL_CHARS = /[\x00-\x1F\x7F-\x9F]/g;

/**
 * Safe logging utility that redacts PII and sensitive data
 * @param {string} message - Message to sanitize
 * @returns {string} Sanitized message
 */
function safe(message = '') {
  if (typeof message !== 'string') {
    return '[REDACTED]';
  }
  
  let sanitized = message.replace(CONTROL_CHARS, '');
  
  // Apply comprehensive redaction patterns
  for (const pattern of REDACT_PATTERNS) {
    sanitized = sanitized.replace(pattern, '[REDACTED]');
  }
  
  return sanitized;
}

/**
 * Check if a key name indicates sensitive data
 * @param {string} key - Key name to check
 * @returns {boolean} True if key indicates sensitive data
 */
function isSensitiveKey(key) {
  const keyLower = String(key).toLowerCase();
  return (
    keyLower.includes('password') ||
    keyLower.includes('token') ||
    keyLower.includes('secret') ||
    keyLower.includes('key') ||
    keyLower.includes('auth') ||
    keyLower.includes('session') ||
    keyLower.includes('cookie') ||
    keyLower.includes('bearer') ||
    keyLower.includes('authorization') ||
    keyLower.includes('csrf') ||
    keyLower === 'userid' ||
    keyLower.endsWith('_user_id') ||
    keyLower === 'uid' ||
    ((keyLower.endsWith('id') || keyLower.endsWith('ids')) && keyLower !== 'requestid') ||
    keyLower === 'ip' ||
    keyLower.endsWith('ip') ||
    keyLower.includes('storagekey') ||
    keyLower === 'url' ||
    keyLower.endsWith('_url') ||
    keyLower === 'query' ||
    keyLower === 'error' ||
    keyLower.endsWith('error') ||
    keyLower === 'stack' ||
    keyLower === 'cause' ||
    keyLower === 'message' ||
    // Redact plain emails that appear as meta fields
    keyLower === 'email' || keyLower.endsWith('_email')
  );
}

function sanitizePathForLog(value) {
  if (typeof value !== 'string') return '[REDACTED]';
  const pathname = (value.split(/[?#]/, 1)[0] || '/').replace(CONTROL_CHARS, '');
  return pathname
    .replace(
      /\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(?=\/|$)/gi,
      '/[REDACTED]'
    )
    .replace(/\/[A-Za-z0-9_-]{24,}(?=\/|$)/g, '/[REDACTED]');
}

/**
 * Redact sensitive information from log data
 * @param {any} data - Data to redact
 * @returns {any} Redacted data
 */
function redactSensitiveData(data) {
  if (typeof data === 'string') {
    return safe(data);
  }
  
  if (Array.isArray(data)) {
    return data.map((item) => redactSensitiveData(item));
  }
  
  if (typeof data === 'object' && data !== null) {
    const redacted = {};
    
    for (const [key, value] of Object.entries(data)) {
      const keyLower = String(key).toLowerCase();
      // Keep key names intact for debugging, but redact values if key is sensitive
      if (isSensitiveKey(key)) {
        redacted[key] = '[REDACTED]';
      } else if (keyLower === 'path' || keyLower.endsWith('_path')) {
        redacted[key] = sanitizePathForLog(value);
      } else {
        redacted[key] = redactSensitiveData(value);
      }
    }
    
    return redacted;
  }
  
  return data;
}

/**
 * Format log message with structured output
 * @param {string} level - Log level (info, warn, error)
 * @param {string} message - Log message
 * @param {Object} meta - Additional metadata
 * @returns {string} Formatted log message
 */
/**
 * Secure logger class with structured logging
 * Use this instead of console.log to prevent PII leaks
 */
class SecureLogger {
  constructor() {
    this.isDevelopment = config.server.nodeEnv === 'development';
    // Log level now comes from centralized config (config.logging.logLevel)
    this.logLevel = config?.logging?.logLevel || 'info';
  }

  // Stripe helpers (masking + meta scrubbing)
  #maskStripeId(value) {
    if (!value || typeof value !== 'string') return value;
    // Keep the object prefix (pi_, cs_, seti_, ch_, in_, cus_, si_, sub_) and last 6 chars
    // Example: pi_3OzYbY...abcd12  -> pi_…abcd12
    const m = value.match(/^([a-z]{1,4}_[A-Za-z0-9]+)/i);
    if (!m) return value.length > 10 ? value.slice(0, 4) + '…' + value.slice(-6) : value;
    const prefix = value.split('_')[0] + '_';
    return `${prefix}…${value.slice(-6)}`;
  }

  #maskStripeReceiptUrl(url) {
    if (!url || typeof url !== 'string') return url;
    try {
      const u = new URL(url);
      // Only expose host + fixed path; mask the tokenized tail
      if (u.hostname.endsWith('stripe.com')) {
        // e.g. https://pay.stripe.com/receipts/payment/<token>
        const parts = u.pathname.split('/').filter(Boolean);
        const last = parts.pop() || '';
        const maskedLast = last ? `…${last.slice(-6)}` : '';
        return `${u.origin}/${parts.join('/')}/${maskedLast}`;
      }
    } catch { /* Invalid URLs use the fully redacted fallback below. */ }
    // Not a URL or non-Stripe URL: return placeholder to avoid leaking tokens
    return '[REDACTED_URL]';
  }

  #scrubStripeMeta(meta = {}) {
    if (!meta || typeof meta !== 'object') return {};
    const out = {};
    for (const [k, v] of Object.entries(meta)) {
      const key = String(k).toLowerCase();
      if (v == null) { out[k] = v; continue; }
      // Mask common Stripe identifiers
      if (/(^|_)(session|checkout_session|payment_intent|invoice|charge|customer|subscription|setup_intent|price|product|payout|refund)(_id)?$/.test(key)) {
        out[k] = this.#maskStripeId(String(v));
        continue;
      }
      // Receipt / session URLs
      if (/(^|_)(receipt_url|session_url|hosted_invoice_url|official_receipt_url|stripe_receipt_url)$/.test(key)) {
        out[k] = this.#maskStripeReceiptUrl(String(v));
        continue;
      }
      // Emails and names (PII)
      if (key === 'email' || key.endsWith('_email') || key.endsWith('_name')) {
        out[k] = '[REDACTED]';
        continue;
      }
      // Amount/currency/mode/status are safe
      out[k] = redactSensitiveData(v);
    }
    return out;
  }  
  /**
   * Log info message with optional metadata (PII-safe)
   * @param {Object|string} msgOrData - Message string or data object
   * @param {string} message - Optional message if first param is data object
   */
  info(msgOrData, message = '') {
    let data = {};
    let msg = '';
    
    if (typeof msgOrData === 'string') {
      msg = msgOrData;
      data = typeof message === 'object' ? message : {};
    } else {
      data = msgOrData || {};
      msg = message;
    }
    
    // Redact both the message and metadata. Callers should use stable event names, but
    // this remains safe even if a provider error or user-derived value reaches a message.
    const safeMeta = redactSensitiveData(data);
    const safeMessage = safe(String(msg || ''));
    
    if (this.isDevelopment) {
      // If the data has an 'event' property, use EVENT formatting instead of INFO formatting
      if (data.event) {
        consoleLogger.formatJsonEvent({ level: 'info', ts: new Date().toISOString(), msg: safeMessage, ...safeMeta });
      } else {
        consoleLogger.formatInfo(safeMessage || JSON.stringify(safeMeta), { ...safeMeta, requestId: data.requestId || 'system' });
      }
    } else {
      // Production: JSON line for log aggregation
      console.log(JSON.stringify({ level: 'info', ts: new Date().toISOString(), msg: safeMessage, ...safeMeta }));
    }
  }
  
  /**
   * Debug logging (only in development or if LOG_LEVEL=debug)
   */
  debug(msgOrData, message = '') {
    if (this.logLevel !== 'debug' && !this.isDevelopment) return;
    
    let data = {};
    let msg = '';
    
    if (typeof msgOrData === 'string') {
      msg = msgOrData;
      data = typeof message === 'object' ? message : {};
    } else {
      data = msgOrData || {};
      msg = message;
    }
    
    // For debug, log field names only (not values) to avoid PII
    const fieldNames = typeof data === 'object' ? Object.keys(data).join(', ') : '';
    const safeMsg = safe(`${msg} [fields: ${fieldNames}]`);
    
    if (this.isDevelopment) {
      console.log(`[DEBUG] ${safeMsg}`);
    }
  }
  
  /**
   * Log warning message
   * @param {string} message - Log message
   * @param {Object} meta - Additional metadata
   */
  warn(msgOrData, message = '') {
    const data = typeof msgOrData === 'string'
      ? (typeof message === 'object' ? message : {})
      : (msgOrData || {});
    const msg = typeof msgOrData === 'string' ? msgOrData : message;
    const safeMeta = redactSensitiveData(data);
    const safeMessage = safe(String(msg || 'Warning'));

    if (this.isDevelopment) {
      consoleLogger.formatWarning(safeMessage, safeMeta);
    } else {
      console.warn(JSON.stringify({ level: 'warn', ts: new Date().toISOString(), msg: safeMessage, ...safeMeta }));
    }
  }
  
  /**
   * Stripe domain events (checkout, receipt, webhook, invoice, etc.)
   * Always call this instead of raw info() when the event is Stripe-related.
   * @param {string} event - e.g. 'checkout.created', 'receipt.fetched', 'webhook.verified'
   * @param {Object} meta  - metadata (will be scrubbed/masked)
   */
  stripe(event, meta = {}) {
    const safeMeta = this.#scrubStripeMeta(meta);
    // Leverage the special "event" field so dev pretty logger uses JSON-event formatting
    this.info({ event: `stripe.${event}`, ...safeMeta });
  }

  /**
   * Log error message
   * @param {string} message - Log message
   * @param {Object} meta - Additional metadata
   */
  error(msgOrData, message = '') {
    const data = typeof msgOrData === 'string'
      ? (typeof message === 'object' ? message : {})
      : (msgOrData || {});
    const msg = typeof msgOrData === 'string' ? msgOrData : message;
    const safeMeta = redactSensitiveData(data);
    const safeMessage = safe(String(msg || 'Error'));

    if (this.isDevelopment) {
      consoleLogger.formatError(safeMessage, safeMeta);
    } else {
      console.error(JSON.stringify({ level: 'error', ts: new Date().toISOString(), msg: safeMessage, ...safeMeta }));
    }
  }
  
  /**
   * Log request information
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {number} duration - Request duration in ms
   */
  request(_req, _res, _duration) {
    // This method is now handled by consoleLogger.formatRequest in zorvalon.js
    // No need to log here as it would create duplicate logs
  }
  
  /**
   * Log authentication events
   * @param {string} event - Event type
   * @param {Object} meta - Additional metadata
   */
  // Domain helpers delegate to the same redacting logger path as all other events.
  auth(event, meta = {}) {
    const safeMeta = {
      requestId: meta.requestId,
      event,
      outcome: meta.outcome || 'unknown',
      ip: meta.ip
    };
    
    this.info(`Auth event: ${event}`, safeMeta);
  }
  
  /**
   * Log database operations
   * @param {string} operation - Database operation
   * @param {string} table - Table name
   * @param {Object} meta - Additional metadata
   */
  database(operation, table, meta = {}) {
    const safeMeta = {
      requestId: meta.requestId,
      operation,
      table,
      duration: meta.duration ? `${meta.duration}ms` : undefined
    };
    
    this.info(`Database: ${operation} on ${table}`, safeMeta);
  }
  
  /**
   * Log security events
   * @param {string} event - Security event type
   * @param {Object} meta - Additional metadata
   */
  security(event, meta = {}) {
    const safeMeta = {
      requestId: meta.requestId,
      event,
      ip: meta.ip,
      userAgent: meta.userAgent ? '[REDACTED]' : undefined
    };
    
    this.warn(`Security: ${event}`, safeMeta);
  }
  
  /**
   * Log cookie parsing events
   * @param {Object} meta - Additional metadata
   */
  cookieParsing(meta = {}) {
    const safeMeta = {
      count: meta.count || 0
    };
    
    this.info('Cookies parsed and attached to request', safeMeta);
  }
  
  /**
   * Log CSRF token events
   * @param {string} action - Token action (generated, validated)
   * @param {Object} meta - Additional metadata
   */
  csrfToken(action, meta = {}) {
    const safeMeta = {
      requestId: meta.requestId || 'system'
    };
    
    this.info(`CSRF token ${action}`, safeMeta);
  }
  
  /**
   * Log security clearance events
   * @param {string} event - Security event
   * @param {Object} meta - Additional metadata
   */
  securityClearance(event, meta = {}) {
    const safeMeta = {
      user: meta.user,
      ip: meta.ip
    };
    
    this.info(`Security: ${event}`, safeMeta);
  }
  
  /**
   * Log session events
   * @param {string} action - Session action
   * @param {Object} meta - Additional metadata
   */
  session(action, meta = {}) {
    const safeMeta = {
      requestId: meta.requestId || 'system'
    };
    
    this.info(`Session ${action}`, safeMeta);
  }
  
  /**
   * Log profile update events with pretty orange formatting.
   * 
   * Profile updates are positive user actions that deserve clear visibility.
   * Direct formatting ensures consistent display with other domain events.
   * 
   * Accepts event type (executing/completed) and metadata (userId, fields, operation).
   * Uses the central structured logger so user identifiers and values are redacted.
   * 
   * @param {string} event - Event type (profile.update.executing or profile.update.completed)
   * @param {Object} meta - Additional metadata
   *   {userId, fields: string[] or object, operation}
   */
  profile(event, meta = {}) {
    const safeMeta = {
      userId: meta.userId,
      fields: meta.fields,
      operation: meta.operation,
      level: 'info'
    };
    
    this.info({ event, ...safeMeta }, 'Profile update event');
  }
}

// Create singleton logger instance
const logger = new SecureLogger();

// Export both the logger instance and utility functions
module.exports = Object.assign(logger, {
  safe,
  redactSensitiveData
});
