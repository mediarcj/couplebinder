/**
 * File: server/public/js/sbClient.js
 * Description: Shared Supabase client singleton with ready event
 * Purpose: Single source of truth for Supabase client across all pages
 * Notes: Waits for DOM and library, emits sb-ready event when initialized
 */

(function initSharedSupabase() {
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (window.SB) return;

  // I am keeping `tryInit` as a named helper so the surrounding workflow can call this step when it needs it.
  function tryInit() {
    // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
    try {
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (!window.supabase?.createClient) {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        console.error('[SB] supabase-js not loaded yet');
        // This return sends the completed value or response back to the code that called this function.
        return false;
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
      // I am saving `cfg` here so the nearby steps can reuse the same value without rebuilding it each time.
      const cfg = document.getElementById('app-config');
      // I am saving `url` here so the nearby steps can reuse the same value without rebuilding it each time.
      const url = cfg?.dataset?.supabaseUrl;
      // I am saving `key` here so the nearby steps can reuse the same value without rebuilding it each time.
      const key = cfg?.dataset?.supabaseAnonKey;
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (!url || !key) {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        console.error('[SB] Missing Supabase config in app-config element');
        // This return sends the completed value or response back to the code that called this function.
        return false;
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
      // I am keeping this line here because the surrounding sbClient.js workflow expects this value or operation before it continues.
      window.SB = window.supabase.createClient(url, key);
      // I am calling this helper here so the current workflow performs this step before it moves on.
      document.dispatchEvent(new Event('sb-ready'));
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (localStorage.getItem('debugAuth') === '1') {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        console.log('[SB] Shared Supabase client initialized');
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
      // This return sends the completed value or response back to the code that called this function.
      return true;
    // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
    } catch (e) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      console.error('[SB] init error', e);
      // This return sends the completed value or response back to the code that called this function.
      return false;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (document.readyState === 'loading') {
    // I am connecting this event listener here so the browser can run the nearby handler when that user or page event occurs.
    document.addEventListener('DOMContentLoaded', tryInit, { once: true });
  // This alternative runs only when the condition above did not use its first path.
  } else {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    tryInit();
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
})();