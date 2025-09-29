// File: server/knex/migrations/007_create_artifacts_table.js
// Description: Create artifacts table for generic content management
// Purpose: Enables flexible storage of any type of user-generated content
// Notes: Uses JSONB for flexible metadata and supports multiple artifact types

/**
 * WHAT:
 * We create a generic artifacts table for storing any type of user content.
 *
 * WHY:
 * This provides a flexible foundation that can be reused for different
 * applications without being tied to specific domain logic.
 *
 * HOW:
 * We use JSONB for flexible metadata storage and support multiple
 * artifact types through a type field.
 */

exports.up = function(knex) {
  return knex.schema.createTable('artifacts', function(table) {
    table.string('id', 255).primary().comment('Unique artifact identifier');
    table.string('type', 100).notNullable().comment('Type of artifact (text, file, image, etc.)');
    table.jsonb('data').notNullable().comment('Artifact content data');
    table.jsonb('metadata').notNullable().comment('Flexible metadata storage');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    
    // Indexes for efficient querying
    table.index(['type']);
    table.index(['created_at']);
    table.index(['type', 'created_at']);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('artifacts');
};
