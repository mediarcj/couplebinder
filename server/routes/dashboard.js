// File: server/routes/dashboard.js
// Description: Protected dashboard routes for authenticated users
// Purpose: Provides user dashboard and profile management
// Notes: Auth is enforced at mount-time in bootstrap/routes.js (app.use('/dashboard', requireAuth, router))

'use strict';

// I am loading `express` into `express` so this file can reuse that dependency below.
const express = require('express');
// I am saving `router` here so the nearby steps can reuse the same value without rebuilding it each time.
const router = express.Router();

// I am loading `../ui_contract/presenters` into `buildDashboardPageModel` so this file can reuse that dependency below.
const { buildDashboardPageModel, buildErrorPageModel } = require('../ui_contract/presenters');
// I am loading `../services/receiptService` into `getReceiptVM` so this file can reuse that dependency below.
const { getReceiptVM } = require('../services/receiptService');
// I am loading `../services/pricingCatalog` into `getPricingCatalog` so this file can reuse that dependency below.
const { getPricingCatalog } = require('../services/pricingCatalog');
// I am loading `../services/receiptArchive` into `archiveReceiptSnapshot` so this file can reuse that dependency below.
const { archiveReceiptSnapshot } = require('../services/receiptArchive');
// I am loading `../utils/authz` into `assertUser` so this file can reuse that dependency below.
const { assertUser } = require('../utils/authz');
// I am loading `../utils/logger` into `logger` so this file can reuse that dependency below.
const logger = require('../utils/logger');
// I am loading `../config` into `config` so this file can reuse that dependency below.
const { config } = require('../config');
// I am loading `../ui_contract/presenters/helpers/viewFormatters` into `formatDateForDisplay` so this file can reuse that dependency below.
const { formatDateForDisplay, formatCurrency, sanitizeUrl, formatPrice } = require('../ui_contract/presenters/helpers/viewFormatters');

