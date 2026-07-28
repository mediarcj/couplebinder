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
setIfEmpty('APP_NAME', 'Test App');
setIfEmpty('PUBLIC_ORIGIN', 'http://localhost:3000');
setIfEmpty('CSRF_SECRET', 'test_csrf_secret');

// Supabase test defaults
setIfEmpty('SUPABASE_URL', 'http://localhost:54321');
setIfEmpty('SUPABASE_ANON_KEY', 'test_anon_key');
setIfEmpty(
  'SUPABASE_JWKS',
  '{"keys":[{"kty":"RSA","kid":"test-rs256","use":"sig","alg":"RS256","n":"sXch7hP9_EZ7pQYfRzRkFMp6R8EV6Z2e7qjRUkzV68ZGjf6M2GQ4VdXMhVFwK3SxQzBxf1qWz5j0To3wOef8g4ZxO0n3xPd8R6ePKP8h-d_NvG6sFhQY9P9qAnrV0Q9pQ9YJtJ4L3qL8YmYj2XJqQ6jY1rJjvL3QmG8XmU2pZx8KJ3W8cH1kN5uO3hH6V4mG7xN6wT8xQ9kK4rH7Y2jP5cV1mN8sQ3bL6zD9fR2wX5kT7pJ1hG4nM8vQ6yC3aS9eF2uB5rD7xK1mP4qN8tV6wY3zA9cE2gH5jL7nR1sU4xZ8bC6dF3hJ9kM2pQ5tV7wY1zA","e":"AQAB"}]}'
);
setIfEmpty('SUPABASE_JWKS_URL', 'http://localhost:54321/.well-known/jwks.json');
setIfEmpty('SUPABASE_ISSUER', 'http://localhost:54321');
setIfEmpty('SUPABASE_EXPECTED_AUD', 'authenticated');
process.env.JWT_ALLOWED_ALGS = 'RS256,ES256';

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

// Health endpoint access (public in tests)
setIfEmpty('HEALTH_PUBLIC', 'true');

// Rate limit and firewall behavior in tests
process.env.SKIP_RATE_LIMIT_IN_TEST = 'true';
process.env.RATE_LIMIT_ENABLED = 'false';
process.env.IP_BLOCKLIST = '192.168.1.100';

// Default cookie & header names if your CSRF code needs them
setIfEmpty('CSRF_COOKIE_NAME', 'csrf_token');
setIfEmpty('CSRF_HEADER_NAME', 'x-csrf-token');

// If your auth guard reads this to decide cookie name:
setIfEmpty('AUTH_COOKIE_NAME', 'sb_session');
setIfEmpty(
  'AUTH_ROLE_LEGACY_APP_METADATA_ROLE',
  'false'
);
setIfEmpty(
  'AUTH_ROLE_LEGACY_TOP_LEVEL_USER_ROLE',
  'false'
);
setIfEmpty(
  'AUTH_ROLE_SUPER_USER_AS_ADMIN',
  'false'
);

// Block process.exit during tests
process.exit = (code) => {
  const err = new Error(`Blocked process.exit(${code}) during tests`);
  throw err;
};
