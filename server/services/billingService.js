// File: server/services/billingService.js
// Description: Stripe billing service with customer management and checkout sessions
// Purpose: Handle Stripe payments, customer creation, and payment tracking
// Notes: Follows Building Laws: backend is source of truth, no card data storage

/**
 * WHAT:
 * Stripe billing service that handles customer creation, checkout sessions, and payment tracking.
 * 
 * WHY:
 * Need secure payment processing without storing sensitive card data.
 * Stripe handles PCI compliance and payment method storage.
 * 
 * HOW:
 * 1. Create/retrieve Stripe customers mapped to user IDs
 * 2. Generate secure checkout sessions with allowed price IDs only
 * 3. Track payment status in database for audit and user history
 * 4. Use idempotency keys to prevent duplicate charges
 */

const Stripe = require('stripe');
const logger = require('../utils/logger');
const { supabaseAdmin } = require('../utils/supabaseClient');
const { config } = require('../config');

const stripe = new Stripe(config.stripe.secretKey, {
  apiVersion: '2025-09-30.clover'
});

// Price configuration: maps price IDs to their expected mode and product key
const ALLOWED_PRICES = Object.freeze({
  [config.stripe.priceResumeOneTime]: { 
    type: 'one_time', 
    mode: 'payment', 
    productKey: 'resume_one_time' 
  },
  [config.stripe.priceResumeExpert]: { 
    type: 'one_time', 
    mode: 'payment', 
    productKey: 'resume_expert' 
  }
});

// Legacy Set for backward compatibility (use ALLOWED_PRICES going forward)
const ALLOWED_PRICE_IDS = new Set(Object.keys(ALLOWED_PRICES).filter(Boolean));

/**
 * WHAT:
 * Map Stripe price ID to internal product key for tracking.
 * 
 * WHY:
 * Need consistent product identification across systems.
 * 
 * HOW:
 * Use ALLOWED_PRICES configuration to get product key.
 */
function productKeyForPrice(priceId) {
  return ALLOWED_PRICES[priceId]?.productKey || 'unknown';
}

/**
 * WHAT:
 * Get or create Stripe customer for user, storing mapping in database.
 * 
 * WHY:
 * Stripe requires customer objects for checkout sessions.
 * Need to track customer relationships for billing history.
 * 
 * HOW:
 * 1. Check database for existing customer ID
 * 2. Create Stripe customer if not found
 * 3. Store mapping in billing_customers table
 * 4. Return customer ID for checkout session
 */
async function getOrCreateStripeCustomer(userId, email) {
  const isLive = config.stripe.secretKey?.startsWith('sk_live_');
  const col = isLive ? 'stripe_customer_id_live' : 'stripe_customer_id_test';

  // Fetch current row with environment-specific column
  const { data: row, error } = await supabaseAdmin
    .from('billing_customers')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  
  // Return existing customer ID for current environment
  if (row?.[col]) return row[col];

  // Create a customer in the current mode
  const customer = await stripe.customers.create({
    email: email || undefined,
    metadata: { user_id: userId, env: isLive ? 'live' : 'test' }
  });

  // Upsert with environment-specific column
  // Also set stripe_customer_id for backward compatibility if not already set
  const upsert = { 
    user_id: userId, 
    email: email || null, 
    [col]: customer.id 
  };
  
  // If no stripe_customer_id exists, set it from the newly created customer
  if (!row?.stripe_customer_id) {
    upsert.stripe_customer_id = customer.id;
  }
  
  const { error: insErr } = await supabaseAdmin
    .from('billing_customers')
    .upsert(upsert, { onConflict: 'user_id' });

  if (insErr) throw insErr;

  return customer.id;
}

/**
 * WHAT:
 * Create Stripe checkout session for payment processing.
 * 
 * WHY:
 * Secure payment collection without handling card data directly.
 * Stripe Checkout handles PCI compliance and payment method storage.
 * 
 * HOW:
 * 1. Validate price ID against allowlist
 * 2. Get/create Stripe customer
 * 3. Create checkout session with success/cancel URLs
 * 4. Return session URL for redirect
 */
