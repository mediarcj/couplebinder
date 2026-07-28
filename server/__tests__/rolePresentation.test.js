// Description: Tests for role-safe canonical presentation and navigation
// Purpose: Keep page UI and administrator routes on the same signed-role result
// Security: Profile-view roles cannot create administrator UI or page authority

import {
  describe,
  expect,
  it,
} from 'vitest';

const {
  attachVerifiedRoleAuthority
} = require('../security/roleAuthority');
const {
  buildCanonicalUser
} = require(
  '../ui_contract/presenters/helpers/buildCanonicalUser'
);
const {
  buildDashboardPageModel
} = require('../ui_contract/presenters/accountPresenters');
const navManager =
  require('../ui_contract/navigation/manager');
const {
  ok
} = require('../services/profileResult');

function createRequest() {
  return {
    app: {
      locals: {
        getProfileByUserIdOverride: async () => ok({
          user_id: 'synthetic-caller',
          display_name: 'Synthetic Profile',
          account_privacy: 'private',
          roles: ['admin']
        })
      }
    },
    originalUrl: '/dashboard',
    url: '/dashboard',
    user: {
      id: 'synthetic-caller',
      email: null,
      app_metadata: {},
      user_metadata: {
        display_name: 'Synthetic User'
      }
    }
  };
}

function createResponse() {
  return {
    locals: {
      csrfToken: 'synthetic-csrf',
      nonce: 'synthetic-nonce'
    }
  };
}

describe('signed roles in presenters and navigation', () => {
  it('ignores database profile roles in the canonical user', async () => {
    const req = createRequest();

    attachVerifiedRoleAuthority(req, {
      app_metadata: {
        roles: ['user']
      }
    });

    const user = await buildCanonicalUser(req);

    expect(user.roles).toEqual(['user']);
    expect(user.roles).not.toContain('admin');
  });

  it('uses the signed result even when the profile disagrees', async () => {
    const req = createRequest();

    attachVerifiedRoleAuthority(req, {
      app_metadata: {
        roles: ['admin']
      }
    });
    req.app.locals.getProfileByUserIdOverride =
      async () => ok({
        user_id: 'synthetic-caller',
        display_name: 'Synthetic Profile',
        account_privacy: 'private',
        roles: ['user']
      });

    const user = await buildCanonicalUser(req);

    expect(user.roles).toEqual(['admin']);
  });

  it('does not expose role compatibility internals or raw claims in the canonical user', async () => {
    const req = createRequest();

    attachVerifiedRoleAuthority(
      req,
      {
        app_metadata: {
          role: 'admin'
        },
        confidential_claim: 'must-not-render'
      },
      {
        legacyAppMetadataRole: true
      }
    );

    const user = await buildCanonicalUser(req);
    const serialized = JSON.stringify(user);

    expect(user.roles).toEqual(['admin']);
    expect(user).not.toHaveProperty('sourceShape');
    expect(user).not.toHaveProperty('compatibilityUsed');
    expect(serialized).not.toContain('confidential_claim');
    expect(serialized).not.toContain('app_metadata.role');
  });

  it('evaluates administrator navigation from central admin authority', () => {
    const ordinaryReq = createRequest();
    const adminReq = createRequest();

    attachVerifiedRoleAuthority(ordinaryReq, {
      app_metadata: {
        roles: ['user']
      }
    });
    attachVerifiedRoleAuthority(adminReq, {
      app_metadata: {
        roles: ['admin']
      }
    });

    expect(
      navManager.userHasRole(ordinaryReq, 'admin')
    ).toBe(false);
    expect(
      navManager.userHasRole(adminReq, 'admin')
    ).toBe(true);
  });

  it('uses the central admin result for dashboard feature flags', async () => {
    const ordinaryReq = createRequest();
    const adminReq = createRequest();
    const res = createResponse();

    attachVerifiedRoleAuthority(ordinaryReq, {
      app_metadata: {
        roles: ['user']
      }
    });
    attachVerifiedRoleAuthority(adminReq, {
      app_metadata: {
        roles: ['admin']
      }
    });

    const ordinaryModel =
      await buildDashboardPageModel(ordinaryReq, res);
    const adminModel =
      await buildDashboardPageModel(adminReq, res);

    expect(
      ordinaryModel.ui_instructions.feature_flags.admin_panel
    ).toBe(false);
    expect(
      adminModel.ui_instructions.feature_flags.admin_panel
    ).toBe(true);
  });
});
