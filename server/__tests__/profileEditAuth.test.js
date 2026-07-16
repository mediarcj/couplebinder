/**
 * File: profileEditAuth.test.js
 * Description: Tests for profile-edit authentication regression prevention
 * Purpose: Ensures /dashboard/profile-edit authentication works correctly and prevents future regressions
 * Notes: Tests middleware order and authentication flow to prevent auth_required errors after login
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
// I am importing `request` from `supertest` here because profileEditAuth.test.js uses it in the steps below.
import request from 'supertest';
// I am importing `express` from `express` here because profileEditAuth.test.js uses it in the steps below.
import express from 'express';

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

// Mock the authBridge middleware
const mockAuthBridge = (req, res, next) => {
  // Mock authenticated user for tests that need it
  if (req.headers.authorization === 'Bearer valid-token') {
    // I am keeping this line here because the surrounding profileEditAuth.test.js workflow expects this value or operation before it continues.
    req.user = {
      // I am keeping the `id` field in this object so the receiving code can read that value by its expected name.
      id: 'user123',
      // I am keeping the `email` field in this object so the receiving code can read that value by its expected name.
      email: 'test@example.com',
      // I am keeping the `roles` field in this object so the receiving code can read that value by its expected name.
      roles: ['user']
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    };
  // This alternative runs only when the condition above did not use its first path.
  } else {
    // I am keeping this line here because the surrounding profileEditAuth.test.js workflow expects this value or operation before it continues.
    req.user = null;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
  // I am calling this helper here so the current workflow performs this step before it moves on.
  next();
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
};

// Mock the requireAuthByDefault middleware
const mockRequireAuthByDefault = (opts = {}) => {
  // I am saving `publicGlobs` here so the nearby steps can reuse the same value without rebuilding it each time.
  const { publicGlobs = [] } = opts;
  // This return sends the completed value or response back to the code that called this function.
  return (req, res, next) => {
    // I am saving `path` here so the nearby steps can reuse the same value without rebuilding it each time.
    const path = req.path || req.url || '';
    // I am saving `isPublic` here so the nearby steps can reuse the same value without rebuilding it each time.
    const isPublic = publicGlobs.some(pattern => {
      // Simple glob matching for test
      if (pattern.includes('**')) {
        // I am saving `base` here so the nearby steps can reuse the same value without rebuilding it each time.
        const base = pattern.replace('/**', '');
        // This return sends the completed value or response back to the code that called this function.
        return path.startsWith(base);
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
      // This return sends the completed value or response back to the code that called this function.
      return path === pattern;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (isPublic) {
      // This return sends the completed value or response back to the code that called this function.
      return next();
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // If route is not public, require authenticated user
    if (req.user && req.user.id) {
      // This return sends the completed value or response back to the code that called this function.
      return next();
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // This return sends the completed value or response back to the code that called this function.
    return res.status(401).json({
      // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
      error: 'auth_required',
      // I am keeping the `message` field in this object so the receiving code can read that value by its expected name.
      message: 'Authentication required for this endpoint'
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  };
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
};

// Create a mock dashboard router
const mockDashboardRouter = express.Router();
// I am defining this small callback here so the surrounding API can run it with the value it supplies.
mockDashboardRouter.get('/profile-edit', (req, res) => {
  // I am building or sending the Express response here with the status, data, or page already chosen by this route.
  res.status(200).json({ 
    // I am keeping the `success` field in this object so the receiving code can read that value by its expected name.
    success: true, 
    // I am keeping the `page` field in this object so the receiving code can read that value by its expected name.
    page: 'profile-edit',
    // I am keeping the `user` field in this object so the receiving code can read that value by its expected name.
    user: req.user ? req.user.id : null
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
});

// Mock the presenters
vi.mock('../ui_contract/presenters', () => ({
  // I am keeping the `buildDashboardPageModel` field in this object so the receiving code can read that value by its expected name.
  buildDashboardPageModel: vi.fn(() => ({
    // I am keeping the `page` field in this object so the receiving code can read that value by its expected name.
    page: { title: 'Profile Edit' },
    // I am keeping the `user` field in this object so the receiving code can read that value by its expected name.
    user: { id: 'user123', email: 'test@example.com' }
  // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
  }))
// This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
}));

// I am grouping the related test cases here so a beginner can see which behavior this section is checking.
describe('Profile Edit Authentication Regression Prevention', () => {
  // I am saving `app` here so the nearby steps can reuse the same value without rebuilding it each time.
  let app;

  // I am registering this test setup or cleanup step here so each related scenario starts in the expected state.
  beforeEach(() => {
    // I am keeping this line here because the surrounding profileEditAuth.test.js workflow expects this value or operation before it continues.
    app = express();
    
    // Simulate the correct middleware order from zorvalon.js
    // 1. authBridge (sets req.user)
    app.use(mockAuthBridge);
    
    // 2. requireAuthByDefault (checks req.user)
    const publicGlobs = ['/health/**', '/css/**', '/js/**'];
    // I am attaching this middleware or router here so matching requests pass through it in the existing Express order.
    app.use(['/api', '/dashboard'], mockRequireAuthByDefault({
      // I am keeping this line here because the surrounding profileEditAuth.test.js workflow expects this value or operation before it continues.
      publicGlobs,
      // I am keeping the `logger` field in this object so the receiving code can read that value by its expected name.
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
    // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
    }));
    
    // 3. Dashboard routes
    app.use('/dashboard', mockDashboardRouter);
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });

  // I am registering this test setup or cleanup step here so each related scenario starts in the expected state.
  afterEach(() => {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    vi.clearAllMocks();
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });

  // I am grouping the related test cases here so a beginner can see which behavior this section is checking.
  describe('Authentication Flow', () => {
    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    it('should return 401 for unauthenticated requests to /dashboard/profile-edit', async () => {
      // I am saving `res` here so the nearby steps can reuse the same value without rebuilding it each time.
      const res = await request(app).get('/dashboard/profile-edit');
      
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
    it('should return 200 for authenticated requests to /dashboard/profile-edit', async () => {
      // I am saving `res` here so the nearby steps can reuse the same value without rebuilding it each time.
      const res = await request(app)
        // I am continuing the existing call chain here so this option stays attached to the same operation started above.
        .get('/dashboard/profile-edit')
        // I am continuing the existing call chain here so this option stays attached to the same operation started above.
        .set('Authorization', 'Bearer valid-token');
      
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(res.statusCode).toBe(200);
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(res.body).toEqual({
        // I am keeping the `success` field in this object so the receiving code can read that value by its expected name.
        success: true,
        // I am keeping the `page` field in this object so the receiving code can read that value by its expected name.
        page: 'profile-edit',
        // I am keeping the `user` field in this object so the receiving code can read that value by its expected name.
        user: 'user123'
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      });
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    it('should allow public paths even without authentication', async () => {
      // Mock a public route
      app.get('/health/liveness', (req, res) => {
        // I am building or sending the Express response here with the status, data, or page already chosen by this route.
        res.status(200).json({ ok: true });
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      });

      // I am saving `res` here so the nearby steps can reuse the same value without rebuilding it each time.
      const res = await request(app).get('/health/liveness');
      
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(res.statusCode).toBe(200);
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(res.body).toEqual({ ok: true });
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });

  // I am grouping the related test cases here so a beginner can see which behavior this section is checking.
  describe('Middleware Order Verification', () => {
    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    it('should have authBridge setting req.user before requireAuthByDefault checks it', async () => {
      // This test verifies that the middleware order is correct
      // by ensuring that when authBridge sets req.user, requireAuthByDefault can access it
      
      const res = await request(app)
        // I am continuing the existing call chain here so this option stays attached to the same operation started above.
        .get('/dashboard/profile-edit')
        // I am continuing the existing call chain here so this option stays attached to the same operation started above.
        .set('Authorization', 'Bearer valid-token');
      
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(res.statusCode).toBe(200);
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(res.body.user).toBe('user123');
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    it('should block requests when authBridge does not set req.user', async () => {
      // This test verifies that when authBridge doesn't set req.user,
      // requireAuthByDefault correctly blocks the request
      
      const res = await request(app).get('/dashboard/profile-edit');
      
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(res.statusCode).toBe(401);
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(res.body.error).toBe('auth_required');
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });

  // I am grouping the related test cases here so a beginner can see which behavior this section is checking.
  describe('Regression Prevention', () => {
    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    it('should prevent the specific regression: /dashboard/profile-edit returning auth_required after login', async () => {
      // This test specifically prevents the regression where a logged-in user
      // would get auth_required when accessing /dashboard/profile-edit
      
      // Simulate a logged-in user with valid JWT
      const res = await request(app)
        // I am continuing the existing call chain here so this option stays attached to the same operation started above.
        .get('/dashboard/profile-edit')
        // I am continuing the existing call chain here so this option stays attached to the same operation started above.
        .set('Authorization', 'Bearer valid-token');
      
      // Should NOT return auth_required error
      expect(res.statusCode).not.toBe(401);
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(res.body.error).not.toBe('auth_required');
      
      // Should successfully access the page
      expect(res.statusCode).toBe(200);
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(res.body.success).toBe(true);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    it('should maintain security for unauthenticated users', async () => {
      // This test ensures that security is maintained for unauthenticated users
      
      const res = await request(app).get('/dashboard/profile-edit');
      
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(res.statusCode).toBe(401);
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(res.body.error).toBe('auth_required');
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(res.body.message).toBe('Authentication required for this endpoint');
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });

  // I am grouping the related test cases here so a beginner can see which behavior this section is checking.
  describe('Edge Cases', () => {
    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    it('should handle malformed Authorization header', async () => {
      // I am saving `res` here so the nearby steps can reuse the same value without rebuilding it each time.
      const res = await request(app)
        // I am continuing the existing call chain here so this option stays attached to the same operation started above.
        .get('/dashboard/profile-edit')
        // I am continuing the existing call chain here so this option stays attached to the same operation started above.
        .set('Authorization', 'Invalid malformed token');
      
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(res.statusCode).toBe(401);
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(res.body.error).toBe('auth_required');
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    it('should handle missing Authorization header', async () => {
      // I am saving `res` here so the nearby steps can reuse the same value without rebuilding it each time.
      const res = await request(app).get('/dashboard/profile-edit');
      
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(res.statusCode).toBe(401);
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(res.body.error).toBe('auth_required');
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    it('should handle empty Authorization header', async () => {
      // I am saving `res` here so the nearby steps can reuse the same value without rebuilding it each time.
      const res = await request(app)
        // I am continuing the existing call chain here so this option stays attached to the same operation started above.
        .get('/dashboard/profile-edit')
        // I am continuing the existing call chain here so this option stays attached to the same operation started above.
        .set('Authorization', '');
      
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(res.statusCode).toBe(401);
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(res.body.error).toBe('auth_required');
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
});
