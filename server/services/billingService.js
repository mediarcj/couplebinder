// Description: Stripe billing service with customer management and checkout sessions
// Purpose: Handle Stripe payments, customer creation, and payment tracking
// Notes: Backend is the source of truth; no card data stored here.

'use strict';

/**
 * Stripe billing service that handles customer creation, checkout sessions, and payment tracking.
 *
 * We need secure payments without touching card data. Stripe is PCI compliant.
 *
 * 1) Create/retrieve Stripe customers mapped to user IDs
 * 2) Generate secure checkout sessions using an allowlist of active prices
 * 3) Track payment status in DB (webhook is the source of truth; we also upsert on reads)
 * 4) Use idempotency keys to avoid duplicate charges
 */

const Stripe = require('stripe');
const logger = require('../utils/logger');
const { supabaseAdmin } = require('../utils/supabaseClient');
const { config } = require('../config');

// Prefer the active stripe block; fallback to legacy flat fields for back-compat
function pickStripeCfg() {
  // Prefer the selected live/test block, while retaining flat config for older deployments.
  const base = config?.stripe || {};
  return (base.active && (base.active.secretKey || base.active.priceResumeOneTime || base.active.priceResumeExpert))
    ? base.active
    : base;
}

const sCfg = pickStripeCfg();
// Fail at service startup instead of waiting for a checkout request to discover missing Stripe.
const SECRET_KEY = String(config?.stripe?.active?.secretKey || config?.stripe?.secretKey || '').trim();
if (!SECRET_KEY) {
  throw new Error('Stripe secret key missing in config (expected config.stripe.active.secretKey or config.stripe.secretKey)');
}

const stripe = new Stripe(SECRET_KEY, { apiVersion: config.stripe.apiVersion });

// Live/test detection based on the secret prefix
const IS_LIVE = SECRET_KEY.startsWith('sk_live_');

// Price allowlist from the effective config (active preferred, flat as fallback)
const ACTIVE_PRICES = Object.freeze({
  // The browser sends a product choice, but checkout is created only from this server-side
  // allowlist so a caller cannot substitute an arbitrary Stripe price ID.
  [String(sCfg.priceResumeOneTime || '').trim()]: {
    type: 'one_time',
    mode: 'payment',
    productKey: 'resume_one_time'
  },
  [String(sCfg.priceResumeExpert || '').trim()]: {
    type: 'one_time',
    mode: 'payment',
    productKey: 'resume_expert'
  }
});
const ALLOWED_PRICE_IDS = new Set(Object.keys(ACTIVE_PRICES).filter(Boolean));

function productKeyForPrice(priceId) {
  // Webhook/payment rows use this stable internal key rather than a mode-specific Stripe ID.
  return ACTIVE_PRICES[priceId]?.productKey || 'unknown';
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
    .select(`user_id, ${column}, stripe_customer_id`)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  // Reuse the mode-specific customer before creating anything at Stripe.
  if (row?.[column]) return row[column];

  // The authenticated app user becomes metadata for later Stripe-side support/debugging.
  const customer = await stripe.customers.create({
    email: email || undefined,
    metadata: { user_id: userId, env: IS_LIVE ? 'live' : 'test' }
  });

  const upsert = { user_id: userId, email: email || null, [column]: customer.id };
  // Fill the legacy column only once so existing readers keep working during migration.
  if (!row?.stripe_customer_id) upsert.stripe_customer_id = customer.id; // back-compat

  const { error: insErr } = await supabaseAdmin
    .from('billing_customers')
    .upsert(upsert, { onConflict: 'user_id' });

  if (insErr) throw insErr;
  return customer.id;
}

