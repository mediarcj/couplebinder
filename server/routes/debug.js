// File: server/routes/debug.js
// Description: Debug routes for testing authentication (development only)
// Purpose: Provides debugging endpoints to test JWT verification
// Notes: Should only be enabled in development

const express = require('express');
const router = express.Router();
const authBridge = require('../middleware/authBridge');

/**
 * GET /debug/whoami
 * Returns current user from JWT verification
 */
router.get('/whoami', authBridge, (req, res) => {
  res.json({ 
    ok: true, 
    user: req.user || null,
    hasUser: !!req.user
  });
});

/**
 * POST /debug/clear-cookies
 * Clears all auth cookies (useful for testing)
 */
router.post('/clear-cookies', (req, res) => {
  // Clear any old cookie names
  res.clearCookie('sb_access_token', { path: '/' });
  res.clearCookie('sb-refresh-token', { path: '/' });
  res.clearCookie('sb-access-token', { path: '/' });
  res.json({ ok: true, cleared: true });
});

module.exports = router;

