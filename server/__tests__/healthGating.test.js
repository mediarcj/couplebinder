// File: server/__tests__/healthGating.test.js
// Description: Tests for health endpoint gating and ops access control
// Purpose: Verify public liveness vs gated readiness/ops endpoints

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
// I am importing `request` from `supertest` here because healthGating.test.js uses it in the steps below.
import request from 'supertest';
// I am importing `express` from `express` here because healthGating.test.js uses it in the steps below.
import express from 'express';

// Mock the health routes
const healthRoutes = require('../routes/health');

// I am grouping the related test cases here so a beginner can see which behavior this section is checking.
describe('Health Endpoint Gating', () => {
  // I am saving `app` here so the nearby steps can reuse the same value without rebuilding it each time.
  let app;

  // I am registering this test setup or cleanup step here so each related scenario starts in the expected state.
  beforeEach(() => {
    // I am keeping this line here because the surrounding healthGating.test.js workflow expects this value or operation before it continues.
    app = express();
    // I am attaching this middleware or router here so matching requests pass through it in the existing Express order.
    app.use('/health', healthRoutes.router);
    
    // Mock app.locals for Redis status
    app.locals.redisReady = true;
    // I am keeping this line here because the surrounding healthGating.test.js workflow expects this value or operation before it continues.
    app.locals.rateLimitStoreReady = true;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });

  // I am registering this test setup or cleanup step here so each related scenario starts in the expected state.
  afterEach(() => {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    vi.clearAllMocks();
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });

  // I am grouping the related test cases here so a beginner can see which behavior this section is checking.
  describe('Public Health Endpoints', () => {
    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    it('should return minimal response for base /health endpoint', async () => {
      // I am saving `res` here so the nearby steps can reuse the same value without rebuilding it each time.
      const res = await request(app).get('/health');
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(res.statusCode).toBe(200);
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(res.body).toEqual({ ok: true });
      // Ensure no internal details are exposed
      expect(res.body).not.toHaveProperty('uptime');
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(res.body).not.toHaveProperty('memory');
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(res.body).not.toHaveProperty('nodeVersion');
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(res.body).not.toHaveProperty('services');
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    it('should return 200 OK for liveness check', async () => {
      // I am saving `res` here so the nearby steps can reuse the same value without rebuilding it each time.
      const res = await request(app).get('/health/liveness');
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(res.statusCode).toBe(200);
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(res.text).toBe('OK');
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    it('should work without any authentication', async () => {
      // I am saving `res` here so the nearby steps can reuse the same value without rebuilding it each time.
      const res = await request(app).get('/health/liveness');
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(res.statusCode).toBe(200);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });

  // I am grouping the related test cases here so a beginner can see which behavior this section is checking.
  describe('Gated Readiness Endpoint', () => {
    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    it('should return minimal response for non-ops requests', async () => {
      // I am saving `res` here so the nearby steps can reuse the same value without rebuilding it each time.
      const res = await request(app).get('/health/readiness');
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(res.statusCode).toBe(200);
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(res.body).toEqual({ status: 'ok' });
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    it('should return detailed response with X-Ops-Token', async () => {
      // I am keeping this line here because the surrounding healthGating.test.js workflow expects this value or operation before it continues.
      process.env.OPS_HEALTH_TOKEN = 'test-token';
      
      // I am saving `res` here so the nearby steps can reuse the same value without rebuilding it each time.
      const res = await request(app)
        // I am continuing the existing call chain here so this option stays attached to the same operation started above.
        .get('/health/readiness')
        // I am continuing the existing call chain here so this option stays attached to the same operation started above.
        .set('X-Ops-Token', 'test-token');
      
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(res.statusCode).toBe(200);
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(res.body).toHaveProperty('status', 'ready');
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(res.body).toHaveProperty('redisReady');
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(res.body).toHaveProperty('uptimeSec');
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(res.body).toHaveProperty('checks');
      
      // I am keeping this line here because the surrounding healthGating.test.js workflow expects this value or operation before it continues.
      delete process.env.OPS_HEALTH_TOKEN;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    it('should return detailed response for allowlisted IP', async () => {
      // I am keeping this line here because the surrounding healthGating.test.js workflow expects this value or operation before it continues.
      process.env.OPS_HEALTH_IPS = '127.0.0.1,::1';
      
      // I am saving `res` here so the nearby steps can reuse the same value without rebuilding it each time.
      const res = await request(app)
        // I am continuing the existing call chain here so this option stays attached to the same operation started above.
        .get('/health/readiness')
        // I am continuing the existing call chain here so this option stays attached to the same operation started above.
        .set('X-Forwarded-For', '127.0.0.1');
      
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(res.statusCode).toBe(200);
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(res.body).toHaveProperty('status', 'ready');
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(res.body).toHaveProperty('redisReady');
      
      // I am keeping this line here because the surrounding healthGating.test.js workflow expects this value or operation before it continues.
      delete process.env.OPS_HEALTH_IPS;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });

  // I am grouping the related test cases here so a beginner can see which behavior this section is checking.
  describe('Gated Ops Endpoint', () => {
    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    it('should return 401 for non-ops requests', async () => {
      // I am saving `res` here so the nearby steps can reuse the same value without rebuilding it each time.
      const res = await request(app).get('/health/ops');
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(res.statusCode).toBe(401);
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(res.body).toHaveProperty('status', 'error');
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(res.body).toHaveProperty('message', 'Unauthorized - ops token or IP required');
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    it('should return detailed ops data with X-Ops-Token', async () => {
      // I am keeping this line here because the surrounding healthGating.test.js workflow expects this value or operation before it continues.
      process.env.OPS_HEALTH_TOKEN = 'test-token';
      
      // I am saving `res` here so the nearby steps can reuse the same value without rebuilding it each time.
      const res = await request(app)
        // I am continuing the existing call chain here so this option stays attached to the same operation started above.
        .get('/health/ops')
        // I am continuing the existing call chain here so this option stays attached to the same operation started above.
        .set('X-Ops-Token', 'test-token');
      
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(res.statusCode).toBe(200);
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(res.body).toHaveProperty('timestamp');
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(res.body).toHaveProperty('system');
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(res.body).toHaveProperty('services');
      
      // I am keeping this line here because the surrounding healthGating.test.js workflow expects this value or operation before it continues.
      delete process.env.OPS_HEALTH_TOKEN;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });

  // I am grouping the related test cases here so a beginner can see which behavior this section is checking.
  describe('Gated Detailed Endpoint', () => {
    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    it('should return 401 for non-ops requests', async () => {
      // I am saving `res` here so the nearby steps can reuse the same value without rebuilding it each time.
      const res = await request(app).get('/health/detailed');
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(res.statusCode).toBe(401);
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(res.body).toHaveProperty('status', 'error');
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(res.body).toHaveProperty('message', 'Unauthorized - ops token or IP required');
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    it('should return detailed health data with X-Ops-Token', async () => {
      // I am keeping this line here because the surrounding healthGating.test.js workflow expects this value or operation before it continues.
      process.env.OPS_HEALTH_TOKEN = 'test-token';
      
      // I am saving `res` here so the nearby steps can reuse the same value without rebuilding it each time.
      const res = await request(app)
        // I am continuing the existing call chain here so this option stays attached to the same operation started above.
        .get('/health/detailed')
        // I am continuing the existing call chain here so this option stays attached to the same operation started above.
        .set('X-Ops-Token', 'test-token');
      
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(res.statusCode).toBe(200);
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(res.body).toHaveProperty('timestamp');
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(res.body).toHaveProperty('services');
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(res.body).toHaveProperty('requests');
      
      // I am keeping this line here because the surrounding healthGating.test.js workflow expects this value or operation before it continues.
      delete process.env.OPS_HEALTH_TOKEN;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
});
