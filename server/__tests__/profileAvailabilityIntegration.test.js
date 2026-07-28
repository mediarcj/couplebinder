// Description: Integration tests for identity/profile separation in presenters
// Security: JWT metadata and profile roles cannot manufacture editable profile state

import {
  describe,
  expect,
  it
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
} = require(
  '../ui_contract/presenters/accountPresenters'
);
const {
  notFound,
  unavailable
} = require('../services/profileResult');

function requestWith(result) {
  const req = {
    app: {
      locals: {
        getProfileByUserIdOverride:
          async () => result
      }
    },
    originalUrl: '/dashboard/profile-edit',
    url: '/dashboard/profile-edit',
    user: {
      id: 'synthetic-owner',
      email: 'synthetic@example.invalid',
      app_metadata: {},
      user_metadata: {
        first_name: 'Must not prefill',
        avatar_url: 'https://private.invalid/avatar'
      }
    }
  };
  attachVerifiedRoleAuthority(req, {
    app_metadata: {
      roles: ['user']
    }
  });
  return req;
}

const response = {
  locals: {
    csrfToken: 'synthetic-csrf',
    nonce: 'synthetic-nonce'
  }
};

describe('profile availability integration', () => {
  it('keeps verified identity but no fake profile when unavailable', async () => {
    const user = await buildCanonicalUser(
      requestWith(unavailable('provider_error'))
    );

    expect(user.id).toBe('synthetic-owner');
    expect(user.email)
      .toBe('synthetic@example.invalid');
    expect(user.profile_status).toBe('unavailable');
    expect(user.profile_authoritative).toBe(false);
    expect(user.profile_editable).toBe(false);
    expect(user).not.toHaveProperty('given_name');
    expect(user).not.toHaveProperty('avatar_url');
    expect(JSON.stringify(user))
      .not.toContain('Must not prefill');
    expect(JSON.stringify(user))
      .not.toContain('private.invalid');
  });

  it('preserves genuine missing-profile status for guided recovery', async () => {
    const user = await buildCanonicalUser(
      requestWith(notFound())
    );

    expect(user.profile_status).toBe('not_found');
    expect(user.profile_authoritative).toBe(false);
    expect(user.profile_editable).toBe(false);
  });

  it('removes edit actions from degraded dashboard models', async () => {
    const model = await buildDashboardPageModel(
      requestWith(unavailable('recursive_policy')),
      response
    );

    expect(
      model.ui_instructions.allowed_actions
    ).not.toContain('edit_profile');
    expect(
      model.ui_instructions.feature_flags
        .profile_editing
    ).toBe(false);
    expect(
      model.ui_instructions.display_rules
        .show_profile_edit
    ).toBe(false);
  });
});
