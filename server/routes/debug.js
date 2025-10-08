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
const toggles = require('../config/toggles');

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
  res.json({
    env: toggles.env,
    logLevel: toggles.logLevel,
    blockCmsScans: toggles.blockCmsScans,
    corsDebug: toggles.corsDebug,
    exposeDebugRoutes: toggles.exposeDebugRoutes,
    node: process.version,
  });
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

module.exports = router;
