// File: server/services/outboxService.js
// Description: Durable outbox pattern for reliable event publishing
// Purpose: Ensures events are published even after failures
//
// WHAT:
//  - storeEvent(): inserts durable events into outbox_events (Postgres/Supabase).
//  - processPendingEvents(): claims + processes a batch with retries + backoff.
//  - getOutboxStats(): returns 24h counts without scanning entire table.
//
// WHY:
//  - Prevents event loss on crashes/restarts.
//  - Keeps processing idempotent-ish (at-least-once delivery).
//  - Avoids log spam + avoids payload logging (PII/secret safety).
//
// HOW:
//  - Pending rows are fetched by schedule.
//  - Each row is "claimed" by flipping status pending -> processing (best-effort lock).
//  - Success => processed.
//  - Fail => retry with exponential backoff + jitter; eventually failed.
//  - Unknown event types => failed immediately (no retries).

'use strict';

// I am loading `../utils/logger` into `logger` so this file can reuse that dependency below.
const logger = require('../utils/logger');
// I am loading `../utils/supabaseClient` into `supabaseAdmin` so this file can reuse that dependency below.
const { supabaseAdmin } = require('../utils/supabaseClient');

// Throttle noisy logs (especially in dev)
const NO_PENDING_LOG_EVERY_MS = 5 * 60 * 1000;
// I am saving `lastNoPendingLogAt` here so the nearby steps can reuse the same value without rebuilding it each time.
let lastNoPendingLogAt = 0;

// Retry backoff tuning (defense-in-depth)
const BASE_BACKOFF_MS = 60 * 1000;          // 1 minute
const MAX_BACKOFF_MS = 60 * 60 * 1000;      // 1 hour
const MAX_ERROR_LEN = 400;                  // avoid storing/logging huge error strings

