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
// I am saving `router` here so the nearby steps can reuse the same value without rebuilding it each time.
const router = express.Router();
// I am loading `stripe` into `Stripe` so this file can reuse that dependency below.
const Stripe = require('stripe');

// I am saving this value here so the nearby steps can reuse the same value without rebuilding it each time.
const {
  // I am keeping this line here because the surrounding payments.js workflow expects this value or operation before it continues.
  createCheckoutSession,
  upsertPaymentFromSession // <- fallback persistence
// I am keeping this line here because the surrounding payments.js workflow expects this value or operation before it continues.
} = require('../services/billingService');

// I am loading `../services/receiptService` into `getReceiptVM` so this file can reuse that dependency below.
const { getReceiptVM } = require('../services/receiptService');

// I am loading `../middleware/idempotency` into `createIdempotencyMiddleware` so this file can reuse that dependency below.
const { createIdempotencyMiddleware } = require('../middleware/idempotency');
// I am loading `../utils/authz` into `assertUser` so this file can reuse that dependency below.
const { assertUser } = require('../utils/authz');
// I am loading `../utils/logger` into `logger` so this file can reuse that dependency below.
const logger = require('../utils/logger');
// I am loading `../config` into `config` so this file can reuse that dependency below.
const { config } = require('../config');

// I am saving `stripe` here so the nearby steps can reuse the same value without rebuilding it each time.
const stripe = new Stripe(config.stripe.active.secretKey, {
  // I am keeping the `apiVersion` field in this object so the receiving code can read that value by its expected name.
  apiVersion: config.stripe.apiVersion
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
});

// I am saving `idem` here so the nearby steps can reuse the same value without rebuilding it each time.
const idem = createIdempotencyMiddleware({ ttl: 3600, headerName: 'Idempotency-Key' });

// Server-side SKU → price ID mapping (never trust client-supplied price IDs)
const PRICES = Object.freeze({
  // I am keeping the `resume_one_time` field in this object so the receiving code can read that value by its expected name.
  resume_one_time: (config.stripe.active.priceResumeOneTime || '').trim(),
  // I am keeping the `resume_expert` field in this object so the receiving code can read that value by its expected name.
  resume_expert:   (config.stripe.active.priceResumeExpert || '').trim()
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
});

