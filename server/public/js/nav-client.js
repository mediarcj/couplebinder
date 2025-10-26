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
 * Prevents /?login=true and /?signup=true from appearing in URL bar.
 * Links still work with JS disabled (they navigate to query params).
 * Deep-links from other pages still open modals correctly.
 * 
 * HOW:
 * Intercept clicks on links with auth query params before navigation.
 * Open modal immediately and prevent default navigation.
 * Also check for query params on page load for deep-link support.
 * Clean params from URL after opening modal.
 */
(function interceptAuthLinks() {
  function getAnchor(el) {
    return el && el.closest ? el.closest('a') : null;
  }

  function isAuthQueryHref(href) {
    if (!href) return false;
    try {
      const u = new URL(href, location.origin);
      const p = u.searchParams;
      return (p.get('login') === 'true' || p.get('signup') === 'true');
    } catch (_) {
      return false;
    }
  }

  function openAuth(kind) {
    if (window.modalManager && typeof window.modalManager.open === 'function') {
      window.modalManager.open(kind);
    } else if (window.modalManager && typeof window.modalManager.openModal === 'function') {
      window.modalManager.openModal(kind);
    } else if (typeof window.openModal === 'function') {
      window.openModal(kind);
    }
  }

  // Intercept clicks on auth links before navigation
  document.addEventListener('click', function (e) {
    const a = getAnchor(e.target);
    if (!a) return;

    const href = a.getAttribute('href');
    if (!isAuthQueryHref(href)) return;

    e.preventDefault();

    const u = new URL(href, location.origin);
    const kind = u.searchParams.get('login') === 'true' ? 'login' : 'signup';
    openAuth(kind);
  }, true);

  // Back-compat: if user lands on /?login=true or /?signup=true, open and clean the URL
  function maybeOpenFromQuery() {
    try {
      const params = new URLSearchParams(location.search);
      const kind = params.get('login') === 'true' ? 'login'
                 : params.get('signup') === 'true' ? 'signup'
                 : null;
      if (!kind) return;

      openAuth(kind);

      // Clean params from URL
      params.delete('login');
      params.delete('signup');
      if (history && history.replaceState) {
        const query = params.toString();
        history.replaceState({}, '', query ? ('/?' + query) : '/');
      }
    } catch (_) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', maybeOpenFromQuery);
  } else {
    maybeOpenFromQuery();
  }
})();
