// File: server/test/setupEnv.mjs
// Description: Test environment setup
// Purpose: Load environment variables and set safe defaults for testing
// Notes: Provides minimal config if CI forgot something

import path from 'node:path';
import { config as loadEnv } from 'dotenv';

// Load .env.test first; then fall back to .env if present
loadEnv({ path: path.resolve(process.cwd(), '.env.test') });
loadEnv(); // optional fallback

// Minimal safe defaults if CI forgot something
process.env.NODE_ENV ||= 'test';
process.env.PUBLIC_ORIGIN ||= 'http://localhost:3000';
process.env.FIREWALL_FAIL_CLOSED ||= 'true';
process.env.JWT_ALLOWED_ALGS ||= 'HS256,RS256,ES256';

// Allow tests to run without a live Redis client
process.env.REDIS_TEST_MODE ||= 'memory';

