// File: server/routes/dashboard-billing.js
// Description: Billing dashboard route with purchase history
// Purpose: Display billing page with purchase options and history
// Notes: Follows Building Laws: backend is source of truth, UI instructions from server

/**
 * WHAT:
 * Billing dashboard route that displays purchase options and history.
 * 
 * WHY:
 * Users need interface to purchase products and view payment history.
 * Backend provides UI instructions and purchase data.
 * 
 * HOW:
 * 1. Build dashboard page model with user context
 * 2. Fetch user's purchase history from database
 * 3. Render billing page with purchase options
 * 4. Include CSP-safe nonce for client scripts
 */

const express = require('express');
const router = express.Router();
const { buildDashboardPageModel } = require('../ui_contract/presenters');
const { supabaseAdmin } = require('../utils/supabaseClient');
const { getPricingCatalog } = require('../services/pricingCatalog');

/**
 * WHAT:
 * Display billing dashboard with purchase options and history.
 * 
 * WHY:
 * Users need centralized billing interface for payments and history.
 * 
 * HOW:
 * 1. Build page model with user context
 * 2. Fetch purchase history from database
 * 3. Render billing page with purchase buttons
 * 4. Include nonce for CSP-safe client scripts
 */
router.get('/', async (req, res) => {
  const pageModel = await buildDashboardPageModel(req, res);
  pageModel.page.nonce = res.locals.nonce;

  // Fetch pricing catalog from Stripe
  let pricing = [];
  try {
    pricing = await getPricingCatalog();
  } catch (err) {
    // Silently fail - pricing is optional, fallback to defaults in template
  }

  // Optional: basic purchase history for the user
  let purchases = [];
  try {
    const { data, error } = await supabaseAdmin
      .from('payments')
      .select('created_at, product_key, amount, currency, status')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .limit(20);
    
    if (!error) purchases = data || [];
  } catch (err) {
    // Silently fail - purchases are optional
  }
  
  pageModel.billing = { purchases, pricing };
  
  // Pass environment variables for price ID lookups in template
  pageModel.env = {
    STRIPE_PRICE_RESUME_ONE_TIME: process.env.STRIPE_PRICE_RESUME_ONE_TIME,
    STRIPE_PRICE_RESUME_EXPERT: process.env.STRIPE_PRICE_RESUME_EXPERT
  };

  res.render('billing', pageModel);
});

module.exports = router;
