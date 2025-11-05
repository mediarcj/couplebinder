// ============================================================
// File: server/ui_contract/presenters/_templatePresenter.js
// Description: Presenter for the master protected EJS template
// Purpose: Builds the page model (page, user, ui_instructions, ui, app_info)
// Notes: Keep WHAT/WHY/HOW comments short; follow nonce + CSRF rules
// ============================================================

// CONNECT: This file belongs to the master protected page system.
// CLONE GUIDE:
// 1. Copy _template-protected.ejs → newpage.ejs
// 2. Copy _templatePresenter.js → newpagePresenter.js
// 3. Add route in dashboard.js → /newpage
// 4. Export new builder in presenters/index.js if needed.

const navManager = require('../navigation/manager');
const { buildCanonicalUser } = require('./helpers/buildCanonicalUser');

// Asset version can be a build stamp or ENV; fall back to timestamp for cache-busting
const ASSET_VERSION = process.env.ASSET_VERSION || new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);

/**
 * WHAT:
 * Build the minimal, safe page model for any protected page using the master template.
 *
 * WHY:
 * The backend is the source of truth. We send a simple, consistent shape that templates and
 * frontend code can rely on without guessing rules.
 *
 * HOW:
 * 1) Read nonce + csrf from res.locals (set by middleware).
 * 2) Build canonical user info from req.user.
 * 3) Compose navigation with navManager (server-driven).
 * 4) Return a clean model with page/ui/app_info sections.
 */
async function buildTemplateProtectedPageModel(req, res, opts = {}) {
  try {
    const user = await buildCanonicalUser(req); // same helper used by other pages
    const isAuthenticated = Boolean(user && user.id);

    // Minimal checks; defensive defaults
    const nonce = res.locals.nonce || '';
    const csrfToken = res.locals.csrfToken || '';

    // ============================================================
    // PAGE METADATA (safe for templates; no secrets)
    // ============================================================
    const page = {
      title: opts.title || 'Template Protected Page',
      description: opts.description || 'Master protected page template.',
      type: opts.type || 'template-protected',
      nonce,
      assetVersion: ASSET_VERSION,
      nav: navManager.compose(req, res) // server-driven nav
    };

    // ============================================================
    // UI INSTRUCTIONS
    // ============================================================
    const ui_instructions = {
      allowed_actions: ['view_page', 'logout'],
      input_limits: {
        text_min: 20,
        text_max: 5000,
        title_max: 140,
        email_max: 40,
        password_min: 8,
        password_max: 50
      },
      feature_flags: {},
      form_schema: {},
      cooldowns: {},
      security: {
        csrf_token: csrfToken,
        nonce,
        content_security_policy: 'strict'
      },
      display_rules: {
        show_user_menu: isAuthenticated
      }
    };

    const ui = {
      csrfToken,
      supabaseUrl: process.env.SUPABASE_URL || '',
      supabaseAnonKey: process.env.SUPABASE_ANON_KEY || ''
    };

    const app_info = {
      name: process.env.APP_NAME || 'Detechify',
      description: process.env.APP_DESCRIPTION || 'A secure modern web application',
      version: process.env.APP_VERSION || '1.0.0',
      environment: process.env.NODE_ENV || 'development'
    };

    return { page, user, ui_instructions, ui, app_info };
  } catch (err) {
    // This will show exactly what’s failing inside the presenter
    console.error('[TemplatePresenter] buildTemplateProtectedPageModel failed:', err);
    console.error('Stack trace:', err?.stack);
    throw err; // rethrow so Express still returns a 500
  }
}

module.exports = {
  buildTemplateProtectedPageModel
};