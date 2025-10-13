// server/services/profileService.js
// Fetch canonical profile info from v_profiles_full (read-optimized view)

const { supabaseAdmin } = require('../utils/supabaseClient');
const { createClient } = require('@supabase/supabase-js');
const logger = require('../utils/logger');

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

// Allowlist - temporarily excluding account_privacy due to database constraint issue
const ALLOWED_FIELDS = new Set([
  'email','given_name','family_name','display_name_override','avatar_url',
  'locale','timezone','is_private','birthday','gender','language',
  'city_province','country','social_media1','social_media2','social_media3',
  'relationship_status','job','hobbies','music','fav_food',
  'profile_title','profile_description','phone'
  // 'account_privacy' - temporarily excluded due to database constraint
]);

function pickAllowed(patch) {
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
async function updateOwnProfile(userId, patch) {
  ensureAdmin();
  if (!userId) throw new Error('Missing userId');

  // Log field names only, never values (PII protection)
  logger.debug({ userId, fields: Object.keys(patch || {}) }, 'profile.update.received');
  const safePatch = pickAllowed(patch);
  logger.debug({ userId, fields: Object.keys(safePatch || {}) }, 'profile.update.sanitized');
  
  if (Object.keys(safePatch).length === 0) {
    return await getProfileByUserIdAdmin(userId);
  }

  // Handle dual updates for display_name_override and phone
  // These need to be updated in both auth.users and profiles tables
  const needsAuthUpdate = (safePatch.display_name_override !== undefined && safePatch.display_name_override !== null) || 
                         (safePatch.phone !== undefined && safePatch.phone !== null);
  
  // If display_name_override is being updated, also parse it into given_name and family_name
  if (safePatch.display_name_override !== undefined && safePatch.display_name_override !== null) {
    const fullName = safePatch.display_name_override.trim();
    const nameParts = fullName.split(' ').filter(part => part.length > 0);
    
    if (nameParts.length === 1) {
      // Single name: "John" -> given_name: "John", family_name: null
      safePatch.given_name = nameParts[0];
      safePatch.family_name = null;
    } else if (nameParts.length === 2) {
      // Two names: "John Doe" -> given_name: "John", family_name: "Doe"
      safePatch.given_name = nameParts[0];
      safePatch.family_name = nameParts[1];
    } else if (nameParts.length >= 3) {
      // Three or more names: "John Michael Doe" -> given_name: "John", family_name: "Michael Doe"
      safePatch.given_name = nameParts[0];
      safePatch.family_name = nameParts.slice(1).join(' ');
    }
    
    // Log name parsing result (field names only, no values)
    logger.debug({ userId, parsedFields: ['display_name', 'given_name', 'family_name'] }, 'profile.names.parsed');
  }
  
  let authUpdateData = {};
  if (safePatch.display_name_override !== undefined && safePatch.display_name_override !== null) {
    authUpdateData.display_name = safePatch.display_name_override;
  }
  if (safePatch.phone !== undefined && safePatch.phone !== null) {
    authUpdateData.phone = safePatch.phone;
  }

  // STEP 1: Update auth.users if needed (for display_name and phone)
  // Note: This update is non-critical. If it fails, profiles table is still updated (source of truth)
  if (needsAuthUpdate && Object.keys(authUpdateData).length > 0) {
    try {
      const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        user_metadata: authUpdateData
      });
      
      if (authError) {
        console.error('[profile] auth.users update failed (non-critical):', authError.message);
        // Continue with profile update - profiles table is source of truth
      }
    } catch (authErr) {
      console.error('[profile] auth.users update error (non-critical):', authErr.message);
      // Continue with profile update - profiles table is source of truth
    }
  }

  // Handle array fields - convert string to array format for hobbies, music, fav_food
  const processedPatch = { ...safePatch };
  
  // Convert string values to arrays for these specific fields
  if (processedPatch.hobbies !== undefined && processedPatch.hobbies !== null) {
    // If it's a string, convert to array; if it's already an array, keep it
    if (typeof processedPatch.hobbies === 'string') {
      // Split by comma and clean up
      processedPatch.hobbies = processedPatch.hobbies.split(',').map(item => item.trim()).filter(item => item.length > 0);
    }
  }
  
  if (processedPatch.music !== undefined && processedPatch.music !== null) {
    if (typeof processedPatch.music === 'string') {
      processedPatch.music = processedPatch.music.split(',').map(item => item.trim()).filter(item => item.length > 0);
    }
  }
  
  if (processedPatch.fav_food !== undefined && processedPatch.fav_food !== null) {
    if (typeof processedPatch.fav_food === 'string') {
      processedPatch.fav_food = processedPatch.fav_food.split(',').map(item => item.trim()).filter(item => item.length > 0);
    }
  }
  
  // Log database payload (field names only, no values)
  logger.debug({ userId, fields: Object.keys(processedPatch || {}) }, 'profile.update.dbPayload');

  // STEP 2: Update profiles table (source of truth)
  // This is the critical update - must succeed
  logger.profile('profile.update.executing', { userId, fields: Object.keys(processedPatch || {}) });
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .update(processedPatch)
    .eq('user_id', userId)
    .select('*')
    .single();

  if (error) {
    console.error('[profile] profiles table update failed (critical):', error.message);
    throw error;
  }
  
  logger.profile('profile.update.completed', { userId, operation: 'profile_update_success' });
  return data;
}

module.exports = { getProfileByUserId, updateOwnProfile };