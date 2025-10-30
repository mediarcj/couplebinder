// File: server/test/setupEnv.mjs
// Description: Test environment setup with env var normalization
// Purpose: Load environment variables and set safe defaults for testing
// Notes: Normalizes legacy env var names to canonical names used by config

import fs from 'node:fs';
import path from 'node:path';
import { config as loadEnv } from 'dotenv';

process.env.NODE_ENV = 'test';

const root = path.resolve(process.cwd());
const testEnv = path.join(root, '.env.test');

if (fs.existsSync(testEnv)) {
  loadEnv({ path: testEnv });
}

loadEnv();

// Helper to normalize legacy env var names to canonical names
const setIfEmpty = (name, val) => {
  if (process.env[name] === undefined || process.env[name] === '') {
    process.env[name] = String(val);
  }
};

const copyIfAlias = (canonical, aliases = []) => {
  if (process.env[canonical]) return;
  for (const a of aliases) {
    if (process.env[a] !== undefined && process.env[a] !== '') {
      process.env[canonical] = process.env[a];
      return;
    }
  }
};

// Normalize TEXT_MIN/TEXT_MAX to canonical names (config expects TEXT_MIN_LENGTH/TEXT_MAX_LENGTH)
copyIfAlias('TEXT_MIN_LENGTH', ['TEXT_MIN_LEN', 'TEXT_MIN', 'MIN_TEXT_LENGTH']);
copyIfAlias('TEXT_MAX_LENGTH', ['TEXT_MAX_LEN', 'TEXT_MAX', 'MAX_TEXT_LENGTH']);

// Set defaults if still missing
setIfEmpty('TEXT_MIN_LENGTH', 20);
setIfEmpty('TEXT_MAX_LENGTH', 5000);

// Core server defaults
setIfEmpty('HOST', '127.0.0.1');
setIfEmpty('PORT', '3000');
setIfEmpty('APP_NAME', 'Detechify (Test)');
setIfEmpty('PUBLIC_ORIGIN', 'http://localhost:3000');
setIfEmpty('CSRF_SECRET', 'test_csrf_secret');

// Supabase test defaults
setIfEmpty('SUPABASE_URL', 'http://localhost:54321');
setIfEmpty('SUPABASE_ANON_KEY', 'test_anon_key');
setIfEmpty('SUPABASE_JWKS', '{"keys":[{"kty":"oct","k":"dGVzdF9zZWNyZXQ"}]}');
setIfEmpty('SUPABASE_JWKS_URL', 'http://localhost:54321/.well-known/jwks.json');
setIfEmpty('SUPABASE_ISSUER', 'http://localhost:54321');
setIfEmpty('SUPABASE_EXPECTED_AUD', 'authenticated');
setIfEmpty('JWT_ALLOWED_ALGS', 'HS256,RS256,ES256');

// Rate limit defaults
setIfEmpty('RATE_LIMIT_GENERAL_RPM', '300');
setIfEmpty('RATE_LIMIT_LOGIN_PER_15M', '10');
setIfEmpty('RATE_LIMIT_SIGNUP_PER_HR', '5');

// Redis test mode (app should degrade gracefully)
setIfEmpty('REDIS_URL', 'redis://127.0.0.1:6380');
setIfEmpty('REDIS_TEST_MODE', 'memory');
setIfEmpty('REDIS_HOST', '127.0.0.1');
setIfEmpty('REDIS_PORT', '6380');

// Firewall fail-closed in tests
setIfEmpty('FIREWALL_FAIL_CLOSED', 'true');

// Submission limits
setIfEmpty('MAX_SUBMISSIONS', '10');

// Block process.exit during tests
const originalExit = process.exit;
process.exit = (code) => {
  const err = new Error(`Blocked process.exit(${code}) during tests`);
  throw err;
};

