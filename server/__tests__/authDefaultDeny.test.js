/**
 * Description: Tests for default-deny authentication guard middleware
 * Purpose: Verify that protected prefixes require authentication by default
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import requireAuthByDefault from '../middleware/requireAuthByDefault';

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

let app;

beforeEach(() => {
  app = express();
  app.use((req, _res, next) => {
    req.headers.accept = 'application/json';
    next();
  });
  // Reset mocks
  mockLogger.info.mockClear();
  mockLogger.warn.mockClear();
  mockLogger.error.mockClear();
  mockLogger.debug.mockClear();
});

describe('Default-Deny Auth Guard', () => {
  it('should block unauthenticated requests to protected API endpoints', async () => {
    const publicGlobs = ['/health/**'];
    app.use('/api', requireAuthByDefault({ publicGlobs, logger: mockLogger }));
    
    app.get('/api/test', (req, res) => res.status(200).send('OK'));

    const res = await request(app).get('/api/test');
    expect(res.statusCode).toBe(401);
    expect(res.body).toMatchObject({
      error: 'auth_required',
      message: 'Authentication required for this endpoint'
    });
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'auth.default_deny',
        path: '/api/test',
        method: 'GET',
        reason: 'no_authenticated_user'
      }),
      expect.any(String)
    );
  });

  it('should allow authenticated requests to protected API endpoints', async () => {
    const publicGlobs = ['/health/**'];
    // Mock authenticated user
    app.use((req, res, next) => {
      Object.assign(req, { user: { id: 'user123', email: 'test@example.com' } });
      next();
    });
    app.use('/api', requireAuthByDefault({ publicGlobs, logger: mockLogger }));
    
    app.get('/api/test', (req, res) => res.status(200).send('OK'));

    const res = await request(app).get('/api/test');
    expect(res.statusCode).toBe(200);
    expect(res.text).toBe('OK');
    expect(mockLogger.info).not.toHaveBeenCalledWith(
      expect.objectContaining({ event: 'auth.default_deny' }),
      expect.any(String)
    );
  });

  it('should allow unauthenticated requests to public paths', async () => {
    const publicGlobs = ['/api/health/**', '/api/css/**', '/api/js/**'];
    app.use('/api', requireAuthByDefault({ publicGlobs, logger: mockLogger }));
    
    app.get('/api/health/liveness', (req, res) => res.status(200).send('Health OK'));

    const res = await request(app).get('/api/health/liveness');
    expect(res.statusCode).toBe(200);
    expect(res.text).toBe('Health OK');
    expect(mockLogger.info).not.toHaveBeenCalledWith(
      expect.objectContaining({ event: 'auth.default_deny' }),
      expect.any(String)
    );
  });

  it('should block unauthenticated requests to dashboard routes', async () => {
    const publicGlobs = ['/css/**', '/js/**'];
    app.use('/dashboard', requireAuthByDefault({ publicGlobs, logger: mockLogger }));
    
    app.get('/dashboard/profile', (req, res) => res.status(200).send('Dashboard OK'));

    const res = await request(app).get('/dashboard/profile');
    expect(res.statusCode).toBe(401);
    expect(res.body).toMatchObject({
      error: 'auth_required',
      message: 'Authentication required for this endpoint'
    });
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'auth.default_deny',
        path: '/dashboard/profile',
        method: 'GET',
        reason: 'no_authenticated_user'
      }),
      expect.any(String)
    );
  });

  it('should handle empty public globs by blocking all requests', async () => {
    const publicGlobs = [];
    app.use('/api', requireAuthByDefault({ publicGlobs, logger: mockLogger }));
    
    app.get('/api/test', (req, res) => res.status(200).send('OK'));

    const res = await request(app).get('/api/test');
    expect(res.statusCode).toBe(401);
    expect(res.body).toMatchObject({
      error: 'auth_required',
      message: 'Authentication required for this endpoint'
    });
  });

  it('should handle undefined public globs by blocking all requests', async () => {
    app.use('/api', requireAuthByDefault({ logger: mockLogger }));
    
    app.get('/api/test', (req, res) => res.status(200).send('OK'));

    const res = await request(app).get('/api/test');
    expect(res.statusCode).toBe(401);
    expect(res.body).toMatchObject({
      error: 'auth_required',
      message: 'Authentication required for this endpoint'
    });
  });

  it('should handle user without id property as unauthenticated', async () => {
    const publicGlobs = [];
    // Mock user without id
    app.use((req, res, next) => {
      Object.assign(req, { user: { email: 'test@example.com' } });
      next();
    });
    app.use('/api', requireAuthByDefault({ publicGlobs, logger: mockLogger }));
    
    app.get('/api/test', (req, res) => res.status(200).send('OK'));

    const res = await request(app).get('/api/test');
    expect(res.statusCode).toBe(401);
    expect(res.body).toMatchObject({
      error: 'auth_required',
      message: 'Authentication required for this endpoint'
    });
  });

  it('should handle null user as unauthenticated', async () => {
    const publicGlobs = [];
    // Mock null user
    app.use((req, res, next) => {
      Object.assign(req, { user: null });
      next();
    });
    app.use('/api', requireAuthByDefault({ publicGlobs, logger: mockLogger }));
    
    app.get('/api/test', (req, res) => res.status(200).send('OK'));

    const res = await request(app).get('/api/test');
    expect(res.statusCode).toBe(401);
    expect(res.body).toMatchObject({
      error: 'auth_required',
      message: 'Authentication required for this endpoint'
    });
  });

  it('should include requestId in log when available', async () => {
    const publicGlobs = [];
    // Mock request with requestId
    app.use((req, res, next) => {
      req.requestId = 'req-123';
      next();
    });
    app.use('/api', requireAuthByDefault({ publicGlobs, logger: mockLogger }));
    
    app.get('/api/test', (req, res) => res.status(200).send('OK'));

    await request(app).get('/api/test');
    
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'auth.default_deny',
        path: '/api/test',
        method: 'GET',
        requestId: 'req-123',
        reason: 'no_authenticated_user'
      }),
      expect.any(String)
    );
  });
});
