// File: server/ui_contract/presenters/authPresenters.js
// Description: Presenter functions for authentication pages (login, register)
// Purpose: Builds view models for login and registration pages
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
 * Build page model for login page
 * 
 * WHAT:
 * Creates a view model for the login page with Turnstile configuration and success flags.
 * 
 * WHY:
 * Provides login page structure with security features (Turnstile) and success state handling.
 * 
 * HOW:
 * Takes req and res, extracts URL query params for success states, builds page metadata
 * with navigation, user state, UI config including Turnstile, and app info.
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Object} Page model for login page
 */
function buildLoginPageModel(req, res) {
  // I am saving `url` here so the nearby steps can reuse the same value without rebuilding it each time.
  const url = new URL(req.originalUrl, `${req.protocol}://${req.get('host')}`);
  // I am saving `passwordChangedSuccess` here so the nearby steps can reuse the same value without rebuilding it each time.
  const passwordChangedSuccess = url.searchParams.get('password_changed_success') === '1';
  // I am saving `registerSuccess` here so the nearby steps can reuse the same value without rebuilding it each time.
  const registerSuccess = url.searchParams.get('register_success') === '1';
  
  // Parse reason and next params for session expiration handling
  const reason = url.searchParams.get('reason') || null;
  // I am saving `nextParam` here so the nearby steps can reuse the same value without rebuilding it each time.
  const nextParam = url.searchParams.get('next') || null;
  
  // Validate next param to prevent open redirects (use same logic as requireAuth)
  let safeNextUrl = null;
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (nextParam) {
    // I am loading `../../middleware/requireAuth` into `safeNext` so this file can reuse that dependency below.
    const { safeNext } = require('../../middleware/requireAuth');
    // I am keeping this line here because the surrounding authPresenters.js workflow expects this value or operation before it continues.
    safeNextUrl = safeNext(nextParam);
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
  
  // This return sends the completed value or response back to the code that called this function.
  return {
    // I am keeping the `page` field in this object so the receiving code can read that value by its expected name.
    page: {
      // I am keeping the `title` field in this object so the receiving code can read that value by its expected name.
      title: `Log in - ${config.branding.appName}`,
      // I am keeping the `description` field in this object so the receiving code can read that value by its expected name.
      description: 'Log in to your account',
      // I am keeping the `type` field in this object so the receiving code can read that value by its expected name.
      type: 'login',
      // I am keeping the `nonce` field in this object so the receiving code can read that value by its expected name.
      nonce: res.locals.nonce || '',
      // I am keeping the `assetVersion` field in this object so the receiving code can read that value by its expected name.
      assetVersion: ASSET_VERSION,
      // I am keeping the `nav` field in this object so the receiving code can read that value by its expected name.
      nav: navManager.compose(req, res),
      // I am keeping this line here because the surrounding authPresenters.js workflow expects this value or operation before it continues.
      passwordChangedSuccess,
      // I am keeping this line here because the surrounding authPresenters.js workflow expects this value or operation before it continues.
      registerSuccess,
      loginReason: reason, // 'expired' or null
      nextUrl: safeNextUrl // validated next URL or null
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
      // I am keeping the `supabaseUrl` field in this object so the receiving code can read that value by its expected name.
      supabaseUrl: config.supabase.url,
      // I am keeping the `supabaseAnonKey` field in this object so the receiving code can read that value by its expected name.
      supabaseAnonKey: config.supabase.anonKey,
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
    // I am keeping the `app_info` field in this object so the receiving code can read that value by its expected name.
    app_info: buildAppInfo()
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  };
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * Build page model for register page
 * 
 * WHAT:
 * Creates a view model for the registration page with Turnstile configuration.
 * 
 * WHY:
 * Provides registration page structure with security features (Turnstile).
 * 
 * HOW:
 * Takes req and res, builds page metadata with navigation, user state, UI config
 * including Turnstile, and app info.
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Object} Page model for register page
 */
function buildRegisterPageModel(req, res) {
  // This return sends the completed value or response back to the code that called this function.
  return {
    // I am keeping the `page` field in this object so the receiving code can read that value by its expected name.
    page: {
      // I am keeping the `title` field in this object so the receiving code can read that value by its expected name.
      title: `Register - ${config.branding.appName}`,
      // I am keeping the `description` field in this object so the receiving code can read that value by its expected name.
      description: 'Create a new account',
      // I am keeping the `type` field in this object so the receiving code can read that value by its expected name.
      type: 'register',
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
      // I am keeping the `supabaseUrl` field in this object so the receiving code can read that value by its expected name.
      supabaseUrl: config.supabase.url,
      // I am keeping the `supabaseAnonKey` field in this object so the receiving code can read that value by its expected name.
      supabaseAnonKey: config.supabase.anonKey,
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
    // I am keeping the `app_info` field in this object so the receiving code can read that value by its expected name.
    app_info: buildAppInfo()
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  };
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am exporting this value here so another module can deliberately reuse the completed piece from authPresenters.js.
module.exports = { buildLoginPageModel, buildRegisterPageModel };

