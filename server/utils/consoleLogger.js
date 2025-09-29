// File: server/utils/consoleLogger.js
// Description: Formatted console logging utility for readable terminal output
// Purpose: Provides clean, organized terminal output with simple plain English
// Notes: Formats logs for easy reading while preserving all important information

/**
 * WHAT:
 * We provide formatted console output that is easy to read and understand.
 *
 * WHY:
 * Raw JSON logs and technical messages make debugging difficult. We need readable output.
 *
 * HOW:
 * We format logs with clear sections, simple language, and organized structure.
 */

const { config } = require('../config');

/**
 * Format timestamp for display
 * @returns {string} Formatted timestamp
 */
function formatTimestamp() {
  return new Date().toLocaleString();
}

/**
 * Format request information for display
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {number} duration - Request duration in ms
 */
function formatRequest(req, res, duration) {
  const status = res.statusCode;
  const method = req.method;
  const url = req.url;
  const requestId = req.requestId || 'unknown';
  
  // Color coding for status
  let statusColor = '';
  let statusText = '';
  
  if (status >= 200 && status < 300) {
    statusColor = '\x1b[32m'; // Green
    statusText = 'SUCCESS';
  } else if (status >= 300 && status < 400) {
    statusColor = '\x1b[33m'; // Yellow
    statusText = 'REDIRECT';
  } else if (status >= 400 && status < 500) {
    statusColor = '\x1b[31m'; // Red
    statusText = 'CLIENT ERROR';
  } else if (status >= 500) {
    statusColor = '\x1b[35m'; // Magenta
    statusText = 'SERVER ERROR';
  }
  
  const resetColor = '\x1b[0m';
  
  console.log(`\n${statusColor}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${resetColor}`);
  console.log(`${statusColor}REQUEST${resetColor}     ${method} ${url}`);
  console.log(`${statusColor}STATUS${resetColor}      ${statusColor}${status}${resetColor} (${statusText})`);
  console.log(`${statusColor}DURATION${resetColor}    ${duration}ms`);
  console.log(`${statusColor}REQUEST ID${resetColor}   ${requestId}`);
  console.log(`${statusColor}CLIENT IP${resetColor}    ${req.ip}`);
  console.log(`${statusColor}TIMESTAMP${resetColor}    ${formatTimestamp()}`);
  console.log(`${statusColor}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${resetColor}`);
}

/**
 * Format authentication events
 * @param {string} event - Event type
 * @param {Object} meta - Additional metadata
 */
function formatAuthEvent(event, meta = {}) {
  const requestId = meta.requestId || 'system';
  const ip = meta.ip || 'unknown';
  const outcome = meta.outcome || 'unknown';
  
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`AUTH EVENT`);
  console.log(`   Event: ${event}`);
  console.log(`   Outcome: ${outcome}`);
  console.log(`   Request ID: ${requestId}`);
  console.log(`   Client IP: ${ip}`);
  console.log(`   Time: ${formatTimestamp()}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
}

/**
 * Format security events
 * @param {string} event - Security event type
 * @param {Object} meta - Additional metadata
 */
function formatSecurityEvent(event, meta = {}) {
  const requestId = meta.requestId || 'system';
  const ip = meta.ip || 'unknown';
  
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`SECURITY ALERT`);
  console.log(`   Event: ${event}`);
  console.log(`   Request ID: ${requestId}`);
  console.log(`   Client IP: ${ip}`);
  console.log(`   Time: ${formatTimestamp()}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
}

/**
 * Format database operations
 * @param {string} operation - Database operation
 * @param {string} table - Table name
 * @param {Object} meta - Additional metadata
 */
function formatDatabaseOperation(operation, table, meta = {}) {
  const requestId = meta.requestId || 'system';
  const duration = meta.duration ? `${meta.duration}ms` : 'unknown';
  
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`DATABASE`);
  console.log(`   Operation: ${operation}`);
  console.log(`   Table: ${table}`);
  console.log(`   Duration: ${duration}`);
  console.log(`   Request ID: ${requestId}`);
  console.log(`   Time: ${formatTimestamp()}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
}

/**
 * Format error messages
 * @param {string} message - Error message
 * @param {Object} meta - Additional metadata
 */
function formatError(message, meta = {}) {
  const requestId = meta.requestId || 'system';
  const error = meta.error || 'No details available';
  
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`ERROR OCCURRED`);
  console.log(`   Message: ${message}`);
  console.log(`   Details: ${error}`);
  console.log(`   Request ID: ${requestId}`);
  console.log(`   Time: ${formatTimestamp()}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
}

/**
 * Format info messages
 * @param {string} message - Info message
 * @param {Object} meta - Additional metadata
 */
