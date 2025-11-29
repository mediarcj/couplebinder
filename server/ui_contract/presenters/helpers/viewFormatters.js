// ============================================================
// File: server/ui_contract/presenters/helpers/viewFormatters.js
// Description: View formatting utilities for EJS templates
// Purpose: Centralizes date, currency, and URL formatting logic
// Notes: All formatting should happen server-side before passing to templates
// ============================================================

/**
 * WHAT:
 * Formats a date string or timestamp for display in templates.
 *
 * WHY:
 * Keeps date formatting logic out of EJS templates and ensures consistency.
 *
 * HOW:
 * Accepts ISO string, timestamp, or Date object and returns formatted string.
 * Returns 'Unknown' if input is invalid.
 */
function formatDateForDisplay(dateInput) {
  if (!dateInput) return 'Unknown';
  
  try {
    const date = typeof dateInput === 'string' || typeof dateInput === 'number'
      ? new Date(dateInput)
      : dateInput;
    
    if (!(date instanceof Date) || isNaN(date.getTime())) {
      return 'Unknown';
    }
    
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  } catch (error) {
    return 'Unknown';
  }
}

/**
 * WHAT:
 * Formats a date for simple display (date only, no time).
 *
 * WHY:
 * Some views only need the date portion.
 *
 * HOW:
 * Returns formatted date string or 'Unknown' if invalid.
 */
function formatDateOnly(dateInput) {
  if (!dateInput) return 'Unknown';
  
  try {
    const date = typeof dateInput === 'string' || typeof dateInput === 'number'
      ? new Date(dateInput)
      : dateInput;
    
    if (!(date instanceof Date) || isNaN(date.getTime())) {
      return 'Unknown';
    }
    
    return date.toLocaleDateString();
  } catch (error) {
    return 'Unknown';
  }
}

/**
 * WHAT:
 * Formats a currency amount from minor units (cents) to display format.
 *
 * WHY:
 * Stripe and other payment systems use minor units (cents), but we display in major units.
 *
 * HOW:
 * Converts minor units to major units and formats with currency symbol.
 * Handles zero-decimal currencies (JPY, etc.) correctly.
 */
function formatCurrency(amountMinor, currency = 'USD') {
  if (amountMinor == null || !Number.isFinite(Number(amountMinor))) {
    return '—';
  }
  
  const currencyUpper = String(currency || 'USD').toUpperCase();
  const zeroDecimal = new Set(['BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'MGA', 'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF']);
  
  const nMinor = Number(amountMinor);
  const major = zeroDecimal.has(currencyUpper) ? nMinor : (nMinor / 100);
  
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currencyUpper
    }).format(major);
  } catch (error) {
    // Fallback if Intl.NumberFormat fails
    return (zeroDecimal.has(currencyUpper) ? nMinor : major.toFixed(2)) + ' ' + currencyUpper;
  }
}

/**
 * WHAT:
 * Sanitizes and validates a URL string for safe use in templates.
 *
 * WHY:
 * Prevents XSS and ensures URLs are valid before rendering in href attributes.
 *
 * HOW:
 * Trims whitespace, removes quotes, and validates HTTP/HTTPS protocol.
 * Returns empty string if invalid.
 */
function sanitizeUrl(urlInput) {
  if (!urlInput) return '';
  
  const trimmed = String(urlInput).trim().replace(/^["']+|["']+$/g, '');
  
  // Only allow http:// or https:// URLs
  if (!/^https?:\/\//i.test(trimmed)) {
    return '';
  }
  
  return trimmed;
}

/**
 * WHAT:
 * Formats a price for display with currency and interval (if recurring).
 *
 * WHY:
 * Stripe prices need consistent formatting across billing pages.
 *
 * HOW:
 * Formats amount, adds currency, and appends interval if present.
 */
function formatPrice(unitAmount, currency = 'usd', interval = null) {
  if (!Number.isFinite(unitAmount)) return '—';
  
  const formatted = (unitAmount / 100).toFixed(2);
  const currencyUpper = String(currency || 'usd').toUpperCase();
  const intervalPart = interval ? `/${interval}` : ' one-time';
  
  return `$${formatted} ${currencyUpper}${intervalPart}`;
}

module.exports = {
  formatDateForDisplay,
  formatDateOnly,
  formatCurrency,
  sanitizeUrl,
  formatPrice
};

