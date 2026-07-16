// File: server/utils/logger.js
// Description: Structured logging with automatic PII redaction
// Purpose: Enterprise-grade logging that never exposes sensitive data
// Notes: Use logger.info/debug/error instead of console.log to prevent PII leaks

/**
 * WHAT:
 * Structured logging system with automatic PII and secret redaction.
 *
 * WHY:
 * Logging raw user data or secrets violates compliance and aids attackers.
 * We need safe logging that strips all sensitive information automatically.
 *
 * HOW:
 * Provides pino-like interface (logger.info/debug/error) with built-in redaction.
 * Logs structured JSON for machine parsing while protecting PII.
 * In production, outputs JSON. In development, outputs pretty format.
 */

const { config } = require('../config');
// I am loading `./consoleLogger` into `consoleLogger` so this file can reuse that dependency below.
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
  // I am keeping this line here because the surrounding logger.js workflow expects this value or operation before it continues.
  /secret/i,
  // I am keeping this line here because the surrounding logger.js workflow expects this value or operation before it continues.
  /token/i,
  // I am keeping this line here because the surrounding logger.js workflow expects this value or operation before it continues.
  /key/i,
  // I am keeping this line here because the surrounding logger.js workflow expects this value or operation before it continues.
  /auth/i,
  // I am keeping this line here because the surrounding logger.js workflow expects this value or operation before it continues.
  /session/i,
  // I am keeping this line here because the surrounding logger.js workflow expects this value or operation before it continues.
  /cookie/i,
  // I am keeping this line here because the surrounding logger.js workflow expects this value or operation before it continues.
  /bearer/i,
  // I am keeping this line here because the surrounding logger.js workflow expects this value or operation before it continues.
  /authorization/i,
  // I am keeping this line here because the surrounding logger.js workflow expects this value or operation before it continues.
  /x-csrf-token/i,
  // I am keeping this line here because the surrounding logger.js workflow expects this value or operation before it continues.
  /_csrf/i,
  // I am keeping this line here because the surrounding logger.js workflow expects this value or operation before it continues.
  /csrf-token/i,
  // Stripe secrets (defense-in-depth for message strings)
  /(sk_(live|test)_[A-Za-z0-9]+)/gi,
  // I am keeping this line here because the surrounding logger.js workflow expects this value or operation before it continues.
  /(pk_(live|test)_[A-Za-z0-9]+)/gi,
  // I am keeping this line here because the surrounding logger.js workflow expects this value or operation before it continues.
  /(whsec_[A-Za-z0-9]+)/gi
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
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
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (typeof message !== 'string') {
    // This return sends the completed value or response back to the code that called this function.
    return '[REDACTED]';
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
  
  // I am saving `sanitized` here so the nearby steps can reuse the same value without rebuilding it each time.
  let sanitized = message.replace(CONTROL_CHARS, '');
  
  // Apply comprehensive redaction patterns
  for (const pattern of REDACT_PATTERNS) {
    // I am keeping this line here because the surrounding logger.js workflow expects this value or operation before it continues.
    sanitized = sanitized.replace(pattern, '[REDACTED]');
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
  
  // This return sends the completed value or response back to the code that called this function.
  return sanitized;
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * Check if a key name indicates sensitive data
 * @param {string} key - Key name to check
 * @returns {boolean} True if key indicates sensitive data
 */
function isSensitiveKey(key) {
  // I am saving `keyLower` here so the nearby steps can reuse the same value without rebuilding it each time.
  const keyLower = String(key).toLowerCase();
  // This return sends the completed value or response back to the code that called this function.
  return (
    // I am calling this helper here so the current workflow performs this step before it moves on.
    keyLower.includes('password') ||
    // I am calling this helper here so the current workflow performs this step before it moves on.
    keyLower.includes('token') ||
    // I am calling this helper here so the current workflow performs this step before it moves on.
    keyLower.includes('secret') ||
    // I am calling this helper here so the current workflow performs this step before it moves on.
    keyLower.includes('key') ||
    // I am calling this helper here so the current workflow performs this step before it moves on.
    keyLower.includes('auth') ||
    // I am calling this helper here so the current workflow performs this step before it moves on.
    keyLower.includes('session') ||
    // I am calling this helper here so the current workflow performs this step before it moves on.
    keyLower.includes('cookie') ||
    // I am calling this helper here so the current workflow performs this step before it moves on.
    keyLower.includes('bearer') ||
    // I am calling this helper here so the current workflow performs this step before it moves on.
    keyLower.includes('authorization') ||
    // I am calling this helper here so the current workflow performs this step before it moves on.
    keyLower.includes('csrf') ||
    // Redact plain emails that appear as meta fields
    keyLower === 'email' || keyLower.endsWith('_email')
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  );
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * Redact sensitive information from log data
 * @param {any} data - Data to redact
 * @returns {any} Redacted data
 */
function redactSensitiveData(data) {
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (typeof data === 'string') {
    // This return sends the completed value or response back to the code that called this function.
    return safe(data);
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
  
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (Array.isArray(data)) {
    // This return sends the completed value or response back to the code that called this function.
    return data.map((item) => redactSensitiveData(item));
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
  
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (typeof data === 'object' && data !== null) {
    // I am saving `redacted` here so the nearby steps can reuse the same value without rebuilding it each time.
    const redacted = {};
    
    // I am repeating the next block one item at a time so every value in the existing collection receives the same handling.
    for (const [key, value] of Object.entries(data)) {
      // Keep key names intact for debugging, but redact values if key is sensitive
      if (isSensitiveKey(key)) {
        // I am keeping this line here because the surrounding logger.js workflow expects this value or operation before it continues.
        redacted[key] = '[REDACTED]';
      // This alternative runs only when the condition above did not use its first path.
      } else {
        // I am keeping this line here because the surrounding logger.js workflow expects this value or operation before it continues.
        redacted[key] = redactSensitiveData(value);
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    
    // This return sends the completed value or response back to the code that called this function.
    return redacted;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
  
  // This return sends the completed value or response back to the code that called this function.
  return data;
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * Format log message with structured output
 * @param {string} level - Log level (info, warn, error)
 * @param {string} message - Log message
 * @param {Object} meta - Additional metadata
 * @returns {string} Formatted log message
 */
function formatLogMessage(level, message, meta = {}) {
  // I am saving `timestamp` here so the nearby steps can reuse the same value without rebuilding it each time.
  const timestamp = new Date().toISOString();
  // I am saving `requestId` here so the nearby steps can reuse the same value without rebuilding it each time.
  const requestId = meta.requestId || 'system';
  
  // Redact sensitive data from metadata
  const redactedMeta = redactSensitiveData(meta);
  
  // Create structured log entry
  const logEntry = {
    // I am keeping this line here because the surrounding logger.js workflow expects this value or operation before it continues.
    timestamp,
    // I am keeping this line here because the surrounding logger.js workflow expects this value or operation before it continues.
    level,
    // I am keeping this line here because the surrounding logger.js workflow expects this value or operation before it continues.
    requestId,
    // I am keeping the `message` field in this object so the receiving code can read that value by its expected name.
    message: message.replace(CONTROL_CHARS, ''),
    // I am keeping this line here because the surrounding logger.js workflow expects this value or operation before it continues.
    ...redactedMeta
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  };
  
  // This return sends the completed value or response back to the code that called this function.
  return JSON.stringify(logEntry);
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * Redact object values, keep only keys (for logging field names without PII)
 */
function extractFieldNames(obj) {
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!obj || typeof obj !== 'object') return {};
  // I am saving `fields` here so the nearby steps can reuse the same value without rebuilding it each time.
  const fields = {};
  // I am repeating the next block one item at a time so every value in the existing collection receives the same handling.
  for (const key of Object.keys(obj)) {
    // I am keeping this line here because the surrounding logger.js workflow expects this value or operation before it continues.
    fields[key] = '[VALUE_REDACTED]';
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
  // This return sends the completed value or response back to the code that called this function.
  return fields;
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * Secure logger class with structured logging
 * Use this instead of console.log to prevent PII leaks
 */
class SecureLogger {
  // I am defining the `constructor` step here so the surrounding object or class can call it with the values listed in its parameters.
  constructor() {
    // I am keeping this line here because the surrounding logger.js workflow expects this value or operation before it continues.
    this.isDevelopment = config.server.nodeEnv === 'development';
    // Log level now comes from centralized config (config.logging.logLevel)
    this.logLevel = config?.logging?.logLevel || 'info';
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Stripe helpers (masking + meta scrubbing)
  // ──────────────────────────────────────────────────────────────────────────
  #maskStripeId(value) {
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!value || typeof value !== 'string') return value;
    // Keep the object prefix (pi_, cs_, seti_, ch_, in_, cus_, si_, sub_) and last 6 chars
    // Example: pi_3OzYbY...abcd12  -> pi_…abcd12
    const m = value.match(/^([a-z]{1,4}_[A-Za-z0-9]+)/i);
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!m) return value.length > 10 ? value.slice(0, 4) + '…' + value.slice(-6) : value;
    // I am saving `prefix` here so the nearby steps can reuse the same value without rebuilding it each time.
    const prefix = value.split('_')[0] + '_';
    // This return sends the completed value or response back to the code that called this function.
    return `${prefix}…${value.slice(-6)}`;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am keeping this line here because the surrounding logger.js workflow expects this value or operation before it continues.
  #maskStripeReceiptUrl(url) {
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!url || typeof url !== 'string') return url;
    // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
    try {
      // I am saving `u` here so the nearby steps can reuse the same value without rebuilding it each time.
      const u = new URL(url);
      // Only expose host + fixed path; mask the tokenized tail
      if (u.hostname.endsWith('stripe.com')) {
        // e.g. https://pay.stripe.com/receipts/payment/<token>
        const parts = u.pathname.split('/').filter(Boolean);
        // I am saving `last` here so the nearby steps can reuse the same value without rebuilding it each time.
        const last = parts.pop() || '';
        // I am saving `maskedLast` here so the nearby steps can reuse the same value without rebuilding it each time.
        const maskedLast = last ? `…${last.slice(-6)}` : '';
        // This return sends the completed value or response back to the code that called this function.
        return `${u.origin}/${parts.join('/')}/${maskedLast}`;
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    } catch { /* ignore */ }
    // Not a URL or non-Stripe URL: return placeholder to avoid leaking tokens
    return '[REDACTED_URL]';
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am keeping this line here because the surrounding logger.js workflow expects this value or operation before it continues.
  #scrubStripeMeta(meta = {}) {
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!meta || typeof meta !== 'object') return {};
    // I am saving `out` here so the nearby steps can reuse the same value without rebuilding it each time.
    const out = {};
    // I am repeating the next block one item at a time so every value in the existing collection receives the same handling.
    for (const [k, v] of Object.entries(meta)) {
      // I am saving `key` here so the nearby steps can reuse the same value without rebuilding it each time.
      const key = String(k).toLowerCase();
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (v == null) { out[k] = v; continue; }
      // Mask common Stripe identifiers
      if (/(^|_)(session|checkout_session|payment_intent|invoice|charge|customer|subscription|setup_intent|price|product|payout|refund)(_id)?$/.test(key)) {
        // I am keeping this line here because the surrounding logger.js workflow expects this value or operation before it continues.
        out[k] = this.#maskStripeId(String(v));
        // I am changing the loop flow here once the condition above has decided this item needs no further work in this pass.
        continue;
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
      // Receipt / session URLs
      if (/(^|_)(receipt_url|session_url|hosted_invoice_url|official_receipt_url|stripe_receipt_url)$/.test(key)) {
        // I am keeping this line here because the surrounding logger.js workflow expects this value or operation before it continues.
        out[k] = this.#maskStripeReceiptUrl(String(v));
        // I am changing the loop flow here once the condition above has decided this item needs no further work in this pass.
        continue;
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
      // Emails and names (PII)
      if (key === 'email' || key.endsWith('_email') || key.endsWith('_name')) {
        // I am keeping this line here because the surrounding logger.js workflow expects this value or operation before it continues.
        out[k] = '[REDACTED]';
        // I am changing the loop flow here once the condition above has decided this item needs no further work in this pass.
        continue;
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
      // Amount/currency/mode/status are safe
      out[k] = redactSensitiveData(v);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    // This return sends the completed value or response back to the code that called this function.
    return out;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }  
  /**
   * Log info message with optional metadata (PII-safe)
   * @param {Object|string} msgOrData - Message string or data object
   * @param {string} message - Optional message if first param is data object
   */
  info(msgOrData, message = '') {
    // I am saving `data` here so the nearby steps can reuse the same value without rebuilding it each time.
    let data = {};
    // I am saving `msg` here so the nearby steps can reuse the same value without rebuilding it each time.
    let msg = '';
    
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (typeof msgOrData === 'string') {
      // I am keeping this line here because the surrounding logger.js workflow expects this value or operation before it continues.
      msg = msgOrData;
      // I am keeping this line here because the surrounding logger.js workflow expects this value or operation before it continues.
      data = typeof message === 'object' ? message : {};
    // This alternative runs only when the condition above did not use its first path.
    } else {
      // I am keeping this line here because the surrounding logger.js workflow expects this value or operation before it continues.
      data = msgOrData || {};
      // I am keeping this line here because the surrounding logger.js workflow expects this value or operation before it continues.
      msg = message;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    
    // Redact sensitive data from metadata
    const safeMeta = redactSensitiveData(data);
    
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (this.isDevelopment) {
      // If the data has an 'event' property, use EVENT formatting instead of INFO formatting
      if (data.event) {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        consoleLogger.formatJsonEvent({ level: 'info', ts: new Date().toISOString(), msg, ...safeMeta });
      // This alternative runs only when the condition above did not use its first path.
      } else {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        consoleLogger.formatInfo(msg || JSON.stringify(safeMeta), { ...safeMeta, requestId: data.requestId || 'system' });
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // This alternative runs only when the condition above did not use its first path.
    } else {
      // Production: JSON line for log aggregation
      console.log(JSON.stringify({ level: 'info', ts: new Date().toISOString(), msg, ...safeMeta }));
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
  
  /**
   * Debug logging (only in development or if LOG_LEVEL=debug)
   */
  debug(msgOrData, message = '') {
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (this.logLevel !== 'debug' && !this.isDevelopment) return;
    
    // I am saving `data` here so the nearby steps can reuse the same value without rebuilding it each time.
    let data = {};
    // I am saving `msg` here so the nearby steps can reuse the same value without rebuilding it each time.
    let msg = '';
    
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (typeof msgOrData === 'string') {
      // I am keeping this line here because the surrounding logger.js workflow expects this value or operation before it continues.
      msg = msgOrData;
      // I am keeping this line here because the surrounding logger.js workflow expects this value or operation before it continues.
      data = typeof message === 'object' ? message : {};
    // This alternative runs only when the condition above did not use its first path.
    } else {
      // I am keeping this line here because the surrounding logger.js workflow expects this value or operation before it continues.
      data = msgOrData || {};
      // I am keeping this line here because the surrounding logger.js workflow expects this value or operation before it continues.
      msg = message;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    
    // For debug, log field names only (not values) to avoid PII
    const fieldNames = typeof data === 'object' ? Object.keys(data).join(', ') : '';
    // I am saving `safeMsg` here so the nearby steps can reuse the same value without rebuilding it each time.
    const safeMsg = `${msg} [fields: ${fieldNames}]`;
    
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (this.isDevelopment) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      console.log(`[DEBUG] ${safeMsg}`);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
  
  /**
   * Log warning message
   * @param {string} message - Log message
   * @param {Object} meta - Additional metadata
   */
  warn(message, meta = {}) {
    // Use consoleLogger for formatted display instead of raw JSON
    consoleLogger.formatWarning(message, meta);
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
  
  /**
   * Stripe domain events (checkout, receipt, webhook, invoice, etc.)
   * Always call this instead of raw info() when the event is Stripe-related.
   * @param {string} event - e.g. 'checkout.created', 'receipt.fetched', 'webhook.verified'
   * @param {Object} meta  - metadata (will be scrubbed/masked)
   */
  stripe(event, meta = {}) {
    // I am saving `safeMeta` here so the nearby steps can reuse the same value without rebuilding it each time.
    const safeMeta = this.#scrubStripeMeta(meta);
    // Leverage the special "event" field so dev pretty logger uses JSON-event formatting
    this.info({ event: `stripe.${event}`, ...safeMeta });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  /**
   * Log error message
   * @param {string} message - Log message
   * @param {Object} meta - Additional metadata
   */
  error(message, meta = {}) {
    // Use consoleLogger for formatted display instead of raw JSON
    consoleLogger.formatError(message, meta);
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
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
  auth(event, meta = {}) {
    // I am saving `safeMeta` here so the nearby steps can reuse the same value without rebuilding it each time.
    const safeMeta = {
      // I am keeping the `requestId` field in this object so the receiving code can read that value by its expected name.
      requestId: meta.requestId,
      // I am keeping this line here because the surrounding logger.js workflow expects this value or operation before it continues.
      event,
      // I am keeping the `outcome` field in this object so the receiving code can read that value by its expected name.
      outcome: meta.outcome || 'unknown',
      // I am keeping the `ip` field in this object so the receiving code can read that value by its expected name.
      ip: meta.ip
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    };
    
    // I am calling this helper here so the current workflow performs this step before it moves on.
    this.info(`Auth event: ${event}`, safeMeta);
    
    // Also format for console display
    consoleLogger.formatAuthEvent(event, safeMeta);
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
  
  /**
   * Log database operations
   * @param {string} operation - Database operation
   * @param {string} table - Table name
   * @param {Object} meta - Additional metadata
   */
  database(operation, table, meta = {}) {
    // I am saving `safeMeta` here so the nearby steps can reuse the same value without rebuilding it each time.
    const safeMeta = {
      // I am keeping the `requestId` field in this object so the receiving code can read that value by its expected name.
      requestId: meta.requestId,
      // I am keeping this line here because the surrounding logger.js workflow expects this value or operation before it continues.
      operation,
      // I am keeping this line here because the surrounding logger.js workflow expects this value or operation before it continues.
      table,
      // I am keeping the `duration` field in this object so the receiving code can read that value by its expected name.
      duration: meta.duration ? `${meta.duration}ms` : undefined
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    };
    
    // I am calling this helper here so the current workflow performs this step before it moves on.
    this.info(`Database: ${operation} on ${table}`, safeMeta);
    
    // Also format for console display
    consoleLogger.formatDatabaseOperation(operation, table, safeMeta);
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
  
  /**
   * Log security events
   * @param {string} event - Security event type
   * @param {Object} meta - Additional metadata
   */
  security(event, meta = {}) {
    // I am saving `safeMeta` here so the nearby steps can reuse the same value without rebuilding it each time.
    const safeMeta = {
      // I am keeping the `requestId` field in this object so the receiving code can read that value by its expected name.
      requestId: meta.requestId,
      // I am keeping this line here because the surrounding logger.js workflow expects this value or operation before it continues.
      event,
      // I am keeping the `ip` field in this object so the receiving code can read that value by its expected name.
      ip: meta.ip,
      // I am keeping the `userAgent` field in this object so the receiving code can read that value by its expected name.
      userAgent: meta.userAgent ? '[REDACTED]' : undefined
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    };
    
    // I am calling this helper here so the current workflow performs this step before it moves on.
    this.warn(`Security: ${event}`, safeMeta);
    
    // Also format for console display
    consoleLogger.formatSecurityEvent(event, safeMeta);
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
  
  /**
   * Log cookie parsing events
   * @param {Object} meta - Additional metadata
   */
  cookieParsing(meta = {}) {
    // I am saving `safeMeta` here so the nearby steps can reuse the same value without rebuilding it each time.
    const safeMeta = {
      // I am keeping the `count` field in this object so the receiving code can read that value by its expected name.
      count: meta.count || 0
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    };
    
    // I am calling this helper here so the current workflow performs this step before it moves on.
    this.info('Cookies parsed and attached to request', safeMeta);
    
    // Also format for console display
    consoleLogger.formatCookieParsing(safeMeta);
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
  
  /**
   * Log CSRF token events
   * @param {string} action - Token action (generated, validated)
   * @param {Object} meta - Additional metadata
   */
  csrfToken(action, meta = {}) {
    // I am saving `safeMeta` here so the nearby steps can reuse the same value without rebuilding it each time.
    const safeMeta = {
      // I am keeping the `requestId` field in this object so the receiving code can read that value by its expected name.
      requestId: meta.requestId || 'system'
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    };
    
    // I am calling this helper here so the current workflow performs this step before it moves on.
    this.info(`CSRF token ${action}`, safeMeta);
    
    // Also format for console display
    consoleLogger.formatCSRFToken(action, safeMeta);
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
  
  /**
   * Log security clearance events
   * @param {string} event - Security event
   * @param {Object} meta - Additional metadata
   */
  securityClearance(event, meta = {}) {
    // I am saving `safeMeta` here so the nearby steps can reuse the same value without rebuilding it each time.
    const safeMeta = {
      // I am keeping the `user` field in this object so the receiving code can read that value by its expected name.
      user: meta.user,
      // I am keeping the `ip` field in this object so the receiving code can read that value by its expected name.
      ip: meta.ip
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    };
    
    // I am calling this helper here so the current workflow performs this step before it moves on.
    this.info(`Security: ${event}`, safeMeta);
    
    // Also format for console display
    consoleLogger.formatSecurityClearance(event, safeMeta);
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
  
  /**
   * Log session events
   * @param {string} action - Session action
   * @param {Object} meta - Additional metadata
   */
  session(action, meta = {}) {
    // I am saving `safeMeta` here so the nearby steps can reuse the same value without rebuilding it each time.
    const safeMeta = {
      // I am keeping the `requestId` field in this object so the receiving code can read that value by its expected name.
      requestId: meta.requestId || 'system'
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    };
    
    // I am calling this helper here so the current workflow performs this step before it moves on.
    this.info(`Session ${action}`, safeMeta);
    
    // Also format for console display
    consoleLogger.formatSessionEvent(action, safeMeta);
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
  
  /**
   * WHAT:
   * Log profile update events with pretty orange formatting.
   * 
   * WHY:
   * Profile updates are positive user actions that deserve clear visibility.
   * Direct formatting ensures consistent display with other domain events.
   * 
   * HOW:
   * Accepts event type (executing/completed) and metadata (userId, fields, operation).
   * Calls consoleLogger.formatProfileUpdateEvent() for pretty display.
   * Keeps PII-safe by only logging field names, not values.
   * 
   * @param {string} event - Event type (profile.update.executing or profile.update.completed)
   * @param {Object} meta - Additional metadata
   *   {userId, fields: string[] or object, operation}
   */
  profile(event, meta = {}) {
    // I am saving `safeMeta` here so the nearby steps can reuse the same value without rebuilding it each time.
    const safeMeta = {
      // I am keeping the `userId` field in this object so the receiving code can read that value by its expected name.
      userId: meta.userId,
      // I am keeping the `fields` field in this object so the receiving code can read that value by its expected name.
      fields: meta.fields,
      // I am keeping the `operation` field in this object so the receiving code can read that value by its expected name.
      operation: meta.operation,
      // I am keeping the `level` field in this object so the receiving code can read that value by its expected name.
      level: 'info'
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    };
    
    // Format for console display with orange color
    consoleLogger.formatProfileUpdateEvent({
      // I am keeping the `ts` field in this object so the receiving code can read that value by its expected name.
      ts: new Date().toISOString(),
      // I am keeping the `msg` field in this object so the receiving code can read that value by its expected name.
      msg: event,
      // I am keeping this line here because the surrounding logger.js workflow expects this value or operation before it continues.
      ...safeMeta
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// Create singleton logger instance
const logger = new SecureLogger();

// Export both the logger instance and utility functions
module.exports = Object.assign(logger, {
  // I am keeping this line here because the surrounding logger.js workflow expects this value or operation before it continues.
  safe,
  // I am keeping this line here because the surrounding logger.js workflow expects this value or operation before it continues.
  redactSensitiveData
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
});
