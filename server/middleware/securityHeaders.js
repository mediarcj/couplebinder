/**
 * File: server/middleware/securityHeaders.js
 * Description: Strict security headers with nonce-based CSP
 *
 * WHAT:
 * Applies hardened security headers via Helmet with strict CSP that eliminates unsafe-inline.
 * Uses nonce-based approach for scripts and styles to prevent XSS attacks.
 *
 * WHY:
 * unsafe-inline weakens CSP protection. Nonce-based policies provide strong XSS defense
 * while allowing necessary inline code that we control.
 *
 * HOW:
 * Generates a unique nonce per request and configures Helmet with strict CSP directives.
 * Templates must use <%= cspNonce %> for inline scripts/styles.
 */

const helmet = require('helmet');
const crypto = require('crypto');
const logger = require('../utils/logger');

/**
 * Generate CSP nonce middleware
 * MUST run before securityHeaders middleware
 */
function generateCspNonce() {
  return (req, res, next) => {
    const nonce = crypto.randomBytes(16).toString('base64');
    res.locals.cspNonce = nonce;
    res.locals.nonce = nonce; // Backwards compatibility with existing templates
    next();
  };
}

/**
 * Strict security headers with nonce-based CSP
 */
function securityHeaders() {
  // Extract Supabase origin for CSP connectSrc
  let supabaseOrigin = '';
  // Include both HTTPS and WSS protocols for real-time subscriptions
  let supabaseWss = null;
  try {
    if (process.env.SUPABASE_URL) {
      const url = new URL(process.env.SUPABASE_URL);
      supabaseOrigin = url.origin;
      supabaseWss = `wss://${url.hostname}`;
    }
  } catch (err) {
    logger.warn({
      event: 'security_headers.supabase_url_parse.failed',
      error: err.message
    }, 'Could not parse SUPABASE_URL for CSP');
  }

  return helmet({
    // Hide X-Powered-By header
    hidePoweredBy: true,

    // Block iframing (clickjacking protection)
    frameguard: { action: 'deny' },

    // Strict Content Security Policy (no unsafe-inline)
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        // Default deny-all, then explicitly allow what we need
        defaultSrc: ["'none'"],
        
        // Base URI restricted to same origin
        baseUri: ["'self'"],
        
        // Scripts: self-hosted + nonce + strict-dynamic for modern browsers
        // Self-hosted assets only - no external CDN dependencies
        scriptSrc: [
          "'self'",
          (req, res) => `'nonce-${res.locals.cspNonce}'`,
          "'strict-dynamic'"
        ],
        
        // Styles: self-hosted + nonce (no unsafe-inline)
        styleSrc: [
          "'self'",
          (req, res) => `'nonce-${res.locals.cspNonce}'`
        ],
        
        // Images: self-hosted + data URIs (for inline images)
        imgSrc: ["'self'", 'data:'],
        
        // Fonts: self-hosted only
        fontSrc: ["'self'"],
        
        // AJAX/WebSocket: self + Supabase (HTTPS and WSS)
        connectSrc: ["'self'", supabaseOrigin, supabaseWss].filter(Boolean),
        
        // No iframes allowed
        frameAncestors: ["'none'"],
        
        // No plugins (Flash, Java, etc.)
        objectSrc: ["'none'"],
        
        // Upgrade all HTTP requests to HTTPS
        upgradeInsecureRequests: []
      }
    },

    // Referrer Policy
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },

    // Cross-Origin Policies
    crossOriginOpenerPolicy: { policy: 'same-origin' },
    crossOriginResourcePolicy: { policy: 'same-origin' },
    
    // DNS Prefetch Control
    xDnsPrefetchControl: { allow: false }
  });
}

module.exports = { generateCspNonce, securityHeaders };