async function createCheckoutSession({ user, priceId, quantity = 1, idempotencyKey, requestId }) {
  const trimmedPriceId = (priceId || '').trim();
  
  // Validate price against allowlist
  const priceConfig = ALLOWED_PRICES[trimmedPriceId];
  if (!priceConfig) {
    logger.error({ 
      event: 'checkout.session.error', 
      requestId, 
      priceId: trimmedPriceId 
    }, 'Price not allowed');
    const err = new Error('Price not allowed');
    err.status = 400;
    throw err;
  }
  
  // Get or create customer for both test and live modes
  const customerId = await getOrCreateStripeCustomer(user.id, user.email);
  
  const productKey = priceConfig.productKey;
  
  // Determine mode based on price configuration
  let effectiveMode = priceConfig.mode;
  
  // Optional: Cross-check with Stripe for additional validation
  try {
    const price = await stripe.prices.retrieve(trimmedPriceId);
    const stripeSaysRecurring = !!price?.recurring;
    const stripeMode = stripeSaysRecurring ? 'subscription' : 'payment';
    
    if (stripeMode !== effectiveMode) {
      logger.warn({ 
        event: 'price.mode.mismatch', 
        requestId, 
        priceId: trimmedPriceId, 
        expected: effectiveMode, 
        stripeMode 
      }, 'Mode mismatch; using Stripe mode');
      effectiveMode = stripeMode; // Use Stripe's mode for resilience
    }
  } catch (err) {
    logger.warn({ 
      event: 'price.lookup.failed', 
      requestId, 
      priceId: trimmedPriceId, 
      error: err.message 
    }, 'Could not verify price; proceeding with allowlisted mode');
  }

  // Validate publicOrigin is set (required for Stripe checkout URLs)
  if (!config.publicOrigin || !config.publicOrigin.trim()) {
    logger.error({ 
      event: 'checkout.config.missing_public_origin', 
      requestId,
      publicOrigin: config.publicOrigin,
      nodeEnv: config.server?.nodeEnv
    }, 'publicOrigin is missing or empty - required for Stripe checkout');
    const err = new Error('Server configuration error: publicOrigin not set');
    err.status = 500;
    throw err;
  }

  // Build URLs
  // The original code used: `${process.env.PUBLIC_ORIGIN}/dashboard/purchase/confirmation?session_id={CHECKOUT_SESSION_ID}`
  // We maintain this behavior for consistency, but allow override via env for flexibility
  const baseUrl = config.publicOrigin.replace(/\/+$/, ''); // Remove trailing slashes
  
  // Use env paths if provided and valid, otherwise use defaults (matching original behavior)
  // Default success path: /dashboard/purchase/confirmation (matches original)
  // Default cancel path: /dashboard/billing (matches original)
  const defaultSuccessPath = '/dashboard/purchase/confirmation';
  const defaultCancelPath = '/dashboard/billing';
  
  // Check if env paths are full URLs (backward compatibility for users who set full URLs)
  const isFullUrl = (path) => {
    if (!path) return false;
    try {
      const url = new URL(path);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  };
  
  let successPath, cancelPath;
  
  if (config.stripe.successPath && !isFullUrl(config.stripe.successPath)) {
    // Use env path if it's a relative path
    successPath = config.stripe.successPath.startsWith('/') 
      ? config.stripe.successPath 
      : `/${config.stripe.successPath}`;
  } else {
    // Use default (original behavior)
    successPath = defaultSuccessPath;
  }
  
  if (config.stripe.cancelPath && !isFullUrl(config.stripe.cancelPath)) {
    // Use env path if it's a relative path
    cancelPath = config.stripe.cancelPath.startsWith('/') 
      ? config.stripe.cancelPath 
      : `/${config.stripe.cancelPath}`;
  } else {
    // Use default (original behavior)
    cancelPath = defaultCancelPath;
  }
  
  // Build final URLs (always absolute, matching original behavior)
  const successUrl = `${baseUrl}${successPath}?session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${baseUrl}${cancelPath}?canceled=1`;

  // Validate URLs are absolute (Stripe requirement)
  // Note: {CHECKOUT_SESSION_ID} is a Stripe placeholder, so we validate with a dummy value
  try {
    const testSuccessUrl = successUrl.replace('{CHECKOUT_SESSION_ID}', 'test_session_id');
    const testCancelUrl = cancelUrl;
    new URL(testSuccessUrl); // Will throw if not valid
    new URL(testCancelUrl);  // Will throw if not valid
  } catch (urlError) {
    logger.error({ 
      event: 'checkout.url.invalid', 
      requestId,
      successUrl,
      cancelUrl,
      publicOrigin: config.publicOrigin,
      error: urlError.message
    }, 'Generated checkout URLs are invalid');
    const err = new Error(`Invalid checkout URL: ${urlError.message}`);
    err.status = 500;
    throw err;
  }

  // Build session config - conditional fields based on mode
  const sessionConfig = {
    mode: effectiveMode,
    customer: customerId,
    line_items: [{ price: trimmedPriceId, quantity }],
    allow_promotion_codes: true,
    billing_address_collection: 'auto',
    success_url: successUrl,
    cancel_url: cancelUrl,
    client_reference_id: user.id,
    metadata: { 
      user_id: user.id, 
      product_key: productKey,
      price_id: trimmedPriceId,
      request_id: requestId || '' 
    }
  };
  
  // Only add payment_intent_data for payment mode (not for subscriptions)
  if (effectiveMode === 'payment') {
    sessionConfig.payment_intent_data = { setup_future_usage: 'off_session' };
  }

  logger.debug({
    event: 'checkout.session.config',
    requestId,
    successUrl,
    cancelUrl,
    publicOrigin: config.publicOrigin,
    mode: effectiveMode
  }, 'Creating Stripe checkout session');

  const session = await stripe.checkout.sessions.create(
    sessionConfig,
    idempotencyKey ? { idempotencyKey } : undefined
  );

  logger.info({
    event: 'checkout.session.created',
    requestId,
    sessionId: session.id,
    mode: effectiveMode,
    productKey,
    userId: user.id
  }, `Checkout session created (mode: ${effectiveMode})`);

  return session;
}

/**
 * WHAT:
 * Update payment record from Stripe webhook session data.
 * 
 * WHY:
 * Need to track payment status for user history and business logic.
 * Webhooks provide authoritative payment status updates.
 * 
 * HOW:
 * 1. Extract payment details from session
 * 2. Upsert payment record in database
 * 3. Handle status overrides for refunds/cancellations
 */
async function upsertPaymentFromSession(session, statusOverride) {
  const pi = session.payment_intent;
  const sId = session.id;
  const amount = session.amount_total ?? 0;
  const currency = session.currency ?? 'usd';
  const productKey = session.metadata?.product_key || 'unknown';
  const userId = session.metadata?.user_id || null;
  const status = statusOverride || (session.payment_status === 'paid' ? 'paid' : 'requires_payment');

  const row = {
    user_id: userId,
    stripe_checkout_session_id: sId,
    stripe_payment_intent_id: typeof pi === 'string' ? pi : (pi?.id || null),
    product_key: productKey,
    amount,
    currency,
    status,
    metadata: session.metadata || {}
  };

  const { error } = await supabaseAdmin
    .from('payments')
    .upsert(row, { onConflict: 'stripe_checkout_session_id' });
  
  if (error) throw error;

  return true;
}

/**
 * WHAT:
 * Update payment status when refund is processed.
 * 
 * WHY:
 * Need to track refunds for customer support and accounting.
 * Full refunds revoke product access, partial refunds don't.
 * 
 * HOW:
 * 1. Find payment by payment_intent_id
 * 2. Update status to 'refunded' or 'partially_refunded'
 * 3. Mark full refunds for access revocation
 */
async function upsertRefundStatus(charge, isFullRefund) {
  const paymentIntentId = typeof charge.payment_intent === 'string' 
    ? charge.payment_intent 
    : charge.payment_intent?.id;

  if (!paymentIntentId) {
    logger.warn({ 
      event: 'refund.no_payment_intent',
      chargeId: charge.id 
    }, 'Refund charge missing payment_intent_id');
    return;
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
      paymentIntentId,
      error: error.message 
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
