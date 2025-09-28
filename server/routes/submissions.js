// File: server/routes/submissions.js
// Description: Text submission endpoints for content handling
// Purpose: Handles text submission, validation, and retrieval with in-memory storage
// Notes: Uses in-memory storage for demo purposes, maintains submission history

const express = require('express');
const router = express.Router();
const { config } = require('../config');

// In-memory storage for submissions (shared with main app)
// This will be passed from zorvalon.js via middleware
let submissions = [];
const MAX_SUBMISSIONS = config.limits.maxSubmissions;

// Middleware to inject submissions array
function injectSubmissions(req, res, next) {
  req.submissions = submissions;
  req.MAX_SUBMISSIONS = MAX_SUBMISSIONS;
  next();
}

/**
 * POST /api/submit
 * Text submission endpoint with validation
 * Validates input and stores in memory with limits
 */
router.post('/submit', injectSubmissions, (req, res) => {
  const { text } = req.body;
  
  // Validate text field
  if (!text) {
    return res.status(400).json({
      error: 'Text field is required',
      requestId: req.requestId,
      timestamp: new Date().toISOString()
    });
  }
  
  if (typeof text !== 'string') {
    return res.status(400).json({
      error: 'Text must be a string',
      requestId: req.requestId,
      timestamp: new Date().toISOString()
    });
  }
  
  if (text.length < config.limits.textMinLength) {
    return res.status(400).json({
      error: `Text must be at least ${config.limits.textMinLength} characters`,
      requestId: req.requestId,
      timestamp: new Date().toISOString()
    });
  }
  
  if (text.length > config.limits.textMaxLength) {
    return res.status(400).json({
      error: `Text must not exceed ${config.limits.textMaxLength} characters`,
      requestId: req.requestId,
      timestamp: new Date().toISOString()
    });
  }
  
  // Text is valid - store in memory
  const submission = {
    id: req.requestId,
    text: text,
    text_length: text.length,
    timestamp: new Date().toISOString(),
    preview: text.substring(0, 100) + (text.length > 100 ? '...' : '')
  };
  
  // Add to beginning of array and keep only MAX_SUBMISSIONS
  req.submissions.unshift(submission);
  if (req.submissions.length > req.MAX_SUBMISSIONS) {
    req.submissions.pop();
  }
  
  res.json({
    success: true,
    message: 'Text submitted successfully',
    text_length: text.length,
    requestId: req.requestId,
    timestamp: new Date().toISOString()
  });
});

/**
 * GET /api/submissions
 * Recent submissions endpoint
 * Returns list of recent text submissions
 */
router.get('/submissions', injectSubmissions, (req, res) => {
  res.json({
    submissions: req.submissions,
    count: req.submissions.length,
    requestId: req.requestId,
    timestamp: new Date().toISOString()
  });
});

// Export function to set submissions array from main app
router.setSubmissions = function(submissionsArray) {
  submissions = submissionsArray;
};

module.exports = router;
