// File: server/services/receiptArchive.js
// Description: Receipt archival service for payments table
// Purpose: Store receipt snapshots in payments table for operational history
// Notes: Backend is source of truth, Stripe remains authoritative

'use strict';

const crypto = require('crypto');
const { config } = require('../config');
const { supabaseAdmin } = require('../utils/supabaseClient');
const logger = require('../utils/logger');

function sha256(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

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

async function archiveReceiptSnapshot({ userId, receipt }) {
  try {
    const snapshot = toSnapshot(receipt);
    const digest = sha256(JSON.stringify(snapshot));
    const table = config?.features?.archiveReceiptsTable || 'payments';

    if (table === 'payments') {
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
        logger.error({ event: 'receipt.archive.update_error', sessionId: snapshot.session_id, error: error.message }, 'Failed to update payments with receipt snapshot');
        return Promise.reject(error);
      }

      logger.info({ event: 'receipt.archive.updated', sessionId: snapshot.session_id, userId }, 'Receipt snapshot archived to payments table');
      return { data };
    }

    // Dedicated table path
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
      logger.error({ event: 'receipt.archive.upsert_error', sessionId: snapshot.session_id, error: error.message }, 'Failed to upsert receipt snapshot');
      return Promise.reject(error);
    }

    logger.info({ event: 'receipt.archive.upserted', sessionId: snapshot.session_id, userId }, 'Receipt snapshot archived to payment_receipts table');
    return { data };
  } catch (err) {
    logger.error({ event: 'receipt.archive.error', error: err.message }, 'Receipt archival failed');
    throw err;
  }
}

module.exports = { archiveReceiptSnapshot };