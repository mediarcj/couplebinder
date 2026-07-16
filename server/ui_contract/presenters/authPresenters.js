// Description: Presenter functions for authentication pages (login, register)
// Purpose: Builds view models for login and registration pages
// Notes: Returns plain JSON-friendly objects compatible with EJS and Next.js

const { ASSET_VERSION, config } = require('../../config');
const navManager = require('../navigation/manager');
const { buildAppInfo } = require('./helpers/buildAppInfo');

const DEFAULT_AUTH_LIMITS = {
  email_max: 40,
  password_min: 8,
  password_max: 40,
  name_max: 40
};

/**
 * Build page model for login page
 * 
 * Creates a view model for the login page with Turnstile configuration and success flags.
 * 
 * Provides login page structure with security features (Turnstile) and success state handling.
 * 
 * Takes req and res, extracts URL query params for success states, builds page metadata
 * with navigation, user state, UI config including Turnstile, and app info.
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Object} Page model for login page
 */
function buildLoginPageModel(req, res) {
  const url = new URL(req.originalUrl, `${req.protocol}://${req.get('host')}`);
  const passwordChangedSuccess = url.searchParams.get('password_changed_success') === '1';
  const registerSuccess = url.searchParams.get('register_success') === '1';
  
  // Parse reason and next params for session expiration handling
  const reason = url.searchParams.get('reason') || null;
  const nextParam = url.searchParams.get('next') || null;
  
  // Validate next param to prevent open redirects (use same logic as requireAuth)
  let safeNextUrl = null;
  if (nextParam) {
    const { safeNext } = require('../../middleware/requireAuth');
    safeNextUrl = safeNext(nextParam);
  }
  
  return {
    page: {
      title: `Log in - ${config.branding.appName}`,
      description: 'Log in to your account',
      type: 'login',
      nonce: res.locals.nonce || '',
      assetVersion: ASSET_VERSION,
      nav: navManager.compose(req, res),
      passwordChangedSuccess,
      registerSuccess,
      loginReason: reason, // 'expired' or null
      nextUrl: safeNextUrl // validated next URL or null
    },
    user: {
      isAuthenticated: Boolean(req.user?.id),
      email: req.user?.email || null,
      id: req.user?.id || null
    },
    ui: {
      csrfToken: res.locals.csrfToken || '',
      supabaseUrl: config.supabase.url,
      supabaseAnonKey: config.supabase.anonKey,
      turnstile: {
        enabled: Boolean(config.turnstile?.enabled),
        siteKey: config.turnstile?.enabled ? config.turnstile.siteKey : ''
      }
    },
    ui_instructions: {
      input_limits: DEFAULT_AUTH_LIMITS
    },
    app_info: buildAppInfo()
  };
}

/**
 * Build page model for register page
 * 
 * Creates a view model for the registration page with Turnstile configuration.
 * 
 * Provides registration page structure with security features (Turnstile).
 * 
 * Takes req and res, builds page metadata with navigation, user state, UI config
 * including Turnstile, and app info.
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Object} Page model for register page
 */
function buildRegisterPageModel(req, res) {
  return {
    page: {
      title: `Register - ${config.branding.appName}`,
      description: 'Create a new account',
      type: 'register',
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
      supabaseAnonKey: config.supabase.anonKey,
      turnstile: {
        enabled: Boolean(config.turnstile?.enabled),
        siteKey: config.turnstile?.enabled ? config.turnstile.siteKey : ''
      }
    },
    ui_instructions: {
      input_limits: DEFAULT_AUTH_LIMITS
    },
    app_info: buildAppInfo()
  };
}

module.exports = { buildLoginPageModel, buildRegisterPageModel };

