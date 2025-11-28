// File: server/utils/submissionsQueue.js
// Description: Promise-based queue for atomic submissions operations
// Purpose: Provides clean concurrency control without busy-waiting
// Notes: Single-instance queue for development; for horizontal scaling, use DB atomic operations

const logger = require('./logger');

/**
 * WHAT:
 * This is an in-memory promise-based queue that ensures atomic operations
 * within a single Node.js process. It serializes submission operations to
 * prevent race conditions and ensure data consistency.
 * 
 * WHY:
 * The previous busy-wait mutex pattern works but is noisy and inefficient.
 * This approach is cleaner and more maintainable for single-instance deployments.
 * It provides serialization without busy-waiting or spin-locks.
 * 
 * HOW:
 * We maintain a chain of promises, where each operation waits for
 * the previous one to complete before executing. This ensures operations
 * run one at a time in the order they were enqueued.
 * 
 * LIMITATION - SINGLE INSTANCE ONLY:
 * This queue is NOT multi-instance safe. If the application runs on multiple
 * server instances or processes (horizontal scaling), each instance will have
 * its own separate queue. This can introduce race conditions, duplicate processing,
 * or inconsistent behavior across instances.
 * 
 * FUTURE MIGRATION PATH:
 * For real horizontal scaling, this must be migrated to a Redis-backed queue
 * (or similar distributed queue system) so that all instances share the same
 * queue state and operations are serialized across the entire deployment.
 * 
 * See docs/REDIS_MIGRATION_PLAN.md for the complete design and migration steps.
 */

let queue = Promise.resolve();

/**
 * WHAT:
 * Enqueue an async operation to ensure atomic execution within the queue.
 * 
 * WHY:
 * Serializes operations so they run one at a time, preventing race conditions
 * on shared resources like database writes.
 * 
 * HOW:
 * Chains operations onto an internal promise queue. If an operation fails,
 * the caller's promise rejects (so they see the error), but the queue chain
 * continues from a resolved state so later operations can still execute.
 * 
 * @param {Function} operation - Async function to execute atomically
 * @returns {Promise} Promise that resolves with operation result or rejects with operation error
 */
function enqueue(operation) {
  // Create a promise that will be resolved/rejected based on the operation result
  let resolveCaller, rejectCaller;
  const callerPromise = new Promise((resolve, reject) => {
    resolveCaller = resolve;
    rejectCaller = reject;
  });

  // Chain the operation onto the queue
  queue = queue
    .then(async () => {
      try {
        // Execute the operation
        const result = await operation();
        // Resolve the caller's promise with the result
        resolveCaller(result);
        // Return result to keep the queue chain resolved
        return result;
      } catch (error) {
        // Log the error for observability
        logger.error({
          event: 'submissions.queue.operation_failed',
          error: error.message,
          stack: error.stack
        }, 'Queue operation failed');
        
        // Reject the caller's promise so they see the error
        rejectCaller(error);
        
        // Re-throw to maintain queue chain, but we'll catch it below
        throw error;
      }
    })
    .catch((error) => {
      // If the queue chain itself fails (shouldn't happen after our try/catch,
      // but safety net), log it and ensure the chain continues from a resolved state
      logger.error({
        event: 'submissions.queue.chain_error',
        error: error.message
      }, 'Queue chain error (unexpected)');
      
      // Return undefined to keep the chain resolved, allowing future operations
      return undefined;
    });

  // Return the caller's promise (they'll see success or failure)
  return callerPromise;
}

module.exports = { enqueue };
