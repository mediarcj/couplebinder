// File: server/utils/supabaseClient.js
// Description: Tiny helper to talk to Supabase from the server
// Notes: Uses environment variables; does not log or expose any secrets

const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
  throw new Error('Supabase envs missing: SUPABASE_URL or SUPABASE_ANON_KEY');
}

// Client for regular operations (uses anon key)
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

// Admin client for server-side operations (uses service role key)
const supabaseAdmin = process.env.SUPABASE_SERVICE_ROLE_KEY 
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    })
  : null;

module.exports = { supabase, supabaseAdmin };


