// File: server/routes/auth.js
// Description: Authentication routes for stateless authentication
// Purpose: Handles authentication status and token verification
// Notes: Uses Supabase stateless authentication via authBridge middleware

const express = require('express');
const { createAuthRateLimit, getClientIP } = require('../middleware/security');
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

module.exports = router;
