// Description: Client-side payment handling with CSP-safe checkout
// Purpose: Handle payment button clicks and redirect to Stripe Checkout
// Notes: Follows Building Laws: frontend follows backend instructions, no secrets exposed

(function () {
  function csrf() {
    const m = document.querySelector('meta[name="csrf-token"]');
    return m ? m.getAttribute('content') : '';
  }
  function cryptoRandom() {
    try {
      const arr = new Uint8Array(16);
      crypto.getRandomValues(arr);
      return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
    } catch {
      return String(Date.now()) + Math.random().toString(36).slice(2);
    }
  }

  async function startCheckout(sku) {
    // Send only the stable SKU; the server maps it to an allowlisted Stripe price and
    // returns the hosted Checkout URL. The random key protects retry/double-click cases.
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
      try { data = JSON.parse(raw); } catch {}
      console.log('checkout status', res.status, 'body', raw);
      if (!res.ok || !data?.url) throw new Error(data?.error || 'Unable to start checkout');
      window.location = data.url;
    } catch (e) {
      console.error('Checkout error', e);
      window.modalManager?.showNotification('Payment error', 'Unable to start checkout. Please try again.');
    }
  }

  if (window.location.pathname.startsWith('/dashboard/billing')) {
    document.addEventListener('click', function (ev) {
      const el = ev.target.closest('[data-action="checkout"], .js-checkout, #buyResumeBasic, #buyResumeExpert');
      if (!el) return;

      if (el.tagName === 'A' && el.href && el.href.includes('/dashboard/checkout/review')) return;

      ev.preventDefault();
      ev.stopPropagation();

      let productKey = null;
      if (el.id === 'buyResumeBasic') productKey = 'resume_one_time';
      else if (el.id === 'buyResumeExpert') productKey = 'resume_expert';
      else productKey = el.dataset.product || el.dataset.sku || el.dataset.priceKey;

      if (productKey) {
        const qty = parseInt(el.dataset.quantity || '1', 10);
        window.location.assign(`/dashboard/checkout/review?product=${encodeURIComponent(productKey)}&qty=${qty}`);
      }
    }, { capture: true });
  }

  // expose for other pages if needed
  window.startCheckout = startCheckout;
})();