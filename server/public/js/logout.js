/**
 * Modular logout used across pages
 * Clears server cookie, Supabase session, JS-readable cookies & storage,
 * shows a modal, and redirects with a hard replace.
 */

// Logout diagnostics use this small logger so email, phone, and token values stay redacted.
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

// Shared logout DOM and navigation helpers
const LOGOUT_HOLD_KEY = 'logout.ui.hold';
const MODAL_ID = 'logoutModal'; // Unique ID to avoid collisions with other modals
const LOGOUT_PATH = '/auth/clear-cookie';

function getCsrfToken() {
  const meta = document.querySelector('meta[name="csrf-token"]');
  return meta ? meta.getAttribute('content') : '';
}

/**
 * Navigation Guard - Allows clicks inside modal, blocks everything else
 * 
 * Freezes ALL navigation except clicks inside the logout modal.
 * 
 * Prevents auto-redirects, form submits, and navigation while allowing
 * the modal's OK button to work properly.
 * 
 * Check if click target is inside the modal before blocking.
 * Use capture phase to intercept events before other listeners.
 */
const NavGuard = (() => {
  // Logout touches several stores asynchronously. This temporary guard blocks navigation
  // and form submission so another page cannot interrupt cleanup halfway through.
  let active = false;
  const orig = {};

  const inModal = (t) => {
    try { 
      return !!(t && t.closest && t.closest(`#${MODAL_ID}`)); 
    } catch { 
      return false; 
    }
  };

  function install() {
    if (active) return;
    active = true;
    logoutLogger.info('NavGuard: Freezing navigation (modal clicks allowed)');

    // Freeze programmatic nav
    orig.assign = window.location.assign.bind(window.location);
    window.location.assign = () => {};
    orig.replace = window.location.replace.bind(window.location);
    window.location.replace = () => {};
    orig.reload = window.location.reload.bind(window.location);
    window.location.reload = () => {};

    // Freeze history nav
    orig.pushState = history.pushState.bind(history);
    history.pushState = () => {};
    orig.replaceState = history.replaceState.bind(history);
    history.replaceState = () => {};

    // Block user nav, but allow clicks *inside* modal
    document.addEventListener('click', clickBlocker, true);
    document.addEventListener('submit', submitBlocker, true);
    window.addEventListener('keydown', escBlocker, true);
    window.addEventListener('beforeunload', beforeUnloadBlocker, { capture: true });
  }

  function release() {
    if (!active) return;
    active = false;
    logoutLogger.info('NavGuard: Releasing navigation freeze');

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
    if (inModal(e.target)) return; // let modal buttons work
    const el = e.target?.closest?.('a,button,[role="button"],input[type="submit"],area');
    if (!el) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    e.stopPropagation();
  }

  function submitBlocker(e) {
    if (inModal(e.target)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    e.stopPropagation();
  }

  function escBlocker(e) {
    if (inModal(e.target)) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  }

  function beforeUnloadBlocker(e) {
    e.preventDefault();
    e.returnValue = '';
  }

  return { install, release, _orig: orig };
})();

/**
 * Logout-specific modal with unique IDs (no collisions)
 * 
 * Creates a modal dialog specifically for logout with unique DOM IDs.
 * 
 * Prevents collisions with other notification modals (main.js, dashboard.js).
 * Ensures the logout modal can't be interfered with by other scripts.
 * 
 * Use unique IDs (logoutModal, logoutModalTitle, etc.) and only allow
 * closing via the OK button. No X button, no click-outside, no Escape.
 */
function showLogoutModal(title, message, onClose = null) {
  let modal = document.getElementById('logoutModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'logoutModal';
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-content logout-modal" role="dialog" aria-modal="true" aria-labelledby="logoutModalTitle">
        <div class="modal-header">
          <h2 id="logoutModalTitle">Notification</h2>
        </div>
        <div class="modal-body">
          <p id="logoutModalMessage">Message</p>
          <div class="form-actions">
            <button type="button" class="btn btn-primary" id="logoutModalOkBtn">OK</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  // Never rely on any global "notification" handlers
  const titleEl = document.getElementById('logoutModalTitle');
  const messageEl = document.getElementById('logoutModalMessage');
  const okBtn = document.getElementById('logoutModalOkBtn');

  if (titleEl) titleEl.textContent = title;
  if (messageEl) messageEl.textContent = message;

  // HARD lock: while open, prevent Esc from closing
  const escBlock = (e) => {
    if (e.key === 'Escape') e.stopImmediatePropagation();
  };
  window.addEventListener('keydown', escBlock, { capture: true });

  const closeModal = () => {
    modal.classList.remove('show');
    okBtn?.removeEventListener('click', closeModal);
    window.removeEventListener('keydown', escBlock, { capture: true });
    if (onClose) onClose();
  };

  okBtn?.removeEventListener('click', closeModal);
  okBtn?.addEventListener('click', closeModal, { once: true });

  modal.classList.add('show');
}

// The logout guard keeps a second click from starting the cleanup sequence again.
let LOGOUT_IN_FLIGHT = false; // NEW: double-click guard

async function performLogout() {
  // Clear the server cookie, Supabase session, readable cookies, and local browser state.
  // Each layer is cleaned because leaving one behind can make the next visit look signed in.
  if (LOGOUT_IN_FLIGHT) return;
  LOGOUT_IN_FLIGHT = true;

  try {
    // Tell other code to HOLD and freeze nav immediately
    try { localStorage.setItem(LOGOUT_HOLD_KEY, '1'); } catch {}
    NavGuard.install();

    const csrf = getCsrfToken();

    // 1) Clear HttpOnly cookie with CSRF token
    try {
      await fetch('/auth/clear-cookie', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Accept': 'application/json',
          ...(csrf ? { 'X-CSRF-Token': csrf } : {})
        }
      });
      logoutLogger.info('Server cookie cleared');
    } catch {
      logoutLogger.warn('Server cookie clear failed; proceeding');
    }

    // 2) Supabase signOut (use the shared singleton)
    try {
      if (window.SB?.auth?.signOut) {
        await window.SB.auth.signOut();
        logoutLogger.info('Supabase session cleared');
      } else if (window.supabase?.auth?.signOut) {
        // legacy fallback if a client was stashed there
        await window.supabase.auth.signOut();
        logoutLogger.info('Supabase session cleared (legacy ref)');
      } else {
        logoutLogger.warn('No Supabase client available to sign out');
      }
    } catch (e) {
      logoutLogger.info('Supabase signOut exception (non-fatal)', { error: e?.message || String(e) });
    }

    // 2b) Explicitly remove all Supabase localStorage keys as safety net
    try {
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('sb-') || key.includes('supabase'))) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => {
        try {
          localStorage.removeItem(key);
        } catch {}
      });
      if (keysToRemove.length > 0) {
        logoutLogger.info('Explicitly cleared Supabase localStorage keys:', keysToRemove);
      }
    } catch (e) {
      logoutLogger.info('Failed to clear Supabase localStorage (non-fatal)', { error: e?.message || String(e) });
    }

    // 3) Clear JS cookies & storage (keep HOLD in localStorage)
    // Note: Server already clears sb-access-token and sb_session via /auth/clear-cookie
    // Only clear client-side refresh token if needed
    document.cookie = 'sb-refresh-token=; Path=/; Max-Age=0; SameSite=Lax';
    logoutLogger.info('JS cookies cleared');

    try {
      sessionStorage.clear();
    } catch { /* Storage can be unavailable in privacy modes; logout should still finish. */ }

    if (window.caches?.keys) {
      try {
        const ks = await caches.keys();
        await Promise.all(ks.map(c => caches.delete(c)));
        logoutLogger.info('CacheStorage cleared');
      } catch { /* Cache cleanup is optional and should not hold the user on this page. */ }
    }

    try {
      if (navigator.credentials?.preventSilentAccess) {
        await navigator.credentials.preventSilentAccess();
        logoutLogger.info('preventSilentAccess invoked');
      }
    } catch { /* Older browsers may reject this optional credential API during logout. */ }

    try {
      const channel = new BroadcastChannel('auth');
      channel.postMessage({ type: 'LOGOUT' });
      channel.close();
    } catch {
      // BroadcastChannel is optional; the server cookie remains authoritative.
    }

    // 4) Set flash flag and redirect (modal shown on next page)
    try { sessionStorage.setItem('logout.flash', '1'); } catch (_) {}
    
    // Release guard and navigate (KEEP HOLD active - main.js will clear it)
    NavGuard.release();
    (NavGuard._orig.replace || window.location.replace).call(window.location, '/');

  } catch (err) {
    logoutLogger.error('Logout error', { msg: err?.message || String(err) });
    // Still redirect even on error - let user retry
    try { sessionStorage.setItem('logout.flash', '1'); } catch (_) {}
    NavGuard.release();
    (NavGuard._orig.replace || window.location.replace).call(window.location, '/');
  } finally {
    LOGOUT_IN_FLIGHT = false;
  }
}

