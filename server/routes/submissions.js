// File: server/routes/submissions.js
// Description: Text submission endpoints with durable database storage
// Purpose: Handles text submission, validation, and retrieval via Supabase
// Notes: Uses Supabase PostgreSQL for persistent storage with RLS protection
// 
// AUTH REQUIREMENTS:
// - POST /api/submit: REQUIRES AUTH - creates user content
// - GET /api/submissions: REQUIRES AUTH - reads user data

const express = require('express');
const router = express.Router();
const { config } = require('../config');
const { supabaseAdmin } = require('../utils/supabaseClient');
const { validateTextServerSide, getClientIP } = require('../middleware/security');
const logger = require('../utils/logger');

/**
 * POST /api/submit
 * Text submission endpoint with database persistence
 * 
 * WHAT:
 * Validates and stores user text submissions in PostgreSQL via Supabase.
 * 
 * WHY:
 * Database storage provides durability, horizontal scalability, and RLS protection.
 * 
 * HOW:
 * 1. Validate user authentication
 * 2. Validate text content server-side
 * 3. Insert into submissions table via Supabase
 * 4. Return success response
 */
router.post('/', async (req, res) => {
  try {
    const { text } = req.body;
    const clientIP = getClientIP(req);
    const userId = req.user?.id;
    
    // Enforce authentication
    if (!userId) {
      return res.status(401).json({
        ok: false,
        error: 'Authentication required',
        requestId: req.requestId
      });
    }
    
    // Server-side text validation (never trust client)
    const textValidation = validateTextServerSide(text);
    if (!textValidation.valid) {
      logger.info({
        event: 'submission.rejected',
        reason: textValidation.error,
        ip: clientIP,
        requestId: req.requestId
      }, 'Invalid submission attempt');
      
      return res.status(400).json({
        ok: false,
        error: textValidation.error,
        requestId: req.requestId
      });
    }
    
    // Insert into database with RLS protection
    // Note: RLS policies ensure users can only insert their own data
    const { data, error } = await supabaseAdmin
      .from('submissions')
      .insert({
        user_id: userId,
        text: textValidation.sanitized,
        text_length: textValidation.sanitized.length,
        client_ip: clientIP,
        request_id: req.requestId
      })
      .select('id, text_length, created_at')
      .single();
    
    if (error) {
      logger.error({
        event: 'submission.db_error',
        error: error.message,
        code: error.code,
        userId,
        requestId: req.requestId
      }, 'Database insert failed');
      
      return res.status(500).json({
        ok: false,
        error: 'Failed to save submission',
        requestId: req.requestId
      });
    }
    
    logger.info({
      event: 'submission.created',
      userId,
      submissionId: data.id,
      textLength: data.text_length,
      requestId: req.requestId
    }, 'Submission accepted');
    
    // Return success response
    const preview = textValidation.sanitized.substring(0, 100) + 
                    (textValidation.sanitized.length > 100 ? '...' : '');
    
    res.status(201).json({
      ok: true,
      submission: {
        id: data.id,
        text_length: data.text_length,
        timestamp: data.created_at,
        preview
      },
      requestId: req.requestId
    });
    
  } catch (error) {
    logger.error({
      event: 'submission.error',
      error: error.message,
      requestId: req.requestId
    }, 'Submission processing error');
    
    res.status(500).json({
      ok: false,
      error: 'Internal server error',
      requestId: req.requestId
    });
  }
});

/**
 * GET /api/submissions
 * Recent submissions endpoint with RLS protection
 * 
 * WHAT:
 * Retrieves user's recent submissions from database.
 * 
 * WHY:
 * Database provides durable storage and RLS ensures users only see their own data.
 * 
 * HOW:
 * Query submissions table via Supabase with user context for RLS enforcement.
 */
router.get('/', async (req, res) => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({
        ok: false,
        error: 'Authentication required',
        requestId: req.requestId
      });
    }
    
    // Get user's access token from cookie for RLS
    const accessToken = req.cookies?.['sb-access-token'] || req.cookies?.['__Host-sb_session'];
    
    if (!accessToken) {
      return res.status(401).json({
        ok: false,
        error: 'Authentication token required',
        requestId: req.requestId
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
      .select('id, text, text_length, created_at')
      .order('created_at', { ascending: false })
      .limit(50); // Recent 50 submissions
    
    if (error) {
      logger.error({
        event: 'submission.query_error',
        error: error.message,
        userId,
        requestId: req.requestId
      }, 'Failed to fetch submissions');
      
      return res.status(500).json({
        ok: false,
        error: 'Failed to fetch submissions',
        requestId: req.requestId
      });
    }
    
    // Format submissions for response (with preview)
    const formattedSubmissions = (submissions || []).map(sub => ({
      id: sub.id,
      text_length: sub.text_length,
      timestamp: sub.created_at,
      preview: sub.text.substring(0, 100) + (sub.text.length > 100 ? '...' : '')
    }));
    
    logger.debug({
      event: 'submission.list',
      userId,
      count: formattedSubmissions.length,
      requestId: req.requestId
    }, 'Submissions retrieved');
    
    res.json({
      ok: true,
      submissions: formattedSubmissions,
      count: formattedSubmissions.length,
      requestId: req.requestId
    });
    
  } catch (error) {
    logger.error({
      event: 'submission.retrieval_error',
      error: error.message,
      requestId: req.requestId
    }, 'Submissions retrieval error');
    
    res.status(500).json({
      ok: false,
      error: 'Internal server error',
      requestId: req.requestId
    });
  }
});

// Initialize submissions storage (no-op since we're using database now)
function initSubmissionsStorage() {
  logger.info({ event: 'submissions.storage.init' }, 'Submissions storage initialized (Supabase database)');
  return { ok: true };
}

module.exports = router;
module.exports.initSubmissionsStorage = initSubmissionsStorage;
