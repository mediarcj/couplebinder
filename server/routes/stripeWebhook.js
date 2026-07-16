// File: server/routes/stripeWebhook.js
// Description: Stripe webhook handler with signature verification (dual-secret: LIVE + TEST)
// Purpose: Process Stripe events for payment status updates
// Notes:
//  - Uses raw JSON body for signature verification (Stripe requirement)
//  - Verifies against LIVE or TEST endpoint secrets (tries both, preferring config.stripe.mode)
//  - Uses corresponding Stripe client for follow-up API calls
//  - Fetches Checkout line items via listLineItems API (more reliable than deep expands)
//  - Upserts payment rows (idempotent on stripe_checkout_session_id)

'use strict';

// I am loading `express` into `express` so this file can reuse that dependency below.
const express = require('express');
// I am loading `stripe` into `Stripe` so this file can reuse that dependency below.
const Stripe = require('stripe');
// I am loading `crypto` into `crypto` so this file can reuse that dependency below.
const crypto = require('crypto');
// I am loading `../utils/logger` into `logger` so this file can reuse that dependency below.
const logger = require('../utils/logger');
// I am loading `../utils/supabaseClient` into `supabaseAdmin` so this file can reuse that dependency below.
const { supabaseAdmin } = require('../utils/supabaseClient');
// I am loading `../config` into `config` so this file can reuse that dependency below.
const { config } = require('../config');

// Prepare both clients; constructEvent only needs the endpoint secret, not the client.
// We still keep both clients to do follow-up API calls with correct keys.
const stripeLiveClient = new Stripe(config.stripe.live.secretKey || '', {
  // I am keeping the `apiVersion` field in this object so the receiving code can read that value by its expected name.
  apiVersion: config.stripe.apiVersion
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
});
// I am saving `stripeTestClient` here so the nearby steps can reuse the same value without rebuilding it each time.
const stripeTestClient = new Stripe(config.stripe.test.secretKey || '', {
  // I am keeping the `apiVersion` field in this object so the receiving code can read that value by its expected name.
  apiVersion: config.stripe.apiVersion
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
});

// Map price IDs (both modes) → stable product_key for your app logic
const PRICE_TO_KEY = Object.freeze({
  // I am keeping this line here because the surrounding stripeWebhook.js workflow expects this value or operation before it continues.
  [config.stripe.live.priceResumeOneTime]: 'resume_one_time',
  // I am keeping this line here because the surrounding stripeWebhook.js workflow expects this value or operation before it continues.
  [config.stripe.live.priceResumeExpert]:  'resume_expert',
  // I am keeping this line here because the surrounding stripeWebhook.js workflow expects this value or operation before it continues.
  [config.stripe.test.priceResumeOneTime]: 'resume_one_time',
  // I am keeping this line here because the surrounding stripeWebhook.js workflow expects this value or operation before it continues.
  [config.stripe.test.priceResumeExpert]:  'resume_expert'
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
});

