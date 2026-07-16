//File: server/routes/profile.js
const express = require('express');
// I am saving `router` here so the nearby steps can reuse the same value without rebuilding it each time.
const router = express.Router();

// I am loading `../services/profileService` into `getProfileByUserId` so this file can reuse that dependency below.
const { getProfileByUserId } = require('../services/profileService');
// I am loading `../services/profileSyncService` into `updateProfileTransactional` so this file can reuse that dependency below.
const { updateProfileTransactional, reconcileProfileData } = require('../services/profileSyncService');
// I am loading `../middleware/validateProfileUpdate` into `validateProfileUpdate` so this file can reuse that dependency below.
const validateProfileUpdate = require('../middleware/validateProfileUpdate');
// I am loading `../middleware/idempotency` into `createIdempotencyMiddleware` so this file can reuse that dependency below.
const { createIdempotencyMiddleware } = require('../middleware/idempotency');
// I am loading `../utils/logger` into `logger` so this file can reuse that dependency below.
const logger = require('../utils/logger');
// I am loading `../utils/authz` into `assertUser` so this file can reuse that dependency below.
const { assertUser } = require('../utils/authz');

// GET /api/profile/me  -> return your own profile
router.get('/me', async (req, res) => {
  // Pass the caller's access token into the profile service so database row-level security
  // can enforce the same identity that the route authenticated.
  try {
    // I am saving `user` here so the nearby steps can reuse the same value without rebuilding it each time.
    const user = assertUser(req);
    // I am saving `userId` here so the nearby steps can reuse the same value without rebuilding it each time.
    const userId = user.id;

    // Extract user access token for RLS-compliant profile fetching
    const userAccessToken = req.cookies?.['sb-access-token'] || 
                           // I am keeping this line here because the surrounding profile.js workflow expects this value or operation before it continues.
                           (req.headers.authorization?.startsWith('Bearer ') ? 
                            // I am calling this helper here so the current workflow performs this step before it moves on.
                            req.headers.authorization.slice(7) : null);
    // I am saving `profile` here so the nearby steps can reuse the same value without rebuilding it each time.
    const profile = await getProfileByUserId(userId, userAccessToken);
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!profile) return res.status(404).json({ success: false, message: 'Profile not found' });

    // I am building or sending the Express response here with the status, data, or page already chosen by this route.
    res.json({ success: true, profile });
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (e) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.error({
      // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
      event: 'profile.get.error',
      // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
      error: e.message,
      // I am keeping the `requestId` field in this object so the receiving code can read that value by its expected name.
      requestId: req.requestId
    // I am keeping this line here because the surrounding profile.js workflow expects this value or operation before it continues.
    }, 'Failed to load profile');
    // I am building or sending the Express response here with the status, data, or page already chosen by this route.
    res.status(500).json({ success: false, message: 'Failed to load profile' });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
});

// Create idempotency middleware for profile updates
const profileIdempotency = createIdempotencyMiddleware({
  ttl: 3600, // 1 hour
  // I am keeping the `headerName` field in this object so the receiving code can read that value by its expected name.
  headerName: 'Idempotency-Key'
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
});