// I am keeping `applyProtectedPageDefaults` as a named helper so the surrounding workflow can call this step when it needs it.
function applyProtectedPageDefaults({ req, res, pageModel, title }) {
  // Protected pages share nonce, CSRF, asset-version, and browser client settings. Applying
  // them here keeps individual route models consistent with the main dashboard shell.
  pageModel.page = pageModel.page || {};
  // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
  pageModel.ui = pageModel.ui || {};

  // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
  pageModel.page.nonce = res.locals.nonce;
  // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
  pageModel.page.assetVersion = res.locals.assetVersion || pageModel.page.assetVersion || '';

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (title) pageModel.page.title = title;

  // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
  pageModel.ui.csrfToken = res.locals.csrfToken || pageModel.ui.csrfToken || '';
  // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
  pageModel.ui.supabaseUrl = config.supabase.url;
  // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
  pageModel.ui.supabaseAnonKey = config.supabase.anonKey;

  // This return sends the completed value or response back to the code that called this function.
  return pageModel;
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * GET /dashboard
 */
router.get('/', async (req, res) => {
  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // I am saving `pageModel` here so the nearby steps can reuse the same value without rebuilding it each time.
    const pageModel = await buildDashboardPageModel(req, res);

    // I am saving `user` here so the nearby steps can reuse the same value without rebuilding it each time.
    const user = assertUser(req);
    // I am saving `binderId` here so the nearby steps can reuse the same value without rebuilding it each time.
    const binderId = `default-${user.id}`;

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!pageModel.binder || !pageModel.binder.id) {
      // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
      pageModel.binder = { id: binderId };

      // I am calling this helper here so the current workflow performs this step before it moves on.
      logger.info(
        // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
        { event: 'dashboard.binder_default_attached', binderId, userId: user.id, requestId: req.requestId },
        // I am listing this entry here because the surrounding collection processes each allowed value in order.
        'Dashboard binder default attached'
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      );
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // I am calling this helper here so the current workflow performs this step before it moves on.
    applyProtectedPageDefaults({ req, res, pageModel });

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (pageModel.user) {
      // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
      pageModel.user.created_at_formatted = formatDateForDisplay(pageModel.user.created_at);
      // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
      pageModel.user.last_sign_in_at_formatted = formatDateForDisplay(pageModel.user.last_sign_in_at);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // This return sends the completed value or response back to the code that called this function.
    return res.render('dashboard', pageModel);
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (error) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.error(
      // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
      { event: 'dashboard.route.error', error: error.message, stack: error.stack, requestId: req.requestId },
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      'Dashboard route error'
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    );
    // I am saving `pageModel` here so the nearby steps can reuse the same value without rebuilding it each time.
    const pageModel = buildErrorPageModel(req, res, 500, 'Unable to load dashboard');
    // This return sends the completed value or response back to the code that called this function.
    return res.status(500).render('error', pageModel);
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
});

/**
 * GET /dashboard/profile-edit
 */
router.get('/profile-edit', async (req, res) => {
  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // I am saving `pageModel` here so the nearby steps can reuse the same value without rebuilding it each time.
    const pageModel = await buildDashboardPageModel(req, res);
    // I am calling this helper here so the current workflow performs this step before it moves on.
    applyProtectedPageDefaults({
      // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
      req,
      // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
      res,
      // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
      pageModel,
      // I am keeping the `title` field in this object so the receiving code can read that value by its expected name.
      title: `Edit Profile - ${config.branding.appName}`
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
    // This return sends the completed value or response back to the code that called this function.
    return res.render('profile-edit', pageModel);
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (error) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.error(
      // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
      { event: 'dashboard.profile_edit.error', error: error.message, requestId: req.requestId },
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      'Profile edit route error'
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    );
    // I am saving `pageModel` here so the nearby steps can reuse the same value without rebuilding it each time.
    const pageModel = buildErrorPageModel(req, res, 500, 'Unable to load profile edit page');
    // This return sends the completed value or response back to the code that called this function.
    return res.status(500).render('error', pageModel);
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
});

/**
 * GET /dashboard/purchase/confirmation
 */
router.get('/purchase/confirmation', async (req, res, next) => {
  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // I am building or sending the Express response here with the status, data, or page already chosen by this route.
    res.set('Cache-Control', 'no-store');
    // I am building or sending the Express response here with the status, data, or page already chosen by this route.
    res.set('Pragma', 'no-cache');

    // I am saving `sessionId` here so the nearby steps can reuse the same value without rebuilding it each time.
    const sessionId = String(req.query.session_id || '').trim();
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!sessionId) {
      // This return sends the completed value or response back to the code that called this function.
      return res.status(400).render('error', {
        // I am keeping the `page` field in this object so the receiving code can read that value by its expected name.
        page: { title: '400 - Bad Request', nonce: res.locals.nonce },
        // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
        error: { status: 400, message: 'Missing session_id parameter' },
        // I am keeping the `app_info` field in this object so the receiving code can read that value by its expected name.
        app_info: { name: config.branding.appName }
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      });
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // I am saving `user` here so the nearby steps can reuse the same value without rebuilding it each time.
    const user = assertUser(req);
    // I am saving `userId` here so the nearby steps can reuse the same value without rebuilding it each time.
    const userId = user.id;

    // I am saving `vm` here so the nearby steps can reuse the same value without rebuilding it each time.
    const vm = await getReceiptVM({ sessionId, userId });

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (config.features.archiveReceipts) {
      // Archiving is useful history but should not block a paid user from seeing their
      // confirmation. Both synchronous and async archive failures stay best-effort.
      try {
        // I am saving `maybePromise` here so the nearby steps can reuse the same value without rebuilding it each time.
        const maybePromise = archiveReceiptSnapshot && archiveReceiptSnapshot({ userId, receipt: vm });
        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (maybePromise && typeof maybePromise.then === 'function') {
          // I am defining this small callback here so the surrounding API can run it with the value it supplies.
          maybePromise.catch(err => {
            // I am calling this helper here so the current workflow performs this step before it moves on.
            logger.warn(
              // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
              { event: 'receipt.archive.failed', sessionId, error: err.message },
              // I am listing this entry here because the surrounding collection processes each allowed value in order.
              'Receipt archival failed (non-blocking)'
            // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
            );
          // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
          });
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }
      // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
      } catch (err) {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        logger.warn(
          // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
          { event: 'receipt.archive.threw_sync', sessionId, error: err.message },
          // I am listing this entry here because the surrounding collection processes each allowed value in order.
          'Receipt archival threw synchronously (ignored)'
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        );
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // I am saving `pageModel` here so the nearby steps can reuse the same value without rebuilding it each time.
    const pageModel = await buildDashboardPageModel(req, res);
    // I am calling this helper here so the current workflow performs this step before it moves on.
    applyProtectedPageDefaults({
      // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
      req,
      // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
      res,
      // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
      pageModel,
      // I am keeping the `title` field in this object so the receiving code can read that value by its expected name.
      title: `Purchase Confirmation - ${config.branding.appName}`
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am saving `amountMinor` here so the nearby steps can reuse the same value without rebuilding it each time.
    const amountMinor = vm?.amount_total ?? null;
    // I am saving `currency` here so the nearby steps can reuse the same value without rebuilding it each time.
    const currency = (vm?.currency || 'usd').toUpperCase();
    // I am saving `paidAtIso` here so the nearby steps can reuse the same value without rebuilding it each time.
    const paidAtIso = vm?.paid_at_iso || null;
    // I am saving `rawReceiptUrl` here so the nearby steps can reuse the same value without rebuilding it each time.
    const rawReceiptUrl = vm?.official_receipt_url || vm?.stripe_receipt_url || null;

    // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
    pageModel.confirmation = {
      // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
      sessionId,
      // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
      amountMinor,
      // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
      currency,
      // I am keeping the `amountFormatted` field in this object so the receiving code can read that value by its expected name.
      amountFormatted: amountMinor != null ? formatCurrency(amountMinor, currency) : '—',
      // I am keeping the `productLabel` field in this object so the receiving code can read that value by its expected name.
      productLabel: vm?.product_label || vm?.product_key || 'Your purchase',
      // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
      paidAtIso,
      // I am keeping the `paidAtFormatted` field in this object so the receiving code can read that value by its expected name.
      paidAtFormatted: paidAtIso ? formatDateForDisplay(paidAtIso) : '',
      // I am keeping the `officialReceiptUrl` field in this object so the receiving code can read that value by its expected name.
      officialReceiptUrl: sanitizeUrl(rawReceiptUrl),
      // I am keeping the `payBase` field in this object so the receiving code can read that value by its expected name.
      payBase: '/api/pay'
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    };

    // This return sends the completed value or response back to the code that called this function.
    return res.render('purchase-confirmation', pageModel, (err, html) => {
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (err) {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        logger.error(
          // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
          { event: 'purchase.confirmation.view_error', requestId: req.requestId, sessionId, message: err.message, stack: err.stack },
          // I am listing this entry here because the surrounding collection processes each allowed value in order.
          'EJS rendering failed for purchase-confirmation'
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        );
        // This return sends the completed value or response back to the code that called this function.
        return next(err);
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
      // This return sends the completed value or response back to the code that called this function.
      return res.send(html);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (err) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.error(
      // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
      {
        // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
        event: 'purchase.confirmation.error',
        // I am keeping the `requestId` field in this object so the receiving code can read that value by its expected name.
        requestId: req.requestId,
        // I am keeping the `sessionId` field in this object so the receiving code can read that value by its expected name.
        sessionId: String(req.query.session_id || ''),
        // I am keeping the `status` field in this object so the receiving code can read that value by its expected name.
        status: err.status || err.statusCode || 500,
        // I am keeping the `code` field in this object so the receiving code can read that value by its expected name.
        code: err.code,
        // I am keeping the `type` field in this object so the receiving code can read that value by its expected name.
        type: err.type,
        // I am keeping the `message` field in this object so the receiving code can read that value by its expected name.
        message: err.message
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      },
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      'Purchase confirmation route error'
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    );

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if ((err.status || 500) === 404) {
      // This return sends the completed value or response back to the code that called this function.
      return res.status(404).render('error', {
        // I am keeping the `page` field in this object so the receiving code can read that value by its expected name.
        page: { title: '404 - Not Found', nonce: res.locals.nonce },
        // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
        error: { status: 404, message: 'Confirmation not found' },
        // I am keeping the `app_info` field in this object so the receiving code can read that value by its expected name.
        app_info: { name: config.branding.appName }
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      });
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // This return sends the completed value or response back to the code that called this function.
    return next(err);
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
});

/**
 * GET /dashboard/receipt.pdf
 * DEPRECATED
 */
router.get('/receipt.pdf', (req, res) => {
  // I am building or sending the Express response here with the status, data, or page already chosen by this route.
  res.set('Cache-Control', 'no-store');
  // I am building or sending the Express response here with the status, data, or page already chosen by this route.
  res.set('Pragma', 'no-cache');
  // This return sends the completed value or response back to the code that called this function.
  return res.status(410).send('This endpoint is deprecated. Please use the official receipt via the confirmation page.');
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
});

/**
 * GET /dashboard/billing/buy?product=<productKey>&qty=1
 * Legacy redirect route
 */
router.get('/billing/buy', async (req, res) => {
  // I am saving `product` here so the nearby steps can reuse the same value without rebuilding it each time.
  const { product, qty } = req.query;
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!product) return res.redirect('/dashboard/billing');
  // I am saving `q` here so the nearby steps can reuse the same value without rebuilding it each time.
  const q = typeof qty === 'string' ? qty : '1';
  // This return sends the completed value or response back to the code that called this function.
  return res.redirect(302, `/dashboard/checkout/review?product=${encodeURIComponent(product)}&qty=${encodeURIComponent(q)}`);
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
});

/**
 * GET /dashboard/checkout/review?product=<productKey>&qty=1
 */
router.get('/checkout/review', async (req, res, next) => {
  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // I am saving `product` here so the nearby steps can reuse the same value without rebuilding it each time.
    const { product: productKeyRaw, qty } = req.query;

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!productKeyRaw) {
      // This return sends the completed value or response back to the code that called this function.
      return res.status(400).render('error', {
        // I am keeping the `page` field in this object so the receiving code can read that value by its expected name.
        page: { title: '400 - Bad Request', nonce: res.locals.nonce },
        // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
        error: { status: 400, message: 'Missing product parameter' },
        // I am keeping the `app_info` field in this object so the receiving code can read that value by its expected name.
        app_info: { name: config.branding.appName }
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      });
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // I am saving `quantity` here so the nearby steps can reuse the same value without rebuilding it each time.
    const quantity = Math.max(1, parseInt(qty || '1', 10));
    // I am saving `productKey` here so the nearby steps can reuse the same value without rebuilding it each time.
    const productKey = String(productKeyRaw).trim();

    // I am saving `catalog` here so the nearby steps can reuse the same value without rebuilding it each time.
    const catalog = await getPricingCatalog();

    // I am keeping `priceCandidatesForKey` as a named helper so the surrounding workflow can call this step when it needs it.
    function priceCandidatesForKey(key) {
      // Match by stable product key first, while accepting configured live/test IDs so an
      // older purchase link still resolves after the active Stripe mode changes.
      const ids = new Set();
      // I am saving `add` here so the nearby steps can reuse the same value without rebuilding it each time.
      const add = (v) => { const s = String(v || '').trim(); if (s) ids.add(s); };

      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (key === 'resume_one_time') add(config?.stripe?.active?.priceResumeOneTime);
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (key === 'resume_expert')   add(config?.stripe?.active?.priceResumeExpert);

      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (key === 'resume_one_time') {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        add(config?.stripe?.live?.priceResumeOneTime);
        // I am calling this helper here so the current workflow performs this step before it moves on.
        add(config?.stripe?.test?.priceResumeOneTime);
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (key === 'resume_expert') {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        add(config?.stripe?.live?.priceResumeExpert);
        // I am calling this helper here so the current workflow performs this step before it moves on.
        add(config?.stripe?.test?.priceResumeExpert);
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }

      // This return sends the completed value or response back to the code that called this function.
      return ids;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // I am saving `candidateIds` here so the nearby steps can reuse the same value without rebuilding it each time.
    const candidateIds = priceCandidatesForKey(productKey);

    // I am saving `product` here so the nearby steps can reuse the same value without rebuilding it each time.
    const product = catalog.find(p =>
      // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
      p.product_key === productKey || candidateIds.has(p.priceId)
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    );

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!product) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      logger.warn(
        // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
        {
          // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
          event: 'checkout.review.product_not_found',
          // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
          productKey,
          // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
          candidateIds: Array.from(candidateIds),
          // I am mapping the collection here so each input item becomes the output shape expected by the next step.
          catalogPriceIds: catalog.map(p => p.priceId),
          // I am keeping the `requestId` field in this object so the receiving code can read that value by its expected name.
          requestId: req.requestId
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        },
        // I am listing this entry here because the surrounding collection processes each allowed value in order.
        'Review product not found'
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      );

      // This return sends the completed value or response back to the code that called this function.
      return res.status(404).render('error', {
        // I am keeping the `page` field in this object so the receiving code can read that value by its expected name.
        page: { title: '404 - Not Found', nonce: res.locals.nonce },
        // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
        error: { status: 404, message: 'Product not found' },
        // I am keeping the `app_info` field in this object so the receiving code can read that value by its expected name.
        app_info: { name: config.branding.appName }
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      });
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // I am saving `pageModel` here so the nearby steps can reuse the same value without rebuilding it each time.
    const pageModel = await buildDashboardPageModel(req, res);
    // I am calling this helper here so the current workflow performs this step before it moves on.
    applyProtectedPageDefaults({
      // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
      req,
      // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
      res,
      // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
      pageModel,
      // I am keeping the `title` field in this object so the receiving code can read that value by its expected name.
      title: `Review Purchase - ${config.branding.appName}`
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am saving `normalizedProduct` here so the nearby steps can reuse the same value without rebuilding it each time.
    const normalizedProduct = {
      // I am keeping the `key` field in this object so the receiving code can read that value by its expected name.
      key: product.product_key || productKey,
      // I am keeping the `name` field in this object so the receiving code can read that value by its expected name.
      name: product.name,
      // I am keeping the `currency` field in this object so the receiving code can read that value by its expected name.
      currency: product.currency || 'usd',
      // I am keeping the `unit_amount` field in this object so the receiving code can read that value by its expected name.
      unit_amount: product.unit_amount,
      // I am keeping the `interval` field in this object so the receiving code can read that value by its expected name.
      interval: product.interval,
      // I am keeping the `priceId` field in this object so the receiving code can read that value by its expected name.
      priceId: product.priceId
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    };

    // I am saving `subtotal` here so the nearby steps can reuse the same value without rebuilding it each time.
    const subtotal = (normalizedProduct.unit_amount || 0) * quantity;
    // I am saving `total` here so the nearby steps can reuse the same value without rebuilding it each time.
    const total = subtotal;

    // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
    pageModel.product = {
      // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
      ...normalizedProduct,
      // I am keeping the `unitPriceFormatted` field in this object so the receiving code can read that value by its expected name.
      unitPriceFormatted: normalizedProduct.unit_amount != null
        // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
        ? formatPrice(normalizedProduct.unit_amount, normalizedProduct.currency, normalizedProduct.interval)
        // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
        : '—'
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    };

    // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
    pageModel.quantity = quantity;
    // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
    pageModel.subtotal = subtotal;
    // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
    pageModel.total = total;
    // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
    pageModel.totalFormatted = total != null ? formatCurrency(total, normalizedProduct.currency) : '—';
    // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
    pageModel.productKey = normalizedProduct.key;

    // This return sends the completed value or response back to the code that called this function.
    return res.render('checkout-review', pageModel);
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (err) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.error(
      // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
      { event: 'dashboard.checkout_review.error', error: err.message, stack: err.stack, requestId: req.requestId },
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      'Checkout review route error'
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    );
    // This return sends the completed value or response back to the code that called this function.
    return next(err);
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
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
