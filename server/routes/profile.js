// server/routes/profile.js
const express = require('express');
const router = express.Router();
const { updateOwnProfile } = require('../services/profileService');
const validateProfileUpdate = require('../middleware/validateProfileUpdate');

// You already protect /api routes globally with requireAuth; if not, add here.
router.put('/me', validateProfileUpdate, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const updated = await updateOwnProfile(userId, req.body);
    res.json({ success: true, profile: updated });
  } catch (e) {
    console.error('Profile update error:', e);
    res.status(400).json({ success: false, message: 'Update failed' });
  }
});

module.exports = router;