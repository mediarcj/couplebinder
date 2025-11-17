// File: server/__tests__/accountRoutes.test.js
// Description: Tests for account lifecycle routes

import express from 'express';
import request from 'supertest';
import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';

const deleteResponseMock = { error: null };

const deleteChain = {
  eq: vi.fn(() => Promise.resolve(deleteResponseMock))
};

const deleteBuilder = vi.fn(() => deleteChain);

const supabaseAdminMock = {
  from: vi.fn(() => ({
    delete: deleteBuilder
  })),
  auth: {
    admin: {
      deleteUser: vi.fn().mockResolvedValue({ error: null }),
      updateUserById: vi.fn().mockResolvedValue({ error: null })
    }
  }
};

const supabaseMock = {
  auth: {
    signInWithPassword: vi.fn().mockResolvedValue({
      data: { session: {} },
      error: null
    })
  }
};

const clearAuthCookieMock = vi.fn();

vi.mock('../utils/authz', () => ({
  assertUser: (req) => req.user || { id: 'user-1', email: 'demo@example.com' }
}));

vi.mock('../lib/logoutWatermark', () => ({
  setLastLogoutNow: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('../services/outboxService', () => ({
  storeEvent: vi.fn().mockResolvedValue('event-1')
}));

vi.mock('../lib/authCookie', () => ({
  clearAuthCookie: clearAuthCookieMock
}));

vi.mock('../middleware/rateLimiter', () => ({
  generalLimiter: () => (req, _res, next) => next()
}));

let accountRouter;

beforeAll(async () => {
  ({ default: accountRouter } = await import('../routes/account'));
});

function buildApp() {
  const app = express();
  app.use(express.json());
  app.locals.supabaseAdminOverride = supabaseAdminMock;
  app.locals.supabaseOverride = supabaseMock;
  app.locals.storeEventOverride = vi.fn().mockResolvedValue('evt');
  app.locals.clearAuthOverride = clearAuthCookieMock;
  app.use((req, _res, next) => {
    req.user = { id: 'user-1', email: 'demo@example.com' };
    next();
  });
  app.use('/account', accountRouter);
  return app;
}

describe('account routes', () => {
  let app;

  beforeEach(() => {
    vi.clearAllMocks();
    app = buildApp();
  });

  it('deletes account data and clears cookies', async () => {
    const res = await request(app)
      .post('/account/delete')
      .set('Accept', 'application/json');

    expect(res.status).toBe(200);
    expect(supabaseAdminMock.from).toHaveBeenCalledWith('profiles');
    expect(supabaseAdminMock.auth.admin.deleteUser).toHaveBeenCalledWith('user-1');
    expect(clearAuthCookieMock).toHaveBeenCalled();
  });

  it('changes password after verifying current password', async () => {
    const res = await request(app)
      .post('/account/password')
      .send({
        current_password: 'oldPass123',
        new_password: 'NewPass123',
        confirm_password: 'NewPass123'
      })
      .set('Accept', 'application/json');

    expect(res.status).toBe(200);
    expect(supabaseMock.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'demo@example.com',
      password: 'oldPass123'
    });
    expect(supabaseAdminMock.auth.admin.updateUserById).toHaveBeenCalledWith('user-1', {
      password: 'NewPass123'
    });
  });

  it('rejects password mismatch', async () => {
    const res = await request(app)
      .post('/account/password')
      .send({
        current_password: 'oldPass123',
        new_password: 'Alpha1234',
        confirm_password: 'Mismatch'
      })
      .set('Accept', 'application/json');

    expect(res.status).toBe(400);
    expect(supabaseMock.auth.signInWithPassword).not.toHaveBeenCalled();
  });
});

