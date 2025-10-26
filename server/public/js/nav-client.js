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
