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
  /password/i,
  /secret/i,
  /token/i,
  /key/i,
  /auth/i,
  /session/i,
  /cookie/i,
  /bearer/i,
  /authorization/i,
  /x-csrf-token/i,
  /_csrf/i,
  /csrf-token/i,
  // Stripe secrets (defense-in-depth for message strings)
  /(sk_(live|test)_[A-Za-z0-9]+)/gi,
  /(pk_(live|test)_[A-Za-z0-9]+)/gi,
  /(whsec_[A-Za-z0-9]+)/gi
];

// Legacy patterns for backward compatibility
const SENSITIVE_PATTERNS = REDACT_PATTERNS;

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
    // Redact plain emails that appear as meta fields
    keyLower === 'email' || keyLower.endsWith('_email')
  );
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
      // Keep key names intact for debugging, but redact values if key is sensitive
      if (isSensitiveKey(key)) {
        redacted[key] = '[REDACTED]';
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
function formatLogMessage(level, message, meta = {}) {
  const timestamp = new Date().toISOString();
  const requestId = meta.requestId || 'system';
  
  // Redact sensitive data from metadata
  const redactedMeta = redactSensitiveData(meta);
  
  // Create structured log entry
  const logEntry = {
    timestamp,
    level,
    requestId,
    message: message.replace(CONTROL_CHARS, ''),
    ...redactedMeta
  };
  
  return JSON.stringify(logEntry);
}

/**
 * Redact object values, keep only keys (for logging field names without PII)
 */
function extractFieldNames(obj) {
  if (!obj || typeof obj !== 'object') return {};
  const fields = {};
  for (const key of Object.keys(obj)) {
    fields[key] = '[VALUE_REDACTED]';
  }
  return fields;
}

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
    
    // Redact sensitive data from metadata
    const safeMeta = redactSensitiveData(data);
    
    if (this.isDevelopment) {
      // If the data has an 'event' property, use EVENT formatting instead of INFO formatting
      if (data.event) {
        consoleLogger.formatJsonEvent({ level: 'info', ts: new Date().toISOString(), msg, ...safeMeta });
      } else {
        consoleLogger.formatInfo(msg || JSON.stringify(safeMeta), { ...safeMeta, requestId: data.requestId || 'system' });
      }
    } else {
      // Production: JSON line for log aggregation
      console.log(JSON.stringify({ level: 'info', ts: new Date().toISOString(), msg, ...safeMeta }));
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
    const safeMsg = `${msg} [fields: ${fieldNames}]`;
    
    if (this.isDevelopment) {
      console.log(`[DEBUG] ${safeMsg}`);
    }
  }
  
  /**
   * Log warning message
   * @param {string} message - Log message
   * @param {Object} meta - Additional metadata
   */
  warn(message, meta = {}) {
    // Use consoleLogger for formatted display instead of raw JSON
    consoleLogger.formatWarning(message, meta);
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
  error(message, meta = {}) {
    // Use consoleLogger for formatted display instead of raw JSON
    consoleLogger.formatError(message, meta);
  }
  
  /**
   * Log request information
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {number} duration - Request duration in ms
   */
  request(req, res, duration) {
    // This method is now handled by consoleLogger.formatRequest in zorvalon.js
    // No need to log here as it would create duplicate logs
  }
  
  /**
   * Log authentication events
   * @param {string} event - Event type
   * @param {Object} meta - Additional metadata
   */
  // These domain helpers send the same safe metadata to structured logs and the readable console formatter.
  auth(event, meta = {}) {
    const safeMeta = {
      requestId: meta.requestId,
      event,
      outcome: meta.outcome || 'unknown',
      ip: meta.ip
    };
    
    this.info(`Auth event: ${event}`, safeMeta);
    
    consoleLogger.formatAuthEvent(event, safeMeta);
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
    
    consoleLogger.formatDatabaseOperation(operation, table, safeMeta);
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
    
    consoleLogger.formatSecurityEvent(event, safeMeta);
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
    
    consoleLogger.formatCookieParsing(safeMeta);
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
    
    consoleLogger.formatCSRFToken(action, safeMeta);
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
    
    consoleLogger.formatSecurityClearance(event, safeMeta);
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
    
    consoleLogger.formatSessionEvent(action, safeMeta);
  }
  
  /**
   * Log profile update events with pretty orange formatting.
   * 
   * Profile updates are positive user actions that deserve clear visibility.
   * Direct formatting ensures consistent display with other domain events.
   * 
   * Accepts event type (executing/completed) and metadata (userId, fields, operation).
   * Calls consoleLogger.formatProfileUpdateEvent() for pretty display.
   * Keeps PII-safe by only logging field names, not values.
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
    
    // Format for console display with orange color
    consoleLogger.formatProfileUpdateEvent({
      ts: new Date().toISOString(),
      msg: event,
      ...safeMeta
    });
  }
}

// Create singleton logger instance
const logger = new SecureLogger();

// Export both the logger instance and utility functions
module.exports = Object.assign(logger, {
  safe,
  redactSensitiveData
});
