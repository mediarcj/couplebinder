'use strict';

(function protectedShell() {
  let navigating = false;

  function beginNavigation() {
    if (navigating) return;
    navigating = true;
    document.documentElement.classList.add('navigation-pending');
  }

  function isNormalInternalNavigation(event, link) {
    if (!link || event.defaultPrevented || event.button !== 0) return false;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
    if (link.target && link.target !== '_self') return false;
    if (link.hasAttribute('download')) return false;

    const url = new URL(link.href, window.location.href);
    if (url.origin !== window.location.origin) return false;
    if (url.pathname === window.location.pathname && url.search === window.location.search && url.hash) {
      return false;
    }
    return true;
  }

  document.addEventListener('click', (event) => {
    const link = event.target?.closest?.('a[href]');
    if (isNormalInternalNavigation(event, link)) beginNavigation();
  }, true);

  document.addEventListener('submit', (event) => {
    const form = event.target;
    if (!form || form.matches?.('[action="/auth/clear-cookie"]')) return;
    beginNavigation();
  }, true);

  let logoutInFlight = false;
  document.addEventListener('submit', async (event) => {
    const form = event.target;
    if (!form?.matches?.('[action="/auth/clear-cookie"]')) return;
    event.preventDefault();
    if (logoutInFlight) return;
    logoutInFlight = true;
    beginNavigation();

    const csrf = form.querySelector('input[name="_csrf"]')?.value ||
      document.querySelector('meta[name="csrf-token"]')?.content || '';

    try {
      const response = await fetch('/auth/clear-cookie', {
        method: 'POST',
        credentials: 'include',
        headers: {
          Accept: 'application/json',
          ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
        },
      });
      if (!response.ok) throw new Error('Server logout rejected');
    } catch {
      logoutInFlight = false;
      navigating = false;
      document.documentElement.classList.remove('navigation-pending');
      form.submit();
      return;
    }

    try {
      if (window.SB?.auth?.signOut) await window.SB.auth.signOut();
    } catch {
      // The server cookie clear and watermark are already authoritative.
    }

    try {
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith('sb-') || key.includes('supabase')) localStorage.removeItem(key);
      }
      const channel = new BroadcastChannel('auth');
      channel.postMessage({ type: 'LOGOUT' });
      channel.close();
    } catch {
      // Browser storage and BroadcastChannel are optional.
    }

    window.location.replace('/');
  }, true);

  window.addEventListener('pageshow', async (event) => {
    navigating = false;
    document.documentElement.classList.remove('navigation-pending');

    if (!event.persisted) return;
    try {
      const response = await fetch('/api/auth/status', {
        credentials: 'include',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });
      const status = await response.json();
      if (!status?.authenticated) window.location.replace('/login');
    } catch {
      // A failed status check must not expose new data or mutate server state.
    }
  });

  function attachAuthLifecycle(client) {
    if (!client?.auth?.onAuthStateChange) return;

    client.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT') {
        if (!logoutInFlight) window.location.replace('/');
        return;
      }
      if (event !== 'TOKEN_REFRESHED' || !session?.access_token) return;

      try {
        await fetch('/auth/set-cookie', {
          method: 'POST',
          credentials: 'include',
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
        });
      } catch {
        // The current verified cookie remains authoritative until its own expiry.
      }
    });
  }

  if (window.SB) attachAuthLifecycle(window.SB);
  else window.addEventListener('sb-ready', () => attachAuthLifecycle(window.SB), { once: true });

  try {
    const channel = new BroadcastChannel('auth');
    channel.onmessage = (event) => {
      if (event?.data?.type === 'LOGOUT') window.location.replace('/');
    };
  } catch {
    // BroadcastChannel is an optional enhancement.
  }
})();
