/**
 * File: server/public/js/modalManager.js
 * Description: Centralized modal management for all pages
 * Purpose: Single source of truth for modal behavior, security, and state
 * Notes: CSP-compliant (no inline styles), CSRF-aware, consistent UX
 */

/**
 * WHAT:
 * Centralized modal controller for login, signup, and notifications.
 * 
 * WHY:
 * Security: One place to enforce CSRF, input validation, CSP compliance.
 * Consistency: Same UX and error handling across all pages.
 * Maintenance: Fix once, applies everywhere.
 * 
 * HOW:
 * Provides simple API (modalManager.showLogin(), etc.) that handles all state.
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
  resetModalState(modalId) {
    if (modalId === 'loginModal') {
      this.resetLoginModal();
    } else if (modalId === 'signupModal') {
      this.resetSignupModal();
    }
  },
  
  // ============================================================
  // Login Modal
  // ============================================================
  
  showLogin() {
    this.show('loginModal');
  },
  
  closeLogin() {
    this.close('loginModal');
  },
  
  resetLoginModal() {
    const formState = document.getElementById('loginFormState');
    const successState = document.getElementById('loginSuccessState');
    
    if (formState) formState.classList.remove('hidden');
    if (successState) successState.classList.add('hidden');
    
    this.clearLoginForm();
  },
  
  clearLoginForm() {
    const form = document.getElementById('loginForm');
    if (form) form.reset();
    
    const errors = ['emailError', 'passwordError', 'loginGeneralError'];
    errors.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.textContent = '';
        el.classList.add('hidden');
      }
    });
  },
  
  showLoginError(message) {
    const errorEl = document.getElementById('loginGeneralError');
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.classList.remove('hidden');
    }
  },
  
  switchToLoginSuccess(title, message, onComplete = null) {
    const formState = document.getElementById('loginFormState');
    const successState = document.getElementById('loginSuccessState');
    const successTitle = document.getElementById('successTitle');
    const successMessage = document.getElementById('successMessage');
    const successOkBtn = document.getElementById('successOkBtn');
    
    if (successTitle) successTitle.textContent = title;
    if (successMessage) successMessage.textContent = message;
    
    if (successOkBtn) {
      successOkBtn.onclick = () => {
        if (onComplete) onComplete();
      };
    }
    
    if (formState && successState) {
      formState.classList.add('hidden');
      setTimeout(() => {
        successState.classList.remove('hidden');
        successState.classList.add('showing');
        setTimeout(() => successState.classList.remove('showing'), 10);
      }, 300);
    }
  },
  
  // ============================================================
  // Sign Up Modal
  // ============================================================
  
  showSignup() {
    this.show('signupModal');
  },
  
  closeSignup() {
    this.close('signupModal');
  },
  
  resetSignupModal() {
    const formState = document.getElementById('signupFormState');
    const successState = document.getElementById('signupSuccessState');
    
    if (formState) formState.classList.remove('hidden');
    if (successState) successState.classList.add('hidden');
    
    this.clearSignupForm();
  },
  
  clearSignupForm() {
    const form = document.getElementById('signupForm');
    if (form) form.reset();
    
    const errors = [
      'displayNameError', 'signupEmailError', 'signupPhoneError',
      'signupPasswordError', 'confirmPasswordError', 'signupGeneralError'
    ];
    
    errors.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.textContent = '';
        el.classList.add('hidden');
      }
    });
  },
  
  showSignupError(message) {
    const errorEl = document.getElementById('signupGeneralError');
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.classList.remove('hidden');
    }
  },
  
  showSignupFieldError(fieldId, message) {
    const errorEl = document.getElementById(fieldId);
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.classList.remove('hidden');
    }
  },
  
  switchToSignupSuccess(title, message, onComplete = null) {
    const formState = document.getElementById('signupFormState');
    const successState = document.getElementById('signupSuccessState');
    const successTitle = document.getElementById('signupSuccessTitle');
    const successMessage = document.getElementById('signupSuccessMessage');
    const successOkBtn = document.getElementById('signupSuccessOkBtn');
    
    if (successTitle) successTitle.textContent = title;
    if (successMessage) successMessage.textContent = message;
    
    if (successOkBtn) {
      successOkBtn.onclick = () => {
        if (onComplete) onComplete();
      };
    }
    
    if (formState && successState) {
      formState.classList.add('hidden');
      setTimeout(() => {
        successState.classList.remove('hidden');
        successState.classList.add('showing');
        setTimeout(() => successState.classList.remove('showing'), 10);
      }, 300);
    }
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
 * Expose a global open function for modal management.
 * Provides compatibility for code that calls window.openModal().
 * 
 * WHY:
 * Some scripts may expect window.openModal('login') instead of window.modalManager.showLogin().
 * This provides backward compatibility while using the centralized manager.
 * 
 * HOW:
 * Map generic open calls to the specific modalManager methods.
 */
window.openModal = function (modalId) {
  if (modalId === 'login' || modalId === 'loginModal') {
    modalManager.showLogin();
  } else if (modalId === 'signup' || modalId === 'signupModal') {
    modalManager.showSignup();
  } else {
    // Generic fallback for any other modal ID
    modalManager.show(modalId);
  }
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

  // Open modals from query params (?login=true, ?signup=true)
  function openFromQuery() {
    try {
      const params = new URLSearchParams(window.location.search || '');
      ['login', 'signup'].forEach(function (key) {
        if (params.get(key) === 'true') {
          if (typeof window.openModal === 'function') {
            window.openModal(key);
          }
        }
      });
    } catch (_) {
      // Ignore query param parsing errors
    }
  }

  // Run query param check on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', openFromQuery);
  } else {
    openFromQuery();
  }
})();
