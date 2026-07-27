// Description: Tests for Redis degrade guard middleware
// Purpose: Verify 503 responses for sensitive paths when Redis is down

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import degradeGuard from '../middleware/degradeGuard';

vi.mock('../utils/logger', () => ({
  warn: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  debug: vi.fn()
}));

describe('Redis Degrade Guard', () => {
  let app;

  beforeEach(() => {
    app = express();
    
    // Mock app.locals
    app.locals.redisReady = false;
    app.locals.rateLimitStoreReady = false;
  });

  function addTestRoutes() {
    app.get('/api/auth/login', (req, res) => res.json({ success: true }));
    app.get('/api/users/profile', (req, res) => res.json({ success: true }));
    app.get('/api/profile/me', (req, res) => res.json({ success: true }));
    app.get('/api/submissions', (req, res) => res.json({ success: true }));
    app.get('/dashboard', (req, res) => res.json({ success: true }));
    app.get('/profile', (req, res) => res.json({ success: true }));
    app.get('/public', (req, res) => res.json({ success: true }));
    app.get('/health/liveness', (req, res) => res.json({ success: true }));
  }

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('When Redis is down', () => {
    beforeEach(() => {
      app.locals.redisReady = false;
      app.use(degradeGuard);
      addTestRoutes();
    });

    it('should block sensitive API paths with 503', async () => {
      const sensitivePaths = [
        '/api/auth/login',
        '/api/users/profile',
        '/api/profile/me',
        '/api/submissions'
      ];

      for (const path of sensitivePaths) {
        const res = await request(app).get(path);
        expect(res.statusCode).toBe(503);
        expect(res.body).toHaveProperty('error', 'degraded_mode');
        expect(res.body).toHaveProperty('reason', 'redis_unavailable');
        expect(res.body).toHaveProperty('retryAfter', 30);
      }
    });

    it('should block sensitive page paths with 503', async () => {
      const sensitivePaths = [
        '/dashboard',
        '/profile'
      ];

      for (const path of sensitivePaths) {
        const res = await request(app).get(path);
        expect(res.statusCode).toBe(503);
        expect(res.body).toHaveProperty('error', 'degraded_mode');
        expect(res.body).toHaveProperty('reason', 'redis_unavailable');
      }
    });

    it('should allow non-sensitive paths', async () => {
      const nonSensitivePaths = [
        '/public',
        '/health/liveness'
      ];

      for (const path of nonSensitivePaths) {
        const res = await request(app).get(path);
        expect(res.statusCode).toBe(200);
        expect(res.body).toHaveProperty('success', true);
      }
    });

    it('should log blocked requests', async () => {
      const logger = require('../utils/logger');
      const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
      
      await request(app).get('/api/auth/login');
      
      expect(warn).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'degrade.blocked_sensitive_path',
          path: '/api/auth/login',
          method: 'GET',
          reason: 'redis_unavailable'
        }),
        expect.any(String)
      );
    });
  });

  describe('When Redis is up', () => {
    beforeEach(() => {
      app.locals.redisReady = true;
      app.use(degradeGuard);
      addTestRoutes();
    });

    it('should allow all paths', async () => {
      const allPaths = [
        '/api/auth/login',
        '/api/users/profile',
        '/dashboard',
        '/profile',
        '/public',
        '/health/liveness'
      ];

      for (const path of allPaths) {
        const res = await request(app).get(path);
        expect(res.statusCode).toBe(200);
        expect(res.body).toHaveProperty('success', true);
      }
    });
  });

  describe('Path sensitivity detection', () => {
    beforeEach(() => {
      app.locals.redisReady = false;
      app.use(degradeGuard);
      addTestRoutes();
    });

    it('should detect API auth paths as sensitive', async () => {
      const res = await request(app).get('/api/auth/status');
      expect(res.statusCode).toBe(503);
    });

    it('should detect API users paths as sensitive', async () => {
      const res = await request(app).get('/api/users/123');
      expect(res.statusCode).toBe(503);
    });

    it('should detect API profile paths as sensitive', async () => {
      const res = await request(app).get('/api/profile/update');
      expect(res.statusCode).toBe(503);
    });

    it('should detect API submissions paths as sensitive', async () => {
      const res = await request(app).get('/api/submissions/create');
      expect(res.statusCode).toBe(503);
    });

    it('should detect dashboard paths as sensitive', async () => {
      const res = await request(app).get('/dashboard/settings');
      expect(res.statusCode).toBe(503);
    });

    it('should detect profile paths as sensitive', async () => {
      const res = await request(app).get('/profile/edit');
      expect(res.statusCode).toBe(503);
    });
  });
});
