/**
 * File: server/public/js/nav-client.js
 * Description: Mobile navigation toggle functionality
 * Purpose: Handle mobile menu open/close behavior
 * Notes: CSP-compliant external script; no inline JS required
 */

/**
 * WHAT:
 * Simple navigation toggle for mobile menu functionality.
 * 
 * WHY:
 * Users on small screens need a way to open/close navigation menu.
 * Accessibility: manages aria-expanded state for screen readers.
 * 
 * HOW:
 * Listen for click on toggle button.
 * Toggle aria-expanded and CSS class for visual state.
 */
(function () {
  const btn = document.querySelector('[data-js="nav-toggle"]');
  const menu = document.getElementById('site-nav-menu');
  
  if (!btn || !menu) return;

  btn.addEventListener('click', function () {
    const expanded = this.getAttribute('aria-expanded') === 'true';
    this.setAttribute('aria-expanded', String(!expanded));
    menu.classList.toggle('is-open', !expanded);
  });
})();

/**
 * WHAT:
 * Clean up login/signup query params after opening modals.
 * 
 * WHY:
 * Login/signup links use ?login=true and ?signup=true for no-JS fallback.
 * After modal opens, clean URL to prevent query param clutter.
 * 
 * HOW:
 * Check for ?login=true or ?signup=true on page load.
 * Open corresponding modal if param present.
 * Remove param from URL after opening.
 */
(function cleanAuthQueryParams() {
  function open(kind) {
    if (window.modalManager && typeof window.modalManager.openModal === 'function') {
      window.modalManager.openModal(kind);
    } else if (typeof window.openModal === 'function') {
      window.openModal(kind);
    }
  }

  function clean(kind) {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get(kind) === 'true') {
        params.delete(kind);
        const query = params.toString();
        if (history && history.replaceState) {
          history.replaceState({}, '', query ? ('/?' + query) : '/');
        }
      }
    } catch (_) {}
  }

  function maybeOpenAndClean() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('login') === 'true') {
      open('login');
      clean('login');
    }
    if (params.get('signup') === 'true') {
      open('signup');
      clean('signup');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', maybeOpenAndClean);
  } else {
    maybeOpenAndClean();
  }
})();
