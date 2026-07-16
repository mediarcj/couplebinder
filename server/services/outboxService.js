// Description: Durable outbox pattern for reliable event publishing
// Purpose: Ensures events are published even after failures
//
//  - storeEvent(): inserts durable events into outbox_events (Postgres/Supabase).
//  - processPendingEvents(): claims + processes a batch with retries + backoff.
//  - getOutboxStats(): returns 24h counts without scanning entire table.
//
//  - Prevents event loss on crashes/restarts.
//  - Keeps processing idempotent-ish (at-least-once delivery).
//  - Avoids log spam + avoids payload logging (PII/secret safety).
//
//  - Pending rows are fetched by schedule.
//  - Each row is "claimed" by flipping status pending -> processing (best-effort lock).
//  - Success => processed.
//  - Fail => retry with exponential backoff + jitter; eventually failed.
//  - Unknown event types => failed immediately (no retries).

'use strict';

const logger = require('../utils/logger');
const { supabaseAdmin } = require('../utils/supabaseClient');

// Throttle noisy logs (especially in dev)
const NO_PENDING_LOG_EVERY_MS = 5 * 60 * 1000;
let lastNoPendingLogAt = 0;

// Retry backoff tuning (defense-in-depth)
const BASE_BACKOFF_MS = 60 * 1000;          // 1 minute
const MAX_BACKOFF_MS = 60 * 60 * 1000;      // 1 hour
const MAX_ERROR_LEN = 400;                  // avoid storing/logging huge error strings

