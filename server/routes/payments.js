// File: server/routes/payments.js
// Description: Protected payments API with idempotency protection
// Purpose: Handle checkout session creation and payment processing
// Notes: Follows Building Laws: backend enforces rules, small deployable changes

/**
 * WHAT:
 * Protected API routes for payment processing with idempotency protection.
 * 
 * WHY:
 * Need secure payment endpoints that prevent duplicate charges.
 * Idempotency keys ensure same request can't be processed twice.
 * 
 * HOW:
 * 1. Validate user authentication
 * 2. Check idempotency to prevent duplicate requests
 * 3. Create Stripe checkout session
 * 4. Return session URL for redirect
 */

const express = require('express');
const router = express.Router();
const Stripe = require('stripe');
const { createCheckoutSession } = require('../services/billingService');
const { getReceiptVM } = require('../services/receiptService');
const { createIdempotencyMiddleware } = require('../middleware/idempotency');
const { assertUser } = require('../utils/authz');
const logger = require('../utils/logger');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2025-09-30.clover'
});

const idem = createIdempotencyMiddleware({ ttl: 3600, headerName: 'Idempotency-Key' });

// Server-side SKU to price ID mapping (never trust client-supplied price IDs)
const PRICES = {
  resume_one_time: process.env.STRIPE_PRICE_RESUME_ONE_TIME?.trim(),
  resume_expert: process.env.STRIPE_PRICE_RESUME_EXPERT?.trim()
};

/**
 * WHAT:
 * Create checkout session for payment processing.
 * 
 * WHY:
 * Users need secure way to initiate payments for products.
 * Idempotency prevents duplicate charges from retries.
 * 
 * HOW:
 * 1. Validate user authentication
 * 2. Check idempotency key to prevent duplicates
 * 3. Validate price ID and quantity
 * 4. Create Stripe checkout session
 * 5. Return session URL for redirect
 */
router.post('/checkout', idem, async (req, res) => {
  try {
    const user = assertUser(req);
    // Accept SKU or productKey from client for compatibility
    const { sku, productKey, quantity } = req.body || {};
    const skuOrKey = (sku || productKey || 'resume_one_time').trim();
    
    const priceId = PRICES[skuOrKey];
    const mode = skuOrKey === 'resume_expert' ? 'subscription' : 'payment'; // flip mode by product
    if (!priceId) {
      logger.warn({
        event: 'checkout.sku.invalid',
        skuOrKey,
        allowed: Object.keys(PRICES),
        userId: user.id
      }, 'Invalid SKU/productKey provided');
      return res.status(400).json({ 
        ok: false, 
        error: 'Unknown product SKU' 
      });
    }

    const session = await createCheckoutSession({
      user,
      priceId,
      quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
      idempotencyKey: req.headers['idempotency-key'],
      requestId: req.requestId,
      mode // subscription for resume_expert, payment otherwise
    });

    const isLive = process.env.STRIPE_SECRET_KEY?.startsWith('sk_live_');
    logger.info({ 
      event: 'checkout.created',
      sessionId: session.id,
      mode: isLive ? 'live' : 'test',
      userId: user.id
    });
    
    res.set('Cache-Control', 'no-store');
    return res.status(201).json({ 
      ok: true, 
      url: session.url 
    });
  } catch (e) {
    logger.error({ 
      event: 'checkout.session.error', 
      error: e.message, 
      requestId: req.requestId 
    });
    
    return res.status(e.status || 500).json({ 
      ok: false, 
      error: 'Unable to start checkout' 
    });
  }
});

/**
 * WHAT:
 * Fetch receipt URL from Stripe for a checkout session.
 * 
 * WHY:
 * Users need access to payment receipts after successful checkout.
 * Provides Stripe's hosted receipt with full payment details.
 * 
 * HOW:
 * 1. Validate session_id parameter
 * 2. Retrieve session from Stripe with payment details
 * 3. Verify session ownership matches current user
 * 4. Extract receipt URL from charge data
 * 5. Return receipt URL for user access
 */
router.get('/receipt', async (req, res) => {
  try {
    const sessionId = String(req.query.session_id || '').trim();
    
    if (!sessionId) {
      return res.status(400).json({ ok: false, error: 'missing_session_id' });
    }

    const user = assertUser(req);

    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['payment_intent.latest_charge', 'payment_intent.charges']
    });

    // Verify ownership using metadata or client_reference_id
    const ownerId = session?.metadata?.user_id || session?.client_reference_id || null;
    
    if (!ownerId || ownerId !== user.id) {
      logger.warn({ 
        event: 'receipt.ownership_mismatch', 
        sessionId, 
        userId: user.id, 
        ownerId 
      }, 'Receipt fetch denied');
      
      // Return 404 to avoid information leak
      return res.status(404).json({ ok: false, error: 'not_found' });
    }

    // Prefer latest_charge.receipt_url, fallback to charges.data[0].receipt_url
    const pi = session?.payment_intent;
    const latestCharge = (pi && typeof pi.latest_charge !== 'string') ? pi.latest_charge : null;
    const firstCharge = pi?.charges?.data?.[0] || null;
    const receiptUrl = latestCharge?.receipt_url || firstCharge?.receipt_url || null;

    if (!receiptUrl) {
      // No receipt URL yet (rare timing issue)
      return res.status(204).end();
    }

    logger.info({ 
      event: 'receipt.fetched', 
      sessionId, 
      userId: user.id 
    }, 'Receipt URL returned');
    
    return res.json({ ok: true, receipt_url: receiptUrl });
  } catch (err) {
    logger.error({ 
      event: 'receipt.error', 
      error: err.message,
      requestId: req.requestId 
    }, 'Failed to fetch receipt');
    
    return res.status(500).json({ ok: false, error: 'internal_error' });
  }
});

/**
 * WHAT:
 * API endpoint that returns normalized receipt view-model.
 * 
 * WHY:
 * Allows client-side access to receipt data for display or further processing.
 * 
 * HOW:
 * 1. Extract session_id from query
 * 2. Get current user ID from auth
 * 3. Fetch and normalize receipt data
 * 4. Return receipt view-model
 */
router.get('/receipt/view', async (req, res, next) => {
  try {
    const sessionId = req.query.session_id;
    if (!sessionId) {
      return res.status(400).json({ error: 'session_id required' });
    }
    
    const user = assertUser(req);
    const userId = user.id;

    const vm = await getReceiptVM({ sessionId, userId });
    return res.json({ ok: true, receipt: vm });
  } catch (err) {
    const status = err.status || 500;
    if (status === 404) {
      return res.status(404).json({ error: 'Not found' });
    }
    next(err);
  }
});

module.exports = router;
