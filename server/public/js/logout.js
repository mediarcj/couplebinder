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
   Helpers
=========================== */
function getCsrfToken() {
  const meta = document.querySelector('meta[name="csrf-token"]');
  return meta ? meta.getAttribute('content') : '';
}

// Singleton modal (no innerHTML injection risks: we use textContent)
function showNotificationModal(title, message, onClose = null) {
  let modal = document.getElementById('notificationModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'notificationModal';
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-content notification-modal" role="dialog" aria-modal="true" aria-labelledby="notificationTitle">
        <div class="modal-header">
          <h2 id="notificationTitle">Notification</h2>
          <button type="button" class="close" id="notificationClose" aria-label="Close">×</button>
        </div>
        <div class="modal-body">
          <p id="notificationMessage">Message</p>
          <div class="form-actions">
            <button type="button" class="btn btn-secondary" id="notificationOkBtn">OK</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  const titleEl = document.getElementById('notificationTitle');
  const messageEl = document.getElementById('notificationMessage');
  const closeBtn = document.getElementById('notificationClose');
  const okBtn = document.getElementById('notificationOkBtn');

  if (titleEl) titleEl.textContent = title;
  if (messageEl) messageEl.textContent = message;
  modal.style.display = 'block';

  // NEW: scoped listeners + cleanup
  const onOutside = (evt) => {
    if (evt.target === modal) closeModal();
  };
  const closeModal = () => {
    modal.style.display = 'none';
    closeBtn?.removeEventListener('click', closeModal);
    okBtn?.removeEventListener('click', closeModal);
    window.removeEventListener('click', onOutside);
    onClose && onClose();
  };
  closeBtn?.addEventListener('click', closeModal);
  okBtn?.addEventListener('click', closeModal);
  window.addEventListener('click', onOutside);
}

/* ===========================
   Logout core
=========================== */
let LOGOUT_IN_FLIGHT = false; // NEW: double-click guard

async function performLogout() {
  if (LOGOUT_IN_FLIGHT) return; // drop duplicates
  LOGOUT_IN_FLIGHT = true;

  try {
    const csrf = getCsrfToken();

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
    showNotificationModal('Logged out', 'You have been logged out successfully!', () => {
      // Broadcast logout to other tabs AFTER modal is dismissed
      try {
        const bc = new BroadcastChannel('auth');
        bc.postMessage({ type: 'LOGOUT' });
        bc.close();
        logoutLogger.info('Logout broadcast sent to other tabs');
      } catch (error) {
        logoutLogger.info('BroadcastChannel not available - cross-tab sync skipped');
      }
      
      // Then redirect this tab
      window.location.replace('/');
    });

  } catch (error) {
    logoutLogger.error('Logout error', { msg: error?.message || String(error) });
    showNotificationModal('Logout Error', 'Network error during logout. Please try again.');
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
  showNotificationModal
};
window.reattachLogoutHandler = function (selector='#logoutBtn') {
  logoutLogger.info('Re-attaching logout handler');
  return attachLogoutHandler(selector);
};