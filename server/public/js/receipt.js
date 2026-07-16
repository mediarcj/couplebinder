/**
 * Description: Receipt page JavaScript
 * Purpose: Handles print and email receipt functionality
 * Notes: Extracted from inline script in receipt.ejs
 */

/**
 * Initializes the receipt page functionality.
 *
 * Handles print and email receipt button clicks.
 *
 * Sets up event listeners for print and email actions.
 */
(function initReceipt() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initReceipt);
    return;
  }

  // Print button
  const printBtn = document.querySelector('[data-action="print"]');
  if (printBtn) {
    printBtn.addEventListener('click', function() {
      window.print();
    });
  }

  // Email receipt button
  const emailBtn = document.querySelector('[data-action="email"]');
  if (emailBtn) {
    emailBtn.addEventListener('click', async function() {
      if (emailBtn.disabled) return;
      
      emailBtn.disabled = true;
      const sessionId = emailBtn.dataset.sessionId || '';
      
      try {
        const res = await fetch('/api/receipt/email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ session_id: sessionId })
        });
        
        const data = await res.json().catch(() => ({}));
        
        if (!res.ok || !data.ok) {
          throw new Error(data.error || 'Failed to queue email');
        }
        
        if (window.modalManager?.showNotification) {
          window.modalManager.showNotification('Email sent', 'We\'ll email your receipt shortly.');
        }
      } catch (err) {
        if (window.modalManager?.showNotification) {
          window.modalManager.showNotification('Error', 'Could not send email. Please try again.');
        }
      } finally {
        emailBtn.disabled = false;
      }
    });
  }
})();
