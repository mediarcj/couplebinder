/**
 * File: server/middleware/corsAllowlist.js
 * Description: Strict CORS allowlist. All others receive an error.
 *
 * WHAT:
 * Configures CORS to only allow requests from explicitly approved origins.
 *
 * WHY:
 * We never trust the client. Only our own domains should be able to make
 * cross-origin requests to our API. This prevents unauthorized sites from
 * accessing user data or making API calls on behalf of users.
 *
 * HOW:
 * Maintains a strict allowlist of approved origins. Denies all others with an error.
 * Supports credentials (cookies) and standard HTTP methods.
 * For non-browser requests (no Origin header), we deny by default to be safe.
 */

const cors = require('cors');

// ============================================================
// Approved origins (production domains)
// ============================================================
const ALLOW = new Set([
  'https://detechify.com',
  'https://www.detechify.com',
  'https://app.detechify.com'
]);

module.exports = cors({
  origin(origin, cb) {
    // ============================================================
    // No Origin header: non-browser request
    // ============================================================
    // Treat as non-browser; do not enable CORS (safer default)
    if (!origin) return cb(null, false);
    
    // ============================================================
    // Check against allowlist
    // ============================================================
    if (ALLOW.has(origin)) return cb(null, true);
    
    // ============================================================
    // Deny all other origins
    // ============================================================
    cb(new Error('Not allowed by CORS policy'));
  },
  
  // ============================================================
  // Allow credentials (cookies, authorization headers)
  // ============================================================
  credentials: true,
  
  // ============================================================
  // Allowed HTTP methods
  // ============================================================
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  
  // ============================================================
  // Allowed request headers
  // ============================================================
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
  
  // ============================================================
  // Cache preflight for 10 minutes
  // ============================================================
  maxAge: 600
});

