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
  if (!u) return '';
  const t = String(u).trim().replace(/^["']+|["']+$/g, '');
  return /^https?:\/\//i.test(t) ? t : '';
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
  const href = sanitizeUrl(url);
  if (!href) return;
  try {
    officialBtn?.setAttribute('href', href);
    officialBtn?.removeAttribute('aria-disabled');
    window.open(href, '_blank', 'noopener,noreferrer');
  } catch {
    location.href = href;
  }
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
    document.addEventListener('DOMContentLoaded', initPurchaseConfirmation);
    return;
  }

  const officialBtn = document.getElementById('open-official');
  if (!officialBtn) return;

  // Read data from meta tags and data attributes
  const apiPayBase = document.getElementById('api-pay-base')?.dataset.base || '/api/pay';
  const payBase = String(apiPayBase || '/api/pay').replace(/\/+$/, '') || '/api/pay';
  
  const sessionId = officialBtn.dataset.sessionId || '';
  const preReceiptUrl = officialBtn.dataset.receiptUrl || '';

  // Set initial button state
  const hrefPre = sanitizeUrl(preReceiptUrl);
  if (hrefPre) {
    officialBtn.setAttribute('href', hrefPre);
    officialBtn.removeAttribute('aria-disabled');
  } else {
    officialBtn.setAttribute('aria-disabled', 'true');
  }

  // Fetch receipt URL if not pre-provided
  if (!preReceiptUrl && sessionId) {
    fetch(`${payBase}/receipt?session_id=${encodeURIComponent(sessionId)}`, {
      credentials: 'same-origin',
      headers: { 'Accept': 'application/json' }
    })
      .then(res => {
        if (res.ok) {
          return res.json().catch(() => ({}));
        }
        return null;
      })
      .then(data => {
        if (data?.receipt_url) {
          const href0 = sanitizeUrl(data.receipt_url);
          if (href0) {
            officialBtn.setAttribute('href', href0);
            officialBtn.removeAttribute('aria-disabled');
          }
        }
      })
      .catch(() => {
        // Silently fail - button will remain disabled
      });
  }

  // Handle receipt button click
  officialBtn.addEventListener('click', async function(e) {
    e.preventDefault();
    
    if (officialBtn.getAttribute('aria-disabled') === 'true' && 
        (!officialBtn.getAttribute('href') || officialBtn.getAttribute('href') === '#')) {
      if (window.modalManager?.showNotification) {
        window.modalManager.showNotification('Receipt not ready', 'We\'re still fetching your receipt. Please try again in a moment.');
      }
      return;
    }
    
    if (!sessionId) {
      if (window.modalManager?.showNotification) {
        window.modalManager.showNotification('Missing info', 'We couldn\'t find your session ID to fetch the receipt.');
      }
      return;
    }
    
    officialBtn.disabled = true;
    officialBtn.setAttribute('aria-busy', 'true');
    
    try {
      if (preReceiptUrl) {
        openUrl(preReceiptUrl, officialBtn);
        return;
      }
      
      const res = await fetch(`${payBase}/receipt?session_id=${encodeURIComponent(sessionId)}`, {
        credentials: 'same-origin',
        headers: { 'Accept': 'application/json' }
      });
      
      if (res.status === 204) throw new Error('no-receipt-yet');
      if (!res.ok) throw new Error('failed');
      
      const data = await res.json().catch(() => ({}));
      if (!data || !data.receipt_url) throw new Error('no-receipt');
      
      openUrl(data.receipt_url, officialBtn);
    } catch {
      if (window.modalManager?.showNotification) {
        window.modalManager.showNotification('Receipt unavailable', 'Could not open the official receipt right now. Please try again later.');
      } else {
        alert('Could not open the official receipt right now. Please try again later.');
      }
    } finally {
      officialBtn.disabled = false;
      officialBtn.removeAttribute('aria-busy');
      if (officialBtn.getAttribute('href') && officialBtn.getAttribute('href') !== '#') {
        officialBtn.removeAttribute('aria-disabled');
      }
    }
  });

  // Copy confirmation ID button
  const btnCopy = document.getElementById('copy-id');
  const confId = document.getElementById('conf-id')?.textContent || '';
  
  if (btnCopy && confId) {
    btnCopy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(confId);
        btnCopy.textContent = 'Copied';
        setTimeout(() => {
          btnCopy.textContent = 'Copy';
        }, 1200);
      } catch {
        // Fallback for older browsers
        const textarea = document.createElement('textarea');
        textarea.value = confId;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        btnCopy.textContent = 'Copied';
        setTimeout(() => {
          btnCopy.textContent = 'Copy';
        }, 1200);
      }
    });
  }
})();

