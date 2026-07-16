// File: server/jobs/outboxProcessor.js
// Description: Scheduled job to process outbox events
// Purpose: Ensures reliable event delivery via background processing
// Notes: Runs every 30 seconds to process pending events

const { processPendingEvents, getOutboxStats } = require('../services/outboxService');
// I am loading `../utils/logger` into `logger` so this file can reuse that dependency below.
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
// I am saving `intervalId` here so the nearby steps can reuse the same value without rebuilding it each time.
let intervalId = null;

/**
 * Start the outbox processor job
 * @param {number} intervalMs - Processing interval in milliseconds
 */
function startOutboxProcessor(intervalMs = 30000) {
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (intervalId) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.warn({
      // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
      event: 'outbox.processor.already_running'
    // I am keeping this line here because the surrounding outboxProcessor.js workflow expects this value or operation before it continues.
    }, 'Outbox processor is already running');
    // This return sends the completed value or response back to the code that called this function.
    return;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am calling this helper here so the current workflow performs this step before it moves on.
  logger.info({
    // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
    event: 'outbox.processor.started',
    // I am keeping this line here because the surrounding outboxProcessor.js workflow expects this value or operation before it continues.
    intervalMs
  // I am keeping this line here because the surrounding outboxProcessor.js workflow expects this value or operation before it continues.
  }, `Starting outbox processor with ${intervalMs}ms interval`);

  // I am defining this small callback here so the surrounding API can run it with the value it supplies.
  intervalId = setInterval(async () => {
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (isProcessing) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      logger.debug({
        // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
        event: 'outbox.processor.skipped_busy'
      // I am keeping this line here because the surrounding outboxProcessor.js workflow expects this value or operation before it continues.
      }, 'Skipping outbox processing - previous batch still running');
      // This return sends the completed value or response back to the code that called this function.
      return;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // I am waiting for this asynchronous step here so the next line does not use its result before it is ready.
    await processBatch();
  // I am keeping this line here because the surrounding outboxProcessor.js workflow expects this value or operation before it continues.
  }, intervalMs);
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * Stop the outbox processor job
 */
function stopOutboxProcessor() {
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (intervalId) {
    // I am updating or clearing this saved state here so the interface reflects the result of the action above.
    clearInterval(intervalId);
    // I am keeping this line here because the surrounding outboxProcessor.js workflow expects this value or operation before it continues.
    intervalId = null;
    
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.info({
      // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
      event: 'outbox.processor.stopped'
    // I am keeping this line here because the surrounding outboxProcessor.js workflow expects this value or operation before it continues.
    }, 'Outbox processor stopped');
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * Process a batch of events
 */
async function processBatch() {
  // I am keeping this line here because the surrounding outboxProcessor.js workflow expects this value or operation before it continues.
  isProcessing = true;
  
  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // I am saving `results` here so the nearby steps can reuse the same value without rebuilding it each time.
    const results = await processPendingEvents(10, 3);
    
    // Log statistics if there were events processed
    if (results.processed > 0 || results.failed > 0) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      logger.info({
        // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
        event: 'outbox.batch_summary',
        // I am keeping the `processed` field in this object so the receiving code can read that value by its expected name.
        processed: results.processed,
        // I am keeping the `failed` field in this object so the receiving code can read that value by its expected name.
        failed: results.failed,
        // I am keeping the `duration` field in this object so the receiving code can read that value by its expected name.
        duration: results.duration
      // I am keeping this line here because the surrounding outboxProcessor.js workflow expects this value or operation before it continues.
      }, `Outbox batch: ${results.processed} processed, ${results.failed} failed`);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // Log overall stats every 10 batches (5 minutes)
    if (Math.random() < 0.1) { // 10% chance
      // I am saving `stats` here so the nearby steps can reuse the same value without rebuilding it each time.
      const stats = await getOutboxStats();
      // I am calling this helper here so the current workflow performs this step before it moves on.
      logger.info({
        // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
        event: 'outbox.stats',
        // I am keeping this line here because the surrounding outboxProcessor.js workflow expects this value or operation before it continues.
        ...stats
      // I am keeping this line here because the surrounding outboxProcessor.js workflow expects this value or operation before it continues.
      }, `Outbox stats: ${stats.total} total, ${stats.pending} pending, ${stats.processed} processed, ${stats.failed} failed`);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (error) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.error({
      // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
      event: 'outbox.processor.error',
      // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
      error: error.message
    // I am keeping this line here because the surrounding outboxProcessor.js workflow expects this value or operation before it continues.
    }, 'Outbox processor error');
  // This final block runs after success or failure so the shared cleanup still happens in either outcome.
  } finally {
    // I am keeping this line here because the surrounding outboxProcessor.js workflow expects this value or operation before it continues.
    isProcessing = false;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * Process events immediately (for testing or manual triggers)
 */
async function processNow() {
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (isProcessing) {
    // I am stopping this path with the existing error here because the caller should not continue with an invalid result.
    throw new Error('Outbox processor is already running');
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am calling this helper here so the current workflow performs this step before it moves on.
  logger.info({
    // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
    event: 'outbox.processor.manual_trigger'
  // I am keeping this line here because the surrounding outboxProcessor.js workflow expects this value or operation before it continues.
  }, 'Manual outbox processing triggered');

  // I am waiting for this asynchronous step here so the next line does not use its result before it is ready.
  await processBatch();
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * Get processor status
 */
function getProcessorStatus() {
  // This return sends the completed value or response back to the code that called this function.
  return {
    // I am keeping the `running` field in this object so the receiving code can read that value by its expected name.
    running: !!intervalId,
    // I am keeping the `processing` field in this object so the receiving code can read that value by its expected name.
    processing: isProcessing,
    // I am keeping the `intervalId` field in this object so the receiving code can read that value by its expected name.
    intervalId: intervalId ? 'active' : null
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  };
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// Graceful shutdown
process.on('SIGTERM', () => {
  // I am calling this helper here so the current workflow performs this step before it moves on.
  logger.info({
    // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
    event: 'outbox.processor.shutdown'
  // I am keeping this line here because the surrounding outboxProcessor.js workflow expects this value or operation before it continues.
  }, 'Shutting down outbox processor');
  // I am calling this helper here so the current workflow performs this step before it moves on.
  stopOutboxProcessor();
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
});

// I am defining this small callback here so the surrounding API can run it with the value it supplies.
process.on('SIGINT', () => {
  // I am calling this helper here so the current workflow performs this step before it moves on.
  logger.info({
    // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
    event: 'outbox.processor.shutdown'
  // I am keeping this line here because the surrounding outboxProcessor.js workflow expects this value or operation before it continues.
  }, 'Shutting down outbox processor');
  // I am calling this helper here so the current workflow performs this step before it moves on.
  stopOutboxProcessor();
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
});

// I am exporting this value here so another module can deliberately reuse the completed piece from outboxProcessor.js.
module.exports = {
  // I am keeping this line here because the surrounding outboxProcessor.js workflow expects this value or operation before it continues.
  startOutboxProcessor,
  // I am keeping this line here because the surrounding outboxProcessor.js workflow expects this value or operation before it continues.
  stopOutboxProcessor,
  // I am keeping this line here because the surrounding outboxProcessor.js workflow expects this value or operation before it continues.
  processNow,
  // I am keeping this line here because the surrounding outboxProcessor.js workflow expects this value or operation before it continues.
  getProcessorStatus
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
};