async function createCheckoutSession({ user, priceId, quantity = 1, idempotencyKey, requestId }) {
  // This is the main checkout boundary: validate the configured price, bind the Stripe
  // session to the authenticated user, and return only Stripe's hosted checkout session.
  const trimmedPriceId = String(priceId || '').trim();

  // Allowlist check
  const priceCfg = ACTIVE_PRICES[trimmedPriceId];
  if (!priceCfg || !ALLOWED_PRICE_IDS.has(trimmedPriceId)) {
    logger.error({ event: 'checkout.session.error', requestId, priceId: trimmedPriceId }, 'Price not allowed');
    const err = new Error('Price not allowed');
    err.status = 400;
    throw err;
  }

  const customerId = await getOrCreateStripeCustomer(user.id, user.email);
  // Start from the server allowlist, then compare it with Stripe's current price object below.
  let effectiveMode = priceCfg.mode; // default 'payment'
  const productKey = priceCfg.productKey;

  // Validate against Stripe (tolerant)
  try {
    // This lookup confirms whether Stripe currently treats the allowed price as recurring.
    const price = await stripe.prices.retrieve(trimmedPriceId);
    const stripeMode = price?.recurring ? 'subscription' : 'payment';
    if (stripeMode !== effectiveMode) {
      logger.warn({
        event: 'price.mode.mismatch',
        requestId, priceId: trimmedPriceId, expected: effectiveMode, stripeMode
      }, 'Mode mismatch; using Stripe mode');
      effectiveMode = stripeMode;
    }
  } catch (err) {
    logger.warn({
      event: 'price.lookup.failed', 
      requestId, 
      priceId: trimmedPriceId
      // The allowlisted price ID identifies this fallback without exposing provider details.
    }, 'Could not verify price; proceeding with allowlisted mode');
  }

  if (!config.publicOrigin || !config.publicOrigin.trim()) {
    // Checkout redirects must use one explicit public origin; request headers are not trusted here.
    logger.error({
      event: 'checkout.config.missing_public_origin', requestId, publicOrigin: config.publicOrigin
    }, 'publicOrigin is missing or empty');
    const err = new Error('Server configuration error: publicOrigin not set');
    err.status = 500;
    throw err;
  }

  // URL building: use config.stripe.successPath/cancelPath only (no process.env fallbacks)
  const baseUrl = config.publicOrigin.replace(/\/+$/, '');
  // Paths may be relative defaults or explicit absolute destinations from central config.
  const rawSuccessPath = config?.stripe?.successPath || '/dashboard/purchase/confirmation';
  const rawCancelPath = config?.stripe?.cancelPath || '/dashboard/billing';

  const isFullUrl = (u) => { try { const x = new URL(u); return x.protocol === 'http:' || x.protocol === 'https:'; } catch { return false; } };
  const normPath = (p) => (p ? (isFullUrl(p) ? p : (p.startsWith('/') ? p : `/${p}`)) : '');

  const successPath = normPath(rawSuccessPath);
  const cancelPath  = normPath(rawCancelPath);

  // Stripe replaces the literal session placeholder after a successful hosted checkout.
  const successUrl = isFullUrl(successPath)
    ? `${successPath}${successPath.includes('?') ? '&' : '?'}session_id={CHECKOUT_SESSION_ID}`
    : `${baseUrl}${successPath}?session_id={CHECKOUT_SESSION_ID}`;

  const cancelUrl = isFullUrl(cancelPath)
    ? `${cancelPath}${cancelPath.includes('?') ? '&' : '?'}canceled=1`
    : `${baseUrl}${cancelPath}?canceled=1`;

  try {
    // Substitute a sample session ID only for URL parsing; keep Stripe's placeholder in config.
    new URL(successUrl.replace('{CHECKOUT_SESSION_ID}', 'test_session_id'));
    new URL(cancelUrl);
  } catch (e) {
    logger.error({ 
      event: 'checkout.url.invalid', 
      requestId, 
      successUrl, 
      cancelUrl
      // The configured URLs are enough context; the parser error could expose deployment details.
    }, 'Generated checkout URLs are invalid');
    const err = new Error('Invalid checkout URL configuration');
    err.status = 500;
    throw err;
  }

  const sessionConfig = {
    // Bind price, customer, return paths, and authenticated ownership in one Stripe request.
    mode: effectiveMode,
    customer: customerId,
    line_items: [{ price: trimmedPriceId, quantity }],
    allow_promotion_codes: true,
    billing_address_collection: 'auto',
    success_url: successUrl,
    cancel_url: cancelUrl,
    client_reference_id: user.id,
    metadata: { user_id: user.id, product_key: productKey, price_id: trimmedPriceId, request_id: requestId || '' }
  };

  if (effectiveMode === 'payment') {
    // Save payment method eligibility for later off-session use without collecting card data here.
    sessionConfig.payment_intent_data = { setup_future_usage: 'off_session' };
  }

  logger.debug({ event: 'checkout.session.config', requestId, successUrl, cancelUrl, mode: effectiveMode }, 'Creating Stripe checkout session');

  const session = await stripe.checkout.sessions.create(
    // Forward the route's idempotency key so retries cannot create a second Checkout Session.
    sessionConfig,
    idempotencyKey ? { idempotencyKey } : undefined
  );

  logger.info({
    event: 'checkout.session.created', requestId, sessionId: session.id, mode: effectiveMode, productKey, userId: user.id
  }, `Checkout session created (mode: ${effectiveMode})`);

  return session;
}

