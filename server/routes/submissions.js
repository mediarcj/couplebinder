// File: server/routes/submissions.js
// Description: Text submission endpoints with durable database storage
// Purpose: Handles text submission, validation, and retrieval via Supabase
// Notes: Uses Supabase PostgreSQL for persistent storage with RLS protection
// 
// AUTH REQUIREMENTS:
// - POST /api/submit: REQUIRES AUTH - creates user content
// - GET /api/submissions: REQUIRES AUTH - reads user data

const express = require('express');
// I am saving `router` here so the nearby steps can reuse the same value without rebuilding it each time.
const router = express.Router();
// I am loading `../utils/supabaseClient` into `supabaseAdmin` so this file can reuse that dependency below.
const { supabaseAdmin } = require('../utils/supabaseClient');
// I am loading `../middleware/security` into `validateTextServerSide` so this file can reuse that dependency below.
const { validateTextServerSide, getClientIP } = require('../middleware/security');
// I am loading `../middleware/idempotency` into `createIdempotencyMiddleware` so this file can reuse that dependency below.
const { createIdempotencyMiddleware } = require('../middleware/idempotency');
// I am loading `../utils/logger` into `logger` so this file can reuse that dependency below.
const logger = require('../utils/logger');
// I am loading `../utils/authz` into `assertUser` so this file can reuse that dependency below.
const { assertUser } = require('../utils/authz');

// Create idempotency middleware for text submissions
const submissionIdempotency = createIdempotencyMiddleware({
  ttl: 7200, // 2 hours (longer for content creation)
  // I am keeping the `headerName` field in this object so the receiving code can read that value by its expected name.
  headerName: 'Idempotency-Key'
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
});

