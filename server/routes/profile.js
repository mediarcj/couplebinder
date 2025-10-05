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

    const profile = await getProfileByUserId(userId);
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

    const updated = await updateOwnProfile(userId, req.body);
    res.json({ success: true, profile: updated });
  } catch (e) {
    console.error('PUT /api/profile/me error:', e);
    res.status(400).json({ success: false, message: 'Update failed' });
  }
});

module.exports = router;