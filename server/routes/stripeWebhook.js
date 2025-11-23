// File: server/routes/stripeWebhook.js
// Description: Stripe webhook handler with signature verification (dual-secret: LIVE + TEST)
// Purpose: Process Stripe events for payment status updates
// Notes: Raw body processing; verifies against LIVE first in production, otherwise TEST first; falls back to the other.
//        Uses the corresponding Stripe client (live/test) for follow-up API calls.

'use strict';

/**
 * WHAT:
 * Stripe webhook handler that processes payment events with signature verification.
 * 
 * WHY:
 * Receive authoritative payment status updates from Stripe (test and live).
 * Signature verification ensures authenticity.
 * 
 * HOW:
 * 1. Verify webhook signature using LIVE or TEST secret (try both, preferred order by NODE_ENV).
 * 2. Use corresponding Stripe client for retrieval/expansion.
 * 3. Process events and persist.
 */

const express = require('express');
const Stripe = require('stripe');
const crypto = require('crypto');
const logger = require('../utils/logger');
const { supabaseAdmin } = require('../utils/supabaseClient');
const { config } = require('../config');

// Prepare both clients; webhooks.constructEvent works fine on either client.
const stripeLiveClient = new Stripe(config.stripe.live.secretKey || '', { apiVersion: '2025-09-30.clover' });
const stripeTestClient = new Stripe(config.stripe.test.secretKey || '', { apiVersion: '2025-09-30.clover' });

// Price → product_key allowlist (both modes)
const PRICE_TO_KEY = Object.freeze({
  [config.stripe.live.priceResumeOneTime]: 'resume_one_time',
  [config.stripe.live.priceResumeExpert]:  'resume_expert',
  [config.stripe.test.priceResumeOneTime]: 'resume_one_time',
  [config.stripe.test.priceResumeExpert]:  'resume_expert'
});

function mountStripeWebhook(app) {
  // Mount at /api/stripe/webhook (bypasses auth guards; ensure in maintenance allowlist)
  app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const requestId = req.id || crypto.randomUUID();

    const liveSecret = config.stripe.live.webhookSecret;
    const testSecret = config.stripe.test.webhookSecret;

    if (!sig) {
      logger.warn({ event: 'stripe.webhook.missing_sig', requestId }, 'Missing Stripe-Signature header');
      return res.sendStatus(400);
    }

    // Try verification, preferring mode by NODE_ENV
    const preferLive = config.stripe.mode === 'live';
    const tryOrder = preferLive ? ['live', 'test'] : ['test', 'live'];

    /** @type {{event:any, mode:'live'|'test', client:any}|null} */
    let verified = null;

    for (const m of tryOrder) {
      try {
        if (m === 'live' && liveSecret) {
          const event = stripeLiveClient.webhooks.constructEvent(req.body, sig, liveSecret);
          verified = { event, mode: 'live', client: stripeLiveClient };
          break;
        }
        if (m === 'test' && testSecret) {
          const event = stripeTestClient.webhooks.constructEvent(req.body, sig, testSecret);
          verified = { event, mode: 'test', client: stripeTestClient };
          break;
        }
      } catch (err) {
        // keep trying with the other secret
      }
    }

    if (!verified) {
      logger.warn({ event: 'stripe.webhook.bad_signature', requestId }, 'Signature verification failed for both LIVE and TEST');
      return res.sendStatus(400);
    }

    const { event, mode, client } = verified;

    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          const sessionObj = /** @type {import('stripe').Stripe.Checkout.Session} */ (event.data.object);

          // Retrieve a fuller session; expand line_items and latest_charge for receipt URL if needed
          const fullSession = await client.checkout.sessions.retrieve(sessionObj.id, {
            expand: ['line_items.data.price.product', 'payment_intent.latest_charge']
          });

          const userId   = fullSession?.metadata?.user_id || fullSession?.client_reference_id || null;
          const amount   = fullSession?.amount_total ?? null;
          const currency = fullSession?.currency ?? null;

          const li = fullSession?.line_items?.data?.[0] || null;
          const priceId = li?.price?.id || null;
          const productKey = priceId ? (PRICE_TO_KEY[priceId] || null) : null;

          // Defensive: skip if required fields missing
          if (!userId || !priceId || !amount || !currency) {
            logger.error({
              event: 'webhook.persist.missing_fields',
              requestId,
              mode,
              userId, priceId, amount, currency,
              sessionId: fullSession?.id
            }, 'Missing required fields for payment persistence');
            return res.status(200).send('[ok] skipped incomplete session');
          }

          // Persist payment
          const { error } = await supabaseAdmin
            .from('payments')
            .insert({
              user_id: userId,
              price_id: priceId,
              product_key: productKey,
              amount: amount,
              currency: currency,
              status: 'succeeded',
              stripe_checkout_session_id: fullSession.id,
              stripe_payment_intent_id: typeof fullSession.payment_intent === 'string'
                ? fullSession.payment_intent
                : fullSession.payment_intent?.id || null,
              metadata: fullSession.metadata || {}
            });

          if (error) {
            logger.error({
              event: 'webhook.persist.failed',
              requestId,
              mode,
              error: error.message,
              sessionId: fullSession.id
            }, 'Failed to persist payment record');
            throw error;
          }

          logger.info({
            event: 'webhook.payment.recorded',
            requestId,
            mode,
            userId,
            priceId,
            productKey,
            sessionId: fullSession.id
          }, 'Payment recorded successfully');
          break;
        }

        case 'charge.refunded': {
          const charge = event.data.object;
          const refundAmount = charge.amount_refunded;
          const isFullRefund = refundAmount === charge.amount;

          const paymentIntentId = typeof charge.payment_intent === 'string'
            ? charge.payment_intent
            : charge.payment_intent?.id;

          if (!paymentIntentId) {
            logger.warn({
              event: 'refund.no_payment_intent',
              requestId,
              mode,
              chargeId: charge.id
            }, 'Refund charge missing payment_intent_id');
            break;
          }

          const status = isFullRefund ? 'refunded' : 'partially_refunded';

          const { error } = await supabaseAdmin
            .from('payments')
            .update({
              status,
              updated_at: new Date().toISOString()
            })
            .eq('stripe_payment_intent_id', paymentIntentId);

          if (error) {
            logger.error({
              event: 'refund.update_failed',
              requestId,
              mode,
              paymentIntentId,
              error: error.message
            });
            throw error;
          }

          logger.info({
            event: 'stripe.charge.refunded',
            requestId,
            mode,
            chargeId: charge.id,
            paymentIntentId,
            refundAmount,
            isFullRefund
          }, `Charge refunded - ${isFullRefund ? 'full' : 'partial'} refund`);
          break;
        }

        case 'refund.updated': {
          const refund = event.data.object;
          logger.info({
            event: 'stripe.refund.updated',
            requestId,
            mode,
            refundId: refund.id,
            status: refund.status,
            amount: refund.amount
          }, 'Refund status updated');
          break;
        }

        default:
          logger.debug({
            event: 'stripe.webhook.unknown_event',
            requestId,
            mode,
            type: event.type
          }, 'Unknown webhook event type');
      }
      return res.sendStatus(200);
    } catch (err) {
      logger.error({
        event: 'stripe.webhook.handler_error',
        requestId,
        mode,
        type: event.type,
        error: err.message
      });
      return res.sendStatus(500);
    }
  });
}

module.exports = { mountStripeWebhook };