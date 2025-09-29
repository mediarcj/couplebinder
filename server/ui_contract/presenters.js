// File: server/ui_contract/presenters.js
// Description: Presenter functions that build page models for UI rendering
// Purpose: Separates business logic from UI templates, enabling Next.js migration
// Notes: Each presenter returns a plain object that can be rendered by EJS or Next.js

/**
 * WHAT:
 * We create presenter functions that build page models containing only display data.
 *
 * WHY:
 * This separates business logic from UI templates, making it easy to migrate to Next.js.
 * Both EJS and Next.js can render the same page models.
 *
 * HOW:
 * Each presenter function takes request context and returns a plain object with display data.
 */

const { usersRepo } = require('../db/repo');

/**
 * Build page model for home page
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Object} Page model for home page
 */
function buildHomePageModel(req, res) {
  const clientIP = req.ip || req.connection.remoteAddress;
  
  return {
    page: {
      title: 'Detechify',
      description: 'Building the future of tech detection',
      type: 'home'
    },
    user: {
      isAuthenticated: req.session.isAuthenticated || false,
      email: req.session.userEmail || null,
      id: req.session.userId || null
    },
    // UI instructions from backend - frontend must follow these rules
    ui_instructions: {
      allowed_actions: req.session.isAuthenticated ? 
        ['submit_text', 'view_dashboard', 'view_submissions', 'logout'] : 
        ['submit_text', 'login', 'view_public_content'],
      
      input_limits: {
        text_min: 20,
        text_max: 5000,
        title_max: 140,
        email_max: 40,
        password_min: 8,
        password_max: 50
      },
      
      feature_flags: {
        text_submission: true,
        dashboard_access: req.session.isAuthenticated || false,
        admin_panel: false, // Will be set based on user role
        advanced_mode: false
      },
      
      form_schema: {
        text: {
          required: true,
          min: 20,
          max: 5000,
          placeholder: 'Enter your text here (minimum 20 characters, maximum 5000 characters)...'
        }
      },
      
      cooldowns: {
        text_submission: 0, // No cooldown for text submission
        login_attempts: 0   // Will be managed by rate limiting
      },
      
      security: {
        csrf_token: res.locals.csrfToken || '',
        nonce: res.locals.nonce || '',
        content_security_policy: 'strict'
      },
      
      display_rules: {
        show_login_modal: req.query.login === 'true',
        show_user_menu: req.session.isAuthenticated || false,
        show_submission_form: true,
        show_public_submissions: true
      }
    },
    // Legacy fields for backward compatibility
    features: {
      textLimits: {
        min: 20,
        max: 5000
      },
      maxSubmissions: 10
    },
    ui: {
      showLoginModal: req.query.login === 'true',
      csrfToken: res.locals.csrfToken || ''
    }
  };
}

/**
 * Build page model for dashboard page
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Object} Page model for dashboard page
 */