async function upsertPaymentFromSession(session, statusOverride) {
  // Webhooks and confirmation-page reads may see the same payment. Upserting on the
  // Checkout Session ID makes both paths safe to repeat without duplicate payment rows.
  const pi = session.payment_intent;
  const sId = session.id;
  const amount = session.amount_total ?? 0;
  const currency = session.currency ?? 'usd';
  const productKey = session.metadata?.product_key || 'unknown';
  const userId = session.metadata?.user_id || null;
  const priceId = session.metadata?.price_id || null;
  const status = statusOverride || (session.payment_status === 'paid' ? 'paid' : 'requires_payment');

  // Refuse an incomplete Stripe object before it can become a misleading local payment row.
  if (!userId || !priceId || !amount || !currency || !productKey) {
    const err = new Error('Missing required fields for payment upsert');
    err.details = { userId, priceId, amount, currency, productKey, sessionId: sId };
    throw err;
  }

  const row = {
    // Keep Stripe identifiers plus the stable app product/user fields needed by receipts.
    user_id: userId,
    stripe_checkout_session_id: sId,
    stripe_payment_intent_id: typeof pi === 'string' ? pi : (pi?.id || null),
    price_id: priceId,
    product_key: productKey,
    amount,
    currency,
    status,
    metadata: session.metadata || {}
  };

  const { error } = await supabaseAdmin
    // Confirmation reads and webhooks converge on the same Checkout Session row.
    .from('payments')
    .upsert(row, { onConflict: 'stripe_checkout_session_id' });

  if (error) throw error;
  return true;
}

async function upsertRefundStatus(charge, isFullRefund) {
  // Stripe may expand payment_intent into an object or leave it as an ID string.
  const paymentIntentId = typeof charge.payment_intent === 'string'
    ? charge.payment_intent
    : charge.payment_intent?.id;

  if (!paymentIntentId) {
    logger.warn({ event: 'refund.no_payment_intent', chargeId: charge.id }, 'Refund charge missing payment_intent_id');
    return;
  }

  const status = isFullRefund ? 'refunded' : 'partially_refunded';

  // Match the payment created from the original Checkout Session by its PaymentIntent ID.
  const { error } = await supabaseAdmin
    .from('payments')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('stripe_payment_intent_id', paymentIntentId);

  if (error) {
    logger.error({ 
      event: 'refund.update_failed', 
      paymentIntentId
      // Keep database error text out of payment logs while retaining the Stripe lookup key.
    });
    throw error;
  }
  return true;
}

module.exports = {
  createCheckoutSession,
  upsertPaymentFromSession,
  upsertRefundStatus,
  productKeyForPrice
};