function nowIso() {
  return new Date().toISOString();
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function safeErrorMessage(err) {
  const raw = err && err.message ? String(err.message) : String(err || 'Unknown error');
  const cleaned = logger.safe ? logger.safe(raw) : raw.replace(/[\x00-\x1F\x7F-\x9F]/g, '');
  return cleaned.length > MAX_ERROR_LEN ? cleaned.slice(0, MAX_ERROR_LEN) : cleaned;
}

function computeBackoffMs(attempts) {
  // attempts starts at 1 for the first failed attempt
  const exp = Math.pow(2, clamp(attempts, 1, 10)); // cap exponent
  const jitter = Math.floor(Math.random() * 2500); // small jitter to reduce thundering herd
  return clamp(exp * BASE_BACKOFF_MS + jitter, BASE_BACKOFF_MS, MAX_BACKOFF_MS);
}

/**
 * Store an event in the outbox for reliable delivery
 *
 * NOTE:
 *  - Keep payload minimal (no secrets).
 *  - If you want dedupe, add a unique constraint + a dedupe_key column in DB later.
 */
async function storeEvent(eventType, payload, _metadata = {}, options = {}) {
  if (!eventType || typeof eventType !== 'string') {
    throw new Error('storeEvent: eventType must be a non-empty string');
  }

  const scheduledAt = options.delay
    ? new Date(Date.now() + Number(options.delay))
    : new Date();

  const eventData = {
    event_type: eventType,
    payload, // JSONB column
    scheduled_at: scheduledAt.toISOString(),
    status: 'pending',
    attempts: 0,
    retry_count: 0,
    last_error: null,
    processed_at: null
  };

  const { data, error } = await supabaseAdmin
    .from('outbox_events')
    .insert(eventData)
    .select('id')
    .single();

  if (error) {
    logger.error('Failed to store event in outbox', {
      event: 'outbox.store_failed',
      eventType,
      error: safeErrorMessage(error)
    });
    throw error;
  }

  // Only debug when useful (no payload)
  logger.debug(
    { event: 'outbox.stored', eventId: data.id, eventType },
    'Event stored in outbox'
  );

  return data.id;
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
  const attempts0 = Number(eventRow.attempts || 0);
  const nextAttempts = attempts0 + 1;

  const { data, error } = await supabaseAdmin
    .from('outbox_events')
    .update({
      status: 'processing',
      attempts: nextAttempts,
      retry_count: nextAttempts, // keep legacy column aligned
      last_error: null
    })
    .eq('id', eventRow.id)
    .eq('status', 'pending')
    .select('id, attempts')
    .maybeSingle();

  if (error) throw error;

  // If no row returned, someone else claimed it (or it changed)
  if (!data) return { claimed: false, attempts: attempts0 };

  return { claimed: true, attempts: Number(data.attempts || nextAttempts) };
}

async function markEventProcessed(eventId) {
  const { error } = await supabaseAdmin
    .from('outbox_events')
    .update({
      status: 'processed',
      processed_at: nowIso()
    })
    .eq('id', eventId);

  if (error) {
    logger.error('Failed to mark event as processed', {
      event: 'outbox.mark_processed_failed',
      eventId,
      error: safeErrorMessage(error)
    });
    throw error;
  }
}

async function markEventFailedNoRetry(eventId, message) {
  const { error } = await supabaseAdmin
    .from('outbox_events')
    .update({
      status: 'failed',
      last_error: message,
      processed_at: nowIso()
    })
    .eq('id', eventId);

  if (error) throw error;
}

async function rescheduleEventRetry(eventId, attempts, message) {
  const delayMs = computeBackoffMs(attempts);
  const nextTime = new Date(Date.now() + delayMs).toISOString();

  const { error } = await supabaseAdmin
    .from('outbox_events')
    .update({
      status: attempts >= 3 ? 'pending' : 'pending', // status stays pending until maxRetries is enforced by caller
      retry_count: attempts,
      last_error: message,
      scheduled_at: nextTime
    })
    .eq('id', eventId);

  if (error) throw error;

  return { delayMs, nextTime };
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
    const opts = batchSize;
    batchSize = opts.batchSize ?? 10;
    maxRetries = opts.maxRetries ?? 3;
  }

  const startedAt = Date.now();
  let processed = 0;
  let failed = 0;
  let skipped = 0;

  // Fetch only the columns we actually need
  const { data: events, error } = await supabaseAdmin
    .from('outbox_events')
    .select('id,event_type,payload,attempts,retry_count,scheduled_at,created_at')
    .eq('status', 'pending')
    .lte('scheduled_at', nowIso())
    .lt('attempts', maxRetries)
    .order('created_at', { ascending: true })
    .limit(batchSize);

  if (error) {
    logger.error('Failed to query pending events', {
      event: 'outbox.process_query_failed',
      error: safeErrorMessage(error)
    });
    throw error;
  }

  if (!events || events.length === 0) {
    // Throttled: do NOT spam logs every interval
    const t = Date.now();
    if (t - lastNoPendingLogAt > NO_PENDING_LOG_EVERY_MS) {
      lastNoPendingLogAt = t;
      logger.debug({ event: 'outbox.no_pending_events' }, 'No pending outbox events');
    }
    return { processed, failed, skipped, duration: Date.now() - startedAt };
  }

  logger.info(
    { event: 'outbox.processing_batch', count: events.length },
    `Processing ${events.length} outbox event(s)`
  );

  for (const eventRow of events) {
    // Claim first to reduce double processing
    let claim;
    try {
      claim = await claimEventForProcessing(eventRow);
    } catch (err) {
      failed++;
      logger.error('Failed to claim outbox event', {
        event: 'outbox.claim_failed',
        eventId: eventRow.id,
        eventType: eventRow.event_type,
        error: safeErrorMessage(err)
      });
      continue;
    }

    if (!claim.claimed) {
      skipped++;
      continue;
    }

    try {
      await processEvent(eventRow);
      await markEventProcessed(eventRow.id);
      processed++;
    } catch (err) {
      const msg = safeErrorMessage(err);
      const attempts = claim.attempts;

      logger.error('Failed to process outbox event', {
        event: 'outbox.event_process_failed',
        eventId: eventRow.id,
        eventType: eventRow.event_type,
        attempts,
        error: msg
      });

      // Unknown event types: fail immediately (no retry churn)
      if (err && err.code === 'OUTBOX_UNKNOWN_EVENT') {
        try {
          await markEventFailedNoRetry(eventRow.id, msg);
        } catch (e2) {
          logger.error('Failed to mark unknown event as failed', {
            event: 'outbox.fail_unknown_update_failed',
            eventId: eventRow.id,
            error: safeErrorMessage(e2)
          });
        }
        failed++;
        continue;
      }

      // Retries: if attempts >= maxRetries => mark failed, else reschedule
      if (attempts >= maxRetries) {
        try {
          await markEventFailedNoRetry(eventRow.id, msg);
        } catch (e2) {
          logger.error('Failed to mark event as failed after max retries', {
            event: 'outbox.mark_failed_update_failed',
            eventId: eventRow.id,
            error: safeErrorMessage(e2)
          });
        }
        failed++;
      } else {
        try {
          await rescheduleEventRetry(eventRow.id, attempts, msg);
        } catch (e2) {
          logger.error('Failed to reschedule outbox event retry', {
            event: 'outbox.reschedule_failed',
            eventId: eventRow.id,
            error: safeErrorMessage(e2)
          });
          failed++;
        }
      }
    }
  }

  const duration = Date.now() - startedAt;

  logger.info(
    { event: 'outbox.batch_completed', processed, failed, skipped, duration },
    `Outbox batch done (${processed} processed, ${failed} failed, ${skipped} skipped)`
  );

  return { processed, failed, skipped, duration };
}

