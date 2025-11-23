/**
 * File: server/public/js/sbClient.js
 * Description: Shared Supabase client singleton with ready event
 * Purpose: Single source of truth for Supabase client across all pages
 * Notes: Waits for DOM and library, emits sb-ready event when initialized
 */

(function initSharedSupabase() {
  if (window.SB) return;

  function tryInit() {
    try {
      if (!window.supabase?.createClient) {
        console.error('[SB] supabase-js not loaded yet');
        return false;
      }
      const cfg = document.getElementById('app-config');
      const url = cfg?.dataset?.supabaseUrl;
      const key = cfg?.dataset?.supabaseAnonKey;
      if (!url || !key) {
        console.error('[SB] Missing Supabase config in app-config element');
        return false;
      }
      window.SB = window.supabase.createClient(url, key);
      document.dispatchEvent(new Event('sb-ready'));
      if (localStorage.getItem('debugAuth') === '1') {
        console.log('[SB] Shared Supabase client initialized');
      }
      return true;
    } catch (e) {
      console.error('[SB] init error', e);
      return false;
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryInit, { once: true });
  } else {
    tryInit();
  }
})();