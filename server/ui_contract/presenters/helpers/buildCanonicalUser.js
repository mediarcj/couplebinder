// ============================================================
// File: server/ui_contract/presenters/helpers/buildCanonicalUser.js
// Description: Canonical user model builder used by all presenters
// Purpose: Provides a consistent, normalized user object for EJS templates
// Notes: Extracted from presenters.js to break circular dependencies
// ============================================================

// CONNECT: This file belongs to the master protected page system.
// CLONE GUIDE:
// 1. Copy _template-protected.ejs → newpage.ejs
// 2. Copy _templatePresenter.js → newpagePresenter.js
// 3. Add route in dashboard.js → /newpage
// 4. Export new builder in presenters/index.js if needed.

const { getProfileByUserId } = require('../../../services/profileService');
// I am loading `../../../utils/logger` into `logger` so this file can reuse that dependency below.
const logger = require('../../../utils/logger');

/**
 * WHAT:
 * Build a canonical user model from the authenticated request.
 *
 * WHY:
 * Keeps one normalized source of truth for user fields.
 * Reduces duplication and makes presenters simpler and consistent.
 *
 * HOW:
 * 1. Fetches Supabase Auth metadata for accurate timestamps.
 * 2. Optionally fetches profile (v_profiles_full) for richer display fields.
 * 3. Falls back to JWT metadata if necessary.
 */
