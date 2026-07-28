// Description: Admin-only routes for user management and system administration
// Purpose: Provides administrative access to user data and system functions
// Notes: All routes require admin role verification
//
// AUTH REQUIREMENTS:
// - All routes: REQUIRES AUTH + ADMIN ROLE

const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../utils/supabaseClient');
const logger = require('../utils/logger');
const requireAdmin = require('../middleware/requireAdmin');

/**
 * We provide admin-only endpoints for user management and system administration.
 *
 * Administrative functions need elevated privileges and should be clearly separated
 * from regular user operations for security and clarity.
 *
 * All routes require admin role verification and use Supabase Admin API.
 */

// Apply admin middleware to all routes
router.use(requireAdmin);

/**
 * GET /api/admin/users/:id
 * Admin-only user lookup by ID
 * Provides full user data access for administrative purposes
 */
router.get('/users/:id', async (req, res) => {
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
    const { data: { user }, error } = await supabaseAdmin.auth.admin.getUserById(id);
    
    if (error) {
      logger.error({
        event: 'admin.user_lookup.failed',
        userId: id,
        error: error.message,
        requestId: req.requestId
      }, 'Admin user lookup failed');
      return res.status(500).json({
        success: false,
        message: 'Failed to retrieve user data'
      });
    }
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Return full user data (admin access)
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
        user_metadata: user.user_metadata,
        raw_app_meta_data: user.raw_app_meta_data,
        raw_user_meta_data: user.raw_user_meta_data
      }
    });
    
  } catch (error) {
    logger.error({
      event: 'admin.user_lookup.exception',
      error: error.message,
      requestId: req.requestId
    }, 'Admin user lookup exception');
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

/**
 * GET /api/admin/users
 * Admin-only user list (paginated)
 * Provides administrative user overview
 */
router.get('/users', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const perPage = Math.min(parseInt(req.query.per_page) || 20, 100); // Max 100 per page
    
    // Get users from Supabase Auth using admin client
    const { data: { users }, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage
    });
    
    if (error) {
      logger.error({
        event: 'admin.user_list.failed',
        error: error.message,
        requestId: req.requestId
      }, 'Admin user list query failed');
      return res.status(500).json({
        success: false,
        message: 'Failed to retrieve user list'
      });
    }
    
    // Return sanitized user list
    const sanitizedUsers = users.map(user => ({
      id: user.id,
      email: user.email,
      email_confirmed_at: user.email_confirmed_at,
      created_at: user.created_at,
      last_sign_in_at: user.last_sign_in_at
    }));
    
    res.json({
      success: true,
      users: sanitizedUsers,
      pagination: {
        page,
        per_page: perPage,
        count: sanitizedUsers.length
      }
    });
    
  } catch (error) {
    logger.error({
      event: 'admin.user_list.exception',
      error: error.message,
      requestId: req.requestId
    }, 'Admin user list exception');
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

/**
 * GET /api/admin/system/status
 * Admin-only system status endpoint
 * Provides administrative system information
 */
router.get('/system/status', async (req, res) => {
  try {
    // Get basic system information
    const systemStatus = {
      server: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        nodeVersion: process.version,
        platform: process.platform
      },
      database: {
        status: 'connected',
        type: 'Supabase'
      },
      auth: {
        provider: 'Supabase',
        status: 'active'
      }
    };
    
    res.json({
      success: true,
      status: systemStatus,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error({
      event: 'admin.system_status.exception',
      error: error.message,
      requestId: req.requestId
    }, 'Admin system status exception');
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve system status'
    });
  }
});

module.exports = router;
