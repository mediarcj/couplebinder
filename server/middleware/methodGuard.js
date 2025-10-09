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
const ALLOWED = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']);

module.exports = function methodGuard() {
  return function (req, res, next) {
    // ============================================================
    // Block known dangerous methods
    // ============================================================
    if (BLOCKED.has(req.method)) {
      return res.status(405).send('Method Not Allowed');
    }
    
    // ============================================================
    // Reject any method not in our allowlist
    // ============================================================
    if (!ALLOWED.has(req.method)) {
      return res.status(405).send('Method Not Allowed');
    }
    
    next();
  };
};

