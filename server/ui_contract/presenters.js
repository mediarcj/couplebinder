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
const { ASSET_VERSION, config } = require('../config');
const logger = require('../utils/logger');
const navManager = require('./navigation/manager');
// Removed usersRepo import - now using Supabase user data directly

// tiny helpers (no lodash)
const uniq = (arr) => Array.from(new Set(Array.isArray(arr) ? arr : []));
const notNil = (x) => x !== null && x !== undefined;

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

  /**
   * WHAT:
   * Fetch full user metadata from Supabase Auth Admin API.
   * 
   * WHY:
   * JWT tokens don't include last_sign_in_at, created_at, or updated_at.
   * We need these fields for dashboard display.
   * 
   * HOW:
   * Call supabaseAdmin.auth.admin.getUserById() to get complete user object.
   * Fail gracefully if API call fails (these are informational fields).
   */
  let authMetadata = {};
  try {
    const { supabaseAdmin } = require('../utils/supabaseClient');
    const { data, error } = await supabaseAdmin.auth.admin.getUserById(basic.id);
    if (data && !error && data.user) {
      authMetadata = {
        last_sign_in_at: data.user.last_sign_in_at || null,
        created_at: data.user.created_at || null,
        updated_at: data.user.updated_at || null,
        email_confirmed_at: data.user.email_confirmed_at || null
      };
    }
  } catch (e) {
    // Fail gracefully - these are informational fields only
    logger.warn({
      event: 'presenter.auth_metadata_fetch_failed',
      userId: basic.id,
      error: e?.message
    }, 'Failed to fetch auth user metadata');
  }

  let profile = null;
  try {
    // Extract user access token for RLS-compliant profile fetching
    const userAccessToken = req.cookies?.['sb-access-token'] || 
                           (req.headers.authorization?.startsWith('Bearer ') ? 
                            req.headers.authorization.slice(7) : null);
    profile = await getProfileByUserId(basic.id, userAccessToken);
  } catch (e) {
    logger.warn({
      event: 'presenter.profile_fetch_failed',
      userId: basic.id,
      error: e?.message || e
    }, 'buildCanonicalUser profile fetch failed');
  }

  if (profile) {
    const rolesClean = uniq((profile.roles || []).filter(notNil));
    // Providers: prefer app_metadata.providers (array), else amr, else fallback
    const amrProviders = Array.isArray(req.user?.amr)
      ? req.user.amr.map((x) => x?.method).filter(Boolean)
      : [];
    const providers =
      (Array.isArray(req.user?.app_metadata?.providers) && req.user.app_metadata.providers.length
        ? req.user.app_metadata.providers
        : amrProviders.length
          ? amrProviders
          : (req.user?.app_metadata?.provider ? [req.user.app_metadata.provider] : ['email']));

    // Email confirmed: if you later join this via admin API you can show a timestamp.
    // For now, use the boolean from user_metadata if present.
    const emailConfirmed =
      typeof req.user?.user_metadata?.email_verified === 'boolean'
        ? req.user.user_metadata.email_verified
        : null;

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
      created_at: authMetadata.created_at || profile.created_at || null,
      updated_at: authMetadata.updated_at || profile.updated_at || null,
      last_sign_in_at: authMetadata.last_sign_in_at || profile.last_sign_in_at || null,
      email_confirmed_at: authMetadata.email_confirmed_at || null,
      email_confirmed: emailConfirmed,                     // boolean for the UI
      providers,                                           // array
      roles: rolesClean,                                   // array (no nulls, deduped)
    };
  }

  // Fallback to JWT/app metadata if DB not ready
  const md = (req.user && (req.user.user_metadata || req.user.user_meta_data)) || {};
  const first = md.first_name || '';
  const last = md.last_name || '';
  const display = md.display_name || (first && last ? `${first} ${last}` : first || last || (basic.email ? basic.email.split('@')[0] : 'User'));

  const amrProviders = Array.isArray(req.user?.amr)
    ? req.user.amr.map((x) => x?.method).filter(Boolean)
    : [];
  const providers =
    (Array.isArray(req.user?.app_metadata?.providers) && req.user.app_metadata.providers.length
      ? req.user.app_metadata.providers
      : amrProviders.length
        ? amrProviders
        : (req.user?.app_metadata?.provider ? [req.user.app_metadata.provider] : ['email']));
  const emailConfirmed =
    typeof req.user?.user_metadata?.email_verified === 'boolean'
      ? req.user.user_metadata.email_verified
      : null;

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
    created_at: authMetadata.created_at || new Date().toISOString(),
    updated_at: authMetadata.updated_at || new Date().toISOString(),
    last_sign_in_at: authMetadata.last_sign_in_at || null,
    email_confirmed_at: authMetadata.email_confirmed_at || null,
    email_confirmed: emailConfirmed,
    providers,
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
  const _clientIP = req.ip || req.connection.remoteAddress;
  
  return {
    page: {
      title: config.branding.appName,
      description: config.branding.appDescription,
      type: 'home',
      assetVersion: ASSET_VERSION,  // Cache-busting for JS/CSS
      nonce: res.locals.nonce || '',  // CSP nonce for inline scripts
      nav: navManager.compose(req, res)  // Centralized navigation
    },
    user: {
      isAuthenticated: Boolean(req.user && req.user.id),
      email: req.user?.email || null,
      id: req.user?.id || null
    },
    // UI instructions from backend - frontend must follow these rules
    ui_instructions: {
      allowed_actions: (() => {
        const isAuthed = Boolean(req.user && req.user.id);
        return isAuthed
          ? ['view_dashboard', 'logout']
          : ['login', 'view_public_content'];
      })(),
      
      input_limits: {
        text_min: 20,
        text_max: 5000,
        title_max: 140,
        email_max: 40,
        password_min: 8,
        password_max: 40
      },
      
      feature_flags: {
        text_submission: false, // Removed from homepage
        dashboard_access: Boolean(req.user && req.user.id),
        admin_panel: false, // Will be set based on user role
        advanced_mode: false
      },
      
      form_schema: {
        // No text submission form on homepage anymore
      },
      
      cooldowns: {
        login_attempts: 0   // Will be managed by rate limiting
      },
      
      security: {
        csrf_token: res.locals.csrfToken || '',
        nonce: res.locals.nonce || '',
        content_security_policy: 'strict'
      },
      
      display_rules: {
        show_user_menu: Boolean(req.user && req.user.id),
        show_submission_form: false, // Removed from homepage
        show_public_submissions: false // Removed from homepage
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
      // Login is now handled by dedicated /login page (no modal)
      csrfToken: res.locals.csrfToken || ''
    },
    app_info: {
      name: config.branding.appName,
      description: config.branding.appDescription,
      version: config.branding.appVersion,
      environment: config.server.nodeEnv
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
      title: `Dashboard - ${config.branding.appName}`,
      description: 'User dashboard and controls',
      type: 'dashboard',
      nonce: res.locals.nonce || '',   //  ensure CSP nonce for dashboard.ejs
      assetVersion: ASSET_VERSION,  // Cache-busting for JS/CSS
      nav: navManager.compose(req, res)  // Centralized navigation
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
    ui: { 
      csrfToken: res.locals.csrfToken || '',
      supabaseUrl: config.supabase.url || '',
      supabaseAnonKey: config.supabase.anonKey || ''
    },
    app_info: {
      name: config.branding.appName,
      description: config.branding.appDescription,
      version: config.branding.appVersion,
      environment: config.server.nodeEnv
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
  const _isAuthenticated = !!self?.id;
  const isOwn = self?.id && userId && self.id === userId;

  // If viewing another user's profile, fetch that profile for display
  let viewed = null;
  try {
    // Extract user access token for RLS-compliant profile fetching
    const userAccessToken = req.cookies?.['sb-access-token'] || 
                           (req.headers.authorization?.startsWith('Bearer ') ? 
                            req.headers.authorization.slice(7) : null);
    viewed = await getProfileByUserId(userId, userAccessToken);
  } catch (e) { 
    logger.warn({
      event: 'presenter.view_profile_fetch_failed',
      userId,
      error: e?.message || e
    }, 'view profile fetch failed');
  }

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
      name: config.branding.appName,
      description: config.branding.appDescription,
      version: config.branding.appVersion,
      environment: config.server.nodeEnv
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
  const _isAuthenticated = !!user?.id;

  return {
    page: {
      title: `Settings - ${config.branding.appName}`,
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
      name: config.branding.appName,
      description: config.branding.appDescription,
      version: config.branding.appVersion,
      environment: config.server.nodeEnv
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
      title: `Error ${statusCode} - ${config.branding.appName}`,
      description: 'An error occurred',
      type: 'error',
      nonce: res.locals.nonce,
      assetVersion: ASSET_VERSION  // Cache-busting for JS/CSS
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
      name: config.branding.appName,
      description: config.branding.appDescription,
      version: config.branding.appVersion,
      environment: config.server.nodeEnv
    }
  };
}

function baseAppInfo() {
  return {
    name: config.branding.appName,
    description: config.branding.appDescription,
    version: config.branding.appVersion,
    environment: config.server.nodeEnv
  };
}

const DEFAULT_AUTH_LIMITS = {
  email_max: 40,
  password_min: 8,
  password_max: 40,
  name_max: 40
};

async function buildForgotPasswordRequestModel(req, res, options = {}) {
  const state = options.state || 'form';
  return {
    page: {
      title: `Forgot Password - ${config.branding.appName}`,
      description: 'Send a password reset link',
      type: 'forgot_password_request',
      nonce: res.locals.nonce || '',
      assetVersion: ASSET_VERSION,
      nav: navManager.compose(req, res)
    },
    user: {
      isAuthenticated: Boolean(req.user?.id),
      email: req.user?.email || null,
      id: req.user?.id || null
    },
    ui: {
      csrfToken: res.locals.csrfToken || '',
      state
    },
    ui_instructions: {
      input_limits: DEFAULT_AUTH_LIMITS
    },
    reset: {
      state,
      email: options.email || ''
    },
    app_info: baseAppInfo()
  };
}

async function buildForgotPasswordResetModel(req, res, options = {}) {
  const ready = Boolean(options.ready);
  return {
    page: {
      title: `Reset Password - ${config.branding.appName}`,
      description: 'Create a new password',
      type: 'forgot_password_reset',
      nonce: res.locals.nonce || '',
      assetVersion: ASSET_VERSION,
      nav: navManager.compose(req, res)
    },
    user: {
      isAuthenticated: Boolean(req.user?.id),
      email: req.user?.email || null,
      id: req.user?.id || null
    },
    ui: {
      csrfToken: res.locals.csrfToken || '',
      ready
    },
    ui_instructions: {
      input_limits: DEFAULT_AUTH_LIMITS
    },
    reset: {
      ready,
      error: options.error || null
    },
    app_info: baseAppInfo()
  };
}

/**
 * Build page model for login page
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Object} Page model for login page
 */
function buildLoginPageModel(req, res) {
  const url = new URL(req.originalUrl, `${req.protocol}://${req.get('host')}`);
  const passwordChangedSuccess = url.searchParams.get('password_changed_success') === '1';
  const signupSuccess = url.searchParams.get('signup_success') === '1';  
  return {
    page: {
      title: `Log in - ${config.branding.appName}`,
      description: 'Log in to your account',
      type: 'login',
      nonce: res.locals.nonce || '',
      assetVersion: ASSET_VERSION,
      nav: navManager.compose(req, res),
      passwordChangedSuccess,
      signupSuccess      
    },
    user: {
      isAuthenticated: Boolean(req.user?.id),
      email: req.user?.email || null,
      id: req.user?.id || null
    },
    ui: {
      csrfToken: res.locals.csrfToken || '',
      supabaseUrl: config.supabase.url,
      supabaseAnonKey: config.supabase.anonKey
    },
    ui_instructions: {
      input_limits: DEFAULT_AUTH_LIMITS
    },
    app_info: baseAppInfo()
  };
}

function buildSignupPageModel(req, res) {
  return {
    page: {
      title: `Sign up - ${config.branding.appName}`,
      description: 'Create a new account',
      type: 'signup',
      nonce: res.locals.nonce || '',
      assetVersion: ASSET_VERSION,
      nav: navManager.compose(req, res)
    },
    user: {
      isAuthenticated: Boolean(req.user?.id),
      email: req.user?.email || null,
      id: req.user?.id || null
    },
    ui: {
      csrfToken: res.locals.csrfToken || '',
      supabaseUrl: config.supabase.url,
      supabaseAnonKey: config.supabase.anonKey
    },
    ui_instructions: {
      input_limits: DEFAULT_AUTH_LIMITS
    },
    app_info: baseAppInfo()
  };
}

module.exports = {
  buildHomePageModel,
  buildDashboardPageModel,
  buildUserProfilePageModel,
  buildSettingsPageModel,
  buildErrorPageModel,
  buildForgotPasswordRequestModel,
  buildForgotPasswordResetModel,
  buildLoginPageModel,
  buildSignupPageModel
};