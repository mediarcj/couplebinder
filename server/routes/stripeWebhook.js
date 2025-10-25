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
const logger = require('../utils/logger');
const { upsertPaymentFromSession } = require('../services/billingService');

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
    let event;

    try {
      event = stripe.webhooks.constructEvent(req.body, sig, secret);
    } catch (err) {
      logger.warn({ 
        event: 'stripe.webhook.bad_signature', 
        err: err.message 
      });
      return res.sendStatus(400);
    }

    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object;
          await upsertPaymentFromSession(session, 'paid');
          logger.info({
            event: 'stripe.checkout.session.completed',
            mode: session.mode,
            sessionId: session.id,
            userId: session.metadata?.user_id,
            customer: session.customer,
            email: session.customer_details?.email,
            amount_total: session.amount_total,
            currency: session.currency
          }, 'Checkout session completed - payment received');
          break;
        }
        case 'refund.succeeded':
        case 'charge.refunded':
        case 'refund.updated':
        case 'charge.refund.updated': {
          // TODO: optional – update payment row to refunded/partially_refunded
          logger.info({
            event: 'stripe.webhook.refund_processed',
            type: event.type
          }, 'Refund processed via webhook');
          break;
        }
        default:
          // ignore unknown events
          logger.debug({
            event: 'stripe.webhook.unknown_event',
            type: event.type
          }, 'Unknown webhook event type');
      }
      return res.sendStatus(200);
    } catch (err) {
      logger.error({ 
        event: 'stripe.webhook.handler_error', 
        type: event.type, 
        error: err.message 
      });
      return res.sendStatus(500);
    }
  });
}

module.exports = { mountStripeWebhook };
