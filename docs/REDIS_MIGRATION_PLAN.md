# Redis Migration Plan

**Date:** 2025-01-27  
**Status:** Design phase - implementation deferred to future scaling phase  
**Purpose:** Design Redis-based replacements for in-memory data structures to enable horizontal scaling

---

## Overview

### Why Redis is Needed

The current codebase uses in-memory data structures (`Map` and promise chains) for:
1. **Secure code attempts tracking** (`codeAttempts` Map in `server/middleware/security.js`)
2. **Submissions queue** (promise chain in `server/utils/submissionsQueue.js`)

These structures work fine for single-instance deployments but have critical limitations:
- **Not multi-instance safe:** Each server instance maintains its own separate state
- **Lost on restart:** In-memory data is lost when the process restarts
- **Race conditions:** Operations across instances are not coordinated

### Benefits of Redis Migration

- **Multi-instance safety:** All instances share the same state
- **Durability:** State survives process restarts
- **Production-ready:** Enables true horizontal scaling
- **Consistency:** Atomic operations ensure data integrity across instances

---

## 1. Secure Code Attempts Migration

### Current Implementation

**Location:** `server/middleware/security.js`  
**Current:** In-memory `Map` storing code attempts and verification state

```javascript
const codeAttempts = new Map(); // Single-instance only
```

### Proposed Redis Design

#### Key Structure

```
code_attempts:{userId}:{action}:{code}
```

Example:
- `code_attempts:user_123:password_reset:abc123`
- `code_attempts:user_456:email_verify:xyz789`

#### Stored Fields

Each key stores a JSON object:
```json
{
  "userId": "user_123",
  "action": "password_reset",
  "code": "abc123",
  "createdAt": 1234567890,
  "expiresAt": 1234567890,
  "used": false,
  "attempts": 0
}
```

#### Operations

**Generate Code:**
```javascript
// SET with expiration
await redis.set(
  `code_attempts:${userId}:${action}:${code}`,
  JSON.stringify({
    userId,
    action,
    code,
    createdAt: Date.now(),
    expiresAt: Date.now() + TTL_MS,
    used: false,
    attempts: 0
  }),
  'EX', Math.floor(TTL_MS / 1000)
);
```

**Verify Code (Atomic Check-and-Use):**
```javascript
// Use Redis transaction (MULTI/EXEC) for atomicity
const multi = redis.multi();
multi.get(`code_attempts:${userId}:${action}:${code}`);
multi.set(`code_attempts:${userId}:${action}:${code}`, JSON.stringify({...used: true}), 'EX', remainingTTL);
const results = await multi.exec();

if (!results[0]) {
  throw new Error('code_not_found');
}

const data = JSON.parse(results[0]);
if (data.used || data.expiresAt < Date.now()) {
  throw new Error('code_expired_or_used');
}

// Mark as used atomically
```

**Increment Attempts:**
```javascript
await redis.incr(`code_attempts:${userId}:${action}:${code}:attempts`);
```

#### TTL Strategy

- Codes expire after configured TTL (e.g., 15 minutes)
- Use Redis `EX` option to set expiration automatically
- Cleanup happens automatically via Redis expiration

---

## 2. Submissions Queue Migration

### Current Implementation

**Location:** `server/utils/submissionsQueue.js`  
**Current:** In-memory promise chain for serializing operations

```javascript
let queue = Promise.resolve();
// Operations chained onto this promise
```

### Proposed Redis Design

#### Option A: Redis List (Simple Queue)

**Queue Key:**
```
submissions_queue
```

**Job Payload Key:**
```
submissions_job:{jobId}
```

**Operations:**

**Enqueue:**
```javascript
const jobId = generateId();
const jobData = {
  id: jobId,
  operation: 'submission',
  payload: {...},
  createdAt: Date.now(),
  retries: 0
};

// Store job payload
await redis.set(
  `submissions_job:${jobId}`,
  JSON.stringify(jobData),
  'EX', 3600 // 1 hour TTL
);

// Add to queue
await redis.lpush('submissions_queue', jobId);
```

**Dequeue (Worker):**
```javascript
// Blocking pop (waits for job)
const jobId = await redis.brpop('submissions_queue', 10); // 10 second timeout

if (jobId) {
  const jobData = JSON.parse(await redis.get(`submissions_job:${jobId[1]}`));
  // Process job...
  
  // Clean up
  await redis.del(`submissions_job:${jobId[1]}`);
}
```

#### Option B: Redis Streams (More Advanced)

**Stream Key:**
```
submissions_stream
```

**Benefits:**
- Consumer groups for multiple workers
- Automatic acknowledgment
- Better retry handling
- Message history

**Operations:**

**Enqueue:**
```javascript
await redis.xadd(
  'submissions_stream',
  '*', // Auto-generate ID
  'operation', 'submission',
  'payload', JSON.stringify({...}),
  'createdAt', Date.now()
);
```

