// File: config/index.js
// Description: Centralized configuration management with validation
// Notes: Validates required environment variables and provides defaults

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Configuration schema with validation
const config = {
  // Server configuration
  server: {
    port: parseInt(process.env.PORT),
    nodeEnv: process.env.NODE_ENV,
    host: process.env.HOST
  },

  // Database configuration
  database: {
    url: process.env.DATABASE_URL,
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT),
    name: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD
  },

  // Security configuration
  security: {
    jwtSecret: process.env.JWT_SECRET,
    sessionSecret: process.env.SESSION_SECRET,
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS)
  },

  // Redis configuration
  redis: {
    host: process.env.REDIS_HOST,
    port: parseInt(process.env.REDIS_PORT)
  },

  // Rate limiting configuration
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS),
    max: parseInt(process.env.RATE_LIMIT_MAX),
    message: 'Too many requests from this IP, please try again later.'
  },

  // Input validation limits
  limits: {
    textMaxLength: parseInt(process.env.TEXT_MAX_LENGTH),
    textMinLength: parseInt(process.env.TEXT_MIN_LENGTH),
    maxSubmissions: parseInt(process.env.MAX_SUBMISSIONS)
  }
};

// Validation function
function validateConfig() {
  const errors = [];

  // Check required environment variables
  const requiredVars = [
    'PORT', 'NODE_ENV', 'HOST',
    'DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD',
    'REDIS_HOST', 'REDIS_PORT',
    'RATE_LIMIT_WINDOW_MS', 'RATE_LIMIT_MAX',
    'TEXT_MIN_LENGTH', 'TEXT_MAX_LENGTH', 'MAX_SUBMISSIONS'
  ];

  for (const varName of requiredVars) {
    if (!process.env[varName]) {
      errors.push(`${varName} environment variable is required`);
    }
  }

  // Validate server port
  if (config.server.port && (config.server.port < 1 || config.server.port > 65535)) {
    errors.push('PORT must be between 1 and 65535');
  }

  // Validate node environment
  const validEnvs = ['development', 'production', 'test'];
  if (config.server.nodeEnv && !validEnvs.includes(config.server.nodeEnv)) {
    errors.push(`NODE_ENV must be one of: ${validEnvs.join(', ')}`);
  }

  // Validate rate limiting values
  if (config.rateLimit.windowMs && config.rateLimit.windowMs < 1000) {
    errors.push('RATE_LIMIT_WINDOW_MS must be at least 1000ms');
  }

  if (config.rateLimit.max && config.rateLimit.max < 1) {
    errors.push('RATE_LIMIT_MAX must be at least 1');
  }

  // Validate input limits
  if (config.limits.textMaxLength && config.limits.textMinLength && 
      config.limits.textMaxLength < config.limits.textMinLength) {
    errors.push('TEXT_MAX_LENGTH must be greater than TEXT_MIN_LENGTH');
  }

  if (config.limits.textMinLength && config.limits.textMinLength < 1) {
    errors.push('TEXT_MIN_LENGTH must be at least 1');
  }

  if (config.limits.maxSubmissions && config.limits.maxSubmissions < 1) {
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
  console.log(`  Redis: ${config.redis.host}:${config.redis.port}`);
}

module.exports = {
  config,
  validateConfig,
  logConfigSummary
};
