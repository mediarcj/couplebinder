// server/services/profileService.js
// Fetch canonical profile info from v_profiles_full (read-optimized view)

const { supabaseAdmin } = require('../utils/supabaseClient');

async function getProfileByUserId(userId) {
  if (!userId || !supabaseAdmin) return null;
  const { data, error } = await supabaseAdmin
    .from('v_profiles_full')
    .select('*')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error('profileService.getProfileByUserId error:', error.message);
    return null;
  }
  return data || null;
}

module.exports = { getProfileByUserId };
