// File: server/routes/dashboard.js
// Description: Protected dashboard routes for authenticated users
// Purpose: Provides user dashboard and profile management
// Notes: All routes require authentication via requireAuth middleware

const express = require('express');
const router = express.Router();
// requireAuth is applied globally to /dashboard routes in zorvalon.js
const { buildDashboardPageModel, buildErrorPageModel } = require('../ui_contract/presenters');
// const { buildTemplateProtectedPageModel } = require('../ui_contract/presenters/_templatePresenter');
const { getReceiptVM } = require('../services/receiptService');
const { getPricingCatalog, getPriceSummary } = require('../services/pricingCatalog');
const { archiveReceiptSnapshot } = require('../services/receiptArchive');
const { assertUser } = require('../utils/authz');
const logger = require('../utils/logger');
const { config } = require('../config');

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
        
        // Ensure ui object exists and has required fields (canonical block)
        pageModel.ui = pageModel.ui || {};
        pageModel.ui.csrfToken = res.locals.csrfToken || '';
        pageModel.ui.supabaseUrl = config.supabase.url;
        pageModel.ui.supabaseAnonKey = config.supabase.anonKey;
        
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
        
        // Ensure ui object exists and has required fields
        pageModel.ui = pageModel.ui || {};
        pageModel.ui.csrfToken = res.locals.csrfToken || '';
        pageModel.ui.supabaseUrl = config.supabase.url;
        pageModel.ui.supabaseAnonKey = config.supabase.anonKey;
        
        // Update page title for profile edit
        pageModel.page.title = `Edit Profile - ${config.branding.appName}`;
        
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
 * GET /dashboard/purchase/confirmation
 * Purchase confirmation page (NOT an official receipt)
 * Shows minimal purchase details and link to official receipt
 */
router.get('/purchase/confirmation', async (req, res, next) => {
    try {
        res.set('Cache-Control', 'no-store');
        res.set('Pragma', 'no-cache');
        
        const sessionId = String(req.query.session_id || '').trim();
        if (!sessionId) {
            return res.status(400).render('error', {
                page: {
                    title: '400 - Bad Request',
                    nonce: res.locals.nonce
                },
                error: {
                    status: 400,
                    message: 'Missing session_id parameter'
                },
                app_info: {
                    name: config.branding.appName
                }
            });
        }

        const user = assertUser(req);
        const userId = user.id;

        // Fetch receipt data for ownership verification and minimal details
        const vm = await getReceiptVM({ sessionId, userId });
        
        // Archive receipt snapshot (fire-and-forget, non-blocking)
        if (config.features.archiveReceipts) {
            try {
                const maybePromise = archiveReceiptSnapshot && archiveReceiptSnapshot({ userId, receipt: vm });
                if (maybePromise && typeof maybePromise.then === 'function') {
                    maybePromise.catch(err => {
                        logger.warn({
                            event: 'receipt.archive.failed',
                            sessionId,
                            error: err.message
                        }, 'Receipt archival failed (non-blocking)');
                    });
                }
            } catch (err) {
                logger.warn({
                    event: 'receipt.archive.threw_sync',
                    sessionId,
                    error: err.message
                }, 'Receipt archival threw synchronously (ignored)');
            }
        }
        
        // Build dashboard-aligned page model so shared partials get expected keys
        const pageModel = await buildDashboardPageModel(req, res);
        pageModel.page.nonce = res.locals.nonce;
        pageModel.page.assetVersion = Date.now();
        pageModel.page.title = `Purchase Confirmation - ${config.branding.appName}`;
        pageModel.ui = pageModel.ui || {};
        pageModel.ui.csrfToken = res.locals.csrfToken || '';
        pageModel.ui.supabaseUrl = config.supabase.url;
        pageModel.ui.supabaseAnonKey = config.supabase.anonKey;

        // Attach confirmation payload (kept minimal—no PM details)
        pageModel.confirmation = {
            sessionId,
            amountMinor: vm?.amount_total ?? null,
            currency: (vm?.currency || 'usd').toUpperCase(),
            productLabel: vm?.product_label || vm?.product_key || 'Your purchase',
            paidAtIso: vm?.paid_at_iso || null,
            officialReceiptUrl: vm?.official_receipt_url || vm?.stripe_receipt_url || null
        };

        // Use callback to capture template errors for logging & handoff to error handler
        return res.render('purchase-confirmation', pageModel, (err, html) => {
            if (err) {
                logger.error({
                    event: 'purchase.confirmation.view_error',
                    requestId: req.requestId,
                    sessionId,
                    message: err.message,
                    stack: err.stack
                }, 'EJS rendering failed for purchase-confirmation');
                return next(err);
            }
            res.send(html);
        });
    } catch (err) {
        logger.error({
            event: 'purchase.confirmation.error',
            requestId: req.requestId,
            sessionId: String(req.query.session_id || ''),
            status: err.status || err.statusCode || 500,
            code: err.code,
            type: err.type,
            message: err.message
        }, 'Purchase confirmation route error');
        
        if ((err.status || 500) === 404) {
            return res.status(404).render('error', {
                page: {
                    title: '404 - Not Found',
                    nonce: res.locals.nonce
                },
                error: {
                    status: 404,
                    message: 'Confirmation not found'
                },
                app_info: {
                    name: config.branding.appName
                }
            });
        }
        next(err);
    }
});

