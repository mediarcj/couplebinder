// File: server/routes/health.js
// Description: Health check endpoints for monitoring and status
// Purpose: Provides server health, liveness, and readiness status for deployment monitoring
// Notes: Used by load balancers, monitoring systems, and deployment tools

const express = require('express');
const router = express.Router();
const { getConnectionStatus } = require('../db/connection');

/**
 * WHAT:
 * We provide comprehensive health check endpoints that verify actual service status.
 *
 * WHY:
 * Load balancers and monitoring systems need accurate health information to make routing decisions.
 * We must check actual dependencies, not just return static responses.
 *
 * HOW:
 * We test database connectivity, Redis status, and other critical services.
 * Each endpoint returns detailed status information for debugging and monitoring.
 */

// Redis connection status (imported from main server)
let redisStatus = { connected: false, lastCheck: null };

/**
 * GET /health
 * Comprehensive health check endpoint
 */
router.get('/', async (req, res) => {
  try {
    const dbStatus = getConnectionStatus();
    const healthData = {
      status: 'ok',
      message: 'Detechify server is running',
      timestamp: new Date().toISOString(),
      requestId: req.requestId,
      services: {
        database: {
          healthy: dbStatus.healthy,
          lastTest: dbStatus.lastTest,
          host: dbStatus.config.host,
          port: dbStatus.config.port
        },
        redis: {
          connected: redisStatus.connected,
          lastCheck: redisStatus.lastCheck
        },
        server: {
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          nodeVersion: process.version
        }
      }
    };

    // Determine overall health status
    const overallHealthy = dbStatus.healthy && redisStatus.connected;
    
    res.status(overallHealthy ? 200 : 503).json(healthData);
  } catch (error) {
    console.error('Health check error:', error.message);
    res.status(500).json({
      status: 'error',
      message: 'Health check failed',
      timestamp: new Date().toISOString(),
      requestId: req.requestId,
      error: error.message
    });
  }
});

/**
 * GET /health/liveness
 * Liveness probe for Kubernetes/Docker
 */
router.get('/liveness', (req, res) => {
  try {
    // Liveness only checks if the process is running
    const isAlive = process.uptime() > 0;
    
    res.status(isAlive ? 200 : 503).json({ 
      status: isAlive ? 'alive' : 'dead',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      requestId: req.requestId
    });
  } catch (error) {
    console.error('Liveness check error:', error.message);
    res.status(500).json({
      status: 'error',
      message: 'Liveness check failed',
      timestamp: new Date().toISOString(),
      requestId: req.requestId
    });
  }
});

/**
 * GET /health/readiness
 * Readiness probe for Kubernetes/Docker
 */
router.get('/readiness', async (req, res) => {
  try {
    const dbStatus = getConnectionStatus();
    
    // Check if all critical services are ready
    const isReady = dbStatus.healthy && redisStatus.connected;
    
    const readinessData = {
      status: isReady ? 'ready' : 'not ready',
      timestamp: new Date().toISOString(),
      requestId: req.requestId,
      checks: {
        database: {
          status: dbStatus.healthy ? 'ready' : 'not ready',
          lastTest: dbStatus.lastTest
        },
        redis: {
          status: redisStatus.connected ? 'ready' : 'not ready',
          lastCheck: redisStatus.lastCheck
        }
      }
    };
    
    res.status(isReady ? 200 : 503).json(readinessData);
  } catch (error) {
    console.error('Readiness check error:', error.message);
    res.status(500).json({
      status: 'error',
      message: 'Readiness check failed',
      timestamp: new Date().toISOString(),
      requestId: req.requestId
    });
  }
});

/**
 * GET /health/detailed
 * Detailed health information for debugging
 */
router.get('/detailed', async (req, res) => {
  try {
    const dbStatus = getConnectionStatus();
    
    const detailedHealth = {
      timestamp: new Date().toISOString(),
      requestId: req.requestId,
      environment: process.env.NODE_ENV || 'development',
      services: {
        database: dbStatus,
        redis: redisStatus,
        server: {
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          cpu: process.cpuUsage(),
          nodeVersion: process.version,
          platform: process.platform,
          arch: process.arch
        }
      },
      requests: {
        headers: req.headers,
        method: req.method,
        url: req.url,
        ip: req.ip || req.connection.remoteAddress
      }
    };

    res.json(detailedHealth);
  } catch (error) {
    console.error('Detailed health check error:', error.message);
    res.status(500).json({
      status: 'error',
      message: 'Detailed health check failed',
      timestamp: new Date().toISOString(),
      requestId: req.requestId,
      error: error.message
    });
  }
});

// Function to update Redis status (called from main server)
function updateRedisStatus(connected, lastCheck = null) {
  redisStatus = {
    connected,
    lastCheck: lastCheck || new Date()
  };
}

module.exports = { router, updateRedisStatus };
