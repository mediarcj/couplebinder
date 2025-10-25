// File: server/middleware/idempotency.js
// Description: Idempotency middleware for write endpoints
// Purpose: Prevents duplicate operations using idempotency keys
// Notes: Uses Redis to track processed keys with TTL

const logger = require('../utils/logger');

/**
 * WHAT:
 * Idempotency middleware that prevents duplicate operations using unique keys.
 * 
 * WHY:
 * Write endpoints need protection against duplicate requests (retries, double-clicks).
 * Idempotency keys ensure operations are only processed once.
 * 
 * HOW:
 * 1. Check if key was already processed (Redis lookup)
 * 2. If yes, return cached response
 * 3. If no, process request and store result
 * 4. Return result with idempotency headers
 */

function createIdempotencyMiddleware(options = {}) {
  const {
    ttl = 3600, // 1 hour default TTL
    headerName = 'Idempotency-Key',
    redisClient = null,
    _keyGenerator = null
  } = options;

  return async (req, res, next) => {
    // Only apply to write methods
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      return next();
    }

    // Extract idempotency key from header
    const idempotencyKey = req.headers[headerName.toLowerCase()] || 
                          req.headers['idempotency-key'];
    
    if (!idempotencyKey) {
      return next();
    }

    // Validate key format (UUID or custom format)
    if (!isValidIdempotencyKey(idempotencyKey)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid idempotency key format',
        code: 'INVALID_IDEMPOTENCY_KEY'
      });
    }

    // Generate cache key
    const cacheKey = `idempotency:${idempotencyKey}`;
    
    try {
      // Check if request was already processed
      if (redisClient) {
        const cached = await redisClient.get(cacheKey);
        if (cached) {
          const cachedResponse = JSON.parse(cached);
          
          logger.info({
            event: 'idempotency.cache_hit',
            key: idempotencyKey,
            method: req.method,
            path: req.path
          }, 'Idempotency cache hit - returning cached response');
          
          // Set idempotency headers
          res.set('X-Idempotency-Key', idempotencyKey);
          res.set('X-Idempotency-Status', 'cached');
          
          if (!res.headersSent) {
            res.status(cachedResponse.status).json(cachedResponse.body);
          }
          return; // critical: STOP here
        }
      }

      // Capture the outgoing response for caching
      const originalJson = res.json.bind(res);
      const originalSend = res.send.bind(res);
      
      res.json = function(body) {
        res.locals.__toCache = { type: 'json', body };
        return originalJson(body);
      };
      
      res.send = function(body) {
        if (typeof body !== 'undefined') res.locals.__toCache = { type: 'send', body };
        return originalSend(body);
      };

      // Set idempotency headers BEFORE processing
      res.set('X-Idempotency-Key', idempotencyKey);
      res.set('X-Idempotency-Status', 'processed');

      // Process request
      await new Promise((resolve, reject) => {
        res.on('finish', resolve);
        res.on('error', reject);
        next();
      });

      // After response is finished, write to cache (no headers are set here)
      res.once('finish', async () => {
        try {
          const payload = res.locals.__toCache;
          if (!payload) return;
          
          const record = {
            status: res.statusCode,
            headers: res.getHeaders(),
            body: payload.body,
            timestamp: new Date().toISOString()
          };

          if (redisClient) {
            await redisClient.setex(cacheKey, ttl, JSON.stringify(record));
          }

          logger.info({
            event: 'idempotency.cache_stored',
            key: idempotencyKey,
            method: req.method,
            path: req.path,
            status: res.statusCode
          }, 'Idempotency response cached');
        } catch (e) {
          logger.error({
            event: 'idempotency.error',
            key: idempotencyKey,
            error: String(e)
          }, 'Idempotency cache error');
        }
      });

    } catch (error) {
      logger.error({
        event: 'idempotency.error',
        key: idempotencyKey,
        error: error.message
      }, 'Idempotency middleware error');
      
      // Continue processing even if idempotency fails
      return next();
    }
  };
}

/**
 * Validate idempotency key format
 * @param {string} key - Idempotency key to validate
 * @returns {boolean} True if valid
 */
function isValidIdempotencyKey(key) {
  if (!key || typeof key !== 'string') {
    return false;
  }

  // UUID format (8-4-4-4-12)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  
  // Custom format (alphanumeric, hyphens, underscores, 16-64 chars)
  const customRegex = /^[a-zA-Z0-9_-]{16,64}$/;
  
  return uuidRegex.test(key) || customRegex.test(key);
}

/**
 * Generate a UUID v4 idempotency key
 * @returns {string} UUID v4 string
 */
function generateIdempotencyKey() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

module.exports = {
  createIdempotencyMiddleware,
  isValidIdempotencyKey,
  generateIdempotencyKey
};