// PUT /api/profile/me -> update your own profile with idempotency protection
router.put('/me', profileIdempotency, validateProfileUpdate, async (req, res) => {
  // Validation builds an allowlisted patch, then the service coordinates the profile row
  // with Supabase Auth metadata and compensates if the second system fails.
  try {
    // I am saving `user` here so the nearby steps can reuse the same value without rebuilding it each time.
    const user = assertUser(req);
    // I am saving `userId` here so the nearby steps can reuse the same value without rebuilding it each time.
    const userId = user.id;

    // Use the validated patch data from middleware
    // Use transactional service for consistency across auth.users and profiles
    const updated = await updateProfileTransactional(userId, req.profilePatch);
    
    /**
     * WHAT:
     * Check if data was unchanged and return appropriate response.
     * 
     * WHY:
     * Better UX - tell frontend "no change" so it can show proper message.
     * Backend is source of truth for what changed (Building Law #9).
     * 
     * HOW:
     * Service returns _unchanged flag if no fields changed.
     * API passes this to frontend as unchanged: true.
     * Frontend shows "No changes made" instead of "Updated successfully".
     */
    if (updated._unchanged) {
      // Remove internal flag before sending to client
      const { _unchanged, ...cleanProfile } = updated;
      // This return sends the completed value or response back to the code that called this function.
      return res.json({ 
        // I am keeping the `success` field in this object so the receiving code can read that value by its expected name.
        success: true, 
        // I am keeping the `profile` field in this object so the receiving code can read that value by its expected name.
        profile: cleanProfile, 
        // I am keeping the `unchanged` field in this object so the receiving code can read that value by its expected name.
        unchanged: true 
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      });
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    
    // I am building or sending the Express response here with the status, data, or page already chosen by this route.
    res.json({ success: true, profile: updated });
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (e) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.error({
      // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
      event: 'profile.update.error',
      // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
      error: e.message,
      // I am keeping the `requestId` field in this object so the receiving code can read that value by its expected name.
      requestId: req.requestId
    // I am keeping this line here because the surrounding profile.js workflow expects this value or operation before it continues.
    }, 'Profile update failed');
    
    // I am building or sending the Express response here with the status, data, or page already chosen by this route.
    res.status(400).json({ success: false, message: 'Update failed' });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
});

/**
 * POST /api/profile/reconcile -> check profile data consistency
 * 
 * WHAT:
 * Administrative endpoint to check and report profile data consistency.
 * 
 * WHY:
 * Allows manual verification of auth.users and profiles synchronization.
 * Helps detect any inconsistencies that need manual intervention.
 * 
 * HOW:
 * Compares auth.users and profiles data for current user.
 * Returns detailed report of any discrepancies found.
 */
router.post('/reconcile', async (req, res) => {
  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // I am saving `user` here so the nearby steps can reuse the same value without rebuilding it each time.
    const user = assertUser(req);
    // I am saving `userId` here so the nearby steps can reuse the same value without rebuilding it each time.
    const userId = user.id;

    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.info({
      // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
      event: 'profile.reconcile.requested',
      // I am keeping this line here because the surrounding profile.js workflow expects this value or operation before it continues.
      userId,
      // I am keeping the `requestId` field in this object so the receiving code can read that value by its expected name.
      requestId: req.requestId
    // I am keeping this line here because the surrounding profile.js workflow expects this value or operation before it continues.
    }, 'Profile reconciliation requested by user');

    // I am saving `report` here so the nearby steps can reuse the same value without rebuilding it each time.
    const report = await reconcileProfileData(userId);
    
    // I am building or sending the Express response here with the status, data, or page already chosen by this route.
    res.json({
      // I am keeping the `success` field in this object so the receiving code can read that value by its expected name.
      success: true,
      // I am keeping this line here because the surrounding profile.js workflow expects this value or operation before it continues.
      report,
      // I am keeping the `message` field in this object so the receiving code can read that value by its expected name.
      message: report.inconsistencies > 0 
        // I am keeping this line here because the surrounding profile.js workflow expects this value or operation before it continues.
        ? 'Inconsistencies detected - check report details'
        // I am keeping this line here because the surrounding profile.js workflow expects this value or operation before it continues.
        : 'Profile data is consistent'
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (error) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.error({
      // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
      event: 'profile.reconcile.error',
      // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
      error: error.message,
      // I am keeping the `requestId` field in this object so the receiving code can read that value by its expected name.
      requestId: req.requestId
    // I am keeping this line here because the surrounding profile.js workflow expects this value or operation before it continues.
    }, 'Profile reconciliation failed');
    
    // I am building or sending the Express response here with the status, data, or page already chosen by this route.
    res.status(500).json({
      // I am keeping the `success` field in this object so the receiving code can read that value by its expected name.
      success: false,
      // I am keeping the `message` field in this object so the receiving code can read that value by its expected name.
      message: 'Reconciliation failed'
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
});

// I am exporting this value here so another module can deliberately reuse the completed piece from profile.js.
module.exports = router;