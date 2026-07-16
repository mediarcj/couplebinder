// File: server/__tests__/accountRoutes.test.js
// Description: Tests for account lifecycle routes

import express from 'express';
// I am importing `request` from `supertest` here because accountRoutes.test.js uses it in the steps below.
import request from 'supertest';
// I am importing `describe` from `vitest` here because accountRoutes.test.js uses it in the steps below.
import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';

// I am saving `deleteResponseMock` here so the nearby steps can reuse the same value without rebuilding it each time.
const deleteResponseMock = { error: null };

// I am saving `deleteChain` here so the nearby steps can reuse the same value without rebuilding it each time.
const deleteChain = {
  // I am keeping the `eq` field in this object so the receiving code can read that value by its expected name.
  eq: vi.fn(() => Promise.resolve(deleteResponseMock))
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
};

// I am saving `deleteBuilder` here so the nearby steps can reuse the same value without rebuilding it each time.
const deleteBuilder = vi.fn(() => deleteChain);

// I am saving `supabaseAdminMock` here so the nearby steps can reuse the same value without rebuilding it each time.
const supabaseAdminMock = {
  // I am keeping the `from` field in this object so the receiving code can read that value by its expected name.
  from: vi.fn(() => ({
    // I am keeping the `delete` field in this object so the receiving code can read that value by its expected name.
    delete: deleteBuilder
  // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
  })),
  // I am keeping the `auth` field in this object so the receiving code can read that value by its expected name.
  auth: {
    // I am keeping the `admin` field in this object so the receiving code can read that value by its expected name.
    admin: {
      // I am keeping the `deleteUser` field in this object so the receiving code can read that value by its expected name.
      deleteUser: vi.fn().mockResolvedValue({ error: null }),
      // I am keeping the `updateUserById` field in this object so the receiving code can read that value by its expected name.
      updateUserById: vi.fn().mockResolvedValue({ error: null })
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
};

// I am saving `supabaseMock` here so the nearby steps can reuse the same value without rebuilding it each time.
const supabaseMock = {
  // I am keeping the `auth` field in this object so the receiving code can read that value by its expected name.
  auth: {
    // I am keeping the `signInWithPassword` field in this object so the receiving code can read that value by its expected name.
    signInWithPassword: vi.fn().mockResolvedValue({
      // I am keeping the `data` field in this object so the receiving code can read that value by its expected name.
      data: { session: {} },
      // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
      error: null
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    })
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
};

// I am saving `clearAuthCookieMock` here so the nearby steps can reuse the same value without rebuilding it each time.
const clearAuthCookieMock = vi.fn();

// I am defining this small callback here so the surrounding API can run it with the value it supplies.
vi.mock('../utils/authz', () => ({
  // I am keeping the `assertUser` field in this object so the receiving code can read that value by its expected name.
  assertUser: (req) => req.user || { id: 'user-1', email: 'demo@example.com' }
// This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
}));

// I am defining this small callback here so the surrounding API can run it with the value it supplies.
vi.mock('../lib/logoutWatermark', () => ({
  // I am keeping the `setLastLogoutNow` field in this object so the receiving code can read that value by its expected name.
  setLastLogoutNow: vi.fn().mockResolvedValue(undefined)
// This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
}));

// I am defining this small callback here so the surrounding API can run it with the value it supplies.
vi.mock('../services/outboxService', () => ({
  // I am keeping the `storeEvent` field in this object so the receiving code can read that value by its expected name.
  storeEvent: vi.fn().mockResolvedValue('event-1')
// This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
}));

// I am defining this small callback here so the surrounding API can run it with the value it supplies.
vi.mock('../lib/authCookie', () => ({
  // I am keeping the `clearAuthCookie` field in this object so the receiving code can read that value by its expected name.
  clearAuthCookie: clearAuthCookieMock
// This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
}));

// I am defining this small callback here so the surrounding API can run it with the value it supplies.
vi.mock('../middleware/rateLimiter', () => ({
  // I am keeping the `generalLimiter` field in this object so the receiving code can read that value by its expected name.
  generalLimiter: () => (req, _res, next) => next()
// This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
}));

// I am saving `accountRouter` here so the nearby steps can reuse the same value without rebuilding it each time.
let accountRouter;

// I am registering this test setup or cleanup step here so each related scenario starts in the expected state.
beforeAll(async () => {
  // I am waiting for this asynchronous step here so the next line does not use its result before it is ready.
  ({ default: accountRouter } = await import('../routes/account'));
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
});

// I am keeping `buildApp` as a named helper so the surrounding workflow can call this step when it needs it.
function buildApp() {
  // I am saving `app` here so the nearby steps can reuse the same value without rebuilding it each time.
  const app = express();
  // I am attaching this middleware or router here so matching requests pass through it in the existing Express order.
  app.use(express.json());
  // I am keeping this line here because the surrounding accountRoutes.test.js workflow expects this value or operation before it continues.
  app.locals.supabaseAdminOverride = supabaseAdminMock;
  // I am keeping this line here because the surrounding accountRoutes.test.js workflow expects this value or operation before it continues.
  app.locals.supabaseOverride = supabaseMock;
  // I am keeping this line here because the surrounding accountRoutes.test.js workflow expects this value or operation before it continues.
  app.locals.storeEventOverride = vi.fn().mockResolvedValue('evt');
  // I am keeping this line here because the surrounding accountRoutes.test.js workflow expects this value or operation before it continues.
  app.locals.clearAuthOverride = clearAuthCookieMock;
  // I am attaching this middleware or router here so matching requests pass through it in the existing Express order.
  app.use((req, _res, next) => {
    // I am keeping this line here because the surrounding accountRoutes.test.js workflow expects this value or operation before it continues.
    req.user = { id: 'user-1', email: 'demo@example.com' };
    // I am calling this helper here so the current workflow performs this step before it moves on.
    next();
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });
  // I am attaching this middleware or router here so matching requests pass through it in the existing Express order.
  app.use('/account', accountRouter);
  // This return sends the completed value or response back to the code that called this function.
  return app;
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am grouping the related test cases here so a beginner can see which behavior this section is checking.
describe('account routes', () => {
  // I am saving `app` here so the nearby steps can reuse the same value without rebuilding it each time.
  let app;

  // I am registering this test setup or cleanup step here so each related scenario starts in the expected state.
  beforeEach(() => {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    vi.clearAllMocks();
    // I am keeping this line here because the surrounding accountRoutes.test.js workflow expects this value or operation before it continues.
    app = buildApp();
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });

  // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
  it('deletes account data and clears cookies', async () => {
    // I am saving `res` here so the nearby steps can reuse the same value without rebuilding it each time.
    const res = await request(app)
      // I am continuing the existing call chain here so this option stays attached to the same operation started above.
      .post('/account/delete')
      // I am continuing the existing call chain here so this option stays attached to the same operation started above.
      .set('Accept', 'application/json');

    // I am checking the observed value here against the behavior this test promises to protect.
    expect(res.status).toBe(200);
    // I am checking the observed value here against the behavior this test promises to protect.
    expect(supabaseAdminMock.from).toHaveBeenCalledWith('profiles');
    // I am checking the observed value here against the behavior this test promises to protect.
    expect(supabaseAdminMock.auth.admin.deleteUser).toHaveBeenCalledWith('user-1');
    // I am checking the observed value here against the behavior this test promises to protect.
    expect(clearAuthCookieMock).toHaveBeenCalled();
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });

  // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
  it('changes password after verifying current password', async () => {
    // I am saving `res` here so the nearby steps can reuse the same value without rebuilding it each time.
    const res = await request(app)
      // I am continuing the existing call chain here so this option stays attached to the same operation started above.
      .post('/account/password')
      // I am continuing the existing call chain here so this option stays attached to the same operation started above.
      .send({
        // I am keeping the `current_password` field in this object so the receiving code can read that value by its expected name.
        current_password: 'oldPass123',
        // I am keeping the `new_password` field in this object so the receiving code can read that value by its expected name.
        new_password: 'NewPass123',
        // I am keeping the `confirm_password` field in this object so the receiving code can read that value by its expected name.
        confirm_password: 'NewPass123'
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      })
      // I am continuing the existing call chain here so this option stays attached to the same operation started above.
      .set('Accept', 'application/json');

    // I am checking the observed value here against the behavior this test promises to protect.
    expect(res.status).toBe(200);
    // I am checking the observed value here against the behavior this test promises to protect.
    expect(supabaseMock.auth.signInWithPassword).toHaveBeenCalledWith({
      // I am keeping the `email` field in this object so the receiving code can read that value by its expected name.
      email: 'demo@example.com',
      // I am keeping the `password` field in this object so the receiving code can read that value by its expected name.
      password: 'oldPass123'
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
    // I am checking the observed value here against the behavior this test promises to protect.
    expect(supabaseAdminMock.auth.admin.updateUserById).toHaveBeenCalledWith('user-1', {
      // I am keeping the `password` field in this object so the receiving code can read that value by its expected name.
      password: 'NewPass123'
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });

  // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
  it('rejects password mismatch', async () => {
    // I am saving `res` here so the nearby steps can reuse the same value without rebuilding it each time.
    const res = await request(app)
      // I am continuing the existing call chain here so this option stays attached to the same operation started above.
      .post('/account/password')
      // I am continuing the existing call chain here so this option stays attached to the same operation started above.
      .send({
        // I am keeping the `current_password` field in this object so the receiving code can read that value by its expected name.
        current_password: 'oldPass123',
        // I am keeping the `new_password` field in this object so the receiving code can read that value by its expected name.
        new_password: 'Alpha1234',
        // I am keeping the `confirm_password` field in this object so the receiving code can read that value by its expected name.
        confirm_password: 'Mismatch'
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      })
      // I am continuing the existing call chain here so this option stays attached to the same operation started above.
      .set('Accept', 'application/json');

    // I am checking the observed value here against the behavior this test promises to protect.
    expect(res.status).toBe(400);
    // I am checking the observed value here against the behavior this test promises to protect.
    expect(supabaseMock.auth.signInWithPassword).not.toHaveBeenCalled();
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
});

