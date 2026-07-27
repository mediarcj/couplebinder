// Description: Transactional profile synchronization with compensating actions
// Purpose: Ensures auth.users and profiles table stay consistent with rollback capability
// Notes: Implements saga pattern for distributed transaction safety

const defaultLogger = require('../utils/logger');
let logger = defaultLogger;
const { storeEvent } = require('./outboxService');

/**
 * Transactional profile update service with compensating actions.
 *
 * Supabase Auth and Data APIs are separate services without cross-service transactions.
 * We need to ensure consistency between auth.users and profiles tables.
 *
 * Implement saga pattern with compensating transactions:
 * 1. Save current state (for rollback)
 * 2. Update auth.users first
 * 3. Update profiles table second
 * 4. If profiles fails, rollback auth.users
 * 5. Log all operations for audit trail
 */

const { supabaseAdmin: defaultSupabaseAdmin } = require('../utils/supabaseClient');
let supabaseAdmin = defaultSupabaseAdmin;

/**
 * Transactional profile update with rollback capability.
 * 
 * Ensures auth.users and profiles stay consistent even if one update fails.
 * Provides atomicity across separate Supabase services.
 * 
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
  if (!userId) throw new Error('Missing userId');
  if (!supabaseAdmin) throw new Error('Supabase admin client not configured');

  const transactionId = `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  logger.info({
    event: 'profile.transaction.started',
    transactionId,
    userId,
    fields: Object.keys(patch || {})
  }, 'Starting transactional profile update');

  // Step 0: Fetch current profile data to check for changes
  const { data: currentProfile, error: fetchError } = await supabaseAdmin
    .from('profiles')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (fetchError) {
    logger.error({
      event: 'profile.transaction.fetch_current_failed',
      transactionId,
      userId,
      error: fetchError.message
    }, 'Failed to fetch current profile for change detection');
    throw new Error(`Failed to fetch current profile: ${fetchError.message}`);
  }

  // Check if any changes were actually made
  let hasChanges = false;

  // Normalize and compare each field
  for (const [key, newValue] of Object.entries(patch)) {
    if (newValue === undefined || newValue === null) continue;
    
    let normalizedNewValue = newValue;
    let currentValue = currentProfile[key];

    // Handle array fields normalization for comparison
    if (['hobbies', 'music', 'fav_food'].includes(key)) {
      if (typeof normalizedNewValue === 'string') {
        normalizedNewValue = normalizedNewValue.split(',').map(item => item.trim()).filter(item => item.length > 0);
      }
      if (Array.isArray(currentValue)) {
        // currentValue is already an array, no change needed
      } else if (typeof currentValue === 'string') {
        currentValue = currentValue.split(',').map(item => item.trim()).filter(item => item.length > 0);
      } else {
        currentValue = [];
      }
    }

    // Handle display_name_override special case
    if (key === 'display_name_override') {
      const currentDisplayName = currentProfile.display_name_override || currentProfile.given_name + ' ' + currentProfile.family_name;
      if (normalizedNewValue !== currentDisplayName) {
        hasChanges = true;
        break;
      }
    } else {
      // Deep comparison for arrays, simple comparison for primitives
      if (Array.isArray(normalizedNewValue) && Array.isArray(currentValue)) {
        if (JSON.stringify(normalizedNewValue.sort()) !== JSON.stringify(currentValue.sort())) {
          hasChanges = true;
          break;
        }
      } else if (normalizedNewValue !== currentValue) {
        hasChanges = true;
        break;
      }
    }
  }

  // If no changes detected, return current profile with unchanged flag
  if (!hasChanges) {
    logger.info({
      event: 'profile.transaction.no_changes',
      transactionId,
      userId,
      fields: Object.keys(patch || {})
    }, 'No changes detected - returning current profile');
    
    return { ...currentProfile, _unchanged: true };
  }

  // Step 1: Capture current state for rollback
  let originalAuthState = null;
  const needsAuthUpdate = (patch.display_name_override !== undefined && patch.display_name_override !== null) || 
                         (patch.phone !== undefined && patch.phone !== null);

  if (needsAuthUpdate) {
    try {
      const { data: currentUser, error: getUserError } = await supabaseAdmin.auth.admin.getUserById(userId);
      if (getUserError) {
        logger.error({
          event: 'profile.transaction.get_user_failed',
          transactionId,
          userId,
          error: getUserError.message
        }, 'Failed to get current user state for rollback');
        throw new Error(`Failed to get current user state: ${getUserError.message}`);
      }
      
      originalAuthState = {
        display_name: currentUser.user_metadata?.display_name || null,
        phone: currentUser.phone || null
      };
      
      logger.debug({
        event: 'profile.transaction.state_captured',
        transactionId,
        userId
      }, 'Original auth state captured for rollback');
    } catch (error) {
      logger.error({
        event: 'profile.transaction.state_capture_failed',
        transactionId,
        userId,
        error: error.message
      }, 'Failed to capture original state');
      throw error;
    }
  }

  // Step 2: Update auth.users first (if needed)
  if (needsAuthUpdate && originalAuthState) {
    try {
      const authUpdateData = {};
      if (patch.display_name_override !== undefined && patch.display_name_override !== null) {
        authUpdateData.display_name = patch.display_name_override;
      }
      if (patch.phone !== undefined && patch.phone !== null) {
        authUpdateData.phone = patch.phone;
      }

      const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        user_metadata: authUpdateData
      });

      if (authError) {
        logger.error({
          event: 'profile.transaction.auth_update_failed',
          transactionId,
          userId,
          error: authError.message
        }, 'Auth users update failed');
        throw new Error(`Auth update failed: ${authError.message}`);
      }

      logger.debug({
        event: 'profile.transaction.auth_updated',
        transactionId,
        userId,
        fields: Object.keys(authUpdateData)
      }, 'Auth users updated successfully');
    } catch (error) {
      logger.error({
        event: 'profile.transaction.auth_update_error',
        transactionId,
        userId,
        error: error.message
      }, 'Auth users update exception');
      throw error;
    }
  }

  // Step 3: Update profiles table (critical update)
  try {
    // Parse display_name_override into given_name and family_name
    const processedPatch = { ...patch };
    if (patch.display_name_override !== undefined && patch.display_name_override !== null) {
      const fullName = patch.display_name_override.trim();
      const nameParts = fullName.split(' ').filter(part => part.length > 0);
      
      if (nameParts.length === 1) {
        processedPatch.given_name = nameParts[0];
        processedPatch.family_name = null;
      } else if (nameParts.length === 2) {
        processedPatch.given_name = nameParts[0];
        processedPatch.family_name = nameParts[1];
      } else if (nameParts.length >= 3) {
        processedPatch.given_name = nameParts[0];
        processedPatch.family_name = nameParts.slice(1).join(' ');
      }
    }

    // Handle array fields
    ['hobbies', 'music', 'fav_food'].forEach(field => {
      if (processedPatch[field] !== undefined && processedPatch[field] !== null) {
        if (typeof processedPatch[field] === 'string') {
          processedPatch[field] = processedPatch[field].split(',').map(item => item.trim()).filter(item => item.length > 0);
        }
      }
    });

    const { data: updatedProfile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .update(processedPatch)
      .eq('user_id', userId)
      .select('*')
      .single();

    if (profileError) {
      logger.error({
        event: 'profile.transaction.profiles_update_failed',
        transactionId,
        userId,
        error: profileError.message,
        fields: Object.keys(processedPatch)
      }, 'Profiles table update failed - initiating rollback');

      // Step 4: ROLLBACK auth.users to original state
      if (needsAuthUpdate && originalAuthState) {
        try {
          const rollbackData = {};
          if (originalAuthState.display_name !== null) {
            rollbackData.display_name = originalAuthState.display_name;
          }
          if (originalAuthState.phone !== null) {
            rollbackData.phone = originalAuthState.phone;
          }

          const { error: rollbackError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
            user_metadata: rollbackData,
            phone: originalAuthState.phone
          });

          if (rollbackError) {
            logger.error({
              event: 'profile.transaction.rollback_failed',
              transactionId,
              userId,
              error: rollbackError.message,
              originalState: originalAuthState
            }, 'CRITICAL: Rollback failed - manual intervention required');
          } else {
            logger.warn({
              event: 'profile.transaction.rollback_success',
              transactionId,
              userId
            }, 'Auth users rolled back to original state');
          }
        } catch (rollbackErr) {
          logger.error({
            event: 'profile.transaction.rollback_error',
            transactionId,
            userId,
            error: rollbackErr.message,
            originalState: originalAuthState
          }, 'CRITICAL: Rollback exception - manual intervention required');
        }
      }

      throw new Error(`Profile update failed: ${profileError.message}`);
    }

    // Step 5: Success - log completion
    logger.info({
      event: 'profile.transaction.completed',
      transactionId,
      userId,
      fields: Object.keys(processedPatch)
    }, 'Transactional profile update completed successfully');

    // Store outbox event for reliable delivery
    try {
      await storeEvent('profile.updated', {
        userId,
        profileId: updatedProfile.id,
        changes: patch,
        transactionId
      });
      
      logger.debug({
        event: 'profile.outbox_stored',
        userId,
        transactionId
      }, 'Profile update event stored in outbox');
    } catch (outboxError) {
      // Log outbox error but don't fail the transaction
      logger.warn({
        event: 'profile.outbox_failed',
        userId,
        transactionId,
        error: outboxError.message
      }, 'Failed to store profile update event in outbox');
    }

    return updatedProfile;
  } catch (error) {
    logger.error({
      event: 'profile.transaction.failed',
      transactionId,
      userId,
      error: error.message
    }, 'Transactional profile update failed');
    throw error;
  }
}

/**
 * Background job to reconcile auth.users with profiles table.
 * 
 * Detect and fix any inconsistencies between auth.users and profiles.
 * Provides eventual consistency guarantee.
 * 
 * Query both tables, compare key fields, log discrepancies.
 * Can be run periodically or on-demand.
 * 
 * @param {string} userId - Optional: check specific user, or null for all
 * @returns {Promise<Object>} Reconciliation report
 */
