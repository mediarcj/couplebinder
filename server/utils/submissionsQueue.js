// File: server/utils/submissionsQueue.js
// Description: Promise-based queue for atomic submissions operations
// Purpose: Provides clean concurrency control without busy-waiting
// Notes: Single-instance queue for development; for horizontal scaling, use DB atomic operations

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
 */

let queue = Promise.resolve();

/**
 * Enqueue an operation to ensure atomic execution
 * @param {Function} operation - Async function to execute atomically
 * @returns {Promise} Promise that resolves with operation result
 */
function enqueue(operation) {
  return new Promise((resolve, reject) => {
    queue = queue.then(async () => {
      try {
        const result = await operation();
        resolve(result);
        return result;
      } catch (error) {
        reject(error);
        throw error; // Re-throw to maintain queue integrity
      }
    }).catch((error) => {
      // Log error but don't break the queue
      console.error('Queue operation failed:', error.message);
    });
  });
}

module.exports = { enqueue };
