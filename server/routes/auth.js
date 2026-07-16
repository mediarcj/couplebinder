// File: server/routes/auth.js
// Description: Authentication routes for stateless authentication
// Purpose: Handles authentication status and token verification
// Notes: Uses Supabase stateless authentication via authBridge middleware
//
// AUTH REQUIREMENTS:
// - POST /login: PUBLIC - deprecated, redirects to Supabase
// - POST /logout: PUBLIC - clears client-side tokens
// - GET /status: PUBLIC - returns current auth status

const express = require('express');
// I am loading `../middleware/security` into `getClientIP` so this file can reuse that dependency below.
const { getClientIP } = require('../middleware/security');
// I am loading `../utils/authz` into `hasUser` so this file can reuse that dependency below.
const { hasUser, getUserId, getUserEmail } = require('../utils/authz');
// Import rate limiters (SECONDARY layer - Cloudflare edge is PRIMARY layer)
// NOTE: These are imported but rate limiting is applied at the route level in zorvalon.js
// See zorvalon.js lines 594-600 for actual rate limiter application
const { loginLimiter, registerLimiter } = require('../middleware/rateLimiter');
// I am loading `../middleware/validation` into `validateUserRegistration` so this file can reuse that dependency below.
const { validateUserRegistration } = require('../middleware/validation');
// I am loading `../utils/logger` into `logger` so this file can reuse that dependency below.
const logger = require('../utils/logger');
// I am loading `../config` into `config` so this file can reuse that dependency below.
const { config } = require('../config');
// I am loading `../lib/turnstile` into `verifyTurnstileRequest` so this file can reuse that dependency below.
const { verifyTurnstileRequest } = require('../lib/turnstile');
// I am saving `router` here so the nearby steps can reuse the same value without rebuilding it each time.
const router = express.Router();

/**
 * POST /api/auth/login
 * Note: Login is handled by Supabase Auth on the frontend
 * This endpoint returns 404 in production to reduce attack surface
 * 
 * WHAT:
 * Dead endpoint that returns 404 in production.
 * 
 * WHY:
 * This is a popular attack target. Since we use Supabase Auth,
 * this endpoint serves no purpose and should appear to not exist.
 * 
 * HOW:
 * In production: return 404 (endpoint does not exist).
 * In development: return 400 with message (for debugging).
 * Optional: allow via ALLOW_LEGACY_LOGIN=true for testing.
 */
