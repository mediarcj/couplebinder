// File: server/routes/dashboard.js
// Description: Protected dashboard routes for authenticated users
// Purpose: Provides user dashboard and profile management
// Notes: All routes require authentication via requireAuth middleware

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/requireAuth');
const { db } = require('../db/connection');

/**
 * GET /dashboard
 * Main dashboard page for authenticated users
 */
router.get('/', requireAuth, async (req, res) => {
    try {
        // Get user data from database
        const user = await db('users')
            .select('id', 'email', 'first_name', 'last_name', 'created_at', 'updated_at')
            .where('id', req.session.userId)
            .first();

        if (!user) {
            // User not found in database, destroy session and redirect
            req.session.destroy();
            return res.redirect('/?error=user_not_found');
        }

        res.render('dashboard', {
            title: 'Dashboard',
            user: user,
            requestId: req.requestId,
            csrfToken: res.locals.csrfToken
        });
    } catch (error) {
        console.error('Dashboard route error:', error.message);
        res.status(500).render('error', {
            title: 'Error',
            message: 'Unable to load dashboard',
            requestId: req.requestId
        });
    }
});

module.exports = router;