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
const { createCheckoutSession } = require('../services/billingService');
const { createIdempotencyMiddleware } = require('../middleware/idempotency');
const { assertUser } = require('../utils/authz');
const logger = require('../utils/logger');

const idem = createIdempotencyMiddleware({ ttl: 3600, headerName: 'Idempotency-Key' });

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
    const { priceId, quantity } = req.body || {};
    
    if (!priceId) {
      return res.status(400).json({ 
        ok: false, 
        error: 'Missing priceId' 
      });
    }

    const session = await createCheckoutSession({
      user,
      priceId,
      quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
      idempotencyKey: req.headers['idempotency-key'],
      requestId: req.requestId
    });

    logger.info({ 
      event: 'checkout.session.created', 
      userId: user.id, 
      sessionId: session.id 
    });
    
    res.status(201).json({ 
      ok: true, 
      url: session.url 
    });
  } catch (e) {
    logger.error({ 
      event: 'checkout.session.error', 
      error: e.message, 
      requestId: req.requestId 
    });
    
    res.status(e.status || 500).json({ 
      ok: false, 
      error: 'Unable to start checkout' 
    });
  }
});

module.exports = router;
