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

// Removed usersRepo import - now using Supabase user data directly

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
      title: process.env.APP_NAME || 'Application',
      description: process.env.APP_DESCRIPTION || 'A modern web application',
      type: 'home'
    },
    user: {
      isAuthenticated: req.user?.id ? true : false || false,
      email: req.user?.email || null,
      id: req.user?.id || null
    },
    // UI instructions from backend - frontend must follow these rules
    ui_instructions: {
      allowed_actions: req.user?.id ? true : false ? 
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
        dashboard_access: req.user?.id ? true : false || false,
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
        show_user_menu: req.user?.id ? true : false || false,
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
    },
    app_info: {
      name: process.env.APP_NAME || 'Application',
      description: process.env.APP_DESCRIPTION || 'A modern web application',
      version: process.env.APP_VERSION || '1.0.0',
      environment: process.env.NODE_ENV || 'development'
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
  // Fetch complete user data from Supabase Admin API
  let user = null;
  
  if (req.user?.id) {
    try {
      const { supabaseAdmin } = require('../utils/supabaseClient');
      
      if (supabaseAdmin) {
        const { data: { user: userData }, error } = await supabaseAdmin.auth.admin.getUserById(req.user.id);
        
        if (!error && userData) {
          // Map Supabase user data to display format
          // Handle both old format (first_name/last_name) and new format (display_name)
          const firstName = userData.user_metadata?.first_name || '';
          const lastName = userData.user_metadata?.last_name || '';
          const displayName = userData.user_metadata?.display_name || 
                             (firstName && lastName ? `${firstName} ${lastName}` : firstName || lastName || userData.email?.split('@')[0] || 'User');
          
          user = {
            id: userData.id,
            email: userData.email,
            display_name: displayName,
            phone: userData.phone || '',
            created_at: userData.created_at,
            updated_at: userData.updated_at,
            last_sign_in_at: userData.last_sign_in_at,
            email_confirmed_at: userData.email_confirmed_at,
            providers: userData.app_metadata?.providers || ['email'],
            role: userData.role || 'authenticated'
          };
        }
      }
      
      // Fallback to JWT data if Supabase fetch fails
      if (!user) {
        // Handle both old format (first_name/last_name) and new format (display_name)
        const firstName = req.user.user_metadata?.first_name || '';
        const lastName = req.user.user_metadata?.last_name || '';
        const displayName = req.user.user_metadata?.display_name || 
                           (firstName && lastName ? `${firstName} ${lastName}` : firstName || lastName || req.user.email?.split('@')[0] || 'User');
        
        user = {
          id: req.user.id,
          email: req.user.email,
          display_name: displayName,
          phone: req.user.user_metadata?.phone || '',
          created_at: req.user.user_metadata?.created_at || new Date().toISOString(),
          updated_at: req.user.user_metadata?.updated_at || new Date().toISOString(),
          last_sign_in_at: req.user.user_metadata?.last_sign_in_at || new Date().toISOString(),
          email_confirmed_at: req.user.user_metadata?.email_confirmed_at || null,
          providers: req.user.app_metadata?.providers || ['email'],
          role: req.user.role || 'authenticated'
        };
      }
    } catch (error) {
      console.error('Error fetching user data from Supabase:', error.message);
      // Fallback to basic JWT data
      // Handle both old format (first_name/last_name) and new format (display_name)
      const firstName = req.user.user_metadata?.first_name || '';
      const lastName = req.user.user_metadata?.last_name || '';
      const displayName = req.user.user_metadata?.display_name || 
                         (firstName && lastName ? `${firstName} ${lastName}` : firstName || lastName || req.user.email?.split('@')[0] || 'User');
      
      user = {
        id: req.user.id,
        email: req.user.email,
        display_name: displayName,
        phone: '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_sign_in_at: new Date().toISOString(),
        email_confirmed_at: null,
        providers: ['email'],
        role: 'authenticated'
      };
    }
  }

  const isAuthenticated = req.user?.id ? true : false;
  const isAdmin = false; // Can be enhanced later with Supabase user metadata


  return {
    page: {
      title: `Dashboard - ${process.env.APP_NAME || 'Application'}`,
      description: 'User dashboard and controls',
      type: 'dashboard'
    },
    user: user || {
      isAuthenticated: isAuthenticated,
      email: req.user?.email || null,
      id: req.user?.id || null
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
          display_name: { required: true, max: 100 },
          phone: { required: false, max: 20 },
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
    },
    app_info: {
      name: process.env.APP_NAME || 'Application',
      description: process.env.APP_DESCRIPTION || 'A modern web application',
      version: process.env.APP_VERSION || '1.0.0',
      environment: process.env.NODE_ENV || 'development'
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
  // Fetch complete user data from Supabase Admin API
  let user = null;
  
  if (req.user?.id) {
    try {
      const { supabaseAdmin } = require('../utils/supabaseClient');
      
      if (supabaseAdmin) {
        const { data: { user: userData }, error } = await supabaseAdmin.auth.admin.getUserById(req.user.id);
        
        if (!error && userData) {
          // Map Supabase user data to display format
          // Handle both old format (first_name/last_name) and new format (display_name)
          const firstName = userData.user_metadata?.first_name || '';
          const lastName = userData.user_metadata?.last_name || '';
          const displayName = userData.user_metadata?.display_name || 
                             (firstName && lastName ? `${firstName} ${lastName}` : firstName || lastName || userData.email?.split('@')[0] || 'User');
          
          user = {
            id: userData.id,
            email: userData.email,
            display_name: displayName,
            phone: userData.phone || '',
            created_at: userData.created_at,
            updated_at: userData.updated_at,
            last_sign_in_at: userData.last_sign_in_at,
            email_confirmed_at: userData.email_confirmed_at,
            providers: userData.app_metadata?.providers || ['email'],
            role: userData.role || 'authenticated'
          };
        }
      }
      
      // Fallback to JWT data if Supabase fetch fails
      if (!user) {
        // Handle both old format (first_name/last_name) and new format (display_name)
        const firstName = req.user.user_metadata?.first_name || '';
        const lastName = req.user.user_metadata?.last_name || '';
        const displayName = req.user.user_metadata?.display_name || 
                           (firstName && lastName ? `${firstName} ${lastName}` : firstName || lastName || req.user.email?.split('@')[0] || 'User');
        
        user = {
          id: req.user.id,
          email: req.user.email,
          display_name: displayName,
          phone: req.user.user_metadata?.phone || '',
          created_at: req.user.user_metadata?.created_at || new Date().toISOString(),
          updated_at: req.user.user_metadata?.updated_at || new Date().toISOString(),
          last_sign_in_at: req.user.user_metadata?.last_sign_in_at || new Date().toISOString(),
          email_confirmed_at: req.user.user_metadata?.email_confirmed_at || null,
          providers: req.user.app_metadata?.providers || ['email'],
          role: req.user.role || 'authenticated'
        };
      }
    } catch (error) {
      console.error('Error fetching user data from Supabase:', error.message);
      // Fallback to basic JWT data
      // Handle both old format (first_name/last_name) and new format (display_name)
      const firstName = req.user.user_metadata?.first_name || '';
      const lastName = req.user.user_metadata?.last_name || '';
      const displayName = req.user.user_metadata?.display_name || 
                         (firstName && lastName ? `${firstName} ${lastName}` : firstName || lastName || req.user.email?.split('@')[0] || 'User');
      
      user = {
        id: req.user.id,
        email: req.user.email,
        display_name: displayName,
        phone: '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_sign_in_at: new Date().toISOString(),
        email_confirmed_at: null,
        providers: ['email'],
        role: 'authenticated'
      };
    }
  }

  return {
    page: {
      title: `User Profile${user ? ` - ${user.display_name}` : ''}`,
      description: 'User profile information',
      type: 'user_profile'
    },
    user: {
      isAuthenticated: req.user?.id ? true : false || false,
      email: req.user?.email || null,
      id: req.user?.id || null
    },
    profile: {
      user: user,
      isOwnProfile: req.user?.id === userId
    },
    ui: {
      csrfToken: res.locals.csrfToken || ''
    },
    app_info: {
      name: process.env.APP_NAME || 'Application',
      description: process.env.APP_DESCRIPTION || 'A modern web application',
      version: process.env.APP_VERSION || '1.0.0',
      environment: process.env.NODE_ENV || 'development'
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
  // Fetch complete user data from Supabase Admin API
  let user = null;
  
  if (req.user?.id) {
    try {
      const { supabaseAdmin } = require('../utils/supabaseClient');
      
      if (supabaseAdmin) {
        const { data: { user: userData }, error } = await supabaseAdmin.auth.admin.getUserById(req.user.id);
        
        if (!error && userData) {
          // Map Supabase user data to display format
          // Handle both old format (first_name/last_name) and new format (display_name)
          const firstName = userData.user_metadata?.first_name || '';
          const lastName = userData.user_metadata?.last_name || '';
          const displayName = userData.user_metadata?.display_name || 
                             (firstName && lastName ? `${firstName} ${lastName}` : firstName || lastName || userData.email?.split('@')[0] || 'User');
          
          user = {
            id: userData.id,
            email: userData.email,
            display_name: displayName,
            phone: userData.phone || '',
            created_at: userData.created_at,
            updated_at: userData.updated_at,
            last_sign_in_at: userData.last_sign_in_at,
            email_confirmed_at: userData.email_confirmed_at,
            providers: userData.app_metadata?.providers || ['email'],
            role: userData.role || 'authenticated'
          };
        }
      }
      
      // Fallback to JWT data if Supabase fetch fails
      if (!user) {
        // Handle both old format (first_name/last_name) and new format (display_name)
        const firstName = req.user.user_metadata?.first_name || '';
        const lastName = req.user.user_metadata?.last_name || '';
        const displayName = req.user.user_metadata?.display_name || 
                           (firstName && lastName ? `${firstName} ${lastName}` : firstName || lastName || req.user.email?.split('@')[0] || 'User');
        
        user = {
          id: req.user.id,
          email: req.user.email,
          display_name: displayName,
          phone: req.user.user_metadata?.phone || '',
          created_at: req.user.user_metadata?.created_at || new Date().toISOString(),
          updated_at: req.user.user_metadata?.updated_at || new Date().toISOString(),
          last_sign_in_at: req.user.user_metadata?.last_sign_in_at || new Date().toISOString(),
          email_confirmed_at: req.user.user_metadata?.email_confirmed_at || null,
          providers: req.user.app_metadata?.providers || ['email'],
          role: req.user.role || 'authenticated'
        };
      }
    } catch (error) {
      console.error('Error fetching user data from Supabase:', error.message);
      // Fallback to basic JWT data
      // Handle both old format (first_name/last_name) and new format (display_name)
      const firstName = req.user.user_metadata?.first_name || '';
      const lastName = req.user.user_metadata?.last_name || '';
      const displayName = req.user.user_metadata?.display_name || 
                         (firstName && lastName ? `${firstName} ${lastName}` : firstName || lastName || req.user.email?.split('@')[0] || 'User');
      
      user = {
        id: req.user.id,
        email: req.user.email,
        display_name: displayName,
        phone: '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_sign_in_at: new Date().toISOString(),
        email_confirmed_at: null,
        providers: ['email'],
        role: 'authenticated'
      };
    }
  }

  return {
    page: {
      title: `Settings - ${process.env.APP_NAME || 'Application'}`,
      description: 'User settings and preferences',
      type: 'settings'
    },
    user: user || {
      isAuthenticated: req.user?.id ? true : false || false,
      email: req.user?.email || null,
      id: req.user?.id || null
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
    },
    app_info: {
      name: process.env.APP_NAME || 'Application',
      description: process.env.APP_DESCRIPTION || 'A modern web application',
      version: process.env.APP_VERSION || '1.0.0',
      environment: process.env.NODE_ENV || 'development'
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
      title: `Error ${statusCode} - ${process.env.APP_NAME || 'Application'}`,
      description: 'An error occurred',
      type: 'error',
      nonce: res.locals.nonce
    },
    user: {
      isAuthenticated: req.user?.id ? true : false || false,
      email: req.user?.email || null,
      id: req.user?.id || null
    },
    error: {
      code: statusCode,
      message: errorMessage,
      requestId: req.requestId
    },
    ui: {
      csrfToken: res.locals.csrfToken || ''
    },
    app_info: {
      name: process.env.APP_NAME || 'Application',
      description: process.env.APP_DESCRIPTION || 'A modern web application',
      version: process.env.APP_VERSION || '1.0.0',
      environment: process.env.NODE_ENV || 'development'
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
