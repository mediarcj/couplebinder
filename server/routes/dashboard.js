// Description: Protected dashboard routes for authenticated users
// Purpose: Provides user dashboard and profile management
// Notes: Auth is enforced at mount-time in bootstrap/routes.js (app.use('/dashboard', requireAuth, router))

'use strict';

const express = require('express');
const router = express.Router();

const { buildDashboardPageModel, buildErrorPageModel } = require('../ui_contract/presenters');
const { getReceiptVM } = require('../services/receiptService');
const { getPricingCatalog } = require('../services/pricingCatalog');
const { archiveReceiptSnapshot } = require('../services/receiptArchive');
const { assertUser } = require('../utils/authz');
const logger = require('../utils/logger');
const { config } = require('../config');
const { formatDateForDisplay, formatCurrency, sanitizeUrl, formatPrice } = require('../ui_contract/presenters/helpers/viewFormatters');
const { serializeForHtmlScript } = require('../utils/serializeForHtmlScript');

function applyProtectedPageDefaults({ req: _req, res, pageModel, title }) {
  // Protected pages share nonce, CSRF, asset-version, and browser client settings. Applying
  // them here keeps individual route models consistent with the main dashboard shell.
  pageModel.page = pageModel.page || {};
  pageModel.ui = pageModel.ui || {};

  pageModel.page.nonce = res.locals.nonce;
  pageModel.page.assetVersion = res.locals.assetVersion || pageModel.page.assetVersion || '';

  if (title) pageModel.page.title = title;

  pageModel.ui.csrfToken = res.locals.csrfToken || pageModel.ui.csrfToken || '';
  pageModel.ui.supabaseUrl = config.supabase.url;
  pageModel.ui.supabaseAnonKey = config.supabase.anonKey;

  return pageModel;
}

/**
 * GET /dashboard
 */
router.get('/', async (req, res) => {
  try {
    const pageModel = await buildDashboardPageModel(req, res);

    const user = assertUser(req);
    const binderId = `default-${user.id}`;

    if (!pageModel.binder || !pageModel.binder.id) {
      pageModel.binder = { id: binderId };

      logger.info(
        { event: 'dashboard.binder_default_attached', binderId, userId: user.id, requestId: req.requestId },
        'Dashboard binder default attached'
      );
    }

    applyProtectedPageDefaults({ req, res, pageModel });

    return res.render('dashboard', pageModel);
  } catch (error) {
    logger.error(
      { event: 'dashboard.route.error', error: error.message, stack: error.stack, requestId: req.requestId },
      'Dashboard route error'
    );
    const pageModel = buildErrorPageModel(req, res, 500, 'Unable to load dashboard');
    return res.status(500).render('error', pageModel);
  }
});

/**
 * GET /dashboard/profile-edit
 */
router.get('/profile-edit', async (req, res) => {
  try {
    const pageModel = await buildDashboardPageModel(req, res);
    applyProtectedPageDefaults({
      req,
      res,
      pageModel,
      title: `Edit Profile - ${config.branding.appName}`
    });
    pageModel.profileBootstrapJson = serializeForHtmlScript(pageModel.user);
    return res.render('profile-edit', pageModel);
  } catch (error) {
    logger.error(
      { event: 'dashboard.profile_edit.error', error: error.message, requestId: req.requestId },
      'Profile edit route error'
    );
    const pageModel = buildErrorPageModel(req, res, 500, 'Unable to load profile edit page');
    return res.status(500).render('error', pageModel);
  }
});

/**
 * GET /dashboard/purchase/confirmation
 */
router.get('/purchase/confirmation', async (req, res, next) => {
  try {
    res.set('Cache-Control', 'no-store');
    res.set('Pragma', 'no-cache');

    const sessionId = String(req.query.session_id || '').trim();
    if (!sessionId) {
      return res.status(400).render('error', {
        page: { title: '400 - Bad Request', nonce: res.locals.nonce },
        error: { status: 400, message: 'Missing session_id parameter' },
        app_info: { name: config.branding.appName }
      });
    }

    const user = assertUser(req);
    const userId = user.id;

    const vm = await getReceiptVM({ sessionId, userId });

    if (config.features.archiveReceipts) {
      // Archiving is useful history but should not block a paid user from seeing their
      // confirmation. Both synchronous and async archive failures stay best-effort.
      try {
        const maybePromise = archiveReceiptSnapshot && archiveReceiptSnapshot({ userId, receipt: vm });
        if (maybePromise && typeof maybePromise.then === 'function') {
          maybePromise.catch(err => {
            logger.warn(
              { event: 'receipt.archive.failed', sessionId, error: err.message },
              'Receipt archival failed (non-blocking)'
            );
          });
        }
      } catch (err) {
        logger.warn(
          { event: 'receipt.archive.threw_sync', sessionId, error: err.message },
          'Receipt archival threw synchronously (ignored)'
        );
      }
    }

    const pageModel = await buildDashboardPageModel(req, res);
    applyProtectedPageDefaults({
      req,
      res,
      pageModel,
      title: `Purchase Confirmation - ${config.branding.appName}`
    });

    const amountMinor = vm?.amount_total ?? null;
    const currency = (vm?.currency || 'usd').toUpperCase();
    const paidAtIso = vm?.paid_at_iso || null;
    const rawReceiptUrl = vm?.official_receipt_url || vm?.stripe_receipt_url || null;

    pageModel.confirmation = {
      sessionId,
      amountMinor,
      currency,
      amountFormatted: amountMinor != null ? formatCurrency(amountMinor, currency) : '—',
      productLabel: vm?.product_label || vm?.product_key || 'Your purchase',
      paidAtIso,
      paidAtFormatted: paidAtIso ? formatDateForDisplay(paidAtIso) : '',
      officialReceiptUrl: sanitizeUrl(rawReceiptUrl),
      payBase: '/api/pay'
    };

    return res.render('purchase-confirmation', pageModel, (err, html) => {
      if (err) {
        logger.error(
          { event: 'purchase.confirmation.view_error', requestId: req.requestId, sessionId, message: err.message, stack: err.stack },
          'EJS rendering failed for purchase-confirmation'
        );
        return next(err);
      }
      return res.send(html);
    });
  } catch (err) {
    logger.error(
      {
        event: 'purchase.confirmation.error',
        requestId: req.requestId,
        sessionId: String(req.query.session_id || ''),
        status: err.status || err.statusCode || 500,
        code: err.code,
        type: err.type,
        message: err.message
      },
      'Purchase confirmation route error'
    );

    if ((err.status || 500) === 404) {
      return res.status(404).render('error', {
        page: { title: '404 - Not Found', nonce: res.locals.nonce },
        error: { status: 404, message: 'Confirmation not found' },
        app_info: { name: config.branding.appName }
      });
    }

    return next(err);
  }
});

