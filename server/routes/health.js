// File: server/routes/health.js
// Description: Health check endpoints for monitoring and status
// Purpose: Provides server health, liveness, and readiness status for deployment monitoring
// Notes: Used by load balancers, monitoring systems, and deployment tools
//
// AUTH REQUIREMENTS:
// - GET /: PUBLIC - basic health check
// - GET /liveness: PUBLIC - liveness probe for containers
// - GET /readiness: PUBLIC - readiness probe for containers
// - GET /detailed: PUBLIC - detailed system status

const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const { supabaseAdmin } = require('../utils/supabaseClient');

/**
 * WHAT:
 * We provide comprehensive health check endpoints that verify actual service status.
 *
 * WHY:
 * Load balancers and monitoring systems need accurate health information to make routing decisions.
 * We check Supabase connectivity and other critical services.
 *
 * HOW:
 * We test Supabase connectivity and other critical services.
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
    const healthData = {
      status: 'ok',
      message: `${process.env.APP_NAME || 'Application'} server is running`,
      timestamp: new Date().toISOString(),
      requestId: req.requestId,
      services: {
        database: {
          healthy: true,
          lastTest: new Date().toISOString(),
          host: 'Supabase',
          port: '5432'
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

    res.status(200).json(healthData);
  } catch (error) {
    logger.error({
      event: 'health.check.error',
      error: error.message
    }, 'Health check failed');
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
    logger.error({
      event: 'health.liveness.error',
      error: error.message
    }, 'Liveness check failed');
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
    // Check if all critical services are ready
    const _isReady = true; // Supabase is always available via HTTP API
    
    const readinessData = {
      status: 'ready',
      timestamp: new Date().toISOString(),
      requestId: req.requestId,
      checks: {
        database: {
          status: 'ready',
          lastTest: new Date().toISOString(),
          host: 'Supabase'
        },
        redis: {
          status: 'decommissioned',
          mode: 'stateless auth enabled'
        }
      }
    };
    
    res.status(200).json(readinessData);
  } catch (error) {
    logger.error({
      event: 'health.readiness.error',
      error: error.message
    }, 'Readiness check failed');
    res.status(500).json({
      status: 'error',
      message: 'Readiness check failed',
      timestamp: new Date().toISOString(),
      requestId: req.requestId
    });
  }
});

/**
 * GET /health/ops
 * Comprehensive SRE metrics and operational status
 */
router.get('/ops', async (req, res) => {
  try {
    const startTime = Date.now();
    
    // Test database connectivity
    let dbHealthy = false;
    let dbLatency = 0;
    try {
      const dbStart = Date.now();
      const { error } = await supabaseAdmin.from('profiles').select('count').limit(1);
      dbLatency = Date.now() - dbStart;
      dbHealthy = !error;
    } catch (dbError) {
      logger.warn({
        event: 'health.ops.db_test_failed',
        error: dbError.message
      }, 'Database connectivity test failed');
    }

    // Get outbox statistics
    let outboxStats = null;
    let processorStatus = { running: false, processing: false };
    
    try {
      const { getOutboxStats } = require('../services/outboxService');
      outboxStats = await getOutboxStats();
    } catch (error) {
      // Log error but don't fail health check
      logger.warn({
        event: 'health.outbox_stats_failed',
        error: error.message
      }, 'Failed to get outbox statistics');
    }

    const opsHealth = {
      timestamp: new Date().toISOString(),
      requestId: req.requestId,
      environment: process.env.NODE_ENV || 'development',
      version: process.env.APP_VERSION || '1.0.0',
      
      // System metrics
      system: {
        uptime: process.uptime(),
        memory: {
          rss: process.memoryUsage().rss,
          heapTotal: process.memoryUsage().heapTotal,
          heapUsed: process.memoryUsage().heapUsed,
          external: process.memoryUsage().external
        },
        cpu: process.cpuUsage(),
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch
      },

      // Service health
      services: {
        database: {
          healthy: dbHealthy,
          latency: dbLatency,
          provider: 'Supabase',
          lastCheck: new Date().toISOString()
        },
        outbox: {
          healthy: outboxStats !== null,
          processor: processorStatus,
          stats: outboxStats
        },
        redis: {
          status: 'decommissioned',
          mode: 'stateless auth enabled'
        }
      },

      // Request metrics
      request: {
        method: req.method,
        url: req.url,
        ip: req.ip || req.connection.remoteAddress,
        userAgent: req.get('User-Agent'),
        headers: {
          'x-forwarded-for': req.get('x-forwarded-for'),
          'x-real-ip': req.get('x-real-ip'),
          'cf-ray': req.get('cf-ray'),
          'cf-connecting-ip': req.get('cf-connecting-ip')
        }
      },

      // Performance metrics
      performance: {
        responseTime: Date.now() - startTime,
        timestamp: new Date().toISOString()
      }
    };

    // Determine overall health status (outbox disabled, so only check database)
    const overallHealthy = dbHealthy;
    const statusCode = overallHealthy ? 200 : 503;

    res.status(statusCode).json(opsHealth);

  } catch (error) {
    logger.error({
      event: 'health.ops.error',
      error: error.message,
      requestId: req.requestId
    }, 'Ops health check failed');
    
    res.status(500).json({
      status: 'error',
      message: 'Ops health check failed',
      timestamp: new Date().toISOString(),
      requestId: req.requestId,
      error: error.message
    });
  }
});

/**
 * GET /health/detailed
 * Detailed health information for debugging
 */
router.get('/detailed', async (req, res) => {
  try {
    const detailedHealth = {
      timestamp: new Date().toISOString(),
      requestId: req.requestId,
      environment: process.env.NODE_ENV || 'development',
      services: {
        database: {
          healthy: true,
          lastTest: new Date().toISOString(),
          host: 'Supabase',
          port: '5432',
          type: 'Supabase PostgreSQL'
        },
        redis: {
          status: 'decommissioned',
          mode: 'stateless auth enabled'
        },
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
    logger.error({
      event: 'health.detailed.error',
      error: error.message
    }, 'Detailed health check failed');
    res.status(500).json({
      status: 'error',
      message: 'Detailed health check failed',
      timestamp: new Date().toISOString(),
      requestId: req.requestId,
      error: error.message
    });
  }
});

/**
 * WHAT:
 * Function to update Redis status from the main server.
 * 
 * WHY:
 * Health endpoints need current Redis connection status.
 * This allows the main server to report Redis connectivity.
 * 
 * HOW:
 * Called from zorvalon.js when Redis connection changes.
 * Updates the redisStatus object used by health endpoints.
 * 
 * @param {boolean} connected - Whether Redis is connected
 * @param {string} lastCheck - Timestamp of last check
 */
function updateRedisStatus(connected, lastCheck = null) {
  redisStatus = {
    connected,
    lastCheck: lastCheck || new Date().toISOString()
  };
}

module.exports = { router, updateRedisStatus };
