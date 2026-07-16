/**
 * Description: Checkout review page JavaScript
 * Purpose: Handles checkout button click and redirects to Stripe Checkout
 * Notes: Extracted from inline script in checkout-review.ejs
 */

/**
 * Gets CSRF token from meta tag.
 *
 * Required for authenticated API requests.
 *
 * Reads from meta[name="csrf-token"] element.
 */
function getCsrfToken() {
  const meta = document.querySelector('meta[name="csrf-token"]');
  return meta ? meta.getAttribute('content') || '' : '';
}

/**
 * Generates a random string for idempotency key.
 *
 * Stripe requires idempotency keys to prevent duplicate charges.
 *
 * Uses crypto.getRandomValues if available, falls back to timestamp + random.
 */
function generateIdempotencyKey() {
  try {
    const arr = new Uint8Array(16);
    crypto.getRandomValues(arr);
    return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return String(Date.now()) + Math.random().toString(36).slice(2);
  }
}

/**
 * Initializes the checkout review page functionality.
 *
 * Handles the "Continue to secure payment" button click.
 *
 * Reads product and quantity from button data attributes,
 * calls checkout API, and redirects to Stripe Checkout URL.
 */
(function initCheckoutReview() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCheckoutReview);
    return;
  }

  const btn = document.getElementById('continueToPay');
  if (!btn) return;

  btn.addEventListener('click', async function() {
    if (btn.disabled) return;
    
    btn.disabled = true;
    const productKey = btn.getAttribute('data-product');
    const qty = parseInt(btn.getAttribute('data-quantity') || '1', 10);
    
    try {
      const res = await fetch('/api/pay/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': getCsrfToken(),
          'Idempotency-Key': generateIdempotencyKey()
        },
        credentials: 'include',
        body: JSON.stringify({ sku: productKey, quantity: qty })
      });
      
      const data = await res.json().catch(() => ({}));
      
      if (!res.ok || !data.url) {
        throw new Error(data.error || 'Checkout failed');
      }
      
      window.location.assign(data.url);
    } catch (err) {
      if (window.modalManager?.showNotification) {
        window.modalManager.showNotification('Error', 'Could not start checkout. Please try again.');
      } else {
        alert('Could not start checkout. Please try again.');
      }
    } finally {
      btn.disabled = false;
    }
  });
})();
