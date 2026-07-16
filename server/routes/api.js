// Description: General API utility endpoints
// Purpose: Provides basic API endpoints for testing and UI configuration
// Notes: Includes hello world endpoint and backend-driven UI configuration
//
// AUTH REQUIREMENTS:
// - GET /hello: PUBLIC - test endpoint
// - GET /ui-config: PUBLIC - UI configuration

const express = require('express');
const router = express.Router();
const { config } = require('../config');

/**
 * GET /api/hello
 * Simple hello world endpoint for API testing
 */
router.get('/hello', (req, res) => {
  res.json({ message: 'hello world' });
});

/**
 * GET /api/ui-config
 * Backend-driven UI configuration endpoint
 * Provides UI instructions and validation rules to frontend
 */
router.get('/ui-config', (req, res) => {
  res.json({
    allowed_actions: ['submit_content', 'view_history'],
    cooldown_seconds: 0,
    input_limits: {
      text_max: config.limits.textMaxLength,
      title_max: 140
    },
    feature_flags: {
      advanced_mode: false
    },
    form_schema: {
      text: {
        required: true,
        min: config.limits.textMinLength,
        max: config.limits.textMaxLength
      }
    },
    requestId: req.requestId,
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
