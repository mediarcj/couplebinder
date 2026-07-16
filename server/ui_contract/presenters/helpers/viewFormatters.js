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
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!dateInput) return 'Unknown';
  
  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // I am saving `date` here so the nearby steps can reuse the same value without rebuilding it each time.
    const date = typeof dateInput === 'string' || typeof dateInput === 'number'
      // I am keeping this line here because the surrounding viewFormatters.js workflow expects this value or operation before it continues.
      ? new Date(dateInput)
      // I am keeping this line here because the surrounding viewFormatters.js workflow expects this value or operation before it continues.
      : dateInput;
    
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!(date instanceof Date) || isNaN(date.getTime())) {
      // This return sends the completed value or response back to the code that called this function.
      return 'Unknown';
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    
    // This return sends the completed value or response back to the code that called this function.
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString('en-US', {
      // I am keeping the `hour` field in this object so the receiving code can read that value by its expected name.
      hour: 'numeric',
      // I am keeping the `minute` field in this object so the receiving code can read that value by its expected name.
      minute: '2-digit',
      // I am keeping the `hour12` field in this object so the receiving code can read that value by its expected name.
      hour12: true
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (error) {
    // This return sends the completed value or response back to the code that called this function.
    return 'Unknown';
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
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
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!dateInput) return 'Unknown';
  
  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // I am saving `date` here so the nearby steps can reuse the same value without rebuilding it each time.
    const date = typeof dateInput === 'string' || typeof dateInput === 'number'
      // I am keeping this line here because the surrounding viewFormatters.js workflow expects this value or operation before it continues.
      ? new Date(dateInput)
      // I am keeping this line here because the surrounding viewFormatters.js workflow expects this value or operation before it continues.
      : dateInput;
    
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!(date instanceof Date) || isNaN(date.getTime())) {
      // This return sends the completed value or response back to the code that called this function.
      return 'Unknown';
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    
    // This return sends the completed value or response back to the code that called this function.
    return date.toLocaleDateString();
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (error) {
    // This return sends the completed value or response back to the code that called this function.
    return 'Unknown';
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
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
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (amountMinor == null || !Number.isFinite(Number(amountMinor))) {
    // This return sends the completed value or response back to the code that called this function.
    return '—';
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
  
  // I am saving `currencyUpper` here so the nearby steps can reuse the same value without rebuilding it each time.
  const currencyUpper = String(currency || 'USD').toUpperCase();
  // I am saving `zeroDecimal` here so the nearby steps can reuse the same value without rebuilding it each time.
  const zeroDecimal = new Set(['BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'MGA', 'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF']);
  
  // I am saving `nMinor` here so the nearby steps can reuse the same value without rebuilding it each time.
  const nMinor = Number(amountMinor);
  // I am saving `major` here so the nearby steps can reuse the same value without rebuilding it each time.
  const major = zeroDecimal.has(currencyUpper) ? nMinor : (nMinor / 100);
  
  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // This return sends the completed value or response back to the code that called this function.
    return new Intl.NumberFormat(undefined, {
      // I am keeping the `style` field in this object so the receiving code can read that value by its expected name.
      style: 'currency',
      // I am keeping the `currency` field in this object so the receiving code can read that value by its expected name.
      currency: currencyUpper
    // I am keeping this line here because the surrounding viewFormatters.js workflow expects this value or operation before it continues.
    }).format(major);
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (error) {
    // Fallback if Intl.NumberFormat fails
    return (zeroDecimal.has(currencyUpper) ? nMinor : major.toFixed(2)) + ' ' + currencyUpper;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
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
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!urlInput) return '';
  
  // I am saving `trimmed` here so the nearby steps can reuse the same value without rebuilding it each time.
  const trimmed = String(urlInput).trim().replace(/^["']+|["']+$/g, '');
  
  // Only allow http:// or https:// URLs
  if (!/^https?:\/\//i.test(trimmed)) {
    // This return sends the completed value or response back to the code that called this function.
    return '';
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
  
  // This return sends the completed value or response back to the code that called this function.
  return trimmed;
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
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
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!Number.isFinite(unitAmount)) return '—';
  
  // I am saving `formatted` here so the nearby steps can reuse the same value without rebuilding it each time.
  const formatted = (unitAmount / 100).toFixed(2);
  // I am saving `currencyUpper` here so the nearby steps can reuse the same value without rebuilding it each time.
  const currencyUpper = String(currency || 'usd').toUpperCase();
  // I am saving `intervalPart` here so the nearby steps can reuse the same value without rebuilding it each time.
  const intervalPart = interval ? `/${interval}` : ' one-time';
  
  // This return sends the completed value or response back to the code that called this function.
  return `$${formatted} ${currencyUpper}${intervalPart}`;
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am exporting this value here so another module can deliberately reuse the completed piece from viewFormatters.js.
module.exports = {
  // I am keeping this line here because the surrounding viewFormatters.js workflow expects this value or operation before it continues.
  formatDateForDisplay,
  // I am keeping this line here because the surrounding viewFormatters.js workflow expects this value or operation before it continues.
  formatDateOnly,
  // I am keeping this line here because the surrounding viewFormatters.js workflow expects this value or operation before it continues.
  formatCurrency,
  // I am keeping this line here because the surrounding viewFormatters.js workflow expects this value or operation before it continues.
  sanitizeUrl,
  // I am keeping this line here because the surrounding viewFormatters.js workflow expects this value or operation before it continues.
  formatPrice
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
};

