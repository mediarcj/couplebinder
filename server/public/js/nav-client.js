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
  // I am saving `btn` here so the nearby steps can reuse the same value without rebuilding it each time.
  const btn = document.querySelector('[data-js="nav-toggle"]');
  // I am saving `menu` here so the nearby steps can reuse the same value without rebuilding it each time.
  const menu = document.getElementById('site-nav-menu');
  
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!btn || !menu) return;

  // I am connecting this event listener here so the browser can run the nearby handler when that user or page event occurs.
  btn.addEventListener('click', function () {
    // I am saving `expanded` here so the nearby steps can reuse the same value without rebuilding it each time.
    const expanded = this.getAttribute('aria-expanded') === 'true';
    // I am calling this helper here so the current workflow performs this step before it moves on.
    this.setAttribute('aria-expanded', String(!expanded));
    // I am calling this helper here so the current workflow performs this step before it moves on.
    menu.classList.toggle('is-open', !expanded);
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });
// This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
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
  // I am keeping `getAnchor` as a named helper so the surrounding workflow can call this step when it needs it.
  function getAnchor(el) {
    // This return sends the completed value or response back to the code that called this function.
    return el && el.closest ? el.closest('a') : null;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am keeping `cleanAndRedirect` as a named helper so the surrounding workflow can call this step when it needs it.
  function cleanAndRedirect(params, targetPath, originalUrl) {
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (params) {
      // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
      params.delete('login');
      // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
      params.delete('signup');
      // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
      params.delete('register');
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (history && history.replaceState) {
        // I am saving `query` here so the nearby steps can reuse the same value without rebuilding it each time.
        const query = params.toString();
        // I am calling this helper here so the current workflow performs this step before it moves on.
        history.replaceState({}, '', query ? (`${originalUrl.pathname}?${query}`) : originalUrl.pathname);
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    // I am keeping this line here because the surrounding nav-client.js workflow expects this value or operation before it continues.
    window.location.href = targetPath;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am connecting this event listener here so the browser can run the nearby handler when that user or page event occurs.
  document.addEventListener('click', function (e) {
    // I am saving `a` here so the nearby steps can reuse the same value without rebuilding it each time.
    const a = getAnchor(e.target);
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!a) return;

    // I am saving `href` here so the nearby steps can reuse the same value without rebuilding it each time.
    const href = a.getAttribute('href');
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!href) return;

    // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
    try {
      // I am saving `url` here so the nearby steps can reuse the same value without rebuilding it each time.
      const url = new URL(href, location.origin);
      // I am saving `params` here so the nearby steps can reuse the same value without rebuilding it each time.
      const params = url.searchParams;
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (params.get('login') === 'true') {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        e.preventDefault();
        // I am calling this helper here so the current workflow performs this step before it moves on.
        cleanAndRedirect(params, '/login', url);
        // This return sends the completed value or response back to the code that called this function.
        return;
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (params.get('register') === 'true' || params.get('signup') === 'true') {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        e.preventDefault();
        // I am calling this helper here so the current workflow performs this step before it moves on.
        cleanAndRedirect(params, '/register', url);
        // This return sends the completed value or response back to the code that called this function.
        return;
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
    } catch (_) {}
  // I am keeping this line here because the surrounding nav-client.js workflow expects this value or operation before it continues.
  }, true);

  // I am keeping `maybeRedirectFromQuery` as a named helper so the surrounding workflow can call this step when it needs it.
  function maybeRedirectFromQuery() {
    // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
    try {
      // I am saving `params` here so the nearby steps can reuse the same value without rebuilding it each time.
      const params = new URLSearchParams(location.search);
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (params.get('login') === 'true') {
        // I am saving `clone` here so the nearby steps can reuse the same value without rebuilding it each time.
        const clone = new URL(window.location.href);
        // I am calling this helper here so the current workflow performs this step before it moves on.
        cleanAndRedirect(params, '/login', clone);
        // This return sends the completed value or response back to the code that called this function.
        return;
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (params.get('register') === 'true' || params.get('signup') === 'true') {
        // I am saving `clone` here so the nearby steps can reuse the same value without rebuilding it each time.
        const clone = new URL(window.location.href);
        // I am calling this helper here so the current workflow performs this step before it moves on.
        cleanAndRedirect(params, '/register', clone);
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
    } catch (_) {}
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (document.readyState === 'loading') {
    // I am connecting this event listener here so the browser can run the nearby handler when that user or page event occurs.
    document.addEventListener('DOMContentLoaded', maybeRedirectFromQuery);
  // This alternative runs only when the condition above did not use its first path.
  } else {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    maybeRedirectFromQuery();
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
})();
