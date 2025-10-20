// File: server/services/outboxService.js
// Description: Durable outbox pattern for reliable event publishing
// Purpose: Ensures events are published even after failures
// Notes: Uses PostgreSQL for durability with Redis for performance

const logger = require('../utils/logger');
const { supabaseAdmin } = require('../utils/supabaseClient');

/**
 * WHAT:
 * Durable outbox service that stores events in PostgreSQL and publishes them reliably.
 * 
 * WHY:
 * Ensures events are never lost even if the application crashes or restarts.
 * Provides at-least-once delivery guarantees for critical events.
 * 
 * HOW:
 * 1. Store events in outbox table within same transaction as business logic
 * 2. Background job periodically processes pending events
 * 3. Mark events as processed after successful publication
 * 4. Retry failed events with exponential backoff
 */

/**
 * Store an event in the outbox for reliable delivery
 * @param {string} eventType - Type of event (e.g., 'profile.updated')
 * @param {Object} payload - Event payload data
 * @param {Object} metadata - Event metadata (userId, requestId, etc.)
 * @param {Object} options - Options (priority, delay, etc.)
 * @returns {Promise<string>} Event ID
 */
async function storeEvent(eventType, payload, _metadata = {}, options = {}) {
  try {
    const eventData = {
      event_type: eventType,
      payload: payload, // JSONB column, no need to stringify
      scheduled_at: options.delay ? new Date(Date.now() + options.delay) : new Date(),
      status: 'pending',
      attempts: 0,
      retry_count: 0
    };

    const { data, error } = await supabaseAdmin
      .from('outbox_events')
      .insert(eventData)
      .select('id')
      .single();

    if (error) {
      logger.error({
        event: 'outbox.store_failed',
        eventType,
        error: error.message
      }, 'Failed to store event in outbox');
      throw error;
    }

    logger.debug({
      event: 'outbox.stored',
      eventId: data.id,
      eventType
    }, 'Event stored in outbox');

    return data.id;
  } catch (error) {
    logger.error({
      event: 'outbox.store_error',
      eventType,
      error: error.message
    }, 'Outbox store operation failed');
    throw error;
  }
}

/**
 * Process pending events from the outbox
 * @param {number} batchSize - Number of events to process at once
 * @param {number} maxRetries - Maximum number of retries per event
 * @returns {Promise<Object>} Processing results
 */
async function processPendingEvents(batchSize = 10, maxRetries = 3) {
  const startTime = Date.now();
  let processed = 0;
  let failed = 0;
  let skipped = 0;

  try {
    // Get pending events that are ready to process
    const { data: events, error } = await supabaseAdmin
      .from('outbox_events')
      .select('*')
      .eq('status', 'pending')
      .lte('scheduled_at', new Date().toISOString())
      .lt('attempts', maxRetries)
      .order('created_at', { ascending: true })
      .limit(batchSize);

    if (error) {
      logger.error({
        event: 'outbox.process_query_failed',
        error: error.message
      }, 'Failed to query pending events');
      throw error;
    }

    if (!events || events.length === 0) {
      logger.debug({
        event: 'outbox.no_pending_events'
      }, 'No pending events to process');
      return { processed, failed, skipped };
    }

    logger.info({
      event: 'outbox.processing_batch',
      count: events.length
    }, `Processing ${events.length} pending events`);

    // Process each event
    for (const event of events) {
      try {
        await processEvent(event);
        processed++;
      } catch (error) {
        logger.error({
          event: 'outbox.event_process_failed',
          eventId: event.id,
          eventType: event.event_type,
          error: error.message,
          retryCount: event.retry_count
        }, `Failed to process event ${event.id}`);

        // Update retry count
        await updateEventRetry(event.id, event.retry_count + 1, error.message);
        failed++;
      }
    }

    const duration = Date.now() - startTime;
    logger.info({
      event: 'outbox.batch_completed',
      processed,
      failed,
      skipped,
      duration
    }, `Outbox batch completed: ${processed} processed, ${failed} failed, ${skipped} skipped`);

    return { processed, failed, skipped, duration };

  } catch (error) {
    logger.error({
      event: 'outbox.process_error',
      error: error.message
    }, 'Outbox processing failed');
    throw error;
  }
}

/**
 * Process a single event
 * @param {Object} event - Event record from outbox
 * @returns {Promise<void>}
 */
