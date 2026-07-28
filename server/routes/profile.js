const express = require('express');
const router = express.Router();

const { getProfileByUserId } = require('../services/profileService');
const { updateProfileTransactional, reconcileProfileData } = require('../services/profileSyncService');
const validateProfileUpdate = require('../middleware/validateProfileUpdate');
const { createIdempotencyMiddleware } = require('../middleware/idempotency');
const logger = require('../utils/logger');
const { assertUser } = require('../utils/authz');
const { getVerifiedAuth } = require('../lib/verifiedAuth');
const {
  PROFILE_STATUS,
  isEditableProfileResult
} = require('../services/profileResult');

function profileReader(req) {
  return req.app?.locals
    ?.getProfileByUserIdOverride ||
    getProfileByUserId;
}

function profileUpdater(req) {
  return req.app?.locals
    ?.updateProfileTransactionalOverride ||
    updateProfileTransactional;
}

function setPrivateNoStore(res) {
  res.set('Cache-Control', 'no-store');
  res.set('Pragma', 'no-cache');
}

function sendProfileUnavailable(res) {
  setPrivateNoStore(res);
  return res.status(503).json({
    success: false,
    error: 'profile_unavailable'
  });
}

// GET /api/profile/me  -> return your own profile
async function getOwnProfileHandler(req, res) {
  // Pass the caller's access token into the profile service so database row-level security
  // can enforce the same identity that the route authenticated.
  try {
    const user = assertUser(req);
    const userId = user.id;

    // Extract user access token for RLS-compliant profile fetching
    const userAccessToken = getVerifiedAuth(req)?.token || null;
    const result = await profileReader(req)(
      userId,
      userAccessToken
    );

    setPrivateNoStore(res);
    if (result.status === PROFILE_STATUS.notFound) {
      return res.status(404).json({
        success: false,
        error: 'profile_not_found'
      });
    }
    if (result.status !== PROFILE_STATUS.ok) {
      return sendProfileUnavailable(res);
    }

    return res.json({
      success: true,
      profile: result.profile
    });
  } catch {
    logger.warn({
      event: 'profile.get.error',
      requestId: req.requestId
    }, 'Failed to load profile');
    return sendProfileUnavailable(res);
  }
}

router.get('/me', getOwnProfileHandler);

// Create idempotency middleware for profile updates
const profileIdempotency = createIdempotencyMiddleware({
  ttl: 3600, // 1 hour
  headerName: 'Idempotency-Key'
});

async function requireEditableProfile(req, res, next) {
  try {
    const user = assertUser(req);
    const userAccessToken =
      getVerifiedAuth(req)?.token || null;
    const result = await profileReader(req)(
      user.id,
      userAccessToken
    );

    if (result.status === PROFILE_STATUS.notFound) {
      setPrivateNoStore(res);
      return res.status(404).json({
        success: false,
        error: 'profile_not_found'
      });
    }

    if (!isEditableProfileResult(result)) {
      return sendProfileUnavailable(res);
    }

    req.authoritativeProfile = result.profile;
    return next();
  } catch {
    logger.warn({
      event: 'profile.update.precondition_failed',
      requestId: req.requestId
    }, 'Profile update precondition failed');
    return sendProfileUnavailable(res);
  }
}

async function updateOwnProfileHandler(req, res) {
  setPrivateNoStore(res);
  // Validation builds an allowlisted patch, then the service coordinates the profile row
  // with Supabase Auth metadata and compensates if the second system fails.
  try {
    const user = assertUser(req);
    const userId = user.id;

    const updated = await profileUpdater(req)(
      userId,
      req.profilePatch
    );

    if (updated._unchanged) {
      const { _unchanged, ...cleanProfile } = updated;
      return res.json({
        success: true,
        profile: cleanProfile,
        unchanged: true
      });
    }

    return res.json({
      success: true,
      profile: updated
    });
  } catch {
    logger.error({
      event: 'profile.update.error',
      requestId: req.requestId
    }, 'Profile update failed');

    return res.status(503).json({
      success: false,
      error: 'profile_unavailable'
    });
  }
}

// PUT /api/profile/me -> update your own profile with idempotency protection
router.put(
  '/me',
  validateProfileUpdate,
  requireEditableProfile,
  profileIdempotency,
  updateOwnProfileHandler
);

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
module.exports._test = {
  getOwnProfileHandler,
  requireEditableProfile,
  updateOwnProfileHandler
};
