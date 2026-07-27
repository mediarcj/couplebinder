// server/services/profileService.js
// Fetch canonical profile info from v_profiles_full (read-optimized view)

const { createClient } = require('@supabase/supabase-js');
const logger = require('../utils/logger');
const { updateProfileTransactional } = require('./profileSyncService');
const { config } = require('../config');
const PROFILE_QUERY_TIMEOUT_MS = 5_000;

function fetchWithProfileTimeout(input, init = {}) {
  return fetch(input, {
    ...init,
    signal: init.signal || AbortSignal.timeout(PROFILE_QUERY_TIMEOUT_MS),
  });
}

/**
 * We fetch the user's profile using a user-context Supabase client to ensure RLS policies work correctly.
 * 
 * The v_profiles_full view has RLS gating that requires auth.uid() to be set to the actual user.
 * Using supabaseAdmin bypasses this, but using a user-context client respects the RLS policies.
 * 
 * Create a Supabase client with the user's access token, then query the canonical view.
 * This ensures last_sign_in_at and other gated fields are properly exposed.
 */
async function getProfileByUserId(userId, userAccessToken) {
  if (!userId) return null;
  
  // Use user-context client for RLS compliance
  if (userAccessToken) {
    const userSupabase = createClient(
      config.supabase.url,
      config.supabase.anonKey,
      {
        global: {
          headers: { Authorization: `Bearer ${userAccessToken}` },
          fetch: fetchWithProfileTimeout,
        },
        auth: {
          autoRefreshToken: false,
          persistSession: false,
          detectSessionInUrl: false
        },
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
        status: error.status || null,
        code: error.code || null
      }, 'Profile fetch with user context failed');
      return null;
    }
    return data || null;
  }
  
  logger.warn(
    { event: 'profile.fetch.missing_user_context' },
    'Profile fetch skipped because verified user context is unavailable'
  );
  return null;
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
 * Updates user profile across two separate Supabase services (Auth API and Data API).
 *
 * Some fields (display_name, phone) must stay in sync between auth.users and profiles.
 *
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
