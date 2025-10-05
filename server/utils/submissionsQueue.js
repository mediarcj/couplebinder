// File: server/utils/submissionsQueue.js
// Description: Promise-based queue for atomic submissions operations
// Purpose: Provides clean concurrency control without busy-waiting
// Notes: Single-instance queue for development; for horizontal scaling, use DB atomic operations

/**
 * WHAT:
 * We provide a promise-based queue that ensures atomic operations
 * without busy-waiting or spin-locks.
 * 
 * WHY:
 * The previous busy-wait mutex pattern works but is noisy and inefficient.
 * This approach is cleaner and more maintainable.
 * 
 * HOW:
 * We maintain a chain of promises, where each operation waits for
 * the previous one to complete before executing.
 * 
 * SCALING NOTE:
 * If we scale horizontally (multiple server instances), we MUST use
 * the DB atomic approach instead of this in-memory queue.
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
