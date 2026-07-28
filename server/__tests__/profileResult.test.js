// Description: Tests for authoritative profile-result classification
// Security: Provider failures and unknown privacy must fail closed

import {
  describe,
  expect,
  it
} from 'vitest';

const {
  PROFILE_REASON,
  PROFILE_STATUS,
  classifyProfileResponse,
  isEditableProfileResult,
  privacyValueForProfile
} = require('../services/profileResult');

const syntheticId = 'synthetic-profile-owner';

describe('profile result contract', () => {
  it('classifies exactly one valid row as authoritative', () => {
    const result = classifyProfileResponse({
      data: [{
        user_id: syntheticId,
        account_privacy: 'private'
      }],
      error: null
    }, syntheticId);

    expect(result.status).toBe(PROFILE_STATUS.ok);
    expect(result.profile.user_id).toBe(syntheticId);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.profile)).toBe(true);
    expect(isEditableProfileResult(result)).toBe(true);
  });

  it('classifies zero rows as genuine not found', () => {
    expect(
      classifyProfileResponse({
        data: [],
        error: null
      }, syntheticId)
    ).toEqual({
      status: PROFILE_STATUS.notFound,
      profile: null
    });
  });

  it.each([
    [{ code: '42P17' }, PROFILE_REASON.recursivePolicy],
    [{ code: '42501' }, PROFILE_REASON.permissionError],
    [{ status: 403 }, PROFILE_REASON.permissionError],
    [{ name: 'AbortError' }, PROFILE_REASON.timeout],
    [{ code: 'ETIMEDOUT' }, PROFILE_REASON.timeout],
    [{ code: 'PGRST500' }, PROFILE_REASON.providerError]
  ])('maps provider failures to a fixed unavailable category', (error, reason) => {
    const result = classifyProfileResponse({
      data: null,
      error
    }, syntheticId);

    expect(result).toEqual({
      status: PROFILE_STATUS.unavailable,
      profile: null,
      reason
    });
    expect(JSON.stringify(result)).not.toContain('synthetic-profile-owner');
  });

  it.each([
    null,
    {},
    { data: null, error: null },
    { data: [null], error: null },
    {
      data: [{ user_id: 'different-owner' }],
      error: null
    }
  ])('treats malformed successful results as unavailable', (response) => {
    expect(
      classifyProfileResponse(response, syntheticId)
        .status
    ).toBe(PROFILE_STATUS.unavailable);
  });

  it('rejects unexpected multiple rows', () => {
    const result = classifyProfileResponse({
      data: [
        { user_id: syntheticId },
        { user_id: syntheticId }
      ],
      error: null
    }, syntheticId);

    expect(result.reason).toBe(
      PROFILE_REASON.unexpectedRowCount
    );
  });

  it('treats missing or unsupported privacy as a malformed result', () => {
    const missing = classifyProfileResponse({
      data: [{ user_id: syntheticId }],
      error: null
    }, syntheticId);
    const unsupported = classifyProfileResponse({
      data: [{
        user_id: syntheticId,
        account_privacy: 'friends'
      }],
      error: null
    }, syntheticId);

    expect(missing.status).toBe(
      PROFILE_STATUS.unavailable
    );
    expect(missing.reason).toBe(
      PROFILE_REASON.malformedResult
    );
    expect(unsupported.status).toBe(
      PROFILE_STATUS.unavailable
    );
  });

  it.each([
    [{}, null],
    [{ account_privacy: null }, null],
    [{ account_privacy: '' }, null],
    [{ account_privacy: 'friends' }, null],
    [{ account_privacy: 'public' }, 'public'],
    [{ account_privacy: 'private' }, 'private'],
    [{ is_private: true }, 'private'],
    [{ is_private: false }, 'public'],
    [{
      account_privacy: 'public',
      is_private: true
    }, null]
  ])('never converts unknown privacy to public', (profile, expected) => {
    expect(privacyValueForProfile(profile))
      .toBe(expected);
  });
});
