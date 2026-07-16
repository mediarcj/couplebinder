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
// I am loading `./helpers/buildPageMetadata` into `buildPageMetadata` so this file can reuse that dependency below.
const { buildPageMetadata } = require('./helpers/buildPageMetadata');
// I am loading `./helpers/buildUiInstructions` into `buildUiInstructions` so this file can reuse that dependency below.
const { buildUiInstructions } = require('./helpers/buildUiInstructions');
// I am loading `./helpers/buildAppInfo` into `buildAppInfo` so this file can reuse that dependency below.
const { buildAppInfo } = require('./helpers/buildAppInfo');
// I am loading `../../config` into `config` so this file can reuse that dependency below.
const { config } = require('../../config');

/**
 * Build model for any protected page using master template.
 */
async function buildTemplateProtectedPageModel(req, res, opts = {}) {
  // I am saving `user` here so the nearby steps can reuse the same value without rebuilding it each time.
  const user = await buildCanonicalUser(req);
  // I am saving `isAuthenticated` here so the nearby steps can reuse the same value without rebuilding it each time.
  const isAuthenticated = Boolean(user && user.id);
  // I am saving `nonce` here so the nearby steps can reuse the same value without rebuilding it each time.
  const nonce = res.locals.nonce || '';
  // I am saving `csrfToken` here so the nearby steps can reuse the same value without rebuilding it each time.
  const csrfToken = res.locals.csrfToken || '';

  // I am saving `page` here so the nearby steps can reuse the same value without rebuilding it each time.
  const page = buildPageMetadata(req, res, {
    // I am keeping the `title` field in this object so the receiving code can read that value by its expected name.
    title: opts.title || 'Template Protected Page',
    // I am keeping the `description` field in this object so the receiving code can read that value by its expected name.
    description: opts.description || 'Master protected page template.',
    // I am keeping the `type` field in this object so the receiving code can read that value by its expected name.
    type: 'template-protected',
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });

  // I am saving `ui_instructions` here so the nearby steps can reuse the same value without rebuilding it each time.
  const ui_instructions = buildUiInstructions({
    // I am keeping this line here because the surrounding _templatePresenter.js workflow expects this value or operation before it continues.
    isAuthenticated,
    // I am keeping this line here because the surrounding _templatePresenter.js workflow expects this value or operation before it continues.
    csrfToken,
    // I am keeping this line here because the surrounding _templatePresenter.js workflow expects this value or operation before it continues.
    nonce,
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });

  // I am saving `ui` here so the nearby steps can reuse the same value without rebuilding it each time.
  const ui = {
    // I am keeping this line here because the surrounding _templatePresenter.js workflow expects this value or operation before it continues.
    csrfToken,
    // I am keeping the `supabaseUrl` field in this object so the receiving code can read that value by its expected name.
    supabaseUrl: config.supabase.url || '',
    // I am keeping the `supabaseAnonKey` field in this object so the receiving code can read that value by its expected name.
    supabaseAnonKey: config.supabase.anonKey || '',
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  };

  // I am saving `app_info` here so the nearby steps can reuse the same value without rebuilding it each time.
  const app_info = buildAppInfo();

  // This return sends the completed value or response back to the code that called this function.
  return { page, user, ui_instructions, ui, app_info };
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am exporting this value here so another module can deliberately reuse the completed piece from _templatePresenter.js.
module.exports = { buildTemplateProtectedPageModel };