// File: server/routes/submissions.js
// Description: Text submission endpoints for content handling
// Purpose: Handles text submission, validation, and retrieval with in-memory storage
// Notes: Uses in-memory storage for demo purposes, maintains submission history
// 
// AUTH REQUIREMENTS:
// - POST /submit: REQUIRES AUTH - creates user content
// - GET /submissions: REQUIRES AUTH - reads user data

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/requireAuth');
const { config } = require('../config');
const { supabase } = require('../utils/supabaseClient');
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
router.post('/submit', requireAuth, injectSubmissions, (req, res) => {
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
 * Returns list of recent text submissions from database with RLS
 */
router.get('/submissions', requireAuth, async (req, res) => {
  try {
    // Get user's access token from cookie
    const accessToken = req.cookies?.['sb-access-token'];
    
    if (!accessToken) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
        requestId: req.requestId,
        timestamp: new Date().toISOString()
      });
    }
    
    // Create Supabase client with user's access token for RLS
    const { createClient } = require('@supabase/supabase-js');
    const userSupabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY,
      {
        global: {
          headers: {
            Authorization: `Bearer ${accessToken}`
          }
        }
      }
    );
    
    // Query submissions with RLS (user can only see their own)
    const { data: submissions, error } = await userSupabase
      .from('submissions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50); // Limit to recent 50 submissions
    
    if (error) {
      console.error('Error fetching submissions:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch submissions',
        requestId: req.requestId,
        timestamp: new Date().toISOString()
      });
    }
    
    // Format submissions for response
    const formattedSubmissions = submissions.map(sub => ({
      id: sub.id,
      text: sub.text,
      text_length: sub.text_length,
      timestamp: sub.created_at,
      preview: sub.text.substring(0, 100) + (sub.text.length > 100 ? '...' : '')
    }));
    
    res.json({
      success: true,
      submissions: formattedSubmissions,
      count: formattedSubmissions.length,
      requestId: req.requestId,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Submissions retrieval error:', error);
    
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      requestId: req.requestId,
      timestamp: new Date().toISOString()
    });
  }
});

// Export function to set submissions array from main app
router.setSubmissions = function(submissionsArray) {
  submissions = submissionsArray;
};

module.exports = router;
