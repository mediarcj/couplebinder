// File: server/routes/auth.js
// Description: Authentication routes for user login and logout
// Purpose: Handles login form submissions and user authentication
// Notes: Uses auth middleware for credential verification

const express = require('express');
const { verifyLogin } = require('../middleware/auth');
const router = express.Router();

/**
 * POST /api/auth/login
 * Handles user login form submission
 */
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Basic validation
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Email and password are required'
            });
        }

        // Verify login credentials
        const result = await verifyLogin(email, password);
        
        if (result.success) {
            // Create session for logged-in user
            req.session.userId = result.user.id;
            req.session.userEmail = result.user.email;
            req.session.isAuthenticated = true;
            
            res.json({
                success: true,
                message: 'Login successful',
                user: result.user
            });
        } else {
            res.status(401).json({
                success: false,
                message: result.message
            });
        }
    } catch (error) {
        console.error('Login route error:', error.message);
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
                console.error('Logout session destroy error:', err.message);
                return res.status(500).json({
                    success: false,
                    message: 'Logout failed'
                });
            }
            
            res.clearCookie('connect.sid');
            res.json({
                success: true,
                message: 'Logout successful'
            });
        });
    } catch (error) {
        console.error('Logout route error:', error.message);
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
