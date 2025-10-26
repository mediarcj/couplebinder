// File: server/routes/dashboard.js
// Description: Protected dashboard routes for authenticated users
// Purpose: Provides user dashboard and profile management
// Notes: All routes require authentication via requireAuth middleware

const express = require('express');
const router = express.Router();
// requireAuth is applied globally to /dashboard routes in zorvalon.js
const { buildDashboardPageModel, buildErrorPageModel } = require('../ui_contract/presenters');
const { getReceiptVM } = require('../services/receiptService');
const { assertUser } = require('../utils/authz');
const logger = require('../utils/logger');

/**
 * GET /dashboard
 * Main dashboard page for authenticated users
 */
router.get('/', async (req, res) => {
    try {
        // Build page model using presenter
        const pageModel = await buildDashboardPageModel(req, res);

        // User data comes directly from Supabase token, no database lookup needed

        // Add nonce to page.nonce for EJS template (matches index.ejs pattern)
        pageModel.page.nonce = res.locals.nonce;
        
        // Add Supabase credentials for client initialization (dashboard needs them for logout)
        pageModel.ui.supabaseUrl = process.env.SUPABASE_URL;
        pageModel.ui.supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
        
        // Render EJS template with page model
        res.render('dashboard', pageModel);
    } catch (error) {
        logger.error({
            event: 'dashboard.route.error',
            error: error.message,
            stack: error.stack,
            requestId: req.requestId
        }, 'Dashboard route error');
        const pageModel = buildErrorPageModel(req, res, 500, 'Unable to load dashboard');
        res.status(500).render('error', pageModel);
    }
});

/**
 * GET /dashboard/profile-edit
 * User profile edit page for authenticated users
 */
router.get('/profile-edit', async (req, res) => {
    try {
        // Build page model using presenter
        const pageModel = await buildDashboardPageModel(req, res);

        // Add nonce to page.nonce for EJS template
        pageModel.page.nonce = res.locals.nonce;
        
        // Add Supabase credentials for client initialization
        pageModel.ui.supabaseUrl = process.env.SUPABASE_URL;
        pageModel.ui.supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
        
        // Update page title for profile edit
        pageModel.page.title = `Edit Profile - ${process.env.APP_NAME || 'Application'}`;
        
        // Render EJS template with page model
        res.render('profile-edit', pageModel);
    } catch (error) {
        logger.error({
            event: 'dashboard.profile_edit.error',
            error: error.message,
            requestId: req.requestId
        }, 'Profile edit route error');
        const pageModel = buildErrorPageModel(req, res, 500, 'Unable to load profile edit page');
        res.status(500).render('error', pageModel);
    }
});

/**
 * GET /dashboard/receipt
 * Branded receipt page for successful payments
 */
router.get('/receipt', async (req, res, next) => {
    try {
        const sessionId = req.query.session_id;
        if (!sessionId) {
            return res.redirect('/dashboard/billing');
        }

        const user = assertUser(req);
        const userId = user.id;

        const vm = await getReceiptVM({ sessionId, userId });
        
        res.render('receipt', {
            page: {
                title: 'Receipt - ' + (process.env.APP_NAME || 'Application'),
                nonce: res.locals.nonce
            },
            receipt: vm,
            app_info: {
                name: process.env.APP_NAME || 'Application',
                description: process.env.APP_DESCRIPTION || 'A modern web application'
            }
        });
    } catch (err) {
        if ((err.status || 500) === 404) {
            return res.status(404).render('error', {
                page: {
                    title: '404 - Not Found',
                    nonce: res.locals.nonce
                },
                error: {
                    status: 404,
                    message: 'Receipt not found'
                },
                app_info: {
                    name: process.env.APP_NAME || 'Application'
                }
            });
        }
        next(err);
    }
});

module.exports = router;