async function buildDashboardPageModel(req, res) {
  let user = null;
  
  if (req.session.userId) {
    try {
      const { db } = require('../db/connection');
      user = await usersRepo.findById(db, req.session.userId);
      if (user) {
        // Remove sensitive data
        delete user.password;
      }
    } catch (error) {
      console.error('Error fetching user for dashboard:', error);
    }
  }

  const isAuthenticated = req.session.isAuthenticated || false;
  const isAdmin = user && user.user_role === 'admin';

  return {
    page: {
      title: 'Dashboard - Detechify',
      description: 'User dashboard and controls',
      type: 'dashboard'
    },
    user: {
      isAuthenticated: isAuthenticated,
      email: req.session.userEmail || null,
      id: req.session.userId || null,
      profile: user
    },
    // UI instructions from backend - frontend must follow these rules
    ui_instructions: {
      allowed_actions: isAuthenticated ? 
        ['view_profile', 'edit_profile', 'view_submissions', 'submit_text', 'logout'] : 
        ['login', 'view_public_content'],
      
      input_limits: {
        text_min: 20,
        text_max: 5000,
        profile_name_max: 100
      },
      
      feature_flags: {
        text_submission: true,
        profile_editing: isAuthenticated || false,
        admin_panel: isAdmin || false,
        user_management: isAdmin || false,
        advanced_analytics: isAdmin || false
      },
      
      form_schema: {
        profile: {
          first_name: { required: true, max: 50 },
          last_name: { required: true, max: 50 },
          email: { required: true, type: 'email' }
        },
        text: {
          required: true,
          min: 20,
          max: 5000
        }
      },
      
      cooldowns: {
        profile_update: 0,
        text_submission: 0
      },
      
      security: {
        csrf_token: res.locals.csrfToken || '',
        nonce: res.locals.nonce || '',
        content_security_policy: 'strict'
      },
      
      display_rules: {
        show_admin_menu: isAdmin || false,
        show_user_menu: isAuthenticated || false,
        show_submission_form: true,
        show_profile_edit: isAuthenticated || false,
        show_analytics: isAdmin || false
      }
    },
    // Legacy fields for backward compatibility
    ui: {
      csrfToken: res.locals.csrfToken || ''
    }
  };
}

/**
 * Build page model for user profile page
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {string} userId - User ID from route parameter
 * @returns {Object} Page model for user profile page
 */
async function buildUserProfilePageModel(req, res, userId) {
  let user = null;
  
  try {
    const { db } = require('../db/connection');
    user = await usersRepo.findById(db, userId);
    if (user) {
      // Remove sensitive data
      delete user.password;
    }
  } catch (error) {
    console.error('Error fetching user profile:', error);
  }

  return {
    page: {
      title: `User Profile${user ? ` - ${user.first_name} ${user.last_name}` : ''}`,
      description: 'User profile information',
      type: 'user_profile'
    },
    user: {
      isAuthenticated: req.session.isAuthenticated || false,
      email: req.session.userEmail || null,
      id: req.session.userId || null
    },
    profile: {
      user: user,
      isOwnProfile: req.session.userId === userId
    },
    ui: {
      csrfToken: res.locals.csrfToken || ''
    }
  };
}

/**
 * Build page model for settings page
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Object} Page model for settings page
 */
async function buildSettingsPageModel(req, res) {
  let user = null;
  
  if (req.session.userId) {
    try {
      const { db } = require('../db/connection');
      user = await usersRepo.findById(db, req.session.userId);
      if (user) {
        // Remove sensitive data
        delete user.password;
      }
    } catch (error) {
      console.error('Error fetching user for settings:', error);
    }
  }

  return {
    page: {
      title: 'Settings - Detechify',
      description: 'User settings and preferences',
      type: 'settings'
    },
    user: {
      isAuthenticated: req.session.isAuthenticated || false,
      email: req.session.userEmail || null,
      id: req.session.userId || null,
      profile: user
    },
    settings: {
      textLimits: {
        min: 20,
        max: 5000
      },
      maxSubmissions: 10
    },
    ui: {
      csrfToken: res.locals.csrfToken || ''
    }
  };
}

/**
 * Build page model for error page
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {number} statusCode - HTTP status code
 * @param {string} errorMessage - Error message
 * @returns {Object} Page model for error page
 */
function buildErrorPageModel(req, res, statusCode, errorMessage) {
  return {
    page: {
      title: `Error ${statusCode} - Detechify`,
      description: 'An error occurred',
      type: 'error'
    },
    user: {
      isAuthenticated: req.session.isAuthenticated || false,
      email: req.session.userEmail || null,
      id: req.session.userId || null
    },
    error: {
      code: statusCode,
      message: errorMessage,
      requestId: req.requestId
    },
    ui: {
      csrfToken: res.locals.csrfToken || ''
    }
  };
}

module.exports = {
  buildHomePageModel,
  buildDashboardPageModel,
  buildUserProfilePageModel,
  buildSettingsPageModel,
  buildErrorPageModel
};
