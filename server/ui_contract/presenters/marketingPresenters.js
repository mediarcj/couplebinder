// Description: Presenter functions for marketing and public pages
// Purpose: Builds view models for home page and other public-facing pages
// Notes: Returns plain JSON-friendly objects compatible with EJS and Next.js

const { ASSET_VERSION, config } = require('../../config');
const navManager = require('../navigation/manager');

/**
 * Build page model for home page
 * 
 * Creates a view model for the home/landing page with navigation and UI instructions.
 * 
 * Provides the main entry point view model with server-driven UI rules.
 * 
 * Takes req and res, builds page metadata, user state, UI instructions from backend,
 * and app info. Returns a plain object ready for EJS or Next.js rendering.
 * 
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
      assetVersion: ASSET_VERSION,
      nonce: res.locals.nonce || '',
      nav: navManager.compose(req, res)
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
        text_submission: false,
        dashboard_access: Boolean(req.user && req.user.id),
        admin_panel: false,
        advanced_mode: false
      },
      
      form_schema: {},
      
      cooldowns: {
        login_attempts: 0
      },
      
      security: {
        csrf_token: res.locals.csrfToken || '',
        nonce: res.locals.nonce || '',
        content_security_policy: 'strict'
      },
      
      display_rules: {
        show_user_menu: Boolean(req.user && req.user.id),
        show_submission_form: false,
        show_public_submissions: false
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

module.exports = { buildHomePageModel };

