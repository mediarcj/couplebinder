// server/services/profileService.js
// Fetch canonical profile info from v_profiles_full (read-optimized view)

const { supabaseAdmin } = require('../utils/supabaseClient');
const { createClient } = require('@supabase/supabase-js');
const logger = require('../utils/logger');
const { updateProfileTransactional } = require('./profileSyncService');

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
      logger.warn({
        event: 'profile.fetch.user_context_failed',
        userId,
        error: error.message
      }, 'Profile fetch with user context failed, falling back to admin');
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
    logger.error({
      event: 'profile.fetch.admin_failed',
      userId,
      error: error.message
    }, 'Profile fetch with admin client failed');
    return null;
  }
  return data || null;
}

// Allowlist - all allowed profile fields
const ALLOWED_FIELDS = new Set([
  'email','given_name','family_name','display_name_override','avatar_url',
  'locale','timezone','is_private','birthday','gender','language',
  'city_province','country','social_media1','social_media2','social_media3',
  'relationship_status','job','hobbies','music','fav_food',
  'profile_title','profile_description','phone'
]);

function _pickAllowed(patch) {
  const out = {};
  for (const [k, v] of Object.entries(patch || {})) {
    if (ALLOWED_FIELDS.has(k)) out[k] = v;
  }
  return out;
}

/**
 * CRITICAL SECTION: Profile dual-update (auth.users + profiles)
 *
 * WHAT:
 * Updates user profile across two separate Supabase services (Auth API and Data API).
 *
 * WHY:
 * Some fields (display_name, phone) must stay in sync between auth.users and profiles.
 *
 * HOW:
 * Since Supabase Auth and Data APIs are separate services, we cannot use a single transaction.
 * Instead, we apply these mitigations:
 * 1. Update auth.users first (less critical if it fails)
 * 2. Update profiles second (source of truth)
 * 3. Log both operations for audit trail
 * 4. Accept eventual consistency (auth.users and profiles may briefly diverge)
 *
 * RISK:
 * If auth.users succeeds but profiles fails, the two tables will be inconsistent until
 * the next update. This is acceptable because profiles is the source of truth and the
 * view (v_profiles_full) always reads from profiles.
 *
 * FUTURE IMPROVEMENT:
 * Add a background job to reconcile auth.users with profiles periodically.
 */
async function updateOwnProfile(userId, patch, opts = {}) {
  logger.warn({
    event: 'profile.legacy_update_called',
    userId,
    fields: Object.keys(patch || {})
  }, 'Legacy updateOwnProfile called - use updateProfileTransactional instead');
  
  return updateProfileTransactional(userId, patch, opts);
}

module.exports = { getProfileByUserId, updateOwnProfile };