// File: server/services/billingService.js
// Description: Stripe billing service with customer management and checkout sessions
// Purpose: Handle Stripe payments, customer creation, and payment tracking
// Notes: Backend is the source of truth; no card data stored here.

'use strict';

/**
 * WHAT:
 * Stripe billing service that handles customer creation, checkout sessions, and payment tracking.
 *
 * WHY:
 * We need secure payments without touching card data. Stripe is PCI compliant.
 *
 * HOW:
 * 1) Create/retrieve Stripe customers mapped to user IDs
 * 2) Generate secure checkout sessions using an allowlist of active prices
 * 3) Track payment status in DB (webhook is the source of truth; we also upsert on reads)
 * 4) Use idempotency keys to avoid duplicate charges
 */

const Stripe = require('stripe');
// I am loading `../utils/logger` into `logger` so this file can reuse that dependency below.
const logger = require('../utils/logger');
// I am loading `../utils/supabaseClient` into `supabaseAdmin` so this file can reuse that dependency below.
const { supabaseAdmin } = require('../utils/supabaseClient');
// I am loading `../config` into `config` so this file can reuse that dependency below.
const { config } = require('../config');

// Prefer the active stripe block; fallback to legacy flat fields for back-compat
function pickStripeCfg() {
  // Prefer the selected live/test block, while retaining flat config for older deployments.
  const base = config?.stripe || {};
  // This return sends the completed value or response back to the code that called this function.
  return (base.active && (base.active.secretKey || base.active.priceResumeOneTime || base.active.priceResumeExpert))
    // I am keeping this line here because the surrounding billingService.js workflow expects this value or operation before it continues.
    ? base.active
    // I am keeping this line here because the surrounding billingService.js workflow expects this value or operation before it continues.
    : base;
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am saving `sCfg` here so the nearby steps can reuse the same value without rebuilding it each time.
const sCfg = pickStripeCfg();
// Fail at service startup instead of waiting for a checkout request to discover missing Stripe.
const SECRET_KEY = String(config?.stripe?.active?.secretKey || config?.stripe?.secretKey || '').trim();
// This check helps me choose or stop the next path before any work that depends on this condition runs.
if (!SECRET_KEY) {
  // I am stopping this path with the existing error here because the caller should not continue with an invalid result.
  throw new Error('Stripe secret key missing in config (expected config.stripe.active.secretKey or config.stripe.secretKey)');
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am saving `stripe` here so the nearby steps can reuse the same value without rebuilding it each time.
const stripe = new Stripe(SECRET_KEY, { apiVersion: config.stripe.apiVersion });

// Live/test detection based on the secret prefix
const IS_LIVE = SECRET_KEY.startsWith('sk_live_');

// Price allowlist from the effective config (active preferred, flat as fallback)
const ACTIVE_PRICES = Object.freeze({
  // The browser sends a product choice, but checkout is created only from this server-side
  // allowlist so a caller cannot substitute an arbitrary Stripe price ID.
  [String(sCfg.priceResumeOneTime || '').trim()]: {
    // I am keeping the `type` field in this object so the receiving code can read that value by its expected name.
    type: 'one_time',
    // I am keeping the `mode` field in this object so the receiving code can read that value by its expected name.
    mode: 'payment',
    // I am keeping the `productKey` field in this object so the receiving code can read that value by its expected name.
    productKey: 'resume_one_time'
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  },
  // I am keeping this line here because the surrounding billingService.js workflow expects this value or operation before it continues.
  [String(sCfg.priceResumeExpert || '').trim()]: {
    // I am keeping the `type` field in this object so the receiving code can read that value by its expected name.
    type: 'one_time',
    // I am keeping the `mode` field in this object so the receiving code can read that value by its expected name.
    mode: 'payment',
    // I am keeping the `productKey` field in this object so the receiving code can read that value by its expected name.
    productKey: 'resume_expert'
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
});
// I am saving `ALLOWED_PRICE_IDS` here so the nearby steps can reuse the same value without rebuilding it each time.
const ALLOWED_PRICE_IDS = new Set(Object.keys(ACTIVE_PRICES).filter(Boolean));

// I am keeping `productKeyForPrice` as a named helper so the surrounding workflow can call this step when it needs it.
function productKeyForPrice(priceId) {
  // Webhook/payment rows use this stable internal key rather than a mode-specific Stripe ID.
  return ACTIVE_PRICES[priceId]?.productKey || 'unknown';
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// Keep separate live/test customer columns
async function getOrCreateStripeCustomer(userId, email) {
  // Live and test customers are separate Stripe objects. Separate columns prevent a test
  // identifier from leaking into a live checkout while preserving the legacy field.
  const column = IS_LIVE ? 'stripe_customer_id_live' : 'stripe_customer_id_test';

  // Select only needed columns instead of '*' for better performance on hot path
  const { data: row, error } = await supabaseAdmin
    // One user row holds separate provider IDs for live and test environments.
    .from('billing_customers')
    // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
    .select(`user_id, ${column}, stripe_customer_id`)
    // I am continuing the existing call chain here so this option stays attached to the same operation started above.
    .eq('user_id', userId)
    // I am continuing the existing call chain here so this option stays attached to the same operation started above.
    .maybeSingle();

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (error) throw error;
  // Reuse the mode-specific customer before creating anything at Stripe.
  if (row?.[column]) return row[column];

  // The authenticated app user becomes metadata for later Stripe-side support/debugging.
  const customer = await stripe.customers.create({
    // I am keeping the `email` field in this object so the receiving code can read that value by its expected name.
    email: email || undefined,
    // I am keeping the `metadata` field in this object so the receiving code can read that value by its expected name.
    metadata: { user_id: userId, env: IS_LIVE ? 'live' : 'test' }
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });

  // I am saving `upsert` here so the nearby steps can reuse the same value without rebuilding it each time.
  const upsert = { user_id: userId, email: email || null, [column]: customer.id };
  // Fill the legacy column only once so existing readers keep working during migration.
  if (!row?.stripe_customer_id) upsert.stripe_customer_id = customer.id; // back-compat

  // I am saving `error` here so the nearby steps can reuse the same value without rebuilding it each time.
  const { error: insErr } = await supabaseAdmin
    // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
    .from('billing_customers')
    // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
    .upsert(upsert, { onConflict: 'user_id' });

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (insErr) throw insErr;
  // This return sends the completed value or response back to the code that called this function.
  return customer.id;
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `createCheckoutSession` as a named asynchronous helper so the surrounding workflow can call this step when it needs it.
async function createCheckoutSession({ user, priceId, quantity = 1, idempotencyKey, requestId }) {
  // This is the main checkout boundary: validate the configured price, bind the Stripe
  // session to the authenticated user, and return only Stripe's hosted checkout session.
  const trimmedPriceId = String(priceId || '').trim();

  // Allowlist check
  const priceCfg = ACTIVE_PRICES[trimmedPriceId];
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!priceCfg || !ALLOWED_PRICE_IDS.has(trimmedPriceId)) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.error({ event: 'checkout.session.error', requestId, priceId: trimmedPriceId }, 'Price not allowed');
    // I am saving `err` here so the nearby steps can reuse the same value without rebuilding it each time.
    const err = new Error('Price not allowed');
    // I am keeping this line here because the surrounding billingService.js workflow expects this value or operation before it continues.
    err.status = 400;
    // I am stopping this path with the existing error here because the caller should not continue with an invalid result.
    throw err;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am saving `customerId` here so the nearby steps can reuse the same value without rebuilding it each time.
  const customerId = await getOrCreateStripeCustomer(user.id, user.email);
  // Start from the server allowlist, then compare it with Stripe's current price object below.
  let effectiveMode = priceCfg.mode; // default 'payment'
  // I am saving `productKey` here so the nearby steps can reuse the same value without rebuilding it each time.
  const productKey = priceCfg.productKey;

  // Validate against Stripe (tolerant)
  try {
    // This lookup confirms whether Stripe currently treats the allowed price as recurring.
    const price = await stripe.prices.retrieve(trimmedPriceId);
    // I am saving `stripeMode` here so the nearby steps can reuse the same value without rebuilding it each time.
    const stripeMode = price?.recurring ? 'subscription' : 'payment';
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (stripeMode !== effectiveMode) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      logger.warn({
        // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
        event: 'price.mode.mismatch',
        // I am keeping this line here because the surrounding billingService.js workflow expects this value or operation before it continues.
        requestId, priceId: trimmedPriceId, expected: effectiveMode, stripeMode
      // I am keeping this line here because the surrounding billingService.js workflow expects this value or operation before it continues.
      }, 'Mode mismatch; using Stripe mode');
      // I am keeping this line here because the surrounding billingService.js workflow expects this value or operation before it continues.
      effectiveMode = stripeMode;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (err) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.warn({
      // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
      event: 'price.lookup.failed', 
      // I am keeping this line here because the surrounding billingService.js workflow expects this value or operation before it continues.
      requestId, 
      // I am keeping the `priceId` field in this object so the receiving code can read that value by its expected name.
      priceId: trimmedPriceId
      // Removed: error: err.message (security: could leak Stripe API details)
    }, 'Could not verify price; proceeding with allowlisted mode');
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!config.publicOrigin || !config.publicOrigin.trim()) {
    // Checkout redirects must use one explicit public origin; request headers are not trusted here.
    logger.error({
      // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
      event: 'checkout.config.missing_public_origin', requestId, publicOrigin: config.publicOrigin
    // I am keeping this line here because the surrounding billingService.js workflow expects this value or operation before it continues.
    }, 'publicOrigin is missing or empty');
    // I am saving `err` here so the nearby steps can reuse the same value without rebuilding it each time.
    const err = new Error('Server configuration error: publicOrigin not set');
    // I am keeping this line here because the surrounding billingService.js workflow expects this value or operation before it continues.
    err.status = 500;
    // I am stopping this path with the existing error here because the caller should not continue with an invalid result.
    throw err;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // URL building: use config.stripe.successPath/cancelPath only (no process.env fallbacks)
  const baseUrl = config.publicOrigin.replace(/\/+$/, '');
  // Paths may be relative defaults or explicit absolute destinations from central config.
  const rawSuccessPath = config?.stripe?.successPath || '/dashboard/purchase/confirmation';
  // I am saving `rawCancelPath` here so the nearby steps can reuse the same value without rebuilding it each time.
  const rawCancelPath = config?.stripe?.cancelPath || '/dashboard/billing';

  // I am saving `isFullUrl` here so the nearby steps can reuse the same value without rebuilding it each time.
  const isFullUrl = (u) => { try { const x = new URL(u); return x.protocol === 'http:' || x.protocol === 'https:'; } catch { return false; } };
  // I am saving `normPath` here so the nearby steps can reuse the same value without rebuilding it each time.
  const normPath = (p) => (p ? (isFullUrl(p) ? p : (p.startsWith('/') ? p : `/${p}`)) : '');

  // I am saving `successPath` here so the nearby steps can reuse the same value without rebuilding it each time.
  const successPath = normPath(rawSuccessPath);
  // I am saving `cancelPath` here so the nearby steps can reuse the same value without rebuilding it each time.
  const cancelPath  = normPath(rawCancelPath);

  // Stripe replaces the literal session placeholder after a successful hosted checkout.
  const successUrl = isFullUrl(successPath)
    // I am keeping this line here because the surrounding billingService.js workflow expects this value or operation before it continues.
    ? `${successPath}${successPath.includes('?') ? '&' : '?'}session_id={CHECKOUT_SESSION_ID}`
    // I am keeping this line here because the surrounding billingService.js workflow expects this value or operation before it continues.
    : `${baseUrl}${successPath}?session_id={CHECKOUT_SESSION_ID}`;

  // I am saving `cancelUrl` here so the nearby steps can reuse the same value without rebuilding it each time.
  const cancelUrl = isFullUrl(cancelPath)
    // I am keeping this line here because the surrounding billingService.js workflow expects this value or operation before it continues.
    ? `${cancelPath}${cancelPath.includes('?') ? '&' : '?'}canceled=1`
    // I am keeping this line here because the surrounding billingService.js workflow expects this value or operation before it continues.
    : `${baseUrl}${cancelPath}?canceled=1`;

  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // Substitute a sample session ID only for URL parsing; keep Stripe's placeholder in config.
    new URL(successUrl.replace('{CHECKOUT_SESSION_ID}', 'test_session_id'));
    // I am keeping this line here because the surrounding billingService.js workflow expects this value or operation before it continues.
    new URL(cancelUrl);
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (e) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.error({ 
      // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
      event: 'checkout.url.invalid', 
      // I am keeping this line here because the surrounding billingService.js workflow expects this value or operation before it continues.
      requestId, 
      // I am keeping this line here because the surrounding billingService.js workflow expects this value or operation before it continues.
      successUrl, 
      // I am keeping this line here because the surrounding billingService.js workflow expects this value or operation before it continues.
      cancelUrl
      // Removed: error: e.message (security: could leak internal details)
    }, 'Generated checkout URLs are invalid');
    // I am saving `err` here so the nearby steps can reuse the same value without rebuilding it each time.
    const err = new Error('Invalid checkout URL configuration');
    // I am keeping this line here because the surrounding billingService.js workflow expects this value or operation before it continues.
    err.status = 500;
    // I am stopping this path with the existing error here because the caller should not continue with an invalid result.
    throw err;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am saving `sessionConfig` here so the nearby steps can reuse the same value without rebuilding it each time.
  const sessionConfig = {
    // Bind price, customer, return paths, and authenticated ownership in one Stripe request.
    mode: effectiveMode,
    // I am keeping the `customer` field in this object so the receiving code can read that value by its expected name.
    customer: customerId,
    // I am keeping the `line_items` field in this object so the receiving code can read that value by its expected name.
    line_items: [{ price: trimmedPriceId, quantity }],
    // I am keeping the `allow_promotion_codes` field in this object so the receiving code can read that value by its expected name.
    allow_promotion_codes: true,
    // I am keeping the `billing_address_collection` field in this object so the receiving code can read that value by its expected name.
    billing_address_collection: 'auto',
    // I am keeping the `success_url` field in this object so the receiving code can read that value by its expected name.
    success_url: successUrl,
    // I am keeping the `cancel_url` field in this object so the receiving code can read that value by its expected name.
    cancel_url: cancelUrl,
    // I am keeping the `client_reference_id` field in this object so the receiving code can read that value by its expected name.
    client_reference_id: user.id,
    // I am keeping the `metadata` field in this object so the receiving code can read that value by its expected name.
    metadata: { user_id: user.id, product_key: productKey, price_id: trimmedPriceId, request_id: requestId || '' }
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  };

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (effectiveMode === 'payment') {
    // Save payment method eligibility for later off-session use without collecting card data here.
    sessionConfig.payment_intent_data = { setup_future_usage: 'off_session' };
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am calling this helper here so the current workflow performs this step before it moves on.
  logger.debug({ event: 'checkout.session.config', requestId, successUrl, cancelUrl, mode: effectiveMode }, 'Creating Stripe checkout session');

  // I am saving `session` here so the nearby steps can reuse the same value without rebuilding it each time.
  const session = await stripe.checkout.sessions.create(
    // Forward the route's idempotency key so retries cannot create a second Checkout Session.
    sessionConfig,
    // I am keeping this line here because the surrounding billingService.js workflow expects this value or operation before it continues.
    idempotencyKey ? { idempotencyKey } : undefined
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  );

  // I am calling this helper here so the current workflow performs this step before it moves on.
  logger.info({
    // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
    event: 'checkout.session.created', requestId, sessionId: session.id, mode: effectiveMode, productKey, userId: user.id
  // I am keeping this line here because the surrounding billingService.js workflow expects this value or operation before it continues.
  }, `Checkout session created (mode: ${effectiveMode})`);

  // This return sends the completed value or response back to the code that called this function.
  return session;
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `upsertPaymentFromSession` as a named asynchronous helper so the surrounding workflow can call this step when it needs it.
async function upsertPaymentFromSession(session, statusOverride) {
  // Webhooks and confirmation-page reads may see the same payment. Upserting on the
  // Checkout Session ID makes both paths safe to repeat without duplicate payment rows.
  const pi = session.payment_intent;
  // I am saving `sId` here so the nearby steps can reuse the same value without rebuilding it each time.
  const sId = session.id;
  // I am saving `amount` here so the nearby steps can reuse the same value without rebuilding it each time.
  const amount = session.amount_total ?? 0;
  // I am saving `currency` here so the nearby steps can reuse the same value without rebuilding it each time.
  const currency = session.currency ?? 'usd';
  // I am saving `productKey` here so the nearby steps can reuse the same value without rebuilding it each time.
  const productKey = session.metadata?.product_key || 'unknown';
  // I am saving `userId` here so the nearby steps can reuse the same value without rebuilding it each time.
  const userId = session.metadata?.user_id || null;
  // I am saving `priceId` here so the nearby steps can reuse the same value without rebuilding it each time.
  const priceId = session.metadata?.price_id || null;
  // I am saving `status` here so the nearby steps can reuse the same value without rebuilding it each time.
  const status = statusOverride || (session.payment_status === 'paid' ? 'paid' : 'requires_payment');

  // Refuse an incomplete Stripe object before it can become a misleading local payment row.
  if (!userId || !priceId || !amount || !currency || !productKey) {
    // I am saving `err` here so the nearby steps can reuse the same value without rebuilding it each time.
    const err = new Error('Missing required fields for payment upsert');
    // I am keeping this line here because the surrounding billingService.js workflow expects this value or operation before it continues.
    err.details = { userId, priceId, amount, currency, productKey, sessionId: sId };
    // I am stopping this path with the existing error here because the caller should not continue with an invalid result.
    throw err;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am saving `row` here so the nearby steps can reuse the same value without rebuilding it each time.
  const row = {
    // Keep Stripe identifiers plus the stable app product/user fields needed by receipts.
    user_id: userId,
    // I am keeping the `stripe_checkout_session_id` field in this object so the receiving code can read that value by its expected name.
    stripe_checkout_session_id: sId,
    // I am keeping the `stripe_payment_intent_id` field in this object so the receiving code can read that value by its expected name.
    stripe_payment_intent_id: typeof pi === 'string' ? pi : (pi?.id || null),
    // I am keeping the `price_id` field in this object so the receiving code can read that value by its expected name.
    price_id: priceId,
    // I am keeping the `product_key` field in this object so the receiving code can read that value by its expected name.
    product_key: productKey,
    // I am keeping this line here because the surrounding billingService.js workflow expects this value or operation before it continues.
    amount,
    // I am keeping this line here because the surrounding billingService.js workflow expects this value or operation before it continues.
    currency,
    // I am keeping this line here because the surrounding billingService.js workflow expects this value or operation before it continues.
    status,
    // I am keeping the `metadata` field in this object so the receiving code can read that value by its expected name.
    metadata: session.metadata || {}
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  };

  // I am saving `error` here so the nearby steps can reuse the same value without rebuilding it each time.
  const { error } = await supabaseAdmin
    // Confirmation reads and webhooks converge on the same Checkout Session row.
    .from('payments')
    // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
    .upsert(row, { onConflict: 'stripe_checkout_session_id' });

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (error) throw error;
  // This return sends the completed value or response back to the code that called this function.
  return true;
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `upsertRefundStatus` as a named asynchronous helper so the surrounding workflow can call this step when it needs it.
async function upsertRefundStatus(charge, isFullRefund) {
  // Stripe may expand payment_intent into an object or leave it as an ID string.
  const paymentIntentId = typeof charge.payment_intent === 'string'
    // I am keeping this line here because the surrounding billingService.js workflow expects this value or operation before it continues.
    ? charge.payment_intent
    // I am keeping this line here because the surrounding billingService.js workflow expects this value or operation before it continues.
    : charge.payment_intent?.id;

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!paymentIntentId) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.warn({ event: 'refund.no_payment_intent', chargeId: charge.id }, 'Refund charge missing payment_intent_id');
    // This return sends the completed value or response back to the code that called this function.
    return;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am saving `status` here so the nearby steps can reuse the same value without rebuilding it each time.
  const status = isFullRefund ? 'refunded' : 'partially_refunded';

  // Match the payment created from the original Checkout Session by its PaymentIntent ID.
  const { error } = await supabaseAdmin
    // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
    .from('payments')
    // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
    .update({ status, updated_at: new Date().toISOString() })
    // I am continuing the existing call chain here so this option stays attached to the same operation started above.
    .eq('stripe_payment_intent_id', paymentIntentId);

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (error) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.error({ 
      // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
      event: 'refund.update_failed', 
      // I am keeping this line here because the surrounding billingService.js workflow expects this value or operation before it continues.
      paymentIntentId
      // Removed: error: error.message (security: could leak database schema details)
    });
    // I am stopping this path with the existing error here because the caller should not continue with an invalid result.
    throw error;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
  // This return sends the completed value or response back to the code that called this function.
  return true;
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am exporting this value here so another module can deliberately reuse the completed piece from billingService.js.
module.exports = {
  // I am keeping this line here because the surrounding billingService.js workflow expects this value or operation before it continues.
  createCheckoutSession,
  // I am keeping this line here because the surrounding billingService.js workflow expects this value or operation before it continues.
  upsertPaymentFromSession,
  // I am keeping this line here because the surrounding billingService.js workflow expects this value or operation before it continues.
  upsertRefundStatus,
  // I am keeping this line here because the surrounding billingService.js workflow expects this value or operation before it continues.
  productKeyForPrice
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
};