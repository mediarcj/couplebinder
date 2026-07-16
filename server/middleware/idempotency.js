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
  // I am saving this value here so the nearby steps can reuse the same value without rebuilding it each time.
  const {
    ttl = 3600, // 1 hour default TTL
    // I am keeping this line here because the surrounding idempotency.js workflow expects this value or operation before it continues.
    headerName = 'Idempotency-Key',
    // I am keeping this line here because the surrounding idempotency.js workflow expects this value or operation before it continues.
    redisClient = null,
    // I am keeping this line here because the surrounding idempotency.js workflow expects this value or operation before it continues.
    _keyGenerator = null
  // I am keeping this line here because the surrounding idempotency.js workflow expects this value or operation before it continues.
  } = options;

  // This return sends the completed value or response back to the code that called this function.
  return async (req, res, next) => {
    // Only apply to write methods
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      // This return sends the completed value or response back to the code that called this function.
      return next();
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // Extract idempotency key from header
    const idempotencyKey = req.headers[headerName.toLowerCase()] || 
                          // I am keeping this line here because the surrounding idempotency.js workflow expects this value or operation before it continues.
                          req.headers['idempotency-key'];
    
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!idempotencyKey) {
      // This return sends the completed value or response back to the code that called this function.
      return next();
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // Validate key format (UUID or custom format)
    if (!isValidIdempotencyKey(idempotencyKey)) {
      // This return sends the completed value or response back to the code that called this function.
      return res.status(400).json({
        // I am keeping the `success` field in this object so the receiving code can read that value by its expected name.
        success: false,
        // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
        error: 'Invalid idempotency key format',
        // I am keeping the `code` field in this object so the receiving code can read that value by its expected name.
        code: 'INVALID_IDEMPOTENCY_KEY'
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      });
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // Generate cache key
    const cacheKey = `idempotency:${idempotencyKey}`;
    
    // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
    try {
      // Check if request was already processed
      if (redisClient) {
        // I am saving `cached` here so the nearby steps can reuse the same value without rebuilding it each time.
        const cached = await redisClient.get(cacheKey);
        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (cached) {
          // I am saving `cachedResponse` here so the nearby steps can reuse the same value without rebuilding it each time.
          const cachedResponse = JSON.parse(cached);
          
          // I am calling this helper here so the current workflow performs this step before it moves on.
          logger.info({
            // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
            event: 'idempotency.cache_hit',
            // I am keeping the `key` field in this object so the receiving code can read that value by its expected name.
            key: idempotencyKey,
            // I am keeping the `method` field in this object so the receiving code can read that value by its expected name.
            method: req.method,
            // I am keeping the `path` field in this object so the receiving code can read that value by its expected name.
            path: req.path
          // I am keeping this line here because the surrounding idempotency.js workflow expects this value or operation before it continues.
          }, 'Idempotency cache hit - returning cached response');
          
          // Set idempotency headers
          res.set('X-Idempotency-Key', idempotencyKey);
          // I am building or sending the Express response here with the status, data, or page already chosen by this route.
          res.set('X-Idempotency-Status', 'cached');
          
          // This check helps me choose or stop the next path before any work that depends on this condition runs.
          if (!res.headersSent) {
            // I am building or sending the Express response here with the status, data, or page already chosen by this route.
            res.status(cachedResponse.status).json(cachedResponse.body);
          // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
          }
          return; // CRITICAL: Stop here to prevent calling next()
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }

      // Capture the outgoing response for caching
      const originalJson = res.json.bind(res);
      // I am saving `originalSend` here so the nearby steps can reuse the same value without rebuilding it each time.
      const originalSend = res.send.bind(res);
      
      // I am keeping this line here because the surrounding idempotency.js workflow expects this value or operation before it continues.
      res.json = function(body) {
        // I am keeping this line here because the surrounding idempotency.js workflow expects this value or operation before it continues.
        res.locals.__toCache = { type: 'json', body };
        // This return sends the completed value or response back to the code that called this function.
        return originalJson(body);
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      };
      
      // I am keeping this line here because the surrounding idempotency.js workflow expects this value or operation before it continues.
      res.send = function(body) {
        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (typeof body !== 'undefined') res.locals.__toCache = { type: 'send', body };
        // This return sends the completed value or response back to the code that called this function.
        return originalSend(body);
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      };

      // Set idempotency headers BEFORE processing
      res.set('X-Idempotency-Key', idempotencyKey);
      // I am building or sending the Express response here with the status, data, or page already chosen by this route.
      res.set('X-Idempotency-Status', 'processed');

      // Process request
      await new Promise((resolve, reject) => {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        res.on('finish', resolve);
        // I am calling this helper here so the current workflow performs this step before it moves on.
        res.on('error', reject);
        // I am calling this helper here so the current workflow performs this step before it moves on.
        next();
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      });

      // After response is finished, write to cache (no headers are set here)
      res.once('finish', async () => {
        // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
        try {
          // I am saving `payload` here so the nearby steps can reuse the same value without rebuilding it each time.
          const payload = res.locals.__toCache;
          // This check helps me choose or stop the next path before any work that depends on this condition runs.
          if (!payload) return;
          
          // I am saving `record` here so the nearby steps can reuse the same value without rebuilding it each time.
          const record = {
            // I am keeping the `status` field in this object so the receiving code can read that value by its expected name.
            status: res.statusCode,
            // I am keeping the `headers` field in this object so the receiving code can read that value by its expected name.
            headers: res.getHeaders(),
            // I am keeping the `body` field in this object so the receiving code can read that value by its expected name.
            body: payload.body,
            // I am keeping the `timestamp` field in this object so the receiving code can read that value by its expected name.
            timestamp: new Date().toISOString()
          // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
          };

          // This check helps me choose or stop the next path before any work that depends on this condition runs.
          if (redisClient) {
            // I am waiting for this asynchronous step here so the next line does not use its result before it is ready.
            await redisClient.setex(cacheKey, ttl, JSON.stringify(record));
          // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
          }

          // I am calling this helper here so the current workflow performs this step before it moves on.
          logger.info({
            // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
            event: 'idempotency.cache_stored',
            // I am keeping the `key` field in this object so the receiving code can read that value by its expected name.
            key: idempotencyKey,
            // I am keeping the `method` field in this object so the receiving code can read that value by its expected name.
            method: req.method,
            // I am keeping the `path` field in this object so the receiving code can read that value by its expected name.
            path: req.path,
            // I am keeping the `status` field in this object so the receiving code can read that value by its expected name.
            status: res.statusCode
          // I am keeping this line here because the surrounding idempotency.js workflow expects this value or operation before it continues.
          }, 'Idempotency response cached');
        // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
        } catch (e) {
          // I am calling this helper here so the current workflow performs this step before it moves on.
          logger.error({
            // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
            event: 'idempotency.error',
            // I am keeping the `key` field in this object so the receiving code can read that value by its expected name.
            key: idempotencyKey,
            // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
            error: String(e)
          // I am keeping this line here because the surrounding idempotency.js workflow expects this value or operation before it continues.
          }, 'Idempotency cache error');
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      });

    // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
    } catch (error) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      logger.error({
        // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
        event: 'idempotency.error',
        // I am keeping the `key` field in this object so the receiving code can read that value by its expected name.
        key: idempotencyKey,
        // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
        error: error.message
      // I am keeping this line here because the surrounding idempotency.js workflow expects this value or operation before it continues.
      }, 'Idempotency middleware error');
      
      // Continue processing even if idempotency fails
      return next();
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  };
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * Validate idempotency key format
 * @param {string} key - Idempotency key to validate
 * @returns {boolean} True if valid
 */
function isValidIdempotencyKey(key) {
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!key || typeof key !== 'string') {
    // This return sends the completed value or response back to the code that called this function.
    return false;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // UUID format (8-4-4-4-12)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  
  // Custom format (alphanumeric, hyphens, underscores, 16-64 chars)
  const customRegex = /^[a-zA-Z0-9_-]{16,64}$/;
  
  // This return sends the completed value or response back to the code that called this function.
  return uuidRegex.test(key) || customRegex.test(key);
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * Generate a UUID v4 idempotency key
 * @returns {string} UUID v4 string
 */
function generateIdempotencyKey() {
  // This return sends the completed value or response back to the code that called this function.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    // I am saving `r` here so the nearby steps can reuse the same value without rebuilding it each time.
    const r = Math.random() * 16 | 0;
    // I am saving `v` here so the nearby steps can reuse the same value without rebuilding it each time.
    const v = c == 'x' ? r : (r & 0x3 | 0x8);
    // This return sends the completed value or response back to the code that called this function.
    return v.toString(16);
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am exporting this value here so another module can deliberately reuse the completed piece from idempotency.js.
module.exports = {
  // I am keeping this line here because the surrounding idempotency.js workflow expects this value or operation before it continues.
  createIdempotencyMiddleware,
  // I am keeping this line here because the surrounding idempotency.js workflow expects this value or operation before it continues.
  isValidIdempotencyKey,
  // I am keeping this line here because the surrounding idempotency.js workflow expects this value or operation before it continues.
  generateIdempotencyKey
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
};
