// File: server/routes/submissions.js
// Description: Text submission endpoints for content handling
// Purpose: Handles text submission, validation, and retrieval with in-memory storage
// Notes: Uses in-memory storage for demo purposes, maintains submission history

const express = require('express');
const router = express.Router();
const { config } = require('../config');
const { db } = require('../db/connection');
const { validateTextServerSide, getClientIP } = require('../middleware/security');
const { checkAndConsumeQuota } = require('../db/repo/quotasRepo');

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
 * POST /api/submit/db
 * Database-backed text submission with transaction support
 * Demonstrates proper transaction handling for data persistence
 */
router.post('/submit/db', async (req, res) => {
  let trx = null;
  
  try {
    // Start transaction
    trx = await db.transaction();
    
    const { text } = req.body;
    const clientIP = getClientIP(req);
    
    // Server-side text validation (never trust client)
    const textValidation = validateTextServerSide(text);
    if (!textValidation.valid) {
      await trx.rollback();
      console.log(`Security: Invalid text submission attempt from IP: ${clientIP}, Error: ${textValidation.error}`);
      return res.status(400).json({
        error: textValidation.error,
        requestId: req.requestId,
        timestamp: new Date().toISOString()
      });
    }

    // CRITICAL SECTION: atomic quota check and consume
    // We check and consume quota atomically to prevent race conditions
    // where multiple concurrent requests could bypass submission limits
    const quotaResult = await checkAndConsumeQuota(clientIP, 'submissions', MAX_SUBMISSIONS, trx);
    if (!quotaResult.success) {
      await trx.rollback();
      console.log(`Security: Quota limit exceeded for IP: ${clientIP}, Used: ${quotaResult.used}/${quotaResult.limit}`);
      return res.status(429).json({
        error: 'Maximum submission limit reached',
        remaining: quotaResult.remaining,
        used: quotaResult.used,
        limit: quotaResult.limit,
        requestId: req.requestId,
        timestamp: new Date().toISOString()
      });
    }
    
    // Create submission record within transaction
    const submissionData = {
      id: req.requestId,
      text: textValidation.sanitized,
      text_length: textValidation.sanitized.length,
      client_ip: clientIP,
      created_at: trx.fn.now(),
      updated_at: trx.fn.now()
    };
    
    // Insert submission within transaction
    const [submission] = await trx('submissions')
      .insert(submissionData)
      .returning('*');
    
    // Commit transaction
    await trx.commit();
    
    console.log(`Security: Valid DB submission created: ${submission.id}, IP: ${clientIP}, Request ID: ${req.requestId}`);
    
    res.json({
      success: true,
      message: 'Text submitted successfully to database',
      submission: {
        id: submission.id,
        text_length: submission.text_length,
        created_at: submission.created_at
      },
      quota: {
        remaining: quotaResult.remaining,
        used: quotaResult.used,
        limit: quotaResult.limit
      },
      requestId: req.requestId,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    // Rollback transaction on any error
    if (trx) {
      await trx.rollback();
    }
    
    console.error('Database submission error:', error);
    
    res.status(500).json({
      error: 'Internal server error',
      requestId: req.requestId,
      timestamp: new Date().toISOString()
    });
  }
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
