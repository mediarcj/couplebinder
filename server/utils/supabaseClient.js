// File: server/utils/supabaseClient.js
// Purpose: Centralized Supabase clients (anon + service role) for server-side use
// Notes:
//  - Reads from central config first; env vars are last-resort fallback.
//  - Never logs secrets. If keys are missing, exports null clients.
//  - In test, exports tiny stubs so code paths don't hit the network.

'use strict';

const isTest = process.env.NODE_ENV === 'test';

if (isTest) {
  // Minimal stubs for unit/integration tests
  const supabase = {
    auth: {
      getUser: async () => ({ data: { user: null }, error: null }),
      updateUser: async () => ({ data: { user: null }, error: null })
    },
    from: () => ({
      select: async () => ({ data: [], error: null }),
      insert: async () => ({ data: [], error: null }),
      update: async () => ({ data: [], error: null }),
      upsert: async () => ({ data: [], error: null })
    })
  };

  const supabaseAdmin = {
    auth: {
      admin: {
        getUserById: async (id) => ({ data: { user: { id } }, error: null }),
        updateUserById: async (id, payload) => ({ data: { user: { id, ...payload } }, error: null })
      }
    },
    from: () => ({
      select: async () => ({ data: [], error: null }),
      insert: async () => ({ data: [], error: null }),
      update: async () => ({ data: [], error: null }),
      upsert: async () => ({ data: [], error: null })
    })
  };

  module.exports = { supabase, supabaseAdmin };
} else {
  const { createClient } = require('@supabase/supabase-js');

  // Prefer central config (loads .env early inside config/index.js)
  let cfg;
  try {
    ({ config: cfg } = require('../config'));
  } catch {
    cfg = undefined;
  }

  const url =  (cfg && cfg.supabase && cfg.supabase.url)            || process.env.SUPABASE_URL || '';
  const anon = (cfg && cfg.supabase && cfg.supabase.anonKey)        || process.env.SUPABASE_ANON_KEY || '';
  const svc  = (cfg && cfg.supabase && cfg.supabase.serviceRoleKey) || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  const xClientInfo =
    (cfg && cfg.branding && cfg.branding.xClientInfo) ||
    `app-server/${(cfg && cfg.branding && cfg.branding.appVersion) || process.env.APP_VERSION || 'dev'}`;

  const baseOptions = {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { 'X-Client-Info': String(xClientInfo) } }
  };

  // Quiet, one-time warning without leaking secrets
  let warned = false;
  const logger = require('./logger');
  function warnOnce(msg) {
    if (warned) return;
    warned = true;
    try {
      logger.warn({
        event: 'supabase.client.missing_config'
      }, msg);
    } catch (_) {}
  }

  const supabase =
    (url && anon) ? createClient(url, anon, baseOptions)
                  : (warnOnce('[supabaseClient] Missing SUPABASE_URL or SUPABASE_ANON_KEY; exporting supabase=null'), null);

  const supabaseAdmin =
    (url && svc) ? createClient(url, svc, baseOptions)
                 : (warnOnce('[supabaseClient] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY; exporting supabaseAdmin=null'), null);

  module.exports = { supabase, supabaseAdmin };
}