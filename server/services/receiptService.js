// File: server/services/receiptService.js
// Description: Normalize Stripe receipt data for branded display
// Purpose: Provide consistent receipt view-model for checkout sessions
// Notes: Handles both one-time payments and subscription/invoice flows

/**
 * WHAT:
 * Fetch a Checkout Session and return a normalized receipt view-model.
 * Ensures the session belongs to the current user.
 * 
 * WHY:
 * Users need a branded receipt page after successful payment.
 * Centralizes receipt data normalization for consistency.
 * 
 * HOW:
 * 1. Retrieve checkout session from Stripe with expanded fields
 * 2. Verify ownership using metadata.user_id
 * 3. Extract line items for display
 * 4. Return normalized receipt data
 */

const Stripe = require('stripe');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });
const logger = require('../utils/logger');

/**
 * Fetch receipt data for a checkout session
 * @param {string} sessionId - Stripe checkout session ID
 * @param {string} userId - Current user ID for ownership verification
 * @returns {Object} Normalized receipt view-model
 */
async function getReceiptVM({ sessionId, userId }) {
  // Expand to avoid multiple round trips
  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: [
      'payment_intent.latest_charge',
      'payment_intent.charges',
      'invoice.charge',
      'customer',
      'line_items.data.price.product'
    ],
  });

  // Authorization: session must belong to the current user
  const ownerId = session?.metadata?.user_id || session?.client_reference_id || null;

  if (!ownerId || ownerId !== userId) {
    const err = new Error('Not found');
    err.status = 404;
    throw err;
  }

  // Line items for display (names/amounts)
  const items = [];
  try {
    const li = await stripe.checkout.sessions.listLineItems(session.id, { limit: 100 });
    for (const l of li.data) {
      items.push({
        description: l.description || l.price?.nickname || l.price?.product || 'Item',
        quantity: l.quantity || 1,
        amount_subtotal: l.amount_subtotal,
        amount_total: l.amount_total,
        currency: l.currency || session.currency,
      });
    }
  } catch (err) {
    // Best-effort; don't fail the page if Stripe omits them in rare cases
    logger.warn({ event: 'receipt.line_items_fetch_failed', sessionId, error: err.message });
  }

  // Extract product name from expanded line items
  const firstLineItem = session?.line_items?.data?.[0] || null;
  const productName = firstLineItem?.price?.product?.name || 
                      firstLineItem?.price?.nickname || 
                      session?.metadata?.product_label || 
                      session?.metadata?.product_key || 
                      null;

  // Extract payment time (prefer charge creation time, fall back to session/PI)
  const pi = session.payment_intent || null;
  const latestCharge = (pi && typeof pi.latest_charge !== 'string') ? pi.latest_charge : null;
  const firstCharge = pi?.charges?.data?.[0] || null;
  const paidAtUnix = latestCharge?.created || 
                     firstCharge?.created || 
                     (typeof pi?.created === 'number' ? pi.created : null) || 
                     session.created;
  const paidAtIso = new Date((paidAtUnix || Math.floor(Date.now()/1000)) * 1000).toISOString();

  // Extract receipt URL
  const receiptUrl = latestCharge?.receipt_url || firstCharge?.receipt_url || null;

  const base = {
    session_id: session.id,
    created_ms: (session.created || 0) * 1000,
    currency: session.currency,
    amount_total: session.amount_total,
    payment_status: session.payment_status, // paid | unpaid | no_payment_required
    customer_email: session.customer_details?.email || null,
    customer_name: session.customer_details?.name || null,
    items,
    // New fields for confirmation page
    product_label: productName,
    product_key: session?.metadata?.product_key || null,
    paid_at_iso: paidAtIso,
    official_receipt_url: receiptUrl,
  };

  // Invoice/subscription path
  if (session.mode === 'subscription' || session.invoice) {
    const invoice = session.invoice || null;
    const hosted_url = invoice?.hosted_invoice_url || null;
    const charge = invoice?.charge || null;
    const pm = charge?.payment_method_details?.card || {};
    return {
      ...base,
      type: 'invoice',
      invoice_number: invoice?.number || null,
      hosted_invoice_url: hosted_url,
      stripe_receipt_url: charge?.receipt_url || hosted_url || null,
      card_brand: pm?.brand || null,
      card_last4: pm?.last4 || null,
    };
  }

  // One-time payment path
  const pi = session.payment_intent || null;
  const charge =
    pi?.latest_charge && typeof pi.latest_charge === 'object'
      ? pi.latest_charge
      : null;
  const pm = charge?.payment_method_details?.card || {};
  return {
    ...base,
    type: 'payment',
    stripe_receipt_url: charge?.receipt_url || null,
    card_brand: pm?.brand || null,
    card_last4: pm?.last4 || null,
  };
}

module.exports = { getReceiptVM };
