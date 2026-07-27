// Description: Billing dashboard route with purchase options
// Purpose: Display billing page with purchase options (history intentionally removed)
// Notes: Uses ACTIVE Stripe config (live in prod, test otherwise). Supplies APP_CONFIG for sbClient.js.

'use strict';

const express = require('express');
const router = express.Router();

const { buildDashboardPageModel } = require('../ui_contract/presenters');
const { getPricingCatalog } = require('../services/pricingCatalog');
const { config } = require('../config');
const { formatPrice } = require('../ui_contract/presenters/helpers/viewFormatters');
const { timeAsync } = require('../middleware/requestTiming');

router.get('/', async (req, res) => {
  // If Stripe ever bounces here with ?paid=1, bounce on to confirmation like before
  if (req.query.paid === '1' && req.query.session_id) {
    return res.redirect(
      302,
      `/dashboard/purchase/confirmation?session_id=${encodeURIComponent(req.query.session_id)}`
    );
  }

  // Independent remote work begins together after mount-level authorization.
  const pageModelPromise = buildDashboardPageModel(req, res);
  const pricingPromise = timeAsync(
    req,
    'stripe_catalog',
    () => getPricingCatalog()
  ).catch(() => []);

  const [pageModel, pricing] = await Promise.all([pageModelPromise, pricingPromise]);

  // Title + nonce + CSRF token
  pageModel.page = pageModel.page || {};
  pageModel.page.nonce = res.locals.nonce;
  const effectiveAppName =
    (pageModel.app_info && pageModel.app_info.name) || config.branding.appName;
  pageModel.page.title = `Billing – ${effectiveAppName}`;
  pageModel.ui = pageModel.ui || {};
  pageModel.ui.csrfToken = res.locals.csrfToken || '';

  // Ensure APP_CONFIG is present so <meta id="app-config"> is rendered
  // This is what server/public/js/sbClient.js reads.
  pageModel.APP_CONFIG = {
    SUPABASE_URL: config.supabase.url || '',
    SUPABASE_ANON_KEY: config.supabase.anonKey || ''
  };

  // Pricing pulled from Stripe using the ACTIVE key (service handles that)
  // Pre-compute products for display (moves logic out of EJS template)
  // WHAT: Finds the products that match active Stripe price IDs
  // WHY: Keeps template simple and moves business logic to server-side
  // HOW: Matches pricing catalog items against active price IDs with fallback order
  const activePriceOneTime = (config.stripe.active.priceResumeOneTime || '').trim();
  const activePriceExpert = (config.stripe.active.priceResumeExpert || '').trim();
  const productOneTime = pricing.find((product) => product.priceId === activePriceOneTime);
  const productExpert = pricing.find((product) => product.priceId === activePriceExpert);
  
  // Pre-format prices for template (moves logic out of EJS)
  const formatProduct = (product) => {
    if (!product) return null;
    return {
      ...product,
      priceFormatted: product.unit_amount != null
        ? formatPrice(product.unit_amount, product.currency, product.interval)
        : '—'
    };
  };
  
  // Keep purchase history removed (your request)
  pageModel.billing = {
    pricing,
    products: {
      oneTime: formatProduct(productOneTime),
      expert: formatProduct(productExpert)
    }
  };

  // Hard no-store for safety (avoids caching CSRF/meta)
  res.set('Cache-Control', 'no-store');
  res.render('billing', pageModel);
});

module.exports = router;
