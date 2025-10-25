// File: server/routes/stripeWebhook.js
// Description: Stripe webhook handler with signature verification
// Purpose: Process Stripe events for payment status updates
// Notes: Follows Building Laws: backend is source of truth, raw body processing

/**
 * WHAT:
 * Stripe webhook handler that processes payment events with signature verification.
 * 
 * WHY:
 * Need to receive authoritative payment status updates from Stripe.
 * Signature verification ensures webhooks are authentic.
 * 
 * HOW:
 * 1. Verify webhook signature using Stripe secret
 * 2. Process payment events (checkout.session.completed, refunds)
 * 3. Update payment records in database
 * 4. Handle errors gracefully with proper logging
 */

const express = require('express');
const Stripe = require('stripe');
const crypto = require('crypto');
const logger = require('../utils/logger');
const { supabaseAdmin } = require('../utils/supabaseClient');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { 
  apiVersion: '2025-09-30.clover' 
});

/**
 * WHAT:
 * Mount Stripe webhook handler with raw body processing and signature verification.
 * 
 * WHY:
 * Webhooks must bypass JSON parsing and CSRF to receive raw Stripe events.
 * Signature verification prevents malicious webhook calls.
 * 
 * HOW:
 * 1. Use express.raw() for raw body processing
 * 2. Verify Stripe signature using webhook secret
 * 3. Process specific event types
 * 4. Update payment records accordingly
 */
function mountStripeWebhook(app) {
  // Mount at /webhooks/stripe (not under /api) to bypass auth guards
  app.post('/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    const requestId = req.id || crypto.randomUUID();
    let event;

    try {
      event = stripe.webhooks.constructEvent(req.body, sig, secret);
    } catch (err) {
      logger.warn({ 
        event: 'stripe.webhook.bad_signature', 
        requestId,
        err: err.message 
      });
      return res.sendStatus(400);
    }

    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          const sessionObj = event.data.object; // minimal session from webhook
          
          // Retrieve full session with line items (webhooks don't include line_items by default)
          const fullSession = await stripe.checkout.sessions.retrieve(sessionObj.id, {
            expand: [
              'line_items.data.price.product',
              'payment_intent.latest_charge'
            ]
          });

          const userId = fullSession?.metadata?.user_id || fullSession?.client_reference_id || null;
          const amount = fullSession?.amount_total ?? null;
          const currency = fullSession?.currency ?? null;

          // Extract price_id from first line item
          const li = fullSession?.line_items?.data?.[0] || null;
          const priceId = li?.price?.id || null;

          // Map price_id to product_key from env allowlist
          const PRICE_TO_KEY = {
            [process.env.STRIPE_PRICE_RESUME_ONE_TIME]: 'resume_one_time',
            [process.env.STRIPE_PRICE_RESUME_EXPERT]: 'resume_expert'
          };
          const productKey = priceId ? (PRICE_TO_KEY[priceId] || null) : null;

          // Defensive: skip if required fields missing
          if (!userId || !priceId || !amount || !currency) {
            logger.error({ 
              event: 'webhook.persist.missing_fields', 
              requestId,
              userId, 
              priceId, 
              amount, 
              currency, 
              sessionId: fullSession?.id 
            }, 'Missing required fields for payment persistence');
            return res.status(200).send('[ok] skipped incomplete session');
          }

          // Persist payment with non-null price_id
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
              error: error.message,
              sessionId: fullSession.id
            }, 'Failed to persist payment record');
            throw error;
          }

          logger.info({
            event: 'webhook.payment.recorded',
            requestId,
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
              paymentIntentId,
              error: error.message 
            });
            throw error;
          }
          
          logger.info({
            event: 'stripe.charge.refunded',
            requestId,
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
            refundId: refund.id,
            status: refund.status,
            amount: refund.amount
          }, 'Refund status updated');
          break;
        }
        default:
          // ignore unknown events
          logger.debug({
            event: 'stripe.webhook.unknown_event',
            requestId,
            type: event.type
          }, 'Unknown webhook event type');
      }
      return res.sendStatus(200);
    } catch (err) {
      logger.error({ 
        event: 'stripe.webhook.handler_error', 
        requestId,
        type: event.type, 
        error: err.message 
      });
      return res.sendStatus(500);
    }
  });
}

module.exports = { mountStripeWebhook };
