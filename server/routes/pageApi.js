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
// I am saving `router` here so the nearby steps can reuse the same value without rebuilding it each time.
const router = express.Router();
// requireAuth is applied globally to /api/page routes in zorvalon.js
const { 
  // I am keeping this line here because the surrounding pageApi.js workflow expects this value or operation before it continues.
  buildHomePageModel, 
  // I am keeping this line here because the surrounding pageApi.js workflow expects this value or operation before it continues.
  buildDashboardPageModel, 
  // I am keeping this line here because the surrounding pageApi.js workflow expects this value or operation before it continues.
  buildUserProfilePageModel, 
  // I am keeping this line here because the surrounding pageApi.js workflow expects this value or operation before it continues.
  buildSettingsPageModel, 
  // I am keeping this line here because the surrounding pageApi.js workflow expects this value or operation before it continues.
  buildErrorPageModel 
// I am keeping this line here because the surrounding pageApi.js workflow expects this value or operation before it continues.
} = require('../ui_contract/presenters');
// I am loading `../utils/logger` into `logger` so this file can reuse that dependency below.
const logger = require('../utils/logger');

/**
 * GET /api/page/home
 * Returns page model for home page
 */
router.get('/home', (req, res) => {
  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // I am saving `pageModel` here so the nearby steps can reuse the same value without rebuilding it each time.
    const pageModel = buildHomePageModel(req, res);
    // I am building or sending the Express response here with the status, data, or page already chosen by this route.
    res.json({
      // I am keeping the `success` field in this object so the receiving code can read that value by its expected name.
      success: true,
      // I am keeping the `data` field in this object so the receiving code can read that value by its expected name.
      data: pageModel,
      // I am keeping the `requestId` field in this object so the receiving code can read that value by its expected name.
      requestId: req.requestId,
      // I am keeping the `timestamp` field in this object so the receiving code can read that value by its expected name.
      timestamp: new Date().toISOString()
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (error) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.error({
      // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
      event: 'page_api.home.error',
      // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
      error: error.message,
      // I am keeping the `requestId` field in this object so the receiving code can read that value by its expected name.
      requestId: req.requestId
    // I am keeping this line here because the surrounding pageApi.js workflow expects this value or operation before it continues.
    }, 'Home page API error');
    // I am saving `pageModel` here so the nearby steps can reuse the same value without rebuilding it each time.
    const pageModel = buildErrorPageModel(req, res, 500, 'Unable to load home page');
    // I am building or sending the Express response here with the status, data, or page already chosen by this route.
    res.status(500).json({
      // I am keeping the `success` field in this object so the receiving code can read that value by its expected name.
      success: false,
      // I am keeping the `data` field in this object so the receiving code can read that value by its expected name.
      data: pageModel,
      // I am keeping the `requestId` field in this object so the receiving code can read that value by its expected name.
      requestId: req.requestId,
      // I am keeping the `timestamp` field in this object so the receiving code can read that value by its expected name.
      timestamp: new Date().toISOString()
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
});

/**
 * GET /api/page/dashboard
 * Returns page model for dashboard page (requires authentication)
 */
router.get('/dashboard', async (req, res) => {
  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // I am saving `pageModel` here so the nearby steps can reuse the same value without rebuilding it each time.
    const pageModel = await buildDashboardPageModel(req, res);
    
    // User data comes directly from Supabase token, no database lookup needed

    res.json({
      // I am keeping the `success` field in this object so the receiving code can read that value by its expected name.
      success: true,
      // I am keeping the `data` field in this object so the receiving code can read that value by its expected name.
      data: pageModel,
      // I am keeping the `requestId` field in this object so the receiving code can read that value by its expected name.
      requestId: req.requestId,
      // I am keeping the `timestamp` field in this object so the receiving code can read that value by its expected name.
      timestamp: new Date().toISOString()
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (error) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.error({
      // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
      event: 'page_api.dashboard.error',
      // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
      error: error.message,
      // I am keeping the `requestId` field in this object so the receiving code can read that value by its expected name.
      requestId: req.requestId
    // I am keeping this line here because the surrounding pageApi.js workflow expects this value or operation before it continues.
    }, 'Dashboard page API error');
    // I am saving `pageModel` here so the nearby steps can reuse the same value without rebuilding it each time.
    const pageModel = buildErrorPageModel(req, res, 500, 'Unable to load dashboard');
    // I am building or sending the Express response here with the status, data, or page already chosen by this route.
    res.status(500).json({
      // I am keeping the `success` field in this object so the receiving code can read that value by its expected name.
      success: false,
      // I am keeping the `data` field in this object so the receiving code can read that value by its expected name.
      data: pageModel,
      // I am keeping the `requestId` field in this object so the receiving code can read that value by its expected name.
      requestId: req.requestId,
      // I am keeping the `timestamp` field in this object so the receiving code can read that value by its expected name.
      timestamp: new Date().toISOString()
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
});

/**
 * GET /api/page/user/:id
 * Returns page model for user profile page
 */
router.get('/user/:id', async (req, res) => {
  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // I am saving `pageModel` here so the nearby steps can reuse the same value without rebuilding it each time.
    const pageModel = await buildUserProfilePageModel(req, res, req.params.id);
    
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!pageModel.profile.user) {
      // This return sends the completed value or response back to the code that called this function.
      return res.status(404).json({
        // I am keeping the `success` field in this object so the receiving code can read that value by its expected name.
        success: false,
        // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
        error: 'User not found',
        // I am keeping the `requestId` field in this object so the receiving code can read that value by its expected name.
        requestId: req.requestId,
        // I am keeping the `timestamp` field in this object so the receiving code can read that value by its expected name.
        timestamp: new Date().toISOString()
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      });
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // I am building or sending the Express response here with the status, data, or page already chosen by this route.
    res.json({
      // I am keeping the `success` field in this object so the receiving code can read that value by its expected name.
      success: true,
      // I am keeping the `data` field in this object so the receiving code can read that value by its expected name.
      data: pageModel,
      // I am keeping the `requestId` field in this object so the receiving code can read that value by its expected name.
      requestId: req.requestId,
      // I am keeping the `timestamp` field in this object so the receiving code can read that value by its expected name.
      timestamp: new Date().toISOString()
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (error) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.error({
      // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
      event: 'page_api.user_profile.error',
      // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
      error: error.message,
      // I am keeping the `requestId` field in this object so the receiving code can read that value by its expected name.
      requestId: req.requestId
    // I am keeping this line here because the surrounding pageApi.js workflow expects this value or operation before it continues.
    }, 'User profile page API error');
    // I am saving `pageModel` here so the nearby steps can reuse the same value without rebuilding it each time.
    const pageModel = buildErrorPageModel(req, res, 500, 'Unable to load user profile');
    // I am building or sending the Express response here with the status, data, or page already chosen by this route.
    res.status(500).json({
      // I am keeping the `success` field in this object so the receiving code can read that value by its expected name.
      success: false,
      // I am keeping the `data` field in this object so the receiving code can read that value by its expected name.
      data: pageModel,
      // I am keeping the `requestId` field in this object so the receiving code can read that value by its expected name.
      requestId: req.requestId,
      // I am keeping the `timestamp` field in this object so the receiving code can read that value by its expected name.
      timestamp: new Date().toISOString()
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
});

/**
 * GET /api/page/settings
 * Returns page model for settings page (requires authentication)
 */
router.get('/settings', async (req, res) => {
  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // I am saving `pageModel` here so the nearby steps can reuse the same value without rebuilding it each time.
    const pageModel = await buildSettingsPageModel(req, res);
    
    // I am building or sending the Express response here with the status, data, or page already chosen by this route.
    res.json({
      // I am keeping the `success` field in this object so the receiving code can read that value by its expected name.
      success: true,
      // I am keeping the `data` field in this object so the receiving code can read that value by its expected name.
      data: pageModel,
      // I am keeping the `requestId` field in this object so the receiving code can read that value by its expected name.
      requestId: req.requestId,
      // I am keeping the `timestamp` field in this object so the receiving code can read that value by its expected name.
      timestamp: new Date().toISOString()
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (error) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.error({
      // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
      event: 'page_api.settings.error',
      // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
      error: error.message,
      // I am keeping the `requestId` field in this object so the receiving code can read that value by its expected name.
      requestId: req.requestId
    // I am keeping this line here because the surrounding pageApi.js workflow expects this value or operation before it continues.
    }, 'Settings page API error');
    // I am saving `pageModel` here so the nearby steps can reuse the same value without rebuilding it each time.
    const pageModel = buildErrorPageModel(req, res, 500, 'Unable to load settings');
    // I am building or sending the Express response here with the status, data, or page already chosen by this route.
    res.status(500).json({
      // I am keeping the `success` field in this object so the receiving code can read that value by its expected name.
      success: false,
      // I am keeping the `data` field in this object so the receiving code can read that value by its expected name.
      data: pageModel,
      // I am keeping the `requestId` field in this object so the receiving code can read that value by its expected name.
      requestId: req.requestId,
      // I am keeping the `timestamp` field in this object so the receiving code can read that value by its expected name.
      timestamp: new Date().toISOString()
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
});

// I am exporting this value here so another module can deliberately reuse the completed piece from pageApi.js.
module.exports = router;