async function buildCanonicalUser(req) {
  // ============================================================
  // SAFEGUARD
  // ============================================================
  if (!req || !req.user) {
    // Defensive default if middleware didn’t inject req.user
    return { id: null, email: null, role: 'guest' };
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am saving `basic` here so the nearby steps can reuse the same value without rebuilding it each time.
  const basic = {
    // I am keeping the `id` field in this object so the receiving code can read that value by its expected name.
    id: req.user?.id || null,
    // I am keeping the `email` field in this object so the receiving code can read that value by its expected name.
    email: req.user?.email || null,
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  };
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!basic.id) return basic;

  // ============================================================
  // Fetch extra metadata from Supabase Admin API (non-fatal if fails)
  // ============================================================
  let authMetadata = {};
  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // I am loading `../../../utils/supabaseClient` into `supabaseAdmin` so this file can reuse that dependency below.
    const { supabaseAdmin } = require('../../../utils/supabaseClient');
    // I am saving `data` here so the nearby steps can reuse the same value without rebuilding it each time.
    const { data, error } = await supabaseAdmin.auth.admin.getUserById(basic.id);
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (data && !error && data.user) {
      // I am keeping this line here because the surrounding buildCanonicalUser.js workflow expects this value or operation before it continues.
      authMetadata = {
        // I am keeping the `last_sign_in_at` field in this object so the receiving code can read that value by its expected name.
        last_sign_in_at: data.user.last_sign_in_at || null,
        // I am keeping the `created_at` field in this object so the receiving code can read that value by its expected name.
        created_at: data.user.created_at || null,
        // I am keeping the `updated_at` field in this object so the receiving code can read that value by its expected name.
        updated_at: data.user.updated_at || null,
        // I am keeping the `email_confirmed_at` field in this object so the receiving code can read that value by its expected name.
        email_confirmed_at: data.user.email_confirmed_at || null,
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      };
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (e) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.warn(
      // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
      {
        // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
        event: 'presenter.auth_metadata_fetch_failed',
        // I am keeping the `userId` field in this object so the receiving code can read that value by its expected name.
        userId: basic.id,
        // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
        error: e?.message,
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      },
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      'Failed to fetch auth user metadata'
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    );
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // ============================================================
  // Attempt to get full app profile (optional)
  // ============================================================
  let profile = null;
  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // I am saving `userAccessToken` here so the nearby steps can reuse the same value without rebuilding it each time.
    const userAccessToken =
      // I am keeping this line here because the surrounding buildCanonicalUser.js workflow expects this value or operation before it continues.
      req.cookies?.['sb-access-token'] ||
      // I am keeping this line here because the surrounding buildCanonicalUser.js workflow expects this value or operation before it continues.
      (req.headers.authorization?.startsWith('Bearer ')
        // I am keeping this line here because the surrounding buildCanonicalUser.js workflow expects this value or operation before it continues.
        ? req.headers.authorization.slice(7)
        // I am keeping this line here because the surrounding buildCanonicalUser.js workflow expects this value or operation before it continues.
        : null);

    // I am waiting for this asynchronous step here so the next line does not use its result before it is ready.
    profile = await getProfileByUserId(basic.id, userAccessToken);
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (e) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.warn(
      // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
      {
        // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
        event: 'presenter.profile_fetch_failed',
        // I am keeping the `userId` field in this object so the receiving code can read that value by its expected name.
        userId: basic.id,
        // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
        error: e?.message || e,
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      },
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      'buildCanonicalUser profile fetch failed'
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    );
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // ============================================================
  // Small inline helpers
  // ============================================================
  const uniq = (arr) => Array.from(new Set(Array.isArray(arr) ? arr : []));
  // I am saving `notNil` here so the nearby steps can reuse the same value without rebuilding it each time.
  const notNil = (x) => x !== null && x !== undefined;

  // ============================================================
  // If profile exists, merge it with auth metadata
  // ============================================================
  if (profile) {
    // I am saving `rolesClean` here so the nearby steps can reuse the same value without rebuilding it each time.
    const rolesClean = uniq((profile.roles || []).filter(notNil));
    // I am saving `amrProviders` here so the nearby steps can reuse the same value without rebuilding it each time.
    const amrProviders = Array.isArray(req.user?.amr)
      // I am mapping the collection here so each input item becomes the output shape expected by the next step.
      ? req.user.amr.map((x) => x?.method).filter(Boolean)
      // I am keeping this line here because the surrounding buildCanonicalUser.js workflow expects this value or operation before it continues.
      : [];
    // I am saving `providers` here so the nearby steps can reuse the same value without rebuilding it each time.
    const providers =
      // I am keeping this line here because the surrounding buildCanonicalUser.js workflow expects this value or operation before it continues.
      (Array.isArray(req.user?.app_metadata?.providers) && req.user.app_metadata.providers.length
        // I am keeping this line here because the surrounding buildCanonicalUser.js workflow expects this value or operation before it continues.
        ? req.user.app_metadata.providers
        // I am keeping this line here because the surrounding buildCanonicalUser.js workflow expects this value or operation before it continues.
        : amrProviders.length
        // I am keeping this line here because the surrounding buildCanonicalUser.js workflow expects this value or operation before it continues.
        ? amrProviders
        // I am keeping this line here because the surrounding buildCanonicalUser.js workflow expects this value or operation before it continues.
        : req.user?.app_metadata?.provider
        // I am keeping this line here because the surrounding buildCanonicalUser.js workflow expects this value or operation before it continues.
        ? [req.user.app_metadata.provider]
        // I am keeping this line here because the surrounding buildCanonicalUser.js workflow expects this value or operation before it continues.
        : ['email']);

    // I am saving `emailConfirmed` here so the nearby steps can reuse the same value without rebuilding it each time.
    const emailConfirmed =
      // I am keeping this line here because the surrounding buildCanonicalUser.js workflow expects this value or operation before it continues.
      typeof req.user?.user_metadata?.email_verified === 'boolean'
        // I am keeping this line here because the surrounding buildCanonicalUser.js workflow expects this value or operation before it continues.
        ? req.user.user_metadata.email_verified
        // I am keeping this line here because the surrounding buildCanonicalUser.js workflow expects this value or operation before it continues.
        : null;

    // This return sends the completed value or response back to the code that called this function.
    return {
      // I am keeping the `id` field in this object so the receiving code can read that value by its expected name.
      id: basic.id,
      // I am keeping the `email` field in this object so the receiving code can read that value by its expected name.
      email: basic.email,
      // I am keeping the `display_name` field in this object so the receiving code can read that value by its expected name.
      display_name:
        // I am keeping this line here because the surrounding buildCanonicalUser.js workflow expects this value or operation before it continues.
        profile.display_name || (basic.email ? basic.email.split('@')[0] : 'User'),
      // I am keeping the `phone` field in this object so the receiving code can read that value by its expected name.
      phone: profile.phone || '',
      // I am keeping the `given_name` field in this object so the receiving code can read that value by its expected name.
      given_name: profile.given_name || '',
      // I am keeping the `family_name` field in this object so the receiving code can read that value by its expected name.
      family_name: profile.family_name || '',
      // I am keeping the `avatar_url` field in this object so the receiving code can read that value by its expected name.
      avatar_url: profile.avatar_url || '',
      // I am keeping the `locale` field in this object so the receiving code can read that value by its expected name.
      locale: profile.locale || '',
      // I am keeping the `timezone` field in this object so the receiving code can read that value by its expected name.
      timezone: profile.timezone || '',
      // I am keeping the `created_at` field in this object so the receiving code can read that value by its expected name.
      created_at: authMetadata.created_at || profile.created_at || null,
      // I am keeping the `updated_at` field in this object so the receiving code can read that value by its expected name.
      updated_at: authMetadata.updated_at || profile.updated_at || null,
      // I am keeping the `last_sign_in_at` field in this object so the receiving code can read that value by its expected name.
      last_sign_in_at: authMetadata.last_sign_in_at || profile.last_sign_in_at || null,
      // I am keeping the `email_confirmed_at` field in this object so the receiving code can read that value by its expected name.
      email_confirmed_at: authMetadata.email_confirmed_at || null,
      // I am keeping the `email_confirmed` field in this object so the receiving code can read that value by its expected name.
      email_confirmed: emailConfirmed,
      // I am keeping this line here because the surrounding buildCanonicalUser.js workflow expects this value or operation before it continues.
      providers,
      // I am keeping the `roles` field in this object so the receiving code can read that value by its expected name.
      roles: rolesClean,
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    };
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // ============================================================
  // Fallback to JWT metadata if no profile is available
  // ============================================================
  const md = (req.user && (req.user.user_metadata || req.user.user_meta_data)) || {};
  // I am saving `first` here so the nearby steps can reuse the same value without rebuilding it each time.
  const first = md.first_name || '';
  // I am saving `last` here so the nearby steps can reuse the same value without rebuilding it each time.
  const last = md.last_name || '';
  // I am saving `display` here so the nearby steps can reuse the same value without rebuilding it each time.
  const display =
    // I am keeping this line here because the surrounding buildCanonicalUser.js workflow expects this value or operation before it continues.
    md.display_name ||
    // I am keeping this line here because the surrounding buildCanonicalUser.js workflow expects this value or operation before it continues.
    (first && last
      // I am keeping this line here because the surrounding buildCanonicalUser.js workflow expects this value or operation before it continues.
      ? `${first} ${last}`
      // I am keeping this line here because the surrounding buildCanonicalUser.js workflow expects this value or operation before it continues.
      : first || last || (basic.email ? basic.email.split('@')[0] : 'User'));

  // I am saving `amrProviders` here so the nearby steps can reuse the same value without rebuilding it each time.
  const amrProviders = Array.isArray(req.user?.amr)
    // I am mapping the collection here so each input item becomes the output shape expected by the next step.
    ? req.user.amr.map((x) => x?.method).filter(Boolean)
    // I am keeping this line here because the surrounding buildCanonicalUser.js workflow expects this value or operation before it continues.
    : [];
  // I am saving `providers` here so the nearby steps can reuse the same value without rebuilding it each time.
  const providers =
    // I am keeping this line here because the surrounding buildCanonicalUser.js workflow expects this value or operation before it continues.
    (Array.isArray(req.user?.app_metadata?.providers) && req.user.app_metadata.providers.length
      // I am keeping this line here because the surrounding buildCanonicalUser.js workflow expects this value or operation before it continues.
      ? req.user.app_metadata.providers
      // I am keeping this line here because the surrounding buildCanonicalUser.js workflow expects this value or operation before it continues.
      : amrProviders.length
      // I am keeping this line here because the surrounding buildCanonicalUser.js workflow expects this value or operation before it continues.
      ? amrProviders
      // I am keeping this line here because the surrounding buildCanonicalUser.js workflow expects this value or operation before it continues.
      : req.user?.app_metadata?.provider
      // I am keeping this line here because the surrounding buildCanonicalUser.js workflow expects this value or operation before it continues.
      ? [req.user.app_metadata.provider]
      // I am keeping this line here because the surrounding buildCanonicalUser.js workflow expects this value or operation before it continues.
      : ['email']);
  // I am saving `emailConfirmed` here so the nearby steps can reuse the same value without rebuilding it each time.
  const emailConfirmed =
    // I am keeping this line here because the surrounding buildCanonicalUser.js workflow expects this value or operation before it continues.
    typeof req.user?.user_metadata?.email_verified === 'boolean'
      // I am keeping this line here because the surrounding buildCanonicalUser.js workflow expects this value or operation before it continues.
      ? req.user.user_metadata.email_verified
      // I am keeping this line here because the surrounding buildCanonicalUser.js workflow expects this value or operation before it continues.
      : null;

  // This return sends the completed value or response back to the code that called this function.
  return {
    // I am keeping the `id` field in this object so the receiving code can read that value by its expected name.
    id: basic.id,
    // I am keeping the `email` field in this object so the receiving code can read that value by its expected name.
    email: basic.email,
    // I am keeping the `display_name` field in this object so the receiving code can read that value by its expected name.
    display_name: display,
    // I am keeping the `phone` field in this object so the receiving code can read that value by its expected name.
    phone: md.phone || '',
    // I am keeping the `given_name` field in this object so the receiving code can read that value by its expected name.
    given_name: first,
    // I am keeping the `family_name` field in this object so the receiving code can read that value by its expected name.
    family_name: last,
    // I am keeping the `avatar_url` field in this object so the receiving code can read that value by its expected name.
    avatar_url: md.avatar_url || '',
    // I am keeping the `locale` field in this object so the receiving code can read that value by its expected name.
    locale: md.locale || '',
    // I am keeping the `timezone` field in this object so the receiving code can read that value by its expected name.
    timezone: md.timezone || '',
    // I am keeping the `created_at` field in this object so the receiving code can read that value by its expected name.
    created_at: authMetadata.created_at || new Date().toISOString(),
    // I am keeping the `updated_at` field in this object so the receiving code can read that value by its expected name.
    updated_at: authMetadata.updated_at || new Date().toISOString(),
    // I am keeping the `last_sign_in_at` field in this object so the receiving code can read that value by its expected name.
    last_sign_in_at: authMetadata.last_sign_in_at || null,
    // I am keeping the `email_confirmed_at` field in this object so the receiving code can read that value by its expected name.
    email_confirmed_at: authMetadata.email_confirmed_at || null,
    // I am keeping the `email_confirmed` field in this object so the receiving code can read that value by its expected name.
    email_confirmed: emailConfirmed,
    // I am keeping this line here because the surrounding buildCanonicalUser.js workflow expects this value or operation before it continues.
    providers,
    // I am keeping the `roles` field in this object so the receiving code can read that value by its expected name.
    roles: [],
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  };
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am exporting this value here so another module can deliberately reuse the completed piece from buildCanonicalUser.js.
module.exports = { buildCanonicalUser };