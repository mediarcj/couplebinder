// File: server/services/receiptArchive.js
// Description: Receipt archival service for payments table
// Purpose: Store receipt snapshots in payments table for operational history
// Notes: Backend is source of truth, Stripe remains authoritative

/**
 * WHAT:
 * Service to archive receipt snapshots into the payments table.
 * 
 * WHY:
 * Need operational view of receipts for customer support and business analytics.
 * Stripe is authoritative; this is a non-sensitive operational snapshot.
 * 
 * HOW:
 * 1. Extract non-sensitive receipt data (no PANs, minimal PII)
 * 2. Update payments row with receipt snapshot
 * 3. Support configurable table (payments or payment_receipts)
 */

const crypto = require('crypto');
const { config } = require('../config');
const { supabaseAdmin } = require('../utils/supabaseClient');
const logger = require('../utils/logger');

/**
 * WHAT:
 * Generate SHA256 hash of JSON string.
 * 
 * WHY:
 * Need integrity check for receipt snapshot data.
 * 
 * HOW:
 * Use Node.js crypto module.
 */
function sha256(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

/**
 * WHAT:
 * Extract non-sensitive receipt data for archival.
 * 
 * WHY:
 * Store minimal PII, no PANs, focus on operational fields.
 * 
 * HOW:
 * Return object with session ID, amounts, status, items, receipt URL.
 */
function toSnapshot(receipt) {
  const {
    session_id, sessionId,
    payment_intent_id, invoice_id, customer_id,
    amount_total, currency, payment_status, product_key,
    items, stripe_receipt_url, created_ms,
    card_brand, card_last4,
  } = receipt;
  
  return {
    session_id: session_id || sessionId || null,
    payment_intent_id: payment_intent_id || null,
    invoice_id: invoice_id || null,
    customer_id: customer_id || null,
    product_key: product_key || null,
    amount_total, currency, payment_status,
    items: items || [],
    stripe_receipt_url: stripe_receipt_url || null,
    created_ms,
    card_brand: card_brand || null,
    card_last4: card_last4 || null
  };
}

/**
 * WHAT:
 * Archive receipt snapshot to payments table.
 * 
 * WHY:
 * Store operational receipt data for support and analytics.
 * Stripe remains authoritative; this is for convenience.
 * 
 * HOW:
 * 1. Convert receipt to snapshot
 * 2. Hash snapshot for integrity
 * 3. Update payments row by session ID with snapshot fields
 * 4. Handle errors gracefully
 */
async function archiveReceiptSnapshot({ userId, receipt }) {
  try {
    const snapshot = toSnapshot(receipt);
    const digest = sha256(JSON.stringify(snapshot));
    const table = config.features.archiveReceiptsTable || 'payments';

    if (table === 'payments') {
      // Update existing payments row with receipt snapshot
      const updates = {
        receipt_url: snapshot.stripe_receipt_url,
        snapshot_json: snapshot,
        snapshot_sha256: digest,
        created_ms: snapshot.created_ms
      };

      const { error, data } = await supabaseAdmin
        .from('payments')
        .update(updates)
        .eq('stripe_checkout_session_id', snapshot.session_id);

      if (error) {
        logger.error({
          event: 'receipt.archive.update_error',
          sessionId: snapshot.session_id,
          error: error.message
        }, 'Failed to update payments with receipt snapshot');
        return Promise.reject(error);
      }

      logger.info({
        event: 'receipt.archive.updated',
        sessionId: snapshot.session_id,
        userId
      }, 'Receipt snapshot archived to payments table');

      return { data };
    }

    // Fallback to dedicated payment_receipts table if configured
    const row = {
      user_id: userId,
      stripe_session_id: snapshot.session_id,
      stripe_payment_intent_id: snapshot.payment_intent_id,
      stripe_invoice_id: snapshot.invoice_id,
      stripe_customer_id: snapshot.customer_id,
      product_key: snapshot.product_key,
      amount_total: snapshot.amount_total,
      currency: snapshot.currency,
      payment_status: snapshot.payment_status,
      receipt_url: snapshot.stripe_receipt_url,
      items: snapshot.items,
      created_ms: snapshot.created_ms,
      snapshot_json: snapshot,
      snapshot_sha256: digest,
      source: 'ui'
    };

    const { error, data } = await supabaseAdmin
      .from('payment_receipts')
      .upsert(row, { onConflict: 'stripe_session_id' });

    if (error) {
      logger.error({
        event: 'receipt.archive.upsert_error',
        sessionId: snapshot.session_id,
        error: error.message
      }, 'Failed to upsert receipt snapshot');
      return Promise.reject(error);
    }

    logger.info({
      event: 'receipt.archive.upserted',
      sessionId: snapshot.session_id,
      userId
    }, 'Receipt snapshot archived to payment_receipts table');

    return { data };
  } catch (err) {
    logger.error({
      event: 'receipt.archive.error',
      error: err.message
    }, 'Receipt archival failed');
    throw err;
  }
}

module.exports = { archiveReceiptSnapshot };
