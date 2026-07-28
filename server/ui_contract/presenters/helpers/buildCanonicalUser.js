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
const {
  PROFILE_REASON,
  PROFILE_STATUS,
  isEditableProfileResult,
  privacyValueForProfile,
  unavailable
} = require('../../../services/profileResult');
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
      roles: [],
      profile_status: PROFILE_STATUS.notFound,
      profile_authoritative: false,
      profile_editable: false
    };
  }

  const authenticatedUser = assertUser(req);
  const productRoles =
    getRequestRoleAuthority(req).roles;
  const basic = {
    id: authenticatedUser.id || null,
    email: authenticatedUser.email || null,
  };
  if (!basic.id) {
    return {
      ...basic,
      roles: productRoles,
      profile_status: PROFILE_STATUS.unavailable,
      profile_authoritative: false,
      profile_editable: false
    };
  }

  // Profile data has a separate availability contract from verified identity.
  // Provider failures remain unavailable and never become a synthetic profile.
  let profileResult = unavailable(PROFILE_REASON.unknown);
  try {
    const userAccessToken = getVerifiedAuth(req)?.token || null;
    const profileReader =
      req.app?.locals
        ?.getProfileByUserIdOverride ||
      getProfileByUserId;

    profileResult = await timeAsync(
      req,
      'profile',
      () => profileReader(basic.id, userAccessToken)
    );
  } catch {
    logger.warn(
      {
        event: 'presenter.profile_fetch_failed',
        reason: PROFILE_REASON.unknown
      },
      'buildCanonicalUser profile fetch failed'
    );
  }

  // Only an explicit ok result may supply editable database profile fields.
  if (profileResult.status === PROFILE_STATUS.ok) {
    const profile = profileResult.profile;
    const accountPrivacy =
      privacyValueForProfile(profile);
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
      profile_status: PROFILE_STATUS.ok,
      profile_authoritative: true,
      profile_editable:
        isEditableProfileResult(profileResult),
      account_privacy: accountPrivacy,
      is_private:
        typeof profile.is_private === 'boolean'
          ? profile.is_private
          : accountPrivacy
            ? accountPrivacy === 'private'
            : null,
      birthday: profile.birthday || '',
      gender: profile.gender || '',
      language: profile.language || '',
      city_province: profile.city_province || '',
      country: profile.country || '',
      social_media1: profile.social_media1 || '',
      social_media2: profile.social_media2 || '',
      social_media3: profile.social_media3 || '',
      relationship_status:
        profile.relationship_status || '',
      job: profile.job || '',
      hobbies: profile.hobbies || '',
      music: profile.music || '',
      fav_food: profile.fav_food || '',
      profile_title: profile.profile_title || '',
      profile_description:
        profile.profile_description || ''
    };
  }

  // A missing or unavailable database profile keeps only minimal verified
  // identity. JWT metadata must not prefill an existing-profile edit form.
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
      basic.email
        ? basic.email.split('@')[0]
        : 'User',
    created_at: null,
    updated_at: null,
    last_sign_in_at: null,
    email_confirmed_at: null,
    email_confirmed: emailConfirmed,
    providers,
    roles: productRoles,
    profile_status:
      profileResult.status === PROFILE_STATUS.notFound
        ? PROFILE_STATUS.notFound
        : PROFILE_STATUS.unavailable,
    profile_authoritative: false,
    profile_editable: false
  };
}

async function buildCanonicalUser(req) {
  return timeAsync(req, 'canonical_user', () => buildCanonicalUserInternal(req));
}

module.exports = { buildCanonicalUser };
