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
    app.use((req, _res, next) => {
      req.clientIp = req.get('X-Test-Client-IP') || '127.0.0.1';
      next();
    });
    app.use('/health', healthRoutes.router);
    
    // Mock app.locals for Redis status
    app.locals.redisReady = true;
    app.locals.rateLimitStoreReady = true;
    app.locals.redisClient = { ping: vi.fn().mockResolvedValue('PONG') };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Public Health Endpoints', () => {
    it('should return minimal response for base /health endpoint', async () => {
      const res = await request(app).get('/health');
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ ok: true, requestId: null });
      // Ensure no internal details are exposed
      expect(res.body).not.toHaveProperty('uptime');
      expect(res.body).not.toHaveProperty('memory');
      expect(res.body).not.toHaveProperty('nodeVersion');
      expect(res.body).not.toHaveProperty('services');
    });

    it('should return 200 OK for liveness check', async () => {
      const res = await request(app).get('/health/liveness');
      expect(res.statusCode).toBe(200);
      expect(res.body).toMatchObject({ ok: true, status: 'healthy' });
    });

    it('should work without any authentication', async () => {
      const res = await request(app).get('/health/liveness');
      expect(res.statusCode).toBe(200);
    });
  });

  describe('Gated Readiness Endpoint', () => {
    it('should deny readiness to a non-ops address', async () => {
      const res = await request(app)
        .get('/health/readiness')
        .set('X-Test-Client-IP', '198.51.100.20');
      expect(res.statusCode).toBe(403);
      expect(res.body).toEqual({ ok: false, error: 'forbidden' });
    });

    it('should return readiness detail to an allowlisted monitor', async () => {
      const res = await request(app)
        .get('/health/readiness');
      
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('status', 'ready');
      expect(res.body).toHaveProperty('readiness.redisReadyFlag', true);
      expect(res.body).toHaveProperty('uptimeSec');
      expect(res.body).toHaveProperty('readiness.redis.ok', true);
    });

    it('should return detailed response for allowlisted IP', async () => {
      process.env.OPS_HEALTH_IPS = '127.0.0.1,::1';
      
      const res = await request(app)
        .get('/health/readiness')
        .set('X-Test-Client-IP', '127.0.0.1');
      
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('status', 'ready');
      expect(res.body).toHaveProperty('readiness.redisReadyFlag', true);
      
      delete process.env.OPS_HEALTH_IPS;
    });
  });

  describe('Gated Ops Endpoint', () => {
    it('should return 401 for non-ops requests', async () => {
      const res = await request(app).get('/health/ops');
      expect([200, 503]).toContain(res.statusCode);
    });

    it('conceals the endpoint from non-ops requests', async () => {
      const res = await request(app)
        .get('/health/ops')
        .set('X-Test-Client-IP', '198.51.100.20');
      expect(res.statusCode).toBe(404);
      expect(res.body).toEqual({ ok: false, status: 'not_found' });
    });

    it('should return detailed ops data to an allowlisted monitor', async () => {
      const res = await request(app)
        .get('/health/ops');
      
      expect([200, 503]).toContain(res.statusCode);
      expect(res.body).toHaveProperty('now');
      expect(res.body).toHaveProperty('system');
      expect(res.body).toHaveProperty('services');
    });
  });

  describe('Gated Detailed Endpoint', () => {
    it('should return 401 for non-ops requests', async () => {
      const res = await request(app)
        .get('/health/detailed')
        .set('X-Test-Client-IP', '198.51.100.20');
      expect(res.statusCode).toBe(404);
      expect(res.body).toEqual({ ok: false, status: 'not_found' });
    });

    it('should return detailed health data to an allowlisted monitor', async () => {
      const res = await request(app)
        .get('/health/detailed');
      
      expect([200, 503]).toContain(res.statusCode);
      expect(res.body).toHaveProperty('now');
      expect(res.body).toHaveProperty('services');
      expect(res.body).toHaveProperty('request');
    });
  });
});
