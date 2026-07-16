// Description: Unit tests for auth cookie helpers, especially HTTPS detection
// Purpose: Ensure cookie setting and HTTPS detection work correctly behind proxies
// Notes: Tests isHttps() function with various header combinations

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Import the module (we'll need to test the exported functions)
// Note: isHttps is now exported from authCookie.js
const authCookie = require('../lib/authCookie');
const { isHttps } = authCookie;

describe('authCookie helpers', () => {
  describe('isHttps()', () => {
    it('should return true when x-forwarded-proto is https', () => {
      const req = {
        get: vi.fn((header) => {
          if (header === 'x-forwarded-proto') return 'https';
          return null;
        }),
        secure: false
      };

      expect(isHttps(req)).toBe(true);
      expect(req.get).toHaveBeenCalledWith('x-forwarded-proto');
    });

    it('should return true when cf-visitor contains "https"', () => {
      const req = {
        get: vi.fn((header) => {
          if (header === 'x-forwarded-proto') return null;
          if (header === 'cf-visitor' || header === 'CF-Visitor') return '{"scheme":"https"}';
          return null;
        }),
        secure: false
      };

      expect(isHttps(req)).toBe(true);
    });

    it('should return true when req.secure is true', () => {
      const req = {
        get: vi.fn(() => null),
        secure: true
      };

      expect(isHttps(req)).toBe(true);
    });

    it('should return false when none of the conditions are met', () => {
      const req = {
        get: vi.fn(() => null),
        secure: false
      };

      expect(isHttps(req)).toBe(false);
    });

    it('should handle comma-separated x-forwarded-proto values', () => {
      const req = {
        get: vi.fn((header) => {
          if (header === 'x-forwarded-proto') return 'http, https';
          return null;
        }),
        secure: false
      };

      // The function takes the first value after splitting, so 'http, https' -> 'http' -> false
      // But if we have 'https, http', it should return true
      expect(isHttps(req)).toBe(false);
      
      // Test the correct case
      const req2 = {
        get: vi.fn((header) => {
          if (header === 'x-forwarded-proto') return 'https, http';
          return null;
        }),
        secure: false
      };
      expect(isHttps(req2)).toBe(true);
    });

    it('should handle case-insensitive cf-visitor header', () => {
      const req = {
        get: vi.fn((header) => {
          if (header === 'x-forwarded-proto') return null;
          if (header === 'CF-Visitor') return '{"scheme":"https"}';
          return null;
        }),
        secure: false
      };

      expect(isHttps(req)).toBe(true);
    });

    it('should prioritize x-forwarded-proto over cf-visitor', () => {
      // x-forwarded-proto=http should return false, even if cf-visitor says https
      const req = {
        get: vi.fn((header) => {
          if (header === 'x-forwarded-proto') return 'http';
          if (header === 'cf-visitor') return '{"scheme":"https"}';
          if (header === 'CF-Visitor') return '{"scheme":"https"}';
          return null;
        }),
        secure: false
      };

      expect(isHttps(req)).toBe(false);
      
      // But if x-forwarded-proto is https, it should return true regardless of cf-visitor
      const req2 = {
        get: vi.fn((header) => {
          if (header === 'x-forwarded-proto') return 'https';
          if (header === 'cf-visitor') return '{"scheme":"http"}';
          if (header === 'CF-Visitor') return '{"scheme":"http"}';
          return null;
        }),
        secure: false
      };
      expect(isHttps(req2)).toBe(true);
    });

    it('should handle errors gracefully', () => {
      const req = {
        get: vi.fn(() => {
          throw new Error('Header access failed');
        }),
        secure: false
      };

      expect(isHttps(req)).toBe(false);
    });
  });
});