// Small helper: safe positive integer quantity
function toPositiveInt(v, def = 1) {
  // I am saving `n` here so the nearby steps can reuse the same value without rebuilding it each time.
  const n = Number(v);
  // This return sends the completed value or response back to the code that called this function.
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : def;
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// Owner check (metadata.user_id or client_reference_id must match caller)
function ownerIdOf(session) {
  // This return sends the completed value or response back to the code that called this function.
  return session?.metadata?.user_id || session?.client_reference_id || null;
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// Attempt to persist a paid session (idempotent upsert). Logs outcomes.
async function persistIfPaid(session, requestId) {
  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (session?.payment_status === 'paid') {
      await upsertPaymentFromSession(session, 'paid'); // idempotent in service layer
      // I am calling this helper here so the current workflow performs this step before it moves on.
      logger.info({
        // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
        event: 'payment.persisted.success',
        // I am keeping this line here because the surrounding payments.js workflow expects this value or operation before it continues.
        requestId,
        // I am keeping the `sessionId` field in this object so the receiving code can read that value by its expected name.
        sessionId: session.id,
        // I am keeping the `userId` field in this object so the receiving code can read that value by its expected name.
        userId: session?.metadata?.user_id || session?.client_reference_id || null,
        // I am keeping the `amount` field in this object so the receiving code can read that value by its expected name.
        amount: session?.amount_total ?? null,
        // I am keeping the `currency` field in this object so the receiving code can read that value by its expected name.
        currency: session?.currency ?? null,
        // I am keeping the `productKey` field in this object so the receiving code can read that value by its expected name.
        productKey: session?.metadata?.product_key || null
      // I am keeping this line here because the surrounding payments.js workflow expects this value or operation before it continues.
      }, 'Payment persisted (fallback path)');
      // This return sends the completed value or response back to the code that called this function.
      return true;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.debug({
      // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
      event: 'payment.persisted.skip',
      // I am keeping this line here because the surrounding payments.js workflow expects this value or operation before it continues.
      requestId,
      // I am keeping the `sessionId` field in this object so the receiving code can read that value by its expected name.
      sessionId: session?.id,
      // I am keeping the `status` field in this object so the receiving code can read that value by its expected name.
      status: session?.status,
      // I am keeping the `payment_status` field in this object so the receiving code can read that value by its expected name.
      payment_status: session?.payment_status
    // I am keeping this line here because the surrounding payments.js workflow expects this value or operation before it continues.
    }, 'Session not paid yet; skipping persist');
    // This return sends the completed value or response back to the code that called this function.
    return false;
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (err) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.error({
      // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
      event: 'payment.persisted.error',
      // I am keeping this line here because the surrounding payments.js workflow expects this value or operation before it continues.
      requestId,
      // I am keeping the `sessionId` field in this object so the receiving code can read that value by its expected name.
      sessionId: session?.id
      // Removed: error: err.message (security: could leak internal details)
    }, 'Failed to persist payment (fallback path)');
    // This return sends the completed value or response back to the code that called this function.
    return false;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * POST /api/pay/checkout
 * Create a Stripe Checkout session.
 */
router.post('/checkout', idem, async (req, res) => {
  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // I am saving `user` here so the nearby steps can reuse the same value without rebuilding it each time.
    const user = assertUser(req);

    // I am saving `sku` here so the nearby steps can reuse the same value without rebuilding it each time.
    const { sku, productKey, quantity } = req.body || {};
    // I am saving `skuOrKey` here so the nearby steps can reuse the same value without rebuilding it each time.
    const skuOrKey = String(sku || productKey || 'resume_one_time').trim();

    // Validate SKU and resolve price
    const priceId = PRICES[skuOrKey];
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!priceId) {
      // I am keeping this line here because the surrounding payments.js workflow expects this value or operation before it continues.
      logger.stripe?.('checkout.sku.invalid', {
        // I am keeping the `sku_or_key` field in this object so the receiving code can read that value by its expected name.
        sku_or_key: skuOrKey,
        // I am keeping the `allowed` field in this object so the receiving code can read that value by its expected name.
        allowed: Object.keys(PRICES),
        // I am keeping the `userId` field in this object so the receiving code can read that value by its expected name.
        userId: user.id
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      });
      // This return sends the completed value or response back to the code that called this function.
      return res.status(400).json({ ok: false, error: 'unknown_sku' });
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // I am saving `qty` here so the nearby steps can reuse the same value without rebuilding it each time.
    const qty = toPositiveInt(quantity, 1);

    // Let billingService determine effective mode and validate the priceId.
    const session = await createCheckoutSession({
      // I am keeping this line here because the surrounding payments.js workflow expects this value or operation before it continues.
      user,
      // I am keeping this line here because the surrounding payments.js workflow expects this value or operation before it continues.
      priceId,
      // I am keeping the `quantity` field in this object so the receiving code can read that value by its expected name.
      quantity: qty,
      // I am keeping the `idempotencyKey` field in this object so the receiving code can read that value by its expected name.
      idempotencyKey: req.headers['idempotency-key'],
      // I am keeping the `requestId` field in this object so the receiving code can read that value by its expected name.
      requestId: req.requestId
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am saving `isLive` here so the nearby steps can reuse the same value without rebuilding it each time.
    const isLive = config.stripe.mode === 'live';
    // I am keeping this line here because the surrounding payments.js workflow expects this value or operation before it continues.
    logger.stripe?.('checkout.created', {
      // I am keeping the `session_id` field in this object so the receiving code can read that value by its expected name.
      session_id: session.id,
      // I am keeping the `mode` field in this object so the receiving code can read that value by its expected name.
      mode: isLive ? 'live' : 'test',
      // I am keeping the `userId` field in this object so the receiving code can read that value by its expected name.
      userId: user.id,
      // I am keeping the `sku` field in this object so the receiving code can read that value by its expected name.
      sku: skuOrKey,
      // I am keeping the `price_id` field in this object so the receiving code can read that value by its expected name.
      price_id: priceId,
      // I am keeping the `quantity` field in this object so the receiving code can read that value by its expected name.
      quantity: qty
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am building or sending the Express response here with the status, data, or page already chosen by this route.
    res.set('Cache-Control', 'no-store');
    // This return sends the completed value or response back to the code that called this function.
    return res.status(201).json({ ok: true, url: session.url });
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (e) {
    // I am keeping this line here because the surrounding payments.js workflow expects this value or operation before it continues.
    logger.stripe?.('checkout.session.error', {
      // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
      error: e.message,
      // I am keeping the `requestId` field in this object so the receiving code can read that value by its expected name.
      requestId: req.requestId
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
    // This return sends the completed value or response back to the code that called this function.
    return res.status(e.status || 500).json({ ok: false, error: 'unable_to_start_checkout' });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
});

/**
 * GET /api/pay/receipt?session_id=cs_...
 * Return the Stripe-hosted receipt URL for a completed session.
 * Also persists payment row if session is paid (fallback to webhook).
 */
router.get('/receipt', async (req, res) => {
  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // I am saving `sessionId` here so the nearby steps can reuse the same value without rebuilding it each time.
    const sessionId = String(req.query.session_id || '').trim();
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!sessionId) {
      // This return sends the completed value or response back to the code that called this function.
      return res.status(400).json({ ok: false, error: 'missing_session_id' });
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // I am saving `user` here so the nearby steps can reuse the same value without rebuilding it each time.
    const user = assertUser(req);

    // I am saving `session` here so the nearby steps can reuse the same value without rebuilding it each time.
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      // I am keeping the `expand` field in this object so the receiving code can read that value by its expected name.
      expand: ['payment_intent.latest_charge', 'payment_intent.charges']
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // Ownership check
    const ownerId = ownerIdOf(session);
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!ownerId || ownerId !== user.id) {
      // I am keeping this line here because the surrounding payments.js workflow expects this value or operation before it continues.
      logger.stripe?.('receipt.ownership_mismatch', {
        // I am keeping the `session_id` field in this object so the receiving code can read that value by its expected name.
        session_id: sessionId,
        // I am keeping the `userId` field in this object so the receiving code can read that value by its expected name.
        userId: user.id,
        // I am keeping this line here because the surrounding payments.js workflow expects this value or operation before it continues.
        ownerId
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      });
      // This return sends the completed value or response back to the code that called this function.
      return res.status(404).json({ ok: false, error: 'not_found' });
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // Fallback persistence if paid
    await persistIfPaid(session, req.requestId);

    // Prefer latest_charge.receipt_url; fallback to first charge
    const pi = session?.payment_intent;
    // I am saving `latestCharge` here so the nearby steps can reuse the same value without rebuilding it each time.
    const latestCharge = pi && typeof pi.latest_charge !== 'string' ? pi.latest_charge : null;
    // I am saving `firstCharge` here so the nearby steps can reuse the same value without rebuilding it each time.
    const firstCharge = pi?.charges?.data?.[0] || null;

    // I am saving `sanitize` here so the nearby steps can reuse the same value without rebuilding it each time.
    const sanitize = (s) => {
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (!s) return null;
      // I am saving `t` here so the nearby steps can reuse the same value without rebuilding it each time.
      const t = String(s).trim().replace(/^["']+|["']+$/g, '');
      // This return sends the completed value or response back to the code that called this function.
      return /^https?:\/\//i.test(t) ? t : null;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    };

    // I am saving `receiptUrl` here so the nearby steps can reuse the same value without rebuilding it each time.
    const receiptUrl = sanitize(latestCharge?.receipt_url || firstCharge?.receipt_url || null);
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!receiptUrl) {
      // Timing gap: receipt not generated yet
      return res.status(204).end();
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // I am keeping this line here because the surrounding payments.js workflow expects this value or operation before it continues.
    logger.stripe?.('receipt.fetched', {
      // I am keeping the `session_id` field in this object so the receiving code can read that value by its expected name.
      session_id: sessionId,
      // I am keeping the `userId` field in this object so the receiving code can read that value by its expected name.
      userId: user.id,
      // I am keeping the `receipt_url` field in this object so the receiving code can read that value by its expected name.
      receipt_url: receiptUrl
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am building or sending the Express response here with the status, data, or page already chosen by this route.
    res.set('Cache-Control', 'no-store');
    // I am building or sending the Express response here with the status, data, or page already chosen by this route.
    res.set('Pragma', 'no-cache');
    // This return sends the completed value or response back to the code that called this function.
    return res.json({ ok: true, receipt_url: receiptUrl });
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (err) {
    // I am keeping this line here because the surrounding payments.js workflow expects this value or operation before it continues.
    logger.stripe?.('receipt.error', { error: err.message, requestId: req.requestId });
    // This return sends the completed value or response back to the code that called this function.
    return res.status(500).json({ ok: false, error: 'internal_error' });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
});

/**
 * GET /api/pay/receipt/view?session_id=cs_...
 * Return a normalized receipt view model for UI render.
 */
router.get('/receipt/view', async (req, res, next) => {
  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // I am saving `sessionId` here so the nearby steps can reuse the same value without rebuilding it each time.
    const sessionId = String(req.query.session_id || '').trim();
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!sessionId) {
      // This return sends the completed value or response back to the code that called this function.
      return res.status(400).json({ ok: false, error: 'session_id_required' });
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // I am saving `user` here so the nearby steps can reuse the same value without rebuilding it each time.
    const user = assertUser(req);
    // I am saving `vm` here so the nearby steps can reuse the same value without rebuilding it each time.
    const vm = await getReceiptVM({ sessionId, userId: user.id });
    // This return sends the completed value or response back to the code that called this function.
    return res.json({ ok: true, receipt: vm });
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (err) {
    // I am saving `status` here so the nearby steps can reuse the same value without rebuilding it each time.
    const status = err.status || 500;
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (status === 404) {
      // This return sends the completed value or response back to the code that called this function.
      return res.status(404).json({ ok: false, error: 'not_found' });
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    // I am calling this helper here so the current workflow performs this step before it moves on.
    next(err);
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
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
  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // I am saving `sessionId` here so the nearby steps can reuse the same value without rebuilding it each time.
    const sessionId = String(req.query.session_id || '').trim();
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!sessionId) {
      // This return sends the completed value or response back to the code that called this function.
      return res.status(400).json({ ok: false, error: 'missing_session_id' });
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // I am saving `user` here so the nearby steps can reuse the same value without rebuilding it each time.
    const user = assertUser(req);

    // Expand minimal fields we need; price_id lives in metadata (we set it on checkout)
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['payment_intent'] // amounts/currency/status are on the session itself
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // Ownership check
    const ownerId = ownerIdOf(session);
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!ownerId || ownerId !== user.id) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      logger.warn({
        // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
        event: 'session.ownership_mismatch',
        // I am keeping the `requestId` field in this object so the receiving code can read that value by its expected name.
        requestId: req.requestId,
        // I am keeping this line here because the surrounding payments.js workflow expects this value or operation before it continues.
        sessionId,
        // I am keeping the `userId` field in this object so the receiving code can read that value by its expected name.
        userId: user.id,
        // I am keeping this line here because the surrounding payments.js workflow expects this value or operation before it continues.
        ownerId
      // I am keeping this line here because the surrounding payments.js workflow expects this value or operation before it continues.
      }, 'User attempted to access session they do not own');
      // This return sends the completed value or response back to the code that called this function.
      return res.status(404).json({ ok: false, error: 'not_found' });
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // Fallback persistence if paid
    await persistIfPaid(session, req.requestId);

    // I am saving `payload` here so the nearby steps can reuse the same value without rebuilding it each time.
    const payload = {
      // I am keeping the `id` field in this object so the receiving code can read that value by its expected name.
      id: session.id,
      status: session.status,                 // e.g., 'complete'
      payment_status: session.payment_status, // e.g., 'paid'
      // I am keeping the `amount_total` field in this object so the receiving code can read that value by its expected name.
      amount_total: session.amount_total ?? null,
      // I am keeping the `currency` field in this object so the receiving code can read that value by its expected name.
      currency: session.currency ?? null,
      // I am keeping the `product_key` field in this object so the receiving code can read that value by its expected name.
      product_key: session?.metadata?.product_key || null,
      // I am keeping the `price_id` field in this object so the receiving code can read that value by its expected name.
      price_id: session?.metadata?.price_id || null
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    };

    // I am building or sending the Express response here with the status, data, or page already chosen by this route.
    res.set('Cache-Control', 'no-store');
    // This return sends the completed value or response back to the code that called this function.
    return res.json({ ok: true, session: payload });
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (err) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.error({
      // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
      event: 'session.fetch.error',
      // I am keeping the `requestId` field in this object so the receiving code can read that value by its expected name.
      requestId: req.requestId
      // Removed: error: err.message (security: could leak internal details)
    });
    // This return sends the completed value or response back to the code that called this function.
    return res.status(500).json({ ok: false, error: 'internal_error' });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
});

/**
 * POST /api/pay/receipt/opened
 * Lightweight UX telemetry: record that the user clicked "View official receipt".
 */
router.post('/receipt/opened', async (req, res) => {
  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // I am saving `user` here so the nearby steps can reuse the same value without rebuilding it each time.
    const user = assertUser(req);
    // I am saving `sessionId` here so the nearby steps can reuse the same value without rebuilding it each time.
    const sessionId = String(req.body?.session_id || '').trim();
    // I am saving `receiptUrl` here so the nearby steps can reuse the same value without rebuilding it each time.
    const receiptUrl = String(req.body?.receipt_url || '').trim();

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!sessionId) {
      // This return sends the completed value or response back to the code that called this function.
      return res.status(400).json({ ok: false, error: 'missing_session_id' });
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // I am keeping this line here because the surrounding payments.js workflow expects this value or operation before it continues.
    logger.stripe?.('receipt.opened', {
      // I am keeping the `session_id` field in this object so the receiving code can read that value by its expected name.
      session_id: sessionId,
      // I am keeping the `userId` field in this object so the receiving code can read that value by its expected name.
      userId: user.id,
      // I am keeping the `receipt_url` field in this object so the receiving code can read that value by its expected name.
      receipt_url: /^https?:\/\//i.test(receiptUrl) ? receiptUrl : undefined
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // This return sends the completed value or response back to the code that called this function.
    return res.status(204).end();
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (err) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.warn({ 
      // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
      event: 'receipt.opened.error', 
      // I am keeping the `requestId` field in this object so the receiving code can read that value by its expected name.
      requestId: req.requestId
      // Removed: error: err.message (security: could leak internal details)
    });
    // This return sends the completed value or response back to the code that called this function.
    return res.status(500).json({ ok: false, error: 'internal_error' });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
});

// I am exporting this value here so another module can deliberately reuse the completed piece from payments.js.
module.exports = router;