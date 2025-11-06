// ============================================================
// File: server/ui_contract/presenters/_profilePresenter.js
// Description: Presenter for Profile Protected Page
// Purpose: Builds the page model (page, user, ui_instructions, ui, app_info)
// Notes: Orchestrates helpers to build full page model for profile view.
// ============================================================

const { buildCanonicalUser } = require('./helpers/buildCanonicalUser');
const { buildPageMetadata } = require('./helpers/buildPageMetadata');
const { buildUiInstructions } = require('./helpers/buildUiInstructions');
const { buildAppInfo } = require('./helpers/buildAppInfo');

/**
 * Build model for any protected page using master template.
 */
async function buildProfileProtectedPageModel(req, res, opts = {}) {
  const user = await buildCanonicalUser(req);
  const isAuthenticated = Boolean(user && user.id);
  const nonce = res.locals.nonce || '';
  const csrfToken = res.locals.csrfToken || '';

  const page = buildPageMetadata(req, res, {
    title: opts.title || 'Profile Protected Page',
    description: opts.description || 'Clone of the master protected template.',
    type: 'profile-protected',
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

module.exports = { buildProfileProtectedPageModel };