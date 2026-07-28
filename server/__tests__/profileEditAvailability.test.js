// Description: Tests Profile Edit page gating and browser privacy safeguards
// Security: Only authoritative editable profiles can render the mutation form

import fs from 'node:fs';
import path from 'node:path';
import {
  describe,
  expect,
  it,
  vi
} from 'vitest';

const dashboardRouter = require('../routes/dashboard');
const {
  renderProfileEdit
} = dashboardRouter._test;

function responseDouble() {
  return {
    locals: {
      nonce: 'synthetic-nonce',
      cspNonce: 'synthetic-nonce',
      assetVersion: 'synthetic-version',
      csrfToken: 'synthetic-csrf'
    },
    headers: {},
    statusCode: 200,
    rendered: null,
    set(name, value) {
      this.headers[name.toLowerCase()] = value;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    render(view, model) {
      this.rendered = { view, model };
      return this;
    }
  };
}

function requestWithModel(model) {
  return {
    app: {
      locals: {
        buildDashboardPageModelOverride:
          vi.fn().mockResolvedValue(model)
      }
    },
    requestId: 'synthetic-request'
  };
}

function pageModel(profile, user = {}) {
  return {
    page: {
      nav: []
    },
    ui: {},
    app_info: {
      name: 'Synthetic App'
    },
    profile,
    user
  };
}

describe('Profile Edit availability', () => {
  it('renders the edit form only for authoritative editable data', async () => {
    const req = requestWithModel(pageModel({
      status: 'ok',
      authoritative: true,
      editable: true
    }, {
      profile_authoritative: true,
      profile_editable: true,
      account_privacy: 'private'
    }));
    const res = responseDouble();

    await renderProfileEdit(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.rendered.view).toBe('profile-edit');
    expect(res.rendered.model.profileBootstrapJson)
      .toContain('"profile_authoritative":true');
  });

  it('uses guided recovery instead of an edit form for not_found', async () => {
    const req = requestWithModel(pageModel({
      status: 'not_found',
      authoritative: false,
      editable: false
    }));
    const res = responseDouble();

    await renderProfileEdit(req, res);

    expect(res.statusCode).toBe(404);
    expect(res.rendered.view).toBe('profile-status');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.rendered.model)
      .not.toHaveProperty('profileBootstrapJson');
  });

  it('returns a non-editable no-store 503 for unavailable data', async () => {
    const req = requestWithModel(pageModel({
      status: 'unavailable',
      authoritative: false,
      editable: false
    }));
    const res = responseDouble();

    await renderProfileEdit(req, res);

    expect(res.statusCode).toBe(503);
    expect(res.rendered.view).toBe('profile-status');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.rendered.model)
      .not.toHaveProperty('profileBootstrapJson');
  });

  it('keeps browser privacy handling fail closed', () => {
    const source = fs.readFileSync(
      path.join(
        process.cwd(),
        'public/js/profile-edit.js'
      ),
      'utf8'
    );
    const template = fs.readFileSync(
      path.join(process.cwd(), 'ejs/profile-edit.ejs'),
      'utf8'
    );

    expect(source).not.toContain("return 'public';");
    expect(source).toContain(
      "return 'Account privacy must be selected';"
    );
    expect(source).toContain(
      'parsed.profile_authoritative !== true'
    );
    expect(template).toContain(
      '<option value="">Select privacy</option>'
    );
  });
});
