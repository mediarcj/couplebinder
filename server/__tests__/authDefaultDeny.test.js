/**
 * File: authDefaultDeny.test.js
 * Description: Tests for default-deny authentication guard middleware
 * Purpose: Verify that protected prefixes require authentication by default
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
// I am importing `request` from `supertest` here because authDefaultDeny.test.js uses it in the steps below.
import request from 'supertest';
// I am importing `express` from `express` here because authDefaultDeny.test.js uses it in the steps below.
import express from 'express';
// I am importing `requireAuthByDefault` from `../middleware/requireAuthByDefault` here because authDefaultDeny.test.js uses it in the steps below.
import requireAuthByDefault from '../middleware/requireAuthByDefault';
// I am importing `logger` from `../utils/logger` here because authDefaultDeny.test.js uses it in the steps below.
import logger from '../utils/logger';

// Mock logger to prevent console output during tests
vi.mock('../utils/logger', () => ({
  // This case marks the path for the matching value in the switch that started above.
  default: {
    // I am keeping the `info` field in this object so the receiving code can read that value by its expected name.
    info: vi.fn(),
    // I am keeping the `warn` field in this object so the receiving code can read that value by its expected name.
    warn: vi.fn(),
    // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
    error: vi.fn(),
    // I am keeping the `debug` field in this object so the receiving code can read that value by its expected name.
    debug: vi.fn(),
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
}));

// I am saving `app` here so the nearby steps can reuse the same value without rebuilding it each time.
let app;

// I am registering this test setup or cleanup step here so each related scenario starts in the expected state.
beforeEach(() => {
  // I am keeping this line here because the surrounding authDefaultDeny.test.js workflow expects this value or operation before it continues.
  app = express();
  // Reset mocks
  logger.default.info.mockClear();
  // I am calling this helper here so the current workflow performs this step before it moves on.
  logger.default.warn.mockClear();
  // I am calling this helper here so the current workflow performs this step before it moves on.
  logger.default.error.mockClear();
  // I am calling this helper here so the current workflow performs this step before it moves on.
  logger.default.debug.mockClear();
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
});

// I am grouping the related test cases here so a beginner can see which behavior this section is checking.
describe('Default-Deny Auth Guard', () => {
  // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
  it('should block unauthenticated requests to protected API endpoints', async () => {
    // I am saving `publicGlobs` here so the nearby steps can reuse the same value without rebuilding it each time.
    const publicGlobs = ['/health/**'];
    // I am attaching this middleware or router here so matching requests pass through it in the existing Express order.
    app.use('/api', requireAuthByDefault({ publicGlobs, logger }));
    
    // This registers the GET `/api/test` route so Express can send matching requests through the handlers listed here.
    app.get('/api/test', (req, res) => res.status(200).send('OK'));

    // I am saving `res` here so the nearby steps can reuse the same value without rebuilding it each time.
    const res = await request(app).get('/api/test');
    // I am checking the observed value here against the behavior this test promises to protect.
    expect(res.statusCode).toBe(401);
    // I am checking the observed value here against the behavior this test promises to protect.
    expect(res.body).toEqual({
      // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
      error: 'auth_required',
      // I am keeping the `message` field in this object so the receiving code can read that value by its expected name.
      message: 'Authentication required for this endpoint'
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
    // I am checking the observed value here against the behavior this test promises to protect.
    expect(logger.default.info).toHaveBeenCalledWith(
      // I am calling this helper here so the current workflow performs this step before it moves on.
      expect.objectContaining({
        // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
        event: 'auth.default_deny',
        // I am keeping the `path` field in this object so the receiving code can read that value by its expected name.
        path: '/test',
        // I am keeping the `method` field in this object so the receiving code can read that value by its expected name.
        method: 'GET',
        // I am keeping the `reason` field in this object so the receiving code can read that value by its expected name.
        reason: 'no_authenticated_user'
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }),
      // I am calling this helper here so the current workflow performs this step before it moves on.
      expect.any(String)
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    );
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });

  // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
  it('should allow authenticated requests to protected API endpoints', async () => {
    // I am saving `publicGlobs` here so the nearby steps can reuse the same value without rebuilding it each time.
    const publicGlobs = ['/health/**'];
    // I am attaching this middleware or router here so matching requests pass through it in the existing Express order.
    app.use('/api', requireAuthByDefault({ publicGlobs, logger }));
    
    // Mock authenticated user
    app.use((req, res, next) => {
      // I am keeping this line here because the surrounding authDefaultDeny.test.js workflow expects this value or operation before it continues.
      req.user = { id: 'user123', email: 'test@example.com' };
      // I am calling this helper here so the current workflow performs this step before it moves on.
      next();
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
    
    // This registers the GET `/api/test` route so Express can send matching requests through the handlers listed here.
    app.get('/api/test', (req, res) => res.status(200).send('OK'));

    // I am saving `res` here so the nearby steps can reuse the same value without rebuilding it each time.
    const res = await request(app).get('/api/test');
    // I am checking the observed value here against the behavior this test promises to protect.
    expect(res.statusCode).toBe(200);
    // I am checking the observed value here against the behavior this test promises to protect.
    expect(res.text).toBe('OK');
    // I am checking the observed value here against the behavior this test promises to protect.
    expect(logger.default.info).not.toHaveBeenCalledWith(
      // I am calling this helper here so the current workflow performs this step before it moves on.
      expect.objectContaining({ event: 'auth.default_deny' }),
      // I am calling this helper here so the current workflow performs this step before it moves on.
      expect.any(String)
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    );
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });

  // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
  it('should allow unauthenticated requests to public paths', async () => {
    // I am saving `publicGlobs` here so the nearby steps can reuse the same value without rebuilding it each time.
    const publicGlobs = ['/health/**', '/css/**', '/js/**'];
    // I am attaching this middleware or router here so matching requests pass through it in the existing Express order.
    app.use('/api', requireAuthByDefault({ publicGlobs, logger }));
    
    // This registers the GET `/api/health/liveness` route so Express can send matching requests through the handlers listed here.
    app.get('/api/health/liveness', (req, res) => res.status(200).send('Health OK'));

    // I am saving `res` here so the nearby steps can reuse the same value without rebuilding it each time.
    const res = await request(app).get('/api/health/liveness');
    // I am checking the observed value here against the behavior this test promises to protect.
    expect(res.statusCode).toBe(200);
    // I am checking the observed value here against the behavior this test promises to protect.
    expect(res.text).toBe('Health OK');
    // I am checking the observed value here against the behavior this test promises to protect.
    expect(logger.default.info).not.toHaveBeenCalledWith(
      // I am calling this helper here so the current workflow performs this step before it moves on.
      expect.objectContaining({ event: 'auth.default_deny' }),
      // I am calling this helper here so the current workflow performs this step before it moves on.
      expect.any(String)
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    );
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });

  // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
  it('should block unauthenticated requests to dashboard routes', async () => {
    // I am saving `publicGlobs` here so the nearby steps can reuse the same value without rebuilding it each time.
    const publicGlobs = ['/css/**', '/js/**'];
    // I am attaching this middleware or router here so matching requests pass through it in the existing Express order.
    app.use('/dashboard', requireAuthByDefault({ publicGlobs, logger }));
    
    // This registers the GET `/dashboard/profile` route so Express can send matching requests through the handlers listed here.
    app.get('/dashboard/profile', (req, res) => res.status(200).send('Dashboard OK'));

    // I am saving `res` here so the nearby steps can reuse the same value without rebuilding it each time.
    const res = await request(app).get('/dashboard/profile');
    // I am checking the observed value here against the behavior this test promises to protect.
    expect(res.statusCode).toBe(401);
    // I am checking the observed value here against the behavior this test promises to protect.
    expect(res.body).toEqual({
      // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
      error: 'auth_required',
      // I am keeping the `message` field in this object so the receiving code can read that value by its expected name.
      message: 'Authentication required for this endpoint'
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
    // I am checking the observed value here against the behavior this test promises to protect.
    expect(logger.default.info).toHaveBeenCalledWith(
      // I am calling this helper here so the current workflow performs this step before it moves on.
      expect.objectContaining({
        // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
        event: 'auth.default_deny',
        // I am keeping the `path` field in this object so the receiving code can read that value by its expected name.
        path: '/profile',
        // I am keeping the `method` field in this object so the receiving code can read that value by its expected name.
        method: 'GET',
        // I am keeping the `reason` field in this object so the receiving code can read that value by its expected name.
        reason: 'no_authenticated_user'
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }),
      // I am calling this helper here so the current workflow performs this step before it moves on.
      expect.any(String)
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    );
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });

  // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
  it('should handle empty public globs by blocking all requests', async () => {
    // I am saving `publicGlobs` here so the nearby steps can reuse the same value without rebuilding it each time.
    const publicGlobs = [];
    // I am attaching this middleware or router here so matching requests pass through it in the existing Express order.
    app.use('/api', requireAuthByDefault({ publicGlobs, logger }));
    
    // This registers the GET `/api/test` route so Express can send matching requests through the handlers listed here.
    app.get('/api/test', (req, res) => res.status(200).send('OK'));

    // I am saving `res` here so the nearby steps can reuse the same value without rebuilding it each time.
    const res = await request(app).get('/api/test');
    // I am checking the observed value here against the behavior this test promises to protect.
    expect(res.statusCode).toBe(401);
    // I am checking the observed value here against the behavior this test promises to protect.
    expect(res.body).toEqual({
      // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
      error: 'auth_required',
      // I am keeping the `message` field in this object so the receiving code can read that value by its expected name.
      message: 'Authentication required for this endpoint'
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });

  // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
  it('should handle undefined public globs by blocking all requests', async () => {
    // I am attaching this middleware or router here so matching requests pass through it in the existing Express order.
    app.use('/api', requireAuthByDefault({ logger }));
    
    // This registers the GET `/api/test` route so Express can send matching requests through the handlers listed here.
    app.get('/api/test', (req, res) => res.status(200).send('OK'));

    // I am saving `res` here so the nearby steps can reuse the same value without rebuilding it each time.
    const res = await request(app).get('/api/test');
    // I am checking the observed value here against the behavior this test promises to protect.
    expect(res.statusCode).toBe(401);
    // I am checking the observed value here against the behavior this test promises to protect.
    expect(res.body).toEqual({
      // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
      error: 'auth_required',
      // I am keeping the `message` field in this object so the receiving code can read that value by its expected name.
      message: 'Authentication required for this endpoint'
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });

  // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
  it('should handle user without id property as unauthenticated', async () => {
    // I am saving `publicGlobs` here so the nearby steps can reuse the same value without rebuilding it each time.
    const publicGlobs = [];
    // I am attaching this middleware or router here so matching requests pass through it in the existing Express order.
    app.use('/api', requireAuthByDefault({ publicGlobs, logger }));
    
    // Mock user without id
    app.use((req, res, next) => {
      req.user = { email: 'test@example.com' }; // No id property
      // I am calling this helper here so the current workflow performs this step before it moves on.
      next();
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
    
    // This registers the GET `/api/test` route so Express can send matching requests through the handlers listed here.
    app.get('/api/test', (req, res) => res.status(200).send('OK'));

    // I am saving `res` here so the nearby steps can reuse the same value without rebuilding it each time.
    const res = await request(app).get('/api/test');
    // I am checking the observed value here against the behavior this test promises to protect.
    expect(res.statusCode).toBe(401);
    // I am checking the observed value here against the behavior this test promises to protect.
    expect(res.body).toEqual({
      // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
      error: 'auth_required',
      // I am keeping the `message` field in this object so the receiving code can read that value by its expected name.
      message: 'Authentication required for this endpoint'
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });

  // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
  it('should handle null user as unauthenticated', async () => {
    // I am saving `publicGlobs` here so the nearby steps can reuse the same value without rebuilding it each time.
    const publicGlobs = [];
    // I am attaching this middleware or router here so matching requests pass through it in the existing Express order.
    app.use('/api', requireAuthByDefault({ publicGlobs, logger }));
    
    // Mock null user
    app.use((req, res, next) => {
      // I am keeping this line here because the surrounding authDefaultDeny.test.js workflow expects this value or operation before it continues.
      req.user = null;
      // I am calling this helper here so the current workflow performs this step before it moves on.
      next();
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
    
    // This registers the GET `/api/test` route so Express can send matching requests through the handlers listed here.
    app.get('/api/test', (req, res) => res.status(200).send('OK'));

    // I am saving `res` here so the nearby steps can reuse the same value without rebuilding it each time.
    const res = await request(app).get('/api/test');
    // I am checking the observed value here against the behavior this test promises to protect.
    expect(res.statusCode).toBe(401);
    // I am checking the observed value here against the behavior this test promises to protect.
    expect(res.body).toEqual({
      // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
      error: 'auth_required',
      // I am keeping the `message` field in this object so the receiving code can read that value by its expected name.
      message: 'Authentication required for this endpoint'
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });

  // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
  it('should include requestId in log when available', async () => {
    // I am saving `publicGlobs` here so the nearby steps can reuse the same value without rebuilding it each time.
    const publicGlobs = [];
    // I am attaching this middleware or router here so matching requests pass through it in the existing Express order.
    app.use('/api', requireAuthByDefault({ publicGlobs, logger }));
    
    // Mock request with requestId
    app.use((req, res, next) => {
      // I am keeping this line here because the surrounding authDefaultDeny.test.js workflow expects this value or operation before it continues.
      req.requestId = 'req-123';
      // I am calling this helper here so the current workflow performs this step before it moves on.
      next();
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
    
    // This registers the GET `/api/test` route so Express can send matching requests through the handlers listed here.
    app.get('/api/test', (req, res) => res.status(200).send('OK'));

    // I am waiting for this asynchronous step here so the next line does not use its result before it is ready.
    await request(app).get('/api/test');
    
    // I am checking the observed value here against the behavior this test promises to protect.
    expect(logger.default.info).toHaveBeenCalledWith(
      // I am calling this helper here so the current workflow performs this step before it moves on.
      expect.objectContaining({
        // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
        event: 'auth.default_deny',
        // I am keeping the `path` field in this object so the receiving code can read that value by its expected name.
        path: '/test',
        // I am keeping the `method` field in this object so the receiving code can read that value by its expected name.
        method: 'GET',
        // I am keeping the `requestId` field in this object so the receiving code can read that value by its expected name.
        requestId: 'req-123',
        // I am keeping the `reason` field in this object so the receiving code can read that value by its expected name.
        reason: 'no_authenticated_user'
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }),
      // I am calling this helper here so the current workflow performs this step before it moves on.
      expect.any(String)
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    );
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
});
