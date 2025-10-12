/**
 * File: server/public/js/sbClient.js
 * Description: Shared Supabase client singleton
 * Purpose: Single source of truth for Supabase client across all pages
 * Notes: Prevents multiple client instances and logout inconsistencies
 */

/**
 * WHAT:
 * Creates a single shared Supabase client instance (window.SB).
 *
 * WHY:
 * Multiple client instances cause logout bugs where signing out one instance
 * doesn't affect others. This creates a race where logout → home re-login happens.
 *
 * HOW:
 * Initialize once after DOM ready, read config from app-config div, store in window.SB.
 * All pages (main.js, dashboard.js, profile-edit.js, logout.js) use this.
 */

(function() {
  function initializeSharedSupabaseClient() {
    // Already initialized
    if (window.SB) {
      return;
    }
    
    // Get configuration from server-injected data
    const config = document.getElementById('app-config');
    const supabaseUrl = config?.dataset?.supabaseUrl;
    const supabaseAnonKey = config?.dataset?.supabaseAnonKey;
    
    // Validation
    if (!supabaseUrl || !supabaseAnonKey) {
      console.error('[SB] Missing Supabase config in app-config element');
      return;
    }
    
    if (!window.supabase?.createClient) {
      console.error('[SB] Supabase library not loaded');
      return;
    }
    
    // Create shared singleton
    window.SB = window.supabase.createClient(supabaseUrl, supabaseAnonKey);
    
    // Silent success (no PII in logs)
    if (localStorage.getItem('debugAuth') === '1') {
      console.log('[SB] Shared Supabase client initialized');
    }
  }
  
  // Wait for DOM ready before accessing app-config element
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeSharedSupabaseClient, { once: true });
  } else {
    initializeSharedSupabaseClient();
  }
})();