async function handleLogout() {
  // Keep every logout entry point on one serialized path so repeated clicks do not launch
  // overlapping cleanup requests or competing redirects.
  logoutLogger.info('handleLogout called');
  await performLogout();
}

function attachLogoutHandler(selector = '#logoutBtn') {
  const btn = document.querySelector(selector);
  if (btn) {
    btn.removeEventListener('click', handleLogout);
    btn.addEventListener('click', handleLogout, { passive: true });
    logoutLogger.info('Logout handler attached', { selector });
    return true;
  }
  logoutLogger.info('Logout button not found (ok on pages without it)', { selector });
  return false;
}

function isLogoutButton(target) {
    if (!target) return false;
    const btn = target.closest && target.closest('button,[role="button"],a');
    const form = target.closest && target.closest('form');
    if (btn && btn.hasAttribute('data-logout')) return true;
    if (form && form.getAttribute && typeof form.getAttribute === 'function') {
      const action = form.getAttribute('action') || '';
      if (action.endsWith(LOGOUT_PATH)) return true;
    }
    return false;
}

// Capture both click and submit so native form navigation cannot interrupt cleanup.
document.addEventListener('click', function (e) {
    if (!isLogoutButton(e.target)) return;
    e.preventDefault();
    e.stopPropagation();
    performLogout();
}, true);

document.addEventListener('submit', function (e) {
    const form = e.target;
    if (!form) return;
    const action = (form.getAttribute && form.getAttribute('action')) || '';
    const containsLogoutBtn = !!(form.querySelector && form.querySelector('[data-logout]'));
    if (!action.endsWith(LOGOUT_PATH) && !containsLogoutBtn) return;
    e.preventDefault();
    e.stopPropagation();
    performLogout();
}, true);

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
  showLogoutModal // Unique, namespaced modal for logout
};
window.reattachLogoutHandler = function (selector='#logoutBtn') {
  logoutLogger.info('Re-attaching logout handler');
  return attachLogoutHandler(selector);
};
