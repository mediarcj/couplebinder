// File: server/routes/health.js
// Description: Health check endpoints for monitoring and status
// Purpose: Provides server health, liveness, and readiness status for deployment monitoring
// Notes: Used by load balancers, monitoring systems, and deployment tools

const express = require('express');
const router = express.Router();

/**
 * GET /health
 * Basic health check endpoint
 */
router.get('/', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'Detechify server is running',
    timestamp: new Date().toISOString(),
    requestId: req.requestId
  });
});

/**
 * GET /health/liveness
 * Liveness probe for Kubernetes/Docker
 */
router.get('/liveness', (req, res) => {
  res.json({ 
    status: 'alive',
    timestamp: new Date().toISOString(),
    requestId: req.requestId
  });
});

/**
 * GET /health/readiness
 * Readiness probe for Kubernetes/Docker
 */
router.get('/readiness', (req, res) => {
  // Check if server is ready to accept requests
  const isReady = true; // In future, check database, Redis, etc.
  
  if (isReady) {
    res.json({ 
      status: 'ready',
      timestamp: new Date().toISOString(),
      requestId: req.requestId
    });
  } else {
    res.status(503).json({ 
      status: 'not ready',
      timestamp: new Date().toISOString(),
      requestId: req.requestId
    });
  }
});

module.exports = router;
