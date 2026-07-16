// File: server/utils/supabaseClient.js
// Purpose: Centralized Supabase clients (anon + service role) for server-side use
// Notes:
//  - Reads from central config first; env vars are last-resort fallback.
//  - Never logs secrets. If keys are missing, exports null clients.
//  - In test, exports tiny stubs so code paths don't hit the network.

/**
 * WHAT:
 * Supabase client factory that prefers the centralized config object but can fall back to process.env.
 * 
 * WHY:
 * This module may be imported very early in the boot process or in tools/tests where the config module
 * is not guaranteed to be initialized. The fallback ensures the client can still be created safely.
 * This is an intentional exception to the "no process.env in runtime code" rule.
 * 
 * HOW:
 * Try to read from config.supabase / config.branding first; if config is missing or partial,
 * fall back to process.env.SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY / APP_VERSION.
 * This dual pattern provides safety during early boot and in edge cases where config may not be available.
 */

'use strict';

// I am saving `isTest` here so the nearby steps can reuse the same value without rebuilding it each time.
const isTest = process.env.NODE_ENV === 'test';

// This check helps me choose or stop the next path before any work that depends on this condition runs.
if (isTest) {
  // Minimal stubs for unit/integration tests
  const supabase = {
    // I am keeping the `auth` field in this object so the receiving code can read that value by its expected name.
    auth: {
      // I am keeping the `getUser` field in this object so the receiving code can read that value by its expected name.
      getUser: async () => ({ data: { user: null }, error: null }),
      // I am keeping the `updateUser` field in this object so the receiving code can read that value by its expected name.
      updateUser: async () => ({ data: { user: null }, error: null })
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    },
    // I am keeping the `from` field in this object so the receiving code can read that value by its expected name.
    from: () => ({
      // I am keeping the `select` field in this object so the receiving code can read that value by its expected name.
      select: async () => ({ data: [], error: null }),
      // I am keeping the `insert` field in this object so the receiving code can read that value by its expected name.
      insert: async () => ({ data: [], error: null }),
      // I am keeping the `update` field in this object so the receiving code can read that value by its expected name.
      update: async () => ({ data: [], error: null }),
      // I am keeping the `upsert` field in this object so the receiving code can read that value by its expected name.
      upsert: async () => ({ data: [], error: null })
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    })
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  };

  // I am saving `supabaseAdmin` here so the nearby steps can reuse the same value without rebuilding it each time.
  const supabaseAdmin = {
    // I am keeping the `auth` field in this object so the receiving code can read that value by its expected name.
    auth: {
      // I am keeping the `admin` field in this object so the receiving code can read that value by its expected name.
      admin: {
        // I am keeping the `getUserById` field in this object so the receiving code can read that value by its expected name.
        getUserById: async (id) => ({ data: { user: { id } }, error: null }),
        // I am keeping the `updateUserById` field in this object so the receiving code can read that value by its expected name.
        updateUserById: async (id, payload) => ({ data: { user: { id, ...payload } }, error: null })
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    },
    // I am keeping the `from` field in this object so the receiving code can read that value by its expected name.
    from: () => ({
      // I am keeping the `select` field in this object so the receiving code can read that value by its expected name.
      select: async () => ({ data: [], error: null }),
      // I am keeping the `insert` field in this object so the receiving code can read that value by its expected name.
      insert: async () => ({ data: [], error: null }),
      // I am keeping the `update` field in this object so the receiving code can read that value by its expected name.
      update: async () => ({ data: [], error: null }),
      // I am keeping the `upsert` field in this object so the receiving code can read that value by its expected name.
      upsert: async () => ({ data: [], error: null })
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    })
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  };

  // I am exporting this value here so another module can deliberately reuse the completed piece from supabaseClient.js.
  module.exports = { supabase, supabaseAdmin };
// This alternative runs only when the condition above did not use its first path.
} else {
  // I am loading `@supabase/supabase-js` into `createClient` so this file can reuse that dependency below.
  const { createClient } = require('@supabase/supabase-js');

  // Prefer central config (loads .env early inside config/index.js)
  let cfg;
  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // I am keeping this line here because the surrounding supabaseClient.js workflow expects this value or operation before it continues.
    ({ config: cfg } = require('../config'));
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch {
    // I am keeping this line here because the surrounding supabaseClient.js workflow expects this value or operation before it continues.
    cfg = undefined;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am saving `url` here so the nearby steps can reuse the same value without rebuilding it each time.
  const url =  (cfg && cfg.supabase && cfg.supabase.url)            || process.env.SUPABASE_URL || '';
  // I am saving `anon` here so the nearby steps can reuse the same value without rebuilding it each time.
  const anon = (cfg && cfg.supabase && cfg.supabase.anonKey)        || process.env.SUPABASE_ANON_KEY || '';
  // I am saving `svc` here so the nearby steps can reuse the same value without rebuilding it each time.
  const svc  = (cfg && cfg.supabase && cfg.supabase.serviceRoleKey) || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  // I am saving `xClientInfo` here so the nearby steps can reuse the same value without rebuilding it each time.
  const xClientInfo =
    // I am keeping this line here because the surrounding supabaseClient.js workflow expects this value or operation before it continues.
    (cfg && cfg.branding && cfg.branding.xClientInfo) ||
    // I am keeping this line here because the surrounding supabaseClient.js workflow expects this value or operation before it continues.
    `app-server/${(cfg && cfg.branding && cfg.branding.appVersion) || process.env.APP_VERSION || 'dev'}`;

  // I am saving `baseOptions` here so the nearby steps can reuse the same value without rebuilding it each time.
  const baseOptions = {
    // I am keeping the `auth` field in this object so the receiving code can read that value by its expected name.
    auth: { persistSession: false, autoRefreshToken: false },
    // I am keeping the `global` field in this object so the receiving code can read that value by its expected name.
    global: { headers: { 'X-Client-Info': String(xClientInfo) } }
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  };

  // Quiet, one-time warning without leaking secrets
  let warned = false;
  // I am loading `./logger` into `logger` so this file can reuse that dependency below.
  const logger = require('./logger');
  // I am keeping `warnOnce` as a named helper so the surrounding workflow can call this step when it needs it.
  function warnOnce(msg) {
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (warned) return;
    // I am keeping this line here because the surrounding supabaseClient.js workflow expects this value or operation before it continues.
    warned = true;
    // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
    try {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      logger.warn({
        // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
        event: 'supabase.client.missing_config'
      // I am keeping this line here because the surrounding supabaseClient.js workflow expects this value or operation before it continues.
      }, msg);
    // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
    } catch (_) {}
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am saving `supabase` here so the nearby steps can reuse the same value without rebuilding it each time.
  const supabase =
    // I am keeping this line here because the surrounding supabaseClient.js workflow expects this value or operation before it continues.
    (url && anon) ? createClient(url, anon, baseOptions)
                  // I am keeping this line here because the surrounding supabaseClient.js workflow expects this value or operation before it continues.
                  : (warnOnce('[supabaseClient] Missing SUPABASE_URL or SUPABASE_ANON_KEY; exporting supabase=null'), null);

  // I am saving `supabaseAdmin` here so the nearby steps can reuse the same value without rebuilding it each time.
  const supabaseAdmin =
    // I am keeping this line here because the surrounding supabaseClient.js workflow expects this value or operation before it continues.
    (url && svc) ? createClient(url, svc, baseOptions)
                 // I am keeping this line here because the surrounding supabaseClient.js workflow expects this value or operation before it continues.
                 : (warnOnce('[supabaseClient] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY; exporting supabaseAdmin=null'), null);

  // I am exporting this value here so another module can deliberately reuse the completed piece from supabaseClient.js.
  module.exports = { supabase, supabaseAdmin };
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}