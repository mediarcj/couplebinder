// File: server/services/receiptService.js
// Description: Normalize Stripe receipt data for branded display
// Purpose: Provide consistent receipt view-model for checkout sessions
// Notes: Handles both one-time payments and subscription/invoice flows. Uses active Stripe config.

'use strict';

// I am loading `stripe` into `Stripe` so this file can reuse that dependency below.
const Stripe = require('stripe');
// I am loading `../config` into `config` so this file can reuse that dependency below.
const { config } = require('../config');
// I am loading `../utils/logger` into `logger` so this file can reuse that dependency below.
const logger = require('../utils/logger');

// I am keeping `pickStripeSecret` as a named helper so the surrounding workflow can call this step when it needs it.
function pickStripeSecret() {
  // This return sends the completed value or response back to the code that called this function.
  return String(config?.stripe?.active?.secretKey || config?.stripe?.secretKey || '').trim();
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am saving `SECRET_KEY` here so the nearby steps can reuse the same value without rebuilding it each time.
const SECRET_KEY = pickStripeSecret();
// I am saving `stripe` here so the nearby steps can reuse the same value without rebuilding it each time.
const stripe = SECRET_KEY ? new Stripe(SECRET_KEY, { apiVersion: config.stripe.apiVersion }) : null;

// I am keeping `sanitizeReceiptUrl` as a named helper so the surrounding workflow can call this step when it needs it.
function sanitizeReceiptUrl(input) {
  // Only hand the browser an absolute HTTP(S) destination. This keeps malformed or
  // unexpected Stripe data from becoming a script or local navigation URL.
  if (!input) return null;
  // I am saving `s` here so the nearby steps can reuse the same value without rebuilding it each time.
  let s = String(input).trim().replace(/^["']+|["']+$/g, '');
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!/^https?:\/\//i.test(s)) return null;
  // This return sends the completed value or response back to the code that called this function.
  return s;
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * Fetch receipt data for a checkout session
 * @param {string} sessionId - Stripe checkout session ID
 * @param {string} userId - Current user ID for ownership verification
 * @returns {Object} Normalized receipt view-model
 */
async function getReceiptVM({ sessionId, userId }) {
  // Fetch the canonical Stripe session, prove it belongs to the current user, then flatten
  // payment and invoice shapes into one small model the confirmation UI can render.
  if (!stripe || !SECRET_KEY) {
    // I am saving `err` here so the nearby steps can reuse the same value without rebuilding it each time.
    const err = new Error('Stripe configuration missing');
    // I am keeping this line here because the surrounding receiptService.js workflow expects this value or operation before it continues.
    err.status = 500;
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.warn({ event: 'stripe.config.missing', reason: 'secret_key_missing' });
    // I am stopping this path with the existing error here because the caller should not continue with an invalid result.
    throw err;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am saving `EXPAND_SAFE` here so the nearby steps can reuse the same value without rebuilding it each time.
  const EXPAND_SAFE = [
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    'payment_intent.latest_charge',
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    'payment_intent.charges',
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    'invoice.charge',
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    'customer',
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    'line_items'
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  ];

  // I am saving `session` here so the nearby steps can reuse the same value without rebuilding it each time.
  let session;
  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // I am waiting for this asynchronous step here so the next line does not use its result before it is ready.
    session = await stripe.checkout.sessions.retrieve(sessionId, { expand: EXPAND_SAFE });
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (e) {
    // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
    try {
      // I am waiting for this asynchronous step here so the next line does not use its result before it is ready.
      session = await stripe.checkout.sessions.retrieve(sessionId, { expand: EXPAND_SAFE.filter(x => x !== 'line_items') });
    // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
    } catch (e2) {
      // I am keeping this line here because the surrounding receiptService.js workflow expects this value or operation before it continues.
      e2.status = e2.status || 500;
      // I am stopping this path with the existing error here because the caller should not continue with an invalid result.
      throw e2;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am saving `ownerId` here so the nearby steps can reuse the same value without rebuilding it each time.
  const ownerId = session?.metadata?.user_id || session?.client_reference_id || null;
  // A real Stripe session ID is still sensitive data; return not-found when it belongs to
  // another user so the endpoint does not reveal whether that purchase exists.
  if (!ownerId || ownerId !== userId) {
    // I am saving `err` here so the nearby steps can reuse the same value without rebuilding it each time.
    const err = new Error('Not found');
    // I am keeping this line here because the surrounding receiptService.js workflow expects this value or operation before it continues.
    err.status = 404;
    // I am stopping this path with the existing error here because the caller should not continue with an invalid result.
    throw err;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // Collect line items
  const items = [];
  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // I am saving `li` here so the nearby steps can reuse the same value without rebuilding it each time.
    const li = await stripe.checkout.sessions.listLineItems(session.id, {
      // I am keeping the `limit` field in this object so the receiving code can read that value by its expected name.
      limit: 100,
      // I am keeping the `expand` field in this object so the receiving code can read that value by its expected name.
      expand: ['data.price.product']
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
    // I am repeating the next block one item at a time so every value in the existing collection receives the same handling.
    for (const l of li.data) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      items.push({
        // I am keeping the `description` field in this object so the receiving code can read that value by its expected name.
        description: l.description
          // I am keeping this line here because the surrounding receiptService.js workflow expects this value or operation before it continues.
          || l.price?.product?.name
          // I am keeping this line here because the surrounding receiptService.js workflow expects this value or operation before it continues.
          || l.price?.nickname
          // I am keeping this line here because the surrounding receiptService.js workflow expects this value or operation before it continues.
          || (typeof l.price?.product === 'string' ? l.price.product : null)
          // I am keeping this line here because the surrounding receiptService.js workflow expects this value or operation before it continues.
          || 'Item',
        // I am keeping the `quantity` field in this object so the receiving code can read that value by its expected name.
        quantity: l.quantity || 1,
        // I am keeping the `amount_subtotal` field in this object so the receiving code can read that value by its expected name.
        amount_subtotal: l.amount_subtotal,
        // I am keeping the `amount_total` field in this object so the receiving code can read that value by its expected name.
        amount_total: l.amount_total,
        // I am keeping the `currency` field in this object so the receiving code can read that value by its expected name.
        currency: l.currency || session.currency,
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      });
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (err) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.warn({ 
      // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
      event: 'receipt.line_items.fetch_failed', 
      // I am keeping the `session_id` field in this object so the receiving code can read that value by its expected name.
      session_id: sessionId
      // Removed: error: err.message (security: could leak Stripe API details)
    });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am saving `firstLineItem` here so the nearby steps can reuse the same value without rebuilding it each time.
  const firstLineItem = items[0] || session?.line_items?.data?.[0] || null;
  // I am saving `productName` here so the nearby steps can reuse the same value without rebuilding it each time.
  const productName =
    // I am keeping this line here because the surrounding receiptService.js workflow expects this value or operation before it continues.
    firstLineItem?.description
    // I am keeping this line here because the surrounding receiptService.js workflow expects this value or operation before it continues.
    || firstLineItem?.price?.product?.name
    // I am keeping this line here because the surrounding receiptService.js workflow expects this value or operation before it continues.
    || firstLineItem?.price?.nickname
    // I am keeping this line here because the surrounding receiptService.js workflow expects this value or operation before it continues.
    || session?.metadata?.product_label
    // I am keeping this line here because the surrounding receiptService.js workflow expects this value or operation before it continues.
    || session?.metadata?.product_key
    // I am keeping this line here because the surrounding receiptService.js workflow expects this value or operation before it continues.
    || null;

  // I am saving `pi` here so the nearby steps can reuse the same value without rebuilding it each time.
  const pi = session.payment_intent || null;
  // I am saving `latestCharge` here so the nearby steps can reuse the same value without rebuilding it each time.
  const latestCharge = (pi && typeof pi.latest_charge !== 'string') ? pi.latest_charge : null;
  // I am saving `firstCharge` here so the nearby steps can reuse the same value without rebuilding it each time.
  const firstCharge = pi?.charges?.data?.[0] || null;
  // I am saving `paidAtUnix` here so the nearby steps can reuse the same value without rebuilding it each time.
  const paidAtUnix = latestCharge?.created
    // I am keeping this line here because the surrounding receiptService.js workflow expects this value or operation before it continues.
    || firstCharge?.created
    // I am keeping this line here because the surrounding receiptService.js workflow expects this value or operation before it continues.
    || (typeof pi?.created === 'number' ? pi.created : null)
    // I am keeping this line here because the surrounding receiptService.js workflow expects this value or operation before it continues.
    || session.created;
  // I am saving `paidAtIso` here so the nearby steps can reuse the same value without rebuilding it each time.
  const paidAtIso = new Date((paidAtUnix || Math.floor(Date.now() / 1000)) * 1000).toISOString();

  // I am saving `rawUrl` here so the nearby steps can reuse the same value without rebuilding it each time.
  const rawUrl = latestCharge?.receipt_url || firstCharge?.receipt_url || null;
  // I am saving `receiptUrl` here so the nearby steps can reuse the same value without rebuilding it each time.
  const receiptUrl = sanitizeReceiptUrl(rawUrl);
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (rawUrl && rawUrl !== receiptUrl) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.info({ event: 'receipt.url.sanitized', session_id: sessionId });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am saving `base` here so the nearby steps can reuse the same value without rebuilding it each time.
  const base = {
    // I am keeping the `session_id` field in this object so the receiving code can read that value by its expected name.
    session_id: session.id,
    // I am keeping the `created_ms` field in this object so the receiving code can read that value by its expected name.
    created_ms: (session.created || 0) * 1000,
    // I am keeping the `currency` field in this object so the receiving code can read that value by its expected name.
    currency: session.currency,
    // I am keeping the `amount_total` field in this object so the receiving code can read that value by its expected name.
    amount_total: session.amount_total,
    payment_status: session.payment_status, // paid | unpaid | no_payment_required
    // I am keeping the `customer_email` field in this object so the receiving code can read that value by its expected name.
    customer_email: session.customer_details?.email || null,
    // I am keeping the `customer_name` field in this object so the receiving code can read that value by its expected name.
    customer_name: session.customer_details?.name || null,
    // I am keeping this line here because the surrounding receiptService.js workflow expects this value or operation before it continues.
    items,
    // I am keeping the `product_label` field in this object so the receiving code can read that value by its expected name.
    product_label: productName,
    // I am keeping the `product_key` field in this object so the receiving code can read that value by its expected name.
    product_key: session?.metadata?.product_key || null,
    // I am keeping the `paid_at_iso` field in this object so the receiving code can read that value by its expected name.
    paid_at_iso: paidAtIso,
    // I am keeping the `official_receipt_url` field in this object so the receiving code can read that value by its expected name.
    official_receipt_url: receiptUrl,
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  };

  // Invoice/subscription path
  if (session.mode === 'subscription' || session.invoice) {
    // I am saving `invoice` here so the nearby steps can reuse the same value without rebuilding it each time.
    const invoice = session.invoice || null;
    // I am saving `hosted_url` here so the nearby steps can reuse the same value without rebuilding it each time.
    const hosted_url = invoice?.hosted_invoice_url || null;
    // I am saving `charge` here so the nearby steps can reuse the same value without rebuilding it each time.
    const charge = invoice?.charge || null;
    // I am saving `pm` here so the nearby steps can reuse the same value without rebuilding it each time.
    const pm = charge?.payment_method_details?.card || {};
    // This return sends the completed value or response back to the code that called this function.
    return {
      // I am keeping this line here because the surrounding receiptService.js workflow expects this value or operation before it continues.
      ...base,
      // I am keeping the `type` field in this object so the receiving code can read that value by its expected name.
      type: 'invoice',
      // I am keeping the `invoice_number` field in this object so the receiving code can read that value by its expected name.
      invoice_number: invoice?.number || null,
      // I am keeping the `hosted_invoice_url` field in this object so the receiving code can read that value by its expected name.
      hosted_invoice_url: hosted_url,
      // I am keeping the `stripe_receipt_url` field in this object so the receiving code can read that value by its expected name.
      stripe_receipt_url: sanitizeReceiptUrl(charge?.receipt_url || hosted_url || null),
      // I am keeping the `card_brand` field in this object so the receiving code can read that value by its expected name.
      card_brand: pm?.brand || null,
      // I am keeping the `card_last4` field in this object so the receiving code can read that value by its expected name.
      card_last4: pm?.last4 || null,
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    };
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // One-time payment path
  const charge = (pi && typeof pi.latest_charge === 'object') ? pi.latest_charge : null;
  // I am saving `pm` here so the nearby steps can reuse the same value without rebuilding it each time.
  const pm = charge?.payment_method_details?.card || {};
  // This return sends the completed value or response back to the code that called this function.
  return {
    // I am keeping this line here because the surrounding receiptService.js workflow expects this value or operation before it continues.
    ...base,
    // I am keeping the `type` field in this object so the receiving code can read that value by its expected name.
    type: 'payment',
    // I am keeping the `stripe_receipt_url` field in this object so the receiving code can read that value by its expected name.
    stripe_receipt_url: sanitizeReceiptUrl(charge?.receipt_url || null),
    // I am keeping the `card_brand` field in this object so the receiving code can read that value by its expected name.
    card_brand: pm?.brand || null,
    // I am keeping the `card_last4` field in this object so the receiving code can read that value by its expected name.
    card_last4: pm?.last4 || null,
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  };
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am exporting this value here so another module can deliberately reuse the completed piece from receiptService.js.
module.exports = { getReceiptVM };