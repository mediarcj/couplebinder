// File: server/ui_contract/presenters/passwordRecoveryPresenters.js
// Description: Presenter functions for password recovery flows
// Purpose: Builds view models for forgot password and reset password pages
// Notes: Returns plain JSON-friendly objects compatible with EJS and Next.js

const { ASSET_VERSION, config } = require('../../config');
// I am loading `../navigation/manager` into `navManager` so this file can reuse that dependency below.
const navManager = require('../navigation/manager');
// I am loading `./helpers/buildAppInfo` into `buildAppInfo` so this file can reuse that dependency below.
const { buildAppInfo } = require('./helpers/buildAppInfo');

// I am saving `DEFAULT_AUTH_LIMITS` here so the nearby steps can reuse the same value without rebuilding it each time.
const DEFAULT_AUTH_LIMITS = {
  // I am keeping the `email_max` field in this object so the receiving code can read that value by its expected name.
  email_max: 40,
  // I am keeping the `password_min` field in this object so the receiving code can read that value by its expected name.
  password_min: 8,
  // I am keeping the `password_max` field in this object so the receiving code can read that value by its expected name.
  password_max: 40,
  // I am keeping the `name_max` field in this object so the receiving code can read that value by its expected name.
  name_max: 40
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
};

/**
 * Build page model for forgot password request page
 * 
 * WHAT:
 * Creates a view model for the forgot password form with state handling (form/sent/error).
 * 
 * WHY:
 * Provides password reset request page structure with Turnstile and state management.
 * 
 * HOW:
 * Takes req, res, and options (state, email, message), builds page metadata with navigation,
 * user state, UI config including Turnstile, reset state info, and app info.
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Object} options - Options object with state, email, message
 * @returns {Object} Page model for forgot password request page
 */
