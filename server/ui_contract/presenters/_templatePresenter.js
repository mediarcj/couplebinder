// ============================================================
// File: server/ui_contract/presenters/_templatePresenter.js
// Description: Presenter for the master protected EJS template
// Purpose: Builds the page model (page, user, ui_instructions, ui, app_info)
// Notes: Keep WHAT/WHY/HOW comments short; follow nonce + CSRF rules
// ============================================================

const navManager = require('../navigation/manager');
const { buildCanonicalUser } = require('./presenters'); // existing helper; keeps one source of truth

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
  // UI INSTRUCTIONS (Building Law #9 — backend tells UI what to do)
  // Keep simple; no secrets; mirrors server-side limits/flags
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
    feature_flags: {
      // CONNECT: ADD-NEW-HERE (set feature flags for the new page)
      // example_flag: true
    },
    form_schema: {
      // CONNECT: ADD-NEW-HERE (describe expected form fields if the page has a form)
      // message: { required: false, min: 0, max: 5000 }
    },
    cooldowns: {
      // CONNECT: ADD-NEW-HERE (page-specific cooldowns if any)
      // submit_message: 0
    },
    security: {
      csrf_token: csrfToken,
      nonce,
      content_security_policy: 'strict'
    },
    display_rules: {
      show_user_menu: isAuthenticated,
      // CONNECT: ADD-NEW-HERE (toggle visibility of sections)
      // show_form: true
    }
  };

  // ============================================================
  // UI CONFIG (public values only)
  // ============================================================
  const ui = {
    csrfToken,
    supabaseUrl: process.env.SUPABASE_URL || '',
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || ''
  };

  // ============================================================
  // APP INFO (static, non-sensitive)
  // ============================================================
  const app_info = {
    name: process.env.APP_NAME || 'Detechify',
    description: process.env.APP_DESCRIPTION || 'A secure modern web application',
    version: process.env.APP_VERSION || '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  };

  return {
    page,
    user,
    ui_instructions,
    ui,
    app_info
  };
}

module.exports = {
  buildTemplateProtectedPageModel
};