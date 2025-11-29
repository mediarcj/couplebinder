// File: server/__tests__/viewFormatters.test.js
// Description: Unit tests for view formatting utilities
// Purpose: Verify date, currency, and URL formatting helpers work correctly
// Notes: Tests the viewFormatters module used by route handlers

import { describe, it, expect } from 'vitest';
const {
  formatDateForDisplay,
  formatDateOnly,
  formatCurrency,
  sanitizeUrl,
  formatPrice
} = require('../ui_contract/presenters/helpers/viewFormatters');

describe('viewFormatters', () => {
  describe('formatDateForDisplay', () => {
    it('formats ISO date string with time', () => {
      const date = '2024-12-25T15:45:30Z';
      const result = formatDateForDisplay(date);
      expect(result).toContain('12/25/2024');
      // Time may vary by timezone, so just check it contains time-like content
      expect(result).toMatch(/\d+:\d+/); // Contains time pattern
      expect(result).not.toBe('Unknown');
    });

    it('formats timestamp number', () => {
      // Use a known date: Dec 25, 2024 12:00:00 UTC (midday to avoid timezone edge cases)
      const timestamp = 1735128000000; // Dec 25, 2024 12:00:00 UTC
      const result = formatDateForDisplay(timestamp);
      // Date may vary by timezone, so just verify it formats correctly
      expect(result).toMatch(/\d+\/\d+\/\d{4}/); // Contains date pattern (MM/DD/YYYY)
      expect(result).toMatch(/\d+:\d+/); // Contains time pattern
      expect(result).not.toBe('Unknown');
    });

    it('returns Unknown for invalid input', () => {
      expect(formatDateForDisplay(null)).toBe('Unknown');
      expect(formatDateForDisplay(undefined)).toBe('Unknown');
      expect(formatDateForDisplay('invalid')).toBe('Unknown');
      expect(formatDateForDisplay('')).toBe('Unknown');
    });

    it('formats Date object', () => {
      const date = new Date('2024-12-25T15:45:30Z');
      const result = formatDateForDisplay(date);
      expect(result).toContain('12/25/2024');
      expect(result).not.toBe('Unknown');
    });
  });

  describe('formatDateOnly', () => {
    it('formats date without time', () => {
      const date = '2024-12-25T15:45:30Z';
      const result = formatDateOnly(date);
      expect(result).toContain('12/25/2024');
      expect(result).not.toContain('3:45'); // No time
      expect(result).not.toBe('Unknown');
    });

    it('returns Unknown for invalid input', () => {
      expect(formatDateOnly(null)).toBe('Unknown');
      expect(formatDateOnly('invalid')).toBe('Unknown');
    });
  });

  describe('formatCurrency', () => {
    it('formats USD from minor units', () => {
      const result = formatCurrency(9900, 'USD');
      expect(result).toContain('99');
      // Intl.NumberFormat may format as "$99.00" or "99.00 USD" depending on locale
      expect(result).toMatch(/\$|USD/);
    });

    it('formats zero-decimal currencies correctly', () => {
      const result = formatCurrency(100, 'JPY');
      expect(result).toContain('100');
      // Intl.NumberFormat may format as "¥100" or "100 JPY" depending on locale
      expect(result).toMatch(/¥|JPY/);
      // Should not divide by 100 for JPY (should be 100, not 1.00)
      expect(result).not.toContain('1.00');
    });

    it('handles null/undefined amount', () => {
      expect(formatCurrency(null, 'USD')).toBe('—');
      expect(formatCurrency(undefined, 'USD')).toBe('—');
    });

    it('handles invalid amount', () => {
      expect(formatCurrency('invalid', 'USD')).toBe('—');
      expect(formatCurrency(NaN, 'USD')).toBe('—');
    });

    it('uses Intl.NumberFormat when available', () => {
      const result = formatCurrency(9900, 'USD');
      // Should use proper currency formatting
      expect(result).toMatch(/\$|USD/);
    });
  });

  describe('sanitizeUrl', () => {
    it('validates and returns valid HTTPS URLs', () => {
      expect(sanitizeUrl('https://example.com/receipt')).toBe('https://example.com/receipt');
      expect(sanitizeUrl('http://example.com/receipt')).toBe('http://example.com/receipt');
    });

    it('removes quotes and trims whitespace', () => {
      expect(sanitizeUrl('  "https://example.com"  ')).toBe('https://example.com');
      expect(sanitizeUrl("'https://example.com'")).toBe('https://example.com');
    });

    it('rejects invalid URLs', () => {
      expect(sanitizeUrl('javascript:alert(1)')).toBe('');
      expect(sanitizeUrl('ftp://example.com')).toBe('');
      expect(sanitizeUrl('not-a-url')).toBe('');
      expect(sanitizeUrl('')).toBe('');
      expect(sanitizeUrl(null)).toBe('');
      expect(sanitizeUrl(undefined)).toBe('');
    });
  });

  describe('formatPrice', () => {
    it('formats one-time price', () => {
      const result = formatPrice(9900, 'usd', null);
      expect(result).toContain('99.00');
      expect(result).toContain('USD');
      expect(result).toContain('one-time');
    });

    it('formats recurring price with interval', () => {
      const result = formatPrice(9900, 'usd', 'month');
      expect(result).toContain('99.00');
      expect(result).toContain('USD');
      expect(result).toContain('/month');
    });

    it('handles invalid amount', () => {
      expect(formatPrice('invalid', 'usd', null)).toBe('—');
      expect(formatPrice(NaN, 'usd', null)).toBe('—');
    });
  });
});

