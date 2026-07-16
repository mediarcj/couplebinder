// File: server/ui_contract/presenters/accountPresenters.js
// Description: Presenter functions for authenticated user account pages
// Purpose: Builds view models for dashboard, settings, and user profile pages
// Notes: Returns plain JSON-friendly objects compatible with EJS and Next.js

const { ASSET_VERSION, config } = require('../../config');
// I am loading `../navigation/manager` into `navManager` so this file can reuse that dependency below.
const navManager = require('../navigation/manager');
// I am loading `./helpers/buildCanonicalUser` into `buildCanonicalUser` so this file can reuse that dependency below.
const { buildCanonicalUser } = require('./helpers/buildCanonicalUser');
// I am loading `../../services/profileService` into `getProfileByUserId` so this file can reuse that dependency below.
const { getProfileByUserId } = require('../../services/profileService');
// I am loading `../../utils/logger` into `logger` so this file can reuse that dependency below.
const logger = require('../../utils/logger');
// I am loading `./helpers/buildAppInfo` into `buildAppInfo` so this file can reuse that dependency below.
const { buildAppInfo } = require('./helpers/buildAppInfo');

/**
 * Build page model for dashboard page
 * 
 * WHAT:
 * Creates a view model for the authenticated user dashboard with full user data and UI instructions.
 * 
 * WHY:
 * Provides dashboard structure with user profile, permissions, and server-driven UI rules.
 * 
 * HOW:
 * Takes req and res, fetches canonical user data, determines admin status, builds page metadata
 * with navigation, user object, UI instructions with feature flags and form schemas, and app info.
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Object} Page model for dashboard page
 */
