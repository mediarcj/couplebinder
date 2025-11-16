// File: server/utils/supabaseClient.js
// Purpose: Centralized Supabase clients (anon + service role) for server-side use
// Notes:
//  - No secrets logged. Safe in dev/prod.
//  - If required env is missing, exports `null` clients so callers can skip.
//  - Test mode returns tiny stubs (no network).

'use strict';

const isTest = process.env.NODE_ENV === 'test';

if (isTest) {
  const supabase = {
    auth: {
      getUser: async () => ({ data: { user: null }, error: null }),
      updateUser: async () => ({ data: { user: null }, error: null })
    },
    from: () => ({ select: async () => ({ data: [], error: null }) })
  };

  const supabaseAdmin = {
    auth: {
      admin: {
        getUserById: async (id) => ({ data: { user: { id } }, error: null }),
        updateUserById: async (id, payload) => ({ data: { user: { id, ...payload } }, error: null })
      }
    },
    from: () => ({ select: async () => ({ data: [], error: null }) })
  };

  module.exports = { supabase, supabaseAdmin };
} else {
  const { createClient } = require('@supabase/supabase-js');

  // Prefer central config (already loaded very early). Fall back to env if needed.
  let cfg = null;
  try { ({ config: cfg } = require('../config')); } catch { cfg = null; }

  const url =  cfg?.supabase?.url              || process.env.SUPABASE_URL || '';
  const anon = cfg?.supabase?.anonKey          || process.env.SUPABASE_ANON_KEY || '';
  const svc =  cfg?.supabase?.serviceRoleKey   || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  const xClientInfo =
    (cfg?.branding?.xClientInfo && String(cfg.branding.xClientInfo)) ||
    `app-server/${(cfg?.branding?.appVersion || process.env.APP_VERSION || 'dev')}`;

  const baseOptions = {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { 'X-Client-Info': xClientInfo } },
  };

  const supabase =     (url && anon) ? createClient(url, anon, baseOptions) : null;
  const supabaseAdmin = (url && svc) ? createClient(url, svc,  baseOptions) : null;

  module.exports = { supabase, supabaseAdmin };
}