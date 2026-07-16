// File: server/routes/api.js
// Description: General API utility endpoints
// Purpose: Provides basic API endpoints for testing and UI configuration
// Notes: Includes hello world endpoint and backend-driven UI configuration
//
// AUTH REQUIREMENTS:
// - GET /hello: PUBLIC - test endpoint
// - GET /ui-config: PUBLIC - UI configuration

const express = require('express');
// I am saving `router` here so the nearby steps can reuse the same value without rebuilding it each time.
const router = express.Router();
// I am loading `../config` into `config` so this file can reuse that dependency below.
const { config } = require('../config');

/**
 * GET /api/hello
 * Simple hello world endpoint for API testing
 */
router.get('/hello', (req, res) => {
  // I am building or sending the Express response here with the status, data, or page already chosen by this route.
  res.json({ message: 'hello world' });
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
});

/**
 * GET /api/ui-config
 * Backend-driven UI configuration endpoint
 * Provides UI instructions and validation rules to frontend
 */
router.get('/ui-config', (req, res) => {
  // I am building or sending the Express response here with the status, data, or page already chosen by this route.
  res.json({
    // I am keeping the `allowed_actions` field in this object so the receiving code can read that value by its expected name.
    allowed_actions: ['submit_content', 'view_history'],
    // I am keeping the `cooldown_seconds` field in this object so the receiving code can read that value by its expected name.
    cooldown_seconds: 0,
    // I am keeping the `input_limits` field in this object so the receiving code can read that value by its expected name.
    input_limits: {
      // I am keeping the `text_max` field in this object so the receiving code can read that value by its expected name.
      text_max: config.limits.textMaxLength,
      // I am keeping the `title_max` field in this object so the receiving code can read that value by its expected name.
      title_max: 140
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    },
    // I am keeping the `feature_flags` field in this object so the receiving code can read that value by its expected name.
    feature_flags: {
      // I am keeping the `advanced_mode` field in this object so the receiving code can read that value by its expected name.
      advanced_mode: false
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    },
    // I am keeping the `form_schema` field in this object so the receiving code can read that value by its expected name.
    form_schema: {
      // I am keeping the `text` field in this object so the receiving code can read that value by its expected name.
      text: {
        // I am keeping the `required` field in this object so the receiving code can read that value by its expected name.
        required: true,
        // I am keeping the `min` field in this object so the receiving code can read that value by its expected name.
        min: config.limits.textMinLength,
        // I am keeping the `max` field in this object so the receiving code can read that value by its expected name.
        max: config.limits.textMaxLength
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    },
    // I am keeping the `requestId` field in this object so the receiving code can read that value by its expected name.
    requestId: req.requestId,
    // I am keeping the `timestamp` field in this object so the receiving code can read that value by its expected name.
    timestamp: new Date().toISOString()
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
});

// I am exporting this value here so another module can deliberately reuse the completed piece from api.js.
module.exports = router;
