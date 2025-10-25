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
   * Start checkout session for specified price ID.
   * 
   * WHY:
   * Users need secure way to initiate payments.
   * 
   * HOW:
   * 1. Generate idempotency key
   * 2. Send authenticated request to payment API
   * 3. Redirect to Stripe Checkout on success
   * 4. Show error notification on failure
   */
  async function startCheckout(priceId) {
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
        body: JSON.stringify({ priceId })
      });
      
      const data = await res.json();
      if (!res.ok || !data?.ok || !data?.url) {
        throw new Error(data?.error || 'Checkout failed');
      }
      
      window.location.assign(data.url);
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
   * Initialize payment button event handlers.
   * 
   * WHY:
   * Need to wire up payment buttons to checkout functionality.
   * 
   * HOW:
   * Add click listeners to payment buttons with appropriate price IDs.
   */
  document.addEventListener('DOMContentLoaded', () => {
    const basic = document.getElementById('buyResumeBasic');
    const expert = document.getElementById('buyResumeExpert');
    
    if (basic) {
      basic.addEventListener('click', () => startCheckout('price_1SLfVF6w7es7IsqN8nVoYAJs'));
    }
    
    if (expert) {
      expert.addEventListener('click', () => startCheckout('price_1SLvKl6w7es7IsqN7QuPGaYe'));
    }
  });
})();
