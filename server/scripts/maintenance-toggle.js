#!/usr/bin/env node

// File: server/scripts/maintenance-toggle.js
// Description: CLI tool to toggle maintenance mode via Redis
// Purpose: Instant maintenance mode control without server restart
// Usage: node maintenance-toggle.js on|off [--ttl=SECONDS]

/**
 * WHAT:
 * Command-line tool to toggle maintenance mode on/off with optional TTL.
 * 
 * WHY:
 * Ops team needs instant maintenance control without redeploying or restarting.
 * Redis provides real-time toggle capability.
 * 
 * HOW:
 * 1. Check Redis connection availability
 * 2. Set maintenance key to 'on' or 'off'
 * 3. Optionally set TTL for automatic expiration
 * 4. Provide clear feedback and guidance
 */

const redis = require('redis');
// I am loading `path` into `path` so this file can reuse that dependency below.
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

// Configuration
const MAINTENANCE_KEY = process.env.MAINTENANCE_KEY || 'maintenance:mode';

/** Helper: Build a Redis URL from parts if REDIS_URL isn't set */
function buildRedisUrlFromParts(env) {
  // I am saving `host` here so the nearby steps can reuse the same value without rebuilding it each time.
  const host = (env.REDIS_HOST || 'redis').toString();
  // I am saving `port` here so the nearby steps can reuse the same value without rebuilding it each time.
  const port = (env.REDIS_PORT || '6379').toString();
  // I am saving `pw` here so the nearby steps can reuse the same value without rebuilding it each time.
  const pw = env.REDIS_PASSWORD ? encodeURIComponent(env.REDIS_PASSWORD) : '';
  // I am saving `auth` here so the nearby steps can reuse the same value without rebuilding it each time.
  const auth = pw ? `:${pw}@` : '';
  // This return sends the completed value or response back to the code that called this function.
  return `redis://${auth}${host}:${port}`;
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/** Helper: Choose explicit REDIS_URL if provided, otherwise synthesize from parts */
function resolveRedisUrl(env) {
  // This return sends the completed value or response back to the code that called this function.
  return (env.REDIS_URL && env.REDIS_URL.trim()) || buildRedisUrlFromParts(env);
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/** Helper: Redact password from URL for safe logging */
function redactRedisUrl(u) {
  // This return sends the completed value or response back to the code that called this function.
  return (u || '').replace(/:(?:[^@]+)@/, ':****@');
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * WHAT:
 * Parse command line arguments for maintenance toggle.
 * 
 * WHY:
 * Need to support 'on', 'off', and optional TTL parameter.
 * 
 * HOW:
 * Parse argv for action and extract TTL from --ttl flag.
 */
function parseArgs() {
  // I am saving `args` here so the nearby steps can reuse the same value without rebuilding it each time.
  const args = process.argv.slice(2);
  
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (args.length === 0) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    console.error('Usage: node maintenance-toggle.js on|off [--ttl=SECONDS]');
    // I am calling this helper here so the current workflow performs this step before it moves on.
    console.error('');
    // I am calling this helper here so the current workflow performs this step before it moves on.
    console.error('Examples:');
    // I am calling this helper here so the current workflow performs this step before it moves on.
    console.error('  node maintenance-toggle.js on');
    // I am calling this helper here so the current workflow performs this step before it moves on.
    console.error('  node maintenance-toggle.js off');
    // I am calling this helper here so the current workflow performs this step before it moves on.
    console.error('  node maintenance-toggle.js on --ttl=3600');
    // I am calling this helper here so the current workflow performs this step before it moves on.
    process.exit(1);
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
  
  // I am saving `action` here so the nearby steps can reuse the same value without rebuilding it each time.
  const action = args[0].toLowerCase();
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!['on', 'off'].includes(action)) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    console.error('Error: Action must be "on" or "off"');
    // I am calling this helper here so the current workflow performs this step before it moves on.
    console.error('Usage: node maintenance-toggle.js on|off [--ttl=SECONDS]');
    // I am calling this helper here so the current workflow performs this step before it moves on.
    process.exit(1);
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
  
  // Parse TTL from --ttl flag
  let ttl = null;

  // Support both "--ttl=3600" and "--ttl 3600"
  for (let i = 1; i < args.length; i++) {
    // I am saving `a` here so the nearby steps can reuse the same value without rebuilding it each time.
    const a = args[i];
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (a === '--ttl') {
      // I am saving `next` here so the nearby steps can reuse the same value without rebuilding it each time.
      const next = args[i + 1];
      // I am saving `num` here so the nearby steps can reuse the same value without rebuilding it each time.
      const num = next ? parseInt(next, 10) : NaN;
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (!isNaN(num) && num > 0) {
        // I am keeping this line here because the surrounding maintenance-toggle.js workflow expects this value or operation before it continues.
        ttl = num;
        // I am keeping this line here because the surrounding maintenance-toggle.js workflow expects this value or operation before it continues.
        i++;
      // This alternative runs only when the condition above did not use its first path.
      } else {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        console.error('Error: TTL must be a positive number');
        // I am calling this helper here so the current workflow performs this step before it moves on.
        process.exit(1);
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // I am checking this next possibility only because the earlier condition did not choose its path.
    } else if (a.startsWith('--ttl=')) {
      // I am saving `num` here so the nearby steps can reuse the same value without rebuilding it each time.
      const num = parseInt(a.split('=')[1], 10);
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (!isNaN(num) && num > 0) {
        // I am keeping this line here because the surrounding maintenance-toggle.js workflow expects this value or operation before it continues.
        ttl = num;
      // This alternative runs only when the condition above did not use its first path.
      } else {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        console.error('Error: TTL must be a positive number');
        // I am calling this helper here so the current workflow performs this step before it moves on.
        process.exit(1);
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (action === 'off' && ttl !== null) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    console.warn('Note: TTL is ignored when turning maintenance OFF.');
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
  
  // This return sends the completed value or response back to the code that called this function.
  return { action, ttl };
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * WHAT:
 * Create Redis client and test connection.
 * 
 * WHY:
 * Need to verify Redis is available before attempting operations.
 * 
 * HOW:
 * Create client with connection timeout and test connectivity.
 */
async function createRedisClient() {
  // Resolve URL from REDIS_URL or fallback to REDIS_HOST/PORT/PASSWORD
  const url = resolveRedisUrl(process.env);

  // I am saving `client` here so the nearby steps can reuse the same value without rebuilding it each time.
  const client = redis.createClient({
    // I am keeping this line here because the surrounding maintenance-toggle.js workflow expects this value or operation before it continues.
    url,
    // I am keeping the `socket` field in this object so the receiving code can read that value by its expected name.
    socket: {
      // I am keeping the `connectTimeout` field in this object so the receiving code can read that value by its expected name.
      connectTimeout: 5000,
      reconnectStrategy: false // Don't auto-reconnect for CLI
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });
  
  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // I am waiting for this asynchronous step here so the next line does not use its result before it is ready.
    await client.connect();
    // This return sends the completed value or response back to the code that called this function.
    return client;
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (error) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    console.error('Error: Cannot connect to Redis');
    // I am calling this helper here so the current workflow performs this step before it moves on.
    console.error(`  URL: ${redactRedisUrl(url)}`);
    // I am calling this helper here so the current workflow performs this step before it moves on.
    console.error(`  Error: ${error.message}`);
    // I am calling this helper here so the current workflow performs this step before it moves on.
    console.error('');
    // I am calling this helper here so the current workflow performs this step before it moves on.
    console.error('Please check:');
    // I am calling this helper here so the current workflow performs this step before it moves on.
    console.error('1. Redis server is running');
    // I am calling this helper here so the current workflow performs this step before it moves on.
    console.error('2. Connection env vars are correct (REDIS_HOST/PORT/PASSWORD or REDIS_URL)');
    // I am calling this helper here so the current workflow performs this step before it moves on.
    console.error('3. Network connectivity to Redis');
    // I am calling this helper here so the current workflow performs this step before it moves on.
    console.error('');
    // I am calling this helper here so the current workflow performs this step before it moves on.
    console.error('Alternative: Use environment fallback:');
    // I am calling this helper here so the current workflow performs this step before it moves on.
    console.error('1. Set MAINTENANCE_DEFAULT=on in .env');
    // I am calling this helper here so the current workflow performs this step before it moves on.
    console.error('2. Restart the application server');
    // I am calling this helper here so the current workflow performs this step before it moves on.
    process.exit(1);
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * WHAT:
 * Execute the maintenance mode toggle operation.
 * 
 * WHY:
 * Need to set Redis key and optionally TTL for maintenance control.
 * 
 * HOW:
 * Use Redis SET with EX for TTL, or DEL for turning off.
 */
async function toggleMaintenance(client, action, ttl) {
  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (action === 'on') {
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (ttl) {
        // I am waiting for this asynchronous step here so the next line does not use its result before it is ready.
        await client.setEx(MAINTENANCE_KEY, ttl, 'on');
        // I am calling this helper here so the current workflow performs this step before it moves on.
        console.log(`[OK] Maintenance mode ENABLED for ${ttl} seconds`);
        // I am calling this helper here so the current workflow performs this step before it moves on.
        console.log(`  Key: ${MAINTENANCE_KEY}`);
        // I am calling this helper here so the current workflow performs this step before it moves on.
        console.log(`  Expires: ${new Date(Date.now() + ttl * 1000).toISOString()}`);
      // This alternative runs only when the condition above did not use its first path.
      } else {
        // I am waiting for this asynchronous step here so the next line does not use its result before it is ready.
        await client.set(MAINTENANCE_KEY, 'on');
        // I am calling this helper here so the current workflow performs this step before it moves on.
        console.log('[OK] Maintenance mode ENABLED (no expiration)');
        // I am calling this helper here so the current workflow performs this step before it moves on.
        console.log(`  Key: ${MAINTENANCE_KEY}`);
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // This alternative runs only when the condition above did not use its first path.
    } else {
      // I am saving `result` here so the nearby steps can reuse the same value without rebuilding it each time.
      const result = await client.del(MAINTENANCE_KEY);
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (result > 0) {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        console.log('[OK] Maintenance mode DISABLED');
        // I am calling this helper here so the current workflow performs this step before it moves on.
        console.log(`  Key: ${MAINTENANCE_KEY} (removed)`);
      // This alternative runs only when the condition above did not use its first path.
      } else {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        console.log('[OK] Maintenance mode was already DISABLED');
        // I am calling this helper here so the current workflow performs this step before it moves on.
        console.log(`  Key: ${MAINTENANCE_KEY} (not found)`);
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    
    // I am calling this helper here so the current workflow performs this step before it moves on.
    console.log('');
    // I am calling this helper here so the current workflow performs this step before it moves on.
    console.log('Note: Changes take effect immediately without server restart');
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (error) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    console.error('Error: Failed to toggle maintenance mode');
    // I am calling this helper here so the current workflow performs this step before it moves on.
    console.error(`  Error: ${error.message}`);
    // I am calling this helper here so the current workflow performs this step before it moves on.
    process.exit(1);
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * WHAT:
 * Main CLI execution function.
 * 
 * WHY:
 * Orchestrate argument parsing, Redis connection, and maintenance toggle.
 * 
 * HOW:
 * Parse args, connect to Redis, execute toggle, cleanup connection.
 */
async function main() {
  // I am saving `action` here so the nearby steps can reuse the same value without rebuilding it each time.
  const { action, ttl } = parseArgs();
  
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log('Maintenance Mode Toggle');
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log('================================');
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log('');
  
  // I am saving `client` here so the nearby steps can reuse the same value without rebuilding it each time.
  const client = await createRedisClient();
  
  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // I am waiting for this asynchronous step here so the next line does not use its result before it is ready.
    await toggleMaintenance(client, action, ttl);
  // This final block runs after success or failure so the shared cleanup still happens in either outcome.
  } finally {
    // I am waiting for this asynchronous step here so the next line does not use its result before it is ready.
    await client.quit();
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// Handle uncaught errors gracefully
process.on('uncaughtException', (error) => {
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.error('Unexpected error:', error.message);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  process.exit(1);
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
});

// I am defining this small callback here so the surrounding API can run it with the value it supplies.
process.on('unhandledRejection', (reason) => {
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.error('Unexpected error:', reason);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  process.exit(1);
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
});

// Run the CLI
main().catch((error) => {
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.error('Fatal error:', error.message);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  process.exit(1);
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
});