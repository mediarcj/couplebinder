// File: server/__tests__/viewFormatters.test.js
// Description: Unit tests for view formatting utilities
// Purpose: Verify date, currency, and URL formatting helpers work correctly
// Notes: Tests the viewFormatters module used by route handlers

import { describe, it, expect } from 'vitest';
// I am saving this value here so the nearby steps can reuse the same value without rebuilding it each time.
const {
  // I am keeping this line here because the surrounding viewFormatters.test.js workflow expects this value or operation before it continues.
  formatDateForDisplay,
  // I am keeping this line here because the surrounding viewFormatters.test.js workflow expects this value or operation before it continues.
  formatDateOnly,
  // I am keeping this line here because the surrounding viewFormatters.test.js workflow expects this value or operation before it continues.
  formatCurrency,
  // I am keeping this line here because the surrounding viewFormatters.test.js workflow expects this value or operation before it continues.
  sanitizeUrl,
  // I am keeping this line here because the surrounding viewFormatters.test.js workflow expects this value or operation before it continues.
  formatPrice
// I am keeping this line here because the surrounding viewFormatters.test.js workflow expects this value or operation before it continues.
} = require('../ui_contract/presenters/helpers/viewFormatters');

// I am grouping the related test cases here so a beginner can see which behavior this section is checking.
describe('viewFormatters', () => {
  // I am grouping the related test cases here so a beginner can see which behavior this section is checking.
  describe('formatDateForDisplay', () => {
    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    it('formats ISO date string with time', () => {
      // I am saving `date` here so the nearby steps can reuse the same value without rebuilding it each time.
      const date = '2024-12-25T15:45:30Z';
      // I am saving `result` here so the nearby steps can reuse the same value without rebuilding it each time.
      const result = formatDateForDisplay(date);
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(result).toContain('12/25/2024');
      // Time may vary by timezone, so just check it contains time-like content
      expect(result).toMatch(/\d+:\d+/); // Contains time pattern
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(result).not.toBe('Unknown');
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    it('formats timestamp number', () => {
      // Use a known date: Dec 25, 2024 12:00:00 UTC (midday to avoid timezone edge cases)
      const timestamp = 1735128000000; // Dec 25, 2024 12:00:00 UTC
      // I am saving `result` here so the nearby steps can reuse the same value without rebuilding it each time.
      const result = formatDateForDisplay(timestamp);
      // Date may vary by timezone, so just verify it formats correctly
      expect(result).toMatch(/\d+\/\d+\/\d{4}/); // Contains date pattern (MM/DD/YYYY)
      expect(result).toMatch(/\d+:\d+/); // Contains time pattern
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(result).not.toBe('Unknown');
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    it('returns Unknown for invalid input', () => {
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(formatDateForDisplay(null)).toBe('Unknown');
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(formatDateForDisplay(undefined)).toBe('Unknown');
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(formatDateForDisplay('invalid')).toBe('Unknown');
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(formatDateForDisplay('')).toBe('Unknown');
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    it('formats Date object', () => {
      // I am saving `date` here so the nearby steps can reuse the same value without rebuilding it each time.
      const date = new Date('2024-12-25T15:45:30Z');
      // I am saving `result` here so the nearby steps can reuse the same value without rebuilding it each time.
      const result = formatDateForDisplay(date);
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(result).toContain('12/25/2024');
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(result).not.toBe('Unknown');
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });

  // I am grouping the related test cases here so a beginner can see which behavior this section is checking.
  describe('formatDateOnly', () => {
    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    it('formats date without time', () => {
      // I am saving `date` here so the nearby steps can reuse the same value without rebuilding it each time.
      const date = '2024-12-25T15:45:30Z';
      // I am saving `result` here so the nearby steps can reuse the same value without rebuilding it each time.
      const result = formatDateOnly(date);
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(result).toContain('12/25/2024');
      expect(result).not.toContain('3:45'); // No time
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(result).not.toBe('Unknown');
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    it('returns Unknown for invalid input', () => {
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(formatDateOnly(null)).toBe('Unknown');
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(formatDateOnly('invalid')).toBe('Unknown');
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });

  // I am grouping the related test cases here so a beginner can see which behavior this section is checking.
  describe('formatCurrency', () => {
    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    it('formats USD from minor units', () => {
      // I am saving `result` here so the nearby steps can reuse the same value without rebuilding it each time.
      const result = formatCurrency(9900, 'USD');
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(result).toContain('99');
      // Intl.NumberFormat may format as "$99.00" or "99.00 USD" depending on locale
      expect(result).toMatch(/\$|USD/);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    it('formats zero-decimal currencies correctly', () => {
      // I am saving `result` here so the nearby steps can reuse the same value without rebuilding it each time.
      const result = formatCurrency(100, 'JPY');
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(result).toContain('100');
      // Intl.NumberFormat may format as "¥100" or "100 JPY" depending on locale
      expect(result).toMatch(/¥|JPY/);
      // Should not divide by 100 for JPY (should be 100, not 1.00)
      expect(result).not.toContain('1.00');
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    it('handles null/undefined amount', () => {
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(formatCurrency(null, 'USD')).toBe('—');
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(formatCurrency(undefined, 'USD')).toBe('—');
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    it('handles invalid amount', () => {
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(formatCurrency('invalid', 'USD')).toBe('—');
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(formatCurrency(NaN, 'USD')).toBe('—');
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    it('uses Intl.NumberFormat when available', () => {
      // I am saving `result` here so the nearby steps can reuse the same value without rebuilding it each time.
      const result = formatCurrency(9900, 'USD');
      // Should use proper currency formatting
      expect(result).toMatch(/\$|USD/);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });

  // I am grouping the related test cases here so a beginner can see which behavior this section is checking.
  describe('sanitizeUrl', () => {
    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    it('validates and returns valid HTTPS URLs', () => {
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(sanitizeUrl('https://example.com/receipt')).toBe('https://example.com/receipt');
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(sanitizeUrl('http://example.com/receipt')).toBe('http://example.com/receipt');
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    it('removes quotes and trims whitespace', () => {
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(sanitizeUrl('  "https://example.com"  ')).toBe('https://example.com');
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(sanitizeUrl("'https://example.com'")).toBe('https://example.com');
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    it('rejects invalid URLs', () => {
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(sanitizeUrl('javascript:alert(1)')).toBe('');
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(sanitizeUrl('ftp://example.com')).toBe('');
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(sanitizeUrl('not-a-url')).toBe('');
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(sanitizeUrl('')).toBe('');
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(sanitizeUrl(null)).toBe('');
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(sanitizeUrl(undefined)).toBe('');
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });

  // I am grouping the related test cases here so a beginner can see which behavior this section is checking.
  describe('formatPrice', () => {
    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    it('formats one-time price', () => {
      // I am saving `result` here so the nearby steps can reuse the same value without rebuilding it each time.
      const result = formatPrice(9900, 'usd', null);
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(result).toContain('99.00');
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(result).toContain('USD');
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(result).toContain('one-time');
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    it('formats recurring price with interval', () => {
      // I am saving `result` here so the nearby steps can reuse the same value without rebuilding it each time.
      const result = formatPrice(9900, 'usd', 'month');
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(result).toContain('99.00');
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(result).toContain('USD');
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(result).toContain('/month');
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    it('handles invalid amount', () => {
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(formatPrice('invalid', 'usd', null)).toBe('—');
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(formatPrice(NaN, 'usd', null)).toBe('—');
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
});

