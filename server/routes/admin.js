// File: server/routes/admin.js
// Description: Admin-only routes for user management and system administration
// Purpose: Provides administrative access to user data and system functions
// Notes: All routes require admin role verification
//
// AUTH REQUIREMENTS:
// - All routes: REQUIRES AUTH + ADMIN ROLE

const express = require('express');
// I am saving `router` here so the nearby steps can reuse the same value without rebuilding it each time.
const router = express.Router();
// I am loading `../utils/supabaseClient` into `supabaseAdmin` so this file can reuse that dependency below.
const { supabaseAdmin } = require('../utils/supabaseClient');
// I am loading `../utils/logger` into `logger` so this file can reuse that dependency below.
const logger = require('../utils/logger');
// I am loading `../utils/authz` into `assertUser` so this file can reuse that dependency below.
const { assertUser } = require('../utils/authz');

/**
 * WHAT:
 * We provide admin-only endpoints for user management and system administration.
 *
 * WHY:
 * Administrative functions need elevated privileges and should be clearly separated
 * from regular user operations for security and clarity.
 *
 * HOW:
 * All routes require admin role verification and use Supabase Admin API.
 */

/**
 * Admin role verification middleware
 * Ensures only users with admin role can access these endpoints
 */
function requireAdmin(req, res, next) {
  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // Check if user is authenticated
    const user = assertUser(req);
    
    // Check if user has admin role
    if (!user.roles || !user.roles.includes('admin')) {
      // This return sends the completed value or response back to the code that called this function.
      return res.status(403).json({
        // I am keeping the `success` field in this object so the receiving code can read that value by its expected name.
        success: false,
        // I am keeping the `message` field in this object so the receiving code can read that value by its expected name.
        message: 'Admin privileges required'
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      });
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    
    // I am calling this helper here so the current workflow performs this step before it moves on.
    next();
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (error) {
    // assertUser throws 401 if not authenticated
    return res.status(401).json({
      // I am keeping the `success` field in this object so the receiving code can read that value by its expected name.
      success: false,
      // I am keeping the `message` field in this object so the receiving code can read that value by its expected name.
      message: 'Authentication required'
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// Apply admin middleware to all routes
router.use(requireAdmin);

/**
 * GET /api/admin/users/:id
 * Admin-only user lookup by ID
 * Provides full user data access for administrative purposes
 */
router.get('/users/:id', async (req, res) => {
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
    const { data: { user }, error } = await supabaseAdmin.auth.admin.getUserById(id);
    
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (error) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      logger.error({
        // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
        event: 'admin.user_lookup.failed',
        // I am keeping the `userId` field in this object so the receiving code can read that value by its expected name.
        userId: id,
        // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
        error: error.message,
        // I am keeping the `requestId` field in this object so the receiving code can read that value by its expected name.
        requestId: req.requestId
      // I am keeping this line here because the surrounding admin.js workflow expects this value or operation before it continues.
      }, 'Admin user lookup failed');
      // This return sends the completed value or response back to the code that called this function.
      return res.status(500).json({
        // I am keeping the `success` field in this object so the receiving code can read that value by its expected name.
        success: false,
        // I am keeping the `message` field in this object so the receiving code can read that value by its expected name.
        message: 'Failed to retrieve user data'
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
    
    // Return full user data (admin access)
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
        user_metadata: user.user_metadata,
        // I am keeping the `raw_app_meta_data` field in this object so the receiving code can read that value by its expected name.
        raw_app_meta_data: user.raw_app_meta_data,
        // I am keeping the `raw_user_meta_data` field in this object so the receiving code can read that value by its expected name.
        raw_user_meta_data: user.raw_user_meta_data
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
    
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (error) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.error({
      // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
      event: 'admin.user_lookup.exception',
      // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
      error: error.message,
      // I am keeping the `requestId` field in this object so the receiving code can read that value by its expected name.
      requestId: req.requestId
    // I am keeping this line here because the surrounding admin.js workflow expects this value or operation before it continues.
    }, 'Admin user lookup exception');
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

/**
 * GET /api/admin/users
 * Admin-only user list (paginated)
 * Provides administrative user overview
 */
router.get('/users', async (req, res) => {
  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // I am saving `page` here so the nearby steps can reuse the same value without rebuilding it each time.
    const page = parseInt(req.query.page) || 1;
    const perPage = Math.min(parseInt(req.query.per_page) || 20, 100); // Max 100 per page
    
    // Get users from Supabase Auth using admin client
    const { data: { users }, error } = await supabaseAdmin.auth.admin.listUsers({
      // I am keeping this line here because the surrounding admin.js workflow expects this value or operation before it continues.
      page,
      // I am keeping this line here because the surrounding admin.js workflow expects this value or operation before it continues.
      perPage
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
    
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (error) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      logger.error({
        // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
        event: 'admin.user_list.failed',
        // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
        error: error.message,
        // I am keeping the `requestId` field in this object so the receiving code can read that value by its expected name.
        requestId: req.requestId
      // I am keeping this line here because the surrounding admin.js workflow expects this value or operation before it continues.
      }, 'Admin user list query failed');
      // This return sends the completed value or response back to the code that called this function.
      return res.status(500).json({
        // I am keeping the `success` field in this object so the receiving code can read that value by its expected name.
        success: false,
        // I am keeping the `message` field in this object so the receiving code can read that value by its expected name.
        message: 'Failed to retrieve user list'
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      });
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    
    // Return sanitized user list
    const sanitizedUsers = users.map(user => ({
      // I am keeping the `id` field in this object so the receiving code can read that value by its expected name.
      id: user.id,
      // I am keeping the `email` field in this object so the receiving code can read that value by its expected name.
      email: user.email,
      // I am keeping the `email_confirmed_at` field in this object so the receiving code can read that value by its expected name.
      email_confirmed_at: user.email_confirmed_at,
      // I am keeping the `created_at` field in this object so the receiving code can read that value by its expected name.
      created_at: user.created_at,
      // I am keeping the `last_sign_in_at` field in this object so the receiving code can read that value by its expected name.
      last_sign_in_at: user.last_sign_in_at
    // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
    }));
    
    // I am building or sending the Express response here with the status, data, or page already chosen by this route.
    res.json({
      // I am keeping the `success` field in this object so the receiving code can read that value by its expected name.
      success: true,
      // I am keeping the `users` field in this object so the receiving code can read that value by its expected name.
      users: sanitizedUsers,
      // I am keeping the `pagination` field in this object so the receiving code can read that value by its expected name.
      pagination: {
        // I am keeping this line here because the surrounding admin.js workflow expects this value or operation before it continues.
        page,
        // I am keeping the `per_page` field in this object so the receiving code can read that value by its expected name.
        per_page: perPage,
        // I am keeping the `count` field in this object so the receiving code can read that value by its expected name.
        count: sanitizedUsers.length
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
    
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (error) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.error({
      // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
      event: 'admin.user_list.exception',
      // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
      error: error.message,
      // I am keeping the `requestId` field in this object so the receiving code can read that value by its expected name.
      requestId: req.requestId
    // I am keeping this line here because the surrounding admin.js workflow expects this value or operation before it continues.
    }, 'Admin user list exception');
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

/**
 * GET /api/admin/system/status
 * Admin-only system status endpoint
 * Provides administrative system information
 */
router.get('/system/status', async (req, res) => {
  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // Get basic system information
    const systemStatus = {
      // I am keeping the `server` field in this object so the receiving code can read that value by its expected name.
      server: {
        // I am keeping the `uptime` field in this object so the receiving code can read that value by its expected name.
        uptime: process.uptime(),
        // I am keeping the `memory` field in this object so the receiving code can read that value by its expected name.
        memory: process.memoryUsage(),
        // I am keeping the `nodeVersion` field in this object so the receiving code can read that value by its expected name.
        nodeVersion: process.version,
        // I am keeping the `platform` field in this object so the receiving code can read that value by its expected name.
        platform: process.platform
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      },
      // I am keeping the `database` field in this object so the receiving code can read that value by its expected name.
      database: {
        // I am keeping the `status` field in this object so the receiving code can read that value by its expected name.
        status: 'connected',
        // I am keeping the `type` field in this object so the receiving code can read that value by its expected name.
        type: 'Supabase'
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      },
      // I am keeping the `auth` field in this object so the receiving code can read that value by its expected name.
      auth: {
        // I am keeping the `provider` field in this object so the receiving code can read that value by its expected name.
        provider: 'Supabase',
        // I am keeping the `status` field in this object so the receiving code can read that value by its expected name.
        status: 'active'
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    };
    
    // I am building or sending the Express response here with the status, data, or page already chosen by this route.
    res.json({
      // I am keeping the `success` field in this object so the receiving code can read that value by its expected name.
      success: true,
      // I am keeping the `status` field in this object so the receiving code can read that value by its expected name.
      status: systemStatus,
      // I am keeping the `timestamp` field in this object so the receiving code can read that value by its expected name.
      timestamp: new Date().toISOString()
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
    
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (error) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.error({
      // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
      event: 'admin.system_status.exception',
      // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
      error: error.message,
      // I am keeping the `requestId` field in this object so the receiving code can read that value by its expected name.
      requestId: req.requestId
    // I am keeping this line here because the surrounding admin.js workflow expects this value or operation before it continues.
    }, 'Admin system status exception');
    // I am building or sending the Express response here with the status, data, or page already chosen by this route.
    res.status(500).json({
      // I am keeping the `success` field in this object so the receiving code can read that value by its expected name.
      success: false,
      // I am keeping the `message` field in this object so the receiving code can read that value by its expected name.
      message: 'Failed to retrieve system status'
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
});

// I am exporting this value here so another module can deliberately reuse the completed piece from admin.js.
module.exports = router;
