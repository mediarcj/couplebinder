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
  
  pageModel.billing = { purchases };

  res.render('billing', pageModel);
});

module.exports = router;
