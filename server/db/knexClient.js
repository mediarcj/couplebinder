// File: server/db/knexClient.js
// Description: Centralized Knex database client for Detechify
// Purpose: Single source of truth for database connections, enabling easy migration to Supabase
// Notes: Exports configured Knex instance for use across the application

const knex = require('knex');
const knexfile = require('../knexfile');
const { config } = require('../config');

/**
 * WHAT:
 * We create a centralized Knex database client that can be easily swapped for Supabase later.
 *
 * WHY:
 * Having a single database client instance makes migration to Supabase trivial.
 * All database operations go through this client, so we only need to change one file.
 *
 * HOW:
 * We export a configured Knex instance that repositories and other modules can import.
 * This maintains the same interface while allowing future implementation swaps.
 */

// Get environment-specific configuration
const dbConfig = knexfile[config.server.nodeEnv] || knexfile.development;

// Create and export the Knex instance
const knexClient = knex(dbConfig);

module.exports = knexClient;
