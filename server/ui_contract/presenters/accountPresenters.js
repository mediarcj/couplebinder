// Description: Presenter functions for authenticated user account pages
// Purpose: Builds view models for dashboard, settings, and user profile pages
// Notes: Returns plain JSON-friendly objects compatible with EJS and Next.js

const { ASSET_VERSION, config } = require('../../config');
const navManager = require('../navigation/manager');
const { buildCanonicalUser } = require('./helpers/buildCanonicalUser');
const { getProfileByUserId } = require('../../services/profileService');
const logger = require('../../utils/logger');
const { buildAppInfo } = require('./helpers/buildAppInfo');

/**
 * Build page model for dashboard page
 * 
 * Creates a view model for the authenticated user dashboard with full user data and UI instructions.
 * 
 * Provides dashboard structure with user profile, permissions, and server-driven UI rules.
 * 
 * Takes req and res, fetches canonical user data, determines admin status, builds page metadata
 * with navigation, user object, UI instructions with feature flags and form schemas, and app info.
 * 
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
      nonce: res.locals.nonce || '',
      assetVersion: ASSET_VERSION,
      nav: navManager.compose(req, res)
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
    app_info: buildAppInfo()
  };
}

/**
 * Build page model for user profile page
 * 
 * Creates a view model for viewing a user profile (self or another user).
 * 
 * Provides profile page structure with user data and ownership detection.
 * 
 * Takes req, res, and userId, fetches canonical user for self, optionally fetches
 * viewed user profile, builds page metadata, user objects, and app info.
 * 
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
    app_info: buildAppInfo()
  };
}

/**
 * Build page model for settings page
 * 
 * Creates a view model for user settings page.
 * 
 * Provides settings page structure with user data and configuration limits.
 * 
 * Takes req and res, fetches canonical user data, builds page metadata, user object,
 * settings configuration, and app info.
 * 
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
    app_info: buildAppInfo()
  };
}

module.exports = { 
  buildDashboardPageModel, 
  buildUserProfilePageModel, 
  buildSettingsPageModel 
};

