const express = require('express');
const router = express.Router();

const { getProfileByUserId } = require('../services/profileService');
const { updateProfileTransactional, reconcileProfileData } = require('../services/profileSyncService');
const validateProfileUpdate = require('../middleware/validateProfileUpdate');
const { createIdempotencyMiddleware } = require('../middleware/idempotency');
const logger = require('../utils/logger');
const { assertUser } = require('../utils/authz');

// GET /api/profile/me  -> return your own profile
router.get('/me', async (req, res) => {
  // Pass the caller's access token into the profile service so database row-level security
  // can enforce the same identity that the route authenticated.
  try {
    const user = assertUser(req);
    const userId = user.id;

    // Extract user access token for RLS-compliant profile fetching
    const userAccessToken = req.cookies?.['sb-access-token'] || 
                           (req.headers.authorization?.startsWith('Bearer ') ? 
                            req.headers.authorization.slice(7) : null);
    const profile = await getProfileByUserId(userId, userAccessToken);
    if (!profile) return res.status(404).json({ success: false, message: 'Profile not found' });

    res.json({ success: true, profile });
  } catch (e) {
    logger.error({
      event: 'profile.get.error',
      error: e.message,
      requestId: req.requestId
    }, 'Failed to load profile');
    res.status(500).json({ success: false, message: 'Failed to load profile' });
  }
});

// Create idempotency middleware for profile updates
const profileIdempotency = createIdempotencyMiddleware({
  ttl: 3600, // 1 hour
  headerName: 'Idempotency-Key'
});

// PUT /api/profile/me -> update your own profile with idempotency protection
router.put('/me', profileIdempotency, validateProfileUpdate, async (req, res) => {
  // Validation builds an allowlisted patch, then the service coordinates the profile row
  // with Supabase Auth metadata and compensates if the second system fails.
  try {
    const user = assertUser(req);
    const userId = user.id;

    // Use the validated patch data from middleware
    // Use transactional service for consistency across auth.users and profiles
    const updated = await updateProfileTransactional(userId, req.profilePatch);
    
    /**
     * Check if data was unchanged and return appropriate response.
     * 
     * Better UX - tell frontend "no change" so it can show proper message.
     * Backend is source of truth for what changed (Building Law #9).
     * 
     * Service returns _unchanged flag if no fields changed.
     * API passes this to frontend as unchanged: true.
     * Frontend shows "No changes made" instead of "Updated successfully".
     */
    if (updated._unchanged) {
      // Remove internal flag before sending to client
      const { _unchanged, ...cleanProfile } = updated;
      return res.json({ 
        success: true, 
        profile: cleanProfile, 
        unchanged: true 
      });
    }
    
    res.json({ success: true, profile: updated });
  } catch (e) {
    logger.error({
      event: 'profile.update.error',
      error: e.message,
      requestId: req.requestId
    }, 'Profile update failed');
    
    res.status(400).json({ success: false, message: 'Update failed' });
  }
});

/**
 * POST /api/profile/reconcile -> check profile data consistency
 * 
 * Administrative endpoint to check and report profile data consistency.
 * 
 * Allows manual verification of auth.users and profiles synchronization.
 * Helps detect any inconsistencies that need manual intervention.
 * 
 * Compares auth.users and profiles data for current user.
 * Returns detailed report of any discrepancies found.
 */
router.post('/reconcile', async (req, res) => {
  try {
    const user = assertUser(req);
    const userId = user.id;

    logger.info({
      event: 'profile.reconcile.requested',
      userId,
      requestId: req.requestId
    }, 'Profile reconciliation requested by user');

    const report = await reconcileProfileData(userId);
    
    res.json({
      success: true,
      report,
      message: report.inconsistencies > 0 
        ? 'Inconsistencies detected - check report details'
        : 'Profile data is consistent'
    });
  } catch (error) {
    logger.error({
      event: 'profile.reconcile.error',
      error: error.message,
      requestId: req.requestId
    }, 'Profile reconciliation failed');
    
    res.status(500).json({
      success: false,
      message: 'Reconciliation failed'
    });
  }
});

module.exports = router;