// File: server/knex/migrations/003_create_submissions_table.js
// Description: Create submissions table for database-backed text submissions
// Purpose: Enables persistent storage of text submissions with transaction support
// Notes: Uses UUID primary key and timezone-aware timestamps for Supabase compatibility

/**
 * WHAT:
 * We create a submissions table for storing text submissions with proper transaction support.
 *
 * WHY:
 * Database-backed submissions enable persistent storage and proper transaction handling.
 * This demonstrates clean transaction patterns for data integrity.
 *
 * HOW:
 * We create a table with UUID primary key, text content, metadata, and proper timestamps.
 */

exports.up = function(knex) {
  return knex.schema.createTable('submissions', function(table) {
    // Primary key - System-generated unique submission ID
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    
    // Submission content
    table.text('text').notNullable();
    table.integer('text_length').notNullable();
    
    // Metadata
    table.string('client_ip'); // Track client IP for security
    
    // Timestamps (timezone-aware)
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    
    // Indexes for performance
    table.index('created_at');
    table.index('client_ip');
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('submissions');
};
