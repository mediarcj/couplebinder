// File: server/knex/migrations/001_create_users_table.js
// Description: Migration to create users table with complete profile system
// Purpose: Establishes user authentication and profile data structure
// Notes: Includes UUID primary key, comprehensive validation fields, and proper constraints

exports.up = function(knex) {
  return knex.schema.createTable('users', function(table) {
    // Primary key - System-generated unique user ID
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));

    // Auth credentials
    table.string('email').notNullable().unique(); // Email as username for authentication
    table.string('password').notNullable(); // Hashed password

    // Basic required profile info
    table.string('first_name').notNullable();
    table.string('last_name').notNullable();

    // Optional profile fields with validation constraints
    table.string('phone'); // Format: country code - area code - phone number (9-999-999-9999)
    table.date('birthday'); // Format: MM/DD/YYYY (01/30/2026)
    table.string('gender'); // 'male', 'female', or blank (defaults to blank)
    table.string('language').defaultTo('English');
    table.string('city_province'); // City or province for foreign countries
    table.string('country');
    table.string('social_media1');
    table.string('social_media2');
    table.string('social_media3');
    table.string('relationship_status'); // 'single', 'married', or blank (defaults to blank)
    table.string('job'); // 'unemployed', 'employed', or blank (defaults to blank)
    table.string('hobbies');
    table.string('music');
    table.string('fav_food');
    table.string('profile_title');
    table.text('profile_description');
    table.string('account_privacy').defaultTo('public'); // 'public' or 'private' (defaults to public)
    table.string('user_role').defaultTo('user'); // 'user', 'admin', or 'ceo' (defaults to user)

    // Timestamps
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    // Indexes for performance
    table.index('email');
    table.index('created_at');
    table.index('user_role');
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('users');
};
