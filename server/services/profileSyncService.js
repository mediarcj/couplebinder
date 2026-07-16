// File: server/services/profileSyncService.js
// Description: Transactional profile synchronization with compensating actions
// Purpose: Ensures auth.users and profiles table stay consistent with rollback capability
// Notes: Implements saga pattern for distributed transaction safety

const logger = require('../utils/logger');
// I am loading `./outboxService` into `storeEvent` so this file can reuse that dependency below.
const { storeEvent } = require('./outboxService');

/**
 * WHAT:
 * Transactional profile update service with compensating actions.
 *
 * WHY:
 * Supabase Auth and Data APIs are separate services without cross-service transactions.
 * We need to ensure consistency between auth.users and profiles tables.
 *
 * HOW:
 * Implement saga pattern with compensating transactions:
 * 1. Save current state (for rollback)
 * 2. Update auth.users first
 * 3. Update profiles table second
 * 4. If profiles fails, rollback auth.users
 * 5. Log all operations for audit trail
 */

const { supabaseAdmin } = require('../utils/supabaseClient');

/**
 * WHAT:
 * Transactional profile update with rollback capability.
 * 
 * WHY:
 * Ensures auth.users and profiles stay consistent even if one update fails.
 * Provides atomicity across separate Supabase services.
 * 
 * HOW:
 * 1. Capture current state for rollback
 * 2. Update auth.users (reversible)
 * 3. Update profiles (source of truth)
 * 4. If profiles fails, rollback auth.users to original state
 * 
 * @param {string} userId - User ID to update
 * @param {Object} patch - Fields to update
 * @returns {Promise<Object>} Updated profile or throws error
 */
