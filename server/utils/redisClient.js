// File: server/utils/redisClient.js
// Description: Centralized Redis client that reads ONLY from config (single source of truth)
// Purpose: Reliable Redis with auto-reconnect, test stub, and structured logs

const { config } = require('../config');       // <-- single source of truth
const logger = require('./logger');

const isTest = config.server.nodeEnv === 'test';

// -------------------------------
// Test-only healthy stub
// -------------------------------
if (isTest) {
  const { EventEmitter } = require('events');
  const client = new EventEmitter();

  client.ping   = async () => 'PONG';
  client.exists = async () => 0;
  client.get    = async () => null;
  client.set    = async () => 'OK';
  client.del    = async () => 0;
  client.incr   = async () => 1;
  client.sAdd   = async () => 1;
  client.sRem   = async () => 0;
  client.expire = async () => 1;
  client.multi  = () => {
    const chain = {
      set()   { return chain; },
      get()   { return chain; },
      sAdd()  { return chain; },
      expire(){ return chain; },
      del()   { return chain; },
      sRem()  { return chain; },
      incr()  { return chain; },
      exec: async () => []
    };
    return chain;
  };
  client.quit   = async () => {};
  client.isOpen = true;

  async function connectRedis() {
    process.nextTick(() => client.emit('connect'));
    logger.info({ event: 'redis.test.stub' }, 'Redis test stub connected');
  }
  async function disconnectRedis() {
    // no-op in stub
  }

  module.exports = { client, connectRedis, disconnectRedis };
  return;
}

// -------------------------------
// Normal runtime client
// -------------------------------
const { createClient } = require('redis');

// Pull from config only (config.redis is populated from env in one place)
const REDIS_CONFIG = {
  url:      config.redis.url,       // preferred if set
  host:     config.redis.host,      // fallback path
  port:     config.redis.port,
  password: config.redis.password
};

const socketBase = {
  connectTimeout: 5000,
  reconnectStrategy: (retries) => {
    // Gradual backoff up to 2s
    const delay = Math.min(retries * 50, 2000);
    logger.warn({ event: 'redis.reconnect_attempt', retries, delay }, 'Redis reconnect attempt');
    return delay;
  }
};

// Prefer REDIS_URL, else host/port/password
const client = REDIS_CONFIG.url
  ? createClient({
      url: REDIS_CONFIG.url,
      socket: socketBase,
      password: REDIS_CONFIG.password
    })
  : createClient({
      socket: { ...socketBase, host: REDIS_CONFIG.host, port: REDIS_CONFIG.port },
      password: REDIS_CONFIG.password
    });

// -------------------------------
// Observability
// -------------------------------
client.on('connect', () => {
  logger.info(
    { event: 'redis.connect', usingUrl: !!REDIS_CONFIG.url, host: REDIS_CONFIG.host, port: REDIS_CONFIG.port },
    'Redis TCP connected'
  );
});

client.on('ready', () => {
  logger.info({ event: 'redis.ready' }, 'Redis ready');
});

client.on('error', (err) => {
  logger.error({ event: 'redis.error', code: err.code, message: err.message }, 'Redis connection error');
});

client.on('reconnecting', () => {
  logger.warn({ event: 'redis.reconnecting' }, 'Redis attempting to reconnect');
});

client.on('end', () => {
  logger.error({ event: 'redis.disconnected' }, 'Redis disconnected');
});

// -------------------------------
// Lifecycle helpers
// -------------------------------
async function connectRedis() {
  try {
    if (!client.isOpen) {
      logger.info({ event: 'redis.connect_start' }, 'Redis initiating connection');
      await client.connect();
      // Optional quick probe for sanity
      try {
        const t0 = Date.now();
        const pong = await client.ping();
        logger.info({ event: 'redis.ping', pong, ms: Date.now() - t0 }, 'Redis ping after connect');
      } catch (probeErr) {
        logger.warn({ event: 'redis.ping_fail', message: probeErr.message }, 'Redis ping failed');
      }
      logger.info({ event: 'redis.connect_ok' }, 'Redis connection established');
    } else {
      logger.info({ event: 'redis.already_open' }, 'Redis already connected');
    }
  } catch (err) {
    logger.error({ event: 'redis.connect_fail', code: err.code, message: err.message }, 'Redis failed to connect');
    throw err; // fail fast if your app requires Redis
  }
}

async function disconnectRedis() {
  try {
    if (client.isOpen) {
      await client.quit(); // graceful close
      logger.info({ event: 'redis.quit_ok' }, 'Redis connection closed');
    }
  } catch (err) {
    logger.error({ event: 'redis.quit_err', message: err.message }, 'Redis disconnect error');
  }
}

module.exports = { client, connectRedis, disconnectRedis };