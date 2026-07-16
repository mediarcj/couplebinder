// File: server/routes/dashboard-billing.js
// Description: Billing dashboard route with purchase options
// Purpose: Display billing page with purchase options (history intentionally removed)
// Notes: Uses ACTIVE Stripe config (live in prod, test otherwise). Supplies APP_CONFIG for sbClient.js.

'use strict';

// I am loading `express` into `express` so this file can reuse that dependency below.
const express = require('express');
// I am saving `router` here so the nearby steps can reuse the same value without rebuilding it each time.
const router = express.Router();

// I am loading `../ui_contract/presenters` into `buildDashboardPageModel` so this file can reuse that dependency below.
const { buildDashboardPageModel } = require('../ui_contract/presenters');
// I am loading `../services/pricingCatalog` into `getPricingCatalog` so this file can reuse that dependency below.
const { getPricingCatalog } = require('../services/pricingCatalog');
// I am loading `../config` into `config` so this file can reuse that dependency below.
const { config } = require('../config');
// I am loading `../ui_contract/presenters/helpers/viewFormatters` into `formatPrice` so this file can reuse that dependency below.
const { formatPrice } = require('../ui_contract/presenters/helpers/viewFormatters');

// This registers the GET `/` route so Express can send matching requests through the handlers listed here.
router.get('/', async (req, res) => {
  // If Stripe ever bounces here with ?paid=1, bounce on to confirmation like before
  if (req.query.paid === '1' && req.query.session_id) {
    // This return sends the completed value or response back to the code that called this function.
    return res.redirect(
      // I am keeping this line here because the surrounding dashboard-billing.js workflow expects this value or operation before it continues.
      302,
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      `/dashboard/purchase/confirmation?session_id=${encodeURIComponent(req.query.session_id)}`
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    );
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // Base page model (nav, app_info, assetVersion, etc.)
  const pageModel = await buildDashboardPageModel(req, res);

  // Title + nonce + CSRF token
  pageModel.page = pageModel.page || {};
  // I am keeping this line here because the surrounding dashboard-billing.js workflow expects this value or operation before it continues.
  pageModel.page.nonce = res.locals.nonce;
  // I am saving `effectiveAppName` here so the nearby steps can reuse the same value without rebuilding it each time.
  const effectiveAppName =
    // I am keeping this line here because the surrounding dashboard-billing.js workflow expects this value or operation before it continues.
    (pageModel.app_info && pageModel.app_info.name) || config.branding.appName;
  // I am keeping this line here because the surrounding dashboard-billing.js workflow expects this value or operation before it continues.
  pageModel.page.title = `Billing – ${effectiveAppName}`;
  // I am keeping this line here because the surrounding dashboard-billing.js workflow expects this value or operation before it continues.
  pageModel.ui = pageModel.ui || {};
  // I am keeping this line here because the surrounding dashboard-billing.js workflow expects this value or operation before it continues.
  pageModel.ui.csrfToken = res.locals.csrfToken || '';

  // Ensure APP_CONFIG is present so <meta id="app-config"> is rendered
  // This is what server/public/js/sbClient.js reads.
  pageModel.APP_CONFIG = {
    // I am keeping the `SUPABASE_URL` field in this object so the receiving code can read that value by its expected name.
    SUPABASE_URL: config.supabase.url || '',
    // I am keeping the `SUPABASE_ANON_KEY` field in this object so the receiving code can read that value by its expected name.
    SUPABASE_ANON_KEY: config.supabase.anonKey || ''
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  };

  // Pricing pulled from Stripe using the ACTIVE key (service handles that)
  let pricing = [];
  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    pricing = await getPricingCatalog(); // should already key off config.stripe.active
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch {
    // Pricing is optional; template will still render CTAs with copy
    pricing = [];
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // Pre-compute products for display (moves logic out of EJS template)
  // WHAT: Finds the products that match active Stripe price IDs
  // WHY: Keeps template simple and moves business logic to server-side
  // HOW: Matches pricing catalog items against active price IDs with fallback order
  const activePriceOneTime = (config.stripe.active.priceResumeOneTime || '').trim();
  // I am saving `activePriceExpert` here so the nearby steps can reuse the same value without rebuilding it each time.
  const activePriceExpert = (config.stripe.active.priceResumeExpert || '').trim();
  
  // Fallback order: LIVE -> TEST -> legacy
  const candidateOneTime = [
    // I am keeping this line here because the surrounding dashboard-billing.js workflow expects this value or operation before it continues.
    config.stripe.live?.priceResumeOneTime,
    // I am keeping this line here because the surrounding dashboard-billing.js workflow expects this value or operation before it continues.
    config.stripe.test?.priceResumeOneTime,
    // I am keeping this line here because the surrounding dashboard-billing.js workflow expects this value or operation before it continues.
    config.stripe.priceResumeOneTime
  // I am filtering the collection here so only items that pass the nearby check continue to the next step.
  ].filter(Boolean);
  
  // I am saving `candidateExpert` here so the nearby steps can reuse the same value without rebuilding it each time.
  const candidateExpert = [
    // I am keeping this line here because the surrounding dashboard-billing.js workflow expects this value or operation before it continues.
    config.stripe.live?.priceResumeExpert,
    // I am keeping this line here because the surrounding dashboard-billing.js workflow expects this value or operation before it continues.
    config.stripe.test?.priceResumeExpert,
    // I am keeping this line here because the surrounding dashboard-billing.js workflow expects this value or operation before it continues.
    config.stripe.priceResumeExpert
  // I am filtering the collection here so only items that pass the nearby check continue to the next step.
  ].filter(Boolean);
  
  // I am saving `productOneTime` here so the nearby steps can reuse the same value without rebuilding it each time.
  const productOneTime = pricing.find(p => candidateOneTime.includes(p.priceId));
  // I am saving `productExpert` here so the nearby steps can reuse the same value without rebuilding it each time.
  const productExpert = pricing.find(p => candidateExpert.includes(p.priceId));
  
  // Pre-format prices for template (moves logic out of EJS)
  const formatProduct = (product) => {
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!product) return null;
    // This return sends the completed value or response back to the code that called this function.
    return {
      // I am keeping this line here because the surrounding dashboard-billing.js workflow expects this value or operation before it continues.
      ...product,
      // I am keeping the `priceFormatted` field in this object so the receiving code can read that value by its expected name.
      priceFormatted: product.unit_amount != null
        // I am keeping this line here because the surrounding dashboard-billing.js workflow expects this value or operation before it continues.
        ? formatPrice(product.unit_amount, product.currency, product.interval)
        // I am keeping this line here because the surrounding dashboard-billing.js workflow expects this value or operation before it continues.
        : '—'
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    };
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  };
  
  // Keep purchase history removed (your request)
  pageModel.billing = {
    // I am keeping this line here because the surrounding dashboard-billing.js workflow expects this value or operation before it continues.
    pricing,
    // I am keeping the `products` field in this object so the receiving code can read that value by its expected name.
    products: {
      // I am keeping the `oneTime` field in this object so the receiving code can read that value by its expected name.
      oneTime: formatProduct(productOneTime),
      // I am keeping the `expert` field in this object so the receiving code can read that value by its expected name.
      expert: formatProduct(productExpert)
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  };

  // Hard no-store for safety (avoids caching CSRF/meta)
  res.set('Cache-Control', 'no-store');
  // I am building or sending the Express response here with the status, data, or page already chosen by this route.
  res.render('billing', pageModel);
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
});

// I am exporting this value here so another module can deliberately reuse the completed piece from dashboard-billing.js.
module.exports = router;