/**
 * File: server/middleware/securityHeaders.js
 * Description: Helmet setup with tight defaults and CSP allowlisting Supabase.
 *
 * WHAT:
 * Applies security headers via Helmet to protect against common web vulnerabilities
 * (clickjacking, XSS, MIME sniffing, etc.).
 *
 * WHY:
 * Security headers are a foundational defense layer. They tell browsers to enforce
 * strict policies even if our code has vulnerabilities.
 *
 * HOW:
 * Uses Helmet with conservative defaults. CSP allows Supabase API calls and self-hosted
 * assets. If a header causes issues, we can adjust it here in one place.
 */

const helmet = require('helmet');

module.exports = function securityHeaders() {
  return helmet({
    // ============================================================
    // Hide X-Powered-By header
    // ============================================================
    // Prevents revealing Express/Node version to attackers
    hidePoweredBy: true,

    // ============================================================
    // Block iframing by default (clickjacking protection)
    // ============================================================
    frameguard: { action: 'deny' },

    // ============================================================
    // Content Security Policy (CSP)
    // ============================================================
    // Conservative defaults; allow Supabase API calls
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        connectSrc: ["'self'", process.env.SUPABASE_URL || ''],
        scriptSrc: ["'self'"], // Add your CDN if you use one
        imgSrc: ["'self'", 'data:'],
        styleSrc: ["'self'", "'unsafe-inline'"], // Tighten later if you nonce styles
        objectSrc: ["'none'"]
      }
    },

    // ============================================================
    // Referrer Policy
    // ============================================================
    // Only send origin on cross-origin requests
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },

    // ============================================================
    // Cross-Origin Policies
    // ============================================================
    crossOriginOpenerPolicy: { policy: 'same-origin' },
    crossOriginResourcePolicy: { policy: 'same-origin' },
    
    // ============================================================
    // DNS Prefetch Control
    // ============================================================
    xDnsPrefetchControl: { allow: false }
  });
};

