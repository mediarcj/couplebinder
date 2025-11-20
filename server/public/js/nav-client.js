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
 * Intercept auth link clicks to prevent URL flash and handle deep-links.
 * 
 * WHY:
 * Prevents /?signup=true from appearing in URL bar.
 * Login now redirects to /login page (no modal).
 * Links still work with JS disabled (they navigate to query params).
 * Deep-links from other pages still open signup modal correctly.
 * 
 * HOW:
 * Intercept clicks on links with signup query params before navigation.
 * Open signup modal immediately and prevent default navigation.
 * Redirect login links to /login page.
 * Also check for query params on page load for deep-link support.
 * Clean params from URL after opening modal or redirecting.
 */
(function interceptAuthLinks() {
  function getAnchor(el) {
    return el && el.closest ? el.closest('a') : null;
  }

  function isSignupQueryHref(href) {
    if (!href) return false;
    try {
      const u = new URL(href, location.origin);
      const p = u.searchParams;
      return p.get('signup') === 'true';
    } catch (_) {
      return false;
    }
  }

  function openSignupModal() {
    if (window.modalManager && typeof window.modalManager.showSignup === 'function') {
      window.modalManager.showSignup();
    } else if (window.modalManager && typeof window.modalManager.open === 'function') {
      window.modalManager.open('signup');
    } else if (window.modalManager && typeof window.modalManager.openModal === 'function') {
      window.modalManager.openModal('signup');
    } else if (typeof window.openModal === 'function') {
      window.openModal('signup');
    }
  }

  // Intercept clicks on signup links before navigation
  document.addEventListener('click', function (e) {
    const a = getAnchor(e.target);
    if (!a) return;

    const href = a.getAttribute('href');
    
    // Handle signup modal
    if (isSignupQueryHref(href)) {
      e.preventDefault();
      openSignupModal();
      
      // Clean params from URL
      try {
        const u = new URL(href, location.origin);
        u.searchParams.delete('signup');
        if (history && history.replaceState) {
          history.replaceState({}, '', u.pathname + (u.search || ''));
        }
      } catch (_) {}
      return;
    }
    
    // Handle login - redirect to /login page
    try {
      const u = new URL(href, location.origin);
      if (u.searchParams.get('login') === 'true') {
        e.preventDefault();
        window.location.href = '/login';
        return;
      }
    } catch (_) {}
  }, true);

  // Back-compat: if user lands on /?login=true or /?signup=true, handle appropriately
  function maybeOpenFromQuery() {
    try {
      const params = new URLSearchParams(location.search);
      
      // Redirect login to dedicated page
      if (params.get('login') === 'true') {
        params.delete('login');
        if (history && history.replaceState) {
          const query = params.toString();
          history.replaceState({}, '', query ? ('/?' + query) : '/');
        }
        window.location.href = '/login';
        return;
      }
      
      // Open signup modal
      if (params.get('signup') === 'true') {
        openSignupModal();
        
        // Clean params from URL
        params.delete('signup');
        if (history && history.replaceState) {
          const query = params.toString();
          history.replaceState({}, '', query ? ('/?' + query) : '/');
        }
        return;
      }
    } catch (_) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', maybeOpenFromQuery);
  } else {
    maybeOpenFromQuery();
  }
})();
