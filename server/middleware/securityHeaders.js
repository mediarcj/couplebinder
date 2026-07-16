/**
 * File: server/middleware/securityHeaders.js
 * Description: Strict security headers with nonce-based CSP
 *
 * WHAT:
 * Applies hardened security headers via Helmet with strict CSP that eliminates unsafe-inline.
 * Uses nonce-based approach for scripts and styles to prevent XSS attacks.
 * Exception: style-src-attr allows 'unsafe-inline' for Chrome PDF viewer compatibility.
 *
 * WHY:
 * unsafe-inline weakens CSP protection. Nonce-based policies provide strong XSS defense
 * while allowing necessary inline code that we control.
 * Chrome's built-in PDF viewer (used in blob: iframes) requires inline style attributes
 * to resize itself, so we allow style-src-attr 'unsafe-inline' globally.
 * This only affects style attributes (style="..."), not <style> tags, which remain protected.
 *
 * HOW:
 * Generates a unique nonce per request and configures Helmet with strict CSP directives.
 * Templates must use <%= cspNonce %> for inline scripts/styles.
 * styleSrcAttr is set to allow 'unsafe-inline' to support Chrome PDF viewer in blob: iframes.
 */

const helmet = require('helmet');
// I am loading `crypto` into `crypto` so this file can reuse that dependency below.
const crypto = require('crypto');
// I am loading `../utils/logger` into `logger` so this file can reuse that dependency below.
const logger = require('../utils/logger');
// I am loading `../config` into `config` so this file can reuse that dependency below.
const { config } = require('../config');

// I am saving `TURNSTILE_ORIGIN` here so the nearby steps can reuse the same value without rebuilding it each time.
const TURNSTILE_ORIGIN = 'https://challenges.cloudflare.com';

