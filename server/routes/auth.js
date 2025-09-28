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

module.exports = router;
