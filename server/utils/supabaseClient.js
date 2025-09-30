// File: server/utils/supabaseClient.js
// Description: Tiny helper to talk to Supabase from the server
// Notes: Uses environment variables; does not log or expose any secrets

const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
  throw new Error('Supabase envs missing: SUPABASE_URL or SUPABASE_ANON_KEY');
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

module.exports = { supabase };


