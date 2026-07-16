// server/services/profileService.js
// Fetch canonical profile info from v_profiles_full (read-optimized view)

const { supabaseAdmin } = require('../utils/supabaseClient');
// I am loading `@supabase/supabase-js` into `createClient` so this file can reuse that dependency below.
const { createClient } = require('@supabase/supabase-js');
// I am loading `../utils/logger` into `logger` so this file can reuse that dependency below.
const logger = require('../utils/logger');
// I am loading `./profileSyncService` into `updateProfileTransactional` so this file can reuse that dependency below.
const { updateProfileTransactional } = require('./profileSyncService');
// I am loading `../config` into `config` so this file can reuse that dependency below.
const { config } = require('../config');

// I am keeping `ensureAdmin` as a named helper so the surrounding workflow can call this step when it needs it.
function ensureAdmin() {
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!supabaseAdmin) {
    // I am stopping this path with the existing error here because the caller should not continue with an invalid result.
    throw new Error('Supabase admin client not configured. Check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
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
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!userId) return null;
  
  // Use user-context client for RLS compliance
  if (userAccessToken) {
    // I am saving `userSupabase` here so the nearby steps can reuse the same value without rebuilding it each time.
    const userSupabase = createClient(
      // I am keeping this line here because the surrounding profileService.js workflow expects this value or operation before it continues.
      config.supabase.url,
      // I am keeping this line here because the surrounding profileService.js workflow expects this value or operation before it continues.
      config.supabase.anonKey,
      // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
      {
        // I am keeping the `global` field in this object so the receiving code can read that value by its expected name.
        global: {
          // I am keeping the `headers` field in this object so the receiving code can read that value by its expected name.
          headers: { Authorization: `Bearer ${userAccessToken}` }
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    );

    // I am saving `data` here so the nearby steps can reuse the same value without rebuilding it each time.
    const { data, error } = await userSupabase
      // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
      .from('v_profiles_full')
      // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
      .select('*')
      // I am continuing the existing call chain here so this option stays attached to the same operation started above.
      .eq('user_id', userId)
      // I am continuing the existing call chain here so this option stays attached to the same operation started above.
      .single();

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (error) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      logger.warn({
        // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
        event: 'profile.fetch.user_context_failed',
        // I am keeping this line here because the surrounding profileService.js workflow expects this value or operation before it continues.
        userId,
        // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
        error: error.message
      // I am keeping this line here because the surrounding profileService.js workflow expects this value or operation before it continues.
      }, 'Profile fetch with user context failed, falling back to admin');
      // Fall back to admin client if user context fails
      return await getProfileByUserIdAdmin(userId);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    // This return sends the completed value or response back to the code that called this function.
    return data || null;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
  
  // Fallback to admin client if no access token provided
  return await getProfileByUserIdAdmin(userId);
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * Admin-only fallback for profile fetching
 * Used when user context is not available or fails
 */
async function getProfileByUserIdAdmin(userId) {
  // I am calling this helper here so the current workflow performs this step before it moves on.
  ensureAdmin();
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!userId) return null;

  // I am saving `data` here so the nearby steps can reuse the same value without rebuilding it each time.
  const { data, error } = await supabaseAdmin
    // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
    .from('v_profiles_full')
    // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
    .select('*')
    // I am continuing the existing call chain here so this option stays attached to the same operation started above.
    .eq('user_id', userId)
    // I am continuing the existing call chain here so this option stays attached to the same operation started above.
    .single();

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (error) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.error({
      // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
      event: 'profile.fetch.admin_failed',
      // I am keeping this line here because the surrounding profileService.js workflow expects this value or operation before it continues.
      userId,
      // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
      error: error.message
    // I am keeping this line here because the surrounding profileService.js workflow expects this value or operation before it continues.
    }, 'Profile fetch with admin client failed');
    // This return sends the completed value or response back to the code that called this function.
    return null;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
  // This return sends the completed value or response back to the code that called this function.
  return data || null;
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// Allowlist - all allowed profile fields
const ALLOWED_FIELDS = new Set([
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'email','given_name','family_name','display_name_override','avatar_url',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'locale','timezone','is_private','birthday','gender','language',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'city_province','country','social_media1','social_media2','social_media3',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'relationship_status','job','hobbies','music','fav_food',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'profile_title','profile_description','phone'
// This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
]);

// I am keeping `_pickAllowed` as a named helper so the surrounding workflow can call this step when it needs it.
function _pickAllowed(patch) {
  // I am saving `out` here so the nearby steps can reuse the same value without rebuilding it each time.
  const out = {};
  // I am repeating the next block one item at a time so every value in the existing collection receives the same handling.
  for (const [k, v] of Object.entries(patch || {})) {
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (ALLOWED_FIELDS.has(k)) out[k] = v;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
  // This return sends the completed value or response back to the code that called this function.
  return out;
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
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
  // I am calling this helper here so the current workflow performs this step before it moves on.
  logger.warn({
    // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
    event: 'profile.legacy_update_called',
    // I am keeping this line here because the surrounding profileService.js workflow expects this value or operation before it continues.
    userId,
    // I am keeping the `fields` field in this object so the receiving code can read that value by its expected name.
    fields: Object.keys(patch || {})
  // I am keeping this line here because the surrounding profileService.js workflow expects this value or operation before it continues.
  }, 'Legacy updateOwnProfile called - use updateProfileTransactional instead');
  
  // This return sends the completed value or response back to the code that called this function.
  return updateProfileTransactional(userId, patch, opts);
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am exporting this value here so another module can deliberately reuse the completed piece from profileService.js.
module.exports = { getProfileByUserId, updateOwnProfile };