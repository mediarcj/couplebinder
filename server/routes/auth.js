// File: server/routes/auth.js
// Description: Authentication routes for user login and logout
// Purpose: Handles login form submissions and user authentication
// Notes: Uses auth middleware for credential verification

const express = require('express');
const { verifyLogin } = require('../middleware/auth');
const { createAuthRateLimit, getClientIP } = require('../middleware/security');
const logger = require('../utils/logger');
const consoleLogger = require('../utils/consoleLogger');
const router = express.Router();

/**
 * POST /api/auth/login
 * Handles user login form submission with server-authoritative security
 */
router.post('/login', createAuthRateLimit(), async (req, res) => {
    try {
        const { email, password } = req.body;
        const clientIP = getClientIP(req);

        // Basic validation
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Email and password are required'
            });
        }

        // Verify login credentials with client IP for security tracking
        const result = await verifyLogin(email, password, clientIP);
        
        if (result.success) {
            // Create session for logged-in user
            req.session.userId = result.user.id;
            req.session.userEmail = result.user.email;
            req.session.isAuthenticated = true;
            
            logger.auth('login_success', {
                requestId: req.requestId,
                outcome: 'success',
                ip: clientIP
            });
            consoleLogger.formatAuthEvent('login_success', {
                requestId: req.requestId,
                outcome: 'success',
                ip: clientIP
            });
            
            // Explicitly save the session
            req.session.save((err) => {
                if (err) {
                    logger.error('Session save error', {
                        requestId: req.requestId,
                        error: err.message
                    });
                    return res.status(500).json({
                        success: false,
                        message: 'Session error'
                    });
                }
                
                logger.session('saved successfully', {
                    requestId: req.requestId
                });
                res.json({
                    success: true,
                    message: 'Login successful',
                    user: result.user
                });
            });
        } else {
            logger.auth('login_failed', {
                requestId: req.requestId,
                outcome: 'failed',
                ip: clientIP
            });
            consoleLogger.formatAuthEvent('login_failed', {
                requestId: req.requestId,
                outcome: 'failed',
                ip: clientIP
            });
            
            res.status(401).json({
                success: false,
                message: result.message
            });
        }
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
 * Handles user logout and destroys session
 */
router.post('/logout', (req, res) => {
    try {
        req.session.destroy((err) => {
            if (err) {
                logger.error('Logout session destroy error', {
                    requestId: req.requestId,
                    error: err.message
                });
                return res.status(500).json({
                    success: false,
                    message: 'Logout failed'
                });
            }
            
            logger.auth('logout_success', {
                requestId: req.requestId,
                outcome: 'success',
                ip: req.ip
            });
            consoleLogger.formatAuthEvent('logout_success', {
                requestId: req.requestId,
                outcome: 'success',
                ip: req.ip
            });
            
            res.clearCookie('connect.sid');
            res.json({
                success: true,
                message: 'Logout successful'
            });
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
 * Returns current session status
 */
router.get('/status', (req, res) => {
    try {
        if (req.session.isAuthenticated) {
            res.json({
                success: true,
                authenticated: true,
                userId: req.session.userId,
                userEmail: req.session.userEmail
            });
        } else {
            res.json({
                success: true,
                authenticated: false
            });
        }
    } catch (error) {
        console.error('Session status route error:', error.message);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

module.exports = router;
