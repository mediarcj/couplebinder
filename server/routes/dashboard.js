// File: server/routes/dashboard.js
// Description: Protected dashboard routes for authenticated users
// Purpose: Provides user dashboard and profile management
// Notes: All routes require authentication via requireAuth middleware

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/requireAuth');
const { buildDashboardPageModel, buildErrorPageModel } = require('../ui_contract/presenters');

/**
 * GET /dashboard
 * Main dashboard page for authenticated users
 */
router.get('/', requireAuth, async (req, res) => {
    try {
        // Build page model using presenter
        const pageModel = await buildDashboardPageModel(req, res);

        // User data comes directly from Supabase token, no database lookup needed

        // Add nonce to page model for EJS template
        pageModel.nonce = res.locals.nonce;
        
        // Render EJS template with page model
        res.render('dashboard', pageModel);
    } catch (error) {
        console.error('Dashboard route error:', error.message);
        const pageModel = buildErrorPageModel(req, res, 500, 'Unable to load dashboard');
        res.status(500).render('error', pageModel);
    }
});

module.exports = router;