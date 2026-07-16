// File: server/public/js/pay.js
// Description: Client-side payment handling with CSP-safe checkout
// Purpose: Handle payment button clicks and redirect to Stripe Checkout
// Notes: Follows Building Laws: frontend follows backend instructions, no secrets exposed

(function () {
  // I am keeping `csrf` as a named helper so the surrounding workflow can call this step when it needs it.
  function csrf() {
    // I am saving `m` here so the nearby steps can reuse the same value without rebuilding it each time.
    const m = document.querySelector('meta[name="csrf-token"]');
    // This return sends the completed value or response back to the code that called this function.
    return m ? m.getAttribute('content') : '';
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
  // I am keeping `cryptoRandom` as a named helper so the surrounding workflow can call this step when it needs it.
  function cryptoRandom() {
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

  // I am keeping `startCheckout` as a named asynchronous helper so the surrounding workflow can call this step when it needs it.
  async function startCheckout(sku) {
    // Send only the stable SKU; the server maps it to an allowlisted Stripe price and
    // returns the hosted Checkout URL. The random key protects retry/double-click cases.
    try {
      // I am saving `idem` here so the nearby steps can reuse the same value without rebuilding it each time.
      const idem = cryptoRandom();
      // I am saving `res` here so the nearby steps can reuse the same value without rebuilding it each time.
      const res = await fetch('/api/pay/checkout', {
        // I am keeping the `method` field in this object so the receiving code can read that value by its expected name.
        method: 'POST',
        // I am keeping the `credentials` field in this object so the receiving code can read that value by its expected name.
        credentials: 'include',
        // I am keeping the `headers` field in this object so the receiving code can read that value by its expected name.
        headers: {
          // I am listing this entry here because the surrounding collection processes each allowed value in order.
          'Content-Type': 'application/json',
          // I am keeping this line here because the surrounding pay.js workflow expects this value or operation before it continues.
          'X-CSRF-Token': csrf(),
          // I am keeping this line here because the surrounding pay.js workflow expects this value or operation before it continues.
          'Idempotency-Key': idem
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        },
        // I am keeping the `body` field in this object so the receiving code can read that value by its expected name.
        body: JSON.stringify({ sku })
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      });
      // I am saving `raw` here so the nearby steps can reuse the same value without rebuilding it each time.
      const raw = await res.text();
      // I am saving `data` here so the nearby steps can reuse the same value without rebuilding it each time.
      let data = {};
      // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
      try { data = JSON.parse(raw); } catch {}
      // I am calling this helper here so the current workflow performs this step before it moves on.
      console.log('checkout status', res.status, 'body', raw);
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (!res.ok || !data?.url) throw new Error(data?.error || 'Unable to start checkout');
      // I am keeping this line here because the surrounding pay.js workflow expects this value or operation before it continues.
      window.location = data.url;
    // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
    } catch (e) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      console.error('Checkout error', e);
      // I am keeping this line here because the surrounding pay.js workflow expects this value or operation before it continues.
      window.modalManager?.showNotification('Payment error', 'Unable to start checkout. Please try again.');
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (window.location.pathname.startsWith('/dashboard/billing')) {
    // I am connecting this event listener here so the browser can run the nearby handler when that user or page event occurs.
    document.addEventListener('click', function (ev) {
      // I am saving `el` here so the nearby steps can reuse the same value without rebuilding it each time.
      const el = ev.target.closest('[data-action="checkout"], .js-checkout, #buyResumeBasic, #buyResumeExpert');
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (!el) return;

      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (el.tagName === 'A' && el.href && el.href.includes('/dashboard/checkout/review')) return;

      // I am calling this helper here so the current workflow performs this step before it moves on.
      ev.preventDefault();
      // I am calling this helper here so the current workflow performs this step before it moves on.
      ev.stopPropagation();

      // I am saving `productKey` here so the nearby steps can reuse the same value without rebuilding it each time.
      let productKey = null;
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (el.id === 'buyResumeBasic') productKey = 'resume_one_time';
      // I am checking this next possibility only because the earlier condition did not choose its path.
      else if (el.id === 'buyResumeExpert') productKey = 'resume_expert';
      // This alternative runs only when the condition above did not use its first path.
      else productKey = el.dataset.product || el.dataset.sku || el.dataset.priceKey;

      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (productKey) {
        // I am saving `qty` here so the nearby steps can reuse the same value without rebuilding it each time.
        const qty = parseInt(el.dataset.quantity || '1', 10);
        // I am calling this helper here so the current workflow performs this step before it moves on.
        window.location.assign(`/dashboard/checkout/review?product=${encodeURIComponent(productKey)}&qty=${qty}`);
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // I am keeping this line here because the surrounding pay.js workflow expects this value or operation before it continues.
    }, { capture: true });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // expose for other pages if needed
  window.startCheckout = startCheckout;
// This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
})();