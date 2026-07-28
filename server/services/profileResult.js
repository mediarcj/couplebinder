// Description: Explicit result contract for authoritative profile reads
// Purpose: Keep missing rows separate from provider and policy failures
// Security: Only fixed, privacy-safe status and reason categories leave this module

'use strict';

const PROFILE_STATUS = Object.freeze({
  ok: 'ok',
  notFound: 'not_found',
  unavailable: 'unavailable'
});

const PROFILE_REASON = Object.freeze({
  providerError: 'provider_error',
  recursivePolicy: 'recursive_policy',
  permissionError: 'permission_error',
  timeout: 'timeout',
  malformedResult: 'malformed_result',
  unexpectedRowCount: 'unexpected_row_count',
  unknown: 'unknown'
});

const ALLOWED_REASONS = new Set(
  Object.values(PROFILE_REASON)
);

function freezeProfile(profile) {
  const copy = {};

  for (const [key, value] of Object.entries(profile)) {
    copy[key] = Array.isArray(value)
      ? Object.freeze([...value])
      : value;
  }

  return Object.freeze(copy);
}

function ok(profile) {
  if (
    !profile ||
    typeof profile !== 'object' ||
    Array.isArray(profile) ||
    !privacyValueForProfile(profile)
  ) {
    return unavailable(PROFILE_REASON.malformedResult);
  }

  return Object.freeze({
    status: PROFILE_STATUS.ok,
    profile: freezeProfile(profile)
  });
}

const NOT_FOUND_RESULT = Object.freeze({
  status: PROFILE_STATUS.notFound,
  profile: null
});

function notFound() {
  return NOT_FOUND_RESULT;
}

function unavailable(reason = PROFILE_REASON.unknown) {
  const safeReason = ALLOWED_REASONS.has(reason)
    ? reason
    : PROFILE_REASON.unknown;

  return Object.freeze({
    status: PROFILE_STATUS.unavailable,
    profile: null,
    reason: safeReason
  });
}

function reasonFromProviderError(error) {
  const code = String(error?.code || '').toUpperCase();
  const name = String(error?.name || '').toLowerCase();
  const status = Number(error?.status || error?.statusCode || 0);

  if (code === '42P17') {
    return PROFILE_REASON.recursivePolicy;
  }

  if (
    code === '42501' ||
    code === 'PGRST301' ||
    status === 401 ||
    status === 403
  ) {
    return PROFILE_REASON.permissionError;
  }

  if (
    name === 'aborterror' ||
    name === 'timeouterror' ||
    code === 'ETIMEDOUT' ||
    code === 'ESOCKETTIMEDOUT'
  ) {
    return PROFILE_REASON.timeout;
  }

  return PROFILE_REASON.providerError;
}

function classifyProfileResponse(
  response,
  expectedUserId
) {
  if (!response || typeof response !== 'object') {
    return unavailable(PROFILE_REASON.malformedResult);
  }

  if (response.error) {
    return unavailable(
      reasonFromProviderError(response.error)
    );
  }

  if (!Array.isArray(response.data)) {
    return unavailable(PROFILE_REASON.malformedResult);
  }

  if (response.data.length === 0) {
    return notFound();
  }

  if (response.data.length !== 1) {
    return unavailable(
      PROFILE_REASON.unexpectedRowCount
    );
  }

  const profile = response.data[0];
  if (
    !profile ||
    typeof profile !== 'object' ||
    Array.isArray(profile) ||
    typeof profile.user_id !== 'string' ||
    !profile.user_id
  ) {
    return unavailable(PROFILE_REASON.malformedResult);
  }

  if (
    expectedUserId &&
    profile.user_id !== expectedUserId
  ) {
    return unavailable(PROFILE_REASON.malformedResult);
  }

  return ok(profile);
}

function privacyValueForProfile(profile) {
  if (!profile || typeof profile !== 'object') {
    return null;
  }

  const hasStoredPrivacy =
    Object.prototype.hasOwnProperty.call(
      profile,
      'account_privacy'
    );
  const storedPrivacy =
    profile.account_privacy === 'public' ||
    profile.account_privacy === 'private'
      ? profile.account_privacy
      : null;

  if (hasStoredPrivacy && !storedPrivacy) {
    return null;
  }

  if (typeof profile.is_private === 'boolean') {
    const booleanPrivacy = profile.is_private
      ? 'private'
      : 'public';

    if (
      storedPrivacy &&
      storedPrivacy !== booleanPrivacy
    ) {
      return null;
    }

    return booleanPrivacy;
  }

  return storedPrivacy;
}

function isEditableProfileResult(result) {
  return Boolean(
    result?.status === PROFILE_STATUS.ok &&
    privacyValueForProfile(result.profile)
  );
}

module.exports = {
  PROFILE_REASON,
  PROFILE_STATUS,
  classifyProfileResponse,
  isEditableProfileResult,
  notFound,
  ok,
  privacyValueForProfile,
  reasonFromProviderError,
  unavailable
};