async function processEvent(event) {
  // Normalize payload - handle both string and object payloads (tolerant of past rows)
  const normalizePayload = (p) => (typeof p === 'string' ? JSON.parse(p) : p);
  const payload = normalizePayload(event.payload);
  
  // Add diagnostic logging for payload shape
  logger.debug({
    event: 'outbox.payload.shape',
    eventId: event.id,
    payloadType: typeof event.payload,
    payloadPreview: typeof event.payload === 'string' 
      ? event.payload.slice(0, 200) 
      : JSON.stringify(event.payload).slice(0, 200)
  }, 'Payload shape diagnostic');

  logger.debug({
    event: 'outbox.processing_event',
    eventId: event.id,
    eventType: event.event_type
  }, `Processing event ${event.event_type}`);

  // Route to appropriate handler based on event type
  switch (event.event_type) {
    case 'profile.updated':
      await handleProfileUpdatedEvent(payload);
      break;
    case 'user.created':
      await handleUserCreatedEvent(payload);
      break;
    case 'user.deleted':
      await handleUserDeletedEvent(payload);
      break;
    default:
      logger.warn({
        event: 'outbox.unknown_event_type',
        eventType: event.event_type,
        eventId: event.id
      }, `Unknown event type: ${event.event_type}`);
      throw new Error(`Unknown event type: ${event.event_type}`);
  }

  // Mark event as processed
  await markEventProcessed(event.id);
}

/**
 * Handle profile updated events
 * @param {Object} payload - Event payload
 * @returns {Promise<void>}
 */
async function handleProfileUpdatedEvent(payload) {
  // Example: Send notification, update search index, etc.
  logger.info({
    event: 'outbox.profile_updated_handled',
    userId: payload.userId,
    fields: Object.keys(payload.changes || {})
  }, 'Profile updated event handled');
  
  // Simulate async work (replace with actual business logic)
  await new Promise(resolve => setTimeout(resolve, 100));
}

/**
 * Handle user created events
 * @param {Object} payload - Event payload
 * @returns {Promise<void>}
 */
async function handleUserCreatedEvent(payload) {
  logger.info({
    event: 'outbox.user_created_handled',
    userId: payload.userId
  }, 'User created event handled');
  
  // Example: Send welcome email, create default profile, etc.
  await new Promise(resolve => setTimeout(resolve, 100));
}

/**
 * Handle user deleted events
 * @param {Object} payload - Event payload
 * @returns {Promise<void>}
 */
async function handleUserDeletedEvent(payload) {
  logger.info({
    event: 'outbox.user_deleted_handled',
    userId: payload.userId
  }, 'User deleted event handled');
  
  // Example: Cleanup related data, send notifications, etc.
  await new Promise(resolve => setTimeout(resolve, 100));
}

/**
 * Mark an event as processed
 * @param {string} eventId - Event ID
 * @returns {Promise<void>}
 */
async function markEventProcessed(eventId) {
  const { error } = await supabaseAdmin
    .from('outbox_events')
    .update({
      status: 'processed',
      processed_at: new Date()
    })
    .eq('id', eventId);

  if (error) {
    logger.error({
      event: 'outbox.mark_processed_failed',
      eventId,
      error: error.message
    }, 'Failed to mark event as processed');
    throw error;
  }
}

/**
 * Update event retry count
 * @param {string} eventId - Event ID
 * @param {number} retryCount - New retry count
 * @param {string} lastError - Last error message
 * @returns {Promise<void>}
 */
async function updateEventRetry(eventId, retryCount, lastError) {
  const { error } = await supabaseAdmin
    .from('outbox_events')
    .update({
      attempts: retryCount,
      retry_count: retryCount,
      last_error: lastError,
      scheduled_at: new Date(Date.now() + Math.pow(2, retryCount) * 60000) // Exponential backoff
    })
    .eq('id', eventId);

  if (error) {
    logger.error({
      event: 'outbox.update_retry_failed',
      eventId,
      error: error.message
    }, 'Failed to update event retry count');
    throw error;
  }
}

/**
 * Get outbox statistics
 * @returns {Promise<Object>} Outbox statistics
 */
async function getOutboxStats() {
  try {
    const { data, error } = await supabaseAdmin
      .from('outbox_events')
      .select('status')
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()); // Last 24 hours

    if (error) {
      throw error;
    }

    const stats = {
      total: data.length,
      pending: data.filter(e => e.status === 'pending').length,
      processed: data.filter(e => e.status === 'processed').length,
      failed: data.filter(e => e.status === 'failed').length
    };

    return stats;
  } catch (error) {
    logger.error({
      event: 'outbox.stats_error',
      error: error.message
    }, 'Failed to get outbox statistics');
    throw error;
  }
}

module.exports = {
  storeEvent,
  processPendingEvents,
  getOutboxStats
};
