/**
 * File: server/middleware/methodGuard.js
 * Description: Block odd HTTP verbs and return 405 for unsupported methods.
 *
 * WHAT:
 * Rejects HTTP methods that are not needed by our application and blocks
 * suspicious methods used in attacks or scans.
 *
 * WHY:
 * Methods like PROPFIND, TRACE, and TRACK are used by scanners and WebDAV attacks.
 * Blocking them early reduces attack surface and log noise.
 *
 * HOW:
 * Maintains a blocklist of dangerous methods and an allowlist of standard HTTP methods.
 * Returns 405 Method Not Allowed for anything else. This runs before any route logic.
 */

const BLOCKED = new Set(['PROPFIND', 'SEARCH', 'TRACE', 'TRACK']);
// I am saving `ALLOWED` here so the nearby steps can reuse the same value without rebuilding it each time.
const ALLOWED = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']);

// I am exporting this value here so another module can deliberately reuse the completed piece from methodGuard.js.
module.exports = function methodGuard() {
  // This return sends the completed value or response back to the code that called this function.
  return function (req, res, next) {
    // ============================================================
    // Block known dangerous methods
    // ============================================================
    if (BLOCKED.has(req.method)) {
      // This return sends the completed value or response back to the code that called this function.
      return res.status(405).send('Method Not Allowed');
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    
    // ============================================================
    // Reject any method not in our allowlist
    // ============================================================
    if (!ALLOWED.has(req.method)) {
      // This return sends the completed value or response back to the code that called this function.
      return res.status(405).send('Method Not Allowed');
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    
    // I am calling this helper here so the current workflow performs this step before it moves on.
    next();
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  };
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
};

