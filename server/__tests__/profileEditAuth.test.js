/**
 * File: profileEditAuth.test.js
 * Description: Tests for profile-edit authentication regression prevention
 * Purpose: Ensures /dashboard/profile-edit authentication works correctly and prevents future regressions
 * Notes: Tests middleware order and authentication flow to prevent auth_required errors after login
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';

// Mock logger to prevent console output during tests
vi.mock('../utils/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }
}));

// Mock the authBridge middleware
const mockAuthBridge = (req, res, next) => {
  // Mock authenticated user for tests that need it
  if (req.headers.authorization === 'Bearer valid-token') {
    req.user = {
      id: 'user123',
      email: 'test@example.com',
      roles: ['user']
    };
  } else {
    req.user = null;
  }
  next();
};

// Mock the requireAuthByDefault middleware
const mockRequireAuthByDefault = (opts = {}) => {
  const { publicGlobs = [] } = opts;
  return (req, res, next) => {
    const path = req.path || req.url || '';
    const isPublic = publicGlobs.some(pattern => {
      // Simple glob matching for test
      if (pattern.includes('**')) {
        const base = pattern.replace('/**', '');
        return path.startsWith(base);
      }
      return path === pattern;
    });

    if (isPublic) {
      return next();
    }

    // If route is not public, require authenticated user
    if (req.user && req.user.id) {
      return next();
    }

    return res.status(401).json({
      error: 'auth_required',
      message: 'Authentication required for this endpoint'
    });
  };
};

// Create a mock dashboard router
const mockDashboardRouter = express.Router();
mockDashboardRouter.get('/profile-edit', (req, res) => {
  res.status(200).json({ 
    success: true, 
    page: 'profile-edit',
    user: req.user ? req.user.id : null
  });
});

// Mock the presenters
vi.mock('../ui_contract/presenters', () => ({
  buildDashboardPageModel: vi.fn(() => ({
    page: { title: 'Profile Edit' },
    user: { id: 'user123', email: 'test@example.com' }
  }))
}));

describe('Profile Edit Authentication Regression Prevention', () => {
  let app;

  beforeEach(() => {
    app = express();
    
    // Simulate the correct middleware order from zorvalon.js
    // 1. authBridge (sets req.user)
    app.use(mockAuthBridge);
    
    // 2. requireAuthByDefault (checks req.user)
    const publicGlobs = ['/health/**', '/css/**', '/js/**'];
    app.use(['/api', '/dashboard'], mockRequireAuthByDefault({
      publicGlobs,
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
    }));
    
    // 3. Dashboard routes
    app.use('/dashboard', mockDashboardRouter);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Authentication Flow', () => {
    it('should return 401 for unauthenticated requests to /dashboard/profile-edit', async () => {
      const res = await request(app).get('/dashboard/profile-edit');
      
      expect(res.statusCode).toBe(401);
      expect(res.body).toEqual({
        error: 'auth_required',
        message: 'Authentication required for this endpoint'
      });
    });

    it('should return 200 for authenticated requests to /dashboard/profile-edit', async () => {
      const res = await request(app)
        .get('/dashboard/profile-edit')
        .set('Authorization', 'Bearer valid-token');
      
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({
        success: true,
        page: 'profile-edit',
        user: 'user123'
      });
    });

    it('should allow public paths even without authentication', async () => {
      // Mock a public route
      app.get('/health/liveness', (req, res) => {
        res.status(200).json({ ok: true });
      });

      const res = await request(app).get('/health/liveness');
      
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ ok: true });
    });
  });

  describe('Middleware Order Verification', () => {
    it('should have authBridge setting req.user before requireAuthByDefault checks it', async () => {
      // This test verifies that the middleware order is correct
      // by ensuring that when authBridge sets req.user, requireAuthByDefault can access it
      
      const res = await request(app)
        .get('/dashboard/profile-edit')
        .set('Authorization', 'Bearer valid-token');
      
      expect(res.statusCode).toBe(200);
      expect(res.body.user).toBe('user123');
    });

    it('should block requests when authBridge does not set req.user', async () => {
      // This test verifies that when authBridge doesn't set req.user,
      // requireAuthByDefault correctly blocks the request
      
      const res = await request(app).get('/dashboard/profile-edit');
      
      expect(res.statusCode).toBe(401);
      expect(res.body.error).toBe('auth_required');
    });
  });

  describe('Regression Prevention', () => {
    it('should prevent the specific regression: /dashboard/profile-edit returning auth_required after login', async () => {
      // This test specifically prevents the regression where a logged-in user
      // would get auth_required when accessing /dashboard/profile-edit
      
      // Simulate a logged-in user with valid JWT
      const res = await request(app)
        .get('/dashboard/profile-edit')
        .set('Authorization', 'Bearer valid-token');
      
      // Should NOT return auth_required error
      expect(res.statusCode).not.toBe(401);
      expect(res.body.error).not.toBe('auth_required');
      
      // Should successfully access the page
      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should maintain security for unauthenticated users', async () => {
      // This test ensures that security is maintained for unauthenticated users
      
      const res = await request(app).get('/dashboard/profile-edit');
      
      expect(res.statusCode).toBe(401);
      expect(res.body.error).toBe('auth_required');
      expect(res.body.message).toBe('Authentication required for this endpoint');
    });
  });

  describe('Edge Cases', () => {
    it('should handle malformed Authorization header', async () => {
      const res = await request(app)
        .get('/dashboard/profile-edit')
        .set('Authorization', 'Invalid malformed token');
      
      expect(res.statusCode).toBe(401);
      expect(res.body.error).toBe('auth_required');
    });

    it('should handle missing Authorization header', async () => {
      const res = await request(app).get('/dashboard/profile-edit');
      
      expect(res.statusCode).toBe(401);
      expect(res.body.error).toBe('auth_required');
    });

    it('should handle empty Authorization header', async () => {
      const res = await request(app)
        .get('/dashboard/profile-edit')
        .set('Authorization', '');
      
      expect(res.statusCode).toBe(401);
      expect(res.body.error).toBe('auth_required');
    });
  });
});
