// server/lib/supabaseClient.js
import { createClient } from '@supabase/supabase-js';

let supabase = null;

export function getSupabase() {
  if (!supabase) {
    const url = process.env.SUPABASE_URL || 'http://localhost:54321';
    const key = process.env.SUPABASE_ANON_KEY || 'test_anon';
    supabase = createClient(url, key);
  }
  return supabase;
}