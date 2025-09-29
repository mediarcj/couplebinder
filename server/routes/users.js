// File: server/routes/users.js
// Description: Transactional user operations demonstrating clean write/read patterns
// Purpose: Shows proper transaction handling with rollback on error and commit on success
// Notes: Demonstrates transaction discipline for data integrity

const express = require('express');
const router = express.Router();
const { db } = require('../db/connection');
const { usersRepo } = require('../db/repo');
const { validateCSRF } = require('../middleware/csrf');

/**
 * WHAT:
 * We provide transactional user operations that demonstrate proper transaction handling.
 *
 * WHY:
 * Transactions ensure data integrity by either committing all changes or rolling back on any error.
 * This prevents partial updates and maintains database consistency.
 *
 * HOW:
 * We wrap operations in database transactions with proper error handling and rollback.
 */

/**
 * POST /api/users
 * Create a new user with transaction support
 * Demonstrates proper transaction handling with validation and rollback on error
 */
router.post('/', validateCSRF, async (req, res) => {
  let trx = null;
  
  try {
    // Start transaction
    trx = await db.transaction();
    
    // Extract and validate user data
    const { email, password, first_name, last_name, phone, user_role } = req.body;
    
    // Server-side validation
    if (!email || !password || !first_name || !last_name) {
      await trx.rollback();
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: email, password, first_name, last_name'
      });
    }
    
    // Prepare user data
    const userData = {
      email: email.toLowerCase().trim(),
      password: password, // In production, this would be hashed
      first_name: first_name.trim(),
      last_name: last_name.trim(),
      phone: phone || null,
      user_role: user_role || 'user'
    };
    
    // Create user within transaction
    const newUser = await usersRepo.createWithValidation(trx, userData);
    
    // Commit transaction
    await trx.commit();
    
    // Return success response
    res.status(201).json({
      success: true,
      message: 'User created successfully',
      user: newUser
    });
    
  } catch (error) {
    // Rollback transaction on any error
    if (trx) {
      await trx.rollback();
    }
    
    console.error('User creation error:', error);
    
    // Return appropriate error response
    if (error.message === 'Email already exists') {
      return res.status(409).json({
        success: false,
        message: 'Email already exists'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

/**
 * GET /api/users/:id
 * Get user by ID with transaction support
 * Demonstrates read operations within transactions
 */
router.get('/:id', async (req, res) => {
  let trx = null;
  
  try {
    // Start transaction for read consistency
    trx = await db.transaction();
    
    const { id } = req.params;
    
    // Validate UUID format
    if (!id || typeof id !== 'string' || id.length !== 36) {
      await trx.rollback();
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID format'
      });
    }
    
    // Find user within transaction
    const user = await usersRepo.findById(trx, id);
    
    if (!user) {
      await trx.rollback();
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Commit transaction
    await trx.commit();
    
    // Return user without password
    const { password: _, ...userWithoutPassword } = user;
    
    res.json({
      success: true,
      user: userWithoutPassword
    });
    
  } catch (error) {
    // Rollback transaction on any error
    if (trx) {
      await trx.rollback();
    }
    
    console.error('User retrieval error:', error);
    
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

module.exports = router;