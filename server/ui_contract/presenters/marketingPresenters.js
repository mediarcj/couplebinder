// File: server/ui_contract/presenters/marketingPresenters.js
// Description: Presenter functions for marketing and public pages
// Purpose: Builds view models for home page and other public-facing pages
// Notes: Returns plain JSON-friendly objects compatible with EJS and Next.js

const { ASSET_VERSION, config } = require('../../config');
// I am loading `../navigation/manager` into `navManager` so this file can reuse that dependency below.
const navManager = require('../navigation/manager');

/**
 * Build page model for home page
 * 
 * WHAT:
 * Creates a view model for the home/landing page with navigation and UI instructions.
 * 
 * WHY:
 * Provides the main entry point view model with server-driven UI rules.
 * 
 * HOW:
 * Takes req and res, builds page metadata, user state, UI instructions from backend,
 * and app info. Returns a plain object ready for EJS or Next.js rendering.
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Object} Page model for home page
 */
function buildHomePageModel(req, res) {
  // I am saving `_clientIP` here so the nearby steps can reuse the same value without rebuilding it each time.
  const _clientIP = req.ip || req.connection.remoteAddress;
  
  // This return sends the completed value or response back to the code that called this function.
  return {
    // I am keeping the `page` field in this object so the receiving code can read that value by its expected name.
    page: {
      // I am keeping the `title` field in this object so the receiving code can read that value by its expected name.
      title: config.branding.appName,
      // I am keeping the `description` field in this object so the receiving code can read that value by its expected name.
      description: config.branding.appDescription,
      // I am keeping the `type` field in this object so the receiving code can read that value by its expected name.
      type: 'home',
      // I am keeping the `assetVersion` field in this object so the receiving code can read that value by its expected name.
      assetVersion: ASSET_VERSION,
      // I am keeping the `nonce` field in this object so the receiving code can read that value by its expected name.
      nonce: res.locals.nonce || '',
      // I am keeping the `nav` field in this object so the receiving code can read that value by its expected name.
      nav: navManager.compose(req, res)
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    },
    // I am keeping the `user` field in this object so the receiving code can read that value by its expected name.
    user: {
      // I am keeping the `isAuthenticated` field in this object so the receiving code can read that value by its expected name.
      isAuthenticated: Boolean(req.user && req.user.id),
      // I am keeping the `email` field in this object so the receiving code can read that value by its expected name.
      email: req.user?.email || null,
      // I am keeping the `id` field in this object so the receiving code can read that value by its expected name.
      id: req.user?.id || null
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    },
    // UI instructions from backend - frontend must follow these rules
    ui_instructions: {
      // I am keeping the `allowed_actions` field in this object so the receiving code can read that value by its expected name.
      allowed_actions: (() => {
        // I am saving `isAuthed` here so the nearby steps can reuse the same value without rebuilding it each time.
        const isAuthed = Boolean(req.user && req.user.id);
        // This return sends the completed value or response back to the code that called this function.
        return isAuthed
          // I am keeping this line here because the surrounding marketingPresenters.js workflow expects this value or operation before it continues.
          ? ['view_dashboard', 'logout']
          // I am keeping this line here because the surrounding marketingPresenters.js workflow expects this value or operation before it continues.
          : ['login', 'view_public_content'];
      // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
      })(),
      
      // I am keeping the `input_limits` field in this object so the receiving code can read that value by its expected name.
      input_limits: {
        // I am keeping the `text_min` field in this object so the receiving code can read that value by its expected name.
        text_min: 20,
        // I am keeping the `text_max` field in this object so the receiving code can read that value by its expected name.
        text_max: 5000,
        // I am keeping the `title_max` field in this object so the receiving code can read that value by its expected name.
        title_max: 140,
        // I am keeping the `email_max` field in this object so the receiving code can read that value by its expected name.
        email_max: 40,
        // I am keeping the `password_min` field in this object so the receiving code can read that value by its expected name.
        password_min: 8,
        // I am keeping the `password_max` field in this object so the receiving code can read that value by its expected name.
        password_max: 40
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      },
      
      // I am keeping the `feature_flags` field in this object so the receiving code can read that value by its expected name.
      feature_flags: {
        // I am keeping the `text_submission` field in this object so the receiving code can read that value by its expected name.
        text_submission: false,
        // I am keeping the `dashboard_access` field in this object so the receiving code can read that value by its expected name.
        dashboard_access: Boolean(req.user && req.user.id),
        // I am keeping the `admin_panel` field in this object so the receiving code can read that value by its expected name.
        admin_panel: false,
        // I am keeping the `advanced_mode` field in this object so the receiving code can read that value by its expected name.
        advanced_mode: false
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      },
      
      // I am keeping the `form_schema` field in this object so the receiving code can read that value by its expected name.
      form_schema: {},
      
      // I am keeping the `cooldowns` field in this object so the receiving code can read that value by its expected name.
      cooldowns: {
        // I am keeping the `login_attempts` field in this object so the receiving code can read that value by its expected name.
        login_attempts: 0
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      },
      
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
        // I am keeping the `show_user_menu` field in this object so the receiving code can read that value by its expected name.
        show_user_menu: Boolean(req.user && req.user.id),
        // I am keeping the `show_submission_form` field in this object so the receiving code can read that value by its expected name.
        show_submission_form: false,
        // I am keeping the `show_public_submissions` field in this object so the receiving code can read that value by its expected name.
        show_public_submissions: false
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    },
    // Legacy fields for backward compatibility
    features: {
      // I am keeping the `textLimits` field in this object so the receiving code can read that value by its expected name.
      textLimits: {
        // I am keeping the `min` field in this object so the receiving code can read that value by its expected name.
        min: 20,
        // I am keeping the `max` field in this object so the receiving code can read that value by its expected name.
        max: 5000
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      },
      // I am keeping the `maxSubmissions` field in this object so the receiving code can read that value by its expected name.
      maxSubmissions: 10
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    },
    // I am keeping the `ui` field in this object so the receiving code can read that value by its expected name.
    ui: {
      // I am keeping the `csrfToken` field in this object so the receiving code can read that value by its expected name.
      csrfToken: res.locals.csrfToken || ''
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    },
    // I am keeping the `app_info` field in this object so the receiving code can read that value by its expected name.
    app_info: {
      // I am keeping the `name` field in this object so the receiving code can read that value by its expected name.
      name: config.branding.appName,
      // I am keeping the `description` field in this object so the receiving code can read that value by its expected name.
      description: config.branding.appDescription,
      // I am keeping the `version` field in this object so the receiving code can read that value by its expected name.
      version: config.branding.appVersion,
      // I am keeping the `environment` field in this object so the receiving code can read that value by its expected name.
      environment: config.server.nodeEnv
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  };
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am exporting this value here so another module can deliberately reuse the completed piece from marketingPresenters.js.
module.exports = { buildHomePageModel };