// I am saving `STORAGE_PUBLIC_ORIGIN` here so the nearby steps can reuse the same value without rebuilding it each time.
let STORAGE_PUBLIC_ORIGIN = '';
// I am starting a guarded operation here because a request, parser, or dependency used below may fail.
try {
  // I am saving `rawPublicBase` here so the nearby steps can reuse the same value without rebuilding it each time.
  const rawPublicBase = (config?.storage?.s3?.publicBaseUrl || '').trim();
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (rawPublicBase) {
    // I am saving `u` here so the nearby steps can reuse the same value without rebuilding it each time.
    const u = new URL(rawPublicBase);
    // I am keeping this line here because the surrounding securityHeaders.js workflow expects this value or operation before it continues.
    STORAGE_PUBLIC_ORIGIN = u.origin;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
} catch (err) {
  // I am calling this helper here so the current workflow performs this step before it moves on.
  logger.warn(
    // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
    {
      // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
      event: 'security_headers.storage_public_origin_parse_failed',
      // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
      error: err.message
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    },
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    'Could not parse storage public base URL for CSP'
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  );
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * Generate CSP nonce middleware
 * MUST run before securityHeaders middleware
 */
function generateCspNonce() {
  // This return sends the completed value or response back to the code that called this function.
  return function cspNonceMiddleware(req, res, next) {
    // I am saving `nonce` here so the nearby steps can reuse the same value without rebuilding it each time.
    const nonce = crypto.randomBytes(16).toString('base64');

    // Canonical name used across the app:
    res.locals.nonce = nonce;

    // Backwards-compatible alias (optional but safe):
    res.locals.cspNonce = nonce;

    // This return sends the completed value or response back to the code that called this function.
    return next();
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  };
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * Strict security headers with nonce-based CSP
 */
function securityHeaders() {
  // Extract Supabase origin for CSP connectSrc
  let supabaseOrigin = '';
  // Include both HTTPS and WSS protocols for real-time subscriptions
  let supabaseWss = null;
  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // I am saving `supabaseUrl` here so the nearby steps can reuse the same value without rebuilding it each time.
    const supabaseUrl = config?.supabase?.url;
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (supabaseUrl) {
      // I am saving `url` here so the nearby steps can reuse the same value without rebuilding it each time.
      const url = new URL(supabaseUrl);
      // I am keeping this line here because the surrounding securityHeaders.js workflow expects this value or operation before it continues.
      supabaseOrigin = url.origin;
      // I am keeping this line here because the surrounding securityHeaders.js workflow expects this value or operation before it continues.
      supabaseWss = `wss://${url.hostname}`;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (err) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.warn({
      // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
      event: 'security_headers.supabase_url_parse.failed',
      // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
      error: err.message
    // I am keeping this line here because the surrounding securityHeaders.js workflow expects this value or operation before it continues.
    }, 'Could not parse Supabase URL for CSP');
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // This return sends the completed value or response back to the code that called this function.
  return helmet({
    // Hide X-Powered-By header
    hidePoweredBy: true,

    // Block iframing (clickjacking protection)
    frameguard: { action: 'deny' },

    // Strict Content Security Policy (no unsafe-inline)
    contentSecurityPolicy: {
      // I am keeping the `useDefaults` field in this object so the receiving code can read that value by its expected name.
      useDefaults: false,
      // I am keeping the `directives` field in this object so the receiving code can read that value by its expected name.
      directives: {
        // Default deny-all, then explicitly allow what we need
        defaultSrc: ["'none'"],
        
        // Base URI restricted to same origin
        baseUri: ["'self'"],
        
        // Scripts: self-hosted + nonce (no strict-dynamic to allow external script src tags)
        // Self-hosted assets only - no external CDN dependencies
        // Note: strict-dynamic ignores 'self', which blocks external script src tags.
        // We use 'self' + nonce instead, which is still secure (nonces for inline, self for external).
        scriptSrc: [
          // I am listing this entry here because the surrounding collection processes each allowed value in order.
          "'self'",
          // I am keeping this line here because the surrounding securityHeaders.js workflow expects this value or operation before it continues.
          (req, res) => `'nonce-${res.locals.cspNonce}'`,
          // I am keeping this line here because the surrounding securityHeaders.js workflow expects this value or operation before it continues.
          TURNSTILE_ORIGIN
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        ],
        
        // Styles: self-hosted + nonce (no unsafe-inline)
        styleSrc: [
          // I am listing this entry here because the surrounding collection processes each allowed value in order.
          "'self'",
          // I am keeping this line here because the surrounding securityHeaders.js workflow expects this value or operation before it continues.
          (req, res) => `'nonce-${res.locals.cspNonce}'`
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        ],
        
        // Style attributes: allow unsafe-inline so Chrome PDF viewer can resize
        // This affects only style attributes (style="..."), not <style> tags.
        // <style> tags are still protected by the nonce-based styleSrc above.
        // This is needed for Chrome's built-in PDF viewer in blob: iframes.
        styleSrcAttr: ["'unsafe-inline'"],
        
        // Images: self-hosted + data URIs + Stripe product images + S3 uploads
        imgSrc: [
          // I am listing this entry here because the surrounding collection processes each allowed value in order.
          "'self'",
          // I am listing this entry here because the surrounding collection processes each allowed value in order.
          'data:',
          // I am listing this entry here because the surrounding collection processes each allowed value in order.
          'https://files.stripe.com',
          // I am listing this entry here because the surrounding collection processes each allowed value in order.
          'https://*.stripe.com',
          // If you configured a specific public S3 base URL, allow that exact origin
          ...(STORAGE_PUBLIC_ORIGIN ? [STORAGE_PUBLIC_ORIGIN] : []),
          // Fallback: allow generic S3 if you still need it
          'https://*.amazonaws.com'
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        ],

        // Fonts: self-hosted only
        fontSrc: ["'self'"],
        
        // AJAX/WebSocket: self + Supabase (HTTPS and WSS)
        connectSrc: ["'self'", supabaseOrigin, supabaseWss, TURNSTILE_ORIGIN].filter(Boolean),

        // I am keeping the `frameSrc` field in this object so the receiving code can read that value by its expected name.
        frameSrc: ["'self'", "blob:", TURNSTILE_ORIGIN],
        
        // No iframes allowed
        frameAncestors: ["'none'"],
        
        // No plugins (Flash, Java, etc.)
        objectSrc: ["'none'"],
        
        // Upgrade all HTTP requests to HTTPS
        upgradeInsecureRequests: []
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    },

    // Referrer Policy
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },

    // Cross-Origin Policies
    crossOriginOpenerPolicy: { policy: 'same-origin' },
    // I am keeping the `crossOriginResourcePolicy` field in this object so the receiving code can read that value by its expected name.
    crossOriginResourcePolicy: { policy: 'same-origin' },
    
    // DNS Prefetch Control
    xDnsPrefetchControl: { allow: false }
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am exporting this value here so another module can deliberately reuse the completed piece from securityHeaders.js.
module.exports = { generateCspNonce, securityHeaders };
