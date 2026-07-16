// Description: Presenter functions for password recovery flows
// Purpose: Builds view models for forgot password and reset password pages
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
 * Build page model for forgot password request page
 * 
 * Creates a view model for the forgot password form with state handling (form/sent/error).
 * 
 * Provides password reset request page structure with Turnstile and state management.
 * 
 * Takes req, res, and options (state, email, message), builds page metadata with navigation,
 * user state, UI config including Turnstile, reset state info, and app info.
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Object} options - Options object with state, email, message
 * @returns {Object} Page model for forgot password request page
 */
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
      state,
      turnstile: {
        enabled: Boolean(config.turnstile?.enabled),
        siteKey: config.turnstile?.enabled ? config.turnstile.siteKey : ''
      }
    },
    ui_instructions: {
      input_limits: DEFAULT_AUTH_LIMITS
    },
    reset: {
      state,
      email: options.email || '',
      message: options.message || ''
    },
    app_info: buildAppInfo()
  };
}

/**
 * Build page model for password reset completion page
 * 
 * Creates a view model for the password reset form with ready state.
 * 
 * Provides password reset completion page structure for setting new password.
 * 
 * Takes req, res, and options (ready, error), builds page metadata with navigation,
 * user state, UI config, reset state info, and app info.
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Object} options - Options object with ready flag and optional error
 * @returns {Object} Page model for password reset page
 */
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
    app_info: buildAppInfo()
  };
}

module.exports = { buildForgotPasswordRequestModel, buildForgotPasswordResetModel };

