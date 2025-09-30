// File: server/db/connection.js
// Description: Database connection module for Detechify
// Purpose: Provides Knex.js database connection with error handling and connection pooling
// Notes: Uses Knex.js for query building and migration management

const knex = require('knex');
const knexfile = require('../knexfile');
const { config } = require('../config');

/**
 * WHAT:
 * We create a strong database connection with good error handling and monitoring.
 *
 * WHY:
 * Database connectivity is critical for user authentication and data persistence.
 * We need to handle connection failures gracefully and provide detailed error information.
 *
 * HOW:
 * We use Knex.js with connection pooling, timeout handling, and graceful shutdown procedures.
 * Connection errors are logged with detailed context for debugging and monitoring.
 */

// Get environment-specific configuration
const dbConfig = knexfile[config.server.nodeEnv] || knexfile.development;

// Add connection pool error handling
const enhancedDbConfig = {
  ...dbConfig,
  pool: {
    ...dbConfig.pool,
    acquireTimeoutMillis: 30000,
    createTimeoutMillis: 30000,
    destroyTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    reapIntervalMillis: 1000,
    createRetryIntervalMillis: 200,
    propagateCreateError: false
  }
};

// Create database connection using Knex
const db = knex(enhancedDbConfig);

// Connection health status
let connectionHealthy = false;
let lastConnectionTest = null;

// Test database connection with detailed error handling
async function testConnection() {
  try {
    lastConnectionTest = new Date();
    const result = await db.raw('SELECT NOW()');
    
    if (result && result.rows && result.rows[0]) {
      connectionHealthy = true;
      console.log('Database connection successful');
      console.log(`Database time: ${result.rows[0].now}`);
      return true;
    } else {
      throw new Error('Invalid database response format');
    }
  } catch (error) {
    connectionHealthy = false;
    console.error('Database connection failed:', {
      message: error.message,
      code: error.code,
      timestamp: new Date().toISOString(),
      config: {
        host: typeof dbConfig.connection === 'string' ? 'Supabase' : dbConfig.connection?.host,
        port: typeof dbConfig.connection === 'string' ? '5432' : dbConfig.connection?.port,
        database: typeof dbConfig.connection === 'string' ? 'Supabase PostgreSQL' : dbConfig.connection?.database
      }
    });
    return false;
  }
}

// Get connection health status
function getConnectionStatus() {
  return {
    healthy: connectionHealthy,
    lastTest: lastConnectionTest,
    config: {
      host: typeof dbConfig.connection === 'string' ? 'Supabase' : dbConfig.connection?.host,
      port: typeof dbConfig.connection === 'string' ? '5432' : dbConfig.connection?.port,
      database: typeof dbConfig.connection === 'string' ? 'Supabase PostgreSQL' : dbConfig.connection?.database,
      pool: {
        min: dbConfig.pool?.min || 0,
        max: dbConfig.pool?.max || 10
      }
    }
  };
}

// Enhanced query wrapper with error handling
async function safeQuery(queryBuilder, context = 'unknown') {
  try {
    if (!connectionHealthy) {
      throw new Error('Database connection is not healthy');
    }
    
    const result = await queryBuilder;
    return { success: true, data: result };
  } catch (error) {
    console.error(`Database query error [${context}]:`, {
      message: error.message,
      code: error.code,
      timestamp: new Date().toISOString()
    });
    
    // Mark connection as unhealthy if it's a connection error
    if (error.code && ['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND'].includes(error.code)) {
      connectionHealthy = false;
    }
    
    return { 
      success: false, 
      error: {
        message: error.message,
        code: error.code,
        context: context
      }
    };
  }
}

// Graceful shutdown with proper error handling
process.on('SIGINT', async () => {
  console.log('Closing database connection...');
  try {
    await db.destroy();
    console.log('Database connection closed successfully');
  } catch (error) {
    console.error('Error closing database connection:', error.message);
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, closing database connection...');
  try {
    await db.destroy();
    console.log('Database connection closed successfully');
  } catch (error) {
    console.error('Error closing database connection:', error.message);
  }
  process.exit(0);
});

module.exports = { 
  db, 
  testConnection, 
  getConnectionStatus, 
  safeQuery 
};
