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
const falsy = new Set(['0', 'false', 'no', 'off', 'n']);

/**
 * Parse boolean environment variable
 * @param {string} name - Environment variable name
 * @param {boolean} def - Default value if not set
 * @returns {boolean}
 */

function bool(name, def = false) {
  const v = (process.env[name] ?? '').trim().toLowerCase();
  if (v === '') return def;
  if (truthy.has(v)) return true;
  if (falsy.has(v)) return false;
  // Fallback: any non-empty string enables
  return true;
}

/**
 * Parse string environment variable
 * @param {string} name - Environment variable name
 * @param {string} def - Default value if not set
 * @returns {string}
 */
function str(name, def = '') {
  const v = process.env[name];
  return (v === undefined || v === '') ? def : v;
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
};

module.exports = toggles;

