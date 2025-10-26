// File: server/public/js/pay.js
// Description: Client-side payment handling with CSP-safe checkout
// Purpose: Handle payment button clicks and redirect to Stripe Checkout
// Notes: Follows Building Laws: frontend follows backend instructions, no secrets exposed

/**
 * WHAT:
 * Client-side payment handling that initiates Stripe checkout sessions.
 * 
 * WHY:
 * Users need secure way to start payments without exposing sensitive data.
 * CSP-safe implementation that works with strict security headers.
 * 
 * HOW:
 * 1. Generate idempotency keys for duplicate prevention
 * 2. Send authenticated requests to payment API
 * 3. Redirect to Stripe Checkout on success
 * 4. Handle errors with user-friendly notifications
 */

(function () {
  /**
   * WHAT:
   * Get CSRF token from meta tag for authenticated requests.
   * 
   * WHY:
   * CSRF protection requires token for state-changing requests.
   * 
   * HOW:
   * Read token from meta tag set by server.
   */
  function csrf() {
    const m = document.querySelector('meta[name="csrf-token"]');
    return m ? m.getAttribute('content') : '';
  }
  
  /**
   * WHAT:
   * Generate cryptographically secure random string for idempotency.
   * 
   * WHY:
   * Idempotency keys prevent duplicate charges from retries.
   * 
   * HOW:
   * Use crypto.getRandomValues() if available, fallback to timestamp.
   */
  function cryptoRandom() {
    try {
      const arr = new Uint8Array(16);
      crypto.getRandomValues(arr);
      return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
    } catch {
      return String(Date.now()) + Math.random().toString(36).slice(2);
    }
  }
  
  /**
   * WHAT:
   * Start checkout session for specified product SKU.
   * 
   * WHY:
   * Users need secure way to initiate payments.
   * 
   * HOW:
   * 1. Generate idempotency key
   * 2. Send authenticated request to payment API with SKU
   * 3. Redirect to Stripe Checkout on success
   * 4. Show error notification on failure
   */
  async function startCheckout(sku) {
    try {
      const idem = cryptoRandom();
      const res = await fetch('/api/pay/checkout', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrf(),
          'Idempotency-Key': idem
        },
        body: JSON.stringify({ sku })
      });
      
      const raw = await res.text();
      let data = {};
      try {
        data = JSON.parse(raw);
      } catch (e) {
        // JSON parse failed, data stays empty object
      }
      
      // Debug logging
      console.log('checkout status', res.status, 'body', raw);
      
      if (!res.ok || !data?.url) {
        throw new Error(data?.error || 'Unable to start checkout');
      }
      
      // Navigate to Stripe Checkout
      window.location = data.url;
    } catch (e) {
      console.error('Checkout error', e);
      window.modalManager?.showNotification(
        'Payment error',
        'Unable to start checkout. Please try again.'
      );
    }
  }
  
  /**
   * WHAT:
   * Guard: Force any legacy JS-driven checkout actions to go to Review page.
   * 
   * WHY:
   * Billing page buttons now link directly to review, but legacy JS handlers
   * might still exist. This ensures all Buy actions go through Review.
   * 
   * HOW:
   * Intercept clicks on legacy checkout elements and redirect to review page.
   */
  if (window.location.pathname.startsWith('/dashboard/billing')) {
    document.addEventListener('click', function (ev) {
      const el = ev.target.closest('[data-action="checkout"], .js-checkout, #buyResumeBasic, #buyResumeExpert');
      if (!el) return;
      
      // If it's already a link to review page, let it work normally
      if (el.tagName === 'A' && el.href && el.href.includes('/dashboard/checkout/review')) {
        return;
      }
      
      // Prevent any legacy checkout handlers
      ev.preventDefault();
      ev.stopPropagation();
      
      // Determine product key from element
      let productKey = null;
      if (el.id === 'buyResumeBasic') {
        productKey = 'resume_one_time';
      } else if (el.id === 'buyResumeExpert') {
        productKey = 'resume_expert';
      } else {
        productKey = el.dataset.product || el.dataset.sku || el.dataset.priceKey;
      }
      
      if (productKey) {
        const qty = parseInt(el.dataset.quantity || '1', 10);
        window.location.assign(`/dashboard/checkout/review?product=${encodeURIComponent(productKey)}&qty=${qty}`);
      }
    }, { capture: true });
  }
})();
