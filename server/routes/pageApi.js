// File: server/routes/pageApi.js
// Description: API endpoints that return page models for Next.js compatibility
// Purpose: Provides JSON endpoints that return the same data as EJS routes
// Notes: These endpoints enable gradual migration from EJS to Next.js
//
// AUTH REQUIREMENTS:
// - GET /home: PUBLIC - landing page
// - GET /dashboard: REQUIRES AUTH - user dashboard
// - GET /user/:id: REQUIRES AUTH - user profile access
// - GET /settings: REQUIRES AUTH - user settings

const express = require('express');
const router = express.Router();
// requireAuth is applied globally to /api/page routes in zorvalon.js
const { 
  buildHomePageModel, 
  buildDashboardPageModel, 
  buildUserProfilePageModel, 
  buildSettingsPageModel, 
  buildErrorPageModel 
} = require('../ui_contract/presenters');

/**
 * GET /api/page/home
 * Returns page model for home page
 */
router.get('/home', (req, res) => {
  try {
    const pageModel = buildHomePageModel(req, res);
    res.json({
      success: true,
      data: pageModel,
      requestId: req.requestId,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Home page API error:', error);
    const pageModel = buildErrorPageModel(req, res, 500, 'Unable to load home page');
    res.status(500).json({
      success: false,
      data: pageModel,
      requestId: req.requestId,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/page/dashboard
 * Returns page model for dashboard page (requires authentication)
 */
router.get('/dashboard', async (req, res) => {
  try {
    const pageModel = await buildDashboardPageModel(req, res);
    
    // User data comes directly from Supabase token, no database lookup needed

    res.json({
      success: true,
      data: pageModel,
      requestId: req.requestId,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Dashboard page API error:', error);
    const pageModel = buildErrorPageModel(req, res, 500, 'Unable to load dashboard');
    res.status(500).json({
      success: false,
      data: pageModel,
      requestId: req.requestId,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/page/user/:id
 * Returns page model for user profile page
 */
router.get('/user/:id', async (req, res) => {
  try {
    const pageModel = await buildUserProfilePageModel(req, res, req.params.id);
    
    if (!pageModel.profile.user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
        requestId: req.requestId,
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      data: pageModel,
      requestId: req.requestId,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('User profile page API error:', error);
    const pageModel = buildErrorPageModel(req, res, 500, 'Unable to load user profile');
    res.status(500).json({
      success: false,
      data: pageModel,
      requestId: req.requestId,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/page/settings
 * Returns page model for settings page (requires authentication)
 */
router.get('/settings', async (req, res) => {
  try {
    const pageModel = await buildSettingsPageModel(req, res);
    
    res.json({
      success: true,
      data: pageModel,
      requestId: req.requestId,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Settings page API error:', error);
    const pageModel = buildErrorPageModel(req, res, 500, 'Unable to load settings');
    res.status(500).json({
      success: false,
      data: pageModel,
      requestId: req.requestId,
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;
