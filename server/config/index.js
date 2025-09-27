// File: config/index.js
// Description: Centralized configuration management with validation
// Notes: Validates required environment variables and provides defaults

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Configuration schema with validation
const config = {
  // Server configuration
  server: {
    port: parseInt(process.env.PORT) || 3000,
    nodeEnv: process.env.NODE_ENV || 'development',
    host: process.env.HOST || '0.0.0.0'
  },

  // Database configuration (prepared for future use)
  database: {
    url: process.env.DATABASE_URL || null,
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    name: process.env.DB_NAME || 'detechify',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || null
  },

  // Security configuration (prepared for future use)
  security: {
    jwtSecret: process.env.JWT_SECRET || null,
    sessionSecret: process.env.SESSION_SECRET || null,
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS) || 12
  },

  // Rate limiting configuration
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000, // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX) || 100,
    message: 'Too many requests from this IP, please try again later.'
  },

  // Input validation limits
  limits: {
    textMaxLength: parseInt(process.env.TEXT_MAX_LENGTH) || 5000,
    textMinLength: parseInt(process.env.TEXT_MIN_LENGTH) || 20,
    maxSubmissions: parseInt(process.env.MAX_SUBMISSIONS) || 10
  }
};

// Validation function
function validateConfig() {
  const errors = [];

  // Validate server port
  if (config.server.port < 1 || config.server.port > 65535) {
    errors.push('PORT must be between 1 and 65535');
  }

  // Validate node environment
  const validEnvs = ['development', 'production', 'test'];
  if (!validEnvs.includes(config.server.nodeEnv)) {
    errors.push(`NODE_ENV must be one of: ${validEnvs.join(', ')}`);
  }

  // Validate rate limiting values
  if (config.rateLimit.windowMs < 1000) {
    errors.push('RATE_LIMIT_WINDOW_MS must be at least 1000ms');
  }

  if (config.rateLimit.max < 1) {
    errors.push('RATE_LIMIT_MAX must be at least 1');
  }

  // Validate input limits
  if (config.limits.textMaxLength < config.limits.textMinLength) {
    errors.push('TEXT_MAX_LENGTH must be greater than TEXT_MIN_LENGTH');
  }

  if (config.limits.textMinLength < 1) {
    errors.push('TEXT_MIN_LENGTH must be at least 1');
  }

  if (config.limits.maxSubmissions < 1) {
    errors.push('MAX_SUBMISSIONS must be at least 1');
  }

  return errors;
}

// Validate configuration on startup
const validationErrors = validateConfig();
if (validationErrors.length > 0) {
  console.error('Configuration validation failed:');
  validationErrors.forEach(error => console.error(`  - ${error}`));
  process.exit(1);
}

// Log configuration summary (without secrets)
function logConfigSummary() {
  console.log('Configuration loaded:');
  console.log(`  Server: ${config.server.host}:${config.server.port} (${config.server.nodeEnv})`);
  console.log(`  Rate limiting: ${config.rateLimit.max} requests per ${config.rateLimit.windowMs}ms`);
  console.log(`  Text limits: ${config.limits.textMinLength}-${config.limits.textMaxLength} chars`);
  console.log(`  Max submissions: ${config.limits.maxSubmissions}`);
  console.log(`  Database: ${config.database.url ? 'configured' : 'not configured'}`);
}

module.exports = {
  config,
  validateConfig,
  logConfigSummary
};
