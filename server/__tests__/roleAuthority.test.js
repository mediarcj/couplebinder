// Description: Tests for the central verified-claim product-role authority
// Purpose: Prove normalization, compatibility, immutability, and default-deny behavior
// Security: Inputs are synthetic and never represent browser or database authority

import {
  describe,
  expect,
  it
} from 'vitest';

const {
  SOURCE_SHAPES,
  attachVerifiedRoleAuthority,
  getRequestRoleAuthority,
  isRequestAdmin,
  requestHasRole,
  resolveVerifiedProductRoles
} = require('../security/roleAuthority');
const { config } = require('../config');

describe('central signed role authority', () => {
  it('keeps every compatibility setting disabled by default', () => {
    expect(config.auth.roleCompatibility).toEqual({
      legacyAppMetadataRole: false,
      legacyTopLevelUserRole: false,
      superUserAsAdmin: false
    });
  });

  it('accepts canonical admin and ordinary-user roles', () => {
    const result = resolveVerifiedProductRoles({
      app_metadata: {
        roles: ['admin', 'user']
      }
    });

    expect(result).toEqual({
      roles: ['admin', 'user'],
      isAdmin: true,
      sourceShape: SOURCE_SHAPES.canonical,
      compatibilityUsed: false
    });
  });

  it('deduplicates, trims, normalizes casing, and orders roles', () => {
    const result = resolveVerifiedProductRoles({
      app_metadata: {
        roles: [
          ' USER ',
          'Admin',
          'admin',
          'user'
        ]
      }
    });

    expect(result.roles).toEqual([
      'admin',
      'user'
    ]);
  });

  it('ignores unknown and malformed canonical entries', () => {
    const result = resolveVerifiedProductRoles({
      app_metadata: {
        roles: [
          'admin',
          'owner',
          7,
          false,
          null,
          { role: 'admin' }
        ]
      }
    });

    expect(result.roles).toEqual(['admin']);
  });

  it('treats a non-array canonical value as no product role', () => {
    const result = resolveVerifiedProductRoles({
      app_metadata: {
        roles: 'admin'
      }
    });

    expect(result).toMatchObject({
      roles: [],
      isAdmin: false,
      sourceShape: SOURCE_SHAPES.canonical,
      compatibilityUsed: false
    });
  });

  it('returns deeply immutable role output', () => {
    const result = resolveVerifiedProductRoles({
      app_metadata: {
        roles: ['admin']
      }
    });

    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.roles)).toBe(true);
    expect(() => result.roles.push('user')).toThrow();
  });

  it('keeps both legacy shapes disabled by default', () => {
    const appLegacy = resolveVerifiedProductRoles({
      app_metadata: { role: 'admin' }
    });
    const topLegacy = resolveVerifiedProductRoles({
      user_role: 'admin'
    });

    expect(appLegacy).toEqual({
      roles: [],
      isAdmin: false,
      sourceShape: SOURCE_SHAPES.none,
      compatibilityUsed: false
    });
    expect(topLegacy).toEqual(appLegacy);
  });

  it('accepts app_metadata.role only when its switch is enabled', () => {
    const result = resolveVerifiedProductRoles(
      {
        app_metadata: { role: 'admin' }
      },
      {
        legacyAppMetadataRole: true
      }
    );

    expect(result).toEqual({
      roles: ['admin'],
      isAdmin: true,
      sourceShape:
        SOURCE_SHAPES.legacyAppMetadata,
      compatibilityUsed: true
    });
  });

  it('accepts top-level user_role only when its switch is enabled', () => {
    const result = resolveVerifiedProductRoles(
      {
        user_role: 'user'
      },
      {
        legacyTopLevelUserRole: true
      }
    );

    expect(result).toEqual({
      roles: ['user'],
      isAdmin: false,
      sourceShape:
        SOURCE_SHAPES.legacyTopLevel,
      compatibilityUsed: true
    });
  });

  it('does not fall through when canonical roles are empty', () => {
    const result = resolveVerifiedProductRoles(
      {
        app_metadata: {
          roles: [],
          role: 'admin'
        },
        user_role: 'admin'
      },
      {
        legacyAppMetadataRole: true,
        legacyTopLevelUserRole: true
      }
    );

    expect(result).toMatchObject({
      roles: [],
      sourceShape: SOURCE_SHAPES.canonical,
      compatibilityUsed: false
    });
  });

  it('does not fall through when canonical roles are malformed', () => {
    const result = resolveVerifiedProductRoles(
      {
        app_metadata: {
          roles: 'not-an-array',
          role: 'admin'
        }
      },
      {
        legacyAppMetadataRole: true
      }
    );

    expect(result).toMatchObject({
      roles: [],
      sourceShape: SOURCE_SHAPES.canonical,
      compatibilityUsed: false
    });
  });

  it('rejects super_user in canonical input by default', () => {
    const result = resolveVerifiedProductRoles({
      app_metadata: {
        roles: ['super_user']
      }
    });

    expect(result.roles).toEqual([]);
    expect(result.isAdmin).toBe(false);
  });

  it('maps canonical super_user to admin only when enabled', () => {
    const result = resolveVerifiedProductRoles(
      {
        app_metadata: {
          roles: ['super_user']
        }
      },
      {
        superUserAsAdmin: true
      }
    );

    expect(result.roles).toEqual(['admin']);
    expect(result.roles).not.toContain('super_user');
    expect(result.isAdmin).toBe(true);
  });

  it('maps legacy super_user only when both compatibility conditions are enabled', () => {
    const disabledLegacy = resolveVerifiedProductRoles(
      {
        app_metadata: {
          role: 'super_user'
        }
      },
      {
        superUserAsAdmin: true
      }
    );
    const disabledMapping = resolveVerifiedProductRoles(
      {
        app_metadata: {
          role: 'super_user'
        }
      },
      {
        legacyAppMetadataRole: true
      }
    );
    const enabled = resolveVerifiedProductRoles(
      {
        app_metadata: {
          role: 'super_user'
        }
      },
      {
        legacyAppMetadataRole: true,
        superUserAsAdmin: true
      }
    );

    expect(disabledLegacy.isAdmin).toBe(false);
    expect(disabledMapping.isAdmin).toBe(false);
    expect(enabled.roles).toEqual(['admin']);
  });

  it('applies the same super_user limit to top-level legacy input', () => {
    const result = resolveVerifiedProductRoles(
      {
        user_role: 'super_user'
      },
      {
        legacyTopLevelUserRole: true,
        superUserAsAdmin: true
      }
    );

    expect(result.roles).toEqual(['admin']);
    expect(result.roles).not.toContain('super_user');
  });

  it('ignores user_metadata as an authorization source', () => {
    const result = resolveVerifiedProductRoles({
      user_metadata: {
        admin: true,
        roles: ['admin'],
        role: 'admin'
      }
    });

    expect(result.roles).toEqual([]);
    expect(result.isAdmin).toBe(false);
  });

  it('stores only the minimal result in request-local state', () => {
    const req = {};
    const claims = {
      sub: 'synthetic-caller',
      app_metadata: {
        roles: ['admin']
      },
      user_metadata: {
        display_name: 'Synthetic'
      }
    };

    const attached = attachVerifiedRoleAuthority(
      req,
      claims
    );
    const stored = getRequestRoleAuthority(req);

    expect(stored).toBe(attached);
    expect(stored).toEqual({
      roles: ['admin'],
      isAdmin: true,
      sourceShape: SOURCE_SHAPES.canonical,
      compatibilityUsed: false
    });
    expect(stored).not.toHaveProperty('sub');
    expect(stored).not.toHaveProperty('app_metadata');
    expect(stored).not.toHaveProperty('user_metadata');
  });

  it('defaults missing request-local authority to non-admin', () => {
    expect(isRequestAdmin({})).toBe(false);
    expect(requestHasRole({}, 'admin')).toBe(false);
    expect(getRequestRoleAuthority({}).roles).toEqual([]);
  });
});
