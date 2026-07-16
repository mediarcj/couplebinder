// Description: Tests for health endpoint gating and ops access control
// Purpose: Verify public liveness vs gated readiness/ops endpoints

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';

// Mock the health routes
const healthRoutes = require('../routes/health');

describe('Health Endpoint Gating', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use('/health', healthRoutes.router);
    
    // Mock app.locals for Redis status
    app.locals.redisReady = true;
    app.locals.rateLimitStoreReady = true;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Public Health Endpoints', () => {
    it('should return minimal response for base /health endpoint', async () => {
      const res = await request(app).get('/health');
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ ok: true });
      // Ensure no internal details are exposed
      expect(res.body).not.toHaveProperty('uptime');
      expect(res.body).not.toHaveProperty('memory');
      expect(res.body).not.toHaveProperty('nodeVersion');
      expect(res.body).not.toHaveProperty('services');
    });

    it('should return 200 OK for liveness check', async () => {
      const res = await request(app).get('/health/liveness');
      expect(res.statusCode).toBe(200);
      expect(res.text).toBe('OK');
    });

    it('should work without any authentication', async () => {
      const res = await request(app).get('/health/liveness');
      expect(res.statusCode).toBe(200);
    });
  });

  describe('Gated Readiness Endpoint', () => {
    it('should return minimal response for non-ops requests', async () => {
      const res = await request(app).get('/health/readiness');
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ status: 'ok' });
    });

    it('should return detailed response with X-Ops-Token', async () => {
      process.env.OPS_HEALTH_TOKEN = 'test-token';
      
      const res = await request(app)
        .get('/health/readiness')
        .set('X-Ops-Token', 'test-token');
      
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('status', 'ready');
      expect(res.body).toHaveProperty('redisReady');
      expect(res.body).toHaveProperty('uptimeSec');
      expect(res.body).toHaveProperty('checks');
      
      delete process.env.OPS_HEALTH_TOKEN;
    });

    it('should return detailed response for allowlisted IP', async () => {
      process.env.OPS_HEALTH_IPS = '127.0.0.1,::1';
      
      const res = await request(app)
        .get('/health/readiness')
        .set('X-Forwarded-For', '127.0.0.1');
      
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('status', 'ready');
      expect(res.body).toHaveProperty('redisReady');
      
      delete process.env.OPS_HEALTH_IPS;
    });
  });

  describe('Gated Ops Endpoint', () => {
    it('should return 401 for non-ops requests', async () => {
      const res = await request(app).get('/health/ops');
      expect(res.statusCode).toBe(401);
      expect(res.body).toHaveProperty('status', 'error');
      expect(res.body).toHaveProperty('message', 'Unauthorized - ops token or IP required');
    });

    it('should return detailed ops data with X-Ops-Token', async () => {
      process.env.OPS_HEALTH_TOKEN = 'test-token';
      
      const res = await request(app)
        .get('/health/ops')
        .set('X-Ops-Token', 'test-token');
      
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('timestamp');
      expect(res.body).toHaveProperty('system');
      expect(res.body).toHaveProperty('services');
      
      delete process.env.OPS_HEALTH_TOKEN;
    });
  });

  describe('Gated Detailed Endpoint', () => {
    it('should return 401 for non-ops requests', async () => {
      const res = await request(app).get('/health/detailed');
      expect(res.statusCode).toBe(401);
      expect(res.body).toHaveProperty('status', 'error');
      expect(res.body).toHaveProperty('message', 'Unauthorized - ops token or IP required');
    });

    it('should return detailed health data with X-Ops-Token', async () => {
      process.env.OPS_HEALTH_TOKEN = 'test-token';
      
      const res = await request(app)
        .get('/health/detailed')
        .set('X-Ops-Token', 'test-token');
      
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('timestamp');
      expect(res.body).toHaveProperty('services');
      expect(res.body).toHaveProperty('requests');
      
      delete process.env.OPS_HEALTH_TOKEN;
    });
  });
});
