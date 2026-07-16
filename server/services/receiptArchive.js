// File: server/services/receiptArchive.js
// Description: Receipt archival service for payments table
// Purpose: Store receipt snapshots in payments table for operational history
// Notes: Backend is source of truth, Stripe remains authoritative

'use strict';

// I am loading `crypto` into `crypto` so this file can reuse that dependency below.
const crypto = require('crypto');
// I am loading `../config` into `config` so this file can reuse that dependency below.
const { config } = require('../config');
// I am loading `../utils/supabaseClient` into `supabaseAdmin` so this file can reuse that dependency below.
const { supabaseAdmin } = require('../utils/supabaseClient');
// I am loading `../utils/logger` into `logger` so this file can reuse that dependency below.
const logger = require('../utils/logger');

// I am keeping `sha256` as a named helper so the surrounding workflow can call this step when it needs it.
function sha256(s) {
  // This return sends the completed value or response back to the code that called this function.
  return crypto.createHash('sha256').update(s).digest('hex');
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `toSnapshot` as a named helper so the surrounding workflow can call this step when it needs it.
function toSnapshot(receipt) {
  // Keep the archived shape small and stable instead of persisting the full Stripe
  // response, which can change and may contain fields the receipt UI does not need.
  const {
    // I am keeping this line here because the surrounding receiptArchive.js workflow expects this value or operation before it continues.
    session_id, sessionId,
    // I am keeping this line here because the surrounding receiptArchive.js workflow expects this value or operation before it continues.
    payment_intent_id, invoice_id, customer_id,
    // I am keeping this line here because the surrounding receiptArchive.js workflow expects this value or operation before it continues.
    amount_total, currency, payment_status, product_key,
    // I am keeping this line here because the surrounding receiptArchive.js workflow expects this value or operation before it continues.
    items, stripe_receipt_url, created_ms,
    // I am keeping this line here because the surrounding receiptArchive.js workflow expects this value or operation before it continues.
    card_brand, card_last4,
  // I am keeping this line here because the surrounding receiptArchive.js workflow expects this value or operation before it continues.
  } = receipt;
  
  // This return sends the completed value or response back to the code that called this function.
  return {
    // I am keeping the `session_id` field in this object so the receiving code can read that value by its expected name.
    session_id: session_id || sessionId || null,
    // I am keeping the `payment_intent_id` field in this object so the receiving code can read that value by its expected name.
    payment_intent_id: payment_intent_id || null,
    // I am keeping the `invoice_id` field in this object so the receiving code can read that value by its expected name.
    invoice_id: invoice_id || null,
    // I am keeping the `customer_id` field in this object so the receiving code can read that value by its expected name.
    customer_id: customer_id || null,
    // I am keeping the `product_key` field in this object so the receiving code can read that value by its expected name.
    product_key: product_key || null,
    // I am keeping this line here because the surrounding receiptArchive.js workflow expects this value or operation before it continues.
    amount_total, currency, payment_status,
    // I am keeping the `items` field in this object so the receiving code can read that value by its expected name.
    items: items || [],
    // I am keeping the `stripe_receipt_url` field in this object so the receiving code can read that value by its expected name.
    stripe_receipt_url: stripe_receipt_url || null,
    // I am keeping this line here because the surrounding receiptArchive.js workflow expects this value or operation before it continues.
    created_ms,
    // I am keeping the `card_brand` field in this object so the receiving code can read that value by its expected name.
    card_brand: card_brand || null,
    // I am keeping the `card_last4` field in this object so the receiving code can read that value by its expected name.
    card_last4: card_last4 || null
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  };
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `archiveReceiptSnapshot` as a named asynchronous helper so the surrounding workflow can call this step when it needs it.
async function archiveReceiptSnapshot({ userId, receipt }) {
  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // I am saving `snapshot` here so the nearby steps can reuse the same value without rebuilding it each time.
    const snapshot = toSnapshot(receipt);
    // The digest is an integrity aid for the stored snapshot, not a replacement for
    // Stripe as the payment authority.
    const digest = sha256(JSON.stringify(snapshot));
    // I am saving `table` here so the nearby steps can reuse the same value without rebuilding it each time.
    const table = config?.features?.archiveReceiptsTable || 'payments';

    // Existing deployments keep snapshots beside the payment row. The alternate branch
    // supports deployments that opted into a dedicated receipt-history table.
    if (table === 'payments') {
      // I am saving `updates` here so the nearby steps can reuse the same value without rebuilding it each time.
      const updates = {
        // I am keeping the `receipt_url` field in this object so the receiving code can read that value by its expected name.
        receipt_url: snapshot.stripe_receipt_url,
        // I am keeping the `snapshot_json` field in this object so the receiving code can read that value by its expected name.
        snapshot_json: snapshot,
        // I am keeping the `snapshot_sha256` field in this object so the receiving code can read that value by its expected name.
        snapshot_sha256: digest,
        // I am keeping the `created_ms` field in this object so the receiving code can read that value by its expected name.
        created_ms: snapshot.created_ms
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      };

      // I am saving `error` here so the nearby steps can reuse the same value without rebuilding it each time.
      const { error, data } = await supabaseAdmin
        // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
        .from('payments')
        // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
        .update(updates)
        // I am continuing the existing call chain here so this option stays attached to the same operation started above.
        .eq('stripe_checkout_session_id', snapshot.session_id);

      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (error) {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        logger.error({ event: 'receipt.archive.update_error', sessionId: snapshot.session_id, error: error.message }, 'Failed to update payments with receipt snapshot');
        // This return sends the completed value or response back to the code that called this function.
        return Promise.reject(error);
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }

      // I am calling this helper here so the current workflow performs this step before it moves on.
      logger.info({ event: 'receipt.archive.updated', sessionId: snapshot.session_id, userId }, 'Receipt snapshot archived to payments table');
      // This return sends the completed value or response back to the code that called this function.
      return { data };
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // Dedicated table path
    const row = {
      // I am keeping the `user_id` field in this object so the receiving code can read that value by its expected name.
      user_id: userId,
      // I am keeping the `stripe_session_id` field in this object so the receiving code can read that value by its expected name.
      stripe_session_id: snapshot.session_id,
      // I am keeping the `stripe_payment_intent_id` field in this object so the receiving code can read that value by its expected name.
      stripe_payment_intent_id: snapshot.payment_intent_id,
      // I am keeping the `stripe_invoice_id` field in this object so the receiving code can read that value by its expected name.
      stripe_invoice_id: snapshot.invoice_id,
      // I am keeping the `stripe_customer_id` field in this object so the receiving code can read that value by its expected name.
      stripe_customer_id: snapshot.customer_id,
      // I am keeping the `product_key` field in this object so the receiving code can read that value by its expected name.
      product_key: snapshot.product_key,
      // I am keeping the `amount_total` field in this object so the receiving code can read that value by its expected name.
      amount_total: snapshot.amount_total,
      // I am keeping the `currency` field in this object so the receiving code can read that value by its expected name.
      currency: snapshot.currency,
      // I am keeping the `payment_status` field in this object so the receiving code can read that value by its expected name.
      payment_status: snapshot.payment_status,
      // I am keeping the `receipt_url` field in this object so the receiving code can read that value by its expected name.
      receipt_url: snapshot.stripe_receipt_url,
      // I am keeping the `items` field in this object so the receiving code can read that value by its expected name.
      items: snapshot.items,
      // I am keeping the `created_ms` field in this object so the receiving code can read that value by its expected name.
      created_ms: snapshot.created_ms,
      // I am keeping the `snapshot_json` field in this object so the receiving code can read that value by its expected name.
      snapshot_json: snapshot,
      // I am keeping the `snapshot_sha256` field in this object so the receiving code can read that value by its expected name.
      snapshot_sha256: digest,
      // I am keeping the `source` field in this object so the receiving code can read that value by its expected name.
      source: 'ui'
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    };

    // I am saving `error` here so the nearby steps can reuse the same value without rebuilding it each time.
    const { error, data } = await supabaseAdmin
      // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
      .from('payment_receipts')
      // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
      .upsert(row, { onConflict: 'stripe_session_id' });

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (error) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      logger.error({ event: 'receipt.archive.upsert_error', sessionId: snapshot.session_id, error: error.message }, 'Failed to upsert receipt snapshot');
      // This return sends the completed value or response back to the code that called this function.
      return Promise.reject(error);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.info({ event: 'receipt.archive.upserted', sessionId: snapshot.session_id, userId }, 'Receipt snapshot archived to payment_receipts table');
    // This return sends the completed value or response back to the code that called this function.
    return { data };
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (err) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.error({ event: 'receipt.archive.error', error: err.message }, 'Receipt archival failed');
    // I am stopping this path with the existing error here because the caller should not continue with an invalid result.
    throw err;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am exporting this value here so another module can deliberately reuse the completed piece from receiptArchive.js.
module.exports = { archiveReceiptSnapshot };