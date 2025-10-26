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
const { getClientIP } = require('../middleware/security');
const { hasUser, getUserId, getUserEmail } = require('../utils/authz');
// Import rate limiters (SECONDARY layer - Cloudflare edge is PRIMARY layer)
// NOTE: These are imported but rate limiting is applied at the route level in zorvalon.js
// See zorvalon.js lines 594-600 for actual rate limiter application
const { loginLimiter, signupLimiter } = require('../middleware/rateLimiter');
const { validateUserRegistration } = require('../middleware/validation');
const logger = require('../utils/logger');
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
    try {
        const isProd = process.env.NODE_ENV === 'production';
        const allowLegacy = process.env.ALLOW_LEGACY_LOGIN === 'true';
        
        // In production, return 404 unless explicitly allowed
        if (isProd && !allowLegacy) {
            logger.warn({
                event: 'auth.login.dead_endpoint_hit',
                requestId: req.requestId,
                ip: req.clientIp || req.ip,
                path: req.originalUrl || req.path
            }, 'Dead login endpoint accessed in production');
            
            return res.sendStatus(404);
        }
        
        // Development mode: return helpful message
        const clientIP = getClientIP(req);
        
        logger.auth('login_attempt', {
            requestId: req.requestId,
            outcome: 'redirected_to_supabase',
            ip: clientIP
        });
        
        res.status(400).json({
            success: false,
            message: 'Please use Supabase Auth for login. This endpoint is deprecated.'
        });
    } catch (error) {
        logger.error('Login route error', {
            requestId: req.requestId,
            error: error.message
        });
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
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
    try {
        logger.auth('logout_legacy_redirect', {
            requestId: req.requestId,
            ip: req.ip
        });
        
        // 307 preserves POST method and body for CSRF compatibility
        return res.redirect(307, '/auth/clear-cookie');
    } catch (error) {
        logger.error('Logout route error', {
            requestId: req.requestId,
            error: error.message
        });
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

/**
 * GET /api/auth/status
 * Returns current authentication status from stateless tokens
 */
router.get('/status', (req, res) => {
    try {
        if (hasUser(req)) {
            res.json({
                success: true,
                authenticated: true,
                userId: getUserId(req),
                userEmail: getUserEmail(req)
            });
        } else {
            res.json({
                success: true,
                authenticated: false
            });
        }
    } catch (error) {
        logger.error('Auth status route error', {
            requestId: req.requestId,
            error: error.message
        });
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

/**
 * POST /api/auth/signup
 * Creates a new user account using Supabase Auth
 * Note: This is a server-side validation endpoint - actual user creation is handled by Supabase
 */
router.post('/signup', signupLimiter(), validateUserRegistration, async (req, res) => {
    try {
        const clientIP = getClientIP(req);
        const { email, _password, _display_name, ..._profileData } = req.body;
        
        logger.auth('signup_attempt', {
            requestId: req.requestId,
            email: email,
            ip: clientIP
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
            success: true,
            message: 'Validation passed. Proceed with Supabase user creation.'
        });
        
    } catch (error) {
        logger.error('Signup validation error', {
            requestId: req.requestId,
            error: error.message
        });
        res.status(500).json({
            success: false,
            message: 'Internal server error during validation'
        });
    }
});

module.exports = router;