/**
 * Process a single event record.
 * Never log payload contents.
 */
async function processEvent(eventRow) {
  const eventType = eventRow.event_type;
  const payload = normalizePayload(eventRow.payload, eventRow.id);

  const handlers = {
    'profile.updated': handleProfileUpdatedEvent,
    'user.created': handleUserCreatedEvent,
    'user.deleted': handleUserDeletedEvent
  };

  const handler = handlers[eventType];
  if (!handler) {
    const err = new Error(`Unknown outbox event type: ${eventType}`);
    err.code = 'OUTBOX_UNKNOWN_EVENT';
    throw err;
  }

  logger.debug(
    { event: 'outbox.processing_event', eventId: eventRow.id, eventType },
    'Processing outbox event'
  );

  await handler(payload);
}

function normalizePayload(raw, eventId) {
  if (raw == null) return {};
  if (typeof raw === 'object') return raw;

  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch (err) {
      const e = new Error(`Invalid JSON payload for outbox event ${eventId}`);
      e.code = 'OUTBOX_BAD_PAYLOAD';
      throw e;
    }
  }

  // Fallback: unexpected type, but don’t crash; treat as empty object
  return {};
}

// ----- Example handlers (keep them fast; push heavy work to dedicated jobs later) -----

async function handleProfileUpdatedEvent(payload) {
  // Log only safe identifiers / field names
  logger.info(
    {
      event: 'outbox.profile_updated_handled',
      userId: payload && payload.userId,
      fields: payload && payload.changes ? Object.keys(payload.changes) : []
    },
    'Profile updated event handled'
  );
}

async function handleUserCreatedEvent(payload) {
  logger.info(
    { event: 'outbox.user_created_handled', userId: payload && payload.userId },
    'User created event handled'
  );
}

async function handleUserDeletedEvent(payload) {
  logger.info(
    { event: 'outbox.user_deleted_handled', userId: payload && payload.userId },
    'User deleted event handled'
  );
}

/**
 * Get outbox statistics for the last 24 hours.
 * Uses count-only queries (no full row fetch).
 */
async function getOutboxStats() {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  async function countWhere(extraFilterFn) {
    let q = supabaseAdmin
      .from('outbox_events')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', since);

    if (extraFilterFn) q = extraFilterFn(q);

    const { count, error } = await q;
    if (error) throw error;
    return Number(count || 0);
  }

  try {
    const [total, pending, processed, failed] = await Promise.all([
      countWhere(),
      countWhere((q) => q.eq('status', 'pending')),
      countWhere((q) => q.eq('status', 'processed')),
      countWhere((q) => q.eq('status', 'failed'))
    ]);

    return { total, pending, processed, failed };
  } catch (error) {
    logger.error('Failed to get outbox statistics', {
      event: 'outbox.stats_error',
      error: safeErrorMessage(error)
    });
    throw error;
  }
}

module.exports = {
  storeEvent,
  processPendingEvents,
  getOutboxStats
};