// File: server/db/repo/quotasRepo.js
// Description: Quota management with race condition protection
// Purpose: Implements atomic quota checking and consumption to prevent race conditions
// Notes: Uses database transactions and atomic operations for thread-safe quota management

const { db } = require('../connection');

/**
 * WHAT:
 * We manage user quotas with atomic operations to prevent race conditions.
 *
 * WHY:
 * Multiple requests can hit simultaneously and cause quota bypass if not handled atomically.
 * We need to check and consume quotas in a single atomic operation.
 *
 * HOW:
 * We use database transactions with row locking to ensure only one request can
 * consume a quota slot at a time, preventing double-consumption.
 */

/**
 * Check and consume a quota slot atomically
 * @param {string} userId - User ID or IP address for quota tracking
 * @param {string} quotaType - Type of quota (e.g., 'submissions', 'api_calls')
 * @param {number} limit - Maximum allowed quota
 * @param {Object} trxOrDb - Knex transaction or database instance
 * @returns {Object} Result with success status and remaining quota
 */
async function checkAndConsumeQuota(userId, quotaType, limit, trxOrDb = db) {
  // CRITICAL SECTION: atomic quota check and consume
  // We use a transaction with row locking to prevent race conditions
  // where multiple requests could bypass quota limits simultaneously
  
  return await trxOrDb.transaction(async (trx) => {
    // Lock the quota row for this user/type to prevent concurrent modifications
    const quotaRow = await trx('quotas')
      .where({ user_id: userId, quota_type: quotaType })
      .forUpdate()
      .first();

    if (!quotaRow) {
      // First quota check for this user/type - create with 1 used
      if (limit <= 0) {
        throw new Error('Quota limit must be greater than 0');
      }
      
      await trx('quotas').insert({
        user_id: userId,
        quota_type: quotaType,
        limit: limit,
        used: 1,
        created_at: trx.fn.now(),
        updated_at: trx.fn.now()
      });
      
      return {
        success: true,
        remaining: limit - 1,
        used: 1,
        limit: limit
      };
    }

    // Check if quota would be exceeded
    if (quotaRow.used >= quotaRow.limit) {
      return {
        success: false,
        remaining: 0,
        used: quotaRow.used,
        limit: quotaRow.limit,
        error: 'Quota limit exceeded'
      };
    }

    // Atomically increment used count
    const [updatedRow] = await trx('quotas')
      .where({ user_id: userId, quota_type: quotaType })
      .update({
        used: trx.raw('used + 1'),
        updated_at: trx.fn.now()
      })
      .returning(['used', 'limit']);

    return {
      success: true,
      remaining: updatedRow.limit - updatedRow.used,
      used: updatedRow.used,
      limit: updatedRow.limit
    };
  });
}

/**
 * Get current quota status without consuming
 * @param {string} userId - User ID or IP address for quota tracking
 * @param {string} quotaType - Type of quota
 * @param {Object} trxOrDb - Knex transaction or database instance
 * @returns {Object} Current quota status
 */
async function getQuotaStatus(userId, quotaType, trxOrDb = db) {
  const quotaRow = await trxOrDb('quotas')
    .where({ user_id: userId, quota_type: quotaType })
    .first();

  if (!quotaRow) {
    return {
      used: 0,
      limit: 0,
      remaining: 0
    };
  }

  return {
    used: quotaRow.used,
    limit: quotaRow.limit,
    remaining: Math.max(0, quotaRow.limit - quotaRow.used)
  };
}

/**
 * Reset quota for a user/type
 * @param {string} userId - User ID or IP address
 * @param {string} quotaType - Type of quota
 * @param {Object} trxOrDb - Knex transaction or database instance
 * @returns {Object} Result of reset operation
 */
async function resetQuota(userId, quotaType, trxOrDb = db) {
  const result = await trxOrDb('quotas')
    .where({ user_id: userId, quota_type: quotaType })
    .update({
      used: 0,
      updated_at: trxOrDb.fn.now()
    });

  return {
    success: result > 0,
    message: result > 0 ? 'Quota reset successfully' : 'No quota found to reset'
  };
}

module.exports = {
  checkAndConsumeQuota,
  getQuotaStatus,
  resetQuota
};
