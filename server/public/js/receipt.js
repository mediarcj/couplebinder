/**
 * File: server/public/js/receipt.js
 * Description: Receipt page JavaScript
 * Purpose: Handles print and email receipt functionality
 * Notes: Extracted from inline script in receipt.ejs
 */

/**
 * WHAT:
 * Initializes the receipt page functionality.
 *
 * WHY:
 * Handles print and email receipt button clicks.
 *
 * HOW:
 * Sets up event listeners for print and email actions.
 */
(function initReceipt() {
  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    // I am connecting this event listener here so the browser can run the nearby handler when that user or page event occurs.
    document.addEventListener('DOMContentLoaded', initReceipt);
    // This return sends the completed value or response back to the code that called this function.
    return;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // Print button
  const printBtn = document.querySelector('[data-action="print"]');
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (printBtn) {
    // I am connecting this event listener here so the browser can run the nearby handler when that user or page event occurs.
    printBtn.addEventListener('click', function() {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      window.print();
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // Email receipt button
  const emailBtn = document.querySelector('[data-action="email"]');
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (emailBtn) {
    // I am connecting this event listener here so the browser can run the nearby handler when that user or page event occurs.
    emailBtn.addEventListener('click', async function() {
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (emailBtn.disabled) return;
      
      // I am keeping this line here because the surrounding receipt.js workflow expects this value or operation before it continues.
      emailBtn.disabled = true;
      // I am saving `sessionId` here so the nearby steps can reuse the same value without rebuilding it each time.
      const sessionId = emailBtn.dataset.sessionId || '';
      
      // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
      try {
        // I am saving `res` here so the nearby steps can reuse the same value without rebuilding it each time.
        const res = await fetch('/api/receipt/email', {
          // I am keeping the `method` field in this object so the receiving code can read that value by its expected name.
          method: 'POST',
          // I am keeping the `headers` field in this object so the receiving code can read that value by its expected name.
          headers: { 'Content-Type': 'application/json' },
          // I am keeping the `credentials` field in this object so the receiving code can read that value by its expected name.
          credentials: 'include',
          // I am keeping the `body` field in this object so the receiving code can read that value by its expected name.
          body: JSON.stringify({ session_id: sessionId })
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        });
        
        // I am saving `data` here so the nearby steps can reuse the same value without rebuilding it each time.
        const data = await res.json().catch(() => ({}));
        
        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (!res.ok || !data.ok) {
          // I am stopping this path with the existing error here because the caller should not continue with an invalid result.
          throw new Error(data.error || 'Failed to queue email');
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }
        
        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (window.modalManager?.showNotification) {
          // I am calling this helper here so the current workflow performs this step before it moves on.
          window.modalManager.showNotification('Email sent', 'We\'ll email your receipt shortly.');
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }
      // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
      } catch (err) {
        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (window.modalManager?.showNotification) {
          // I am calling this helper here so the current workflow performs this step before it moves on.
          window.modalManager.showNotification('Error', 'Could not send email. Please try again.');
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }
      // This final block runs after success or failure so the shared cleanup still happens in either outcome.
      } finally {
        // I am keeping this line here because the surrounding receipt.js workflow expects this value or operation before it continues.
        emailBtn.disabled = false;
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
})();

