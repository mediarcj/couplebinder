// File: server/utils/logger.js
// Description: Secure logging utility with redaction and structured output
// Purpose: Provides safe logging with request tracking and sensitive data protection
// Notes: Strips secrets, prevents log injection, and uses structured format

/**
 * WHAT:
 * We provide a secure logging system that protects sensitive data and prevents log injection.
 *
 * WHY:
 * Logging sensitive information can help attackers. We need safe logging with proper redaction.
 *
 * HOW:
 * We create a logger that strips secrets, prevents injection, and provides structured output.
 */

const { config } = require('../config');

// Sensitive patterns to redact from logs
const SENSITIVE_PATTERNS = [
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
  /csrf-token/i
];

// Control characters that could be used for log injection
const CONTROL_CHARS = /[\x00-\x1F\x7F-\x9F]/g;

/**
 * Redact sensitive information from log data
 * @param {any} data - Data to redact
 * @returns {any} Redacted data
 */
function redactSensitiveData(data) {
  if (typeof data === 'string') {
    // Strip control characters to prevent log injection
    let redacted = data.replace(CONTROL_CHARS, '');
    
    // Check if string contains sensitive patterns
    for (const pattern of SENSITIVE_PATTERNS) {
      if (pattern.test(redacted)) {
        redacted = '[REDACTED]';
        break;
      }
    }
    
    return redacted;
  }
  
  if (typeof data === 'object' && data !== null) {
    const redacted = {};
    
    for (const [key, value] of Object.entries(data)) {
      // Check if key contains sensitive patterns
      const keyRedacted = redactSensitiveData(key);
      
      if (keyRedacted === '[REDACTED]') {
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
 * Secure logger class
 */
class SecureLogger {
  constructor() {
    this.isDevelopment = config.server.nodeEnv === 'development';
  }
  
  /**
   * Log info message
   * @param {string} message - Log message
   * @param {Object} meta - Additional metadata
   */
  info(message, meta = {}) {
    if (this.isDevelopment) {
      console.log(formatLogMessage('info', message, meta));
    }
  }
  
  /**
   * Log warning message
   * @param {string} message - Log message
   * @param {Object} meta - Additional metadata
   */
  warn(message, meta = {}) {
    console.warn(formatLogMessage('warn', message, meta));
  }
  
  /**
   * Log error message
   * @param {string} message - Log message
   * @param {Object} meta - Additional metadata
   */
  error(message, meta = {}) {
    console.error(formatLogMessage('error', message, meta));
  }
  
  /**
   * Log request information
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {number} duration - Request duration in ms
   */
  request(req, res, duration) {
    const meta = {
      requestId: req.requestId,
      method: req.method,
      url: req.url,
      status: res.statusCode,
      duration: `${duration}ms`,
      userAgent: req.get('User-Agent') ? '[REDACTED]' : undefined,
      ip: req.ip
    };
    
    const message = `${req.method} ${req.url} ${res.statusCode} ${duration}ms`;
    
    if (res.statusCode >= 400) {
      this.error(message, meta);
    } else {
      this.info(message, meta);
    }
  }
  
  /**
   * Log authentication events
   * @param {string} event - Event type
   * @param {Object} meta - Additional metadata
   */
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
}

// Create singleton logger instance
const logger = new SecureLogger();

module.exports = logger;
