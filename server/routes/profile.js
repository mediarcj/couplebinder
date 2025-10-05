//File: server/routes/profile.js
const express = require('express');
const router = express.Router();

const { getProfileByUserId, updateOwnProfile } = require('../services/profileService');
const validateProfileUpdate = require('../middleware/validateProfileUpdate');

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

// PUT /api/profile/me -> update your own profile
router.put('/me', validateProfileUpdate, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, message: 'Authentication required' });

    // Use the validated patch data from middleware
    const updated = await updateOwnProfile(userId, req.profilePatch);
    res.json({ success: true, profile: updated });
  } catch (e) {
    console.error('PUT /api/profile/me error:', e);
    res.status(400).json({ success: false, message: 'Update failed' });
  }
});

module.exports = router;