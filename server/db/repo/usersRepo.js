// File: server/db/repo/usersRepo.js
// Description: User repository for database operations
// Purpose: Centralized user data access layer, enabling easy migration to Supabase
// Notes: All user database operations go through this repository

const logger = require('../../utils/logger');

/**
 * WHAT:
 * We provide a clean interface for user database operations that can be easily swapped for Supabase.
 *
 * WHY:
 * Having all user operations in one place makes migration to Supabase trivial.
 * We maintain the same interface while allowing future implementation changes.
 *
 * HOW:
 * We export functions that accept either a transaction or database instance.
 * This allows for both transactional and non-transactional operations.
 */

/**
 * Find user by ID
 * @param {Object} trxOrDb - Knex transaction or database instance
 * @param {string} id - User ID
 * @returns {Promise<Object|null>} User object or null if not found
 */
async function findById(trxOrDb, id) {
  const startTime = Date.now();
  try {
    const user = await trxOrDb('users')
      .where({ id })
      .first();
    
    logger.database('SELECT', 'users', {
      requestId: 'system',
      duration: Date.now() - startTime
    });
    
    return user || null;
  } catch (error) {
    logger.error('Database error finding user by ID', {
      requestId: 'system',
      operation: 'SELECT',
      table: 'users',
      error: error.message
    });
    throw error;
  }
}

/**
 * Find user by email
 * @param {Object} trxOrDb - Knex transaction or database instance
 * @param {string} email - User email
 * @returns {Promise<Object|null>} User object or null if not found
 */
async function findByEmail(trxOrDb, email) {
  try {
    const user = await trxOrDb('users')
      .where({ email })
      .first();
    return user || null;
  } catch (error) {
    console.error('Error finding user by email:', error);
    throw error;
  }
}

/**
 * Create a new user
 * @param {Object} trxOrDb - Knex transaction or database instance
 * @param {Object} userData - User data to insert
 * @returns {Promise<Object>} Created user object
 */
async function create(trxOrDb, userData) {
  const startTime = Date.now();
  try {
    const [user] = await trxOrDb('users')
      .insert(userData)
      .returning('*');
    
    logger.database('INSERT', 'users', {
      requestId: 'system',
      duration: Date.now() - startTime
    });
    
    return user;
  } catch (error) {
    logger.error('Database error creating user', {
      requestId: 'system',
      operation: 'INSERT',
      table: 'users',
      error: error.message
    });
    throw error;
  }
}

/**
 * Create a new user with validation and transaction support
 * @param {Object} trxOrDb - Knex transaction or database instance
 * @param {Object} userData - User data to insert
 * @returns {Promise<Object>} Created user object
 */
async function createWithValidation(trxOrDb, userData) {
  try {
    // Validate required fields
    if (!userData.email || !userData.password || !userData.first_name || !userData.last_name) {
      throw new Error('Missing required fields: email, password, first_name, last_name');
    }

    // Check if email already exists
    const existingUser = await findByEmail(trxOrDb, userData.email);
    if (existingUser) {
      throw new Error('Email already exists');
    }

    // Create user with transaction
    const user = await create(trxOrDb, userData);
    
    // Return user without password
    const { password: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  } catch (error) {
    console.error('Error creating user with validation:', error);
    throw error;
  }
}

/**
 * Update user by ID
 * @param {Object} trxOrDb - Knex transaction or database instance
 * @param {string} id - User ID
 * @param {Object} updateData - Data to update
 * @returns {Promise<Object>} Updated user object
 */
async function updateById(trxOrDb, id, updateData) {
  try {
    const [user] = await trxOrDb('users')
      .where({ id })
      .update(updateData)
      .returning('*');
    return user;
  } catch (error) {
    console.error('Error updating user:', error);
    throw error;
  }
}

module.exports = {
  findById,
  findByEmail,
  create,
  createWithValidation,
  updateById
};
