// Description: Text submission endpoints with durable database storage
// Purpose: Handles text submission, validation, and retrieval via Supabase
// Notes: Uses Supabase PostgreSQL for persistent storage with RLS protection
// 
// AUTH REQUIREMENTS:
// - POST /api/submit: REQUIRES AUTH - creates user content
// - GET /api/submissions: REQUIRES AUTH - reads user data

const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../utils/supabaseClient');
const { validateTextServerSide, getClientIP } = require('../middleware/security');
const { createIdempotencyMiddleware } = require('../middleware/idempotency');
const logger = require('../utils/logger');
const { assertUser } = require('../utils/authz');

// Create idempotency middleware for text submissions
const submissionIdempotency = createIdempotencyMiddleware({
  ttl: 7200, // 2 hours (longer for content creation)
  headerName: 'Idempotency-Key'
});

/**
 * POST /api/submit
 * Text submission endpoint with database persistence and idempotency protection
 * 
 * Validates and stores user text submissions in PostgreSQL via Supabase.
 * 
 * Database storage provides durability, horizontal scalability, and RLS protection.
 * 
 * 1. Validate user authentication
 * 2. Validate text content server-side
 * 3. Insert into submissions table via Supabase
 * 4. Return success response
 */
router.post('/', submissionIdempotency, async (req, res) => {
  try {
    // CSRF check happens first (returns 403 if no token)
    // If we get here, CSRF passed, but we still need auth
    const { hasUser } = require('../utils/authz');
    if (!hasUser(req)) {
      return res.status(401).json({
        ok: false,
        error: 'Authentication required',
        code: 'auth_required'
      });
    }
    
    const { text } = req.body;
    const clientIP = getClientIP(req);
    const user = assertUser(req);
    const userId = user.id;
    
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
 * Retrieves user's recent submissions from database.
 * 
 * Database provides durable storage and RLS ensures users only see their own data.
 * 
 * Query submissions table via Supabase with user context for RLS enforcement.
 */
router.get('/', async (req, res) => {
  try {
    const user = assertUser(req);
    const userId = user.id;
    
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
    const { config } = require('../config');
    const userSupabase = createClient(
      config.supabase.url,
      config.supabase.anonKey,
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
