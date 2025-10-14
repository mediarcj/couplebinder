// File: server/utils/redisClient.js
// Description: Redis client with improved connection management and error handling
// Purpose: Provides reliable Redis connections with automatic reconnection and structured logging
// Notes: Built as a universal foundation component for future applications

/**
 * WHAT:
 * We create a centralized Redis client with automatic reconnection and error handling.
 *
 * WHY:
 * Redis connections can fail and need reliable recovery. This provides robust connection management.
 *
 * HOW:
 * We create a Redis client with retry strategy, structured logging, and graceful error handling.
 */

const redis = require('redis');
const logger = require('./logger');
const { config } = require('../config');

// ============================================================
// SECTION: Environment Configuration
// Reads Redis configuration from environment or config
// ============================================================
const REDIS_CONFIG = {
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password
};

// ============================================================
// SECTION: Redis Client Initialization
// Creates a new Redis client with retry strategy and error handling
// ============================================================
const client = redis.createClient({
  socket: {
    host: REDIS_CONFIG.host,
    port: REDIS_CONFIG.port,
    connectTimeout: 5000,
    reconnectStrategy: (retries) => {
      logger.warn('Redis reconnect attempt', { retries });
      // Gradual backoff: wait longer for each retry (up to 2 seconds max)
      return Math.min(retries * 50, 2000);
    },
  },
  password: REDIS_CONFIG.password,
  lazyConnect: false // Connect immediately when connectRedis() is called
});

// ============================================================
// SECTION: Redis Event Bindings - Observability Layer
// ============================================================

/**
 * WHAT:
 * Set up event listeners for Redis connection lifecycle.
 * 
 * WHY:
 * We need visibility into Redis connection status for debugging and monitoring.
 * Proper logging helps diagnose connection issues in production.
 * 
 * HOW:
 * Listen to Redis client events and log them with structured data.
 * Use appropriate log levels (info for success, warn/error for issues).
 */

// Fired when Redis has successfully connected
client.on('connect', () => {
  logger.info('Redis connected', {
    host: REDIS_CONFIG.host,
    port: REDIS_CONFIG.port
  });
});

// Fired if Redis disconnects or cannot connect
client.on('error', (err) => {
  logger.error('Redis connection error', {
    message: err.message,
    code: err.code
  });
});

// Fired during a reconnect attempt
client.on('reconnecting', () => {
  logger.warn('Redis attempting to reconnect');
});

/**
 * WHAT:
 * Explicitly initialize the Redis connection.
 * 
 * WHY:
 * We want to control when Redis connects (during server boot).
 * Allows us to handle connection failures gracefully.
 * 
 * HOW:
 * Check if client is already connected to avoid duplicate connections.
 * Use async/await for proper error handling.
 * Throw errors during boot so server fails fast if Redis is required.
 * 
 * @returns {Promise<void>}
 * @throws {Error} If Redis connection fails
 */
async function connectRedis() {
  try {
    if (!client.isOpen) {
      logger.info('Redis initiating connection');
      await client.connect();
      logger.info('Redis connection established');
    } else {
      logger.info('Redis already connected');
    }
  } catch (err) {
    logger.error('Redis failed to connect', {
      message: err.message,
      code: err.code
    });
    throw err; // Fail loudly during boot if Redis is not accessible
  }
}

/**
 * WHAT:
 * Gracefully close the Redis connection.
 * 
 * WHY:
 * Proper cleanup during server shutdown prevents connection leaks.
 * Ensures data is flushed before closing.
 * 
 * HOW:
 * Use quit() instead of disconnect() for graceful shutdown.
 * Handle errors during disconnect (connection might already be closed).
 * 
 * @returns {Promise<void>}
 */
async function disconnectRedis() {
  try {
    if (client.isOpen) {
      await client.quit();
      logger.info('Redis connection closed');
    }
  } catch (err) {
    logger.error('Redis disconnect error', {
      message: err.message
    });
  }
}

// ============================================================
// EXPORTS
// Exposes the Redis client and connection management functions
// ============================================================
module.exports = {
  client,
  connectRedis,
  disconnectRedis
};
