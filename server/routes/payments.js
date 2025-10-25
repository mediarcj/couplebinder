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
const { createIdempotencyMiddleware } = require('../middleware/idempotency');
const { assertUser } = require('../utils/authz');
const logger = require('../utils/logger');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2025-09-30.clover'
});

const idem = createIdempotencyMiddleware({ ttl: 3600, headerName: 'Idempotency-Key' });

// Server-side SKU to price ID mapping (never trust client-supplied price IDs)
const PRICES = {
  resume_pro: process.env.STRIPE_PRICE_RESUME_ONE_TIME?.trim(),
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
    // Accept SKU from client, map to server-side price ID (never trust client price IDs)
    const { sku = 'resume_pro', quantity } = req.body || {};
    
    const priceId = PRICES[sku];
    if (!priceId) {
      logger.warn({
        event: 'checkout.sku.invalid',
        sku,
        allowed: Object.keys(PRICES),
        userId: user.id
      }, 'Invalid SKU provided');
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
      requestId: req.requestId
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
      expand: ['payment_intent.charges']
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

    const charge = session?.payment_intent?.charges?.data?.[0] || null;
    const receiptUrl = charge?.receipt_url || null;

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

module.exports = router;