async function updateProfileTransactional(userId, patch) {
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!userId) throw new Error('Missing userId');
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!supabaseAdmin) throw new Error('Supabase admin client not configured');

  // I am saving `transactionId` here so the nearby steps can reuse the same value without rebuilding it each time.
  const transactionId = `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // I am calling this helper here so the current workflow performs this step before it moves on.
  logger.info({
    // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
    event: 'profile.transaction.started',
    // I am keeping this line here because the surrounding profileSyncService.js workflow expects this value or operation before it continues.
    transactionId,
    // I am keeping this line here because the surrounding profileSyncService.js workflow expects this value or operation before it continues.
    userId,
    // I am keeping the `fields` field in this object so the receiving code can read that value by its expected name.
    fields: Object.keys(patch || {})
  // I am keeping this line here because the surrounding profileSyncService.js workflow expects this value or operation before it continues.
  }, 'Starting transactional profile update');

  // Step 0: Fetch current profile data to check for changes
  const { data: currentProfile, error: fetchError } = await supabaseAdmin
    // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
    .from('profiles')
    // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
    .select('*')
    // I am continuing the existing call chain here so this option stays attached to the same operation started above.
    .eq('user_id', userId)
    // I am continuing the existing call chain here so this option stays attached to the same operation started above.
    .single();

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (fetchError) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.error({
      // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
      event: 'profile.transaction.fetch_current_failed',
      // I am keeping this line here because the surrounding profileSyncService.js workflow expects this value or operation before it continues.
      transactionId,
      // I am keeping this line here because the surrounding profileSyncService.js workflow expects this value or operation before it continues.
      userId,
      // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
      error: fetchError.message
    // I am keeping this line here because the surrounding profileSyncService.js workflow expects this value or operation before it continues.
    }, 'Failed to fetch current profile for change detection');
    // I am stopping this path with the existing error here because the caller should not continue with an invalid result.
    throw new Error(`Failed to fetch current profile: ${fetchError.message}`);
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // Check if any changes were actually made
  let hasChanges = false;

  // Normalize and compare each field
  for (const [key, newValue] of Object.entries(patch)) {
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (newValue === undefined || newValue === null) continue;
    
    // I am saving `normalizedNewValue` here so the nearby steps can reuse the same value without rebuilding it each time.
    let normalizedNewValue = newValue;
    // I am saving `currentValue` here so the nearby steps can reuse the same value without rebuilding it each time.
    let currentValue = currentProfile[key];

    // Handle array fields normalization for comparison
    if (['hobbies', 'music', 'fav_food'].includes(key)) {
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (typeof normalizedNewValue === 'string') {
        // I am mapping the collection here so each input item becomes the output shape expected by the next step.
        normalizedNewValue = normalizedNewValue.split(',').map(item => item.trim()).filter(item => item.length > 0);
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (Array.isArray(currentValue)) {
        // currentValue is already an array, no change needed
      } else if (typeof currentValue === 'string') {
        // I am mapping the collection here so each input item becomes the output shape expected by the next step.
        currentValue = currentValue.split(',').map(item => item.trim()).filter(item => item.length > 0);
      // This alternative runs only when the condition above did not use its first path.
      } else {
        // I am keeping this line here because the surrounding profileSyncService.js workflow expects this value or operation before it continues.
        currentValue = [];
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // Handle display_name_override special case
    if (key === 'display_name_override') {
      // I am saving `currentDisplayName` here so the nearby steps can reuse the same value without rebuilding it each time.
      const currentDisplayName = currentProfile.display_name_override || currentProfile.given_name + ' ' + currentProfile.family_name;
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (normalizedNewValue !== currentDisplayName) {
        // I am keeping this line here because the surrounding profileSyncService.js workflow expects this value or operation before it continues.
        hasChanges = true;
        // I am changing the loop flow here once the condition above has decided this item needs no further work in this pass.
        break;
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // This alternative runs only when the condition above did not use its first path.
    } else {
      // Deep comparison for arrays, simple comparison for primitives
      if (Array.isArray(normalizedNewValue) && Array.isArray(currentValue)) {
        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (JSON.stringify(normalizedNewValue.sort()) !== JSON.stringify(currentValue.sort())) {
          // I am keeping this line here because the surrounding profileSyncService.js workflow expects this value or operation before it continues.
          hasChanges = true;
          // I am changing the loop flow here once the condition above has decided this item needs no further work in this pass.
          break;
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }
      // I am checking this next possibility only because the earlier condition did not choose its path.
      } else if (normalizedNewValue !== currentValue) {
        // I am keeping this line here because the surrounding profileSyncService.js workflow expects this value or operation before it continues.
        hasChanges = true;
        // I am changing the loop flow here once the condition above has decided this item needs no further work in this pass.
        break;
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // If no changes detected, return current profile with unchanged flag
  if (!hasChanges) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.info({
      // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
      event: 'profile.transaction.no_changes',
      // I am keeping this line here because the surrounding profileSyncService.js workflow expects this value or operation before it continues.
      transactionId,
      // I am keeping this line here because the surrounding profileSyncService.js workflow expects this value or operation before it continues.
      userId,
      // I am keeping the `fields` field in this object so the receiving code can read that value by its expected name.
      fields: Object.keys(patch || {})
    // I am keeping this line here because the surrounding profileSyncService.js workflow expects this value or operation before it continues.
    }, 'No changes detected - returning current profile');
    
    // This return sends the completed value or response back to the code that called this function.
    return { ...currentProfile, _unchanged: true };
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // Step 1: Capture current state for rollback
  let originalAuthState = null;
  // I am saving `needsAuthUpdate` here so the nearby steps can reuse the same value without rebuilding it each time.
  const needsAuthUpdate = (patch.display_name_override !== undefined && patch.display_name_override !== null) || 
                         // I am keeping this line here because the surrounding profileSyncService.js workflow expects this value or operation before it continues.
                         (patch.phone !== undefined && patch.phone !== null);

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (needsAuthUpdate) {
    // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
    try {
      // I am saving `data` here so the nearby steps can reuse the same value without rebuilding it each time.
      const { data: currentUser, error: getUserError } = await supabaseAdmin.auth.admin.getUserById(userId);
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (getUserError) {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        logger.error({
          // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
          event: 'profile.transaction.get_user_failed',
          // I am keeping this line here because the surrounding profileSyncService.js workflow expects this value or operation before it continues.
          transactionId,
          // I am keeping this line here because the surrounding profileSyncService.js workflow expects this value or operation before it continues.
          userId,
          // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
          error: getUserError.message
        // I am keeping this line here because the surrounding profileSyncService.js workflow expects this value or operation before it continues.
        }, 'Failed to get current user state for rollback');
        // I am stopping this path with the existing error here because the caller should not continue with an invalid result.
        throw new Error(`Failed to get current user state: ${getUserError.message}`);
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
      
      // I am keeping this line here because the surrounding profileSyncService.js workflow expects this value or operation before it continues.
      originalAuthState = {
        // I am keeping the `display_name` field in this object so the receiving code can read that value by its expected name.
        display_name: currentUser.user_metadata?.display_name || null,
        // I am keeping the `phone` field in this object so the receiving code can read that value by its expected name.
        phone: currentUser.phone || null
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      };
      
      // I am calling this helper here so the current workflow performs this step before it moves on.
      logger.debug({
        // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
        event: 'profile.transaction.state_captured',
        // I am keeping this line here because the surrounding profileSyncService.js workflow expects this value or operation before it continues.
        transactionId,
        // I am keeping this line here because the surrounding profileSyncService.js workflow expects this value or operation before it continues.
        userId
      // I am keeping this line here because the surrounding profileSyncService.js workflow expects this value or operation before it continues.
      }, 'Original auth state captured for rollback');
    // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
    } catch (error) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      logger.error({
        // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
        event: 'profile.transaction.state_capture_failed',
        // I am keeping this line here because the surrounding profileSyncService.js workflow expects this value or operation before it continues.
        transactionId,
        // I am keeping this line here because the surrounding profileSyncService.js workflow expects this value or operation before it continues.
        userId,
        // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
        error: error.message
      // I am keeping this line here because the surrounding profileSyncService.js workflow expects this value or operation before it continues.
      }, 'Failed to capture original state');
      // I am stopping this path with the existing error here because the caller should not continue with an invalid result.
      throw error;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // Step 2: Update auth.users first (if needed)
  if (needsAuthUpdate && originalAuthState) {
    // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
    try {
      // I am saving `authUpdateData` here so the nearby steps can reuse the same value without rebuilding it each time.
      const authUpdateData = {};
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (patch.display_name_override !== undefined && patch.display_name_override !== null) {
        // I am keeping this line here because the surrounding profileSyncService.js workflow expects this value or operation before it continues.
        authUpdateData.display_name = patch.display_name_override;
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (patch.phone !== undefined && patch.phone !== null) {
        // I am keeping this line here because the surrounding profileSyncService.js workflow expects this value or operation before it continues.
        authUpdateData.phone = patch.phone;
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }

      // I am saving `error` here so the nearby steps can reuse the same value without rebuilding it each time.
      const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        // I am keeping the `user_metadata` field in this object so the receiving code can read that value by its expected name.
        user_metadata: authUpdateData
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      });

      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (authError) {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        logger.error({
          // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
          event: 'profile.transaction.auth_update_failed',
          // I am keeping this line here because the surrounding profileSyncService.js workflow expects this value or operation before it continues.
          transactionId,
          // I am keeping this line here because the surrounding profileSyncService.js workflow expects this value or operation before it continues.
          userId,
          // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
          error: authError.message
        // I am keeping this line here because the surrounding profileSyncService.js workflow expects this value or operation before it continues.
        }, 'Auth users update failed');
        // I am stopping this path with the existing error here because the caller should not continue with an invalid result.
        throw new Error(`Auth update failed: ${authError.message}`);
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }

      // I am calling this helper here so the current workflow performs this step before it moves on.
      logger.debug({
        // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
        event: 'profile.transaction.auth_updated',
        // I am keeping this line here because the surrounding profileSyncService.js workflow expects this value or operation before it continues.
        transactionId,
        // I am keeping this line here because the surrounding profileSyncService.js workflow expects this value or operation before it continues.
        userId,
        // I am keeping the `fields` field in this object so the receiving code can read that value by its expected name.
        fields: Object.keys(authUpdateData)
      // I am keeping this line here because the surrounding profileSyncService.js workflow expects this value or operation before it continues.
      }, 'Auth users updated successfully');
    // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
    } catch (error) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      logger.error({
        // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
        event: 'profile.transaction.auth_update_error',
        // I am keeping this line here because the surrounding profileSyncService.js workflow expects this value or operation before it continues.
        transactionId,
        // I am keeping this line here because the surrounding profileSyncService.js workflow expects this value or operation before it continues.
        userId,
        // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
        error: error.message
      // I am keeping this line here because the surrounding profileSyncService.js workflow expects this value or operation before it continues.
      }, 'Auth users update exception');
      // I am stopping this path with the existing error here because the caller should not continue with an invalid result.
      throw error;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // Step 3: Update profiles table (critical update)
  try {
    // Parse display_name_override into given_name and family_name
    const processedPatch = { ...patch };
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (patch.display_name_override !== undefined && patch.display_name_override !== null) {
      // I am saving `fullName` here so the nearby steps can reuse the same value without rebuilding it each time.
      const fullName = patch.display_name_override.trim();
      // I am saving `nameParts` here so the nearby steps can reuse the same value without rebuilding it each time.
      const nameParts = fullName.split(' ').filter(part => part.length > 0);
      
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (nameParts.length === 1) {
        // I am keeping this line here because the surrounding profileSyncService.js workflow expects this value or operation before it continues.
        processedPatch.given_name = nameParts[0];
        // I am keeping this line here because the surrounding profileSyncService.js workflow expects this value or operation before it continues.
        processedPatch.family_name = null;
      // I am checking this next possibility only because the earlier condition did not choose its path.
      } else if (nameParts.length === 2) {
        // I am keeping this line here because the surrounding profileSyncService.js workflow expects this value or operation before it continues.
        processedPatch.given_name = nameParts[0];
        // I am keeping this line here because the surrounding profileSyncService.js workflow expects this value or operation before it continues.
        processedPatch.family_name = nameParts[1];
      // I am checking this next possibility only because the earlier condition did not choose its path.
      } else if (nameParts.length >= 3) {
        // I am keeping this line here because the surrounding profileSyncService.js workflow expects this value or operation before it continues.
        processedPatch.given_name = nameParts[0];
        // I am keeping this line here because the surrounding profileSyncService.js workflow expects this value or operation before it continues.
        processedPatch.family_name = nameParts.slice(1).join(' ');
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // Handle array fields
    ['hobbies', 'music', 'fav_food'].forEach(field => {
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (processedPatch[field] !== undefined && processedPatch[field] !== null) {
        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (typeof processedPatch[field] === 'string') {
          // I am mapping the collection here so each input item becomes the output shape expected by the next step.
          processedPatch[field] = processedPatch[field].split(',').map(item => item.trim()).filter(item => item.length > 0);
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am saving `data` here so the nearby steps can reuse the same value without rebuilding it each time.
    const { data: updatedProfile, error: profileError } = await supabaseAdmin
      // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
      .from('profiles')
      // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
      .update(processedPatch)
      // I am continuing the existing call chain here so this option stays attached to the same operation started above.
      .eq('user_id', userId)
      // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
      .select('*')
      // I am continuing the existing call chain here so this option stays attached to the same operation started above.
      .single();

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (profileError) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      logger.error({
        // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
        event: 'profile.transaction.profiles_update_failed',
        // I am keeping this line here because the surrounding profileSyncService.js workflow expects this value or operation before it continues.
        transactionId,
        // I am keeping this line here because the surrounding profileSyncService.js workflow expects this value or operation before it continues.
        userId,
        // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
        error: profileError.message,
        // I am keeping the `fields` field in this object so the receiving code can read that value by its expected name.
        fields: Object.keys(processedPatch)
      // I am keeping this line here because the surrounding profileSyncService.js workflow expects this value or operation before it continues.
      }, 'Profiles table update failed - initiating rollback');

      // Step 4: ROLLBACK auth.users to original state
      if (needsAuthUpdate && originalAuthState) {
        // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
        try {
          // I am saving `rollbackData` here so the nearby steps can reuse the same value without rebuilding it each time.
          const rollbackData = {};
          // This check helps me choose or stop the next path before any work that depends on this condition runs.
          if (originalAuthState.display_name !== null) {
            // I am keeping this line here because the surrounding profileSyncService.js workflow expects this value or operation before it continues.
            rollbackData.display_name = originalAuthState.display_name;
          // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
          }
          // This check helps me choose or stop the next path before any work that depends on this condition runs.
          if (originalAuthState.phone !== null) {
            // I am keeping this line here because the surrounding profileSyncService.js workflow expects this value or operation before it continues.
            rollbackData.phone = originalAuthState.phone;
          // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
          }

          // I am saving `error` here so the nearby steps can reuse the same value without rebuilding it each time.
          const { error: rollbackError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
            // I am keeping the `user_metadata` field in this object so the receiving code can read that value by its expected name.
            user_metadata: rollbackData,
            // I am keeping the `phone` field in this object so the receiving code can read that value by its expected name.
            phone: originalAuthState.phone
          // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
          });

          // This check helps me choose or stop the next path before any work that depends on this condition runs.
          if (rollbackError) {
            // I am calling this helper here so the current workflow performs this step before it moves on.
            logger.error({
              // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
              event: 'profile.transaction.rollback_failed',
              // I am keeping this line here because the surrounding profileSyncService.js workflow expects this value or operation before it continues.
              transactionId,
              // I am keeping this line here because the surrounding profileSyncService.js workflow expects this value or operation before it continues.
              userId,
              // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
              error: rollbackError.message,
              // I am keeping the `originalState` field in this object so the receiving code can read that value by its expected name.
              originalState: originalAuthState
            // I am keeping this line here because the surrounding profileSyncService.js workflow expects this value or operation before it continues.
            }, 'CRITICAL: Rollback failed - manual intervention required');
          // This alternative runs only when the condition above did not use its first path.
          } else {
            // I am calling this helper here so the current workflow performs this step before it moves on.
            logger.warn({
              // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
              event: 'profile.transaction.rollback_success',
              // I am keeping this line here because the surrounding profileSyncService.js workflow expects this value or operation before it continues.
              transactionId,
              // I am keeping this line here because the surrounding profileSyncService.js workflow expects this value or operation before it continues.
              userId
            // I am keeping this line here because the surrounding profileSyncService.js workflow expects this value or operation before it continues.
            }, 'Auth users rolled back to original state');
          // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
          }
        // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
        } catch (rollbackErr) {
          // I am calling this helper here so the current workflow performs this step before it moves on.
          logger.error({
            // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
            event: 'profile.transaction.rollback_error',
            // I am keeping this line here because the surrounding profileSyncService.js workflow expects this value or operation before it continues.
            transactionId,
            // I am keeping this line here because the surrounding profileSyncService.js workflow expects this value or operation before it continues.
            userId,
            // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
            error: rollbackErr.message,
            // I am keeping the `originalState` field in this object so the receiving code can read that value by its expected name.
            originalState: originalAuthState
          // I am keeping this line here because the surrounding profileSyncService.js workflow expects this value or operation before it continues.
          }, 'CRITICAL: Rollback exception - manual intervention required');
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }

      // I am stopping this path with the existing error here because the caller should not continue with an invalid result.
      throw new Error(`Profile update failed: ${profileError.message}`);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // Step 5: Success - log completion
    logger.info({
      // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
      event: 'profile.transaction.completed',
      // I am keeping this line here because the surrounding profileSyncService.js workflow expects this value or operation before it continues.
      transactionId,
      // I am keeping this line here because the surrounding profileSyncService.js workflow expects this value or operation before it continues.
      userId,
      // I am keeping the `fields` field in this object so the receiving code can read that value by its expected name.
      fields: Object.keys(processedPatch)
    // I am keeping this line here because the surrounding profileSyncService.js workflow expects this value or operation before it continues.
    }, 'Transactional profile update completed successfully');

    // Store outbox event for reliable delivery
    try {
      // I am waiting for this asynchronous step here so the next line does not use its result before it is ready.
      await storeEvent('profile.updated', {
        // I am keeping this line here because the surrounding profileSyncService.js workflow expects this value or operation before it continues.
        userId,
        // I am keeping the `profileId` field in this object so the receiving code can read that value by its expected name.
        profileId: updatedProfile.id,
        // I am keeping the `changes` field in this object so the receiving code can read that value by its expected name.
        changes: patch,
        // I am keeping this line here because the surrounding profileSyncService.js workflow expects this value or operation before it continues.
        transactionId
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      });
      
      // I am calling this helper here so the current workflow performs this step before it moves on.
      logger.debug({
        // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
        event: 'profile.outbox_stored',
        // I am keeping this line here because the surrounding profileSyncService.js workflow expects this value or operation before it continues.
        userId,
        // I am keeping this line here because the surrounding profileSyncService.js workflow expects this value or operation before it continues.
        transactionId
      // I am keeping this line here because the surrounding profileSyncService.js workflow expects this value or operation before it continues.
      }, 'Profile update event stored in outbox');
    // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
    } catch (outboxError) {
      // Log outbox error but don't fail the transaction
      logger.warn({
        // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
        event: 'profile.outbox_failed',
        // I am keeping this line here because the surrounding profileSyncService.js workflow expects this value or operation before it continues.
        userId,
        // I am keeping this line here because the surrounding profileSyncService.js workflow expects this value or operation before it continues.
        transactionId,
        // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
        error: outboxError.message
      // I am keeping this line here because the surrounding profileSyncService.js workflow expects this value or operation before it continues.
      }, 'Failed to store profile update event in outbox');
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // This return sends the completed value or response back to the code that called this function.
    return updatedProfile;
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (error) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.error({
      // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
      event: 'profile.transaction.failed',
      // I am keeping this line here because the surrounding profileSyncService.js workflow expects this value or operation before it continues.
      transactionId,
      // I am keeping this line here because the surrounding profileSyncService.js workflow expects this value or operation before it continues.
      userId,
      // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
      error: error.message
    // I am keeping this line here because the surrounding profileSyncService.js workflow expects this value or operation before it continues.
    }, 'Transactional profile update failed');
    // I am stopping this path with the existing error here because the caller should not continue with an invalid result.
    throw error;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * WHAT:
 * Background job to reconcile auth.users with profiles table.
 * 
 * WHY:
 * Detect and fix any inconsistencies between auth.users and profiles.
 * Provides eventual consistency guarantee.
 * 
 * HOW:
 * Query both tables, compare key fields, log discrepancies.
 * Can be run periodically or on-demand.
 * 
 * @param {string} userId - Optional: check specific user, or null for all
 * @returns {Promise<Object>} Reconciliation report
 */
async function reconcileProfileData(userId = null) {
  // I am calling this helper here so the current workflow performs this step before it moves on.
  logger.info({
    // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
    event: 'profile.reconcile.started',
    // I am keeping the `userId` field in this object so the receiving code can read that value by its expected name.
    userId: userId || 'all_users'
  // I am keeping this line here because the surrounding profileSyncService.js workflow expects this value or operation before it continues.
  }, 'Starting profile reconciliation');

  // I am saving `report` here so the nearby steps can reuse the same value without rebuilding it each time.
  const report = {
    // I am keeping the `checked` field in this object so the receiving code can read that value by its expected name.
    checked: 0,
    // I am keeping the `inconsistencies` field in this object so the receiving code can read that value by its expected name.
    inconsistencies: 0,
    // I am keeping the `errors` field in this object so the receiving code can read that value by its expected name.
    errors: 0,
    // I am keeping the `details` field in this object so the receiving code can read that value by its expected name.
    details: []
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  };

  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // Get profiles to check
    let profilesToCheck;
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (userId) {
      // I am saving `data` here so the nearby steps can reuse the same value without rebuilding it each time.
      const { data, error } = await supabaseAdmin
        // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
        .from('profiles')
        // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
        .select('user_id, display_name_override, phone, given_name, family_name')
        // I am continuing the existing call chain here so this option stays attached to the same operation started above.
        .eq('user_id', userId)
        // I am continuing the existing call chain here so this option stays attached to the same operation started above.
        .single();
      
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (error) throw error;
      // I am keeping this line here because the surrounding profileSyncService.js workflow expects this value or operation before it continues.
      profilesToCheck = [data];
    // This alternative runs only when the condition above did not use its first path.
    } else {
      // I am saving `data` here so the nearby steps can reuse the same value without rebuilding it each time.
      const { data, error } = await supabaseAdmin
        // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
        .from('profiles')
        // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
        .select('user_id, display_name_override, phone, given_name, family_name')
        .limit(100); // Process in batches
      
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (error) throw error;
      // I am keeping this line here because the surrounding profileSyncService.js workflow expects this value or operation before it continues.
      profilesToCheck = data || [];
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // I am repeating the next block one item at a time so every value in the existing collection receives the same handling.
    for (const profile of profilesToCheck) {
      // I am keeping this line here because the surrounding profileSyncService.js workflow expects this value or operation before it continues.
      report.checked++;
      
      // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
      try {
        // Get corresponding auth user
        const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.getUserById(profile.user_id);
        
        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (authError) {
          // I am keeping this line here because the surrounding profileSyncService.js workflow expects this value or operation before it continues.
          report.errors++;
          // I am calling this helper here so the current workflow performs this step before it moves on.
          report.details.push({
            // I am keeping the `userId` field in this object so the receiving code can read that value by its expected name.
            userId: profile.user_id,
            // I am keeping the `issue` field in this object so the receiving code can read that value by its expected name.
            issue: 'auth_user_not_found',
            // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
            error: authError.message
          // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
          });
          // I am changing the loop flow here once the condition above has decided this item needs no further work in this pass.
          continue;
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }

        // Compare key fields
        const authDisplayName = authUser.user_metadata?.display_name || null;
        // I am saving `authPhone` here so the nearby steps can reuse the same value without rebuilding it each time.
        const authPhone = authUser.phone || null;
        // I am saving `profileDisplayName` here so the nearby steps can reuse the same value without rebuilding it each time.
        const profileDisplayName = profile.display_name_override || null;
        // I am saving `profilePhone` here so the nearby steps can reuse the same value without rebuilding it each time.
        const profilePhone = profile.phone || null;

        // I am saving `inconsistent` here so the nearby steps can reuse the same value without rebuilding it each time.
        const inconsistent = authDisplayName !== profileDisplayName || authPhone !== profilePhone;
        
        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (inconsistent) {
          // I am keeping this line here because the surrounding profileSyncService.js workflow expects this value or operation before it continues.
          report.inconsistencies++;
          // I am calling this helper here so the current workflow performs this step before it moves on.
          report.details.push({
            // I am keeping the `userId` field in this object so the receiving code can read that value by its expected name.
            userId: profile.user_id,
            // I am keeping the `issue` field in this object so the receiving code can read that value by its expected name.
            issue: 'data_mismatch',
            // I am keeping the `auth` field in this object so the receiving code can read that value by its expected name.
            auth: { display_name: authDisplayName, phone: authPhone },
            // I am keeping the `profile` field in this object so the receiving code can read that value by its expected name.
            profile: { display_name: profileDisplayName, phone: profilePhone }
          // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
          });
          
          // I am calling this helper here so the current workflow performs this step before it moves on.
          logger.warn({
            // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
            event: 'profile.reconcile.inconsistency_found',
            // I am keeping the `userId` field in this object so the receiving code can read that value by its expected name.
            userId: profile.user_id,
            // I am keeping the `authData` field in this object so the receiving code can read that value by its expected name.
            authData: { display_name: authDisplayName, phone: authPhone },
            // I am keeping the `profileData` field in this object so the receiving code can read that value by its expected name.
            profileData: { display_name: profileDisplayName, phone: profilePhone }
          // I am keeping this line here because the surrounding profileSyncService.js workflow expects this value or operation before it continues.
          }, 'Profile data inconsistency detected');
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }
      // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
      } catch (error) {
        // I am keeping this line here because the surrounding profileSyncService.js workflow expects this value or operation before it continues.
        report.errors++;
        // I am calling this helper here so the current workflow performs this step before it moves on.
        report.details.push({
          // I am keeping the `userId` field in this object so the receiving code can read that value by its expected name.
          userId: profile.user_id,
          // I am keeping the `issue` field in this object so the receiving code can read that value by its expected name.
          issue: 'check_error',
          // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
          error: error.message
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        });
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.info({
      // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
      event: 'profile.reconcile.completed',
      // I am keeping the `report` field in this object so the receiving code can read that value by its expected name.
      report: {
        // I am keeping the `checked` field in this object so the receiving code can read that value by its expected name.
        checked: report.checked,
        // I am keeping the `inconsistencies` field in this object so the receiving code can read that value by its expected name.
        inconsistencies: report.inconsistencies,
        // I am keeping the `errors` field in this object so the receiving code can read that value by its expected name.
        errors: report.errors
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // I am keeping this line here because the surrounding profileSyncService.js workflow expects this value or operation before it continues.
    }, 'Profile reconciliation completed');

    // This return sends the completed value or response back to the code that called this function.
    return report;
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (error) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.error({
      // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
      event: 'profile.reconcile.failed',
      // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
      error: error.message
    // I am keeping this line here because the surrounding profileSyncService.js workflow expects this value or operation before it continues.
    }, 'Profile reconciliation failed');
    // I am stopping this path with the existing error here because the caller should not continue with an invalid result.
    throw error;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am exporting this value here so another module can deliberately reuse the completed piece from profileSyncService.js.
module.exports = {
  // I am keeping this line here because the surrounding profileSyncService.js workflow expects this value or operation before it continues.
  updateProfileTransactional,
  // I am keeping this line here because the surrounding profileSyncService.js workflow expects this value or operation before it continues.
  reconcileProfileData
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
};
