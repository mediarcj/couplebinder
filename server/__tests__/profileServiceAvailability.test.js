// Description: Tests profile service classification at the Supabase boundary
// Security: Database errors cannot collapse into missing-profile nulls

import {
  afterEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

const service =
  require('../services/profileService');

function clientFor(response) {
  const limit = vi.fn().mockResolvedValue(response);
  const eq = vi.fn(() => ({ limit }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return {
    client: { from },
    limit
  };
}

describe('profile service availability', () => {
  afterEach(() => {
    service._resetTestDependencies();
  });

  it('returns not_found only for a successful zero-row response', async () => {
    const { client, limit } = clientFor({
      data: [],
      error: null
    });
    service._setTestDependencies({
      createClientImpl: () => client,
      testLogger: {
        warn: vi.fn()
      }
    });

    const result = await service.getProfileByUserId(
      'synthetic-owner',
      'synthetic-token'
    );

    expect(result.status).toBe('not_found');
    expect(limit).toHaveBeenCalledWith(2);
  });

  it('returns unavailable for recursive RLS instead of null', async () => {
    const { client } = clientFor({
      data: null,
      error: {
        code: '42P17',
        message: 'private provider detail'
      }
    });
    const warn = vi.fn();
    service._setTestDependencies({
      createClientImpl: () => client,
      testLogger: { warn }
    });

    const result = await service.getProfileByUserId(
      'synthetic-owner',
      'synthetic-token'
    );

    expect(result).toEqual({
      status: 'unavailable',
      profile: null,
      reason: 'recursive_policy'
    });
    expect(JSON.stringify(warn.mock.calls))
      .not.toContain('private provider detail');
    expect(JSON.stringify(warn.mock.calls))
      .not.toContain('synthetic-owner');
  });

  it('fails closed when verified user context is missing', async () => {
    const warn = vi.fn();
    service._setTestDependencies({
      testLogger: { warn }
    });

    const result = await service.getProfileByUserId(
      'synthetic-owner',
      null
    );

    expect(result.status).toBe('unavailable');
    expect(result.reason).toBe('permission_error');
  });
});
