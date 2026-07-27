import { describe, expect, it, vi } from 'vitest';

const csrfLite = require('../middleware/csrfLite');
const { setVerifiedAuth } = require('../lib/verifiedAuth');

function makeResponse() {
  return {
    locals: {},
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
}

function makeRequest(overrides = {}) {
  const headers = {
    cookie: 'sb_session=value; csrf_token=cookie-token',
    ...overrides.headers,
  };
  return {
    method: 'POST',
    path: '/auth/clear-cookie',
    body: {},
    cookies: {
      sb_session: 'value',
      csrf_token: 'cookie-token',
    },
    headers,
    get: vi.fn((name) => headers[String(name).toLowerCase()] || ''),
    ...overrides,
  };
}

describe('logout CSRF enforcement', () => {
  it('rejects cookie-authenticated logout without a matching token', () => {
    const req = makeRequest();
    const res = makeResponse();
    const next = vi.fn();

    csrfLite(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('accepts cookie-authenticated logout with a matching token', () => {
    const req = makeRequest({
      headers: {
        cookie: 'sb_session=value; csrf_token=cookie-token',
        'x-csrf-token': 'cookie-token',
      },
    });
    const res = makeResponse();
    const next = vi.fn();

    csrfLite(req, res, next);

    expect(next).toHaveBeenCalledOnce();
  });

  it('does not let an unverified Bearer header bypass cookie CSRF checks', () => {
    const req = makeRequest({
      path: '/api/profile/me',
      headers: {
        cookie: 'sb_session=value; csrf_token=cookie-token',
        authorization: 'Bearer attacker-controlled',
      },
    });
    const res = makeResponse();
    const next = vi.fn();

    csrfLite(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('allows a Bearer request only after the authentication bridge verifies it', () => {
    const req = makeRequest({
      path: '/api/profile/me',
      headers: {
        cookie: 'sb_session=value; csrf_token=cookie-token',
        authorization: 'Bearer verified-token',
      },
    });
    setVerifiedAuth(req, {
      token: 'verified-token',
      payload: { sub: 'test-user' },
      source: 'bearer',
    });
    const res = makeResponse();
    const next = vi.fn();

    csrfLite(req, res, next);

    expect(next).toHaveBeenCalledOnce();
  });
});
