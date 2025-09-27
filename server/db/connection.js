// File: server/db/connection.js
// Description: Database connection module for Detechify
// Purpose: Provides Knex.js database connection with error handling and connection pooling
// Notes: Uses Knex.js for query building and migration management

const knex = require('knex');
const knexfile = require('../knexfile');
const { config } = require('../config');

// Get environment-specific configuration
const dbConfig = knexfile[config.server.nodeEnv] || knexfile.development;

// Create database connection using Knex
const db = knex(dbConfig);

// Test database connection
async function testConnection() {
  try {
    const result = await db.raw('SELECT NOW()');
    console.log('✅ Database connection successful');
    console.log(`📅 Database time: ${result.rows[0].now}`);
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    return false;
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Closing database connection...');
  await db.destroy();
  process.exit(0);
});

module.exports = { db, testConnection };
