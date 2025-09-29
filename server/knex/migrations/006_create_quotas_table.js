// File: server/knex/migrations/006_create_quotas_table.js
// Description: Create quotas table for race-condition-safe quota management
// Purpose: Enables atomic quota checking and consumption to prevent concurrent bypass
// Notes: Uses unique constraint and proper indexing for efficient quota operations

/**
 * WHAT:
 * We create a quotas table for managing user limits with race condition protection.
 *
 * WHY:
 * Quota limits need to be enforced atomically to prevent multiple concurrent
 * requests from bypassing limits simultaneously.
 *
 * HOW:
 * We use a unique constraint on user_id + quota_type and proper indexing
 * for efficient atomic operations with row locking.
 */

exports.up = function(knex) {
  return knex.schema.createTable('quotas', function(table) {
    table.increments('id').primary();
    table.string('user_id', 255).notNullable().comment('User ID or IP address for quota tracking');
    table.string('quota_type', 100).notNullable().comment('Type of quota (submissions, api_calls, etc.)');
    table.integer('limit').notNullable().comment('Maximum allowed quota');
    table.integer('used').notNullable().defaultTo(0).comment('Currently used quota');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    
    // Unique constraint to prevent duplicate quota entries
    table.unique(['user_id', 'quota_type']);
    
    // Index for efficient lookups
    table.index(['user_id', 'quota_type']);
    table.index(['quota_type']);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('quotas');
};
