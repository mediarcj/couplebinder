// File: server/routes/users.js
// Description: User data retrieval from Supabase Auth
// Purpose: Provides secure user profile access with ownership protection
// Notes: Uses Supabase Admin API for user data retrieval
//
// AUTH REQUIREMENTS:
// - GET /:id: REQUIRES AUTH + OWNERSHIP - reads user profiles

const express = require('express');
const router = express.Router();
// requireAuth is applied globally to /api/users routes in zorvalon.js
const { requireOwner } = require('../middleware/requireOwner');
const { supabaseAdmin } = require('../utils/supabaseClient');
// CSRF protection is handled globally by csrfLite middleware

/**
 * WHAT:
 * We provide user data retrieval from Supabase Auth.
 *
 * WHY:
 * User management is handled by Supabase Auth, so we only need to retrieve user data.
 * This ensures consistency with the authentication system.
 *
 * HOW:
 * We use Supabase Admin API to retrieve user information securely.
 */

/**
 * GET /api/users/:id
 * Get user by ID from Supabase
 * Demonstrates Supabase user data retrieval
 * SECURITY: requireOwner ensures users can only access their own profile
 */
router.get('/:id', requireOwner, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Validate UUID format
    if (!id || typeof id !== 'string' || id.length !== 36) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID format'
      });
    }
    
    // Get user from Supabase Auth using admin client
    if (!supabaseAdmin) {
      return res.status(500).json({
        success: false,
        message: 'Service configuration error'
      });
    }
    
    const { data: { user }, error } = await supabaseAdmin.auth.admin.getUserById(id);
    
    if (error) {
      console.error('Supabase user retrieval error:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Return user data (Supabase already excludes sensitive fields)
    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        email_confirmed_at: user.email_confirmed_at,
        phone: user.phone,
        created_at: user.created_at,
        updated_at: user.updated_at,
        last_sign_in_at: user.last_sign_in_at,
        app_metadata: user.app_metadata,
        user_metadata: user.user_metadata
      }
    });
    
  } catch (error) {
    console.error('User retrieval error:', error);
    
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

module.exports = router;