// ============================================================
// File: server/ui_contract/presenters/_templatePresenter.js
// Description: Presenter for the master protected EJS template
// Purpose: Builds the page model (page, user, ui_instructions, ui, app_info)
// Purpose: Orchestrates helpers to build full page model
// ============================================================

// CONNECT: This file belongs to the master protected page system.
// CLONE GUIDE:
// 1. Copy _template-protected.ejs → newpage.ejs
// 2. Copy _templatePresenter.js → newpagePresenter.js
// 3. Add route in dashboard.js → /newpage
// 4. Export new builder in presenters/index.js if needed.

const { buildCanonicalUser } = require('./helpers/buildCanonicalUser');
const { buildPageMetadata } = require('./helpers/buildPageMetadata');
const { buildUiInstructions } = require('./helpers/buildUiInstructions');
const { buildAppInfo } = require('./helpers/buildAppInfo');

/**
 * Build model for any protected page using master template.
 */
async function buildTemplateProtectedPageModel(req, res, opts = {}) {
  const user = await buildCanonicalUser(req);
  const isAuthenticated = Boolean(user && user.id);
  const nonce = res.locals.nonce || '';
  const csrfToken = res.locals.csrfToken || '';

  const page = buildPageMetadata(req, res, {
    title: opts.title || 'Template Protected Page',
    description: opts.description || 'Master protected page template.',
    type: 'template-protected',
  });

  const ui_instructions = buildUiInstructions({
    isAuthenticated,
    csrfToken,
    nonce,
  });

  const ui = {
    csrfToken,
    supabaseUrl: process.env.SUPABASE_URL || '',
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
  };

  const app_info = buildAppInfo();

  return { page, user, ui_instructions, ui, app_info };
}

module.exports = { buildTemplateProtectedPageModel };