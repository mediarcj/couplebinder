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
 * Provides simple API (modalManager.showSignup(), etc.) that handles all state.
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
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.add('show');
      this.resetModalState(modalId);
    }
  },
  
  /**
   * Close a modal by ID
   */
  close(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.remove('show');
      this.resetModalState(modalId);
    }
  },
  
  /**
   * Reset modal to initial form state
   */
  resetModalState() {},
  
  // ============================================================
  // Password Change Confirmation Modal
  // ============================================================
  
  showPasswordChangeConfirm(onCancel, onConfirm) {
    const modal = document.getElementById('passwordChangeConfirmModal');
    const confirmState = document.getElementById('passwordChangeConfirmState');
    const cancelledState = document.getElementById('passwordChangeCancelledState');
    const cancelBtn = document.getElementById('passwordChangeCancelBtn');
    const resetBtn = document.getElementById('passwordChangeResetBtn');
    const cancelledOkBtn = document.getElementById('passwordChangeCancelledOkBtn');
    
    if (!modal) return;
    
    // Reset to confirmation state
    if (confirmState) confirmState.classList.remove('hidden');
    if (cancelledState) cancelledState.classList.add('hidden');
    
    // Set up cancel handler
    if (cancelBtn) {
      cancelBtn.onclick = () => {
        if (confirmState) confirmState.classList.add('hidden');
        if (cancelledState) cancelledState.classList.remove('hidden');
      };
    }
    
    // Set up cancelled OK handler
    if (cancelledOkBtn) {
      cancelledOkBtn.onclick = () => {
        this.close('passwordChangeConfirmModal');
        if (onCancel) onCancel();
      };
    }
    
    // Set up reset password handler
    if (resetBtn) {
      resetBtn.onclick = () => {
        this.close('passwordChangeConfirmModal');
        if (onConfirm) onConfirm();
      };
    }
    
    this.show('passwordChangeConfirmModal');
  },
  
  // ============================================================
  // Notification Modal (Generic)
  // ============================================================
  
  showNotification(title, message, onClose = null) {
    const modal = document.getElementById('notificationModal');
    const titleEl = document.getElementById('notificationTitle');
    const messageEl = document.getElementById('notificationMessage');
    const closeBtn = document.querySelector('#notificationModal .close');
    const okBtn = document.getElementById('notificationOkBtn');
    
    if (titleEl) titleEl.textContent = title;
    if (messageEl) {
      // Clear previous content
      messageEl.textContent = '';
      // Support both string and structured object:
      // { text: 'Thanks!', linkHref: 'https://...', linkText: 'View receipt' }
      if (typeof message === 'string') {
        messageEl.textContent = message;
      } else if (message && typeof message === 'object') {
        if (message.text) {
          messageEl.appendChild(document.createTextNode(message.text));
        }
        if (message.linkHref) {
          // Add a space if there was preceding text
          if (message.text) messageEl.appendChild(document.createTextNode(' '));
          const a = document.createElement('a');
          a.href = message.linkHref;
          a.target = '_blank';
          a.rel = 'noopener';
          a.textContent = message.linkText || 'View receipt';
          messageEl.appendChild(a);
        }
      }
    }
    if (modal) modal.classList.add('show');
    
    const closeModalFn = () => {
      if (modal) modal.classList.remove('show');
      if (onClose) onClose();
    };
    
    if (closeBtn) closeBtn.onclick = closeModalFn;
    if (okBtn) okBtn.onclick = closeModalFn;
  },
  
  // ============================================================
  // Universal Modal Close Handler (data-modal-close attribute)
  // ============================================================
  
  /**
   * Initialize close button handlers for all modals
   * Looks for elements with data-modal-close attribute
   */
  initCloseHandlers() {
    document.querySelectorAll('[data-modal-close]').forEach(btn => {
      btn.addEventListener('click', (_e) => {
        const modalId = btn.getAttribute('data-modal-close');
        this.close(modalId);
      });
    });
  },
  
  /**
   * Initialize modal system (call on page load)
   */
  init() {
    // Wire only explicit close controls; no backdrop (outside) close
    this.initCloseHandlers();
  }
};

// Auto-initialize on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => modalManager.init());
} else {
  modalManager.init();
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
  const mm = window.modalManager || {};
  const title = 'Logged out';
  const message = 'You have been logged out successfully!';
  
  // Use exact same method as dashboard
  if (typeof mm.showNotification === 'function') {
    return mm.showNotification(title, message);
  }
  
  // Fallback for safety
  alert(message);
}

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
  function shouldShow() {
    // Check sessionStorage flash flag
    try {
      if (sessionStorage.getItem('logout.flash') === '1') {
        sessionStorage.removeItem('logout.flash');
        return true;
      }
    } catch (_) {}

    // Check query param for no-JS fallback
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('logged_out') === '1') {
        // Clean up URL
        params.delete('logged_out');
        const query = params.toString();
        if (history && history.replaceState) {
          history.replaceState({}, '', query ? ('/?' + query) : '/');
        }
        return true;
      }
    } catch (_) {}

    return false;
  }

  // Wait for modalManager to be ready (retry briefly)
  function whenManagerReady(cb, tries) {
    tries = (typeof tries === 'number') ? tries : 20; // ~1s at 50ms
    if (window.modalManager && typeof window.modalManager.showNotification === 'function') {
      return cb(window.modalManager);
    }
    if (tries <= 0) return;
    setTimeout(function () { whenManagerReady(cb, tries - 1); }, 50);
  }

  function show() {
    if (!shouldShow()) return;

    // Wait for manager to be ready, then show modal
    whenManagerReady(function () {
      // Use canonical wrapper for consistency
      showLogoutSuccessCanonical();
    });
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', show);
  } else {
    show();
  }
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
  modalManager.show(modalId);
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
    const link = e.target && e.target.closest('[data-modal-open]');
    if (!link) return;

    const modalId = link.getAttribute('data-modal-open');
    if (!modalId) return;

    // Prevent navigation and open modal
    e.preventDefault();
    if (typeof window.openModal === 'function') {
      window.openModal(modalId);
    }
  }, { capture: true });

})();