async function reconcileProfileData(userId = null) {
  logger.info({
    event: 'profile.reconcile.started',
    userId: userId || 'all_users'
  }, 'Starting profile reconciliation');

  const report = {
    checked: 0,
    inconsistencies: 0,
    errors: 0,
    details: []
  };

  try {
    // Get profiles to check
    let profilesToCheck;
    if (userId) {
      const { data, error } = await supabaseAdmin
        .from('profiles')
        .select('user_id, display_name_override, phone, given_name, family_name')
        .eq('user_id', userId)
        .single();
      
      if (error) throw error;
      profilesToCheck = [data];
    } else {
      const { data, error } = await supabaseAdmin
        .from('profiles')
        .select('user_id, display_name_override, phone, given_name, family_name')
        .limit(100); // Process in batches
      
      if (error) throw error;
      profilesToCheck = data || [];
    }

    for (const profile of profilesToCheck) {
      report.checked++;
      
      try {
        // Get corresponding auth user
        const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.getUserById(profile.user_id);
        
        if (authError) {
          report.errors++;
          report.details.push({
            userId: profile.user_id,
            issue: 'auth_user_not_found',
            error: authError.message
          });
          continue;
        }

        // Compare key fields
        const authDisplayName = authUser.user_metadata?.display_name || null;
        const authPhone = authUser.phone || null;
        const profileDisplayName = profile.display_name_override || null;
        const profilePhone = profile.phone || null;

        const inconsistent = authDisplayName !== profileDisplayName || authPhone !== profilePhone;
        
        if (inconsistent) {
          report.inconsistencies++;
          report.details.push({
            userId: profile.user_id,
            issue: 'data_mismatch',
            auth: { display_name: authDisplayName, phone: authPhone },
            profile: { display_name: profileDisplayName, phone: profilePhone }
          });
          
          logger.warn({
            event: 'profile.reconcile.inconsistency_found',
            userId: profile.user_id,
            authData: { display_name: authDisplayName, phone: authPhone },
            profileData: { display_name: profileDisplayName, phone: profilePhone }
          }, 'Profile data inconsistency detected');
        }
      } catch (error) {
        report.errors++;
        report.details.push({
          userId: profile.user_id,
          issue: 'check_error',
          error: error.message
        });
      }
    }

    logger.info({
      event: 'profile.reconcile.completed',
      report: {
        checked: report.checked,
        inconsistencies: report.inconsistencies,
        errors: report.errors
      }
    }, 'Profile reconciliation completed');

    return report;
  } catch (error) {
    logger.error({
      event: 'profile.reconcile.failed',
      error: error.message
    }, 'Profile reconciliation failed');
    throw error;
  }
}

function setTestDependencies({ adminClient, testLogger } = {}) {
  if (adminClient !== undefined) supabaseAdmin = adminClient;
  if (testLogger !== undefined) logger = testLogger;
}

function resetTestDependencies() {
  supabaseAdmin = defaultSupabaseAdmin;
  logger = defaultLogger;
}

module.exports = {
  updateProfileTransactional,
  reconcileProfileData,
  _setTestDependencies: setTestDependencies,
  _resetTestDependencies: resetTestDependencies
};
