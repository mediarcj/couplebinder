// File: server/__tests__/degradeGuard.test.js
// Description: Tests for Redis degrade guard middleware
// Purpose: Verify 503 responses for sensitive paths when Redis is down

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
// I am importing `request` from `supertest` here because degradeGuard.test.js uses it in the steps below.
import request from 'supertest';
// I am importing `express` from `express` here because degradeGuard.test.js uses it in the steps below.
import express from 'express';
// I am importing `degradeGuard` from `../middleware/degradeGuard` here because degradeGuard.test.js uses it in the steps below.
import degradeGuard from '../middleware/degradeGuard';

// Mock logger
vi.mock('../utils/logger', () => ({
  // I am keeping the `warn` field in this object so the receiving code can read that value by its expected name.
  warn: vi.fn(),
  // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
  error: vi.fn(),
  // I am keeping the `info` field in this object so the receiving code can read that value by its expected name.
  info: vi.fn(),
  // I am keeping the `debug` field in this object so the receiving code can read that value by its expected name.
  debug: vi.fn()
// This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
}));

// I am grouping the related test cases here so a beginner can see which behavior this section is checking.
describe('Redis Degrade Guard', () => {
  // I am saving `app` here so the nearby steps can reuse the same value without rebuilding it each time.
  let app;

  // I am registering this test setup or cleanup step here so each related scenario starts in the expected state.
  beforeEach(() => {
    // I am keeping this line here because the surrounding degradeGuard.test.js workflow expects this value or operation before it continues.
    app = express();
    
    // Mock app.locals
    app.locals.redisReady = false;
    // I am keeping this line here because the surrounding degradeGuard.test.js workflow expects this value or operation before it continues.
    app.locals.rateLimitStoreReady = false;
    
    // Add test routes
    app.get('/api/auth/login', (req, res) => res.json({ success: true }));
    // This registers the GET `/api/users/profile` route so Express can send matching requests through the handlers listed here.
    app.get('/api/users/profile', (req, res) => res.json({ success: true }));
    // This registers the GET `/api/profile/me` route so Express can send matching requests through the handlers listed here.
    app.get('/api/profile/me', (req, res) => res.json({ success: true }));
    // This registers the GET `/api/submissions` route so Express can send matching requests through the handlers listed here.
    app.get('/api/submissions', (req, res) => res.json({ success: true }));
    // This registers the GET `/dashboard` route so Express can send matching requests through the handlers listed here.
    app.get('/dashboard', (req, res) => res.json({ success: true }));
    // This registers the GET `/profile` route so Express can send matching requests through the handlers listed here.
    app.get('/profile', (req, res) => res.json({ success: true }));
    // This registers the GET `/public` route so Express can send matching requests through the handlers listed here.
    app.get('/public', (req, res) => res.json({ success: true }));
    // This registers the GET `/health/liveness` route so Express can send matching requests through the handlers listed here.
    app.get('/health/liveness', (req, res) => res.json({ success: true }));
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });

  // I am registering this test setup or cleanup step here so each related scenario starts in the expected state.
  afterEach(() => {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    vi.clearAllMocks();
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });

  // I am grouping the related test cases here so a beginner can see which behavior this section is checking.
  describe('When Redis is down', () => {
    // I am registering this test setup or cleanup step here so each related scenario starts in the expected state.
    beforeEach(() => {
      // I am keeping this line here because the surrounding degradeGuard.test.js workflow expects this value or operation before it continues.
      app.locals.redisReady = false;
      // I am attaching this middleware or router here so matching requests pass through it in the existing Express order.
      app.use(degradeGuard);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    it('should block sensitive API paths with 503', async () => {
      // I am saving `sensitivePaths` here so the nearby steps can reuse the same value without rebuilding it each time.
      const sensitivePaths = [
        // I am listing this entry here because the surrounding collection processes each allowed value in order.
        '/api/auth/login',
        // I am listing this entry here because the surrounding collection processes each allowed value in order.
        '/api/users/profile',
        // I am listing this entry here because the surrounding collection processes each allowed value in order.
        '/api/profile/me',
        // I am listing this entry here because the surrounding collection processes each allowed value in order.
        '/api/submissions'
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      ];

      // I am repeating the next block one item at a time so every value in the existing collection receives the same handling.
      for (const path of sensitivePaths) {
        // I am saving `res` here so the nearby steps can reuse the same value without rebuilding it each time.
        const res = await request(app).get(path);
        // I am checking the observed value here against the behavior this test promises to protect.
        expect(res.statusCode).toBe(503);
        // I am checking the observed value here against the behavior this test promises to protect.
        expect(res.body).toHaveProperty('error', 'degraded_mode');
        // I am checking the observed value here against the behavior this test promises to protect.
        expect(res.body).toHaveProperty('reason', 'redis_unavailable');
        // I am checking the observed value here against the behavior this test promises to protect.
        expect(res.body).toHaveProperty('retryAfter', 30);
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    it('should block sensitive page paths with 503', async () => {
      // I am saving `sensitivePaths` here so the nearby steps can reuse the same value without rebuilding it each time.
      const sensitivePaths = [
        // I am listing this entry here because the surrounding collection processes each allowed value in order.
        '/dashboard',
        // I am listing this entry here because the surrounding collection processes each allowed value in order.
        '/profile'
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      ];

      // I am repeating the next block one item at a time so every value in the existing collection receives the same handling.
      for (const path of sensitivePaths) {
        // I am saving `res` here so the nearby steps can reuse the same value without rebuilding it each time.
        const res = await request(app).get(path);
        // I am checking the observed value here against the behavior this test promises to protect.
        expect(res.statusCode).toBe(503);
        // I am checking the observed value here against the behavior this test promises to protect.
        expect(res.body).toHaveProperty('error', 'degraded_mode');
        // I am checking the observed value here against the behavior this test promises to protect.
        expect(res.body).toHaveProperty('reason', 'redis_unavailable');
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    it('should allow non-sensitive paths', async () => {
      // I am saving `nonSensitivePaths` here so the nearby steps can reuse the same value without rebuilding it each time.
      const nonSensitivePaths = [
        // I am listing this entry here because the surrounding collection processes each allowed value in order.
        '/public',
        // I am listing this entry here because the surrounding collection processes each allowed value in order.
        '/health/liveness'
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      ];

      // I am repeating the next block one item at a time so every value in the existing collection receives the same handling.
      for (const path of nonSensitivePaths) {
        // I am saving `res` here so the nearby steps can reuse the same value without rebuilding it each time.
        const res = await request(app).get(path);
        // I am checking the observed value here against the behavior this test promises to protect.
        expect(res.statusCode).toBe(200);
        // I am checking the observed value here against the behavior this test promises to protect.
        expect(res.body).toHaveProperty('success', true);
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    it('should log blocked requests', async () => {
      // I am loading `../utils/logger` into `logger` so this file can reuse that dependency below.
      const logger = require('../utils/logger');
      
      // I am waiting for this asynchronous step here so the next line does not use its result before it is ready.
      await request(app).get('/api/auth/login');
      
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(logger.warn).toHaveBeenCalledWith(
        // I am calling this helper here so the current workflow performs this step before it moves on.
        expect.objectContaining({
          // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
          event: 'degrade.blocked_sensitive_path',
          // I am keeping the `path` field in this object so the receiving code can read that value by its expected name.
          path: '/api/auth/login',
          // I am keeping the `method` field in this object so the receiving code can read that value by its expected name.
          method: 'GET',
          // I am keeping the `reason` field in this object so the receiving code can read that value by its expected name.
          reason: 'redis_unavailable'
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

  // I am grouping the related test cases here so a beginner can see which behavior this section is checking.
  describe('When Redis is up', () => {
    // I am registering this test setup or cleanup step here so each related scenario starts in the expected state.
    beforeEach(() => {
      // I am keeping this line here because the surrounding degradeGuard.test.js workflow expects this value or operation before it continues.
      app.locals.redisReady = true;
      // I am attaching this middleware or router here so matching requests pass through it in the existing Express order.
      app.use(degradeGuard);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    it('should allow all paths', async () => {
      // I am saving `allPaths` here so the nearby steps can reuse the same value without rebuilding it each time.
      const allPaths = [
        // I am listing this entry here because the surrounding collection processes each allowed value in order.
        '/api/auth/login',
        // I am listing this entry here because the surrounding collection processes each allowed value in order.
        '/api/users/profile',
        // I am listing this entry here because the surrounding collection processes each allowed value in order.
        '/dashboard',
        // I am listing this entry here because the surrounding collection processes each allowed value in order.
        '/profile',
        // I am listing this entry here because the surrounding collection processes each allowed value in order.
        '/public',
        // I am listing this entry here because the surrounding collection processes each allowed value in order.
        '/health/liveness'
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      ];

      // I am repeating the next block one item at a time so every value in the existing collection receives the same handling.
      for (const path of allPaths) {
        // I am saving `res` here so the nearby steps can reuse the same value without rebuilding it each time.
        const res = await request(app).get(path);
        // I am checking the observed value here against the behavior this test promises to protect.
        expect(res.statusCode).toBe(200);
        // I am checking the observed value here against the behavior this test promises to protect.
        expect(res.body).toHaveProperty('success', true);
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });

  // I am grouping the related test cases here so a beginner can see which behavior this section is checking.
  describe('Path sensitivity detection', () => {
    // I am registering this test setup or cleanup step here so each related scenario starts in the expected state.
    beforeEach(() => {
      // I am keeping this line here because the surrounding degradeGuard.test.js workflow expects this value or operation before it continues.
      app.locals.redisReady = false;
      // I am attaching this middleware or router here so matching requests pass through it in the existing Express order.
      app.use(degradeGuard);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    it('should detect API auth paths as sensitive', async () => {
      // I am saving `res` here so the nearby steps can reuse the same value without rebuilding it each time.
      const res = await request(app).get('/api/auth/status');
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(res.statusCode).toBe(503);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    it('should detect API users paths as sensitive', async () => {
      // I am saving `res` here so the nearby steps can reuse the same value without rebuilding it each time.
      const res = await request(app).get('/api/users/123');
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(res.statusCode).toBe(503);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    it('should detect API profile paths as sensitive', async () => {
      // I am saving `res` here so the nearby steps can reuse the same value without rebuilding it each time.
      const res = await request(app).get('/api/profile/update');
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(res.statusCode).toBe(503);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    it('should detect API submissions paths as sensitive', async () => {
      // I am saving `res` here so the nearby steps can reuse the same value without rebuilding it each time.
      const res = await request(app).get('/api/submissions/create');
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(res.statusCode).toBe(503);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    it('should detect dashboard paths as sensitive', async () => {
      // I am saving `res` here so the nearby steps can reuse the same value without rebuilding it each time.
      const res = await request(app).get('/dashboard/settings');
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(res.statusCode).toBe(503);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    it('should detect profile paths as sensitive', async () => {
      // I am saving `res` here so the nearby steps can reuse the same value without rebuilding it each time.
      const res = await request(app).get('/profile/edit');
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(res.statusCode).toBe(503);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
});
