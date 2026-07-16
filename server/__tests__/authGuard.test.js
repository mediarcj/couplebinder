// File: server/__tests__/authGuard.test.js
// Description: Tests for auth guard utilities and assertUser helper
// Purpose: Verify safe user access patterns and error handling

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
// I am importing `assertUser` from `../utils/authz` here because authGuard.test.js uses it in the steps below.
import { assertUser, hasUser, getUserId, getUserEmail } from '../utils/authz';

// I am grouping the related test cases here so a beginner can see which behavior this section is checking.
describe('Auth Guard Utilities', () => {
  // I am saving `mockReq` here so the nearby steps can reuse the same value without rebuilding it each time.
  let mockReq;

  // I am registering this test setup or cleanup step here so each related scenario starts in the expected state.
  beforeEach(() => {
    // I am keeping this line here because the surrounding authGuard.test.js workflow expects this value or operation before it continues.
    mockReq = {
      // I am keeping the `user` field in this object so the receiving code can read that value by its expected name.
      user: {
        // I am keeping the `id` field in this object so the receiving code can read that value by its expected name.
        id: 'user-123',
        // I am keeping the `email` field in this object so the receiving code can read that value by its expected name.
        email: 'test@example.com',
        // I am keeping the `role` field in this object so the receiving code can read that value by its expected name.
        role: 'user'
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    };
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });

  // I am registering this test setup or cleanup step here so each related scenario starts in the expected state.
  afterEach(() => {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    vi.clearAllMocks();
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });

  // I am grouping the related test cases here so a beginner can see which behavior this section is checking.
  describe('assertUser', () => {
    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    it('should return user when authenticated', () => {
      // I am saving `user` here so the nearby steps can reuse the same value without rebuilding it each time.
      const user = assertUser(mockReq);
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(user).toEqual(mockReq.user);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    it('should throw 401 error when user is null', () => {
      // I am keeping this line here because the surrounding authGuard.test.js workflow expects this value or operation before it continues.
      mockReq.user = null;
      
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(() => assertUser(mockReq)).toThrow();
      // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
      try {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        assertUser(mockReq);
      // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
      } catch (error) {
        // I am checking the observed value here against the behavior this test promises to protect.
        expect(error.status).toBe(401);
        // I am checking the observed value here against the behavior this test promises to protect.
        expect(error.message).toBe('Authentication required');
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    it('should throw 401 error when user has no id', () => {
      // I am keeping this line here because the surrounding authGuard.test.js workflow expects this value or operation before it continues.
      mockReq.user = { email: 'test@example.com' };
      
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(() => assertUser(mockReq)).toThrow();
      // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
      try {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        assertUser(mockReq);
      // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
      } catch (error) {
        // I am checking the observed value here against the behavior this test promises to protect.
        expect(error.status).toBe(401);
        // I am checking the observed value here against the behavior this test promises to protect.
        expect(error.message).toBe('Authentication required');
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    it('should throw 401 error when user is undefined', () => {
      // I am keeping this line here because the surrounding authGuard.test.js workflow expects this value or operation before it continues.
      mockReq.user = undefined;
      
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(() => assertUser(mockReq)).toThrow();
      // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
      try {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        assertUser(mockReq);
      // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
      } catch (error) {
        // I am checking the observed value here against the behavior this test promises to protect.
        expect(error.status).toBe(401);
        // I am checking the observed value here against the behavior this test promises to protect.
        expect(error.message).toBe('Authentication required');
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });

  // I am grouping the related test cases here so a beginner can see which behavior this section is checking.
  describe('hasUser', () => {
    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    it('should return true when user is authenticated', () => {
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(hasUser(mockReq)).toBe(true);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    it('should return false when user is null', () => {
      // I am keeping this line here because the surrounding authGuard.test.js workflow expects this value or operation before it continues.
      mockReq.user = null;
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(hasUser(mockReq)).toBe(false);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    it('should return false when user has no id', () => {
      // I am keeping this line here because the surrounding authGuard.test.js workflow expects this value or operation before it continues.
      mockReq.user = { email: 'test@example.com' };
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(hasUser(mockReq)).toBe(false);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    it('should return false when user is undefined', () => {
      // I am keeping this line here because the surrounding authGuard.test.js workflow expects this value or operation before it continues.
      mockReq.user = undefined;
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(hasUser(mockReq)).toBe(false);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });

  // I am grouping the related test cases here so a beginner can see which behavior this section is checking.
  describe('getUserId', () => {
    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    it('should return user id when authenticated', () => {
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(getUserId(mockReq)).toBe('user-123');
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    it('should return null when user is null', () => {
      // I am keeping this line here because the surrounding authGuard.test.js workflow expects this value or operation before it continues.
      mockReq.user = null;
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(getUserId(mockReq)).toBe(null);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    it('should return null when user has no id', () => {
      // I am keeping this line here because the surrounding authGuard.test.js workflow expects this value or operation before it continues.
      mockReq.user = { email: 'test@example.com' };
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(getUserId(mockReq)).toBe(null);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    it('should return null when user is undefined', () => {
      // I am keeping this line here because the surrounding authGuard.test.js workflow expects this value or operation before it continues.
      mockReq.user = undefined;
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(getUserId(mockReq)).toBe(null);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });

  // I am grouping the related test cases here so a beginner can see which behavior this section is checking.
  describe('getUserEmail', () => {
    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    it('should return user email when authenticated', () => {
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(getUserEmail(mockReq)).toBe('test@example.com');
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    it('should return null when user is null', () => {
      // I am keeping this line here because the surrounding authGuard.test.js workflow expects this value or operation before it continues.
      mockReq.user = null;
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(getUserEmail(mockReq)).toBe(null);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    it('should return null when user has no email', () => {
      // I am keeping this line here because the surrounding authGuard.test.js workflow expects this value or operation before it continues.
      mockReq.user = { id: 'user-123' };
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(getUserEmail(mockReq)).toBe(null);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    it('should return null when user is undefined', () => {
      // I am keeping this line here because the surrounding authGuard.test.js workflow expects this value or operation before it continues.
      mockReq.user = undefined;
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(getUserEmail(mockReq)).toBe(null);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });

  // I am grouping the related test cases here so a beginner can see which behavior this section is checking.
  describe('Edge cases', () => {
    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    it('should handle empty user object', () => {
      // I am keeping this line here because the surrounding authGuard.test.js workflow expects this value or operation before it continues.
      mockReq.user = {};
      
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(hasUser(mockReq)).toBe(false);
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(getUserId(mockReq)).toBe(null);
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(getUserEmail(mockReq)).toBe(null);
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(() => assertUser(mockReq)).toThrow();
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    it('should handle user with null id', () => {
      // I am keeping this line here because the surrounding authGuard.test.js workflow expects this value or operation before it continues.
      mockReq.user = { id: null, email: 'test@example.com' };
      
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(hasUser(mockReq)).toBe(false);
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(getUserId(mockReq)).toBe(null);
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(getUserEmail(mockReq)).toBe('test@example.com');
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(() => assertUser(mockReq)).toThrow();
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    it('should handle user with empty string id', () => {
      // I am keeping this line here because the surrounding authGuard.test.js workflow expects this value or operation before it continues.
      mockReq.user = { id: '', email: 'test@example.com' };
      
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(hasUser(mockReq)).toBe(false);
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(getUserId(mockReq)).toBe('');
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(getUserEmail(mockReq)).toBe('test@example.com');
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(() => assertUser(mockReq)).toThrow();
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
});
