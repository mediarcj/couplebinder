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

const { getProfileByUserId } = require('../services/profileService');
// Removed usersRepo import - now using Supabase user data directly


/**
 * Canonical user model builder.
 * Always prefers app profile (v_profiles_full) for display_name and profile fields.
 * Falls back to Supabase JWT user metadata if needed.
 */
async function buildCanonicalUser(req) {
  const basic = {
    id: req.user?.id || null,
    email: req.user?.email || null
  };
  if (!basic.id) return basic;

  // Try DB profile view first
  let profile = null;
  try {
    profile = await getProfileByUserId(basic.id);
  } catch (e) {
    console.error('buildCanonicalUser profile fetch failed:', e?.message || e);
  }

  if (profile) {
    return {
      id: basic.id,
      email: basic.email,
      display_name: profile.display_name || (basic.email ? basic.email.split('@')[0] : 'User'),
      phone: profile.phone || '',
      given_name: profile.given_name || '',
      family_name: profile.family_name || '',
      avatar_url: profile.avatar_url || '',
      locale: profile.locale || '',
      timezone: profile.timezone || '',
      created_at: profile.created_at,
      updated_at: profile.updated_at,
      roles: profile.roles || [],
    };
  }

  // Fallback to JWT/app metadata if DB not ready
  const md = (req.user && (req.user.user_metadata || req.user.user_meta_data)) || {};
  const first = md.first_name || '';
  const last = md.last_name || '';
  const display = md.display_name || (first && last ? `${first} ${last}` : first || last || (basic.email ? basic.email.split('@')[0] : 'User'));

  return {
    id: basic.id,
    email: basic.email,
    display_name: display,
    phone: md.phone || '',
    given_name: first,
    family_name: last,
    avatar_url: md.avatar_url || '',
    locale: md.locale || '',
    timezone: md.timezone || '',
    created_at: req.user?.created_at || new Date().toISOString(),
    updated_at: req.user?.updated_at || new Date().toISOString(),
    roles: [],
  };
}

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
  const user = await buildCanonicalUser(req);
  const isAuthenticated = !!user?.id;
  const isAdmin = (user.roles || []).includes('admin') || false;

  return {
    page: {
      title: `Dashboard - ${process.env.APP_NAME || 'Application'}`,
      description: 'User dashboard and controls',
      type: 'dashboard'
    },
    user,
    ui_instructions: {
      allowed_actions: isAuthenticated ?
        ['view_profile', 'edit_profile', 'view_submissions', 'submit_text', 'logout'] :
        ['login', 'view_public_content'],
      input_limits: { text_min: 20, text_max: 5000, profile_name_max: 100 },
      feature_flags: {
        text_submission: true,
        profile_editing: isAuthenticated,
        admin_panel: isAdmin,
        user_management: isAdmin,
        advanced_analytics: isAdmin
      },
      form_schema: {
        profile: {
          display_name: { required: true, max: 100 },
          phone: { required: false, max: 20 },
          email: { required: true, type: 'email' }
        },
        text: { required: true, min: 20, max: 5000 }
      },
      cooldowns: { profile_update: 0, text_submission: 0 },
      security: {
        csrf_token: res.locals.csrfToken || '',
        nonce: res.locals.nonce || '',
        content_security_policy: 'strict'
      },
      display_rules: {
        show_admin_menu: isAdmin,
        show_user_menu: isAuthenticated,
        show_submission_form: true,
        show_profile_edit: isAuthenticated,
        show_analytics: isAdmin
      }
    },
    ui: { csrfToken: res.locals.csrfToken || '' },
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
  const self = await buildCanonicalUser(req);
  const isAuthenticated = !!self?.id;
  const isOwn = self?.id && userId && self.id === userId;

  // If viewing another user's profile, fetch that profile for display
  let viewed = null;
  try {
    viewed = await getProfileByUserId(userId);
  } catch (e) { console.error('view profile fetch failed:', e?.message || e); }

  return {
    page: {
      title: `User Profile${viewed ? ` - ${viewed.display_name}` : ''}`,
      description: 'User profile information',
      type: 'user_profile'
    },
    user: self,
    profile: { user: viewed || (isOwn ? self : null), isOwnProfile: !!isOwn },
    ui: { csrfToken: res.locals.csrfToken || '' },
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
  const user = await buildCanonicalUser(req);
  const isAuthenticated = !!user?.id;

  return {
    page: {
      title: `Settings - ${process.env.APP_NAME || 'Application'}`,
      description: 'User settings and preferences',
      type: 'settings'
    },
    user: user,
    settings: {
      textLimits: { min: 20, max: 5000 },
      maxSubmissions: 10
    },
    ui: { csrfToken: res.locals.csrfToken || '' },
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