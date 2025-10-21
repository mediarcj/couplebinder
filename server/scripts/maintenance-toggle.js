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
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

// Configuration
const MAINTENANCE_KEY = process.env.MAINTENANCE_KEY || 'maintenance:mode';
const REDIS_URL = process.env.REDIS_URL;

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
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error('Usage: node maintenance-toggle.js on|off [--ttl=SECONDS]');
    console.error('');
    console.error('Examples:');
    console.error('  node maintenance-toggle.js on');
    console.error('  node maintenance-toggle.js off');
    console.error('  node maintenance-toggle.js on --ttl=3600');
    process.exit(1);
  }
  
  const action = args[0].toLowerCase();
  if (!['on', 'off'].includes(action)) {
    console.error('Error: Action must be "on" or "off"');
    console.error('Usage: node maintenance-toggle.js on|off [--ttl=SECONDS]');
    process.exit(1);
  }
  
  // Parse TTL from --ttl flag
  let ttl = null;
  const ttlArg = args.find(arg => arg.startsWith('--ttl='));
  if (ttlArg) {
    const ttlValue = parseInt(ttlArg.split('=')[1], 10);
    if (!isNaN(ttlValue) && ttlValue > 0) {
      ttl = ttlValue;
    } else {
      console.error('Error: TTL must be a positive number');
      process.exit(1);
    }
  }
  
  return { action, ttl };
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
  if (!REDIS_URL) {
    console.error('Error: REDIS_URL environment variable is not set');
    console.error('');
    console.error('To use Redis-based maintenance toggle:');
    console.error('1. Set REDIS_URL in your .env file or environment');
    console.error('2. Example: REDIS_URL=redis://localhost:6379');
    console.error('');
    console.error('Alternative: Use environment fallback:');
    console.error('1. Set MAINTENANCE_DEFAULT=on in .env');
    console.error('2. Restart the application server');
    process.exit(0); // Exit 0 because this is guidance, not an error
  }
  
  const client = redis.createClient({
    url: REDIS_URL,
    socket: {
      connectTimeout: 5000,
      reconnectStrategy: false // Don't auto-reconnect for CLI
    }
  });
  
  try {
    await client.connect();
    return client;
  } catch (error) {
    console.error('Error: Cannot connect to Redis');
    console.error(`  URL: ${REDIS_URL}`);
    console.error(`  Error: ${error.message}`);
    console.error('');
    console.error('Please check:');
    console.error('1. Redis server is running');
    console.error('2. REDIS_URL is correct');
    console.error('3. Network connectivity to Redis');
    console.error('');
    console.error('Alternative: Use environment fallback:');
    console.error('1. Set MAINTENANCE_DEFAULT=on in .env');
    console.error('2. Restart the application server');
    process.exit(1);
  }
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
  try {
    if (action === 'on') {
      if (ttl) {
        await client.setEx(MAINTENANCE_KEY, ttl, 'on');
        console.log(`✓ Maintenance mode ENABLED for ${ttl} seconds`);
        console.log(`  Key: ${MAINTENANCE_KEY}`);
        console.log(`  Expires: ${new Date(Date.now() + ttl * 1000).toISOString()}`);
      } else {
        await client.set(MAINTENANCE_KEY, 'on');
        console.log('✓ Maintenance mode ENABLED (no expiration)');
        console.log(`  Key: ${MAINTENANCE_KEY}`);
      }
    } else {
      const result = await client.del(MAINTENANCE_KEY);
      if (result > 0) {
        console.log('✓ Maintenance mode DISABLED');
        console.log(`  Key: ${MAINTENANCE_KEY} (removed)`);
      } else {
        console.log('✓ Maintenance mode was already DISABLED');
        console.log(`  Key: ${MAINTENANCE_KEY} (not found)`);
      }
    }
    
    console.log('');
    console.log('Note: Changes take effect immediately without server restart');
  } catch (error) {
    console.error('Error: Failed to toggle maintenance mode');
    console.error(`  Error: ${error.message}`);
    process.exit(1);
  }
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
  const { action, ttl } = parseArgs();
  
  console.log('Detechify Maintenance Mode Toggle');
  console.log('================================');
  console.log('');
  
  const client = await createRedisClient();
  
  try {
    await toggleMaintenance(client, action, ttl);
  } finally {
    await client.quit();
  }
}

// Handle uncaught errors gracefully
process.on('uncaughtException', (error) => {
  console.error('Unexpected error:', error.message);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unexpected error:', reason);
  process.exit(1);
});

// Run the CLI
main().catch((error) => {
  console.error('Fatal error:', error.message);
  process.exit(1);
});
