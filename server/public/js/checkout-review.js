/**
 * File: server/public/js/checkout-review.js
 * Description: Checkout review page JavaScript
 * Purpose: Handles checkout button click and redirects to Stripe Checkout
 * Notes: Extracted from inline script in checkout-review.ejs
 */

/**
 * WHAT:
 * Gets CSRF token from meta tag.
 *
 * WHY:
 * Required for authenticated API requests.
 *
 * HOW:
 * Reads from meta[name="csrf-token"] element.
 */
function getCsrfToken() {
  // I am saving `meta` here so the nearby steps can reuse the same value without rebuilding it each time.
  const meta = document.querySelector('meta[name="csrf-token"]');
  // This return sends the completed value or response back to the code that called this function.
  return meta ? meta.getAttribute('content') || '' : '';
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * WHAT:
 * Generates a random string for idempotency key.
 *
 * WHY:
 * Stripe requires idempotency keys to prevent duplicate charges.
 *
 * HOW:
 * Uses crypto.getRandomValues if available, falls back to timestamp + random.
 */
function generateIdempotencyKey() {
  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // I am saving `arr` here so the nearby steps can reuse the same value without rebuilding it each time.
    const arr = new Uint8Array(16);
    // I am calling this helper here so the current workflow performs this step before it moves on.
    crypto.getRandomValues(arr);
    // This return sends the completed value or response back to the code that called this function.
    return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch {
    // This return sends the completed value or response back to the code that called this function.
    return String(Date.now()) + Math.random().toString(36).slice(2);
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * WHAT:
 * Initializes the checkout review page functionality.
 *
 * WHY:
 * Handles the "Continue to secure payment" button click.
 *
 * HOW:
 * Reads product and quantity from button data attributes,
 * calls checkout API, and redirects to Stripe Checkout URL.
 */
(function initCheckoutReview() {
  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    // I am connecting this event listener here so the browser can run the nearby handler when that user or page event occurs.
    document.addEventListener('DOMContentLoaded', initCheckoutReview);
    // This return sends the completed value or response back to the code that called this function.
    return;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am saving `btn` here so the nearby steps can reuse the same value without rebuilding it each time.
  const btn = document.getElementById('continueToPay');
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!btn) return;

  // I am connecting this event listener here so the browser can run the nearby handler when that user or page event occurs.
  btn.addEventListener('click', async function() {
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (btn.disabled) return;
    
    // I am keeping this line here because the surrounding checkout-review.js workflow expects this value or operation before it continues.
    btn.disabled = true;
    // I am saving `productKey` here so the nearby steps can reuse the same value without rebuilding it each time.
    const productKey = btn.getAttribute('data-product');
    // I am saving `qty` here so the nearby steps can reuse the same value without rebuilding it each time.
    const qty = parseInt(btn.getAttribute('data-quantity') || '1', 10);
    
    // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
    try {
      // I am saving `res` here so the nearby steps can reuse the same value without rebuilding it each time.
      const res = await fetch('/api/pay/checkout', {
        // I am keeping the `method` field in this object so the receiving code can read that value by its expected name.
        method: 'POST',
        // I am keeping the `headers` field in this object so the receiving code can read that value by its expected name.
        headers: {
          // I am listing this entry here because the surrounding collection processes each allowed value in order.
          'Content-Type': 'application/json',
          // I am keeping this line here because the surrounding checkout-review.js workflow expects this value or operation before it continues.
          'X-CSRF-Token': getCsrfToken(),
          // I am keeping this line here because the surrounding checkout-review.js workflow expects this value or operation before it continues.
          'Idempotency-Key': generateIdempotencyKey()
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        },
        // I am keeping the `credentials` field in this object so the receiving code can read that value by its expected name.
        credentials: 'include',
        // I am keeping the `body` field in this object so the receiving code can read that value by its expected name.
        body: JSON.stringify({ sku: productKey, quantity: qty })
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      });
      
      // I am saving `data` here so the nearby steps can reuse the same value without rebuilding it each time.
      const data = await res.json().catch(() => ({}));
      
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (!res.ok || !data.url) {
        // I am stopping this path with the existing error here because the caller should not continue with an invalid result.
        throw new Error(data.error || 'Checkout failed');
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
      
      // I am calling this helper here so the current workflow performs this step before it moves on.
      window.location.assign(data.url);
    // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
    } catch (err) {
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (window.modalManager?.showNotification) {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        window.modalManager.showNotification('Error', 'Could not start checkout. Please try again.');
      // This alternative runs only when the condition above did not use its first path.
      } else {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        alert('Could not start checkout. Please try again.');
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // This final block runs after success or failure so the shared cleanup still happens in either outcome.
    } finally {
      // I am keeping this line here because the surrounding checkout-review.js workflow expects this value or operation before it continues.
      btn.disabled = false;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });
// This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
})();

