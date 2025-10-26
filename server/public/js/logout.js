/**
 * Modular logout used across pages
 * Clears server cookie, Supabase session, JS-readable cookies & storage,
 * shows a modal, and redirects with a hard replace.
 */

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
   Helpers
=========================== */
const LOGOUT_HOLD_KEY = 'logout.ui.hold';
const MODAL_ID = 'logoutModal'; // Unique ID to avoid collisions with other modals

function getCsrfToken() {
  const meta = document.querySelector('meta[name="csrf-token"]');
  return meta ? meta.getAttribute('content') : '';
}

/**
 * Navigation Guard - Allows clicks inside modal, blocks everything else
 * 
 * WHAT:
 * Freezes ALL navigation except clicks inside the logout modal.
 * 
 * WHY:
 * Prevents auto-redirects, form submits, and navigation while allowing
 * the modal's OK button to work properly.
 * 
 * HOW:
 * Check if click target is inside the modal before blocking.
 * Use capture phase to intercept events before other listeners.
 */
const NavGuard = (() => {
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
 * WHAT:
 * Creates a modal dialog specifically for logout with unique DOM IDs.
 * 
 * WHY:
 * Prevents collisions with other notification modals (main.js, dashboard.js).
 * Ensures the logout modal can't be interfered with by other scripts.
 * 
 * HOW:
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

/* ===========================
   Logout core
=========================== */
let LOGOUT_IN_FLIGHT = false; // NEW: double-click guard

async function performLogout() {
  if (LOGOUT_IN_FLIGHT) return;
  LOGOUT_IN_FLIGHT = true;

  try {
    // Tell other code to HOLD and freeze nav immediately
    try { localStorage.setItem(LOGOUT_HOLD_KEY, '1'); } catch {}
    NavGuard.install();

    const csrf = getCsrfToken();

    // 1) Clear HttpOnly cookie
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

    // 3) Clear JS cookies & storage (keep HOLD in localStorage)
    document.cookie = 'sb-access-token=; Path=/; Max-Age=0; SameSite=Lax';
    document.cookie = 'sb_access_token=; Path=/; Max-Age=0; SameSite=Lax';
    document.cookie = 'sb-refresh-token=; Path=/; Max-Age=0; SameSite=Lax';
    logoutLogger.info('JS cookies cleared');

    try {
      sessionStorage.clear();
    } catch { /* ignore */ }

    if (window.caches?.keys) {
      try {
        const ks = await caches.keys();
        await Promise.all(ks.map(c => caches.delete(c)));
        logoutLogger.info('CacheStorage cleared');
      } catch { /* ignore */ }
    }

    try {
      if (navigator.credentials?.preventSilentAccess) {
        await navigator.credentials.preventSilentAccess();
        logoutLogger.info('preventSilentAccess invoked');
      }
    } catch { /* ignore */ }

    // 4) Show modal; only OK can proceed
    showLogoutModal('Logged out', 'You have been logged out successfully!', () => {
      // Release guard and navigate (KEEP HOLD active - main.js will clear it)
      NavGuard.release();
      (NavGuard._orig.replace || window.location.replace).call(window.location, '/');
    });

  } catch (err) {
    logoutLogger.error('Logout error', { msg: err?.message || String(err) });
    showLogoutModal('Logout Error', 'Network error during logout. Please try again.');
  } finally {
    LOGOUT_IN_FLIGHT = false;
  }
}

async function handleLogout() {
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

/**
 * WHAT:
 * Bulletproof interceptor for logout - catches ALL logout attempts.
 * 
 * WHY:
 * Even if a page forgets data-logout="true", we still intercept forms posting to /auth/clear-cookie.
 * Ensures Supabase auth.signOut() is called before clearing cookies to prevent re-login race.
 * 
 * HOW:
 * Listen for clicks on [data-logout] buttons AND form submits to /auth/clear-cookie.
 * Intercept and call Supabase signOut() FIRST, then clear cookies, then redirect.
 */
(function setupDataLogoutInterceptor() {
  const LOGOUT_PATH = '/auth/clear-cookie';
  const CSL = '[logout]'; // console log tag

  function getSB() {
    return (window.sb && window.sb.auth && window.sb) ||
           (window.supabase && window.supabase.auth && window.supabase) ||
           (window.SB && window.SB.auth && window.SB) ||
           null;
  }

  function getCsrf(el) {
    try {
      const form = el && el.closest && el.closest('form');
      if (form) {
        const hid = form.querySelector('input[name="_csrf"]');
        if (hid && hid.value) return hid.value;
      }
      const meta = document.querySelector('meta[name="csrf-token"]');
      if (meta) return meta.getAttribute('content');
    } catch (_) {}
    return undefined;
  }

  async function doLogout(triggerEl) {
    // Mark intent so boot-time code won't re-set cookie
    try { 
      sessionStorage.setItem('justLoggedOut', '1'); 
      localStorage.setItem('logout.ui.hold', '1');
    } catch (_) {}
    try { 
      document.cookie = 'auth_logout=1; Path=/; Max-Age=10; SameSite=Lax'; 
    } catch (_) {}

    // Best-effort Supabase sign out FIRST (so there's no client session to re-hydrate)
    try {
      const sb = getSB();
      if (sb && sb.auth && typeof sb.auth.signOut === 'function') {
        console.debug(CSL, 'signOut()…');
        await sb.auth.signOut(); // Removes local session + revokes refresh
        console.debug(CSL, 'signOut completed');
      } else {
        console.debug(CSL, 'no sb client available');
      }
    } catch (e) {
      console.warn(CSL, 'signOut error', e);
    }

    // Clear server cookies
    const csrf = getCsrf(triggerEl);
    try {
      await fetch(LOGOUT_PATH, {
        method: 'POST',
        headers: Object.assign(
          { 'Accept': 'application/json' },
          csrf ? { 'CSRF-Token': csrf } : {}
        ),
        credentials: 'include'
      });
      console.debug(CSL, 'server cookie cleared');
    } catch (e) {
      console.warn(CSL, 'clear-cookie fetch error', e);
    }

    // Land on public home (server will 303 here too if we hit it by form)
    window.location.replace('/');
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

  // Capture both click and submit so we win races with native navigation
  document.addEventListener('click', function (e) {
    if (!isLogoutButton(e.target)) return;
    e.preventDefault();
    e.stopPropagation();
    console.debug(CSL, 'logout click intercepted');
    doLogout(e.target);
  }, true);

  document.addEventListener('submit', function (e) {
    const form = e.target;
    if (!form) return;
    const action = (form.getAttribute && form.getAttribute('action')) || '';
    const containsLogoutBtn = !!(form.querySelector && form.querySelector('[data-logout]'));
    if (!action.endsWith(LOGOUT_PATH) && !containsLogoutBtn) return;
    e.preventDefault();
    e.stopPropagation();
    console.debug(CSL, 'logout form submit intercepted');
    doLogout(form);
  }, true);
})();

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