// File: server/middleware/appConfig.js
// Description: Inject app configuration into res.locals for templates
// Purpose: Ensure config is always available to views in dev and production
// Notes: Safe for CSP (no inline script), config via data attributes

/**
 * WHAT:
 * Inject app configuration into res.locals for use in templates.
 *
 * WHY:
 * Production and dev need consistent access to Supabase config.
 * This ensures the config element is always rendered on every page.
 *
 * HOW:
 * Read from process.env and attach to res.locals.APP_CONFIG.
 * Templates can then render <meta id="app-config" data-*="<%= APP_CONFIG.* %>">
 */

function appConfig(req, res, next) {
  res.locals.APP_CONFIG = {
    SUPABASE_URL: process.env.SUPABASE_URL || '',
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || '',
    NODE_ENV: process.env.NODE_ENV || 'production'
  };
  next();
}

module.exports = appConfig;

