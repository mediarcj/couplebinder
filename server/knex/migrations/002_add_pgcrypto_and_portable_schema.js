// File: server/knex/migrations/002_add_pgcrypto_and_portable_schema.js
// Description: Add pgcrypto extension and update schema for Supabase compatibility
// Purpose: Enable DB-side UUID generation and timezone-aware timestamps
// Notes: Makes schema portable between PostgreSQL and Supabase

/**
 * WHAT:
 * We add the pgcrypto extension and update the users table schema for Supabase compatibility.
 *
 * WHY:
 * Supabase requires pgcrypto extension for gen_random_uuid() function.
 * Using timestamptz ensures timezone-aware timestamps that work across different environments.
 *
 * HOW:
 * We enable the pgcrypto extension and alter the users table to use timestamptz columns.
 */

exports.up = function(knex) {
  return Promise.all([
    // Enable pgcrypto extension for UUID generation
    knex.raw('CREATE EXTENSION IF NOT EXISTS pgcrypto;'),
    
    // Update users table timestamps to be timezone-aware
    knex.schema.alterTable('users', function(table) {
      // Convert timestamp columns to timestamptz with proper defaults
      table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now()).alter();
      table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now()).alter();
    })
  ]);
};

exports.down = function(knex) {
  return Promise.all([
    // Revert timestamps back to regular timestamp (without timezone)
    knex.schema.alterTable('users', function(table) {
      table.timestamp('created_at').defaultTo(knex.fn.now()).alter();
      table.timestamp('updated_at').defaultTo(knex.fn.now()).alter();
    }),
    
    // Note: We don't drop pgcrypto extension as it might be used by other tables
    // and dropping extensions can affect other parts of the system
  ]);
};