**Dequeue (Consumer Group):**
```javascript
const messages = await redis.xreadgroup(
  'GROUP', 'submissions_workers', 'worker_1',
  'COUNT', 1,
  'BLOCK', 10000,
  'STREAMS', 'submissions_stream', '>'
);

// Process message...

// Acknowledge
await redis.xack('submissions_stream', 'submissions_workers', messageId);
```

#### Recommendation

Start with **Option A (Redis List)** for simplicity, migrate to **Option B (Redis Streams)** if we need:
- Multiple worker processes
- Better retry/error handling
- Message history/audit trail

---

## 3. Migration Steps

### Phase 1: Infrastructure Setup

1. **Ensure Redis is available:**
   - Verify Redis connection in production
   - Test Redis operations in staging
   - Add Redis health checks

2. **Create Redis wrapper utilities:**
   - `server/utils/redisCodeAttempts.js` - Code attempts operations
   - `server/utils/redisQueue.js` - Queue operations
   - Abstract Redis operations behind clean APIs

### Phase 2: Feature Flags

Add to `server/config/index.js`:

```javascript
features: {
  useRedisCodeAttempts: bool(process.env.USE_REDIS_CODE_ATTEMPTS, false),
  useRedisQueue: bool(process.env.USE_REDIS_QUEUE, false)
}
```

### Phase 3: Dual-Write Mode (Shadow Mode)

1. **Implement Redis versions alongside in-memory:**
   - Keep existing in-memory code
   - Add Redis implementation
   - Write to both (dual-write)

2. **Read from in-memory (primary), Redis (shadow):**
   - Compare results in staging
   - Log discrepancies
   - Verify Redis operations work correctly

### Phase 4: Switch to Redis (Production)

1. **Enable feature flags in staging:**
   - `USE_REDIS_CODE_ATTEMPTS=true`
   - `USE_REDIS_QUEUE=true`
   - Monitor for issues

2. **Switch to Redis in production:**
   - Enable flags in production
   - Monitor closely
   - Keep in-memory code as fallback initially

3. **Remove in-memory code:**
   - After stable period (e.g., 1 week)
   - Remove in-memory implementations
   - Clean up feature flags

---

## 4. Error Handling and Fallbacks

### Redis Connection Failures

**Strategy:** Graceful degradation

```javascript
// In codeAttempts wrapper
async function setCodeAttempt(userId, action, code, data) {
  try {
    if (config.features.useRedisCodeAttempts) {
      return await redisCodeAttempts.set(userId, action, code, data);
    }
  } catch (err) {
    logger.error({ event: 'redis.code_attempts.failed', error: err.message }, 'Redis failed, falling back to in-memory');
    // Fall back to in-memory Map
    return inMemoryCodeAttempts.set(userId, action, code, data);
  }
}
```

### Queue Failures

**Strategy:** Retry with exponential backoff

```javascript
async function enqueue(operation) {
  if (config.features.useRedisQueue) {
    try {
      return await redisQueue.enqueue(operation);
    } catch (err) {
      logger.error({ event: 'redis.queue.failed', error: err.message }, 'Redis queue failed, falling back to in-memory');
      return inMemoryQueue.enqueue(operation);
    }
  }
  return inMemoryQueue.enqueue(operation);
}
```

---

## 5. Testing Strategy

### Unit Tests

- Test Redis operations in isolation
- Mock Redis client for unit tests
- Test error handling and fallbacks

### Integration Tests

- Test with real Redis instance
- Test dual-write mode
- Test migration scenarios

### Load Tests

- Test Redis performance under load
- Compare in-memory vs Redis latency
- Verify multi-instance coordination

---

## 6. Monitoring

### Metrics to Track

- Redis connection status
- Operation latency (Redis vs in-memory)
- Error rates
- Queue depth (for queue migration)
- Code attempt hit/miss rates

### Alerts

- Redis connection failures
- High latency on Redis operations
- Queue backup (if queue depth grows)
- Code attempt failures

---

## 7. Rollback Plan

If issues arise:

1. **Disable feature flags immediately:**
   - `USE_REDIS_CODE_ATTEMPTS=false`
   - `USE_REDIS_QUEUE=false`

2. **System reverts to in-memory:**
   - No code changes needed
   - Just flip flags

3. **Investigate issues:**
   - Review Redis logs
   - Check connection health
   - Fix issues before re-enabling

---

## 8. Future Enhancements

After initial migration:

- **Redis Streams:** Migrate queue to streams for better features
- **Redis Pub/Sub:** For real-time notifications
- **Redis Sorted Sets:** For priority queues
- **Redis Lua Scripts:** For complex atomic operations

---

## References

- Current implementations:
  - `server/middleware/security.js` - `codeAttempts` Map
  - `server/utils/submissionsQueue.js` - Promise chain queue

- Redis client: Already configured in `server/utils/redisClient.js`

---

**Next Steps:** Implementation will begin when horizontal scaling becomes a priority. Design is complete and ready for implementation.

