// File: server/utils/supabaseClient.js
// Purpose: Centralized Supabase clients (anon + service role) for server-side use

const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Load env once (OK if already loaded elsewhere)
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL) {
  throw new Error('Missing SUPABASE_URL in environment.');
}
if (!SUPABASE_ANON_KEY) {
  console.warn('[warn] SUPABASE_ANON_KEY missing  public client will be null');
}
if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.warn('[warn] SUPABASE_SERVICE_ROLE_KEY missing  admin client will be null');
}

const baseOptions = {
  auth: {
    persistSession: false,   // node server  no sessions
    autoRefreshToken: false, // node server  no auto-refresh
  },
  global: {
    headers: { 'X-Client-Info': 'detechify-server/1.0.0' },
  },
};

// Public (anon) client  optional on server
const supabase = (SUPABASE_URL && SUPABASE_ANON_KEY)
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, baseOptions)
  : null;

// Service role client  REQUIRED for admin/server reads/writes
const supabaseAdmin = (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY)
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, baseOptions)
  : null;

module.exports = { supabase, supabaseAdmin };