// File: server/public/js/logout.js
// Modular logout used across pages
// Clears server cookie, Supabase session, JS-readable cookies & storage,
// shows a modal, and redirects with a hard replace.

/* ===========================
   Quiet logger (PII-safe)
=========================== */
const logoutLogger = {
  isDebugEnabled: () => localStorage.getItem('debugLogout') === '1', // NEW: specific key
  redact: (obj) => {
    if (typeof obj === 'string') {
      return obj
        .replace(/([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g, '[EMAIL]')
        .replace(/(\b\d{7,}\b)/g, '[PHONE]')
        .replace(/(sb-access-token=[^;]+)/g, '[TOKEN]');
    }
    if (obj && typeof obj === 'object') {
      const redacted = {};
      for (const [k, v] of Object.entries(obj)) {
        if (['email','phone','token','password','auth'].some(pii => k.toLowerCase().includes(pii))) {
          redacted[k] = '[REDACTED]';
        } else if (typeof v === 'string') {
          redacted[k] = logoutLogger.redact(v); // FIX: use logoutLogger
        } else {
          redacted[k] = v;
        }
      }
      return redacted;
    }
    return obj;
  },
  info: (m, d={}) => logoutLogger.isDebugEnabled() && console.log(`[DEBUG] ${m}`, logoutLogger.redact(d)),
  warn: (m, d={}) => logoutLogger.isDebugEnabled() && console.warn(`[WARN] ${m}`, logoutLogger.redact(d)),
  error: (m, d={}) => console.error(`[ERROR] ${m}`, logoutLogger.redact(d))
};

/* ===========================
   Navigation Guard (Authoritative Modal)
=========================== */
/**
 * WHAT:
 * Freezes ALL navigation (programmatic and user-initiated) until released.
 * 
 * WHY:
 * Ensures the logout modal is the ONLY path forward - no auto-redirects,
 * no accidental submits, no third-party script navigation, no Esc dismiss.
 * 
 * HOW:
 * Intercepts and blocks:
 * - Programmatic navigation (location.assign, location.replace, location.reload)
 * - History changes (pushState, replaceState)
 * - User clicks on links/buttons
 * - Form submissions
 * - Escape key
 * - Page unload attempts
 */
const NavGuard = (() => {
  let active = false;
  const orig = {};

  function install() {
    if (active) return;
    active = true;
    logoutLogger.info('NavGuard: Freezing all navigation');

    // Freeze programmatic navigation
    orig.assign = window.location.assign.bind(window.location);
    orig.replace = window.location.replace.bind(window.location);
    orig.reload = window.location.reload.bind(window.location);
    window.location.assign = () => {};
    window.location.replace = () => {};
    window.location.reload = () => {};

    // Freeze history changes
    orig.pushState = history.pushState.bind(history);
    orig.replaceState = history.replaceState.bind(history);
    history.pushState = history.replaceState = () => {};

    // Block user-initiated nav
    document.addEventListener('click', clickBlocker, true);
    document.addEventListener('submit', submitBlocker, true);
    window.addEventListener('keydown', escBlocker, true);

    // Last-ditch: stop unload
    window.addEventListener('beforeunload', beforeUnloadBlocker, { capture: true });
  }

  function release() {
    if (!active) return;
    active = false;
    logoutLogger.info('NavGuard: Releasing navigation freeze');

    // Restore programmatic nav
    if (orig.assign) window.location.assign = orig.assign;
    if (orig.replace) window.location.replace = orig.replace;
    if (orig.reload) window.location.reload = orig.reload;

    if (orig.pushState) history.pushState = orig.pushState;
    if (orig.replaceState) history.replaceState = orig.replaceState;

    document.removeEventListener('click', clickBlocker, true);
    document.removeEventListener('submit', submitBlocker, true);
    window.removeEventListener('keydown', escBlocker, true);
    window.removeEventListener('beforeunload', beforeUnloadBlocker, { capture: true });
  }

  function clickBlocker(e) {
    const el = e.target?.closest?.('a,button,[role="button"],input[type="submit"],area');
    if (!el) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    e.stopPropagation();
  }

  function submitBlocker(e) {
    e.preventDefault();
    e.stopImmediatePropagation();
    e.stopPropagation();
  }

  function escBlocker(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  }

  function beforeUnloadBlocker(e) {
    e.preventDefault();
    e.returnValue = ''; // Some browsers still prompt
  }

  return { install, release, _orig: orig };
})();

/* ===========================
   Helpers
=========================== */
function getCsrfToken() {
  const meta = document.querySelector('meta[name="csrf-token"]');
  return meta ? meta.getAttribute('content') : '';
}

/**
 * Namespaced modal for logout notifications
 * 
 * WHAT:
 * Creates a modal dialog that stays visible until user clicks OK.
 * Namespaced to avoid collisions with other modal functions.
 * 
 * WHY:
 * Provides clear feedback for logout action without auto-closing.
 * Prevents global function name collisions with main.js and dashboard.js.
 * 
 * HOW:
 * Modal can ONLY be closed by clicking the OK button.
 * No click-outside, no X button, no escape key - explicit user action required.
 */
function _renderLogoutModal(title, message, onClose = null) {
  let modal = document.getElementById('notificationModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'notificationModal';
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-content notification-modal" role="dialog" aria-modal="true" aria-labelledby="notificationTitle">
        <div class="modal-header">
          <h2 id="notificationTitle">Notification</h2>
        </div>
        <div class="modal-body">
          <p id="notificationMessage">Message</p>
          <div class="form-actions">
            <button type="button" class="btn btn-primary" id="notificationOkBtn">OK</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  const titleEl = document.getElementById('notificationTitle');
  const messageEl = document.getElementById('notificationMessage');
  const okBtn = document.getElementById('notificationOkBtn');

  if (titleEl) titleEl.textContent = title;
  if (messageEl) messageEl.textContent = message;
  modal.style.display = 'block';

  /**
   * Close modal handler
   * 
   * WHAT:
   * Closes the modal and triggers the onClose callback.
   * 
   * WHY:
   * Clean up event listeners and execute post-close actions.
   * 
   * HOW:
   * Remove event listener, hide modal, call onClose callback.
   */
  const closeModal = () => {
    modal.style.display = 'none';
    okBtn?.removeEventListener('click', closeModal);
    if (onClose) onClose();
  };

  // CRITICAL: Only allow closing via OK button click
  // No click-outside, no X button, no escape key
  okBtn?.removeEventListener('click', closeModal); // Remove old listener if any
  okBtn?.addEventListener('click', closeModal, { once: true });
}

/* ===========================
   Logout core
=========================== */
let LOGOUT_IN_FLIGHT = false; // double-click guard
const LOGOUT_HOLD_KEY = 'logout.ui.hold'; // tells other code "modal controls redirect"

async function performLogout() {
  if (LOGOUT_IN_FLIGHT) return; // drop duplicates
  LOGOUT_IN_FLIGHT = true;

  try {
    const csrf = getCsrfToken();
    
    // CRITICAL: Hold + freeze navigation immediately
    // This makes the modal the ONLY path forward
    try { localStorage.setItem(LOGOUT_HOLD_KEY, '1'); } catch {}
    NavGuard.install();

    // 1) Tell server to clear HttpOnly cookie (CSRF-protected)
    try {
      await fetch('/auth/clear-cookie', {
        method: 'POST',
        credentials: 'include',
        headers: csrf ? { 'X-CSRF-Token': csrf } : {}
      });
      logoutLogger.info('Server cookie cleared');
    } catch {
      logoutLogger.warn('Server cookie clear failed; proceeding');
    }

    // 2) Supabase sign-out (revokes refresh token + clears its storage)
    try {
      if (window.supabase?.auth?.signOut) {
        const { error } = await window.supabase.auth.signOut();
        if (error) logoutLogger.info('Supabase signOut error (non-fatal)', { error: error.message });
        else logoutLogger.info('Supabase session cleared');
      }
    } catch (e) {
      logoutLogger.info('Supabase signOut exception (non-fatal)', { error: e?.message || String(e) });
    }

    // 3) JS-readable cookie nuke (best-effort; HttpOnly is server-only)
    document.cookie = 'sb-access-token=; Path=/; Max-Age=0; SameSite=Lax';
    document.cookie = 'sb_access_token=; Path=/; Max-Age=0; SameSite=Lax';
    document.cookie = 'sb-refresh-token=; Path=/; Max-Age=0; SameSite=Lax';
    logoutLogger.info('JS cookies cleared');

    // 4) Storage cleanup (local + session + caches)
    try {
      // Supabase tokens (dynamic keys)
      const keys = Object.keys(localStorage);
      for (const k of keys) {
        if (k === 'supabase.auth.token' || (k.startsWith('sb-') && k.includes('auth-token'))) {
          localStorage.removeItem(k);
          logoutLogger.info('Cleared localStorage key', { k });
        }
      }
      // Don't nuke ALL localStorage so our HOLD flag survives.
      sessionStorage.clear();
    } catch { /* ignore */ }

    // Optional: clear CacheStorage if you ever add a service worker
    if (window.caches?.keys) {
      try {
        const names = await caches.keys();
        await Promise.all(names.map(n => caches.delete(n)));
        logoutLogger.info('CacheStorage cleared');
      } catch { /* ignore */ }
    }

    // Optional: WebAuthn/federated silent access prevention
    try {
      if (navigator.credentials?.preventSilentAccess) {
        await navigator.credentials.preventSilentAccess();
        logoutLogger.info('preventSilentAccess invoked');
      }
    } catch { /* ignore */ }

    // 5) UX + redirect (hard replace)
    // IMPORTANT: Show modal first, THEN broadcast to other tabs after user dismisses it
    window.LogoutModule.showNotificationModal('Logged out', 'You have been logged out successfully!', () => {
      // Release the guard right before we navigate on OK
      NavGuard.release();
      try { localStorage.removeItem(LOGOUT_HOLD_KEY); } catch {}
      
      // Broadcast logout to other tabs AFTER modal is dismissed
      try {
        const bc = new BroadcastChannel('auth');
        bc.postMessage({ type: 'LOGOUT' });
        bc.close();
        logoutLogger.info('Logout broadcast sent to other tabs');
      } catch (error) {
        logoutLogger.info('BroadcastChannel not available - cross-tab sync skipped');
      }
      
      // Use the original replace in case anything patched the global
      (NavGuard._orig.replace || window.location.replace).call(window.location, '/');
    });

  } catch (error) {
    logoutLogger.error('Logout error', { msg: error?.message || String(error) });
    window.LogoutModule.showNotificationModal('Logout Error', 'Network error during logout. Please try again.');
  } finally {
    LOGOUT_IN_FLIGHT = false;
  }
}

async function handleLogout(e) {
  // Prevent default anchor navigation or form submission
  if (e) {
    e.preventDefault?.();
    e.stopPropagation?.();
    e.stopImmediatePropagation?.();
  }  
  logoutLogger.info('handleLogout called');
  await performLogout();
}

function attachLogoutHandler(selector = '#logoutBtn') {
  const btn = document.querySelector(selector);
  if (btn) {
    // Make sure the control itself cannot trigger navigation/submission
    if (btn.tagName === 'BUTTON' && !btn.getAttribute('type')) {
      btn.setAttribute('type', 'button');
    }
    if (btn.tagName === 'A') {
      // Keep href for accessibility, but we’ll preventDefault above.
      btn.setAttribute('role', 'button');
      btn.setAttribute('aria-label', btn.getAttribute('aria-label') || 'Logout');
    }
    btn.removeEventListener('click', handleLogout);
    // IMPORTANT: not passive, so we *can* prevent default.
    btn.addEventListener('click', handleLogout, { capture: false });    
    logoutLogger.info('Logout handler attached', { selector });
    return true;
  }
  logoutLogger.info('Logout button not found (ok on pages without it)', { selector });
  return false;
}

function initializeLogout() {
  logoutLogger.info('Initializing logout');
  attachLogoutHandler('#logoutBtn');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeLogout, { once: true });
} else {
  initializeLogout();
}

window.LogoutModule = {
  handleLogout,
  attachLogoutHandler,
  initializeLogout,
  performLogout,
  // Expose a namespaced modal renderer so other files don't clobber it
  showNotificationModal: _renderLogoutModal
};
window.reattachLogoutHandler = function (selector='#logoutBtn') {
  logoutLogger.info('Re-attaching logout handler');
  return attachLogoutHandler(selector);
};