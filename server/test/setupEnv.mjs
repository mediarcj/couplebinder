// File: server/test/setupEnv.mjs
// Description: Test environment setup
// Purpose: Load environment variables and set safe defaults for testing
// Notes: Provides minimal config if CI forgot something

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

process.env.PUBLIC_ORIGIN ||= 'http://localhost:3000';
process.env.APP_NAME ||= 'Detechify (Test)';
process.env.CSRF_SECRET ||= 'test_csrf_secret';

process.env.SUPABASE_URL ||= 'http://localhost:54321';
process.env.SUPABASE_ANON_KEY ||= 'test_anon_key';
process.env.SUPABASE_JWKS ||= '{"keys":[{"kty":"oct","k":"dGVzdF9zZWNyZXQ"}]}';

process.env.JWT_ALLOWED_ALGS ||= 'HS256,RS256,ES256';

process.env.TEXT_MIN_LEN ||= '20';
process.env.TEXT_MAX_LEN ||= '5000';
process.env.MAX_SUBMISSIONS ||= '10';

process.env.REDIS_TEST_MODE ||= 'memory';
process.env.FIREWALL_FAIL_CLOSED ||= 'true';

