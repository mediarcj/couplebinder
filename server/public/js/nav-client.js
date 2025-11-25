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
 * Intercept legacy auth links (/?login=true, /?signup=true, /?register=true) and redirect to dedicated pages.
 * 
 * WHY:
 * Maintains backwards compatibility for old deep links without reopening modals.
 * Prevents query params from flashing in the URL bar.
 * 
 * HOW:
 * Listen for clicks on anchors with login/register query params.
 * Redirect to /login or /register accordingly.
 * Also handle direct page loads with these params.
 * Legacy /?signup=true redirects to /register for backward compatibility.
 */
(function interceptAuthLinks() {
  function getAnchor(el) {
    return el && el.closest ? el.closest('a') : null;
  }

  function cleanAndRedirect(params, targetPath, originalUrl) {
    if (params) {
      params.delete('login');
      params.delete('signup');
      params.delete('register');
      if (history && history.replaceState) {
        const query = params.toString();
        history.replaceState({}, '', query ? (`${originalUrl.pathname}?${query}`) : originalUrl.pathname);
      }
    }
    window.location.href = targetPath;
  }

  document.addEventListener('click', function (e) {
    const a = getAnchor(e.target);
    if (!a) return;

    const href = a.getAttribute('href');
    if (!href) return;

    try {
      const url = new URL(href, location.origin);
      const params = url.searchParams;
      if (params.get('login') === 'true') {
        e.preventDefault();
        cleanAndRedirect(params, '/login', url);
        return;
      }
      if (params.get('register') === 'true' || params.get('signup') === 'true') {
        e.preventDefault();
        cleanAndRedirect(params, '/register', url);
        return;
      }
    } catch (_) {}
  }, true);

  function maybeRedirectFromQuery() {
    try {
      const params = new URLSearchParams(location.search);
      if (params.get('login') === 'true') {
        const clone = new URL(window.location.href);
        cleanAndRedirect(params, '/login', clone);
        return;
      }
      if (params.get('register') === 'true' || params.get('signup') === 'true') {
        const clone = new URL(window.location.href);
        cleanAndRedirect(params, '/register', clone);
      }
    } catch (_) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', maybeRedirectFromQuery);
  } else {
    maybeRedirectFromQuery();
  }
})();