router.post('/login', loginLimiter(), async (req, res) => {
    // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
    try {
        // I am saving `isProd` here so the nearby steps can reuse the same value without rebuilding it each time.
        const isProd = config.server.nodeEnv === 'production';
        // I am saving `allowLegacy` here so the nearby steps can reuse the same value without rebuilding it each time.
        const allowLegacy = config.auth.allowLegacyLogin;
        
        // Log legacy endpoint usage
        logger.warn({
            // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
            event: 'legacy.login_endpoint_used',
            // I am keeping the `requestId` field in this object so the receiving code can read that value by its expected name.
            requestId: req.requestId,
            // I am keeping the `ip` field in this object so the receiving code can read that value by its expected name.
            ip: req.clientIp || req.ip,
            // I am keeping the `path` field in this object so the receiving code can read that value by its expected name.
            path: req.originalUrl || req.path,
            // I am keeping this line here because the surrounding auth.js workflow expects this value or operation before it continues.
            isProd,
            // I am keeping this line here because the surrounding auth.js workflow expects this value or operation before it continues.
            allowLegacy
        // I am keeping this line here because the surrounding auth.js workflow expects this value or operation before it continues.
        }, 'Legacy login endpoint was called; consider migrating to Supabase Auth only');
        
        // In production, return 404 unless explicitly allowed
        if (isProd && !allowLegacy) {
            // I am calling this helper here so the current workflow performs this step before it moves on.
            logger.warn({
                // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
                event: 'auth.login.dead_endpoint_hit',
                // I am keeping the `requestId` field in this object so the receiving code can read that value by its expected name.
                requestId: req.requestId,
                // I am keeping the `ip` field in this object so the receiving code can read that value by its expected name.
                ip: req.clientIp || req.ip,
                // I am keeping the `path` field in this object so the receiving code can read that value by its expected name.
                path: req.originalUrl || req.path
            // I am keeping this line here because the surrounding auth.js workflow expects this value or operation before it continues.
            }, 'Dead login endpoint accessed in production');
            
            // This return sends the completed value or response back to the code that called this function.
            return res.sendStatus(404);
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }
        
        // Development mode: return helpful message
        const clientIP = getClientIP(req);
        
        // I am calling this helper here so the current workflow performs this step before it moves on.
        logger.auth('login_attempt', {
            // I am keeping the `requestId` field in this object so the receiving code can read that value by its expected name.
            requestId: req.requestId,
            // I am keeping the `outcome` field in this object so the receiving code can read that value by its expected name.
            outcome: 'redirected_to_supabase',
            // I am keeping the `ip` field in this object so the receiving code can read that value by its expected name.
            ip: clientIP
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        });
        
        // I am building or sending the Express response here with the status, data, or page already chosen by this route.
        res.status(400).json({
            // I am keeping the `success` field in this object so the receiving code can read that value by its expected name.
            success: false,
            // I am keeping the `message` field in this object so the receiving code can read that value by its expected name.
            message: 'Please use Supabase Auth for login. This endpoint is deprecated.'
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        });
    // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
    } catch (error) {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        logger.error('Login route error', {
            // I am keeping the `requestId` field in this object so the receiving code can read that value by its expected name.
            requestId: req.requestId,
            // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
            error: error.message
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        });
        // I am building or sending the Express response here with the status, data, or page already chosen by this route.
        res.status(500).json({
            // I am keeping the `success` field in this object so the receiving code can read that value by its expected name.
            success: false,
            // I am keeping the `message` field in this object so the receiving code can read that value by its expected name.
            message: 'Internal server error'
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        });
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
});

/**
 * POST /api/auth/logout
 * Legacy endpoint: redirect to canonical /auth/clear-cookie
 * 
 * WHAT:
 * Redirect legacy logout requests to the canonical endpoint.
 * 
 * WHY:
 * Prevents raw JSON responses in browser and unifies logout behavior.
 * Legacy links/bookmarks still work without breaking UX.
 * 
 * HOW:
 * Use 307 redirect to preserve POST method and body (CSRF token).
 * Client can then intercept and handle with JS logout flow.
 */
router.post('/logout', (req, res) => {
    // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
    try {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        logger.auth('logout_legacy_redirect', {
            // I am keeping the `requestId` field in this object so the receiving code can read that value by its expected name.
            requestId: req.requestId,
            // I am keeping the `ip` field in this object so the receiving code can read that value by its expected name.
            ip: req.ip
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        });
        
        // 307 preserves POST method and body for CSRF compatibility
        return res.redirect(307, '/auth/clear-cookie');
    // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
    } catch (error) {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        logger.error('Logout route error', {
            // I am keeping the `requestId` field in this object so the receiving code can read that value by its expected name.
            requestId: req.requestId,
            // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
            error: error.message
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        });
        // I am building or sending the Express response here with the status, data, or page already chosen by this route.
        res.status(500).json({
            // I am keeping the `success` field in this object so the receiving code can read that value by its expected name.
            success: false,
            // I am keeping the `message` field in this object so the receiving code can read that value by its expected name.
            message: 'Internal server error'
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        });
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
});

/**
 * GET /api/auth/status
 * Returns current authentication status from cookie truth only
 * 
 * WHAT:
 * Verifies the auth cookie the same way SSR does (cookie-only, no Bearer fallback).
 * 
 * WHY:
 * Status endpoint must reflect server truth (cookie state), not client localStorage.
 * This ensures logout verification works correctly.
 * 
 * HOW:
 * authBridge treats this route as cookie-only (SSR-like), so req.user will only be
 * set if a valid cookie exists. No Bearer token fallback.
 */
router.get('/status', (req, res) => {
    // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
    try {
        // Status endpoint uses cookie-only auth (same as SSR)
        // authBridge now treats /api/auth/status as cookie-only, so req.user
        // will only be set if a valid cookie exists
        const isAuthenticated = hasUser(req);
        
        // Return format that matches test expectations
        res.json({
            // I am keeping the `success` field in this object so the receiving code can read that value by its expected name.
            success: true,
            // I am keeping the `authenticated` field in this object so the receiving code can read that value by its expected name.
            authenticated: isAuthenticated,
            // I am keeping this line here because the surrounding auth.js workflow expects this value or operation before it continues.
            ...(isAuthenticated ? {
                // I am keeping the `userId` field in this object so the receiving code can read that value by its expected name.
                userId: getUserId(req),
                // I am keeping the `userEmail` field in this object so the receiving code can read that value by its expected name.
                userEmail: getUserEmail(req)
            // I am keeping this line here because the surrounding auth.js workflow expects this value or operation before it continues.
            } : {})
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        });
    // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
    } catch (error) {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        logger.error('Auth status route error', {
            // I am keeping the `requestId` field in this object so the receiving code can read that value by its expected name.
            requestId: req.requestId,
            // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
            error: error.message
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        });
        // I am building or sending the Express response here with the status, data, or page already chosen by this route.
        res.status(500).json({
            // I am keeping the `success` field in this object so the receiving code can read that value by its expected name.
            success: false,
            // I am keeping the `message` field in this object so the receiving code can read that value by its expected name.
            message: 'Internal server error'
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        });
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
});

/**
 * POST /api/auth/register
 * Creates a new user account using Supabase Auth
 * Note: This is a server-side validation endpoint - actual user creation is handled by Supabase
 */
router.post('/register', registerLimiter(), validateUserRegistration, async (req, res) => {
    // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
    try {
        // I am saving `turnstileCheck` here so the nearby steps can reuse the same value without rebuilding it each time.
        const turnstileCheck = await verifyTurnstileRequest(req, {
            // I am keeping the `intent` field in this object so the receiving code can read that value by its expected name.
            intent: 'interactive-register'
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        });

        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (!turnstileCheck.ok) {
            // I am calling this helper here so the current workflow performs this step before it moves on.
            logger.warn({
                // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
                event: 'auth.turnstile.denied',
                // I am keeping the `requestId` field in this object so the receiving code can read that value by its expected name.
                requestId: req.requestId,
                // I am keeping the `code` field in this object so the receiving code can read that value by its expected name.
                code: turnstileCheck.code,
                // I am keeping the `errors` field in this object so the receiving code can read that value by its expected name.
                errors: turnstileCheck.errors,
                // I am keeping the `intent` field in this object so the receiving code can read that value by its expected name.
                intent: 'interactive-register'
            // I am keeping this line here because the surrounding auth.js workflow expects this value or operation before it continues.
            }, 'Turnstile verification failed for registration');
            // This return sends the completed value or response back to the code that called this function.
            return res.status(400).json({
                // I am keeping the `success` field in this object so the receiving code can read that value by its expected name.
                success: false,
                // I am keeping the `message` field in this object so the receiving code can read that value by its expected name.
                message: 'Verification failed. Please try again.'
            // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
            });
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }

        // I am saving `clientIP` here so the nearby steps can reuse the same value without rebuilding it each time.
        const clientIP = getClientIP(req);
        // I am saving `email` here so the nearby steps can reuse the same value without rebuilding it each time.
        const { email, _password, _display_name, ..._profileData } = req.body;
        
        // I am calling this helper here so the current workflow performs this step before it moves on.
        logger.auth('register_attempt', {
            // I am keeping the `requestId` field in this object so the receiving code can read that value by its expected name.
            requestId: req.requestId,
            // I am keeping the `email` field in this object so the receiving code can read that value by its expected name.
            email: email,
            // I am keeping the `ip` field in this object so the receiving code can read that value by its expected name.
            ip: clientIP
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        });
        
        /**
         * WHAT:
         * Return generic success message without echoing user data.
         * 
         * WHY:
         * Don't echo raw email or undefined fields back to client.
         * Prevents PII exposure and cleaner response.
         * Client already has the data they submitted.
         * 
         * HOW:
         * Return success flag and message only.
         * No user data in response.
         */
        res.json({
            // I am keeping the `success` field in this object so the receiving code can read that value by its expected name.
            success: true,
            // I am keeping the `message` field in this object so the receiving code can read that value by its expected name.
            message: 'Validation passed. Proceed with Supabase user creation.'
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        });
        
    // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
    } catch (error) {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        logger.error('Register validation error', {
            // I am keeping the `requestId` field in this object so the receiving code can read that value by its expected name.
            requestId: req.requestId,
            // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
            error: error.message
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        });
        // I am building or sending the Express response here with the status, data, or page already chosen by this route.
        res.status(500).json({
            // I am keeping the `success` field in this object so the receiving code can read that value by its expected name.
            success: false,
            // I am keeping the `message` field in this object so the receiving code can read that value by its expected name.
            message: 'Internal server error during validation'
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        });
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
});

// I am exporting this value here so another module can deliberately reuse the completed piece from auth.js.
module.exports = router;