// I am keeping `nowIso` as a named helper so the surrounding workflow can call this step when it needs it.
function nowIso() {
  // This return sends the completed value or response back to the code that called this function.
  return new Date().toISOString();
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `clamp` as a named helper so the surrounding workflow can call this step when it needs it.
function clamp(n, min, max) {
  // This return sends the completed value or response back to the code that called this function.
  return Math.max(min, Math.min(max, n));
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `safeErrorMessage` as a named helper so the surrounding workflow can call this step when it needs it.
function safeErrorMessage(err) {
  // I am saving `raw` here so the nearby steps can reuse the same value without rebuilding it each time.
  const raw = err && err.message ? String(err.message) : String(err || 'Unknown error');
  // I am saving `cleaned` here so the nearby steps can reuse the same value without rebuilding it each time.
  const cleaned = logger.safe ? logger.safe(raw) : raw.replace(/[\x00-\x1F\x7F-\x9F]/g, '');
  // This return sends the completed value or response back to the code that called this function.
  return cleaned.length > MAX_ERROR_LEN ? cleaned.slice(0, MAX_ERROR_LEN) : cleaned;
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `computeBackoffMs` as a named helper so the surrounding workflow can call this step when it needs it.
function computeBackoffMs(attempts) {
  // attempts starts at 1 for the first failed attempt
  const exp = Math.pow(2, clamp(attempts, 1, 10)); // cap exponent
  const jitter = Math.floor(Math.random() * 2500); // small jitter to reduce thundering herd
  // This return sends the completed value or response back to the code that called this function.
  return clamp(exp * BASE_BACKOFF_MS + jitter, BASE_BACKOFF_MS, MAX_BACKOFF_MS);
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * Store an event in the outbox for reliable delivery
 *
 * NOTE:
 *  - Keep payload minimal (no secrets).
 *  - If you want dedupe, add a unique constraint + a dedupe_key column in DB later.
 */
async function storeEvent(eventType, payload, _metadata = {}, options = {}) {
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!eventType || typeof eventType !== 'string') {
    // I am stopping this path with the existing error here because the caller should not continue with an invalid result.
    throw new Error('storeEvent: eventType must be a non-empty string');
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am saving `scheduledAt` here so the nearby steps can reuse the same value without rebuilding it each time.
  const scheduledAt = options.delay
    // I am keeping this line here because the surrounding outboxService.js workflow expects this value or operation before it continues.
    ? new Date(Date.now() + Number(options.delay))
    // I am keeping this line here because the surrounding outboxService.js workflow expects this value or operation before it continues.
    : new Date();

  // I am saving `eventData` here so the nearby steps can reuse the same value without rebuilding it each time.
  const eventData = {
    // I am keeping the `event_type` field in this object so the receiving code can read that value by its expected name.
    event_type: eventType,
    payload, // JSONB column
    // I am keeping the `scheduled_at` field in this object so the receiving code can read that value by its expected name.
    scheduled_at: scheduledAt.toISOString(),
    // I am keeping the `status` field in this object so the receiving code can read that value by its expected name.
    status: 'pending',
    // I am keeping the `attempts` field in this object so the receiving code can read that value by its expected name.
    attempts: 0,
    // I am keeping the `retry_count` field in this object so the receiving code can read that value by its expected name.
    retry_count: 0,
    // I am keeping the `last_error` field in this object so the receiving code can read that value by its expected name.
    last_error: null,
    // I am keeping the `processed_at` field in this object so the receiving code can read that value by its expected name.
    processed_at: null
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  };

  // I am saving `data` here so the nearby steps can reuse the same value without rebuilding it each time.
  const { data, error } = await supabaseAdmin
    // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
    .from('outbox_events')
    // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
    .insert(eventData)
    // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
    .select('id')
    // I am continuing the existing call chain here so this option stays attached to the same operation started above.
    .single();

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (error) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.error('Failed to store event in outbox', {
      // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
      event: 'outbox.store_failed',
      // I am keeping this line here because the surrounding outboxService.js workflow expects this value or operation before it continues.
      eventType,
      // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
      error: safeErrorMessage(error)
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
    // I am stopping this path with the existing error here because the caller should not continue with an invalid result.
    throw error;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // Only debug when useful (no payload)
  logger.debug(
    // I am keeping this line here because the surrounding outboxService.js workflow expects this value or operation before it continues.
    { event: 'outbox.stored', eventId: data.id, eventType },
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    'Event stored in outbox'
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  );

  // This return sends the completed value or response back to the code that called this function.
  return data.id;
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * Best-effort claim:
 *  - flip status pending -> processing
 *  - increment attempts
 *
 * IMPORTANT:
 *  - This is a best-effort lock using a conditional update.
 *  - For true multi-worker atomic batch claims, prefer a DB RPC (FOR UPDATE SKIP LOCKED).
 */
async function claimEventForProcessing(eventRow) {
  // I am saving `attempts0` here so the nearby steps can reuse the same value without rebuilding it each time.
  const attempts0 = Number(eventRow.attempts || 0);
  // I am saving `nextAttempts` here so the nearby steps can reuse the same value without rebuilding it each time.
  const nextAttempts = attempts0 + 1;

  // I am saving `data` here so the nearby steps can reuse the same value without rebuilding it each time.
  const { data, error } = await supabaseAdmin
    // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
    .from('outbox_events')
    // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
    .update({
      // I am keeping the `status` field in this object so the receiving code can read that value by its expected name.
      status: 'processing',
      // I am keeping the `attempts` field in this object so the receiving code can read that value by its expected name.
      attempts: nextAttempts,
      retry_count: nextAttempts, // keep legacy column aligned
      // I am keeping the `last_error` field in this object so the receiving code can read that value by its expected name.
      last_error: null
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    })
    // I am continuing the existing call chain here so this option stays attached to the same operation started above.
    .eq('id', eventRow.id)
    // I am continuing the existing call chain here so this option stays attached to the same operation started above.
    .eq('status', 'pending')
    // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
    .select('id, attempts')
    // I am continuing the existing call chain here so this option stays attached to the same operation started above.
    .maybeSingle();

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (error) throw error;

  // If no row returned, someone else claimed it (or it changed)
  if (!data) return { claimed: false, attempts: attempts0 };

  // This return sends the completed value or response back to the code that called this function.
  return { claimed: true, attempts: Number(data.attempts || nextAttempts) };
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `markEventProcessed` as a named asynchronous helper so the surrounding workflow can call this step when it needs it.
async function markEventProcessed(eventId) {
  // I am saving `error` here so the nearby steps can reuse the same value without rebuilding it each time.
  const { error } = await supabaseAdmin
    // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
    .from('outbox_events')
    // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
    .update({
      // I am keeping the `status` field in this object so the receiving code can read that value by its expected name.
      status: 'processed',
      // I am keeping the `processed_at` field in this object so the receiving code can read that value by its expected name.
      processed_at: nowIso()
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    })
    // I am continuing the existing call chain here so this option stays attached to the same operation started above.
    .eq('id', eventId);

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (error) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.error('Failed to mark event as processed', {
      // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
      event: 'outbox.mark_processed_failed',
      // I am keeping this line here because the surrounding outboxService.js workflow expects this value or operation before it continues.
      eventId,
      // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
      error: safeErrorMessage(error)
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
    // I am stopping this path with the existing error here because the caller should not continue with an invalid result.
    throw error;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `markEventFailedNoRetry` as a named asynchronous helper so the surrounding workflow can call this step when it needs it.
async function markEventFailedNoRetry(eventId, message) {
  // I am saving `error` here so the nearby steps can reuse the same value without rebuilding it each time.
  const { error } = await supabaseAdmin
    // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
    .from('outbox_events')
    // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
    .update({
      // I am keeping the `status` field in this object so the receiving code can read that value by its expected name.
      status: 'failed',
      // I am keeping the `last_error` field in this object so the receiving code can read that value by its expected name.
      last_error: message,
      // I am keeping the `processed_at` field in this object so the receiving code can read that value by its expected name.
      processed_at: nowIso()
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    })
    // I am continuing the existing call chain here so this option stays attached to the same operation started above.
    .eq('id', eventId);

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (error) throw error;
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `rescheduleEventRetry` as a named asynchronous helper so the surrounding workflow can call this step when it needs it.
async function rescheduleEventRetry(eventId, attempts, message) {
  // I am saving `delayMs` here so the nearby steps can reuse the same value without rebuilding it each time.
  const delayMs = computeBackoffMs(attempts);
  // I am saving `nextTime` here so the nearby steps can reuse the same value without rebuilding it each time.
  const nextTime = new Date(Date.now() + delayMs).toISOString();

  // I am saving `error` here so the nearby steps can reuse the same value without rebuilding it each time.
  const { error } = await supabaseAdmin
    // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
    .from('outbox_events')
    // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
    .update({
      status: attempts >= 3 ? 'pending' : 'pending', // status stays pending until maxRetries is enforced by caller
      // I am keeping the `retry_count` field in this object so the receiving code can read that value by its expected name.
      retry_count: attempts,
      // I am keeping the `last_error` field in this object so the receiving code can read that value by its expected name.
      last_error: message,
      // I am keeping the `scheduled_at` field in this object so the receiving code can read that value by its expected name.
      scheduled_at: nextTime
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    })
    // I am continuing the existing call chain here so this option stays attached to the same operation started above.
    .eq('id', eventId);

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (error) throw error;

  // This return sends the completed value or response back to the code that called this function.
  return { delayMs, nextTime };
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * Process pending events from the outbox
 *
 * Supports both:
 *  - processPendingEvents(10, 3)
 *  - processPendingEvents({ batchSize: 10, maxRetries: 3 })
 */
async function processPendingEvents(batchSize = 10, maxRetries = 3) {
  // Allow object-style call
  if (batchSize && typeof batchSize === 'object') {
    // I am saving `opts` here so the nearby steps can reuse the same value without rebuilding it each time.
    const opts = batchSize;
    // I am keeping this line here because the surrounding outboxService.js workflow expects this value or operation before it continues.
    batchSize = opts.batchSize ?? 10;
    // I am keeping this line here because the surrounding outboxService.js workflow expects this value or operation before it continues.
    maxRetries = opts.maxRetries ?? 3;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am saving `startedAt` here so the nearby steps can reuse the same value without rebuilding it each time.
  const startedAt = Date.now();
  // I am saving `processed` here so the nearby steps can reuse the same value without rebuilding it each time.
  let processed = 0;
  // I am saving `failed` here so the nearby steps can reuse the same value without rebuilding it each time.
  let failed = 0;
  // I am saving `skipped` here so the nearby steps can reuse the same value without rebuilding it each time.
  let skipped = 0;

  // Fetch only the columns we actually need
  const { data: events, error } = await supabaseAdmin
    // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
    .from('outbox_events')
    // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
    .select('id,event_type,payload,attempts,retry_count,scheduled_at,created_at')
    // I am continuing the existing call chain here so this option stays attached to the same operation started above.
    .eq('status', 'pending')
    // I am continuing the existing call chain here so this option stays attached to the same operation started above.
    .lte('scheduled_at', nowIso())
    // I am continuing the existing call chain here so this option stays attached to the same operation started above.
    .lt('attempts', maxRetries)
    // I am continuing the existing call chain here so this option stays attached to the same operation started above.
    .order('created_at', { ascending: true })
    // I am continuing the existing call chain here so this option stays attached to the same operation started above.
    .limit(batchSize);

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (error) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.error('Failed to query pending events', {
      // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
      event: 'outbox.process_query_failed',
      // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
      error: safeErrorMessage(error)
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
    // I am stopping this path with the existing error here because the caller should not continue with an invalid result.
    throw error;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!events || events.length === 0) {
    // Throttled: do NOT spam logs every interval
    const t = Date.now();
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (t - lastNoPendingLogAt > NO_PENDING_LOG_EVERY_MS) {
      // I am keeping this line here because the surrounding outboxService.js workflow expects this value or operation before it continues.
      lastNoPendingLogAt = t;
      // I am calling this helper here so the current workflow performs this step before it moves on.
      logger.debug({ event: 'outbox.no_pending_events' }, 'No pending outbox events');
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    // This return sends the completed value or response back to the code that called this function.
    return { processed, failed, skipped, duration: Date.now() - startedAt };
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am calling this helper here so the current workflow performs this step before it moves on.
  logger.info(
    // I am keeping this line here because the surrounding outboxService.js workflow expects this value or operation before it continues.
    { event: 'outbox.processing_batch', count: events.length },
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    `Processing ${events.length} outbox event(s)`
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  );

  // I am repeating the next block one item at a time so every value in the existing collection receives the same handling.
  for (const eventRow of events) {
    // Claim first to reduce double processing
    let claim;
    // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
    try {
      // I am waiting for this asynchronous step here so the next line does not use its result before it is ready.
      claim = await claimEventForProcessing(eventRow);
    // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
    } catch (err) {
      // I am keeping this line here because the surrounding outboxService.js workflow expects this value or operation before it continues.
      failed++;
      // I am calling this helper here so the current workflow performs this step before it moves on.
      logger.error('Failed to claim outbox event', {
        // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
        event: 'outbox.claim_failed',
        // I am keeping the `eventId` field in this object so the receiving code can read that value by its expected name.
        eventId: eventRow.id,
        // I am keeping the `eventType` field in this object so the receiving code can read that value by its expected name.
        eventType: eventRow.event_type,
        // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
        error: safeErrorMessage(err)
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      });
      // I am changing the loop flow here once the condition above has decided this item needs no further work in this pass.
      continue;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!claim.claimed) {
      // I am keeping this line here because the surrounding outboxService.js workflow expects this value or operation before it continues.
      skipped++;
      // I am changing the loop flow here once the condition above has decided this item needs no further work in this pass.
      continue;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
    try {
      // I am waiting for this asynchronous step here so the next line does not use its result before it is ready.
      await processEvent(eventRow);
      // I am waiting for this asynchronous step here so the next line does not use its result before it is ready.
      await markEventProcessed(eventRow.id);
      // I am keeping this line here because the surrounding outboxService.js workflow expects this value or operation before it continues.
      processed++;
    // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
    } catch (err) {
      // I am saving `msg` here so the nearby steps can reuse the same value without rebuilding it each time.
      const msg = safeErrorMessage(err);
      // I am saving `attempts` here so the nearby steps can reuse the same value without rebuilding it each time.
      const attempts = claim.attempts;

      // I am calling this helper here so the current workflow performs this step before it moves on.
      logger.error('Failed to process outbox event', {
        // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
        event: 'outbox.event_process_failed',
        // I am keeping the `eventId` field in this object so the receiving code can read that value by its expected name.
        eventId: eventRow.id,
        // I am keeping the `eventType` field in this object so the receiving code can read that value by its expected name.
        eventType: eventRow.event_type,
        // I am keeping this line here because the surrounding outboxService.js workflow expects this value or operation before it continues.
        attempts,
        // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
        error: msg
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      });

      // Unknown event types: fail immediately (no retry churn)
      if (err && err.code === 'OUTBOX_UNKNOWN_EVENT') {
        // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
        try {
          // I am waiting for this asynchronous step here so the next line does not use its result before it is ready.
          await markEventFailedNoRetry(eventRow.id, msg);
        // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
        } catch (e2) {
          // I am calling this helper here so the current workflow performs this step before it moves on.
          logger.error('Failed to mark unknown event as failed', {
            // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
            event: 'outbox.fail_unknown_update_failed',
            // I am keeping the `eventId` field in this object so the receiving code can read that value by its expected name.
            eventId: eventRow.id,
            // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
            error: safeErrorMessage(e2)
          // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
          });
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }
        // I am keeping this line here because the surrounding outboxService.js workflow expects this value or operation before it continues.
        failed++;
        // I am changing the loop flow here once the condition above has decided this item needs no further work in this pass.
        continue;
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }

      // Retries: if attempts >= maxRetries => mark failed, else reschedule
      if (attempts >= maxRetries) {
        // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
        try {
          // I am waiting for this asynchronous step here so the next line does not use its result before it is ready.
          await markEventFailedNoRetry(eventRow.id, msg);
        // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
        } catch (e2) {
          // I am calling this helper here so the current workflow performs this step before it moves on.
          logger.error('Failed to mark event as failed after max retries', {
            // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
            event: 'outbox.mark_failed_update_failed',
            // I am keeping the `eventId` field in this object so the receiving code can read that value by its expected name.
            eventId: eventRow.id,
            // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
            error: safeErrorMessage(e2)
          // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
          });
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }
        // I am keeping this line here because the surrounding outboxService.js workflow expects this value or operation before it continues.
        failed++;
      // This alternative runs only when the condition above did not use its first path.
      } else {
        // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
        try {
          // I am waiting for this asynchronous step here so the next line does not use its result before it is ready.
          await rescheduleEventRetry(eventRow.id, attempts, msg);
        // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
        } catch (e2) {
          // I am calling this helper here so the current workflow performs this step before it moves on.
          logger.error('Failed to reschedule outbox event retry', {
            // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
            event: 'outbox.reschedule_failed',
            // I am keeping the `eventId` field in this object so the receiving code can read that value by its expected name.
            eventId: eventRow.id,
            // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
            error: safeErrorMessage(e2)
          // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
          });
          // I am keeping this line here because the surrounding outboxService.js workflow expects this value or operation before it continues.
          failed++;
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am saving `duration` here so the nearby steps can reuse the same value without rebuilding it each time.
  const duration = Date.now() - startedAt;

  // I am calling this helper here so the current workflow performs this step before it moves on.
  logger.info(
    // I am keeping this line here because the surrounding outboxService.js workflow expects this value or operation before it continues.
    { event: 'outbox.batch_completed', processed, failed, skipped, duration },
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    `Outbox batch done (${processed} processed, ${failed} failed, ${skipped} skipped)`
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  );

  // This return sends the completed value or response back to the code that called this function.
  return { processed, failed, skipped, duration };
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * Process a single event record.
 * Never log payload contents.
 */
async function processEvent(eventRow) {
  // I am saving `eventType` here so the nearby steps can reuse the same value without rebuilding it each time.
  const eventType = eventRow.event_type;
  // I am saving `payload` here so the nearby steps can reuse the same value without rebuilding it each time.
  const payload = normalizePayload(eventRow.payload, eventRow.id);

  // I am saving `handlers` here so the nearby steps can reuse the same value without rebuilding it each time.
  const handlers = {
    // I am keeping this line here because the surrounding outboxService.js workflow expects this value or operation before it continues.
    'profile.updated': handleProfileUpdatedEvent,
    // I am keeping this line here because the surrounding outboxService.js workflow expects this value or operation before it continues.
    'user.created': handleUserCreatedEvent,
    // I am keeping this line here because the surrounding outboxService.js workflow expects this value or operation before it continues.
    'user.deleted': handleUserDeletedEvent
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  };

  // I am saving `handler` here so the nearby steps can reuse the same value without rebuilding it each time.
  const handler = handlers[eventType];
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!handler) {
    // I am saving `err` here so the nearby steps can reuse the same value without rebuilding it each time.
    const err = new Error(`Unknown outbox event type: ${eventType}`);
    // I am keeping this line here because the surrounding outboxService.js workflow expects this value or operation before it continues.
    err.code = 'OUTBOX_UNKNOWN_EVENT';
    // I am stopping this path with the existing error here because the caller should not continue with an invalid result.
    throw err;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am calling this helper here so the current workflow performs this step before it moves on.
  logger.debug(
    // I am keeping this line here because the surrounding outboxService.js workflow expects this value or operation before it continues.
    { event: 'outbox.processing_event', eventId: eventRow.id, eventType },
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    'Processing outbox event'
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  );

  // I am waiting for this asynchronous step here so the next line does not use its result before it is ready.
  await handler(payload);
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `normalizePayload` as a named helper so the surrounding workflow can call this step when it needs it.
function normalizePayload(raw, eventId) {
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (raw == null) return {};
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (typeof raw === 'object') return raw;

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (typeof raw === 'string') {
    // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
    try {
      // This return sends the completed value or response back to the code that called this function.
      return JSON.parse(raw);
    // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
    } catch (err) {
      // I am saving `e` here so the nearby steps can reuse the same value without rebuilding it each time.
      const e = new Error(`Invalid JSON payload for outbox event ${eventId}`);
      // I am keeping this line here because the surrounding outboxService.js workflow expects this value or operation before it continues.
      e.code = 'OUTBOX_BAD_PAYLOAD';
      // I am stopping this path with the existing error here because the caller should not continue with an invalid result.
      throw e;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // Fallback: unexpected type, but don’t crash; treat as empty object
  return {};
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// ----- Example handlers (keep them fast; push heavy work to dedicated jobs later) -----

async function handleProfileUpdatedEvent(payload) {
  // Log only safe identifiers / field names
  logger.info(
    // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
    {
      // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
      event: 'outbox.profile_updated_handled',
      // I am keeping the `userId` field in this object so the receiving code can read that value by its expected name.
      userId: payload && payload.userId,
      // I am keeping the `fields` field in this object so the receiving code can read that value by its expected name.
      fields: payload && payload.changes ? Object.keys(payload.changes) : []
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    },
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    'Profile updated event handled'
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  );
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `handleUserCreatedEvent` as a named asynchronous helper so the surrounding workflow can call this step when it needs it.
async function handleUserCreatedEvent(payload) {
  // I am calling this helper here so the current workflow performs this step before it moves on.
  logger.info(
    // I am keeping this line here because the surrounding outboxService.js workflow expects this value or operation before it continues.
    { event: 'outbox.user_created_handled', userId: payload && payload.userId },
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    'User created event handled'
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  );
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `handleUserDeletedEvent` as a named asynchronous helper so the surrounding workflow can call this step when it needs it.
async function handleUserDeletedEvent(payload) {
  // I am calling this helper here so the current workflow performs this step before it moves on.
  logger.info(
    // I am keeping this line here because the surrounding outboxService.js workflow expects this value or operation before it continues.
    { event: 'outbox.user_deleted_handled', userId: payload && payload.userId },
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    'User deleted event handled'
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  );
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * Get outbox statistics for the last 24 hours.
 * Uses count-only queries (no full row fetch).
 */
async function getOutboxStats() {
  // I am saving `since` here so the nearby steps can reuse the same value without rebuilding it each time.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // I am keeping `countWhere` as a named asynchronous helper so the surrounding workflow can call this step when it needs it.
  async function countWhere(extraFilterFn) {
    // I am saving `q` here so the nearby steps can reuse the same value without rebuilding it each time.
    let q = supabaseAdmin
      // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
      .from('outbox_events')
      // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
      .select('id', { count: 'exact', head: true })
      // I am continuing the existing call chain here so this option stays attached to the same operation started above.
      .gte('created_at', since);

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (extraFilterFn) q = extraFilterFn(q);

    // I am saving `count` here so the nearby steps can reuse the same value without rebuilding it each time.
    const { count, error } = await q;
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (error) throw error;
    // This return sends the completed value or response back to the code that called this function.
    return Number(count || 0);
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // I am saving `total` here so the nearby steps can reuse the same value without rebuilding it each time.
    const [total, pending, processed, failed] = await Promise.all([
      // I am calling this helper here so the current workflow performs this step before it moves on.
      countWhere(),
      // I am defining this small callback here so the surrounding API can run it with the value it supplies.
      countWhere((q) => q.eq('status', 'pending')),
      // I am defining this small callback here so the surrounding API can run it with the value it supplies.
      countWhere((q) => q.eq('status', 'processed')),
      // I am defining this small callback here so the surrounding API can run it with the value it supplies.
      countWhere((q) => q.eq('status', 'failed'))
    // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
    ]);

    // This return sends the completed value or response back to the code that called this function.
    return { total, pending, processed, failed };
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (error) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.error('Failed to get outbox statistics', {
      // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
      event: 'outbox.stats_error',
      // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
      error: safeErrorMessage(error)
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
    // I am stopping this path with the existing error here because the caller should not continue with an invalid result.
    throw error;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am exporting this value here so another module can deliberately reuse the completed piece from outboxService.js.
module.exports = {
  // I am keeping this line here because the surrounding outboxService.js workflow expects this value or operation before it continues.
  storeEvent,
  // I am keeping this line here because the surrounding outboxService.js workflow expects this value or operation before it continues.
  processPendingEvents,
  // I am keeping this line here because the surrounding outboxService.js workflow expects this value or operation before it continues.
  getOutboxStats
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
};