// Description: Static integration checks for the central product-role authority
// Purpose: Prevent role parsing or authorization from drifting back into consumers
// Security: Verification must precede authority attachment and forbidden sources stay unused

import fs from 'node:fs';
import path from 'node:path';
import {
  describe,
  expect,
  it
} from 'vitest';

function read(relativePath) {
  return fs.readFileSync(
    path.join(process.cwd(), relativePath),
    'utf8'
  );
}

describe('role authority integration boundaries', () => {
  it('attaches product authority only after JWT verification and subject validation', () => {
    const source = read('middleware/authBridge.js');
    const verification = source.indexOf('jwtVerify(');
    const subjectCheck = source.indexOf(
      'if (!payload?.sub)'
    );
    const attachment = source.lastIndexOf(
      'attachVerifiedRoleAuthority('
    );

    expect(verification).toBeGreaterThan(-1);
    expect(subjectCheck).toBeGreaterThan(verification);
    expect(attachment).toBeGreaterThan(subjectCheck);
  });

  it('does not independently parse product roles in authentication middleware', () => {
    const bridge = read('middleware/authBridge.js');
    const alternate = read(
      'middleware/auth/supabaseJwt.js'
    );

    expect(bridge).not.toContain(
      'payload.app_metadata?.roles'
    );
    expect(bridge).not.toContain(
      'payload.app_metadata?.role'
    );
    expect(alternate).not.toContain(
      'payload.user_role ||'
    );
  });

  it('removes database and user-array role authority from consumers', () => {
    const canonicalUser = read(
      'ui_contract/presenters/helpers/buildCanonicalUser.js'
    );
    const adminRoute = read('routes/admin.js');
    const navigation = read(
      'ui_contract/navigation/manager.js'
    );
    const presenters = read(
      'ui_contract/presenters/accountPresenters.js'
    );

    expect(canonicalUser).not.toContain(
      'profile.roles'
    );
    expect(adminRoute).not.toContain(
      'user.roles'
    );
    expect(navigation).not.toContain(
      'user.roles'
    );
    expect(presenters).not.toContain(
      "user.roles || []"
    );
  });

  it('keeps administrator routes behind the central middleware', () => {
    const route = read('routes/admin.js');
    const middleware = read(
      'middleware/requireAdmin.js'
    );

    expect(route).toContain(
      "require('../middleware/requireAdmin')"
    );
    expect(route).toContain(
      'router.use(requireAdmin)'
    );
    expect(middleware).toContain(
      'isRequestAdmin(req)'
    );
  });

  it('keeps role authority request-local and independent of Redis', () => {
    const authority = read(
      'security/roleAuthority.js'
    );

    expect(authority).toContain('new WeakMap()');
    expect(authority).not.toContain('redis');
    expect(authority).not.toContain('profileService');
  });
});
