/**
 * File: server/public/js/modalManager.js
 * Description: Centralized modal management for all pages
 * Purpose: Single source of truth for modal behavior, security, and state
 * Notes: CSP-compliant (no inline styles), CSRF-aware, consistent UX
 */

/**
 * WHAT:
 * Centralized modal controller for password change and notifications.
 * 
 * WHY:
 * Security: One place to enforce CSRF, input validation, CSP compliance.
 * Consistency: Same UX and error handling across all pages.
 * Maintenance: Fix once, applies everywhere.
 * 
 * HOW:
 * Provides simple API (modalManager.showPasswordChangeConfirm(), modalManager.showNotification(), etc.) that handles all state.
 * Uses CSS classes (not inline styles) for CSP compliance.
 * Integrates with Supabase auth and backend API endpoints.
 */

const modalManager = {
  // ============================================================
  // Modal State Management (CSP-compliant)
  // ============================================================
  
  /**
   * Show a modal by ID
   */
  show(modalId) {
    // I am saving `modal` here so the nearby steps can reuse the same value without rebuilding it each time.
    const modal = document.getElementById(modalId);
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (modal) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      modal.classList.add('show');
      // I am calling this helper here so the current workflow performs this step before it moves on.
      this.resetModalState(modalId);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  },
  
  /**
   * Close a modal by ID
   */
  close(modalId) {
    // I am saving `modal` here so the nearby steps can reuse the same value without rebuilding it each time.
    const modal = document.getElementById(modalId);
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (modal) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      modal.classList.remove('show');
      // I am calling this helper here so the current workflow performs this step before it moves on.
      this.resetModalState(modalId);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  },
  
  /**
   * Reset modal to initial form state
   */
  resetModalState() {},
  
  // ============================================================
  // Password Change Confirmation Modal
  // ============================================================
  
  showPasswordChangeConfirm(onCancel, onConfirm) {
    // I am saving `modal` here so the nearby steps can reuse the same value without rebuilding it each time.
    const modal = document.getElementById('passwordChangeConfirmModal');
    // I am saving `confirmState` here so the nearby steps can reuse the same value without rebuilding it each time.
    const confirmState = document.getElementById('passwordChangeConfirmState');
    // I am saving `cancelledState` here so the nearby steps can reuse the same value without rebuilding it each time.
    const cancelledState = document.getElementById('passwordChangeCancelledState');
    // I am saving `cancelBtn` here so the nearby steps can reuse the same value without rebuilding it each time.
    const cancelBtn = document.getElementById('passwordChangeCancelBtn');
    // I am saving `resetBtn` here so the nearby steps can reuse the same value without rebuilding it each time.
    const resetBtn = document.getElementById('passwordChangeResetBtn');
    // I am saving `cancelledOkBtn` here so the nearby steps can reuse the same value without rebuilding it each time.
    const cancelledOkBtn = document.getElementById('passwordChangeCancelledOkBtn');
    
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!modal) return;
    
    // Reset to confirmation state
    if (confirmState) confirmState.classList.remove('hidden');
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (cancelledState) cancelledState.classList.add('hidden');
    
    // Set up cancel handler
    if (cancelBtn) {
      // I am defining this small callback here so the surrounding API can run it with the value it supplies.
      cancelBtn.onclick = () => {
        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (confirmState) confirmState.classList.add('hidden');
        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (cancelledState) cancelledState.classList.remove('hidden');
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      };
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    
    // Set up cancelled OK handler
    if (cancelledOkBtn) {
      // I am defining this small callback here so the surrounding API can run it with the value it supplies.
      cancelledOkBtn.onclick = () => {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        this.close('passwordChangeConfirmModal');
        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (onCancel) onCancel();
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      };
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    
    // Set up reset password handler
    if (resetBtn) {
      // I am defining this small callback here so the surrounding API can run it with the value it supplies.
      resetBtn.onclick = () => {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        this.close('passwordChangeConfirmModal');
        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (onConfirm) onConfirm();
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      };
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    
    // I am calling this helper here so the current workflow performs this step before it moves on.
    this.show('passwordChangeConfirmModal');
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  },
  
  // ============================================================
  // Notification Modal (Generic)
  // ============================================================
  
  showNotification(title, message, onClose = null) {
    // I am saving `modal` here so the nearby steps can reuse the same value without rebuilding it each time.
    const modal = document.getElementById('notificationModal');
    // I am saving `titleEl` here so the nearby steps can reuse the same value without rebuilding it each time.
    const titleEl = document.getElementById('notificationTitle');
    // I am saving `messageEl` here so the nearby steps can reuse the same value without rebuilding it each time.
    const messageEl = document.getElementById('notificationMessage');
    // I am saving `closeBtn` here so the nearby steps can reuse the same value without rebuilding it each time.
    const closeBtn = document.querySelector('#notificationModal .close');
    // I am saving `okBtn` here so the nearby steps can reuse the same value without rebuilding it each time.
    const okBtn = document.getElementById('notificationOkBtn');
    
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (titleEl) titleEl.textContent = title;
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (messageEl) {
      // Clear previous content
      messageEl.textContent = '';
      // Support both string and structured object:
      // { text: 'Thanks!', linkHref: 'https://...', linkText: 'View receipt' }
      if (typeof message === 'string') {
        // I am keeping this line here because the surrounding modalManager.js workflow expects this value or operation before it continues.
        messageEl.textContent = message;
      // I am checking this next possibility only because the earlier condition did not choose its path.
      } else if (message && typeof message === 'object') {
        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (message.text) {
          // I am calling this helper here so the current workflow performs this step before it moves on.
          messageEl.appendChild(document.createTextNode(message.text));
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }
        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (message.linkHref) {
          // Add a space if there was preceding text
          if (message.text) messageEl.appendChild(document.createTextNode(' '));
          // I am saving `a` here so the nearby steps can reuse the same value without rebuilding it each time.
          const a = document.createElement('a');
          // I am keeping this line here because the surrounding modalManager.js workflow expects this value or operation before it continues.
          a.href = message.linkHref;
          // I am keeping this line here because the surrounding modalManager.js workflow expects this value or operation before it continues.
          a.target = '_blank';
          // I am keeping this line here because the surrounding modalManager.js workflow expects this value or operation before it continues.
          a.rel = 'noopener';
          // I am keeping this line here because the surrounding modalManager.js workflow expects this value or operation before it continues.
          a.textContent = message.linkText || 'View receipt';
          // I am calling this helper here so the current workflow performs this step before it moves on.
          messageEl.appendChild(a);
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (modal) modal.classList.add('show');
    
    // I am saving `closeModalFn` here so the nearby steps can reuse the same value without rebuilding it each time.
    const closeModalFn = () => {
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (modal) modal.classList.remove('show');
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (onClose) onClose();
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    };
    
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (closeBtn) closeBtn.onclick = closeModalFn;
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (okBtn) okBtn.onclick = closeModalFn;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  },

  // ============================================================
  // Generic Confirm Modal (reuses notificationModal)
  // ============================================================
  /**
   * showConfirm
   *
   * Reuses the notificationModal with a custom confirm label.
   * - Title + message set as usual
   * - OK button becomes the "confirm" action
   * - Close "×" acts as cancel
   */
  showConfirm({ title, message, confirmLabel = 'OK', onConfirm, onCancel } = {}) {
    // I am saving `modal` here so the nearby steps can reuse the same value without rebuilding it each time.
    const modal = document.getElementById('notificationModal');
    // I am saving `titleEl` here so the nearby steps can reuse the same value without rebuilding it each time.
    const titleEl = document.getElementById('notificationTitle');
    // I am saving `messageEl` here so the nearby steps can reuse the same value without rebuilding it each time.
    const messageEl = document.getElementById('notificationMessage');
    // I am saving `closeBtn` here so the nearby steps can reuse the same value without rebuilding it each time.
    const closeBtn = document.querySelector('#notificationModal .close');
    // I am saving `okBtn` here so the nearby steps can reuse the same value without rebuilding it each time.
    const okBtn = document.getElementById('notificationOkBtn');

    // Fallback to native confirm if modal is missing
    if (!modal || !titleEl || !messageEl || !okBtn) {
      // I am saving `promptText` here so the nearby steps can reuse the same value without rebuilding it each time.
      const promptText =
        // I am keeping this line here because the surrounding modalManager.js workflow expects this value or operation before it continues.
        typeof message === 'string'
          // I am keeping this line here because the surrounding modalManager.js workflow expects this value or operation before it continues.
          ? message
          // I am keeping this line here because the surrounding modalManager.js workflow expects this value or operation before it continues.
          : (title || 'Are you sure?');
      // I am saving `confirmed` here so the nearby steps can reuse the same value without rebuilding it each time.
      const confirmed = window.confirm(promptText);
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (confirmed && typeof onConfirm === 'function') onConfirm();
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (!confirmed && typeof onCancel === 'function') onCancel();
      // This return sends the completed value or response back to the code that called this function.
      return;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // Set title
    titleEl.textContent = title || 'Confirm';

    // Set message (string only for confirm)
    messageEl.textContent = '';
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (typeof message === 'string') {
      // I am keeping this line here because the surrounding modalManager.js workflow expects this value or operation before it continues.
      messageEl.textContent = message;
    // I am checking this next possibility only because the earlier condition did not choose its path.
    } else if (message && typeof message === 'object' && message.text) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      messageEl.appendChild(document.createTextNode(message.text));
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // Remember original OK text so we can restore it later
    const originalOkText = okBtn.textContent;
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (confirmLabel) okBtn.textContent = confirmLabel;

    // I am saving `cleanupHandlers` here so the nearby steps can reuse the same value without rebuilding it each time.
    const cleanupHandlers = () => {
      // I am keeping this line here because the surrounding modalManager.js workflow expects this value or operation before it continues.
      okBtn.onclick = null;
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (closeBtn) closeBtn.onclick = null;
      // I am keeping this line here because the surrounding modalManager.js workflow expects this value or operation before it continues.
      okBtn.textContent = originalOkText;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    };

    // I am saving `closeAs` here so the nearby steps can reuse the same value without rebuilding it each time.
    const closeAs = (isCancel) => {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      modal.classList.remove('show');
      // I am calling this helper here so the current workflow performs this step before it moves on.
      cleanupHandlers();
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (isCancel && typeof onCancel === 'function') onCancel();
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    };

    // Cancel via "×"
    if (closeBtn) {
      // I am keeping this line here because the surrounding modalManager.js workflow expects this value or operation before it continues.
      closeBtn.onclick = () => closeAs(true);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // Confirm via main button
    okBtn.onclick = () => {
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (typeof onConfirm === 'function') onConfirm();
      // I am calling this helper here so the current workflow performs this step before it moves on.
      closeAs(false);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    };

    // I am calling this helper here so the current workflow performs this step before it moves on.
    modal.classList.add('show');
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  },  

  // ============================================================
  // Universal Modal Close Handler (data-modal-close attribute)
  // ============================================================
  
  /**
   * Initialize close button handlers for all modals
   * Looks for elements with data-modal-close attribute
   */
  initCloseHandlers() {
    // I am finding the existing page element here so the following browser code can read or update that confirmed DOM target.
    document.querySelectorAll('[data-modal-close]').forEach(btn => {
      // I am connecting this event listener here so the browser can run the nearby handler when that user or page event occurs.
      btn.addEventListener('click', (_e) => {
        // I am saving `modalId` here so the nearby steps can reuse the same value without rebuilding it each time.
        const modalId = btn.getAttribute('data-modal-close');
        // I am calling this helper here so the current workflow performs this step before it moves on.
        this.close(modalId);
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      });
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  },
  
  /**
   * Initialize modal system (call on page load)
   */
  init() {
    // Wire only explicit close controls; no backdrop (outside) close
    this.initCloseHandlers();
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
};

// Auto-initialize on DOM ready
if (document.readyState === 'loading') {
  // I am connecting this event listener here so the browser can run the nearby handler when that user or page event occurs.
  document.addEventListener('DOMContentLoaded', () => modalManager.init());
// This alternative runs only when the condition above did not use its first path.
} else {
  // I am calling this helper here so the current workflow performs this step before it moves on.
  modalManager.init();
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * WHAT:
 * Expose modalManager as a global for use in other scripts.
 * 
 * WHY:
 * Browser scripts don't support CommonJS modules.
 * We need window.modalManager for main.js and other pages to use.
 * 
 * HOW:
 * Attach to window object so it's available globally.
 */
window.modalManager = modalManager;

/**
 * WHAT:
 * Canonical logout-success modal (single source of truth).
 * 
 * WHY:
 * Ensures the exact same modal appears everywhere after logout.
 * Uses the exact same API the dashboard uses.
 * 
 * HOW:
 * Call modalManager.showNotification() which is the dashboard's standard method.
 */
function showLogoutSuccessCanonical() {
  // I am saving `mm` here so the nearby steps can reuse the same value without rebuilding it each time.
  const mm = window.modalManager || {};
  // I am saving `title` here so the nearby steps can reuse the same value without rebuilding it each time.
  const title = 'Logged out';
  // I am saving `message` here so the nearby steps can reuse the same value without rebuilding it each time.
  const message = 'You have been logged out successfully!';
  
  // Use exact same method as dashboard
  if (typeof mm.showNotification === 'function') {
    // This return sends the completed value or response back to the code that called this function.
    return mm.showNotification(title, message);
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
  
  // Fallback for safety
  alert(message);
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping this line here because the surrounding modalManager.js workflow expects this value or operation before it continues.
window.showLogoutSuccessCanonical = showLogoutSuccessCanonical;

/**
 * WHAT:
 * Cross-page logout success flash support with init race protection.
 * Shows logout success modal on next page load after logout.
 * 
 * WHY:
 * When logout redirects to home page, we need to show "You have been logged out successfully!" modal.
 * Uses sessionStorage flash flag to persist across page navigation.
 * Also supports /?logged_out=1 query param for no-JS fallback.
 * Waits for modalManager to be ready to avoid race conditions.
 * 
 * HOW:
 * Wait for modalManager readiness with retry logic.
 * Check for logout.flash in sessionStorage on page load.
 * If present, show success modal using showNotification.
 * Also check for /?logged_out=1 query param and clean up URL.
 */
(function showLogoutFlash() {
  // I am keeping `shouldShow` as a named helper so the surrounding workflow can call this step when it needs it.
  function shouldShow() {
    // Check sessionStorage flash flag
    try {
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (sessionStorage.getItem('logout.flash') === '1') {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        sessionStorage.removeItem('logout.flash');
        // This return sends the completed value or response back to the code that called this function.
        return true;
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
    } catch (_) {}

    // Check query param for no-JS fallback
    try {
      // I am saving `params` here so the nearby steps can reuse the same value without rebuilding it each time.
      const params = new URLSearchParams(window.location.search);
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (params.get('logged_out') === '1') {
        // Clean up URL
        params.delete('logged_out');
        // I am saving `query` here so the nearby steps can reuse the same value without rebuilding it each time.
        const query = params.toString();
        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (history && history.replaceState) {
          // I am calling this helper here so the current workflow performs this step before it moves on.
          history.replaceState({}, '', query ? ('/?' + query) : '/');
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }
        // This return sends the completed value or response back to the code that called this function.
        return true;
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
    } catch (_) {}

    // This return sends the completed value or response back to the code that called this function.
    return false;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // Wait for modalManager to be ready (retry briefly)
  function whenManagerReady(cb, tries) {
    tries = (typeof tries === 'number') ? tries : 20; // ~1s at 50ms
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (window.modalManager && typeof window.modalManager.showNotification === 'function') {
      // This return sends the completed value or response back to the code that called this function.
      return cb(window.modalManager);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (tries <= 0) return;
    // I am defining the `setTimeout` step here so the surrounding object or class can call it with the values listed in its parameters.
    setTimeout(function () { whenManagerReady(cb, tries - 1); }, 50);
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am keeping `show` as a named helper so the surrounding workflow can call this step when it needs it.
  function show() {
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!shouldShow()) return;

    // Wait for manager to be ready, then show modal
    whenManagerReady(function () {
      // Use canonical wrapper for consistency
      showLogoutSuccessCanonical();
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    // I am connecting this event listener here so the browser can run the nearby handler when that user or page event occurs.
    document.addEventListener('DOMContentLoaded', show);
  // This alternative runs only when the condition above did not use its first path.
  } else {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    show();
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
})();

/**
 * WHAT:
 * Expose a global open function for modal management.
 * Provides compatibility for code that calls window.openModal().
 * 
 * WHY:
 * Login is now handled by dedicated /login page (no modal).
 * This provides backward compatibility while using the centralized manager.
 * 
 * HOW:
 * Map generic open calls to the specific modalManager methods.
 */
window.openModal = function (modalId) {
  // I am calling this helper here so the current workflow performs this step before it moves on.
  modalManager.show(modalId);
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
};

/**
 * WHAT:
 * Click interceptor for data-modal-open attributes.
 * Intercepts clicks on nav links that should open modals instead of navigating.
 * 
 * WHY:
 * Prevents navigation to query param URLs when JS is enabled.
 * Provides better UX by opening modals instantly without page reload.
 * Falls back to normal navigation if modal system is unavailable.
 * 
 * HOW:
 * Listen for clicks on elements with data-modal-open attributes.
 * Prevent default navigation and call the modal open function.
 * Also handles query param-based modal opening for no-JS fallback.
 */
(function () {
  // Intercept clicks on nav links with modal targets
  document.addEventListener('click', function (e) {
    // I am saving `link` here so the nearby steps can reuse the same value without rebuilding it each time.
    const link = e.target && e.target.closest('[data-modal-open]');
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!link) return;

    // I am saving `modalId` here so the nearby steps can reuse the same value without rebuilding it each time.
    const modalId = link.getAttribute('data-modal-open');
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!modalId) return;

    // Prevent navigation and open modal
    e.preventDefault();
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (typeof window.openModal === 'function') {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      window.openModal(modalId);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // I am keeping this line here because the surrounding modalManager.js workflow expects this value or operation before it continues.
  }, { capture: true });

// This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
})();
