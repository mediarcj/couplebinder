// File: server/routes/payments.js
// Description: Protected payments API with idempotency protection + receipt fetch + UX telemetry
// Purpose: Handle checkout session creation, receipt retrieval, status fetch, and a lightweight "receipt opened" event
// Notes: Backend is the source of truth; billingService validates price + mode; idempotent fallback persistence when session is paid

'use strict';

/**
 * WHAT:
 * Protected API routes for payment processing with idempotency protection.
 *
 * WHY:
 * - Create Stripe Checkout sessions from server-validated inputs.
 * - Fetch the hosted receipt URL after payment.
 * - Provide a status endpoint for the success page.
 * - Persist payment row if session is paid (fallback to webhook).
 *
 * HOW:
 * 1) POST /api/pay/checkout            -> create session (idempotent)
 * 2) GET  /api/pay/receipt?session_id  -> return Stripe-hosted receipt URL (+ persist if paid)
 * 3) GET  /api/pay/receipt/view        -> normalized receipt VM (uses receiptService)
 * 4) GET  /api/pay/session?session_id  -> session status (+ persist if paid)
 * 5) POST /api/pay/receipt/opened      -> UX telemetry (no PII)
 */

const express = require('express');
const router = express.Router();
const Stripe = require('stripe');

const {
  createCheckoutSession,
  upsertPaymentFromSession // <- fallback persistence
} = require('../services/billingService');

const { getReceiptVM } = require('../services/receiptService');

const { createIdempotencyMiddleware } = require('../middleware/idempotency');
const { assertUser } = require('../utils/authz');
const logger = require('../utils/logger');
const { config } = require('../config');

const stripe = new Stripe(config.stripe.active.secretKey, {
  apiVersion: config.stripe.apiVersion
});

const idem = createIdempotencyMiddleware({ ttl: 3600, headerName: 'Idempotency-Key' });

// Server-side SKU → price ID mapping (never trust client-supplied price IDs)
const PRICES = Object.freeze({
  resume_one_time: (config.stripe.active.priceResumeOneTime || '').trim(),
  resume_expert:   (config.stripe.active.priceResumeExpert || '').trim()
});

// Small helper: safe positive integer quantity
function toPositiveInt(v, def = 1) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : def;
}

// Owner check (metadata.user_id or client_reference_id must match caller)
function ownerIdOf(session) {
  return session?.metadata?.user_id || session?.client_reference_id || null;
}

// Attempt to persist a paid session (idempotent upsert). Logs outcomes.
async function persistIfPaid(session, requestId) {
  try {
    if (session?.payment_status === 'paid') {
      await upsertPaymentFromSession(session, 'paid'); // idempotent in service layer
      logger.info({
        event: 'payment.persisted.success',
        requestId,
        sessionId: session.id,
        userId: session?.metadata?.user_id || session?.client_reference_id || null,
        amount: session?.amount_total ?? null,
        currency: session?.currency ?? null,
        productKey: session?.metadata?.product_key || null
      }, 'Payment persisted (fallback path)');
      return true;
    }
    logger.debug({
      event: 'payment.persisted.skip',
      requestId,
      sessionId: session?.id,
      status: session?.status,
      payment_status: session?.payment_status
    }, 'Session not paid yet; skipping persist');
    return false;
  } catch (err) {
    logger.error({
      event: 'payment.persisted.error',
      requestId,
      sessionId: session?.id
      // Removed: error: err.message (security: could leak internal details)
    }, 'Failed to persist payment (fallback path)');
    return false;
  }
}

/**
 * POST /api/pay/checkout
 * Create a Stripe Checkout session.
 */
router.post('/checkout', idem, async (req, res) => {
  try {
    const user = assertUser(req);

    const { sku, productKey, quantity } = req.body || {};
    const skuOrKey = String(sku || productKey || 'resume_one_time').trim();

    // Validate SKU and resolve price
    const priceId = PRICES[skuOrKey];
    if (!priceId) {
      logger.stripe?.('checkout.sku.invalid', {
        sku_or_key: skuOrKey,
        allowed: Object.keys(PRICES),
        userId: user.id
      });
      return res.status(400).json({ ok: false, error: 'unknown_sku' });
    }

    const qty = toPositiveInt(quantity, 1);

    // Let billingService determine effective mode and validate the priceId.
    const session = await createCheckoutSession({
      user,
      priceId,
      quantity: qty,
      idempotencyKey: req.headers['idempotency-key'],
      requestId: req.requestId
    });

    const isLive = config.stripe.mode === 'live';
    logger.stripe?.('checkout.created', {
      session_id: session.id,
      mode: isLive ? 'live' : 'test',
      userId: user.id,
      sku: skuOrKey,
      price_id: priceId,
      quantity: qty
    });

    res.set('Cache-Control', 'no-store');
    return res.status(201).json({ ok: true, url: session.url });
  } catch (e) {
    logger.stripe?.('checkout.session.error', {
      error: e.message,
      requestId: req.requestId
    });
    return res.status(e.status || 500).json({ ok: false, error: 'unable_to_start_checkout' });
  }
});