async function buildDashboardPageModel(req, res) {
  // I am saving `user` here so the nearby steps can reuse the same value without rebuilding it each time.
  const user = await buildCanonicalUser(req);
  // I am saving `isAuthenticated` here so the nearby steps can reuse the same value without rebuilding it each time.
  const isAuthenticated = !!user?.id;
  // I am saving `isAdmin` here so the nearby steps can reuse the same value without rebuilding it each time.
  const isAdmin = (user.roles || []).includes('admin') || false;

  // This return sends the completed value or response back to the code that called this function.
  return {
    // I am keeping the `page` field in this object so the receiving code can read that value by its expected name.
    page: {
      // I am keeping the `title` field in this object so the receiving code can read that value by its expected name.
      title: `Dashboard - ${config.branding.appName}`,
      // I am keeping the `description` field in this object so the receiving code can read that value by its expected name.
      description: 'User dashboard and controls',
      // I am keeping the `type` field in this object so the receiving code can read that value by its expected name.
      type: 'dashboard',
      // I am keeping the `nonce` field in this object so the receiving code can read that value by its expected name.
      nonce: res.locals.nonce || '',
      // I am keeping the `assetVersion` field in this object so the receiving code can read that value by its expected name.
      assetVersion: ASSET_VERSION,
      // I am keeping the `nav` field in this object so the receiving code can read that value by its expected name.
      nav: navManager.compose(req, res)
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    },
    // I am keeping this line here because the surrounding accountPresenters.js workflow expects this value or operation before it continues.
    user,
    // I am keeping the `ui_instructions` field in this object so the receiving code can read that value by its expected name.
    ui_instructions: {
      // I am keeping the `allowed_actions` field in this object so the receiving code can read that value by its expected name.
      allowed_actions: isAuthenticated ?
        // I am keeping this line here because the surrounding accountPresenters.js workflow expects this value or operation before it continues.
        ['view_profile', 'edit_profile', 'view_submissions', 'submit_text', 'logout'] :
        // I am keeping this line here because the surrounding accountPresenters.js workflow expects this value or operation before it continues.
        ['login', 'view_public_content'],
      // I am keeping the `input_limits` field in this object so the receiving code can read that value by its expected name.
      input_limits: { text_min: 20, text_max: 5000, profile_name_max: 100 },
      // I am keeping the `feature_flags` field in this object so the receiving code can read that value by its expected name.
      feature_flags: {
        // I am keeping the `text_submission` field in this object so the receiving code can read that value by its expected name.
        text_submission: true,
        // I am keeping the `profile_editing` field in this object so the receiving code can read that value by its expected name.
        profile_editing: isAuthenticated,
        // I am keeping the `admin_panel` field in this object so the receiving code can read that value by its expected name.
        admin_panel: isAdmin,
        // I am keeping the `user_management` field in this object so the receiving code can read that value by its expected name.
        user_management: isAdmin,
        // I am keeping the `advanced_analytics` field in this object so the receiving code can read that value by its expected name.
        advanced_analytics: isAdmin
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      },
      // I am keeping the `form_schema` field in this object so the receiving code can read that value by its expected name.
      form_schema: {
        // I am keeping the `profile` field in this object so the receiving code can read that value by its expected name.
        profile: {
          // I am keeping the `display_name` field in this object so the receiving code can read that value by its expected name.
          display_name: { required: true, max: 100 },
          // I am keeping the `phone` field in this object so the receiving code can read that value by its expected name.
          phone: { required: false, max: 20 },
          // I am keeping the `email` field in this object so the receiving code can read that value by its expected name.
          email: { required: true, type: 'email' }
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        },
        // I am keeping the `text` field in this object so the receiving code can read that value by its expected name.
        text: { required: true, min: 20, max: 5000 }
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      },
      // I am keeping the `cooldowns` field in this object so the receiving code can read that value by its expected name.
      cooldowns: { profile_update: 0, text_submission: 0 },
      // I am keeping the `security` field in this object so the receiving code can read that value by its expected name.
      security: {
        // I am keeping the `csrf_token` field in this object so the receiving code can read that value by its expected name.
        csrf_token: res.locals.csrfToken || '',
        // I am keeping the `nonce` field in this object so the receiving code can read that value by its expected name.
        nonce: res.locals.nonce || '',
        // I am keeping the `content_security_policy` field in this object so the receiving code can read that value by its expected name.
        content_security_policy: 'strict'
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      },
      // I am keeping the `display_rules` field in this object so the receiving code can read that value by its expected name.
      display_rules: {
        // I am keeping the `show_admin_menu` field in this object so the receiving code can read that value by its expected name.
        show_admin_menu: isAdmin,
        // I am keeping the `show_user_menu` field in this object so the receiving code can read that value by its expected name.
        show_user_menu: isAuthenticated,
        // I am keeping the `show_submission_form` field in this object so the receiving code can read that value by its expected name.
        show_submission_form: true,
        // I am keeping the `show_profile_edit` field in this object so the receiving code can read that value by its expected name.
        show_profile_edit: isAuthenticated,
        // I am keeping the `show_analytics` field in this object so the receiving code can read that value by its expected name.
        show_analytics: isAdmin
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    },
    // I am keeping the `ui` field in this object so the receiving code can read that value by its expected name.
    ui: { 
      // I am keeping the `csrfToken` field in this object so the receiving code can read that value by its expected name.
      csrfToken: res.locals.csrfToken || '',
      // I am keeping the `supabaseUrl` field in this object so the receiving code can read that value by its expected name.
      supabaseUrl: config.supabase.url || '',
      // I am keeping the `supabaseAnonKey` field in this object so the receiving code can read that value by its expected name.
      supabaseAnonKey: config.supabase.anonKey || ''
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    },
    // I am keeping the `app_info` field in this object so the receiving code can read that value by its expected name.
    app_info: buildAppInfo()
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  };
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * Build page model for user profile page
 * 
 * WHAT:
 * Creates a view model for viewing a user profile (self or another user).
 * 
 * WHY:
 * Provides profile page structure with user data and ownership detection.
 * 
 * HOW:
 * Takes req, res, and userId, fetches canonical user for self, optionally fetches
 * viewed user profile, builds page metadata, user objects, and app info.
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {string} userId - User ID from route parameter
 * @returns {Object} Page model for user profile page
 */
async function buildUserProfilePageModel(req, res, userId) {
  // I am saving `self` here so the nearby steps can reuse the same value without rebuilding it each time.
  const self = await buildCanonicalUser(req);
  // I am saving `_isAuthenticated` here so the nearby steps can reuse the same value without rebuilding it each time.
  const _isAuthenticated = !!self?.id;
  // I am saving `isOwn` here so the nearby steps can reuse the same value without rebuilding it each time.
  const isOwn = self?.id && userId && self.id === userId;

  // If viewing another user's profile, fetch that profile for display
  let viewed = null;
  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // Extract user access token for RLS-compliant profile fetching
    const userAccessToken = req.cookies?.['sb-access-token'] || 
                           // I am keeping this line here because the surrounding accountPresenters.js workflow expects this value or operation before it continues.
                           (req.headers.authorization?.startsWith('Bearer ') ? 
                            // I am calling this helper here so the current workflow performs this step before it moves on.
                            req.headers.authorization.slice(7) : null);
    // I am waiting for this asynchronous step here so the next line does not use its result before it is ready.
    viewed = await getProfileByUserId(userId, userAccessToken);
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (e) { 
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.warn({
      // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
      event: 'presenter.view_profile_fetch_failed',
      // I am keeping this line here because the surrounding accountPresenters.js workflow expects this value or operation before it continues.
      userId,
      // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
      error: e?.message || e
    // I am keeping this line here because the surrounding accountPresenters.js workflow expects this value or operation before it continues.
    }, 'view profile fetch failed');
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // This return sends the completed value or response back to the code that called this function.
  return {
    // I am keeping the `page` field in this object so the receiving code can read that value by its expected name.
    page: {
      // I am keeping the `title` field in this object so the receiving code can read that value by its expected name.
      title: `User Profile${viewed ? ` - ${viewed.display_name}` : ''}`,
      // I am keeping the `description` field in this object so the receiving code can read that value by its expected name.
      description: 'User profile information',
      // I am keeping the `type` field in this object so the receiving code can read that value by its expected name.
      type: 'user_profile'
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    },
    // I am keeping the `user` field in this object so the receiving code can read that value by its expected name.
    user: self,
    // I am keeping the `profile` field in this object so the receiving code can read that value by its expected name.
    profile: { user: viewed || (isOwn ? self : null), isOwnProfile: !!isOwn },
    // I am keeping the `ui` field in this object so the receiving code can read that value by its expected name.
    ui: { csrfToken: res.locals.csrfToken || '' },
    // I am keeping the `app_info` field in this object so the receiving code can read that value by its expected name.
    app_info: buildAppInfo()
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  };
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * Build page model for settings page
 * 
 * WHAT:
 * Creates a view model for user settings page.
 * 
 * WHY:
 * Provides settings page structure with user data and configuration limits.
 * 
 * HOW:
 * Takes req and res, fetches canonical user data, builds page metadata, user object,
 * settings configuration, and app info.
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Object} Page model for settings page
 */
async function buildSettingsPageModel(req, res) {
  // I am saving `user` here so the nearby steps can reuse the same value without rebuilding it each time.
  const user = await buildCanonicalUser(req);
  // I am saving `_isAuthenticated` here so the nearby steps can reuse the same value without rebuilding it each time.
  const _isAuthenticated = !!user?.id;

  // This return sends the completed value or response back to the code that called this function.
  return {
    // I am keeping the `page` field in this object so the receiving code can read that value by its expected name.
    page: {
      // I am keeping the `title` field in this object so the receiving code can read that value by its expected name.
      title: `Settings - ${config.branding.appName}`,
      // I am keeping the `description` field in this object so the receiving code can read that value by its expected name.
      description: 'User settings and preferences',
      // I am keeping the `type` field in this object so the receiving code can read that value by its expected name.
      type: 'settings'
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    },
    // I am keeping the `user` field in this object so the receiving code can read that value by its expected name.
    user: user,
    // I am keeping the `settings` field in this object so the receiving code can read that value by its expected name.
    settings: {
      // I am keeping the `textLimits` field in this object so the receiving code can read that value by its expected name.
      textLimits: { min: 20, max: 5000 },
      // I am keeping the `maxSubmissions` field in this object so the receiving code can read that value by its expected name.
      maxSubmissions: 10
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    },
    // I am keeping the `ui` field in this object so the receiving code can read that value by its expected name.
    ui: { csrfToken: res.locals.csrfToken || '' },
    // I am keeping the `app_info` field in this object so the receiving code can read that value by its expected name.
    app_info: buildAppInfo()
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  };
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am exporting this value here so another module can deliberately reuse the completed piece from accountPresenters.js.
module.exports = { 
  // I am keeping this line here because the surrounding accountPresenters.js workflow expects this value or operation before it continues.
  buildDashboardPageModel, 
  // I am keeping this line here because the surrounding accountPresenters.js workflow expects this value or operation before it continues.
  buildUserProfilePageModel, 
  // I am keeping this line here because the surrounding accountPresenters.js workflow expects this value or operation before it continues.
  buildSettingsPageModel 
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
};

