//File: server/routes/profile.js
const express = require('express');
const router = express.Router();

const { getProfileByUserId, updateOwnProfile } = require('../services/profileService');
const validateProfileUpdate = require('../middleware/validateProfileUpdate');
const { supabaseAdmin } = require('../utils/supabaseClient');
const logger = require('../utils/logger');

// GET /api/profile/me  -> return your own profile
router.get('/me', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, message: 'Authentication required' });

    // Extract user access token for RLS-compliant profile fetching
    const userAccessToken = req.cookies?.['sb-access-token'] || 
                           (req.headers.authorization?.startsWith('Bearer ') ? 
                            req.headers.authorization.slice(7) : null);
    const profile = await getProfileByUserId(userId, userAccessToken);
    if (!profile) return res.status(404).json({ success: false, message: 'Profile not found' });

    res.json({ success: true, profile });
  } catch (e) {
    console.error('GET /api/profile/me error:', e);
    res.status(500).json({ success: false, message: 'Failed to load profile' });
  }
});

// PUT /api/profile/me -> update your own profile with idempotency protection
router.put('/me', validateProfileUpdate, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, message: 'Authentication required' });

    // Check for idempotency key (optional but recommended)
    const idemKey = req.get('x-idempotency-key') || req.get('idempotency-key');
    
    if (idemKey) {
      // Check if this request was already processed
      const { data: existing } = await supabaseAdmin
        .from('idempotency_keys')
        .select('key')
        .eq('key', idemKey)
        .eq('user_id', userId)
        .maybeSingle();
      
      if (existing) {
        logger.info({
          event: 'profile.update.duplicate',
          userId,
          idemKey,
          requestId: req.requestId
        }, 'Duplicate request detected (idempotency)');
        
        // Return 204 No Content for duplicate requests
        return res.status(204).end();
      }
    }

    // Use the validated patch data from middleware
    const updated = await updateOwnProfile(userId, req.profilePatch);
    
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
      // Don't store idempotency key for unchanged requests
      return res.json({ 
        success: true, 
        profile: updated, 
        unchanged: true 
      });
    }
    
    // Store idempotency key after successful update
    if (idemKey) {
      await supabaseAdmin
        .from('idempotency_keys')
        .insert({
          key: idemKey,
          user_id: userId,
          operation: 'profile_update'
        })
        .select()
        .maybeSingle()
        .catch(err => {
          // Log but don't fail the request if idempotency key insert fails
          logger.warn({
            event: 'idempotency.store_failed',
            error: err.message,
            userId,
            requestId: req.requestId
          }, 'Failed to store idempotency key');
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

module.exports = router;