async function buildForgotPasswordRequestModel(req, res, options = {}) {
  // I am saving `state` here so the nearby steps can reuse the same value without rebuilding it each time.
  const state = options.state || 'form';
  // This return sends the completed value or response back to the code that called this function.
  return {
    // I am keeping the `page` field in this object so the receiving code can read that value by its expected name.
    page: {
      // I am keeping the `title` field in this object so the receiving code can read that value by its expected name.
      title: `Forgot Password - ${config.branding.appName}`,
      // I am keeping the `description` field in this object so the receiving code can read that value by its expected name.
      description: 'Send a password reset link',
      // I am keeping the `type` field in this object so the receiving code can read that value by its expected name.
      type: 'forgot_password_request',
      // I am keeping the `nonce` field in this object so the receiving code can read that value by its expected name.
      nonce: res.locals.nonce || '',
      // I am keeping the `assetVersion` field in this object so the receiving code can read that value by its expected name.
      assetVersion: ASSET_VERSION,
      // I am keeping the `nav` field in this object so the receiving code can read that value by its expected name.
      nav: navManager.compose(req, res)
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    },
    // I am keeping the `user` field in this object so the receiving code can read that value by its expected name.
    user: {
      // I am keeping the `isAuthenticated` field in this object so the receiving code can read that value by its expected name.
      isAuthenticated: Boolean(req.user?.id),
      // I am keeping the `email` field in this object so the receiving code can read that value by its expected name.
      email: req.user?.email || null,
      // I am keeping the `id` field in this object so the receiving code can read that value by its expected name.
      id: req.user?.id || null
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    },
    // I am keeping the `ui` field in this object so the receiving code can read that value by its expected name.
    ui: {
      // I am keeping the `csrfToken` field in this object so the receiving code can read that value by its expected name.
      csrfToken: res.locals.csrfToken || '',
      // I am keeping this line here because the surrounding passwordRecoveryPresenters.js workflow expects this value or operation before it continues.
      state,
      // I am keeping the `turnstile` field in this object so the receiving code can read that value by its expected name.
      turnstile: {
        // I am keeping the `enabled` field in this object so the receiving code can read that value by its expected name.
        enabled: Boolean(config.turnstile?.enabled),
        // I am keeping the `siteKey` field in this object so the receiving code can read that value by its expected name.
        siteKey: config.turnstile?.enabled ? config.turnstile.siteKey : ''
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    },
    // I am keeping the `ui_instructions` field in this object so the receiving code can read that value by its expected name.
    ui_instructions: {
      // I am keeping the `input_limits` field in this object so the receiving code can read that value by its expected name.
      input_limits: DEFAULT_AUTH_LIMITS
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    },
    // I am keeping the `reset` field in this object so the receiving code can read that value by its expected name.
    reset: {
      // I am keeping this line here because the surrounding passwordRecoveryPresenters.js workflow expects this value or operation before it continues.
      state,
      // I am keeping the `email` field in this object so the receiving code can read that value by its expected name.
      email: options.email || '',
      // I am keeping the `message` field in this object so the receiving code can read that value by its expected name.
      message: options.message || ''
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    },
    // I am keeping the `app_info` field in this object so the receiving code can read that value by its expected name.
    app_info: buildAppInfo()
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  };
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * Build page model for password reset completion page
 * 
 * WHAT:
 * Creates a view model for the password reset form with ready state.
 * 
 * WHY:
 * Provides password reset completion page structure for setting new password.
 * 
 * HOW:
 * Takes req, res, and options (ready, error), builds page metadata with navigation,
 * user state, UI config, reset state info, and app info.
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Object} options - Options object with ready flag and optional error
 * @returns {Object} Page model for password reset page
 */
async function buildForgotPasswordResetModel(req, res, options = {}) {
  // I am saving `ready` here so the nearby steps can reuse the same value without rebuilding it each time.
  const ready = Boolean(options.ready);
  // This return sends the completed value or response back to the code that called this function.
  return {
    // I am keeping the `page` field in this object so the receiving code can read that value by its expected name.
    page: {
      // I am keeping the `title` field in this object so the receiving code can read that value by its expected name.
      title: `Reset Password - ${config.branding.appName}`,
      // I am keeping the `description` field in this object so the receiving code can read that value by its expected name.
      description: 'Create a new password',
      // I am keeping the `type` field in this object so the receiving code can read that value by its expected name.
      type: 'forgot_password_reset',
      // I am keeping the `nonce` field in this object so the receiving code can read that value by its expected name.
      nonce: res.locals.nonce || '',
      // I am keeping the `assetVersion` field in this object so the receiving code can read that value by its expected name.
      assetVersion: ASSET_VERSION,
      // I am keeping the `nav` field in this object so the receiving code can read that value by its expected name.
      nav: navManager.compose(req, res)
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    },
    // I am keeping the `user` field in this object so the receiving code can read that value by its expected name.
    user: {
      // I am keeping the `isAuthenticated` field in this object so the receiving code can read that value by its expected name.
      isAuthenticated: Boolean(req.user?.id),
      // I am keeping the `email` field in this object so the receiving code can read that value by its expected name.
      email: req.user?.email || null,
      // I am keeping the `id` field in this object so the receiving code can read that value by its expected name.
      id: req.user?.id || null
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    },
    // I am keeping the `ui` field in this object so the receiving code can read that value by its expected name.
    ui: {
      // I am keeping the `csrfToken` field in this object so the receiving code can read that value by its expected name.
      csrfToken: res.locals.csrfToken || '',
      // I am keeping this line here because the surrounding passwordRecoveryPresenters.js workflow expects this value or operation before it continues.
      ready
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    },
    // I am keeping the `ui_instructions` field in this object so the receiving code can read that value by its expected name.
    ui_instructions: {
      // I am keeping the `input_limits` field in this object so the receiving code can read that value by its expected name.
      input_limits: DEFAULT_AUTH_LIMITS
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    },
    // I am keeping the `reset` field in this object so the receiving code can read that value by its expected name.
    reset: {
      // I am keeping this line here because the surrounding passwordRecoveryPresenters.js workflow expects this value or operation before it continues.
      ready,
      // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
      error: options.error || null
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    },
    // I am keeping the `app_info` field in this object so the receiving code can read that value by its expected name.
    app_info: buildAppInfo()
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  };
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am exporting this value here so another module can deliberately reuse the completed piece from passwordRecoveryPresenters.js.
module.exports = { buildForgotPasswordRequestModel, buildForgotPasswordResetModel };

