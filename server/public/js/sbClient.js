/**
 * File: server/public/js/sbClient.js
 * Description: Shared Supabase client singleton with ready event
 * Purpose: Single source of truth for Supabase client across all pages
 * Notes: Waits for DOM and library, emits sb-ready event when initialized
 */

/**
 * WHAT:
 * Creates a single shared Supabase client instance (window.SB) and emits ready event.
 *
 * WHY:
 * Multiple client instances cause logout bugs. Production needs guaranteed
 * initialization after DOM and library are ready.
 *
 * HOW:
 * Wait for DOM ready, verify library loaded, read config from meta tag,
 * create singleton, emit sb-ready event for downstream code to wait on.
 */

(function initSharedSupabase() {
  if (window.SB) return;

  function tryInit() {
    try {
      // Check if library is loaded
      if (!window.supabase?.createClient) {
        console.error('[SB] supabase-js not loaded yet');
        return false;
      }
      
      // Get configuration from meta tag (in <head>, always present)
      const cfg = document.getElementById('app-config');
      const url = cfg?.dataset?.supabaseUrl;
      const key = cfg?.dataset?.supabaseAnonKey;

      if (!url || !key) {
        console.error('[SB] Missing Supabase config in app-config element');
        return false;
      }
      
      // Create shared singleton
      window.SB = window.supabase.createClient(url, key);
      
      // Emit ready event for downstream code
      document.dispatchEvent(new Event('sb-ready'));
      
      // Silent success (debug mode only)
      if (localStorage.getItem('debugAuth') === '1') {
        console.log('[SB] Shared Supabase client initialized');
      }
      
      return true;
    } catch (e) {
      console.error('[SB] init error', e);
      return false;
    }
  }

  // Wait for DOM ready before accessing app-config element
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryInit, { once: true });
  } else {
    tryInit();
  }
})();
