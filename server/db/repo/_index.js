// File: server/db/repo/_index.js
// Description: Repository exports for database access layer
// Purpose: Centralized exports for all repositories, enabling easy migration to Supabase
// Notes: Single import point for all repository functions

/**
 * WHAT:
 * We export all repository functions from a single location for easy import and management.
 *
 * WHY:
 * Having a single import point makes it easier to swap implementations later.
 * All database access goes through this centralized export.
 *
 * HOW:
 * We import and re-export all repository functions, maintaining clean interfaces.
 */

const usersRepo = require('./usersRepo');

module.exports = {
  usersRepo
};
