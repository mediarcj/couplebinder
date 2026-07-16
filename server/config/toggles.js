// File: server/config/toggles.js
// Description: Server toggles (feature flags for ops) - env-driven with sane defaults
// Purpose: Safe, auditable, deploy-friendly feature flags for production operations
// Notes: Read once at boot (12-factor style), no external dependencies

/**
 * WHAT:
 * Minimal feature flag system for operational toggles.
 * 
 * WHY:
 * Allow ops/devops to enable/disable features without code changes.
 * Useful for debugging, gradual rollouts, and incident response.
 * 
 * HOW:
 * Read environment variables at boot time with sensible defaults.
 * Use simple boolean and string parsers for consistency.
 */

// Truthy and falsy string sets for consistent parsing
const truthy = new Set(['1', 'true', 'yes', 'on', 'y']);
// I am saving `falsy` here so the nearby steps can reuse the same value without rebuilding it each time.
const falsy = new Set(['0', 'false', 'no', 'off', 'n']);

/**
 * Parse boolean environment variable
 * @param {string} name - Environment variable name
 * @param {boolean} def - Default value if not set
 * @returns {boolean}
 */

function bool(name, def = false) {
  // I am saving `v` here so the nearby steps can reuse the same value without rebuilding it each time.
  const v = (process.env[name] ?? '').trim().toLowerCase();
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (v === '') return def;
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (truthy.has(v)) return true;
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (falsy.has(v)) return false;
  // Fallback: any non-empty string enables
  return true;
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * Parse string environment variable
 * @param {string} name - Environment variable name
 * @param {string} def - Default value if not set
 * @returns {string}
 */
function str(name, def = '') {
  // I am saving `v` here so the nearby steps can reuse the same value without rebuilding it each time.
  const v = process.env[name];
  // This return sends the completed value or response back to the code that called this function.
  return (v === undefined || v === '') ? def : v;
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * Server toggles (feature flags)
 * 
 * WHAT:
 * Configuration object with all operational toggles.
 * 
 * WHY:
 * Single source of truth for feature flags across the application.
 * 
 * HOW:
 * Each toggle is parsed from environment variables with sensible defaults.
 * Defaults are chosen for security and production-safety.
 */
const toggles = {
  // Environment and logging
  env: str('NODE_ENV', 'production'),
  // I am keeping the `logLevel` field in this object so the receiving code can read that value by its expected name.
  logLevel: str('LOG_LEVEL', 'info'),

  // Security/traffic hygiene
  blockCmsScans: bool('BLOCK_CMS_SCANS', true), // 404 common WP/PHP probes

  // CORS troubleshooting (noisy, keep off unless needed)
  corsDebug: bool('CORS_DEBUG', false),

  // Off-by-default internal endpoints. Only enable when you *really* need it.
  exposeDebugRoutes: bool('EXPOSE_DEBUG_ROUTES', false),

  // Feature flags for user-facing features
  billing: bool('BILLING_ENABLED', true),   // Stripe billing (default on)
  register: bool('SIGNUP_ENABLED', true),   // User registration (default on, env var kept for backward compatibility)
  pricing: bool('PRICING_ENABLED', false),  // Pricing page (default off, hidden until ready)
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
};

// I am exporting this value here so another module can deliberately reuse the completed piece from toggles.js.
module.exports = toggles;

