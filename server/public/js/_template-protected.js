// ============================================================
// File: server/public/js/_template-protected.js
// Description: Client-side script for the master protected page template
// Purpose: Demonstrates a CSP-safe pattern for adding page-specific logic
// Notes:
//   - This file is always loaded with a nonce (see _template-protected.ejs)
//   - Keep it free of secrets and inline HTML injections
// ============================================================

// CONNECT!: This file belongs to the master protected page system.
// CLONE GUIDE:
// 1. Copy _template-protected.ejs → newpage.ejs
// 2. Copy _templatePresenter.js → newpagePresenter.js
// 3. Add route in dashboard.js → /newpage
// 4. Export new builder in presenters/index.js if needed.

/**
 * WHAT:
 * Runs once the DOM is ready.
 * WHY:
 * Ensures all elements exist before attaching event listeners.
 * HOW:
 * Uses 'DOMContentLoaded' to wait until the page is parsed.
 */
document.addEventListener('DOMContentLoaded', () => {

  // ============================================================
  // SECTION: BASIC UTILITIES
  // ============================================================

  /**
   * WHAT:
   * Fetch CSRF token from <meta name="csrf-token">.
   * WHY:
   * Needed for any POST/PUT/PATCH/DELETE calls to protected routes.
   * HOW:
   * Read from DOM; backend injects this meta tag dynamically.
   */
  function getCsrfToken() {
    // I am saving `meta` here so the nearby steps can reuse the same value without rebuilding it each time.
    const meta = document.querySelector('meta[name="csrf-token"]');
    // This return sends the completed value or response back to the code that called this function.
    return meta ? meta.getAttribute('content') : '';
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  /**
   * WHAT:
   * Generic helper to make safe JSON requests.
   * WHY:
   * Keeps all future form submissions consistent and CSRF-protected.
   */
  async function safeRequest(url, options = {}) {
    // I am saving `csrfToken` here so the nearby steps can reuse the same value without rebuilding it each time.
    const csrfToken = getCsrfToken();
    // I am saving `headers` here so the nearby steps can reuse the same value without rebuilding it each time.
    const headers = Object.assign({}, options.headers || {}, {
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      'Content-Type': 'application/json',
      // I am keeping this line here because the surrounding _template-protected.js workflow expects this value or operation before it continues.
      'x-csrf-token': csrfToken
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am saving `res` here so the nearby steps can reuse the same value without rebuilding it each time.
    const res = await fetch(url, { ...options, headers });
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!res.ok) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      console.warn('[TemplateProtected] Request failed', res.status);
      // I am stopping this path with the existing error here because the caller should not continue with an invalid result.
      throw new Error(`HTTP ${res.status}`);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    // This return sends the completed value or response back to the code that called this function.
    return res.json().catch(() => ({}));
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // ============================================================
  // SECTION: CONNECT - FORM HANDLING
  // ============================================================
  // CONNECT: ADD-NEW-HERE
  // Example: handle a form submission securely.
  // Uncomment and adapt when ready.
  /*
  const form = document.querySelector('#exampleForm');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const data = Object.fromEntries(new FormData(form));
      try {
        const res = await safeRequest('/api/example', {
          method: 'POST',
          body: JSON.stringify(data)
        });
        console.log('Server response:', res);
      } catch (err) {
        console.error('Submission failed:', err);
      }
    });
  }
  */

  // ============================================================
  // SECTION: CONNECT - UI EXTENSIONS
  // ============================================================
  // CONNECT: ADD-NEW-HERE
  // Example: dynamic visibility, modal trigger, or live updates.
  /*
  const messageEl = document.querySelector('#message');
  if (messageEl) {
    messageEl.textContent = 'Page loaded successfully.';
  }
  */

  // ============================================================
  // SECTION: SAFETY
  // WHAT:
  // Never directly insert untrusted data into innerHTML.
  // Always sanitize or use textContent.
  // ============================================================
});