// I am keeping `mountStripeWebhook` as a named helper so the surrounding workflow can call this step when it needs it.
function mountStripeWebhook(app) {
  // This route is mounted before JSON parsing because Stripe signs the exact raw bytes.
  // The verified mode also chooses the matching Stripe client for follow-up lookups.
  // Stripe requires the raw request body for signature verification.
  // Use application/json (matches Stripe’s Content-Type). Docs show this exact pattern.
  // Ref: https://docs.stripe.com/payments/checkout/fulfillment#webhooks (Node/Express example)
  // Accept raw bytes regardless of Content-Type. Some proxies change it.
  app.post('/api/stripe/webhook', express.raw({ type: '*/*' }), async (req, res) => {
    // I am saving `sig` here so the nearby steps can reuse the same value without rebuilding it each time.
    const sig = req.headers['stripe-signature'];
    // I am saving `requestId` here so the nearby steps can reuse the same value without rebuilding it each time.
    const requestId = req.id || crypto.randomUUID();
    // Minimal entry log so you can confirm the request actually reached this handler
    logger.info(
      // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
      {
        // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
        event: 'stripe.webhook.received',
        // I am keeping this line here because the surrounding stripeWebhook.js workflow expects this value or operation before it continues.
        requestId,
        // I am keeping the `contentType` field in this object so the receiving code can read that value by its expected name.
        contentType: req.headers['content-type'],
        // I am keeping the `len` field in this object so the receiving code can read that value by its expected name.
        len: req.headers['content-length']
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      },
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      'Stripe webhook request received'
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    );

    // I am saving `liveSecret` here so the nearby steps can reuse the same value without rebuilding it each time.
    const liveSecret = (config.stripe.live && config.stripe.live.webhookSecret) || '';
    // I am saving `testSecret` here so the nearby steps can reuse the same value without rebuilding it each time.
    const testSecret = (config.stripe.test && config.stripe.test.webhookSecret) || '';

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!sig) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      logger.warn({ event: 'stripe.webhook.missing_sig', requestId }, 'Missing Stripe-Signature header');
      // This return sends the completed value or response back to the code that called this function.
      return res.sendStatus(400);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // Prefer verification order based on configured mode, but try both.
    const preferLive = (config.stripe.mode === 'live');
    // I am saving `tryOrder` here so the nearby steps can reuse the same value without rebuilding it each time.
    const tryOrder = preferLive ? ['live', 'test'] : ['test', 'live'];

    /** @type {{event: import('stripe').Stripe.Event, mode:'live'|'test'}|null} */
    let verified = null;

    // I am repeating the next block one item at a time so every value in the existing collection receives the same handling.
    for (const m of tryOrder) {
      // Trying both configured endpoint secrets lets one deployment receive test and live
      // events, but no event reaches business logic unless one signature verifies.
      const secret = m === 'live' ? liveSecret : testSecret;
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (!secret) continue;
      // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
      try {
        // I am saving `evt` here so the nearby steps can reuse the same value without rebuilding it each time.
        const evt = Stripe.webhooks.constructEvent(req.body, sig, secret);
        // I am keeping this line here because the surrounding stripeWebhook.js workflow expects this value or operation before it continues.
        verified = { event: evt, mode: m };
        // I am changing the loop flow here once the condition above has decided this item needs no further work in this pass.
        break;
      // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
      } catch (err) {
        // keep trying with the other secret, but record why it failed
        // Note: Do not log error message as it may leak webhook secret hints
        logger.warn(
          // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
          {
            // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
            event: 'stripe.webhook.verify_failed',
            // I am keeping the `mode` field in this object so the receiving code can read that value by its expected name.
            mode: m,
            // I am keeping this line here because the surrounding stripeWebhook.js workflow expects this value or operation before it continues.
            requestId
            // Removed: message: err?.message (security: could leak secret hints)
          },
          // I am listing this entry here because the surrounding collection processes each allowed value in order.
          'constructEvent failed'
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        );
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!verified) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      logger.warn(
        // I am keeping this line here because the surrounding stripeWebhook.js workflow expects this value or operation before it continues.
        { event: 'stripe.webhook.bad_signature', requestId },
        // I am listing this entry here because the surrounding collection processes each allowed value in order.
        'Signature verification failed for both LIVE and TEST'
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      );
      // This return sends the completed value or response back to the code that called this function.
      return res.sendStatus(400);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // I am saving `event` here so the nearby steps can reuse the same value without rebuilding it each time.
    const { event, mode } = verified;
    // I am saving `client` here so the nearby steps can reuse the same value without rebuilding it each time.
    const client = (mode === 'live') ? stripeLiveClient : stripeTestClient;

    // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
    try {
      // I am choosing among the named cases here so each supported value keeps its own clear path.
      switch (event.type) {
        // This case marks the path for the matching value in the switch that started above.
        case 'checkout.session.completed': {
          /** @type {import('stripe').Stripe.Checkout.Session} */
          const sessionObj = event.data.object;

          // Retrieve a canonical session (minimal expand). We fetch line items separately.
          const fullSession = await client.checkout.sessions.retrieve(sessionObj.id, {
            // I am keeping the `expand` field in this object so the receiving code can read that value by its expected name.
            expand: ['payment_intent.latest_charge']
          // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
          });

          // Prefer metadata price_id/product_key that we set at checkout time
          const metaPriceId = fullSession?.metadata?.price_id || null;
          // I am saving `priceId` here so the nearby steps can reuse the same value without rebuilding it each time.
          let priceId = metaPriceId;

          // This check helps me choose or stop the next path before any work that depends on this condition runs.
          if (!priceId) {
            // Line items fallback: still useful if metadata is missing for some reason
            // Ref: https://docs.stripe.com/api/checkout/sessions/line_items
            try {
              // I am saving `liResp` here so the nearby steps can reuse the same value without rebuilding it each time.
              const liResp = await client.checkout.sessions.listLineItems(fullSession.id, {
                // I am keeping the `limit` field in this object so the receiving code can read that value by its expected name.
                limit: 1,
                // I am keeping the `expand` field in this object so the receiving code can read that value by its expected name.
                expand: ['data.price.product']
              // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
              });
              // I am saving `first` here so the nearby steps can reuse the same value without rebuilding it each time.
              const first = liResp?.data?.[0];
              // I am keeping this line here because the surrounding stripeWebhook.js workflow expects this value or operation before it continues.
              priceId = first?.price?.id || null;
            // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
            } catch (e) {
              // fixed: removed invalid spread `...`
              logger.warn(
                // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
                {
                  // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
                  event: 'webhook.line_items.error',
                  // I am keeping this line here because the surrounding stripeWebhook.js workflow expects this value or operation before it continues.
                  requestId,
                  // I am keeping this line here because the surrounding stripeWebhook.js workflow expects this value or operation before it continues.
                  mode
                  // Removed: message: e?.message (security: could leak internal details)
                },
                // I am listing this entry here because the surrounding collection processes each allowed value in order.
                'Failed to fetch line items'
              // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
              );
            // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
            }
          // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
          }

          // I am saving `metadataProductKey` here so the nearby steps can reuse the same value without rebuilding it each time.
          const metadataProductKey = fullSession?.metadata?.product_key || null;
          // I am saving `productKey` here so the nearby steps can reuse the same value without rebuilding it each time.
          const productKey = metadataProductKey || (priceId ? (PRICE_TO_KEY[priceId] || null) : null);

          // I am saving `userId` here so the nearby steps can reuse the same value without rebuilding it each time.
          const userId   = fullSession?.metadata?.user_id || fullSession?.client_reference_id || null;
          // I am saving `amount` here so the nearby steps can reuse the same value without rebuilding it each time.
          const amount   = fullSession?.amount_total ?? null;
          // I am saving `currency` here so the nearby steps can reuse the same value without rebuilding it each time.
          const currency = fullSession?.currency ?? null;

          // Defensive guard: skip if required fields are missing
          if (!userId || !priceId || !amount || !currency || !productKey) {
            // I am calling this helper here so the current workflow performs this step before it moves on.
            logger.error({
              // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
              event: 'webhook.persist.missing_fields',
              // I am keeping this line here because the surrounding stripeWebhook.js workflow expects this value or operation before it continues.
              requestId,
              // I am keeping this line here because the surrounding stripeWebhook.js workflow expects this value or operation before it continues.
              mode,
              // I am keeping this line here because the surrounding stripeWebhook.js workflow expects this value or operation before it continues.
              userId,
              // I am keeping this line here because the surrounding stripeWebhook.js workflow expects this value or operation before it continues.
              priceId,
              // I am keeping this line here because the surrounding stripeWebhook.js workflow expects this value or operation before it continues.
              amount,
              // I am keeping this line here because the surrounding stripeWebhook.js workflow expects this value or operation before it continues.
              currency,
              // I am keeping the `sessionId` field in this object so the receiving code can read that value by its expected name.
              sessionId: fullSession?.id
            // I am keeping this line here because the surrounding stripeWebhook.js workflow expects this value or operation before it continues.
            }, 'Missing required fields for payment persistence');
            // Return 200 so Stripe stops retrying; nothing to persist yet
            return res.status(200).send('[ok] skipped incomplete session');
          // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
          }

          // Idempotent upsert in case Stripe retries or UI fallback already persisted
          const row = {
            // I am keeping the `user_id` field in this object so the receiving code can read that value by its expected name.
            user_id: userId,
            // I am keeping the `price_id` field in this object so the receiving code can read that value by its expected name.
            price_id: priceId,
            // I am keeping the `product_key` field in this object so the receiving code can read that value by its expected name.
            product_key: productKey,
            // I am keeping the `amount` field in this object so the receiving code can read that value by its expected name.
            amount: amount,
            // I am keeping the `currency` field in this object so the receiving code can read that value by its expected name.
            currency: currency,
            // Normalize success to 'paid' to match the rest of the codebase
            status: 'paid',
            // I am keeping the `stripe_checkout_session_id` field in this object so the receiving code can read that value by its expected name.
            stripe_checkout_session_id: fullSession.id,
            // I am keeping the `stripe_payment_intent_id` field in this object so the receiving code can read that value by its expected name.
            stripe_payment_intent_id: typeof fullSession.payment_intent === 'string'
              // I am keeping this line here because the surrounding stripeWebhook.js workflow expects this value or operation before it continues.
              ? fullSession.payment_intent
              // I am keeping this line here because the surrounding stripeWebhook.js workflow expects this value or operation before it continues.
              : fullSession.payment_intent?.id || null,
            // I am keeping the `metadata` field in this object so the receiving code can read that value by its expected name.
            metadata: fullSession.metadata || {}
          // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
          };

          // I am saving `error` here so the nearby steps can reuse the same value without rebuilding it each time.
          const { error } = await supabaseAdmin
            // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
            .from('payments')
            // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
            .upsert(row, { onConflict: 'stripe_checkout_session_id' });

          // This check helps me choose or stop the next path before any work that depends on this condition runs.
          if (error) {
            // I am calling this helper here so the current workflow performs this step before it moves on.
            logger.error({
              // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
              event: 'webhook.persist.failed',
              // I am keeping this line here because the surrounding stripeWebhook.js workflow expects this value or operation before it continues.
              requestId,
              // I am keeping this line here because the surrounding stripeWebhook.js workflow expects this value or operation before it continues.
              mode,
              // I am keeping the `sessionId` field in this object so the receiving code can read that value by its expected name.
              sessionId: fullSession.id
              // Removed: error: error.message (security: could leak database schema details)
            }, 'Failed to upsert payment record');
            // Return 500 so Stripe will retry delivery; persistence failed
            return res.sendStatus(500);
          // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
          }

          // I am calling this helper here so the current workflow performs this step before it moves on.
          logger.info({
            // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
            event: 'webhook.payment.recorded',
            // I am keeping this line here because the surrounding stripeWebhook.js workflow expects this value or operation before it continues.
            requestId,
            // I am keeping this line here because the surrounding stripeWebhook.js workflow expects this value or operation before it continues.
            mode,
            // I am keeping this line here because the surrounding stripeWebhook.js workflow expects this value or operation before it continues.
            userId,
            // I am keeping this line here because the surrounding stripeWebhook.js workflow expects this value or operation before it continues.
            priceId,
            // I am keeping this line here because the surrounding stripeWebhook.js workflow expects this value or operation before it continues.
            productKey,
            // I am keeping the `sessionId` field in this object so the receiving code can read that value by its expected name.
            sessionId: fullSession.id
          // I am keeping this line here because the surrounding stripeWebhook.js workflow expects this value or operation before it continues.
          }, 'Payment recorded/upserted successfully');

          // Acknowledge quickly (best practice: respond 2xx as soon as possible)
          return res.sendStatus(200);
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }

        // This case marks the path for the matching value in the switch that started above.
        case 'charge.refunded': {
          // Refund events identify payments through the PaymentIntent. Updating the
          // existing row keeps purchase status aligned with Stripe's later lifecycle.
          const charge = event.data.object;
          // I am saving `refundAmount` here so the nearby steps can reuse the same value without rebuilding it each time.
          const refundAmount = charge.amount_refunded;
          // I am saving `isFullRefund` here so the nearby steps can reuse the same value without rebuilding it each time.
          const isFullRefund = refundAmount === charge.amount;

          // I am saving `paymentIntentId` here so the nearby steps can reuse the same value without rebuilding it each time.
          const paymentIntentId = typeof charge.payment_intent === 'string'
            // I am keeping this line here because the surrounding stripeWebhook.js workflow expects this value or operation before it continues.
            ? charge.payment_intent
            // I am keeping this line here because the surrounding stripeWebhook.js workflow expects this value or operation before it continues.
            : charge.payment_intent?.id;

          // This check helps me choose or stop the next path before any work that depends on this condition runs.
          if (!paymentIntentId) {
            // I am calling this helper here so the current workflow performs this step before it moves on.
            logger.warn({
              // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
              event: 'refund.no_payment_intent',
              // I am keeping this line here because the surrounding stripeWebhook.js workflow expects this value or operation before it continues.
              requestId,
              // I am keeping this line here because the surrounding stripeWebhook.js workflow expects this value or operation before it continues.
              mode,
              // I am keeping the `chargeId` field in this object so the receiving code can read that value by its expected name.
              chargeId: charge.id
            // I am keeping this line here because the surrounding stripeWebhook.js workflow expects this value or operation before it continues.
            }, 'Refund charge missing payment_intent_id');
            // This return sends the completed value or response back to the code that called this function.
            return res.sendStatus(200);
          // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
          }

          // I am saving `status` here so the nearby steps can reuse the same value without rebuilding it each time.
          const status = isFullRefund ? 'refunded' : 'partially_refunded';

          // I am saving `error` here so the nearby steps can reuse the same value without rebuilding it each time.
          const { error } = await supabaseAdmin
            // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
            .from('payments')
            // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
            .update({
              // I am keeping this line here because the surrounding stripeWebhook.js workflow expects this value or operation before it continues.
              status,
              // I am keeping the `updated_at` field in this object so the receiving code can read that value by its expected name.
              updated_at: new Date().toISOString()
            // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
            })
            // I am continuing the existing call chain here so this option stays attached to the same operation started above.
            .eq('stripe_payment_intent_id', paymentIntentId);

          // This check helps me choose or stop the next path before any work that depends on this condition runs.
          if (error) {
            // I am calling this helper here so the current workflow performs this step before it moves on.
            logger.error({
              // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
              event: 'refund.update_failed',
              // I am keeping this line here because the surrounding stripeWebhook.js workflow expects this value or operation before it continues.
              requestId,
              // I am keeping this line here because the surrounding stripeWebhook.js workflow expects this value or operation before it continues.
              mode,
              // I am keeping this line here because the surrounding stripeWebhook.js workflow expects this value or operation before it continues.
              paymentIntentId
              // Removed: error: error.message (security: could leak database schema details)
            });
            // This return sends the completed value or response back to the code that called this function.
            return res.sendStatus(500);
          // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
          }

          // I am calling this helper here so the current workflow performs this step before it moves on.
          logger.info({
            // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
            event: 'stripe.charge.refunded',
            // I am keeping this line here because the surrounding stripeWebhook.js workflow expects this value or operation before it continues.
            requestId,
            // I am keeping this line here because the surrounding stripeWebhook.js workflow expects this value or operation before it continues.
            mode,
            // I am keeping the `chargeId` field in this object so the receiving code can read that value by its expected name.
            chargeId: charge.id,
            // I am keeping this line here because the surrounding stripeWebhook.js workflow expects this value or operation before it continues.
            paymentIntentId,
            // I am keeping this line here because the surrounding stripeWebhook.js workflow expects this value or operation before it continues.
            refundAmount,
            // I am keeping this line here because the surrounding stripeWebhook.js workflow expects this value or operation before it continues.
            isFullRefund
          // I am keeping this line here because the surrounding stripeWebhook.js workflow expects this value or operation before it continues.
          }, `Charge refunded - ${isFullRefund ? 'full' : 'partial'} refund`);

          // This return sends the completed value or response back to the code that called this function.
          return res.sendStatus(200);
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }

        // This case marks the path for the matching value in the switch that started above.
        case 'refund.updated': {
          // I am saving `refund` here so the nearby steps can reuse the same value without rebuilding it each time.
          const refund = event.data.object;
          // I am calling this helper here so the current workflow performs this step before it moves on.
          logger.info({
            // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
            event: 'stripe.refund.updated',
            // I am keeping this line here because the surrounding stripeWebhook.js workflow expects this value or operation before it continues.
            requestId,
            // I am keeping this line here because the surrounding stripeWebhook.js workflow expects this value or operation before it continues.
            mode,
            // I am keeping the `refundId` field in this object so the receiving code can read that value by its expected name.
            refundId: refund.id,
            // I am keeping the `status` field in this object so the receiving code can read that value by its expected name.
            status: refund.status,
            // I am keeping the `amount` field in this object so the receiving code can read that value by its expected name.
            amount: refund.amount
          // I am keeping this line here because the surrounding stripeWebhook.js workflow expects this value or operation before it continues.
          }, 'Refund status updated');
          // This return sends the completed value or response back to the code that called this function.
          return res.sendStatus(200);
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }

        // This case marks the path for the matching value in the switch that started above.
        default:
          // Unknown/unhandled types should still 200 so Stripe doesn’t retry
          logger.debug({
            // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
            event: 'stripe.webhook.unhandled_event',
            // I am keeping this line here because the surrounding stripeWebhook.js workflow expects this value or operation before it continues.
            requestId,
            // I am keeping this line here because the surrounding stripeWebhook.js workflow expects this value or operation before it continues.
            mode,
            // I am keeping the `type` field in this object so the receiving code can read that value by its expected name.
            type: event.type
          // I am keeping this line here because the surrounding stripeWebhook.js workflow expects this value or operation before it continues.
          }, 'Unhandled webhook event type');
          // This return sends the completed value or response back to the code that called this function.
          return res.sendStatus(200);
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
    } catch (err) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      logger.error({
        // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
        event: 'stripe.webhook.handler_error',
        // I am keeping this line here because the surrounding stripeWebhook.js workflow expects this value or operation before it continues.
        requestId,
        // I am keeping the `mode` field in this object so the receiving code can read that value by its expected name.
        mode: verified?.event?.type ? mode : 'unknown',
        // I am keeping the `type` field in this object so the receiving code can read that value by its expected name.
        type: verified?.event?.type || 'unknown'
        // Removed: error: err.message (security: could leak internal details)
      });
      // Non-2xx tells Stripe to retry, which we want if our handler failed
      return res.sendStatus(500);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am exporting this value here so another module can deliberately reuse the completed piece from stripeWebhook.js.
module.exports = { mountStripeWebhook };