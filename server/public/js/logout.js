// File: server/public/js/logout.js
/**
 * Modular logout used across pages
 * Clears server cookie, Supabase session, JS-readable cookies & storage,
 * shows a modal, and redirects with a hard replace.
 */

/* ===========================
   Quiet logger (PII-safe)
=========================== */
// I am saving `logoutLogger` here so the nearby steps can reuse the same value without rebuilding it each time.
const logoutLogger = {
  isDebugEnabled: () => localStorage.getItem('debugLogout') === '1', // NEW: specific key
  // I am keeping the `redact` field in this object so the receiving code can read that value by its expected name.
  redact: (obj) => {
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (typeof obj === 'string') {
      // This return sends the completed value or response back to the code that called this function.
      return obj
        // I am continuing the existing call chain here so this option stays attached to the same operation started above.
        .replace(/([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g, '[EMAIL]')
        // I am continuing the existing call chain here so this option stays attached to the same operation started above.
        .replace(/(\b\d{7,}\b)/g, '[PHONE]')
        // I am continuing the existing call chain here so this option stays attached to the same operation started above.
        .replace(/(sb-access-token=[^;]+)/g, '[TOKEN]');
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (obj && typeof obj === 'object') {
      // I am saving `redacted` here so the nearby steps can reuse the same value without rebuilding it each time.
      const redacted = {};
      // I am repeating the next block one item at a time so every value in the existing collection receives the same handling.
      for (const [k, v] of Object.entries(obj)) {
        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (['email','phone','token','password','auth'].some(pii => k.toLowerCase().includes(pii))) {
          // I am keeping this line here because the surrounding logout.js workflow expects this value or operation before it continues.
          redacted[k] = '[REDACTED]';
        // I am checking this next possibility only because the earlier condition did not choose its path.
        } else if (typeof v === 'string') {
          redacted[k] = logoutLogger.redact(v); // FIX: use logoutLogger
        // This alternative runs only when the condition above did not use its first path.
        } else {
          // I am keeping this line here because the surrounding logout.js workflow expects this value or operation before it continues.
          redacted[k] = v;
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
      // This return sends the completed value or response back to the code that called this function.
      return redacted;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    // This return sends the completed value or response back to the code that called this function.
    return obj;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  },
  // I am keeping the `info` field in this object so the receiving code can read that value by its expected name.
  info: (m, d={}) => logoutLogger.isDebugEnabled() && console.log(`[DEBUG] ${m}`, logoutLogger.redact(d)),
  // I am keeping the `warn` field in this object so the receiving code can read that value by its expected name.
  warn: (m, d={}) => logoutLogger.isDebugEnabled() && console.warn(`[WARN] ${m}`, logoutLogger.redact(d)),
  // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
  error: (m, d={}) => console.error(`[ERROR] ${m}`, logoutLogger.redact(d))
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
};

/* ===========================
   Helpers
=========================== */
// I am saving `LOGOUT_HOLD_KEY` here so the nearby steps can reuse the same value without rebuilding it each time.
const LOGOUT_HOLD_KEY = 'logout.ui.hold';
const MODAL_ID = 'logoutModal'; // Unique ID to avoid collisions with other modals

// I am keeping `getCsrfToken` as a named helper so the surrounding workflow can call this step when it needs it.
function getCsrfToken() {
  // I am saving `meta` here so the nearby steps can reuse the same value without rebuilding it each time.
  const meta = document.querySelector('meta[name="csrf-token"]');
  // This return sends the completed value or response back to the code that called this function.
  return meta ? meta.getAttribute('content') : '';
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
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
  // Logout touches several stores asynchronously. This temporary guard blocks navigation
  // and form submission so another page cannot interrupt cleanup halfway through.
  let active = false;
  // I am saving `orig` here so the nearby steps can reuse the same value without rebuilding it each time.
  const orig = {};

  // I am saving `inModal` here so the nearby steps can reuse the same value without rebuilding it each time.
  const inModal = (t) => {
    // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
    try { 
      // This return sends the completed value or response back to the code that called this function.
      return !!(t && t.closest && t.closest(`#${MODAL_ID}`)); 
    // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
    } catch { 
      // This return sends the completed value or response back to the code that called this function.
      return false; 
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  };

  // I am keeping `install` as a named helper so the surrounding workflow can call this step when it needs it.
  function install() {
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (active) return;
    // I am keeping this line here because the surrounding logout.js workflow expects this value or operation before it continues.
    active = true;
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logoutLogger.info('NavGuard: Freezing navigation (modal clicks allowed)');

    // Freeze programmatic nav
    orig.assign = window.location.assign.bind(window.location);
    // I am keeping this line here because the surrounding logout.js workflow expects this value or operation before it continues.
    window.location.assign = () => {};
    // I am keeping this line here because the surrounding logout.js workflow expects this value or operation before it continues.
    orig.replace = window.location.replace.bind(window.location);
    // I am keeping this line here because the surrounding logout.js workflow expects this value or operation before it continues.
    window.location.replace = () => {};
    // I am keeping this line here because the surrounding logout.js workflow expects this value or operation before it continues.
    orig.reload = window.location.reload.bind(window.location);
    // I am keeping this line here because the surrounding logout.js workflow expects this value or operation before it continues.
    window.location.reload = () => {};

    // Freeze history nav
    orig.pushState = history.pushState.bind(history);
    // I am keeping this line here because the surrounding logout.js workflow expects this value or operation before it continues.
    history.pushState = () => {};
    // I am keeping this line here because the surrounding logout.js workflow expects this value or operation before it continues.
    orig.replaceState = history.replaceState.bind(history);
    // I am keeping this line here because the surrounding logout.js workflow expects this value or operation before it continues.
    history.replaceState = () => {};

    // Block user nav, but allow clicks *inside* modal
    document.addEventListener('click', clickBlocker, true);
    // I am connecting this event listener here so the browser can run the nearby handler when that user or page event occurs.
    document.addEventListener('submit', submitBlocker, true);
    // I am connecting this event listener here so the browser can run the nearby handler when that user or page event occurs.
    window.addEventListener('keydown', escBlocker, true);
    // I am connecting this event listener here so the browser can run the nearby handler when that user or page event occurs.
    window.addEventListener('beforeunload', beforeUnloadBlocker, { capture: true });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am keeping `release` as a named helper so the surrounding workflow can call this step when it needs it.
  function release() {
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!active) return;
    // I am keeping this line here because the surrounding logout.js workflow expects this value or operation before it continues.
    active = false;
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logoutLogger.info('NavGuard: Releasing navigation freeze');

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (orig.assign) window.location.assign = orig.assign;
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (orig.replace) window.location.replace = orig.replace;
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (orig.reload) window.location.reload = orig.reload;
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (orig.pushState) history.pushState = orig.pushState;
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (orig.replaceState) history.replaceState = orig.replaceState;

    // I am removing the matching browser listener here so this code does not leave an extra handler behind after cleanup.
    document.removeEventListener('click', clickBlocker, true);
    // I am removing the matching browser listener here so this code does not leave an extra handler behind after cleanup.
    document.removeEventListener('submit', submitBlocker, true);
    // I am removing the matching browser listener here so this code does not leave an extra handler behind after cleanup.
    window.removeEventListener('keydown', escBlocker, true);
    // I am removing the matching browser listener here so this code does not leave an extra handler behind after cleanup.
    window.removeEventListener('beforeunload', beforeUnloadBlocker, { capture: true });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am keeping `clickBlocker` as a named helper so the surrounding workflow can call this step when it needs it.
  function clickBlocker(e) {
    if (inModal(e.target)) return; // let modal buttons work
    // I am saving `el` here so the nearby steps can reuse the same value without rebuilding it each time.
    const el = e.target?.closest?.('a,button,[role="button"],input[type="submit"],area');
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!el) return;
    // I am calling this helper here so the current workflow performs this step before it moves on.
    e.preventDefault();
    // I am calling this helper here so the current workflow performs this step before it moves on.
    e.stopImmediatePropagation();
    // I am calling this helper here so the current workflow performs this step before it moves on.
    e.stopPropagation();
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am keeping `submitBlocker` as a named helper so the surrounding workflow can call this step when it needs it.
  function submitBlocker(e) {
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (inModal(e.target)) return;
    // I am calling this helper here so the current workflow performs this step before it moves on.
    e.preventDefault();
    // I am calling this helper here so the current workflow performs this step before it moves on.
    e.stopImmediatePropagation();
    // I am calling this helper here so the current workflow performs this step before it moves on.
    e.stopPropagation();
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am keeping `escBlocker` as a named helper so the surrounding workflow can call this step when it needs it.
  function escBlocker(e) {
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (inModal(e.target)) return;
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (e.key === 'Escape') {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      e.preventDefault();
      // I am calling this helper here so the current workflow performs this step before it moves on.
      e.stopImmediatePropagation();
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am keeping `beforeUnloadBlocker` as a named helper so the surrounding workflow can call this step when it needs it.
  function beforeUnloadBlocker(e) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    e.preventDefault();
    // I am keeping this line here because the surrounding logout.js workflow expects this value or operation before it continues.
    e.returnValue = '';
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // This return sends the completed value or response back to the code that called this function.
  return { install, release, _orig: orig };
// This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
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
  // I am saving `modal` here so the nearby steps can reuse the same value without rebuilding it each time.
  let modal = document.getElementById('logoutModal');
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!modal) {
    // I am keeping this line here because the surrounding logout.js workflow expects this value or operation before it continues.
    modal = document.createElement('div');
    // I am keeping this line here because the surrounding logout.js workflow expects this value or operation before it continues.
    modal.id = 'logoutModal';
    // I am keeping this line here because the surrounding logout.js workflow expects this value or operation before it continues.
    modal.className = 'modal';
    // I am keeping this line here because the surrounding logout.js workflow expects this value or operation before it continues.
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
    // I am calling this helper here so the current workflow performs this step before it moves on.
    document.body.appendChild(modal);
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // Never rely on any global "notification" handlers
  const titleEl = document.getElementById('logoutModalTitle');
  // I am saving `messageEl` here so the nearby steps can reuse the same value without rebuilding it each time.
  const messageEl = document.getElementById('logoutModalMessage');
  // I am saving `okBtn` here so the nearby steps can reuse the same value without rebuilding it each time.
  const okBtn = document.getElementById('logoutModalOkBtn');

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (titleEl) titleEl.textContent = title;
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (messageEl) messageEl.textContent = message;

  // HARD lock: while open, prevent Esc from closing
  const escBlock = (e) => {
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (e.key === 'Escape') e.stopImmediatePropagation();
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  };
  // I am connecting this event listener here so the browser can run the nearby handler when that user or page event occurs.
  window.addEventListener('keydown', escBlock, { capture: true });

  // I am saving `closeModal` here so the nearby steps can reuse the same value without rebuilding it each time.
  const closeModal = () => {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    modal.classList.remove('show');
    // I am removing the matching browser listener here so this code does not leave an extra handler behind after cleanup.
    okBtn?.removeEventListener('click', closeModal);
    // I am removing the matching browser listener here so this code does not leave an extra handler behind after cleanup.
    window.removeEventListener('keydown', escBlock, { capture: true });
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (onClose) onClose();
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  };

  // I am removing the matching browser listener here so this code does not leave an extra handler behind after cleanup.
  okBtn?.removeEventListener('click', closeModal);
  // I am connecting this event listener here so the browser can run the nearby handler when that user or page event occurs.
  okBtn?.addEventListener('click', closeModal, { once: true });

  // I am calling this helper here so the current workflow performs this step before it moves on.
  modal.classList.add('show');
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/* ===========================
   Logout core
=========================== */
let LOGOUT_IN_FLIGHT = false; // NEW: double-click guard

// I am keeping `performLogout` as a named asynchronous helper so the surrounding workflow can call this step when it needs it.
async function performLogout() {
  // Clear the server cookie, Supabase session, readable cookies, and local browser state.
  // Each layer is cleaned because leaving one behind can make the next visit look signed in.
  if (LOGOUT_IN_FLIGHT) return;
  // I am keeping this line here because the surrounding logout.js workflow expects this value or operation before it continues.
  LOGOUT_IN_FLIGHT = true;

  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // Tell other code to HOLD and freeze nav immediately
    try { localStorage.setItem(LOGOUT_HOLD_KEY, '1'); } catch {}
    // I am calling this helper here so the current workflow performs this step before it moves on.
    NavGuard.install();

    // I am saving `csrf` here so the nearby steps can reuse the same value without rebuilding it each time.
    const csrf = getCsrfToken();

    // 1) Clear HttpOnly cookie with CSRF token
    try {
      // I am waiting for this asynchronous step here so the next line does not use its result before it is ready.
      await fetch('/auth/clear-cookie', {
        // I am keeping the `method` field in this object so the receiving code can read that value by its expected name.
        method: 'POST',
        // I am keeping the `credentials` field in this object so the receiving code can read that value by its expected name.
        credentials: 'include',
        // I am keeping the `headers` field in this object so the receiving code can read that value by its expected name.
        headers: {
          // I am listing this entry here because the surrounding collection processes each allowed value in order.
          'Accept': 'application/json',
          // I am keeping this line here because the surrounding logout.js workflow expects this value or operation before it continues.
          ...(csrf ? { 'X-CSRF-Token': csrf } : {})
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      });
      // I am calling this helper here so the current workflow performs this step before it moves on.
      logoutLogger.info('Server cookie cleared');
    // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
    } catch {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      logoutLogger.warn('Server cookie clear failed; proceeding');
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // 1b) Verify server sees us signed-out (with retry for race conditions)
    try {
      // I am saving `status` here so the nearby steps can reuse the same value without rebuilding it each time.
      let status = await fetch('/api/auth/status', { 
        // I am keeping the `credentials` field in this object so the receiving code can read that value by its expected name.
        credentials: 'include',
        // I am keeping the `headers` field in this object so the receiving code can read that value by its expected name.
        headers: { 'Accept': 'application/json' }
      // I am keeping this line here because the surrounding logout.js workflow expects this value or operation before it continues.
      }).then(r => r.json()).catch(() => null);
      
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (status?.authenticated) {
        // One more attempt (race with proxy/cache)
        logoutLogger.info('Status still authenticated, retrying clear...');
        // I am waiting for this asynchronous step here so the next line does not use its result before it is ready.
        await new Promise(r => setTimeout(r, 150));
        // I am waiting for this asynchronous step here so the next line does not use its result before it is ready.
        await fetch('/auth/clear-cookie', {
          // I am keeping the `method` field in this object so the receiving code can read that value by its expected name.
          method: 'POST',
          // I am keeping the `credentials` field in this object so the receiving code can read that value by its expected name.
          credentials: 'include',
          // I am keeping the `headers` field in this object so the receiving code can read that value by its expected name.
          headers: {
            // I am listing this entry here because the surrounding collection processes each allowed value in order.
            'Accept': 'application/json',
            // I am keeping this line here because the surrounding logout.js workflow expects this value or operation before it continues.
            ...(csrf ? { 'X-CSRF-Token': csrf } : {})
          // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
          }
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        });
        // I am waiting for this asynchronous step here so the next line does not use its result before it is ready.
        status = await fetch('/api/auth/status', { 
          // I am keeping the `credentials` field in this object so the receiving code can read that value by its expected name.
          credentials: 'include',
          // I am keeping the `headers` field in this object so the receiving code can read that value by its expected name.
          headers: { 'Accept': 'application/json' }
        // I am keeping this line here because the surrounding logout.js workflow expects this value or operation before it continues.
        }).then(r => r.json()).catch(() => null);
        
        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (status?.authenticated) {
          // Fallback: try clear-all variant
          logoutLogger.warn('Status still authenticated after retry, trying clear-all...');
          // I am waiting for this asynchronous step here so the next line does not use its result before it is ready.
          await fetch('/auth/clear-cookie?all=1', {
            // I am keeping the `method` field in this object so the receiving code can read that value by its expected name.
            method: 'POST',
            // I am keeping the `credentials` field in this object so the receiving code can read that value by its expected name.
            credentials: 'include',
            // I am keeping the `headers` field in this object so the receiving code can read that value by its expected name.
            headers: {
              // I am listing this entry here because the surrounding collection processes each allowed value in order.
              'Accept': 'application/json',
              // I am keeping this line here because the surrounding logout.js workflow expects this value or operation before it continues.
              ...(csrf ? { 'X-CSRF-Token': csrf } : {})
            // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
            }
          // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
          });
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
    } catch (e) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      logoutLogger.warn('Status verification failed (non-fatal)', { error: e?.message || String(e) });
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // 2) Supabase signOut (use the shared singleton)
    try {
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (window.SB?.auth?.signOut) {
        // I am waiting for this asynchronous step here so the next line does not use its result before it is ready.
        await window.SB.auth.signOut();
        // I am calling this helper here so the current workflow performs this step before it moves on.
        logoutLogger.info('Supabase session cleared');
      // I am checking this next possibility only because the earlier condition did not choose its path.
      } else if (window.supabase?.auth?.signOut) {
        // legacy fallback if a client was stashed there
        await window.supabase.auth.signOut();
        // I am calling this helper here so the current workflow performs this step before it moves on.
        logoutLogger.info('Supabase session cleared (legacy ref)');
      // This alternative runs only when the condition above did not use its first path.
      } else {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        logoutLogger.warn('No Supabase client available to sign out');
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
    } catch (e) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      logoutLogger.info('Supabase signOut exception (non-fatal)', { error: e?.message || String(e) });
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // 2b) Explicitly remove all Supabase localStorage keys as safety net
    try {
      // I am saving `keysToRemove` here so the nearby steps can reuse the same value without rebuilding it each time.
      const keysToRemove = [];
      // I am repeating the next block one item at a time so every value in the existing collection receives the same handling.
      for (let i = 0; i < localStorage.length; i++) {
        // I am saving `key` here so the nearby steps can reuse the same value without rebuilding it each time.
        const key = localStorage.key(i);
        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (key && (key.startsWith('sb-') || key.includes('supabase'))) {
          // I am calling this helper here so the current workflow performs this step before it moves on.
          keysToRemove.push(key);
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
      // I am defining this small callback here so the surrounding API can run it with the value it supplies.
      keysToRemove.forEach(key => {
        // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
        try {
          // I am calling this helper here so the current workflow performs this step before it moves on.
          localStorage.removeItem(key);
        // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
        } catch {}
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      });
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (keysToRemove.length > 0) {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        logoutLogger.info('Explicitly cleared Supabase localStorage keys:', keysToRemove);
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
    } catch (e) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      logoutLogger.info('Failed to clear Supabase localStorage (non-fatal)', { error: e?.message || String(e) });
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // 3) Clear JS cookies & storage (keep HOLD in localStorage)
    // Note: Server already clears sb-access-token and sb_session via /auth/clear-cookie
    // Only clear client-side refresh token if needed
    document.cookie = 'sb-refresh-token=; Path=/; Max-Age=0; SameSite=Lax';
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logoutLogger.info('JS cookies cleared');

    // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
    try {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      sessionStorage.clear();
    } catch { /* ignore */ }

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (window.caches?.keys) {
      // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
      try {
        // I am saving `ks` here so the nearby steps can reuse the same value without rebuilding it each time.
        const ks = await caches.keys();
        // I am waiting for this asynchronous step here so the next line does not use its result before it is ready.
        await Promise.all(ks.map(c => caches.delete(c)));
        // I am calling this helper here so the current workflow performs this step before it moves on.
        logoutLogger.info('CacheStorage cleared');
      } catch { /* ignore */ }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
    try {
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (navigator.credentials?.preventSilentAccess) {
        // I am waiting for this asynchronous step here so the next line does not use its result before it is ready.
        await navigator.credentials.preventSilentAccess();
        // I am calling this helper here so the current workflow performs this step before it moves on.
        logoutLogger.info('preventSilentAccess invoked');
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    } catch { /* ignore */ }

    // 4) Set flash flag and redirect (modal shown on next page)
    try { sessionStorage.setItem('logout.flash', '1'); } catch (_) {}
    
    // Release guard and navigate (KEEP HOLD active - main.js will clear it)
    NavGuard.release();
    // I am keeping this line here because the surrounding logout.js workflow expects this value or operation before it continues.
    (NavGuard._orig.replace || window.location.replace).call(window.location, '/');

  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (err) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logoutLogger.error('Logout error', { msg: err?.message || String(err) });
    // Still redirect even on error - let user retry
    try { sessionStorage.setItem('logout.flash', '1'); } catch (_) {}
    // I am calling this helper here so the current workflow performs this step before it moves on.
    NavGuard.release();
    // I am keeping this line here because the surrounding logout.js workflow expects this value or operation before it continues.
    (NavGuard._orig.replace || window.location.replace).call(window.location, '/');
  // This final block runs after success or failure so the shared cleanup still happens in either outcome.
  } finally {
    // I am keeping this line here because the surrounding logout.js workflow expects this value or operation before it continues.
    LOGOUT_IN_FLIGHT = false;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `handleLogout` as a named asynchronous helper so the surrounding workflow can call this step when it needs it.
async function handleLogout() {
  // Keep every logout entry point on one serialized path so repeated clicks do not launch
  // overlapping cleanup requests or competing redirects.
  logoutLogger.info('handleLogout called');
  // I am waiting for this asynchronous step here so the next line does not use its result before it is ready.
  await performLogout();
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `attachLogoutHandler` as a named helper so the surrounding workflow can call this step when it needs it.
function attachLogoutHandler(selector = '#logoutBtn') {
  // I am saving `btn` here so the nearby steps can reuse the same value without rebuilding it each time.
  const btn = document.querySelector(selector);
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (btn) {
    // I am removing the matching browser listener here so this code does not leave an extra handler behind after cleanup.
    btn.removeEventListener('click', handleLogout);
    // I am connecting this event listener here so the browser can run the nearby handler when that user or page event occurs.
    btn.addEventListener('click', handleLogout, { passive: true });
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logoutLogger.info('Logout handler attached', { selector });
    // This return sends the completed value or response back to the code that called this function.
    return true;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
  // I am calling this helper here so the current workflow performs this step before it moves on.
  logoutLogger.info('Logout button not found (ok on pages without it)', { selector });
  // This return sends the completed value or response back to the code that called this function.
  return false;
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
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
  // I am saving `LOGOUT_PATH` here so the nearby steps can reuse the same value without rebuilding it each time.
  const LOGOUT_PATH = '/auth/clear-cookie';
  const CSL = '[logout]'; // console log tag

  // I am keeping `getSB` as a named helper so the surrounding workflow can call this step when it needs it.
  function getSB() {
    // This return sends the completed value or response back to the code that called this function.
    return (window.sb && window.sb.auth && window.sb) ||
           // I am keeping this line here because the surrounding logout.js workflow expects this value or operation before it continues.
           (window.supabase && window.supabase.auth && window.supabase) ||
           // I am keeping this line here because the surrounding logout.js workflow expects this value or operation before it continues.
           (window.SB && window.SB.auth && window.SB) ||
           // I am keeping this line here because the surrounding logout.js workflow expects this value or operation before it continues.
           null;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am keeping `getCsrf` as a named helper so the surrounding workflow can call this step when it needs it.
  function getCsrf(el) {
    // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
    try {
      // I am saving `form` here so the nearby steps can reuse the same value without rebuilding it each time.
      const form = el && el.closest && el.closest('form');
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (form) {
        // I am saving `hid` here so the nearby steps can reuse the same value without rebuilding it each time.
        const hid = form.querySelector('input[name="_csrf"]');
        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (hid && hid.value) return hid.value;
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
      // I am saving `meta` here so the nearby steps can reuse the same value without rebuilding it each time.
      const meta = document.querySelector('meta[name="csrf-token"]');
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (meta) return meta.getAttribute('content');
    // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
    } catch (_) {}
    // This return sends the completed value or response back to the code that called this function.
    return undefined;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am keeping `doLogout` as a named asynchronous helper so the surrounding workflow can call this step when it needs it.
  async function doLogout(triggerEl) {
    // Mark intent so boot-time code won't re-set cookie
    try { 
      // I am calling this helper here so the current workflow performs this step before it moves on.
      sessionStorage.setItem('justLoggedOut', '1'); 
      // I am calling this helper here so the current workflow performs this step before it moves on.
      localStorage.setItem('logout.ui.hold', '1');
    // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
    } catch (_) {}
    // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
    try { 
      // I am keeping this line here because the surrounding logout.js workflow expects this value or operation before it continues.
      document.cookie = 'auth_logout=1; Path=/; Max-Age=10; SameSite=Lax'; 
    // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
    } catch (_) {}

    // Best-effort Supabase sign out FIRST (so there's no client session to re-hydrate)
    try {
      // I am saving `sb` here so the nearby steps can reuse the same value without rebuilding it each time.
      const sb = getSB();
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (sb && sb.auth && typeof sb.auth.signOut === 'function') {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        console.debug(CSL, 'signOut()…');
        await sb.auth.signOut(); // Removes local session + revokes refresh
        // I am calling this helper here so the current workflow performs this step before it moves on.
        console.debug(CSL, 'signOut completed');
      // This alternative runs only when the condition above did not use its first path.
      } else {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        console.debug(CSL, 'no sb client available');
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
    } catch (e) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      console.warn(CSL, 'signOut error', e);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // Clear server cookies with CSRF token
    const csrf = getCsrf(triggerEl);
    // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
    try {
      // I am saving `res` here so the nearby steps can reuse the same value without rebuilding it each time.
      const res = await fetch(LOGOUT_PATH, {
        // I am keeping the `method` field in this object so the receiving code can read that value by its expected name.
        method: 'POST',
        // I am keeping the `headers` field in this object so the receiving code can read that value by its expected name.
        headers: Object.assign(
          // I am keeping this line here because the surrounding logout.js workflow expects this value or operation before it continues.
          { 'Accept': 'application/json', 'X-Requested-With': 'fetch' },
          // I am keeping this line here because the surrounding logout.js workflow expects this value or operation before it continues.
          csrf ? { 'X-CSRF-Token': csrf } : {}
        // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
        ),
        // I am keeping the `credentials` field in this object so the receiving code can read that value by its expected name.
        credentials: 'include'
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      });
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (!res.ok && res.status !== 204) {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        console.warn(CSL, 'clear-cookie failed', res.status);
      // This alternative runs only when the condition above did not use its first path.
      } else {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        console.debug(CSL, 'server cookie cleared');
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
    } catch (e) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      console.warn(CSL, 'clear-cookie fetch error', e);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // Verify server sees us signed-out (with retry for race conditions)
    try {
      // I am saving `status` here so the nearby steps can reuse the same value without rebuilding it each time.
      let status = await fetch('/api/auth/status', { 
        // I am keeping the `credentials` field in this object so the receiving code can read that value by its expected name.
        credentials: 'include',
        // I am keeping the `headers` field in this object so the receiving code can read that value by its expected name.
        headers: { 'Accept': 'application/json' }
      // I am keeping this line here because the surrounding logout.js workflow expects this value or operation before it continues.
      }).then(r => r.json()).catch(() => null);
      
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (status?.authenticated) {
        // One more attempt (race with proxy/cache)
        console.debug(CSL, 'status still authenticated, retrying clear...');
        // I am waiting for this asynchronous step here so the next line does not use its result before it is ready.
        await new Promise(r => setTimeout(r, 150));
        // I am waiting for this asynchronous step here so the next line does not use its result before it is ready.
        await fetch(LOGOUT_PATH, {
          // I am keeping the `method` field in this object so the receiving code can read that value by its expected name.
          method: 'POST',
          // I am keeping the `credentials` field in this object so the receiving code can read that value by its expected name.
          credentials: 'include',
          // I am keeping the `headers` field in this object so the receiving code can read that value by its expected name.
          headers: Object.assign(
            // I am keeping this line here because the surrounding logout.js workflow expects this value or operation before it continues.
            { 'Accept': 'application/json', 'X-Requested-With': 'fetch' },
            // I am keeping this line here because the surrounding logout.js workflow expects this value or operation before it continues.
            csrf ? { 'X-CSRF-Token': csrf } : {}
          // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
          )
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        });
        // I am waiting for this asynchronous step here so the next line does not use its result before it is ready.
        status = await fetch('/api/auth/status', { 
          // I am keeping the `credentials` field in this object so the receiving code can read that value by its expected name.
          credentials: 'include',
          // I am keeping the `headers` field in this object so the receiving code can read that value by its expected name.
          headers: { 'Accept': 'application/json' }
        // I am keeping this line here because the surrounding logout.js workflow expects this value or operation before it continues.
        }).then(r => r.json()).catch(() => null);
        
        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (status?.authenticated) {
          // Fallback: try clear-all variant
          console.warn(CSL, 'status still authenticated after retry, trying clear-all...');
          // I am waiting for this asynchronous step here so the next line does not use its result before it is ready.
          await fetch(`${LOGOUT_PATH}?all=1`, {
            // I am keeping the `method` field in this object so the receiving code can read that value by its expected name.
            method: 'POST',
            // I am keeping the `credentials` field in this object so the receiving code can read that value by its expected name.
            credentials: 'include',
            // I am keeping the `headers` field in this object so the receiving code can read that value by its expected name.
            headers: Object.assign(
              // I am keeping this line here because the surrounding logout.js workflow expects this value or operation before it continues.
              { 'Accept': 'application/json', 'X-Requested-With': 'fetch' },
              // I am keeping this line here because the surrounding logout.js workflow expects this value or operation before it continues.
              csrf ? { 'X-CSRF-Token': csrf } : {}
            // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
            )
          // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
          });
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
    } catch (e) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      console.warn(CSL, 'status verification failed (non-fatal)', e);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // Set flash flag for modal on next page load
    try { sessionStorage.setItem('logout.flash', '1'); } catch (_) {}

    // Land on public home (server will 303 here too if we hit it by form)
    window.location.replace('/');
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am keeping `isLogoutButton` as a named helper so the surrounding workflow can call this step when it needs it.
  function isLogoutButton(target) {
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!target) return false;
    // I am saving `btn` here so the nearby steps can reuse the same value without rebuilding it each time.
    const btn = target.closest && target.closest('button,[role="button"],a');
    // I am saving `form` here so the nearby steps can reuse the same value without rebuilding it each time.
    const form = target.closest && target.closest('form');
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (btn && btn.hasAttribute('data-logout')) return true;
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (form && form.getAttribute && typeof form.getAttribute === 'function') {
      // I am saving `action` here so the nearby steps can reuse the same value without rebuilding it each time.
      const action = form.getAttribute('action') || '';
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (action.endsWith(LOGOUT_PATH)) return true;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    // This return sends the completed value or response back to the code that called this function.
    return false;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // Capture both click and submit so we win races with native navigation
  document.addEventListener('click', function (e) {
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!isLogoutButton(e.target)) return;
    // I am calling this helper here so the current workflow performs this step before it moves on.
    e.preventDefault();
    // I am calling this helper here so the current workflow performs this step before it moves on.
    e.stopPropagation();
    // I am calling this helper here so the current workflow performs this step before it moves on.
    console.debug(CSL, 'logout click intercepted');
    // I am calling this helper here so the current workflow performs this step before it moves on.
    doLogout(e.target);
  // I am keeping this line here because the surrounding logout.js workflow expects this value or operation before it continues.
  }, true);

  // I am connecting this event listener here so the browser can run the nearby handler when that user or page event occurs.
  document.addEventListener('submit', function (e) {
    // I am saving `form` here so the nearby steps can reuse the same value without rebuilding it each time.
    const form = e.target;
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!form) return;
    // I am saving `action` here so the nearby steps can reuse the same value without rebuilding it each time.
    const action = (form.getAttribute && form.getAttribute('action')) || '';
    // I am saving `containsLogoutBtn` here so the nearby steps can reuse the same value without rebuilding it each time.
    const containsLogoutBtn = !!(form.querySelector && form.querySelector('[data-logout]'));
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!action.endsWith(LOGOUT_PATH) && !containsLogoutBtn) return;
    // I am calling this helper here so the current workflow performs this step before it moves on.
    e.preventDefault();
    // I am calling this helper here so the current workflow performs this step before it moves on.
    e.stopPropagation();
    // I am calling this helper here so the current workflow performs this step before it moves on.
    console.debug(CSL, 'logout form submit intercepted');
    // I am calling this helper here so the current workflow performs this step before it moves on.
    doLogout(form);
  // I am keeping this line here because the surrounding logout.js workflow expects this value or operation before it continues.
  }, true);
// This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
})();

// I am keeping `initializeLogout` as a named helper so the surrounding workflow can call this step when it needs it.
function initializeLogout() {
  // I am calling this helper here so the current workflow performs this step before it moves on.
  logoutLogger.info('Initializing logout');
  // I am calling this helper here so the current workflow performs this step before it moves on.
  attachLogoutHandler('#logoutBtn');
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// This check helps me choose or stop the next path before any work that depends on this condition runs.
if (document.readyState === 'loading') {
  // I am connecting this event listener here so the browser can run the nearby handler when that user or page event occurs.
  document.addEventListener('DOMContentLoaded', initializeLogout, { once: true });
// This alternative runs only when the condition above did not use its first path.
} else {
  // I am calling this helper here so the current workflow performs this step before it moves on.
  initializeLogout();
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping this line here because the surrounding logout.js workflow expects this value or operation before it continues.
window.LogoutModule = {
  // I am keeping this line here because the surrounding logout.js workflow expects this value or operation before it continues.
  handleLogout,
  // I am keeping this line here because the surrounding logout.js workflow expects this value or operation before it continues.
  attachLogoutHandler,
  // I am keeping this line here because the surrounding logout.js workflow expects this value or operation before it continues.
  initializeLogout,
  // I am keeping this line here because the surrounding logout.js workflow expects this value or operation before it continues.
  performLogout,
  showLogoutModal // Unique, namespaced modal for logout
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
};
// I am keeping this line here because the surrounding logout.js workflow expects this value or operation before it continues.
window.reattachLogoutHandler = function (selector='#logoutBtn') {
  // I am calling this helper here so the current workflow performs this step before it moves on.
  logoutLogger.info('Re-attaching logout handler');
  // This return sends the completed value or response back to the code that called this function.
  return attachLogoutHandler(selector);
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
};