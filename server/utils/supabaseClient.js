// File: server/utils/supabaseClient.js
// Description: Tiny helper to talk to Supabase from the server
// Notes: Uses environment variables; does not log or expose any secrets

const { createClient } = require('@supabase/supabase-js');
const path = require('path');

// Lazy initialization of Supabase clients
let supabase = null;
let supabaseAdmin = null;

function getSupabaseClient() {
  if (!supabase) {
    require('dotenv').config({ path: path.join(__dirname, '../../.env') });
    
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
      throw new Error('Supabase envs missing: SUPABASE_URL or SUPABASE_ANON_KEY');
    }
    
    supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
  }
  return supabase;
}

function getSupabaseAdminClient() {
  if (!supabaseAdmin) {
    require('dotenv').config({ path: path.join(__dirname, '../../.env') });
    
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Supabase admin envs missing: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    }
    
    supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
  }
  return supabaseAdmin;
}

module.exports = { 
  get supabase() { return getSupabaseClient(); },
  get supabaseAdmin() { return getSupabaseAdminClient(); }
};


