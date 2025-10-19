// File: server/jobs/outboxProcessor.js
// Description: Scheduled job to process outbox events
// Purpose: Ensures reliable event delivery via background processing
// Notes: Runs every 30 seconds to process pending events

const { processPendingEvents, getOutboxStats } = require('../services/outboxService');
const logger = require('../utils/logger');

/**
 * WHAT:
 * Background job that processes pending events from the outbox.
 * 
 * WHY:
 * Ensures events are delivered reliably even if the application restarts.
 * Provides at-least-once delivery guarantees for critical events.
 * 
 * HOW:
 * 1. Runs every 30 seconds
 * 2. Processes pending events in batches
 * 3. Retries failed events with exponential backoff
 * 4. Logs statistics for monitoring
 */

let isProcessing = false;
let intervalId = null;

/**
 * Start the outbox processor job
 * @param {number} intervalMs - Processing interval in milliseconds
 */
function startOutboxProcessor(intervalMs = 30000) {
  if (intervalId) {
    logger.warn({
      event: 'outbox.processor.already_running'
    }, 'Outbox processor is already running');
    return;
  }

  logger.info({
    event: 'outbox.processor.started',
    intervalMs
  }, `Starting outbox processor with ${intervalMs}ms interval`);

  intervalId = setInterval(async () => {
    if (isProcessing) {
      logger.debug({
        event: 'outbox.processor.skipped_busy'
      }, 'Skipping outbox processing - previous batch still running');
      return;
    }

    await processBatch();
  }, intervalMs);
}

/**
 * Stop the outbox processor job
 */
function stopOutboxProcessor() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    
    logger.info({
      event: 'outbox.processor.stopped'
    }, 'Outbox processor stopped');
  }
}

/**
 * Process a batch of events
 */
async function processBatch() {
  isProcessing = true;
  
  try {
    const results = await processPendingEvents(10, 3);
    
    // Log statistics if there were events processed
    if (results.processed > 0 || results.failed > 0) {
      logger.info({
        event: 'outbox.batch_summary',
        processed: results.processed,
        failed: results.failed,
        duration: results.duration
      }, `Outbox batch: ${results.processed} processed, ${results.failed} failed`);
    }

    // Log overall stats every 10 batches (5 minutes)
    if (Math.random() < 0.1) { // 10% chance
      const stats = await getOutboxStats();
      logger.info({
        event: 'outbox.stats',
        ...stats
      }, `Outbox stats: ${stats.total} total, ${stats.pending} pending, ${stats.processed} processed, ${stats.failed} failed`);
    }

  } catch (error) {
    logger.error({
      event: 'outbox.processor.error',
      error: error.message
    }, 'Outbox processor error');
  } finally {
    isProcessing = false;
  }
}

/**
 * Process events immediately (for testing or manual triggers)
 */
async function processNow() {
  if (isProcessing) {
    throw new Error('Outbox processor is already running');
  }

  logger.info({
    event: 'outbox.processor.manual_trigger'
  }, 'Manual outbox processing triggered');

  await processBatch();
}

/**
 * Get processor status
 */
function getProcessorStatus() {
  return {
    running: !!intervalId,
    processing: isProcessing,
    intervalId: intervalId ? 'active' : null
  };
}

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info({
    event: 'outbox.processor.shutdown'
  }, 'Shutting down outbox processor');
  stopOutboxProcessor();
});

process.on('SIGINT', () => {
  logger.info({
    event: 'outbox.processor.shutdown'
  }, 'Shutting down outbox processor');
  stopOutboxProcessor();
});

module.exports = {
  startOutboxProcessor,
  stopOutboxProcessor,
  processNow,
  getProcessorStatus
};
