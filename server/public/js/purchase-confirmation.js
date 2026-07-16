/**
 * File: server/public/js/purchase-confirmation.js
 * Description: Purchase confirmation page JavaScript
 * Purpose: Handles receipt fetching, amount/date formatting, and copy button
 * Notes: Extracted from inline script in purchase-confirmation.ejs
 */

/**
 * WHAT:
 * Sanitizes a URL string for safe use in href attributes.
 *
 * WHY:
 * Prevents XSS and ensures URLs are valid before rendering.
 *
 * HOW:
 * Trims whitespace, removes quotes, and validates HTTP/HTTPS protocol.
 */
function sanitizeUrl(u) {
  // The confirmation page opens a Stripe-provided destination in a new tab. Restricting it
  // to HTTP(S) avoids turning receipt data into an executable browser URL.
  if (!u) return '';
  // I am saving `t` here so the nearby steps can reuse the same value without rebuilding it each time.
  const t = String(u).trim().replace(/^["']+|["']+$/g, '');
  // This return sends the completed value or response back to the code that called this function.
  return /^https?:\/\//i.test(t) ? t : '';
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * WHAT:
 * Opens a URL in a new tab with proper security attributes.
 *
 * WHY:
 * Provides consistent URL opening behavior with fallback.
 *
 * HOW:
 * Attempts window.open, falls back to location.href if that fails.
 */
function openUrl(url, officialBtn) {
  // I am saving `href` here so the nearby steps can reuse the same value without rebuilding it each time.
  const href = sanitizeUrl(url);
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!href) return;
  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // I am keeping this line here because the surrounding purchase-confirmation.js workflow expects this value or operation before it continues.
    officialBtn?.setAttribute('href', href);
    // I am keeping this line here because the surrounding purchase-confirmation.js workflow expects this value or operation before it continues.
    officialBtn?.removeAttribute('aria-disabled');
    // I am calling this helper here so the current workflow performs this step before it moves on.
    window.open(href, '_blank', 'noopener,noreferrer');
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch {
    // I am keeping this line here because the surrounding purchase-confirmation.js workflow expects this value or operation before it continues.
    location.href = href;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * WHAT:
 * Initializes the purchase confirmation page functionality.
 *
 * WHY:
 * Handles receipt fetching, button states, and user interactions.
 *
 * HOW:
 * Reads data attributes from the page, sets up event listeners,
 * and formats display values.
 */
(function initPurchaseConfirmation() {
  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    // I am connecting this event listener here so the browser can run the nearby handler when that user or page event occurs.
    document.addEventListener('DOMContentLoaded', initPurchaseConfirmation);
    // This return sends the completed value or response back to the code that called this function.
    return;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am saving `officialBtn` here so the nearby steps can reuse the same value without rebuilding it each time.
  const officialBtn = document.getElementById('open-official');
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!officialBtn) return;

  // Read data from meta tags and data attributes
  const apiPayBase = document.getElementById('api-pay-base')?.dataset.base || '/api/pay';
  // I am saving `payBase` here so the nearby steps can reuse the same value without rebuilding it each time.
  const payBase = String(apiPayBase || '/api/pay').replace(/\/+$/, '') || '/api/pay';
  
  // I am saving `sessionId` here so the nearby steps can reuse the same value without rebuilding it each time.
  const sessionId = officialBtn.dataset.sessionId || '';
  // I am saving `preReceiptUrl` here so the nearby steps can reuse the same value without rebuilding it each time.
  const preReceiptUrl = officialBtn.dataset.receiptUrl || '';

  // Set initial button state
  const hrefPre = sanitizeUrl(preReceiptUrl);
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (hrefPre) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    officialBtn.setAttribute('href', hrefPre);
    // I am calling this helper here so the current workflow performs this step before it moves on.
    officialBtn.removeAttribute('aria-disabled');
  // This alternative runs only when the condition above did not use its first path.
  } else {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    officialBtn.setAttribute('aria-disabled', 'true');
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // Fetch receipt URL if not pre-provided
  if (!preReceiptUrl && sessionId) {
    // I am starting the browser request here so the surrounding workflow can handle the server response that comes back.
    fetch(`${payBase}/receipt?session_id=${encodeURIComponent(sessionId)}`, {
      // I am keeping the `credentials` field in this object so the receiving code can read that value by its expected name.
      credentials: 'same-origin',
      // I am keeping the `headers` field in this object so the receiving code can read that value by its expected name.
      headers: { 'Accept': 'application/json' }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    })
      // I am defining this small callback here so the surrounding API can run it with the value it supplies.
      .then(res => {
        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (res.ok) {
          // This return sends the completed value or response back to the code that called this function.
          return res.json().catch(() => ({}));
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }
        // This return sends the completed value or response back to the code that called this function.
        return null;
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      })
      // I am defining this small callback here so the surrounding API can run it with the value it supplies.
      .then(data => {
        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (data?.receipt_url) {
          // I am saving `href0` here so the nearby steps can reuse the same value without rebuilding it each time.
          const href0 = sanitizeUrl(data.receipt_url);
          // This check helps me choose or stop the next path before any work that depends on this condition runs.
          if (href0) {
            // I am calling this helper here so the current workflow performs this step before it moves on.
            officialBtn.setAttribute('href', href0);
            // I am calling this helper here so the current workflow performs this step before it moves on.
            officialBtn.removeAttribute('aria-disabled');
          // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
          }
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      })
      // I am defining this small callback here so the surrounding API can run it with the value it supplies.
      .catch(() => {
        // Silently fail - button will remain disabled
      });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // Handle receipt button click
  officialBtn.addEventListener('click', async function(e) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    e.preventDefault();
    
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (officialBtn.getAttribute('aria-disabled') === 'true' && 
        // I am keeping this line here because the surrounding purchase-confirmation.js workflow expects this value or operation before it continues.
        (!officialBtn.getAttribute('href') || officialBtn.getAttribute('href') === '#')) {
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (window.modalManager?.showNotification) {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        window.modalManager.showNotification('Receipt not ready', 'We\'re still fetching your receipt. Please try again in a moment.');
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
      // This return sends the completed value or response back to the code that called this function.
      return;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!sessionId) {
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (window.modalManager?.showNotification) {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        window.modalManager.showNotification('Missing info', 'We couldn\'t find your session ID to fetch the receipt.');
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
      // This return sends the completed value or response back to the code that called this function.
      return;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    
    // I am keeping this line here because the surrounding purchase-confirmation.js workflow expects this value or operation before it continues.
    officialBtn.disabled = true;
    // I am calling this helper here so the current workflow performs this step before it moves on.
    officialBtn.setAttribute('aria-busy', 'true');
    
    // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
    try {
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (preReceiptUrl) {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        openUrl(preReceiptUrl, officialBtn);
        // This return sends the completed value or response back to the code that called this function.
        return;
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
      
      // I am saving `res` here so the nearby steps can reuse the same value without rebuilding it each time.
      const res = await fetch(`${payBase}/receipt?session_id=${encodeURIComponent(sessionId)}`, {
        // I am keeping the `credentials` field in this object so the receiving code can read that value by its expected name.
        credentials: 'same-origin',
        // I am keeping the `headers` field in this object so the receiving code can read that value by its expected name.
        headers: { 'Accept': 'application/json' }
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      });
      
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (res.status === 204) throw new Error('no-receipt-yet');
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (!res.ok) throw new Error('failed');
      
      // I am saving `data` here so the nearby steps can reuse the same value without rebuilding it each time.
      const data = await res.json().catch(() => ({}));
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (!data || !data.receipt_url) throw new Error('no-receipt');
      
      // I am calling this helper here so the current workflow performs this step before it moves on.
      openUrl(data.receipt_url, officialBtn);
    // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
    } catch {
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (window.modalManager?.showNotification) {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        window.modalManager.showNotification('Receipt unavailable', 'Could not open the official receipt right now. Please try again later.');
      // This alternative runs only when the condition above did not use its first path.
      } else {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        alert('Could not open the official receipt right now. Please try again later.');
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // This final block runs after success or failure so the shared cleanup still happens in either outcome.
    } finally {
      // I am keeping this line here because the surrounding purchase-confirmation.js workflow expects this value or operation before it continues.
      officialBtn.disabled = false;
      // I am calling this helper here so the current workflow performs this step before it moves on.
      officialBtn.removeAttribute('aria-busy');
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (officialBtn.getAttribute('href') && officialBtn.getAttribute('href') !== '#') {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        officialBtn.removeAttribute('aria-disabled');
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });

  // Copy confirmation ID button
  const btnCopy = document.getElementById('copy-id');
  // I am saving `confId` here so the nearby steps can reuse the same value without rebuilding it each time.
  const confId = document.getElementById('conf-id')?.textContent || '';
  
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (btnCopy && confId) {
    // I am connecting this event listener here so the browser can run the nearby handler when that user or page event occurs.
    btnCopy.addEventListener('click', async () => {
      // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
      try {
        // I am waiting for this asynchronous step here so the next line does not use its result before it is ready.
        await navigator.clipboard.writeText(confId);
        // I am keeping this line here because the surrounding purchase-confirmation.js workflow expects this value or operation before it continues.
        btnCopy.textContent = 'Copied';
        // I am updating or clearing this saved state here so the interface reflects the result of the action above.
        setTimeout(() => {
          // I am keeping this line here because the surrounding purchase-confirmation.js workflow expects this value or operation before it continues.
          btnCopy.textContent = 'Copy';
        // I am keeping this line here because the surrounding purchase-confirmation.js workflow expects this value or operation before it continues.
        }, 1200);
      // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
      } catch {
        // Fallback for older browsers
        const textarea = document.createElement('textarea');
        // I am keeping this line here because the surrounding purchase-confirmation.js workflow expects this value or operation before it continues.
        textarea.value = confId;
        // I am calling this helper here so the current workflow performs this step before it moves on.
        document.body.appendChild(textarea);
        // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
        textarea.select();
        // I am calling this helper here so the current workflow performs this step before it moves on.
        document.execCommand('copy');
        // I am calling this helper here so the current workflow performs this step before it moves on.
        document.body.removeChild(textarea);
        // I am keeping this line here because the surrounding purchase-confirmation.js workflow expects this value or operation before it continues.
        btnCopy.textContent = 'Copied';
        // I am updating or clearing this saved state here so the interface reflects the result of the action above.
        setTimeout(() => {
          // I am keeping this line here because the surrounding purchase-confirmation.js workflow expects this value or operation before it continues.
          btnCopy.textContent = 'Copy';
        // I am keeping this line here because the surrounding purchase-confirmation.js workflow expects this value or operation before it continues.
        }, 1200);
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
})();
