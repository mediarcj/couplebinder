// Description: Tests for central administrator route authorization
// Purpose: Prove server operations run only after signed-role authority succeeds
// Security: Browser, profile, and unverified claim-shaped values must fail closed

import {
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

const requireAdmin =
  require('../middleware/requireAdmin');
const {
  attachVerifiedRoleAuthority
} = require('../security/roleAuthority');

function invokeAdminGuard({
  claims,
  compatibility,
  decorateUser,
  authenticated = true,
  body = {},
  query = {}
} = {}) {
  const req = {
    body,
    query
  };

  if (authenticated) {
    const authenticatedUser = {
      id: 'synthetic-caller'
    };

    if (typeof decorateUser === 'function') {
      decorateUser(authenticatedUser);
    }

    Object.assign(req, {
      user: authenticatedUser
    });

    if (claims) {
      attachVerifiedRoleAuthority(
        req,
        claims,
        compatibility
      );
    }
  }

  const res = {
    statusCode: 200,
    body: null,
    status: vi.fn((statusCode) => {
      res.statusCode = statusCode;
      return res;
    }),
    json: vi.fn((responseBody) => {
      res.body = responseBody;
      return res;
    })
  };
  const protectedOperation = vi.fn();

  requireAdmin(req, res, protectedOperation);

  return {
    protectedOperation,
    req,
    res
  };
}

describe('requireAdmin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows canonical signed admin authority', () => {
    const result = invokeAdminGuard({
      claims: {
        app_metadata: {
          roles: ['admin']
        }
      }
    });

    expect(result.res.statusCode).toBe(200);
    expect(
      result.protectedOperation
    ).toHaveBeenCalledOnce();
  });

  it('returns 401 when authentication is missing', () => {
    const result = invokeAdminGuard({
      authenticated: false
    });

    expect(result.res.statusCode).toBe(401);
    expect(
      result.protectedOperation
    ).not.toHaveBeenCalled();
  });

  it('denies an ordinary authenticated user', () => {
    const result = invokeAdminGuard({
      claims: {
        app_metadata: {
          roles: ['user']
        }
      }
    });

    expect(result.res.statusCode).toBe(403);
    expect(
      result.protectedOperation
    ).not.toHaveBeenCalled();
  });

  it('denies missing and malformed role authority', () => {
    const missing = invokeAdminGuard();
    const malformed = invokeAdminGuard({
      claims: {
        app_metadata: {
          roles: 'admin'
        }
      }
    });

    expect(missing.res.statusCode).toBe(403);
    expect(malformed.res.statusCode).toBe(403);
    expect(
      missing.protectedOperation
    ).not.toHaveBeenCalled();
    expect(
      malformed.protectedOperation
    ).not.toHaveBeenCalled();
  });

  it('denies unverified claim-shaped and client isAdmin values', () => {
    const result = invokeAdminGuard({
      decorateUser(user) {
        user.roles = ['admin'];
        user.isAdmin = true;
        user.app_metadata = {
          roles: ['admin']
        };
      },
      query: {
        role: 'admin',
        isAdmin: true
      },
      body: {
        roles: ['admin'],
        isAdmin: true,
        user_metadata: {
          admin: true
        },
        profile: {
          roles: ['admin']
        }
      }
    });

    expect(result.res.statusCode).toBe(403);
    expect(
      result.protectedOperation
    ).not.toHaveBeenCalled();
  });

  it('keeps legacy admin disabled unless its exact switch is enabled', () => {
    const disabled = invokeAdminGuard({
      claims: {
        app_metadata: {
          role: 'admin'
        }
      }
    });
    const enabled = invokeAdminGuard({
      claims: {
        app_metadata: {
          role: 'admin'
        }
      },
      compatibility: {
        legacyAppMetadataRole: true
      }
    });

    expect(disabled.res.statusCode).toBe(403);
    expect(enabled.res.statusCode).toBe(200);
    expect(
      enabled.protectedOperation
    ).toHaveBeenCalledOnce();
  });

  it('applies the independent top-level legacy switch', () => {
    const disabled = invokeAdminGuard({
      claims: {
        user_role: 'admin'
      }
    });
    const enabled = invokeAdminGuard({
      claims: {
        user_role: 'admin'
      },
      compatibility: {
        legacyTopLevelUserRole: true
      }
    });

    expect(disabled.res.statusCode).toBe(403);
    expect(enabled.res.statusCode).toBe(200);
  });

  it('keeps super_user default-off and admin-equivalent only when enabled', () => {
    const disabled = invokeAdminGuard({
      claims: {
        app_metadata: {
          roles: ['super_user']
        }
      }
    });
    const enabled = invokeAdminGuard({
      claims: {
        app_metadata: {
          roles: ['super_user']
        }
      },
      compatibility: {
        superUserAsAdmin: true
      }
    });

    expect(disabled.res.statusCode).toBe(403);
    expect(enabled.res.statusCode).toBe(200);
  });
});