/**
 * GET /api/pay/receipt?session_id=cs_...
 * Return the Stripe-hosted receipt URL for a completed session.
 * Also persists payment row if session is paid (fallback to webhook).
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

    // Ownership check
    const ownerId = ownerIdOf(session);
    if (!ownerId || ownerId !== user.id) {
      logger.stripe?.('receipt.ownership_mismatch', {
        session_id: sessionId,
        userId: user.id,
        ownerId
      });
      return res.status(404).json({ ok: false, error: 'not_found' });
    }

    // Fallback persistence if paid
    await persistIfPaid(session, req.requestId);

    // Prefer latest_charge.receipt_url; fallback to first charge
    const pi = session?.payment_intent;
    const latestCharge = pi && typeof pi.latest_charge !== 'string' ? pi.latest_charge : null;
    const firstCharge = pi?.charges?.data?.[0] || null;

    const sanitize = (s) => {
      if (!s) return null;
      const t = String(s).trim().replace(/^["']+|["']+$/g, '');
      return /^https?:\/\//i.test(t) ? t : null;
    };

    const receiptUrl = sanitize(latestCharge?.receipt_url || firstCharge?.receipt_url || null);
    if (!receiptUrl) {
      // Timing gap: receipt not generated yet
      return res.status(204).end();
    }

    logger.stripe?.('receipt.fetched', {
      session_id: sessionId,
      userId: user.id,
      receipt_url: receiptUrl
    });

    res.set('Cache-Control', 'no-store');
    res.set('Pragma', 'no-cache');
    return res.json({ ok: true, receipt_url: receiptUrl });
  } catch (err) {
    logger.stripe?.('receipt.error', { error: err.message, requestId: req.requestId });
    return res.status(500).json({ ok: false, error: 'internal_error' });
  }
});

/**
 * GET /api/pay/receipt/view?session_id=cs_...
 * Return a normalized receipt view model for UI render.
 */
router.get('/receipt/view', async (req, res, next) => {
  try {
    const sessionId = String(req.query.session_id || '').trim();
    if (!sessionId) {
      return res.status(400).json({ ok: false, error: 'session_id_required' });
    }

    const user = assertUser(req);
    const vm = await getReceiptVM({ sessionId, userId: user.id });
    return res.json({ ok: true, receipt: vm });
  } catch (err) {
    const status = err.status || 500;
    if (status === 404) {
      return res.status(404).json({ ok: false, error: 'not_found' });
    }
    next(err);
  }
});

/**
 * GET /api/pay/session?session_id=cs_...
 * Fetch canonical session status and amounts (for success page hydration).
 * Also persists payment row if session is paid (fallback to webhook).
 *
 * Response:
 * { ok: true, session: { id, status, payment_status, amount_total, currency, product_key, price_id } }
 */
router.get('/session', async (req, res) => {
  try {
    const sessionId = String(req.query.session_id || '').trim();
    if (!sessionId) {
      return res.status(400).json({ ok: false, error: 'missing_session_id' });
    }

    const user = assertUser(req);

    // Expand minimal fields we need; price_id lives in metadata (we set it on checkout)
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['payment_intent'] // amounts/currency/status are on the session itself
    });

    // Ownership check
    const ownerId = ownerIdOf(session);
    if (!ownerId || ownerId !== user.id) {
      logger.warn({
        event: 'session.ownership_mismatch',
        requestId: req.requestId,
        sessionId,
        userId: user.id,
        ownerId
      }, 'User attempted to access session they do not own');
      return res.status(404).json({ ok: false, error: 'not_found' });
    }

    // Fallback persistence if paid
    await persistIfPaid(session, req.requestId);

    const payload = {
      id: session.id,
      status: session.status,                 // e.g., 'complete'
      payment_status: session.payment_status, // e.g., 'paid'
      amount_total: session.amount_total ?? null,
      currency: session.currency ?? null,
      product_key: session?.metadata?.product_key || null,
      price_id: session?.metadata?.price_id || null
    };

    res.set('Cache-Control', 'no-store');
    return res.json({ ok: true, session: payload });
  } catch (err) {
    logger.error({
      event: 'session.fetch.error',
      requestId: req.requestId
      // Removed: error: err.message (security: could leak internal details)
    });
    return res.status(500).json({ ok: false, error: 'internal_error' });
  }
});

/**
 * POST /api/pay/receipt/opened
 * Lightweight UX telemetry: record that the user clicked "View official receipt".
 */
router.post('/receipt/opened', async (req, res) => {
  try {
    const user = assertUser(req);
    const sessionId = String(req.body?.session_id || '').trim();
    const receiptUrl = String(req.body?.receipt_url || '').trim();

    if (!sessionId) {
      return res.status(400).json({ ok: false, error: 'missing_session_id' });
    }

    logger.stripe?.('receipt.opened', {
      session_id: sessionId,
      userId: user.id,
      receipt_url: /^https?:\/\//i.test(receiptUrl) ? receiptUrl : undefined
    });

    return res.status(204).end();
  } catch (err) {
    logger.warn({ 
      event: 'receipt.opened.error', 
      requestId: req.requestId
      // Removed: error: err.message (security: could leak internal details)
    });
    return res.status(500).json({ ok: false, error: 'internal_error' });
  }
});

module.exports = router;