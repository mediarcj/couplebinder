// ============================================================
// File: server/public/js/_template-protected.js
// Description: Client-side script for the master protected page template
// Purpose: Demonstrates a CSP-safe pattern for adding page-specific logic
// Notes:
//   - This file is always loaded with a nonce (see _template-protected.ejs)
//   - Keep it free of secrets and inline HTML injections
// ============================================================

/**
 * WHAT:
 * Runs once the DOM is ready.
 * WHY:
 * Ensures all elements exist before attaching event listeners.
 * HOW:
 * Uses 'DOMContentLoaded' to wait until the page is parsed.
 */
document.addEventListener('DOMContentLoaded', () => {
  console.log('[TemplateProtected] Page initialized');

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
    const meta = document.querySelector('meta[name="csrf-token"]');
    return meta ? meta.getAttribute('content') : '';
  }

  /**
   * WHAT:
   * Generic helper to make safe JSON requests.
   * WHY:
   * Keeps all future form submissions consistent and CSRF-protected.
   */
  async function safeRequest(url, options = {}) {
    const csrfToken = getCsrfToken();
    const headers = Object.assign({}, options.headers || {}, {
      'Content-Type': 'application/json',
      'x-csrf-token': csrfToken
    });

    const res = await fetch(url, { ...options, headers });
    if (!res.ok) {
      console.warn('[TemplateProtected] Request failed', res.status);
      throw new Error(`HTTP ${res.status}`);
    }
    return res.json().catch(() => ({}));
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