// File: server/routes/dashboard.js
// Description: Protected dashboard routes for authenticated users
// Purpose: Provides user dashboard and profile management
// Notes: All routes require authentication via requireAuth middleware

const express = require('express');
const router = express.Router();
const fs = require('fs');
const QRCode = require('qrcode');
const puppeteer = require('puppeteer-core');
// requireAuth is applied globally to /dashboard routes in zorvalon.js
const { buildDashboardPageModel, buildErrorPageModel } = require('../ui_contract/presenters');
const { getReceiptVM } = require('../services/receiptService');
const { getPricingCatalog, getPriceSummary } = require('../services/pricingCatalog');
const { assertUser } = require('../utils/authz');
const logger = require('../utils/logger');

// Helper: pick chromium path in Alpine
function chromiumPath() {
  const c1 = '/usr/bin/chromium';
  const c2 = '/usr/bin/chromium-browser';
  return fs.existsSync(c1) ? c1 : (fs.existsSync(c2) ? c2 : process.env.PUPPETEER_EXECUTABLE_PATH);
}

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
        
        // Generate QR code for receipt
        const absoluteSelfUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
        const qrText = vm.stripe_receipt_url || absoluteSelfUrl;
        const qrSvg = await QRCode.toString(qrText, { type: 'svg', margin: 1, width: 192 });
        
        // Build page model using presenter for consistent structure
        const pageModel = await buildDashboardPageModel(req, res);
        pageModel.page.title = 'Receipt - ' + (process.env.APP_NAME || 'Application');
        pageModel.page.nonce = res.locals.nonce;
        pageModel.page.assetVersion = Date.now();
        
        // Add Supabase credentials for client initialization
        pageModel.ui.supabaseUrl = process.env.SUPABASE_URL;
        pageModel.ui.supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
        
        // Add receipt-specific data
        pageModel.receipt = vm;
        pageModel.qrSvg = qrSvg;
        pageModel.features = {
            emailReceipt: !!process.env.FEATURE_EMAIL_RECEIPT
        };
        
        res.render('receipt', pageModel);
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

/**
 * GET /dashboard/receipt.pdf
 * Server-side PDF render (headless Chromium)
 */
router.get('/receipt.pdf', async (req, res, next) => {
    try {
        const sessionId = req.query.session_id;
        if (!sessionId) {
            return res.status(400).send('Missing session_id');
        }

        const user = assertUser(req);
        const userId = user.id;

        const vm = await getReceiptVM({ sessionId, userId });
        
        // Generate QR code
        const absoluteSelfUrl = `${req.protocol}://${req.get('host')}/dashboard/receipt?session_id=${encodeURIComponent(sessionId)}`;
        const qrText = vm.stripe_receipt_url || absoluteSelfUrl;
        const qrSvg = await QRCode.toString(qrText, { type: 'svg', margin: 1, width: 192 });

        // Build page model for consistent structure
        const pageModel = await buildDashboardPageModel(req, res);
        pageModel.page.title = 'Receipt - ' + (process.env.APP_NAME || 'Application');
        pageModel.page.nonce = res.locals.nonce;
        pageModel.page.assetVersion = Date.now();
        pageModel.ui.supabaseUrl = process.env.SUPABASE_URL;
        pageModel.ui.supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
        pageModel.receipt = vm;
        pageModel.qrSvg = qrSvg;
        pageModel.features = { emailReceipt: !!process.env.FEATURE_EMAIL_RECEIPT };
        pageModel.pdfMode = true;
        
        // Render the same EJS to static HTML string
        req.app.render('receipt', pageModel, async (err, html) => {
            if (err) return next(err);
            
            const browser = await puppeteer.launch({
                executablePath: chromiumPath(),
                args: ['--no-sandbox', '--disable-gpu', '--font-render-hinting=medium']
            });
            
            try {
                const page = await browser.newPage();
                await page.setContent(html, { waitUntil: ['domcontentloaded'] });
                await page.emulateMediaType('print');
                const pdf = await page.pdf({
                    printBackground: true,
                    format: 'A4',
                    margin: { top: '16mm', right: '16mm', bottom: '16mm', left: '16mm' }
                });
                
                const fileBase = vm.invoice_number ? `Receipt-${vm.invoice_number}` : `Receipt-${sessionId}`;
                res.setHeader('Content-Type', 'application/pdf');
                res.setHeader('Content-Disposition', `inline; filename="${fileBase}.pdf"`);
                return res.send(pdf);
            } finally {
                await browser.close();
            }
        });
    } catch (err) {
        return next(err);
    }
});

/**
 * GET /dashboard/checkout/review?product=<productKey>&qty=1
 * Review page before checkout - shows product details and summary
 */
router.get('/checkout/review', async (req, res, next) => {
    try {
        const { product: productKey, qty } = req.query;
        
        if (!productKey) {
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
                    name: process.env.APP_NAME || 'Application'
                }
            });
        }

        const quantity = Math.max(1, parseInt(qty || '1', 10));

        // Get pricing catalog to find product details
        const catalog = await getPricingCatalog();
        const product = catalog.find(p => {
            const isOneTime = productKey === 'resume_one_time' && p.product_metadata?.product_key === 'resume_one_time';
            const isExpert = productKey === 'resume_expert' && p.product_metadata?.product_key === 'resume_expert';
            return isOneTime || isExpert;
        });

        if (!product) {
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
                    name: process.env.APP_NAME || 'Application'
                }
            });
        }

        // Build page model for consistent dashboard layout
        const pageModel = await buildDashboardPageModel(req, res);
        pageModel.page.title = 'Review Purchase - ' + (process.env.APP_NAME || 'Application');
        pageModel.page.nonce = res.locals.nonce;
        pageModel.page.assetVersion = Date.now();
        pageModel.ui.supabaseUrl = process.env.SUPABASE_URL;
        pageModel.ui.supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

        // Compute totals
        const subtotal = (product.unit_amount || 0) * quantity;
        const total = subtotal; // Taxes calculated at Stripe checkout

        // Add product and pricing data
        pageModel.product = product;
        pageModel.quantity = quantity;
        pageModel.subtotal = subtotal;
        pageModel.total = total;
        pageModel.productKey = productKey;

        res.render('checkout-review', pageModel);
    } catch (err) {
        logger.error({
            event: 'dashboard.checkout_review.error',
            error: err.message,
            requestId: req.requestId
        }, 'Checkout review route error');
        next(err);
    }
});

module.exports = router;