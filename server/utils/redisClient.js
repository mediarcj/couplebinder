// File: server/utils/redisClient.js
// Description: Centralized Redis client that reads ONLY from config (single source of truth)
// Purpose: Reliable Redis with auto-reconnect, test stub, and structured logs
//
// Key behavior:
// - Redis disconnect is ERROR during normal runtime
// - Redis disconnect is INFO during intentional shutdown
// - Export markShuttingDown() so the shutdown system can flip the posture before quitting

'use strict';

const { config } = require('../config'); // single source of truth
// I am loading `./logger` into `logger` so this file can reuse that dependency below.
const logger = require('./logger');

// I am saving `isTest` here so the nearby steps can reuse the same value without rebuilding it each time.
const isTest = config.server.nodeEnv === 'test';

// Module-scoped shutdown posture (shared across all listeners in this module)
let shuttingDown = false;

// I am keeping `markShuttingDown` as a named helper so the surrounding workflow can call this step when it needs it.
function markShuttingDown(reason = 'shutdown') {
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (shuttingDown) return;
  // I am keeping this line here because the surrounding redisClient.js workflow expects this value or operation before it continues.
  shuttingDown = true;
  // I am calling this helper here so the current workflow performs this step before it moves on.
  logger.info({ event: 'redis.shutdown_mode', reason }, 'Redis client entering shutdown mode');
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `isShuttingDown` as a named helper so the surrounding workflow can call this step when it needs it.
function isShuttingDown() {
  // This return sends the completed value or response back to the code that called this function.
  return shuttingDown;
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// -------------------------------
// Test-only healthy stub
// -------------------------------
if (isTest) {
  // I am loading `events` into `EventEmitter` so this file can reuse that dependency below.
  const { EventEmitter } = require('events');
  // I am saving `client` here so the nearby steps can reuse the same value without rebuilding it each time.
  const client = new EventEmitter();

  // I am keeping this line here because the surrounding redisClient.js workflow expects this value or operation before it continues.
  client.ping = async () => 'PONG';
  // I am keeping this line here because the surrounding redisClient.js workflow expects this value or operation before it continues.
  client.exists = async () => 0;
  // I am keeping this line here because the surrounding redisClient.js workflow expects this value or operation before it continues.
  client.get = async () => null;
  // I am keeping this line here because the surrounding redisClient.js workflow expects this value or operation before it continues.
  client.set = async () => 'OK';
  // I am keeping this line here because the surrounding redisClient.js workflow expects this value or operation before it continues.
  client.del = async () => 0;
  // I am keeping this line here because the surrounding redisClient.js workflow expects this value or operation before it continues.
  client.incr = async () => 1;
  // I am keeping this line here because the surrounding redisClient.js workflow expects this value or operation before it continues.
  client.sAdd = async () => 1;
  // I am keeping this line here because the surrounding redisClient.js workflow expects this value or operation before it continues.
  client.sRem = async () => 0;
  // I am keeping this line here because the surrounding redisClient.js workflow expects this value or operation before it continues.
  client.expire = async () => 1;
  // I am defining this small callback here so the surrounding API can run it with the value it supplies.
  client.multi = () => {
    // I am saving `chain` here so the nearby steps can reuse the same value without rebuilding it each time.
    const chain = {
      // I am defining the `set` step here so the surrounding object or class can call it with the values listed in its parameters.
      set() { return chain; },
      // I am defining the `get` step here so the surrounding object or class can call it with the values listed in its parameters.
      get() { return chain; },
      // I am defining the `sAdd` step here so the surrounding object or class can call it with the values listed in its parameters.
      sAdd() { return chain; },
      // I am defining the `expire` step here so the surrounding object or class can call it with the values listed in its parameters.
      expire() { return chain; },
      // I am defining the `del` step here so the surrounding object or class can call it with the values listed in its parameters.
      del() { return chain; },
      // I am defining the `sRem` step here so the surrounding object or class can call it with the values listed in its parameters.
      sRem() { return chain; },
      // I am defining the `incr` step here so the surrounding object or class can call it with the values listed in its parameters.
      incr() { return chain; },
      // I am keeping the `exec` field in this object so the receiving code can read that value by its expected name.
      exec: async () => [],
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    };
    // This return sends the completed value or response back to the code that called this function.
    return chain;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  };
  // I am keeping this line here because the surrounding redisClient.js workflow expects this value or operation before it continues.
  client.quit = async () => {};
  // I am keeping this line here because the surrounding redisClient.js workflow expects this value or operation before it continues.
  client.isOpen = true;

  // I am keeping `connectRedis` as a named asynchronous helper so the surrounding workflow can call this step when it needs it.
  async function connectRedis() {
    // If a previous test toggled shutdown mode, clear it on connect.
    shuttingDown = false;
    // I am defining this small callback here so the surrounding API can run it with the value it supplies.
    process.nextTick(() => client.emit('connect'));
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.info({ event: 'redis.test.stub' }, 'Redis test stub connected');
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am keeping `disconnectRedis` as a named asynchronous helper so the surrounding workflow can call this step when it needs it.
  async function disconnectRedis() {
    // In tests this is a no-op, but still flips posture for consistent behavior.
    markShuttingDown('test_disconnect');
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am exporting this value here so another module can deliberately reuse the completed piece from redisClient.js.
  module.exports = {
    // I am keeping this line here because the surrounding redisClient.js workflow expects this value or operation before it continues.
    client,
    // I am keeping this line here because the surrounding redisClient.js workflow expects this value or operation before it continues.
    connectRedis,
    // I am keeping this line here because the surrounding redisClient.js workflow expects this value or operation before it continues.
    disconnectRedis,
    // I am keeping this line here because the surrounding redisClient.js workflow expects this value or operation before it continues.
    markShuttingDown,
    // I am keeping this line here because the surrounding redisClient.js workflow expects this value or operation before it continues.
    isShuttingDown,
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  };
  // This return sends the completed value or response back to the code that called this function.
  return;
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// -------------------------------
// Normal runtime client
// -------------------------------
const { createClient } = require('redis');

// Pull from config only (config.redis is populated from env in one place)
const REDIS_CONFIG = {
  url: config.redis.url,         // preferred if set
  host: config.redis.host,       // fallback path
  // I am keeping the `port` field in this object so the receiving code can read that value by its expected name.
  port: config.redis.port,
  // I am keeping the `password` field in this object so the receiving code can read that value by its expected name.
  password: config.redis.password,
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
};

// I am saving `socketBase` here so the nearby steps can reuse the same value without rebuilding it each time.
const socketBase = {
  // I am keeping the `connectTimeout` field in this object so the receiving code can read that value by its expected name.
  connectTimeout: 5000,
  // I am keeping the `reconnectStrategy` field in this object so the receiving code can read that value by its expected name.
  reconnectStrategy: (retries) => {
    // Gradual backoff up to 2s
    const delay = Math.min(retries * 50, 2000);
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.warn({ event: 'redis.reconnect_attempt', retries, delay }, 'Redis reconnect attempt');
    // This return sends the completed value or response back to the code that called this function.
    return delay;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  },
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
};

// Prefer REDIS_URL, else host/port/password
const client = REDIS_CONFIG.url
  // I am keeping this line here because the surrounding redisClient.js workflow expects this value or operation before it continues.
  ? createClient({
      // I am keeping the `url` field in this object so the receiving code can read that value by its expected name.
      url: REDIS_CONFIG.url,
      // I am keeping the `socket` field in this object so the receiving code can read that value by its expected name.
      socket: socketBase,
      // NOTE: If the URL already contains the password, this is redundant but harmless.
      password: REDIS_CONFIG.password,
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    })
  // I am keeping this line here because the surrounding redisClient.js workflow expects this value or operation before it continues.
  : createClient({
      // I am keeping the `socket` field in this object so the receiving code can read that value by its expected name.
      socket: { ...socketBase, host: REDIS_CONFIG.host, port: REDIS_CONFIG.port },
      // I am keeping the `password` field in this object so the receiving code can read that value by its expected name.
      password: REDIS_CONFIG.password,
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

// -------------------------------
// Observability
// -------------------------------
client.on('connect', () => {
  // I am calling this helper here so the current workflow performs this step before it moves on.
  logger.info(
    // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
    {
      // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
      event: 'redis.connect',
      // I am keeping the `usingUrl` field in this object so the receiving code can read that value by its expected name.
      usingUrl: !!REDIS_CONFIG.url,
      // I am keeping the `host` field in this object so the receiving code can read that value by its expected name.
      host: REDIS_CONFIG.host,
      // I am keeping the `port` field in this object so the receiving code can read that value by its expected name.
      port: REDIS_CONFIG.port,
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    },
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    'Redis TCP connected'
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  );
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
});

// I am defining this small callback here so the surrounding API can run it with the value it supplies.
client.on('ready', () => {
  // I am calling this helper here so the current workflow performs this step before it moves on.
  logger.info({ event: 'redis.ready' }, 'Redis ready');
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
});

// I am defining this small callback here so the surrounding API can run it with the value it supplies.
client.on('error', (err) => {
  // During shutdown, errors can happen while quitting/closing sockets; don’t scream.
  if (shuttingDown) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.warn(
      // I am keeping this line here because the surrounding redisClient.js workflow expects this value or operation before it continues.
      { event: 'redis.error_during_shutdown', code: err.code, message: err.message },
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      'Redis error during shutdown'
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    );
    // This return sends the completed value or response back to the code that called this function.
    return;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am calling this helper here so the current workflow performs this step before it moves on.
  logger.error(
    // I am keeping this line here because the surrounding redisClient.js workflow expects this value or operation before it continues.
    { event: 'redis.error', code: err.code, message: err.message },
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    'Redis connection error'
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  );
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
});

// I am defining this small callback here so the surrounding API can run it with the value it supplies.
client.on('reconnecting', () => {
  // During shutdown we do NOT want reconnect chatter.
  if (shuttingDown) return;
  // I am calling this helper here so the current workflow performs this step before it moves on.
  logger.warn({ event: 'redis.reconnecting' }, 'Redis attempting to reconnect');
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
});

// I am defining this small callback here so the surrounding API can run it with the value it supplies.
client.on('end', () => {
  // This is the line that was scaring you during normal shutdown.
  if (shuttingDown) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.info({ event: 'redis.disconnected', expected: true }, 'Redis disconnected (shutdown)');
  // This alternative runs only when the condition above did not use its first path.
  } else {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.error({ event: 'redis.disconnected', expected: false }, 'Redis disconnected');
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
});

// -------------------------------
// Lifecycle helpers
// -------------------------------
async function connectRedis() {
  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // If we reconnect in a long-running process (rare), clear shutdown posture.
    shuttingDown = false;

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!client.isOpen) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      logger.info({ event: 'redis.connect_start' }, 'Redis initiating connection');
      // I am waiting for this asynchronous step here so the next line does not use its result before it is ready.
      await client.connect();

      // Optional quick probe for sanity
      try {
        // I am saving `t0` here so the nearby steps can reuse the same value without rebuilding it each time.
        const t0 = Date.now();
        // I am saving `pong` here so the nearby steps can reuse the same value without rebuilding it each time.
        const pong = await client.ping();
        // I am calling this helper here so the current workflow performs this step before it moves on.
        logger.info({ event: 'redis.ping', pong, ms: Date.now() - t0 }, 'Redis ping after connect');
      // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
      } catch (probeErr) {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        logger.warn({ event: 'redis.ping_fail', message: probeErr.message }, 'Redis ping failed');
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }

      // I am calling this helper here so the current workflow performs this step before it moves on.
      logger.info({ event: 'redis.connect_ok' }, 'Redis connection established');
    // This alternative runs only when the condition above did not use its first path.
    } else {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      logger.info({ event: 'redis.already_open' }, 'Redis already connected');
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (err) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.error(
      // I am keeping this line here because the surrounding redisClient.js workflow expects this value or operation before it continues.
      { event: 'redis.connect_fail', code: err.code, message: err.message },
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      'Redis failed to connect'
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    );
    throw err; // fail fast if your app requires Redis
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `disconnectRedis` as a named asynchronous helper so the surrounding workflow can call this step when it needs it.
async function disconnectRedis() {
  // Flip posture FIRST so any ensuing redis events log as expected
  markShuttingDown('disconnectRedis');

  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (client.isOpen) {
      await client.quit(); // graceful close
      // I am calling this helper here so the current workflow performs this step before it moves on.
      logger.info({ event: 'redis.quit_ok' }, 'Redis connection closed');
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (err) {
    // During shutdown: warn is more appropriate than error, but still visible.
    logger.warn({ event: 'redis.quit_err', message: err.message }, 'Redis disconnect error');
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am exporting this value here so another module can deliberately reuse the completed piece from redisClient.js.
module.exports = {
  // I am keeping this line here because the surrounding redisClient.js workflow expects this value or operation before it continues.
  client,
  // I am keeping this line here because the surrounding redisClient.js workflow expects this value or operation before it continues.
  connectRedis,
  // I am keeping this line here because the surrounding redisClient.js workflow expects this value or operation before it continues.
  disconnectRedis,
  // I am keeping this line here because the surrounding redisClient.js workflow expects this value or operation before it continues.
  markShuttingDown,
  // I am keeping this line here because the surrounding redisClient.js workflow expects this value or operation before it continues.
  isShuttingDown,
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
};