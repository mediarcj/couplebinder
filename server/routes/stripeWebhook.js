// Description: Stripe webhook handler with signature verification (dual-secret: LIVE + TEST)
// Purpose: Process Stripe events for payment status updates
//  - Uses raw JSON body for signature verification (Stripe requirement)
//  - Verifies against LIVE or TEST endpoint secrets (tries both, preferring config.stripe.mode)
//  - Uses corresponding Stripe client for follow-up API calls
//  - Fetches Checkout line items via listLineItems API (more reliable than deep expands)
//  - Upserts payment rows (idempotent on stripe_checkout_session_id)

'use strict';

const express = require('express');
const Stripe = require('stripe');
const crypto = require('crypto');
const logger = require('../utils/logger');
const { supabaseAdmin } = require('../utils/supabaseClient');
const { config } = require('../config');

// Prepare both clients; constructEvent only needs the endpoint secret, not the client.
// We still keep both clients to do follow-up API calls with correct keys.
const stripeLiveClient = new Stripe(config.stripe.live.secretKey || '', {
  apiVersion: config.stripe.apiVersion
});
const stripeTestClient = new Stripe(config.stripe.test.secretKey || '', {
  apiVersion: config.stripe.apiVersion
});

// Map price IDs (both modes) → stable product_key for your app logic
const PRICE_TO_KEY = Object.freeze({
  [config.stripe.live.priceResumeOneTime]: 'resume_one_time',
  [config.stripe.live.priceResumeExpert]:  'resume_expert',
  [config.stripe.test.priceResumeOneTime]: 'resume_one_time',
  [config.stripe.test.priceResumeExpert]:  'resume_expert'
});

