/**
 * File: server/middleware/security/cspNonce.js
 * Description: Adds a per-request CSP nonce and a strict Content-Security-Policy header.
 * Notes: Keep sources tight. Add hosts only if a page truly needs them.
 *
 * WHAT:
 * Generates a random nonce for every request and sends a CSP that only allows
 * scripts with that nonce to run.
 *
 * WHY:
 * Reduces XSS risk. Blocks inline or third-party scripts unless you allow them.
 *
 * HOW:
 * 1) Mount this middleware before routes.
 * 2) Add nonce="<%= cspNonce %>" to all <script> tags in EJS.
 * 3) If a page needs a host (e.g., analytics), add that host to script-src.
 */

const crypto = require('crypto');
const helmet = require('helmet');

module.exports = function cspWithNonce() {
  return (req, res, next) => {
    // ============================================================
    // Generate unique nonce for this request
    // ============================================================
    const nonce = crypto.randomBytes(16).toString('base64');
    res.locals.cspNonce = nonce;
    res.locals.nonce = nonce; // Backwards compatibility with existing templates

    // ============================================================
    // Apply Helmet CSP with nonce
    // ============================================================
    helmet.contentSecurityPolicy({
      useDefaults: false,
      directives: {
        // ============================================================
        // Default source: only self
        // ============================================================
        defaultSrc: ["'self'"],
        
        // ============================================================
        // Script sources: self + nonce + required CDN
        // ============================================================
        // Only allow our scripts (nonce) plus Supabase CDN (required for client lib).
        // Future: self-host Supabase client to remove this CDN dependency.
        scriptSrc: ["'self'", `'nonce-${nonce}'`, "https://cdn.jsdelivr.net"],
        
        // ============================================================
        // Style sources
        // ============================================================
        // Keep 'unsafe-inline' until all inline styles are moved to CSS
        styleSrc: ["'self'", "'unsafe-inline'"],
        
        // ============================================================
        // Image sources
        // ============================================================
        imgSrc: ["'self'", "data:", "https:"],
        
        // ============================================================
        // Font sources
        // ============================================================
        fontSrc: ["'self'", "https:", "data:"],
        
        // ============================================================
        // Connect sources (API calls)
        // ============================================================
        connectSrc: [
          "'self'", 
          "https://*.supabase.co", 
          "https://analytics.google.com", 
          "https://www.google-analytics.com"
        ],
        
        // ============================================================
        // Frame sources
        // ============================================================
        frameSrc: ["'self'"],
        
        // ============================================================
        // Strict defaults
        // ============================================================
        objectSrc: ["'none'"],
        baseUri: ["'none'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'", "https://*.supabase.co"],
      }
    })(req, res, next);
  };
};

