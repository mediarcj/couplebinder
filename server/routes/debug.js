// File: server/routes/debug.js
// Description: Guarded debug router (off by default) for operational visibility
// Purpose: Safe introspection endpoints for ops/devops troubleshooting
// Notes: Only enabled when EXPOSE_DEBUG_ROUTES=true, never in production by default

/**
 * WHAT:
 * Debug routes for operational visibility.
 * 
 * WHY:
 * Ops/devops need visibility into feature flags and basic health
 * without exposing sensitive data or creating security risks.
 * 
 * HOW:
 * Provide minimal, safe endpoints that expose only non-sensitive info.
 * Never dump environment variables or secrets.
 */

const express = require('express');
// I am loading `../config/toggles` into `toggles` so this file can reuse that dependency below.
const toggles = require('../config/toggles');

// I am saving `router` here so the nearby steps can reuse the same value without rebuilding it each time.
const router = express.Router();

/**
 * GET /_debug/flags
 * 
 * WHAT:
 * Return current feature flag values.
 * 
 * WHY:
 * Verify which toggles are active in a deployed environment.
 * 
 * HOW:
 * Return JSON with current toggle values (safe, no secrets).
 */
router.get('/flags', (_req, res) => {
  // I am building or sending the Express response here with the status, data, or page already chosen by this route.
  res.json({
    // I am keeping the `env` field in this object so the receiving code can read that value by its expected name.
    env: toggles.env,
    // I am keeping the `logLevel` field in this object so the receiving code can read that value by its expected name.
    logLevel: toggles.logLevel,
    // I am keeping the `blockCmsScans` field in this object so the receiving code can read that value by its expected name.
    blockCmsScans: toggles.blockCmsScans,
    // I am keeping the `corsDebug` field in this object so the receiving code can read that value by its expected name.
    corsDebug: toggles.corsDebug,
    // I am keeping the `exposeDebugRoutes` field in this object so the receiving code can read that value by its expected name.
    exposeDebugRoutes: toggles.exposeDebugRoutes,
    // I am keeping the `node` field in this object so the receiving code can read that value by its expected name.
    node: process.version,
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
});

/**
 * GET /_debug/ping
 * 
 * WHAT:
 * Simple ping endpoint.
 * 
 * WHY:
 * Verify debug routes are accessible when enabled.
 * 
 * HOW:
 * Return simple JSON with ok: true.
 */
router.get('/ping', (_req, res) => res.json({ ok: true }));

// I am exporting this value here so another module can deliberately reuse the completed piece from debug.js.
module.exports = router;
