// Description: Direct route-handler tests for profile read and write gates
// Security: Unavailable or missing profiles cannot reach profile mutation

import {
  describe,
  expect,
  it,
  vi
} from 'vitest';

const profileRouter = require('../routes/profile');
const {
  getOwnProfileHandler,
  requireEditableProfile,
  updateOwnProfileHandler
} = profileRouter._test;
const {
  notFound,
  ok,
  unavailable
} = require('../services/profileResult');

function responseDouble() {
  return {
    headers: {},
    statusCode: 200,
    body: null,
    set(name, value) {
      this.headers[name.toLowerCase()] = value;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    }
  };
}

function requestWithResult(result) {
  return {
    app: {
      locals: {
        getProfileByUserIdOverride:
          vi.fn().mockResolvedValue(result)
      }
    },
    user: {
      id: 'synthetic-owner'
    },
    requestId: 'synthetic-request'
  };
}

describe('profile API availability', () => {
  it('returns a stable 404 only for genuine absence', async () => {
    const req = requestWithResult(notFound());
    const res = responseDouble();

    await getOwnProfileHandler(req, res);

    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('profile_not_found');
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('returns a fixed 503 without leaking provider detail', async () => {
    const req = requestWithResult(
      unavailable('recursive_policy')
    );
    const res = responseDouble();

    await getOwnProfileHandler(req, res);

    expect(res.statusCode).toBe(503);
    expect(res.body).toEqual({
      success: false,
      error: 'profile_unavailable'
    });
    expect(JSON.stringify(res.body))
      .not.toContain('42P17');
  });

  it('returns an authoritative profile on success', async () => {
    const req = requestWithResult(ok({
      user_id: 'synthetic-owner',
      account_privacy: 'private'
    }));
    const res = responseDouble();

    await getOwnProfileHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.profile.user_id)
      .toBe('synthetic-owner');
  });

  it.each([
    ['not_found', notFound(), 404],
    [
      'unavailable',
      unavailable('provider_error'),
      503
    ],
    [
      'unknown privacy',
      ok({ user_id: 'synthetic-owner' }),
      503
    ]
  ])('blocks writes for %s', async (_label, result, status) => {
    const req = requestWithResult(result);
    const res = responseDouble();
    const next = vi.fn();

    await requireEditableProfile(req, res, next);

    expect(res.statusCode).toBe(status);
    expect(next).not.toHaveBeenCalled();
  });

  it('allows a write precondition only for an authoritative editable profile', async () => {
    const result = ok({
      user_id: 'synthetic-owner',
      account_privacy: 'private'
    });
    const req = requestWithResult(result);
    const res = responseDouble();
    const next = vi.fn();

    await requireEditableProfile(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.authoritativeProfile)
      .toBe(result.profile);
  });

  it('uses the server-derived user id for the update', async () => {
    const update = vi.fn().mockResolvedValue({
      user_id: 'synthetic-owner'
    });
    const req = {
      app: {
        locals: {
          updateProfileTransactionalOverride: update
        }
      },
      user: {
        id: 'synthetic-owner'
      },
      body: {
        user_id: 'attacker-controlled'
      },
      profilePatch: {
        is_private: true
      },
      requestId: 'synthetic-request'
    };
    const res = responseDouble();

    await updateOwnProfileHandler(req, res);

    expect(update).toHaveBeenCalledWith(
      'synthetic-owner',
      { is_private: true }
    );
  });
});
