// File: server/routes/submissions.js
// Description: Text submission endpoints for content handling
// Purpose: Handles text submission, validation, and retrieval with in-memory storage
// Notes: Uses in-memory storage for demo purposes, maintains submission history

const express = require('express');
const router = express.Router();
const { config } = require('../config');
const { validateTextServerSide, getClientIP } = require('../middleware/security');

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
  const clientIP = getClientIP(req);
  
  // Server-side text validation (never trust client)
  const textValidation = validateTextServerSide(text);
  if (!textValidation.valid) {
    console.log(`Security: Invalid text submission attempt from IP: ${clientIP}, Error: ${textValidation.error}`);
    return res.status(400).json({
      error: textValidation.error,
      requestId: req.requestId,
      timestamp: new Date().toISOString()
    });
  }
  
  // Check submission limit
  if (req.submissions.length >= req.MAX_SUBMISSIONS) {
    console.log(`Security: Submission limit exceeded from IP: ${clientIP}`);
    return res.status(429).json({
      error: 'Maximum submission limit reached',
      requestId: req.requestId,
      timestamp: new Date().toISOString()
    });
  }
  
  // Text is valid - store in memory with sanitized content
  const submission = {
    id: req.requestId,
    text: textValidation.sanitized, // Use sanitized text
    text_length: textValidation.sanitized.length,
    timestamp: new Date().toISOString(),
    preview: textValidation.sanitized.substring(0, 100) + (textValidation.sanitized.length > 100 ? '...' : ''),
    clientIP: clientIP // Track client IP for security
  };
  
  // Add to beginning of array and keep only MAX_SUBMISSIONS
  req.submissions.unshift(submission);
  if (req.submissions.length > req.MAX_SUBMISSIONS) {
    req.submissions.pop();
  }
  
  console.log(`Security: Valid submission created: ${submission.id}, IP: ${clientIP}, Request ID: ${req.requestId}`);
  
  res.json({
    success: true,
    message: 'Text submitted successfully',
    text_length: textValidation.sanitized.length,
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