function formatInfo(message, meta = {}) {
  const requestId = meta.requestId || 'system';
  
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`INFO`);
  console.log(`   Message: ${message}`);
  console.log(`   Request ID: ${requestId}`);
  console.log(`   Time: ${formatTimestamp()}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
}

/**
 * Format server startup information
 * @param {Object} serverInfo - Server configuration
 */
function formatServerStartup(serverInfo) {
  console.log(`\nDETECHIFY SERVER STARTING`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`Server: ${serverInfo.host}:${serverInfo.port}`);
  console.log(`Environment: ${serverInfo.nodeEnv}`);
  console.log(`Database: ${serverInfo.database}`);
  console.log(`Redis: ${serverInfo.redis}`);
  console.log(`Rate Limiting: ${serverInfo.rateLimit}`);
  console.log(`Text Limits: ${serverInfo.textLimits}`);
  console.log(`Max Submissions: ${serverInfo.maxSubmissions}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`Server startup completed successfully`);
  console.log(`Started at: ${formatTimestamp()}`);
}

/**
 * Format configuration summary
 * @param {Object} config - Application configuration
 */
function formatConfigSummary(config) {
  console.log(`\nCONFIGURATION LOADED`);
  console.log(`   Server: ${config.server.host}:${config.server.port} (${config.server.nodeEnv})`);
  console.log(`   Database: ${config.database.host}:${config.database.port}/${config.database.name}`);
  console.log(`   Redis: ${config.redis.host}:${config.redis.port}${config.redis.password ? ' (password protected)' : ' (no password)'}`);
  console.log(`   Rate Limiting: ${config.rateLimit ? 'enabled' : 'disabled'}`);
  console.log(`   Text Limits: ${config.limits.textMinLength}-${config.limits.textMaxLength} chars`);
  console.log(`   Max Submissions: ${config.limits.maxSubmissions}`);
}

/**
 * Format middleware registration
 * @param {string} middleware - Middleware name
 */
function formatMiddlewareRegistration(middleware) {
  console.log(`${middleware} registered`);
}

/**
 * Format graceful shutdown
 * @param {string} signal - Shutdown signal
 */
function formatGracefulShutdown(signal) {
  console.log(`\nGRACEFUL SHUTDOWN INITIATED`);
  console.log(`   Signal: ${signal}`);
  console.log(`   Time: ${formatTimestamp()}`);
  console.log(`   Shutting down gracefully...`);
}

/**
 * Format cookie parsing events
 * @param {Object} meta - Additional metadata
 */
function formatCookieParsing(meta = {}) {
  const count = meta.count || 0;
  
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`COOKIE PARSING`);
  console.log(`   Message: Cookies parsed and attached to request`);
  console.log(`   Count: ${count}`);
  console.log(`   Time: ${formatTimestamp()}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
}

/**
 * Format CSRF token events
 * @param {string} action - Token action (generated, validated)
 * @param {Object} meta - Additional metadata
 */
function formatCSRFToken(action, meta = {}) {
  const requestId = meta.requestId || 'system';
  
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`CSRF TOKEN`);
  console.log(`   Action: ${action}`);
  console.log(`   Request ID: ${requestId}`);
  console.log(`   Time: ${formatTimestamp()}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
}

/**
 * Format security clearance events
 * @param {string} event - Security event
 * @param {Object} meta - Additional metadata
 */
function formatSecurityClearance(event, meta = {}) {
  const user = meta.user || 'unknown';
  const ip = meta.ip || 'unknown';
  
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`SECURITY CLEARANCE`);
  console.log(`   Event: ${event}`);
  console.log(`   User: ${user}`);
  console.log(`   IP: ${ip}`);
  console.log(`   Time: ${formatTimestamp()}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
}

/**
 * Format session events
 * @param {string} action - Session action
 * @param {Object} meta - Additional metadata
 */
function formatSessionEvent(action, meta = {}) {
  const requestId = meta.requestId || 'system';
  
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`SESSION EVENT`);
  console.log(`   Action: ${action}`);
  console.log(`   Request ID: ${requestId}`);
  console.log(`   Time: ${formatTimestamp()}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
}

/**
 * Format warning messages
 * @param {string} message - Warning message
 * @param {Object} meta - Additional metadata
 */
function formatWarning(message, meta = {}) {
  const requestId = meta.requestId || 'system';
  
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`WARNING`);
  console.log(`   Message: ${message}`);
  console.log(`   Request ID: ${requestId}`);
  console.log(`   Time: ${formatTimestamp()}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
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
  formatCookieParsing,
  formatCSRFToken,
  formatSecurityClearance,
  formatSessionEvent,
  formatWarning
};