/**
 * GET /dashboard/receipt.pdf
 * DEPRECATED
 */
router.get('/receipt.pdf', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.set('Pragma', 'no-cache');
  return res.status(410).send('This endpoint is deprecated. Please use the official receipt via the confirmation page.');
});

/**
 * GET /dashboard/billing/buy?product=<productKey>&qty=1
 * Legacy redirect route
 */
router.get('/billing/buy', async (req, res) => {
  const { product, qty } = req.query;
  if (!product) return res.redirect('/dashboard/billing');
  const q = typeof qty === 'string' ? qty : '1';
  return res.redirect(302, `/dashboard/checkout/review?product=${encodeURIComponent(product)}&qty=${encodeURIComponent(q)}`);
});

function activePriceIdsForProductKey(key) {
  const ids = new Set();
  const add = (value) => {
    const normalized = String(value || '').trim();
    if (normalized) ids.add(normalized);
  };

  if (key === 'resume_one_time') add(config?.stripe?.active?.priceResumeOneTime);
  if (key === 'resume_expert') add(config?.stripe?.active?.priceResumeExpert);
  return ids;
}

/**
 * GET /dashboard/checkout/review?product=<productKey>&qty=1
 */
router.get('/checkout/review', async (req, res, next) => {
  try {
    const { product: productKeyRaw, qty } = req.query;

    if (!productKeyRaw) {
      return res.status(400).render('error', {
        page: { title: '400 - Bad Request', nonce: res.locals.nonce },
        error: { status: 400, message: 'Missing product parameter' },
        app_info: { name: config.branding.appName }
      });
    }

    const quantity = Math.max(1, parseInt(qty || '1', 10));
    const productKey = String(productKeyRaw).trim();

    const catalog = await getPricingCatalog();

    const candidateIds = activePriceIdsForProductKey(productKey);

    const product = catalog.find(p =>
      p.product_key === productKey || candidateIds.has(p.priceId)
    );

    if (!product) {
      logger.warn(
        {
          event: 'checkout.review.product_not_found',
          productKey,
          candidateIds: Array.from(candidateIds),
          catalogPriceIds: catalog.map(p => p.priceId),
          requestId: req.requestId
        },
        'Review product not found'
      );

      return res.status(404).render('error', {
        page: { title: '404 - Not Found', nonce: res.locals.nonce },
        error: { status: 404, message: 'Product not found' },
        app_info: { name: config.branding.appName }
      });
    }

    const pageModel = await buildDashboardPageModel(req, res);
    applyProtectedPageDefaults({
      req,
      res,
      pageModel,
      title: `Review Purchase - ${config.branding.appName}`
    });

    const normalizedProduct = {
      key: product.product_key || productKey,
      name: product.name,
      currency: product.currency || 'usd',
      unit_amount: product.unit_amount,
      interval: product.interval,
      priceId: product.priceId
    };

    const subtotal = (normalizedProduct.unit_amount || 0) * quantity;
    const total = subtotal;

    pageModel.product = {
      ...normalizedProduct,
      unitPriceFormatted: normalizedProduct.unit_amount != null
        ? formatPrice(normalizedProduct.unit_amount, normalizedProduct.currency, normalizedProduct.interval)
        : '—'
    };

    pageModel.quantity = quantity;
    pageModel.subtotal = subtotal;
    pageModel.total = total;
    pageModel.totalFormatted = total != null ? formatCurrency(total, normalizedProduct.currency) : '—';
    pageModel.productKey = normalizedProduct.key;

    return res.render('checkout-review', pageModel);
  } catch (err) {
    logger.error(
      { event: 'dashboard.checkout_review.error', error: err.message, stack: err.stack, requestId: req.requestId },
      'Checkout review route error'
    );
    return next(err);
  }
});

// CONNECT: ADD-NEW-HERE — future template route
//  This example shows how to hook in the new master protected template.
//  Do not uncomment until you are ready to activate it.

// GET /template-protected
// router.get('/template-protected', async (req, res) => {
//   console.log('[ROUTE] /dashboard/template-protected - reached handler');
// });

module.exports = router;
