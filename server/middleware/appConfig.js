// File: server/middleware/appConfig.js
// Description: Inject app configuration into res.locals for templates
// Purpose: Ensure config is always available to views in dev and production
// Notes: Safe for CSP (no inline script), config via data attributes

const { ASSET_VERSION } = require('../config');

/**
 * WHAT:
 * Inject app configuration into res.locals for use in templates.
 *
 * WHY:
 * Production and dev need consistent access to Supabase config and asset versioning.
 * This ensures the config element and asset version are always rendered on every page.
 *
 * HOW:
 * Read from config and attach to res.locals.APP_CONFIG and res.locals.assetVersion.
 * Templates can then render <meta id="app-config" data-*="<%= APP_CONFIG.* %>">
 * and use <%= assetVersion %> for cache-busting.
 */

function appConfig(req, res, next) {
  // I am loading `../config` into `config` so this file can reuse that dependency below.
  const { config } = require('../config');
  
  // I am keeping this line here because the surrounding appConfig.js workflow expects this value or operation before it continues.
  res.locals.APP_CONFIG = {
    // I am keeping the `SUPABASE_URL` field in this object so the receiving code can read that value by its expected name.
    SUPABASE_URL: config.supabase.url || '',
    // I am keeping the `SUPABASE_ANON_KEY` field in this object so the receiving code can read that value by its expected name.
    SUPABASE_ANON_KEY: config.supabase.anonKey || '',
    // I am keeping the `NODE_ENV` field in this object so the receiving code can read that value by its expected name.
    NODE_ENV: config.server.nodeEnv || 'production'
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  };
  
  // Set asset version for cache-busting (used by all templates)
  res.locals.assetVersion = ASSET_VERSION;
  
  // I am calling this helper here so the current workflow performs this step before it moves on.
  next();
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am exporting this value here so another module can deliberately reuse the completed piece from appConfig.js.
module.exports = appConfig;