/**
 * POST /api/submit
 * Text submission endpoint with database persistence and idempotency protection
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
router.post('/', submissionIdempotency, async (req, res) => {
  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // CSRF check happens first (returns 403 if no token)
    // If we get here, CSRF passed, but we still need auth
    const { hasUser } = require('../utils/authz');
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!hasUser(req)) {
      // This return sends the completed value or response back to the code that called this function.
      return res.status(401).json({
        // I am keeping the `ok` field in this object so the receiving code can read that value by its expected name.
        ok: false,
        // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
        error: 'Authentication required',
        // I am keeping the `code` field in this object so the receiving code can read that value by its expected name.
        code: 'auth_required'
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      });
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    
    // I am saving `text` here so the nearby steps can reuse the same value without rebuilding it each time.
    const { text } = req.body;
    // I am saving `clientIP` here so the nearby steps can reuse the same value without rebuilding it each time.
    const clientIP = getClientIP(req);
    // I am saving `user` here so the nearby steps can reuse the same value without rebuilding it each time.
    const user = assertUser(req);
    // I am saving `userId` here so the nearby steps can reuse the same value without rebuilding it each time.
    const userId = user.id;
    
    // Server-side text validation (never trust client)
    const textValidation = validateTextServerSide(text);
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!textValidation.valid) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      logger.info({
        // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
        event: 'submission.rejected',
        // I am keeping the `reason` field in this object so the receiving code can read that value by its expected name.
        reason: textValidation.error,
        // I am keeping the `ip` field in this object so the receiving code can read that value by its expected name.
        ip: clientIP,
        // I am keeping the `requestId` field in this object so the receiving code can read that value by its expected name.
        requestId: req.requestId
      // I am keeping this line here because the surrounding submissions.js workflow expects this value or operation before it continues.
      }, 'Invalid submission attempt');
      
      // This return sends the completed value or response back to the code that called this function.
      return res.status(400).json({
        // I am keeping the `ok` field in this object so the receiving code can read that value by its expected name.
        ok: false,
        // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
        error: textValidation.error,
        // I am keeping the `requestId` field in this object so the receiving code can read that value by its expected name.
        requestId: req.requestId
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      });
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    
    // I am saving `data` here so the nearby steps can reuse the same value without rebuilding it each time.
    const { data, error } = await supabaseAdmin
      // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
      .from('submissions')
      // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
      .insert({
        // I am keeping the `user_id` field in this object so the receiving code can read that value by its expected name.
        user_id: userId,
        // I am keeping the `text` field in this object so the receiving code can read that value by its expected name.
        text: textValidation.sanitized,
        // I am keeping the `text_length` field in this object so the receiving code can read that value by its expected name.
        text_length: textValidation.sanitized.length,
        // I am keeping the `client_ip` field in this object so the receiving code can read that value by its expected name.
        client_ip: clientIP,
        // I am keeping the `request_id` field in this object so the receiving code can read that value by its expected name.
        request_id: req.requestId
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      })
      // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
      .select('id, text_length, created_at')
      // I am continuing the existing call chain here so this option stays attached to the same operation started above.
      .single();
    
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (error) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      logger.error({
        // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
        event: 'submission.db_error',
        // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
        error: error.message,
        // I am keeping the `code` field in this object so the receiving code can read that value by its expected name.
        code: error.code,
        // I am keeping this line here because the surrounding submissions.js workflow expects this value or operation before it continues.
        userId,
        // I am keeping the `requestId` field in this object so the receiving code can read that value by its expected name.
        requestId: req.requestId
      // I am keeping this line here because the surrounding submissions.js workflow expects this value or operation before it continues.
      }, 'Database insert failed');
      
      // This return sends the completed value or response back to the code that called this function.
      return res.status(500).json({
        // I am keeping the `ok` field in this object so the receiving code can read that value by its expected name.
        ok: false,
        // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
        error: 'Failed to save submission',
        // I am keeping the `requestId` field in this object so the receiving code can read that value by its expected name.
        requestId: req.requestId
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      });
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.info({
      // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
      event: 'submission.created',
      // I am keeping this line here because the surrounding submissions.js workflow expects this value or operation before it continues.
      userId,
      // I am keeping the `submissionId` field in this object so the receiving code can read that value by its expected name.
      submissionId: data.id,
      // I am keeping the `textLength` field in this object so the receiving code can read that value by its expected name.
      textLength: data.text_length,
      // I am keeping the `requestId` field in this object so the receiving code can read that value by its expected name.
      requestId: req.requestId
    // I am keeping this line here because the surrounding submissions.js workflow expects this value or operation before it continues.
    }, 'Submission accepted');
    
    // Return success response
    const preview = textValidation.sanitized.substring(0, 100) + 
                    // I am keeping this line here because the surrounding submissions.js workflow expects this value or operation before it continues.
                    (textValidation.sanitized.length > 100 ? '...' : '');
    
    // I am building or sending the Express response here with the status, data, or page already chosen by this route.
    res.status(201).json({
      // I am keeping the `ok` field in this object so the receiving code can read that value by its expected name.
      ok: true,
      // I am keeping the `submission` field in this object so the receiving code can read that value by its expected name.
      submission: {
        // I am keeping the `id` field in this object so the receiving code can read that value by its expected name.
        id: data.id,
        // I am keeping the `text_length` field in this object so the receiving code can read that value by its expected name.
        text_length: data.text_length,
        // I am keeping the `timestamp` field in this object so the receiving code can read that value by its expected name.
        timestamp: data.created_at,
        // I am keeping this line here because the surrounding submissions.js workflow expects this value or operation before it continues.
        preview
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      },
      // I am keeping the `requestId` field in this object so the receiving code can read that value by its expected name.
      requestId: req.requestId
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
    
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (error) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.error({
      // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
      event: 'submission.error',
      // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
      error: error.message,
      // I am keeping the `requestId` field in this object so the receiving code can read that value by its expected name.
      requestId: req.requestId
    // I am keeping this line here because the surrounding submissions.js workflow expects this value or operation before it continues.
    }, 'Submission processing error');
    
    // I am building or sending the Express response here with the status, data, or page already chosen by this route.
    res.status(500).json({
      // I am keeping the `ok` field in this object so the receiving code can read that value by its expected name.
      ok: false,
      // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
      error: 'Internal server error',
      // I am keeping the `requestId` field in this object so the receiving code can read that value by its expected name.
      requestId: req.requestId
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
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
  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // I am saving `user` here so the nearby steps can reuse the same value without rebuilding it each time.
    const user = assertUser(req);
    // I am saving `userId` here so the nearby steps can reuse the same value without rebuilding it each time.
    const userId = user.id;
    
    // Get user's access token from cookie for RLS
    const accessToken = req.cookies?.['sb-access-token'] || req.cookies?.['__Host-sb_session'];
    
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!accessToken) {
      // This return sends the completed value or response back to the code that called this function.
      return res.status(401).json({
        // I am keeping the `ok` field in this object so the receiving code can read that value by its expected name.
        ok: false,
        // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
        error: 'Authentication token required',
        // I am keeping the `requestId` field in this object so the receiving code can read that value by its expected name.
        requestId: req.requestId
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      });
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    
    // Create Supabase client with user's access token for RLS
    const { createClient } = require('@supabase/supabase-js');
    // I am loading `../config` into `config` so this file can reuse that dependency below.
    const { config } = require('../config');
    // I am saving `userSupabase` here so the nearby steps can reuse the same value without rebuilding it each time.
    const userSupabase = createClient(
      // I am keeping this line here because the surrounding submissions.js workflow expects this value or operation before it continues.
      config.supabase.url,
      // I am keeping this line here because the surrounding submissions.js workflow expects this value or operation before it continues.
      config.supabase.anonKey,
      // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
      {
        // I am keeping the `global` field in this object so the receiving code can read that value by its expected name.
        global: {
          // I am keeping the `headers` field in this object so the receiving code can read that value by its expected name.
          headers: {
            // I am keeping the `Authorization` field in this object so the receiving code can read that value by its expected name.
            Authorization: `Bearer ${accessToken}`
          // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
          }
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    );
    
    // Query submissions with RLS (user can only see their own)
    const { data: submissions, error } = await userSupabase
      // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
      .from('submissions')
      // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
      .select('id, text, text_length, created_at')
      // I am continuing the existing call chain here so this option stays attached to the same operation started above.
      .order('created_at', { ascending: false })
      .limit(50); // Recent 50 submissions
    
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (error) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      logger.error({
        // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
        event: 'submission.query_error',
        // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
        error: error.message,
        // I am keeping this line here because the surrounding submissions.js workflow expects this value or operation before it continues.
        userId,
        // I am keeping the `requestId` field in this object so the receiving code can read that value by its expected name.
        requestId: req.requestId
      // I am keeping this line here because the surrounding submissions.js workflow expects this value or operation before it continues.
      }, 'Failed to fetch submissions');
      
      // This return sends the completed value or response back to the code that called this function.
      return res.status(500).json({
        // I am keeping the `ok` field in this object so the receiving code can read that value by its expected name.
        ok: false,
        // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
        error: 'Failed to fetch submissions',
        // I am keeping the `requestId` field in this object so the receiving code can read that value by its expected name.
        requestId: req.requestId
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      });
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    
    // Format submissions for response (with preview)
    const formattedSubmissions = (submissions || []).map(sub => ({
      // I am keeping the `id` field in this object so the receiving code can read that value by its expected name.
      id: sub.id,
      // I am keeping the `text_length` field in this object so the receiving code can read that value by its expected name.
      text_length: sub.text_length,
      // I am keeping the `timestamp` field in this object so the receiving code can read that value by its expected name.
      timestamp: sub.created_at,
      // I am keeping the `preview` field in this object so the receiving code can read that value by its expected name.
      preview: sub.text.substring(0, 100) + (sub.text.length > 100 ? '...' : '')
    // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
    }));
    
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.debug({
      // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
      event: 'submission.list',
      // I am keeping this line here because the surrounding submissions.js workflow expects this value or operation before it continues.
      userId,
      // I am keeping the `count` field in this object so the receiving code can read that value by its expected name.
      count: formattedSubmissions.length,
      // I am keeping the `requestId` field in this object so the receiving code can read that value by its expected name.
      requestId: req.requestId
    // I am keeping this line here because the surrounding submissions.js workflow expects this value or operation before it continues.
    }, 'Submissions retrieved');
    
    // I am building or sending the Express response here with the status, data, or page already chosen by this route.
    res.json({
      // I am keeping the `ok` field in this object so the receiving code can read that value by its expected name.
      ok: true,
      // I am keeping the `submissions` field in this object so the receiving code can read that value by its expected name.
      submissions: formattedSubmissions,
      // I am keeping the `count` field in this object so the receiving code can read that value by its expected name.
      count: formattedSubmissions.length,
      // I am keeping the `requestId` field in this object so the receiving code can read that value by its expected name.
      requestId: req.requestId
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
    
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (error) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.error({
      // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
      event: 'submission.retrieval_error',
      // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
      error: error.message,
      // I am keeping the `requestId` field in this object so the receiving code can read that value by its expected name.
      requestId: req.requestId
    // I am keeping this line here because the surrounding submissions.js workflow expects this value or operation before it continues.
    }, 'Submissions retrieval error');
    
    // I am building or sending the Express response here with the status, data, or page already chosen by this route.
    res.status(500).json({
      // I am keeping the `ok` field in this object so the receiving code can read that value by its expected name.
      ok: false,
      // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
      error: 'Internal server error',
      // I am keeping the `requestId` field in this object so the receiving code can read that value by its expected name.
      requestId: req.requestId
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
});

// Initialize submissions storage (no-op since we're using database now)
function initSubmissionsStorage() {
  // I am calling this helper here so the current workflow performs this step before it moves on.
  logger.info({ event: 'submissions.storage.init' }, 'Submissions storage initialized (Supabase database)');
  // This return sends the completed value or response back to the code that called this function.
  return { ok: true };
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am exporting this value here so another module can deliberately reuse the completed piece from submissions.js.
module.exports = router;
// I am exporting this value here so another module can deliberately reuse the completed piece from submissions.js.
module.exports.initSubmissionsStorage = initSubmissionsStorage;
