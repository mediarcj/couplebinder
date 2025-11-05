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
  }

  const basic = {
    id: req.user?.id || null,
    email: req.user?.email || null,
  };
  if (!basic.id) return basic;

  // ============================================================
  // Fetch extra metadata from Supabase Admin API (non-fatal if fails)
  // ============================================================
  let authMetadata = {};
  try {
    const { supabaseAdmin } = require('../../../utils/supabaseClient');
    const { data, error } = await supabaseAdmin.auth.admin.getUserById(basic.id);
    if (data && !error && data.user) {
      authMetadata = {
        last_sign_in_at: data.user.last_sign_in_at || null,
        created_at: data.user.created_at || null,
        updated_at: data.user.updated_at || null,
        email_confirmed_at: data.user.email_confirmed_at || null,
      };
    }
  } catch (e) {
    logger.warn(
      {
        event: 'presenter.auth_metadata_fetch_failed',
        userId: basic.id,
        error: e?.message,
      },
      'Failed to fetch auth user metadata'
    );
  }

  // ============================================================
  // Attempt to get full app profile (optional)
  // ============================================================
  let profile = null;
  try {
    const userAccessToken =
      req.cookies?.['sb-access-token'] ||
      (req.headers.authorization?.startsWith('Bearer ')
        ? req.headers.authorization.slice(7)
        : null);

    profile = await getProfileByUserId(basic.id, userAccessToken);
  } catch (e) {
    logger.warn(
      {
        event: 'presenter.profile_fetch_failed',
        userId: basic.id,
        error: e?.message || e,
      },
      'buildCanonicalUser profile fetch failed'
    );
  }

  // ============================================================
  // Small inline helpers
  // ============================================================
  const uniq = (arr) => Array.from(new Set(Array.isArray(arr) ? arr : []));
  const notNil = (x) => x !== null && x !== undefined;

  // ============================================================
  // If profile exists, merge it with auth metadata
  // ============================================================
  if (profile) {
    const rolesClean = uniq((profile.roles || []).filter(notNil));
    const amrProviders = Array.isArray(req.user?.amr)
      ? req.user.amr.map((x) => x?.method).filter(Boolean)
      : [];
    const providers =
      (Array.isArray(req.user?.app_metadata?.providers) && req.user.app_metadata.providers.length
        ? req.user.app_metadata.providers
        : amrProviders.length
        ? amrProviders
        : req.user?.app_metadata?.provider
        ? [req.user.app_metadata.provider]
        : ['email']);

    const emailConfirmed =
      typeof req.user?.user_metadata?.email_verified === 'boolean'
        ? req.user.user_metadata.email_verified
        : null;

    return {
      id: basic.id,
      email: basic.email,
      display_name:
        profile.display_name || (basic.email ? basic.email.split('@')[0] : 'User'),
      phone: profile.phone || '',
      given_name: profile.given_name || '',
      family_name: profile.family_name || '',
      avatar_url: profile.avatar_url || '',
      locale: profile.locale || '',
      timezone: profile.timezone || '',
      created_at: authMetadata.created_at || profile.created_at || null,
      updated_at: authMetadata.updated_at || profile.updated_at || null,
      last_sign_in_at: authMetadata.last_sign_in_at || profile.last_sign_in_at || null,
      email_confirmed_at: authMetadata.email_confirmed_at || null,
      email_confirmed: emailConfirmed,
      providers,
      roles: rolesClean,
    };
  }

  // ============================================================
  // Fallback to JWT metadata if no profile is available
  // ============================================================
  const md = (req.user && (req.user.user_metadata || req.user.user_meta_data)) || {};
  const first = md.first_name || '';
  const last = md.last_name || '';
  const display =
    md.display_name ||
    (first && last
      ? `${first} ${last}`
      : first || last || (basic.email ? basic.email.split('@')[0] : 'User'));

  const amrProviders = Array.isArray(req.user?.amr)
    ? req.user.amr.map((x) => x?.method).filter(Boolean)
    : [];
  const providers =
    (Array.isArray(req.user?.app_metadata?.providers) && req.user.app_metadata.providers.length
      ? req.user.app_metadata.providers
      : amrProviders.length
      ? amrProviders
      : req.user?.app_metadata?.provider
      ? [req.user.app_metadata.provider]
      : ['email']);
  const emailConfirmed =
    typeof req.user?.user_metadata?.email_verified === 'boolean'
      ? req.user.user_metadata.email_verified
      : null;

  return {
    id: basic.id,
    email: basic.email,
    display_name: display,
    phone: md.phone || '',
    given_name: first,
    family_name: last,
    avatar_url: md.avatar_url || '',
    locale: md.locale || '',
    timezone: md.timezone || '',
    created_at: authMetadata.created_at || new Date().toISOString(),
    updated_at: authMetadata.updated_at || new Date().toISOString(),
    last_sign_in_at: authMetadata.last_sign_in_at || null,
    email_confirmed_at: authMetadata.email_confirmed_at || null,
    email_confirmed: emailConfirmed,
    providers,
    roles: [],
  };
}

module.exports = { buildCanonicalUser };