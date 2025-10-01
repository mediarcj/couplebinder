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
const { createAuthRateLimit, getClientIP } = require('../middleware/security');
const { validateUserRegistration } = require('../middleware/validation');
const { supabaseAdmin } = require('../utils/supabaseClient');
const logger = require('../utils/logger');
const consoleLogger = require('../utils/consoleLogger');
const router = express.Router();

/**
 * POST /api/auth/login
 * Note: Login is handled by Supabase Auth on the frontend
 * This endpoint is kept for backward compatibility but returns a message
 */
router.post('/login', createAuthRateLimit(), async (req, res) => {
    try {
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
 * Note: Logout is handled by Supabase Auth on the frontend
 * This endpoint is kept for backward compatibility but returns a message
 */
router.post('/logout', (req, res) => {
    try {
        logger.auth('logout_attempt', {
            requestId: req.requestId,
            outcome: 'redirected_to_supabase',
            ip: req.ip
        });
        
        res.json({
            success: true,
            message: 'Please use Supabase Auth for logout. This endpoint is deprecated.'
        });
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
        if (req.user?.id) {
            res.json({
                success: true,
                authenticated: true,
                userId: req.user.id,
                userEmail: req.user.email
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
router.post('/signup', createAuthRateLimit(), validateUserRegistration, async (req, res) => {
    try {
        const clientIP = getClientIP(req);
        const { email, password, first_name, last_name, ...profileData } = req.body;
        
        logger.auth('signup_attempt', {
            requestId: req.requestId,
            email: email,
            ip: clientIP
        });
        
        // Note: User creation is handled by Supabase Auth on the frontend
        // This endpoint only provides server-side validation
        // The frontend will call Supabase directly for user creation
        
        res.json({
            success: true,
            message: 'Validation passed. Please proceed with Supabase user creation.',
            validatedData: {
                email: email,
                first_name: first_name,
                last_name: last_name,
                profileData: profileData
            }
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
