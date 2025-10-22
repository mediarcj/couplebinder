// File: server/__tests__/authGuard.test.js
// Description: Tests for auth guard utilities and assertUser helper
// Purpose: Verify safe user access patterns and error handling

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { assertUser, hasUser, getUserId, getUserEmail } from '../utils/authz';

describe('Auth Guard Utilities', () => {
  let mockReq;

  beforeEach(() => {
    mockReq = {
      user: {
        id: 'user-123',
        email: 'test@example.com',
        role: 'user'
      }
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('assertUser', () => {
    it('should return user when authenticated', () => {
      const user = assertUser(mockReq);
      expect(user).toEqual(mockReq.user);
    });

    it('should throw 401 error when user is null', () => {
      mockReq.user = null;
      
      expect(() => assertUser(mockReq)).toThrow();
      try {
        assertUser(mockReq);
      } catch (error) {
        expect(error.status).toBe(401);
        expect(error.message).toBe('Authentication required');
      }
    });

    it('should throw 401 error when user has no id', () => {
      mockReq.user = { email: 'test@example.com' };
      
      expect(() => assertUser(mockReq)).toThrow();
      try {
        assertUser(mockReq);
      } catch (error) {
        expect(error.status).toBe(401);
        expect(error.message).toBe('Authentication required');
      }
    });

    it('should throw 401 error when user is undefined', () => {
      mockReq.user = undefined;
      
      expect(() => assertUser(mockReq)).toThrow();
      try {
        assertUser(mockReq);
      } catch (error) {
        expect(error.status).toBe(401);
        expect(error.message).toBe('Authentication required');
      }
    });
  });

  describe('hasUser', () => {
    it('should return true when user is authenticated', () => {
      expect(hasUser(mockReq)).toBe(true);
    });

    it('should return false when user is null', () => {
      mockReq.user = null;
      expect(hasUser(mockReq)).toBe(false);
    });

    it('should return false when user has no id', () => {
      mockReq.user = { email: 'test@example.com' };
      expect(hasUser(mockReq)).toBe(false);
    });

    it('should return false when user is undefined', () => {
      mockReq.user = undefined;
      expect(hasUser(mockReq)).toBe(false);
    });
  });

  describe('getUserId', () => {
    it('should return user id when authenticated', () => {
      expect(getUserId(mockReq)).toBe('user-123');
    });

    it('should return null when user is null', () => {
      mockReq.user = null;
      expect(getUserId(mockReq)).toBe(null);
    });

    it('should return null when user has no id', () => {
      mockReq.user = { email: 'test@example.com' };
      expect(getUserId(mockReq)).toBe(null);
    });

    it('should return null when user is undefined', () => {
      mockReq.user = undefined;
      expect(getUserId(mockReq)).toBe(null);
    });
  });

  describe('getUserEmail', () => {
    it('should return user email when authenticated', () => {
      expect(getUserEmail(mockReq)).toBe('test@example.com');
    });

    it('should return null when user is null', () => {
      mockReq.user = null;
      expect(getUserEmail(mockReq)).toBe(null);
    });

    it('should return null when user has no email', () => {
      mockReq.user = { id: 'user-123' };
      expect(getUserEmail(mockReq)).toBe(null);
    });

    it('should return null when user is undefined', () => {
      mockReq.user = undefined;
      expect(getUserEmail(mockReq)).toBe(null);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty user object', () => {
      mockReq.user = {};
      
      expect(hasUser(mockReq)).toBe(false);
      expect(getUserId(mockReq)).toBe(null);
      expect(getUserEmail(mockReq)).toBe(null);
      expect(() => assertUser(mockReq)).toThrow();
    });

    it('should handle user with null id', () => {
      mockReq.user = { id: null, email: 'test@example.com' };
      
      expect(hasUser(mockReq)).toBe(false);
      expect(getUserId(mockReq)).toBe(null);
      expect(getUserEmail(mockReq)).toBe('test@example.com');
      expect(() => assertUser(mockReq)).toThrow();
    });

    it('should handle user with empty string id', () => {
      mockReq.user = { id: '', email: 'test@example.com' };
      
      expect(hasUser(mockReq)).toBe(false);
      expect(getUserId(mockReq)).toBe('');
      expect(getUserEmail(mockReq)).toBe('test@example.com');
      expect(() => assertUser(mockReq)).toThrow();
    });
  });
});
