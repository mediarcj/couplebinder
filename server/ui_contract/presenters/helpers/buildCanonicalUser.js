// Description: Canonical user model builder used by all presenters
// Purpose: Provides a consistent, normalized user object for EJS templates
// Notes: Extracted from presenters.js to break circular dependencies

// CONNECT: This file belongs to the master protected page system.
// CLONE GUIDE:
// 1. Copy _template-protected.ejs → newpage.ejs
// 2. Copy _templatePresenter.js → newpagePresenter.js
// 3. Add route in dashboard.js → /newpage
// 4. Export new builder in presenters/index.js if needed.

const { getProfileByUserId } = require('../../../services/profileService');
const logger = require('../../../utils/logger');
const { timeAsync } = require('../../../middleware/requestTiming');
const { getVerifiedAuth } = require('../../../lib/verifiedAuth');
const { assertUser, hasUser } = require('../../../utils/authz');
const {
  getRequestRoleAuthority
} = require('../../../security/roleAuthority');

/**
 * Build a canonical user model from the authenticated request.
 *
 * Keeps one normalized source of truth for user fields.
 * Reduces duplication and makes presenters simpler and consistent.
 *
 * 1. Fetches the RLS-protected profile view for richer display fields.
 * 2. Falls back to verified JWT metadata if necessary.
 */
async function buildCanonicalUserInternal(req) {
  // SAFEGUARD
  if (!req || !hasUser(req)) {
    // Defensive default if middleware didn’t inject req.user
    return {
      id: null,
      email: null,
      role: 'guest',
      roles: []
    };
  }

  const authenticatedUser = assertUser(req);
  const productRoles =
    getRequestRoleAuthority(req).roles;
  const basic = {
    id: authenticatedUser.id || null,
    email: authenticatedUser.email || null,
  };
  if (!basic.id) return basic;

  // Attempt to get full app profile (optional)
  let profile = null;
  try {
    const userAccessToken = getVerifiedAuth(req)?.token || null;

    profile = await timeAsync(
      req,
      'profile',
      () => getProfileByUserId(basic.id, userAccessToken)
    );
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

  // If profile exists, merge it with verified identity claims.
  if (profile) {
    const amrProviders = Array.isArray(authenticatedUser.amr)
      ? authenticatedUser.amr.map((x) => x?.method).filter(Boolean)
      : [];
    const providers =
      (Array.isArray(authenticatedUser.app_metadata?.providers) && authenticatedUser.app_metadata.providers.length
        ? authenticatedUser.app_metadata.providers
        : amrProviders.length
        ? amrProviders
        : authenticatedUser.app_metadata?.provider
        ? [authenticatedUser.app_metadata.provider]
        : ['email']);

    const emailConfirmed =
      typeof authenticatedUser.user_metadata?.email_verified === 'boolean'
        ? authenticatedUser.user_metadata.email_verified
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
      created_at: profile.created_at || null,
      updated_at: profile.updated_at || null,
      last_sign_in_at: profile.last_sign_in_at || null,
      email_confirmed_at: null,
      email_confirmed: emailConfirmed,
      providers,
      roles: productRoles,
    };
  }

  // Fallback to JWT metadata if no profile is available
  const md = authenticatedUser.user_metadata || authenticatedUser.user_meta_data || {};
  const first = md.first_name || '';
  const last = md.last_name || '';
  const display =
    md.display_name ||
    (first && last
      ? `${first} ${last}`
      : first || last || (basic.email ? basic.email.split('@')[0] : 'User'));

  const amrProviders = Array.isArray(authenticatedUser.amr)
    ? authenticatedUser.amr.map((x) => x?.method).filter(Boolean)
    : [];
  const providers =
    (Array.isArray(authenticatedUser.app_metadata?.providers) && authenticatedUser.app_metadata.providers.length
      ? authenticatedUser.app_metadata.providers
      : amrProviders.length
      ? amrProviders
      : authenticatedUser.app_metadata?.provider
      ? [authenticatedUser.app_metadata.provider]
      : ['email']);
  const emailConfirmed =
    typeof authenticatedUser.user_metadata?.email_verified === 'boolean'
      ? authenticatedUser.user_metadata.email_verified
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
    created_at: null,
    updated_at: null,
    last_sign_in_at: null,
    email_confirmed_at: null,
    email_confirmed: emailConfirmed,
    providers,
    roles: productRoles,
  };
}

async function buildCanonicalUser(req) {
  return timeAsync(req, 'canonical_user', () => buildCanonicalUserInternal(req));
}

module.exports = { buildCanonicalUser };
