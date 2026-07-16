// File: server/routes/users.js
// Description: User data retrieval from Supabase Auth
// Purpose: Provides secure user profile access with ownership protection
// Notes: Uses Supabase Admin API for user data retrieval
//
// AUTH REQUIREMENTS:
// - GET /:id: REQUIRES AUTH + OWNERSHIP - reads user profiles

const express = require('express');
// I am saving `router` here so the nearby steps can reuse the same value without rebuilding it each time.
const router = express.Router();
// requireAuth is applied globally to /api/users routes in zorvalon.js
const { requireOwner } = require('../middleware/requireOwner');
// I am loading `../utils/supabaseClient` into `supabaseAdmin` so this file can reuse that dependency below.
const { supabaseAdmin } = require('../utils/supabaseClient');
// I am loading `../utils/logger` into `logger` so this file can reuse that dependency below.
const logger = require('../utils/logger');
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
  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // I am saving `id` here so the nearby steps can reuse the same value without rebuilding it each time.
    const { id } = req.params;
    
    // Validate UUID format
    if (!id || typeof id !== 'string' || id.length !== 36) {
      // This return sends the completed value or response back to the code that called this function.
      return res.status(400).json({
        // I am keeping the `success` field in this object so the receiving code can read that value by its expected name.
        success: false,
        // I am keeping the `message` field in this object so the receiving code can read that value by its expected name.
        message: 'Invalid user ID format'
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      });
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    
    // Get user from Supabase Auth using admin client
    if (!supabaseAdmin) {
      // This return sends the completed value or response back to the code that called this function.
      return res.status(500).json({
        // I am keeping the `success` field in this object so the receiving code can read that value by its expected name.
        success: false,
        // I am keeping the `message` field in this object so the receiving code can read that value by its expected name.
        message: 'Service configuration error'
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      });
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    
    // I am saving `data` here so the nearby steps can reuse the same value without rebuilding it each time.
    const { data: { user }, error } = await supabaseAdmin.auth.admin.getUserById(id);
    
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (error) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      logger.error({
        // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
        event: 'users.retrieval.failed',
        // I am keeping the `userId` field in this object so the receiving code can read that value by its expected name.
        userId: id,
        // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
        error: error.message,
        // I am keeping the `requestId` field in this object so the receiving code can read that value by its expected name.
        requestId: req.requestId
      // I am keeping this line here because the surrounding users.js workflow expects this value or operation before it continues.
      }, 'Supabase user retrieval failed');
      // This return sends the completed value or response back to the code that called this function.
      return res.status(500).json({
        // I am keeping the `success` field in this object so the receiving code can read that value by its expected name.
        success: false,
        // I am keeping the `message` field in this object so the receiving code can read that value by its expected name.
        message: 'Internal server error'
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      });
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!user) {
      // This return sends the completed value or response back to the code that called this function.
      return res.status(404).json({
        // I am keeping the `success` field in this object so the receiving code can read that value by its expected name.
        success: false,
        // I am keeping the `message` field in this object so the receiving code can read that value by its expected name.
        message: 'User not found'
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      });
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    
    // Return user data (Supabase already excludes sensitive fields)
    res.json({
      // I am keeping the `success` field in this object so the receiving code can read that value by its expected name.
      success: true,
      // I am keeping the `user` field in this object so the receiving code can read that value by its expected name.
      user: {
        // I am keeping the `id` field in this object so the receiving code can read that value by its expected name.
        id: user.id,
        // I am keeping the `email` field in this object so the receiving code can read that value by its expected name.
        email: user.email,
        // I am keeping the `email_confirmed_at` field in this object so the receiving code can read that value by its expected name.
        email_confirmed_at: user.email_confirmed_at,
        // I am keeping the `phone` field in this object so the receiving code can read that value by its expected name.
        phone: user.phone,
        // I am keeping the `created_at` field in this object so the receiving code can read that value by its expected name.
        created_at: user.created_at,
        // I am keeping the `updated_at` field in this object so the receiving code can read that value by its expected name.
        updated_at: user.updated_at,
        // I am keeping the `last_sign_in_at` field in this object so the receiving code can read that value by its expected name.
        last_sign_in_at: user.last_sign_in_at,
        // I am keeping the `app_metadata` field in this object so the receiving code can read that value by its expected name.
        app_metadata: user.app_metadata,
        // I am keeping the `user_metadata` field in this object so the receiving code can read that value by its expected name.
        user_metadata: user.user_metadata
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
    
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (error) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.error({
      // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
      event: 'users.retrieval.exception',
      // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
      error: error.message,
      // I am keeping the `requestId` field in this object so the receiving code can read that value by its expected name.
      requestId: req.requestId
    // I am keeping this line here because the surrounding users.js workflow expects this value or operation before it continues.
    }, 'User retrieval exception');
    
    // I am building or sending the Express response here with the status, data, or page already chosen by this route.
    res.status(500).json({
      // I am keeping the `success` field in this object so the receiving code can read that value by its expected name.
      success: false,
      // I am keeping the `message` field in this object so the receiving code can read that value by its expected name.
      message: 'Internal server error'
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
});

// I am exporting this value here so another module can deliberately reuse the completed piece from users.js.
module.exports = router;