/**
 * GET /dashboard/receipt.pdf
 * DEPRECATED: This endpoint is deprecated in favor of official receipts
 */
router.get('/receipt.pdf', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.set('Pragma', 'no-cache');
    return res.status(410).send('This endpoint is deprecated. Please use the official receipt via the confirmation page.');
});

/**
 * GET /dashboard/billing/buy?product=<productKey>&qty=1
 * Legacy redirect route - sends to review page
 */
router.get('/billing/buy', async (req, res) => {
    const { product, qty } = req.query;
    if (!product) return res.redirect('/dashboard/billing');
    const q = typeof qty === 'string' ? qty : '1';
    return res.redirect(302, `/dashboard/checkout/review?product=${encodeURIComponent(product)}&qty=${encodeURIComponent(q)}`);
});

/**
 * GET /dashboard/checkout/review?product=<productKey>&qty=1
 * Review page before checkout - shows product details and summary
 */
router.get('/checkout/review', async (req, res, next) => {
    try {
        const { product: productKeyRaw, qty } = req.query;
        
        if (!productKeyRaw) {
            return res.status(400).render('error', {
                page: {
                    title: '400 - Bad Request',
                    nonce: res.locals.nonce
                },
                error: {
                    status: 400,
                    message: 'Missing product parameter'
                },
                app_info: {
                    name: config.branding.appName
                }
            });
        }

        const quantity = Math.max(1, parseInt(qty || '1', 10));
        const productKey = String(productKeyRaw).trim();

        // Get pricing catalog to find product details
        const catalog = await getPricingCatalog();

        // Helper function to select product by key with multiple fallback strategies
        function selectByKey(key) {
            const isOneTime = config.stripe.priceResumeOneTime && key === 'resume_one_time';
            const isExpert = config.stripe.priceResumeExpert && key === 'resume_expert';
            
            return catalog.find(p =>
                // Prefer explicit metadata keys if present
                p.product_metadata?.product_key === key ||
                p.product_key === key ||
                // Fallback: match the known config price IDs for the two products
                (isOneTime && p.priceId === config.stripe.priceResumeOneTime) ||
                (isExpert && p.priceId === config.stripe.priceResumeExpert)
            );
        }

        const product = selectByKey(productKey);

        if (!product) {
            logger.warn({
                event: 'checkout.review.product_not_found',
                productKey,
                requestId: req.requestId
            }, 'Review product not found');
            
            return res.status(404).render('error', {
                page: {
                    title: '404 - Not Found',
                    nonce: res.locals.nonce
                },
                error: {
                    status: 404,
                    message: 'Product not found'
                },
                app_info: {
                    name: config.branding.appName
                }
            });
        }

        // Build page model for consistent dashboard layout
        const pageModel = await buildDashboardPageModel(req, res);
        pageModel.page.title = 'Review Purchase - ' + config.branding.appName;
        pageModel.page.nonce = res.locals.nonce;
        pageModel.page.assetVersion = Date.now();
        pageModel.ui = pageModel.ui || {};
        pageModel.ui.csrfToken = res.locals.csrfToken || '';
        pageModel.ui.supabaseUrl = config.supabase.url;
        pageModel.ui.supabaseAnonKey = config.supabase.anonKey;

        // Normalize product data for template
        const normalizedProduct = {
            key: product.product_metadata?.product_key || productKey,
            name: product.name,
            currency: product.currency || 'usd',
            unit_amount: product.unit_amount,
            interval: product.interval,
            priceId: product.priceId
        };

        // Compute totals (Stripe will finalize taxes)
        const subtotal = (normalizedProduct.unit_amount || 0) * quantity;
        const total = subtotal;

        // Add product and pricing data
        pageModel.product = normalizedProduct;
        pageModel.quantity = quantity;
        pageModel.subtotal = subtotal;
        pageModel.total = total;
        pageModel.productKey = normalizedProduct.key;

        res.render('checkout-review', pageModel);
    } catch (err) {
        logger.error({
            event: 'dashboard.checkout_review.error',
            error: err.message,
            stack: err.stack,
            requestId: req.requestId
        }, 'Checkout review route error');
        next(err);
    }
});

// ============================================================
// CONNECT: ADD-NEW-HERE — future template route
// WHAT:
//  This example shows how to hook in the new master protected template.
//  Do not uncomment until you are ready to activate it.
// ============================================================

// GET /template-protected
// router.get('/template-protected', async (req, res) => {
//   console.log('[ROUTE] /dashboard/template-protected - reached handler');
// });

module.exports = router;
