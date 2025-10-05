// server/services/profileService.js
// Fetch canonical profile info from v_profiles_full (read-optimized view)

const { supabaseAdmin } = require('../utils/supabaseClient');
const { createClient } = require('@supabase/supabase-js');

function ensureAdmin() {
  if (!supabaseAdmin) {
    throw new Error('Supabase admin client not configured. Check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  }
}

/**
 * WHAT:
 * We fetch the user's profile using a user-context Supabase client to ensure RLS policies work correctly.
 * 
 * WHY:
 * The v_profiles_full view has RLS gating that requires auth.uid() to be set to the actual user.
 * Using supabaseAdmin bypasses this, but using a user-context client respects the RLS policies.
 * 
 * HOW:
 * Create a Supabase client with the user's access token, then query the canonical view.
 * This ensures last_sign_in_at and other gated fields are properly exposed.
 */
async function getProfileByUserId(userId, userAccessToken) {
  if (!userId) return null;
  
  // Use user-context client for RLS compliance
  if (userAccessToken) {
    const userSupabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY,
      {
        global: {
          headers: { Authorization: `Bearer ${userAccessToken}` }
        }
      }
    );

    const { data, error } = await userSupabase
      .from('v_profiles_full')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error) {
      console.error('profileService.getProfileByUserId (user context):', error.message);
      // Fall back to admin client if user context fails
      return await getProfileByUserIdAdmin(userId);
    }
    return data || null;
  }
  
  // Fallback to admin client if no access token provided
  return await getProfileByUserIdAdmin(userId);
}

/**
 * Admin-only fallback for profile fetching
 * Used when user context is not available or fails
 */
async function getProfileByUserIdAdmin(userId) {
  ensureAdmin();
  if (!userId) return null;

  const { data, error } = await supabaseAdmin
    .from('v_profiles_full')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error) {
    console.error('profileService.getProfileByUserId (admin):', error.message);
    return null;
  }
  return data || null;
}

// Allowlist
const ALLOWED_FIELDS = new Set([
  'email','given_name','family_name','display_name_override','avatar_url',
  'locale','timezone','is_private','birthday','gender','language',
  'city_province','country','social_media1','social_media2','social_media3',
  'relationship_status','job','hobbies','music','fav_food',
  'profile_title','profile_description','account_privacy','phone'
]);

function pickAllowed(patch) {
  const out = {};
  for (const [k, v] of Object.entries(patch || {})) {
    if (ALLOWED_FIELDS.has(k)) out[k] = v;
  }
  return out;
}

async function updateOwnProfile(userId, patch) {
  ensureAdmin();
  if (!userId) throw new Error('Missing userId');

  const safePatch = pickAllowed(patch);
  if (Object.keys(safePatch).length === 0) {
    return await getProfileByUserIdAdmin(userId);
  }

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .update(safePatch)
    .eq('user_id', userId)
    .select('*')
    .single();

  if (error) {
    console.error('profileService.updateOwnProfile:', error.message);
    throw error;
  }
  return data;
}

module.exports = { getProfileByUserId, updateOwnProfile };