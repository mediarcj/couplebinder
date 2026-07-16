// Description: Inject app configuration into res.locals for templates
// Purpose: Ensure config is always available to views in dev and production
// Notes: Safe for CSP (no inline script), config via data attributes

const { ASSET_VERSION } = require('../config');

/**
 * Inject app configuration into res.locals for use in templates.
 *
 * Production and dev need consistent access to Supabase config and asset versioning.
 * This ensures the config element and asset version are always rendered on every page.
 *
 * Read from config and attach to res.locals.APP_CONFIG and res.locals.assetVersion.
 * Templates can then render <meta id="app-config" data-*="<%= APP_CONFIG.* %>">
 * and use <%= assetVersion %> for cache-busting.
 */

function appConfig(req, res, next) {
  const { config } = require('../config');
  
  res.locals.APP_CONFIG = {
    SUPABASE_URL: config.supabase.url || '',
    SUPABASE_ANON_KEY: config.supabase.anonKey || '',
    NODE_ENV: config.server.nodeEnv || 'production'
  };
  
  // Set asset version for cache-busting (used by all templates)
  res.locals.assetVersion = ASSET_VERSION;
  
  next();
}

module.exports = appConfig;