function mountStripeWebhook(app) {
  // This route is mounted before JSON parsing because Stripe signs the exact raw bytes.
  // The verified mode also chooses the matching Stripe client for follow-up lookups.
  // Stripe requires the raw request body for signature verification.
  // Use application/json (matches Stripe’s Content-Type). Docs show this exact pattern.
  // Ref: https://docs.stripe.com/payments/checkout/fulfillment#webhooks (Node/Express example)
  // Accept raw bytes regardless of Content-Type. Some proxies change it.
  app.post('/api/stripe/webhook', express.raw({ type: '*/*' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const requestId = req.id || crypto.randomUUID();
    // Minimal entry log so you can confirm the request actually reached this handler
    logger.info(
      {
        event: 'stripe.webhook.received',
        requestId,
        contentType: req.headers['content-type'],
        len: req.headers['content-length']
      },
      'Stripe webhook request received'
    );

    const liveSecret = (config.stripe.live && config.stripe.live.webhookSecret) || '';
    const testSecret = (config.stripe.test && config.stripe.test.webhookSecret) || '';

    if (!sig) {
      logger.warn({ event: 'stripe.webhook.missing_sig', requestId }, 'Missing Stripe-Signature header');
      return res.sendStatus(400);
    }

    // Prefer verification order based on configured mode, but try both.
    const preferLive = (config.stripe.mode === 'live');
    const tryOrder = preferLive ? ['live', 'test'] : ['test', 'live'];

    /** @type {{event: import('stripe').Stripe.Event, mode:'live'|'test'}|null} */
    let verified = null;

    for (const m of tryOrder) {
      // Trying both configured endpoint secrets lets one deployment receive test and live
      // events, but no event reaches business logic unless one signature verifies.
      const secret = m === 'live' ? liveSecret : testSecret;
      if (!secret) continue;
      try {
        const evt = Stripe.webhooks.constructEvent(req.body, sig, secret);
        verified = { event: evt, mode: m };
        break;
      } catch (err) {
        // keep trying with the other secret, but record why it failed
        // Note: Do not log error message as it may leak webhook secret hints
        logger.warn(
          {
            event: 'stripe.webhook.verify_failed',
            mode: m,
            requestId
            // Removed: message: err?.message (security: could leak secret hints)
          },
          'constructEvent failed'
        );
      }
    }

    if (!verified) {
      logger.warn(
        { event: 'stripe.webhook.bad_signature', requestId },
        'Signature verification failed for both LIVE and TEST'
      );
      return res.sendStatus(400);
    }

    const { event, mode } = verified;
    const client = (mode === 'live') ? stripeLiveClient : stripeTestClient;

    try {
      // Checkout completion creates the payment row; later refund events reconcile its status.
      switch (event.type) {
        case 'checkout.session.completed': {
          /** @type {import('stripe').Stripe.Checkout.Session} */
          const sessionObj = event.data.object;

          // Retrieve a canonical session (minimal expand). We fetch line items separately.
          const fullSession = await client.checkout.sessions.retrieve(sessionObj.id, {
            expand: ['payment_intent.latest_charge']
          });

          // Prefer metadata price_id/product_key that we set at checkout time
          const metaPriceId = fullSession?.metadata?.price_id || null;
          let priceId = metaPriceId;

          if (!priceId) {
            // Line items fallback: still useful if metadata is missing for some reason
            // Ref: https://docs.stripe.com/api/checkout/sessions/line_items
            try {
              const liResp = await client.checkout.sessions.listLineItems(fullSession.id, {
                limit: 1,
                expand: ['data.price.product']
              });
              const first = liResp?.data?.[0];
              priceId = first?.price?.id || null;
            } catch (e) {
              // fixed: removed invalid spread `...`
              logger.warn(
                {
                  event: 'webhook.line_items.error',
                  requestId,
                  mode
                  // Removed: message: e?.message (security: could leak internal details)
                },
                'Failed to fetch line items'
              );
            }
          }

          const metadataProductKey = fullSession?.metadata?.product_key || null;
          const productKey = metadataProductKey || (priceId ? (PRICE_TO_KEY[priceId] || null) : null);

          const userId   = fullSession?.metadata?.user_id || fullSession?.client_reference_id || null;
          const amount   = fullSession?.amount_total ?? null;
          const currency = fullSession?.currency ?? null;

          // Defensive guard: skip if required fields are missing
          if (!userId || !priceId || !amount || !currency || !productKey) {
            logger.error({
              event: 'webhook.persist.missing_fields',
              requestId,
              mode,
              userId,
              priceId,
              amount,
              currency,
              sessionId: fullSession?.id
            }, 'Missing required fields for payment persistence');
            // An authenticated but incomplete event may reflect a transient expansion or
            // line-item failure. Return a retryable error instead of silently losing payment state.
            return res.status(500).send('Unable to persist checkout session');
          }

          // Idempotent upsert in case Stripe retries or UI fallback already persisted
          const row = {
            user_id: userId,
            price_id: priceId,
            product_key: productKey,
            amount: amount,
            currency: currency,
            // Normalize success to 'paid' to match the rest of the codebase
            status: 'paid',
            stripe_checkout_session_id: fullSession.id,
            stripe_payment_intent_id: typeof fullSession.payment_intent === 'string'
              ? fullSession.payment_intent
              : fullSession.payment_intent?.id || null,
            metadata: fullSession.metadata || {}
          };

          const { error } = await supabaseAdmin
            .from('payments')
            .upsert(row, { onConflict: 'stripe_checkout_session_id' });

          if (error) {
            logger.error({
              event: 'webhook.persist.failed',
              requestId,
              mode,
              sessionId: fullSession.id
              // The event and session identify this retry without exposing database details.
            }, 'Failed to upsert payment record');
            // Return 500 so Stripe will retry delivery; persistence failed
            return res.sendStatus(500);
          }

          logger.info({
            event: 'webhook.payment.recorded',
            requestId,
            mode,
            userId,
            priceId,
            productKey,
            sessionId: fullSession.id
          }, 'Payment recorded/upserted successfully');

          // Acknowledge quickly (best practice: respond 2xx as soon as possible)
          return res.sendStatus(200);
        }

        case 'charge.refunded': {
          // Refund events identify payments through the PaymentIntent. Updating the
          // existing row keeps purchase status aligned with Stripe's later lifecycle.
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
            return res.sendStatus(200);
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
              paymentIntentId
              // The PaymentIntent ID is enough support context without the database error text.
            });
            return res.sendStatus(500);
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

          return res.sendStatus(200);
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
          return res.sendStatus(200);
        }

        default:
          // Unknown/unhandled types should still 200 so Stripe doesn’t retry
          logger.debug({
            event: 'stripe.webhook.unhandled_event',
            requestId,
            mode,
            type: event.type
          }, 'Unhandled webhook event type');
          return res.sendStatus(200);
      }
    } catch (err) {
      logger.error({
        event: 'stripe.webhook.handler_error',
        requestId,
        mode: verified?.event?.type ? mode : 'unknown',
        type: verified?.event?.type || 'unknown'
        // Avoid echoing raw provider or database details from this outer failure boundary.
      });
      // Non-2xx tells Stripe to retry, which we want if our handler failed
      return res.sendStatus(500);
    }
  });
}

module.exports = { mountStripeWebhook };
