// File: server/config/index.js
// Description: Centralized configuration management with validation
// Notes: Loads env once, derives a typed config object, validates it, and exposes a pretty boot summary.
// Security: Never logs secrets. Keep this module free of logger.js to avoid circular requires.

'use strict';

// I am loading `path` into `path` so this file can reuse that dependency below.
const path = require('path');

// ──────────────────────────────────────────────────────────────────────────────
// Env file loading (dotenv)
// ──────────────────────────────────────────────────────────────────────────────
// Goal:
//   - In development: read .env.development.local at repo root
//   - In production (EC2/SSM/Docker): read .env.production.full at repo root
//   - Never read the legacy .env file anymore.
//
// Note:
//   - Values already present in process.env (from Docker / systemd / shell)
//     always win; dotenv only fills in missing keys.
const NODE_ENV = process.env.NODE_ENV || 'development';
// I am saving `ROOT_DIR` here so the nearby steps can reuse the same value without rebuilding it each time.
const ROOT_DIR = path.join(__dirname, '..', '..');

// This check helps me choose or stop the next path before any work that depends on this condition runs.
if (NODE_ENV === 'development') {
  // Local development reads the checked-out developer file without overriding shell values.
  const devEnvPath = path.join(ROOT_DIR, '.env.development.local');
  // I am calling this helper here so the current workflow performs this step before it moves on.
  require('dotenv').config({ path: devEnvPath });
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`[config] Loaded development env from ${devEnvPath}`);
// I am checking this next possibility only because the earlier condition did not choose its path.
} else if (NODE_ENV === 'production') {
  // Production uses the explicit full environment file expected by the deployment scripts.
  const prodEnvPath = path.join(ROOT_DIR, '.env.production.full');
  // I am calling this helper here so the current workflow performs this step before it moves on.
  require('dotenv').config({ path: prodEnvPath });
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`[config] Loaded production env from ${prodEnvPath}`);
// This alternative runs only when the condition above did not use its first path.
} else {
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    `[config] NODE_ENV=${NODE_ENV} – no dotenv file loaded (process.env only).`
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  );
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// consoleLogger is loaded lazily in logConfigSummary() to avoid circular requires.

// ──────────────────────────────────────────────────────────────────────────────
// Env audit (optional, off by default)
// ──────────────────────────────────────────────────────────────────────────────
const KNOWN_ENV = new Set([
  // This declarative list feeds only the optional typo/unknown-key audit below.
  'ALLOWED_ORIGINS',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'ALLOW_LEGACY_LOGIN',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'APP_DESCRIPTION',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'APP_LIMITERS_ENABLED',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'APP_NAME',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'APP_SUBDOMAIN',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'APP_VERSION',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'ASSET_VERSION',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'AUTH_COOKIE_ALIASES',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'AUTH_COOKIE_BASENAME',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'AUTH_COOKIE_DOMAIN',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'AUTH_COOKIE_NAME',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'AUTH_DEBUG',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'AUTH_FRESH_GRACE_SEC',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'AUTH_SENTINEL_MS',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'AUTH_SET_COOKIE_ENFORCE_LOCKOUT',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'AUTH_SET_COOKIE_ENFORCE_TURNSTILE',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'AWS_REGION',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'BASE_DOMAIN',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'CANONICAL_HOST',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'CONFIG_ENV_AUDIT',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'COOKIE_SAMESITE',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'COOKIE_SECURE',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'COOKIE_SET_MAX',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'COOKIE_SET_WINDOW_MS',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'COOKIE_SET_WINDOW_SEC',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'CORS_ORIGINS',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'CSRF_COOKIE_NAME',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'CSRF_HEADER_NAME',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'CSRF_SECRET',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'DB_PROVIDER',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'ENFORCE_HTTPS',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'FEATURE_ARCHIVE_RECEIPTS',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'FEATURE_ARCHIVE_RECEIPTS_TABLE',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'FIREWALL_FAIL_CLOSED',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'HEALTH_PUBLIC',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'HOST',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'IMAGE_TAG',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'IP_BLOCKLIST',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'JWT_ALLOWED_ALGS',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'JWT_CLOCK_SKEW_SEC',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'LOCAL_LIMITERS_ENABLED',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'LOG_LEVEL',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'LOGIN_ATTEMPTS',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'LOGIN_MAX',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'LOGIN_WINDOW_MIN',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'LOGIN_WINDOW_MS',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'LOGOUT_MAX',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'LOGOUT_WINDOW_MS',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'MAINTENANCE_ALLOWLIST',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'MAINTENANCE_ALLOWED_PATHS',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'MAINTENANCE_BYPASS_TOKEN',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'MAINTENANCE_DEFAULT',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'MAINTENANCE_KEY',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'MAINTENANCE_MESSAGE',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'MAINTENANCE_PAGE',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'MAINTENANCE_RETRY_AFTER',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'MAX_SUBMISSIONS',

  // Infra: nginx proxy toggle.
  'NGINX_USE_SSL',

  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'NODE_ENV',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'OPS_DB_PROBE_RPC',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'OPS_DB_PROBE_TABLE',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'OPS_HEALTH_IPS',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'OPS_HEALTH_TOKEN',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'PASSWORD_RESET_REDIRECT_URL',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'PORT',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'PUBLIC_ORIGIN',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'RATE_LIMIT_ENABLED',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'RATE_LIMIT_MAX',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'RATE_LIMIT_WINDOW_MS',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'REDIS_HOST',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'REDIS_PASSWORD',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'REDIS_PORT',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'REDIS_URL',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'SELF_HOST_SUPABASE_JS',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'SESSION_SECRET',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'SHUTDOWN_GRACE_MS',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'SIGNUP_ATTEMPTS',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'SIGNUP_MAX',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'SIGNUP_WINDOW_MIN',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'SIGNUP_WINDOW_MS',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'SKIP_RATE_LIMIT_IN_DEV',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'SKIP_RATE_LIMIT_IN_TEST',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'STORAGE_PROVIDER',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'STORAGE_S3_BASE_PATH',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'STORAGE_S3_BUCKET',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'STORAGE_S3_PUBLIC_BASE_URL',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'STORAGE_S3_REGION',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'STRIPE_API_VERSION',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'STRIPE_CANCEL_PATH',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'STRIPE_PRICE_RESUME_EXPERT_LIVE',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'STRIPE_PRICE_RESUME_EXPERT_TEST',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'STRIPE_PRICE_RESUME_ONE_TIME_LIVE',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'STRIPE_PRICE_RESUME_ONE_TIME_TEST',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'STRIPE_PUBLISHABLE_KEY_LIVE',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'STRIPE_PUBLISHABLE_KEY_TEST',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'STRIPE_SECRET_KEY_LIVE',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'STRIPE_SECRET_KEY_TEST',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'STRIPE_SUCCESS_PATH',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'STRIPE_WEBHOOK_SECRET_LIVE',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'STRIPE_WEBHOOK_SECRET_TEST',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'SUPABASE_ANON_KEY',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'SUPABASE_DB_URL',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'SUPABASE_EXPECTED_AUD',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'SUPABASE_ISSUER',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'SUPABASE_JWKS_URL',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'SUPABASE_JWT_SECRET',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'SUPABASE_SERVICE_ROLE_KEY',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'SUPABASE_URL',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'TEXT_MAX_LENGTH',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'TEXT_MIN_LENGTH',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'TRUST_PROXY_HOPS',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'TURNSTILE_SECRET_KEY',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'TURNSTILE_SITE_KEY',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'X_CLIENT_INFO'
// This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
]);

// I am saving `APP_PREFIXES` here so the nearby steps can reuse the same value without rebuilding it each time.
const APP_PREFIXES = [
  // Limit warnings to names that look owned by this application or its infrastructure.
  'ALLOWED_',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'APP_',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'AUTH_',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'AWS_',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'BASE_',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'COOKIE_',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'CORS_',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'CSRF_',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'DB_',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'ENFORCE_',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'FEATURE_',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'FIREWALL_',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'IMAGE_',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'JWT_',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'LEGACY_',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'LOGIN_',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'LOGOUT_',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'MAINTENANCE_',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'NGINX_',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'OPS_',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'PUBLIC_',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'RATE_',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'REDIS_',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'SELF_HOST_',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'SESSION_',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'SHUTDOWN_',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'SIGNUP_',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'SKIP_',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'STRIPE_',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'SUPABASE_',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'TEXT_',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'TRUST_',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'X_',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'STORAGE_',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'LOG_'
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
];

// I am keeping `warnUnknownEnv` as a named helper so the surrounding workflow can call this step when it needs it.
function warnUnknownEnv() {
  // Compare app-shaped process keys against KNOWN_ENV without printing any secret values.
  const knownSize = KNOWN_ENV.size;

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!knownSize) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    console.warn('[config] KNOWN_ENV is empty inside the container');
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am saving `isAppKey` here so the nearby steps can reuse the same value without rebuilding it each time.
  const isAppKey = (key) =>
    // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
    key === 'NODE_ENV' ||
    // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
    key === 'PORT' ||
    // I am defining this small callback here so the surrounding API can run it with the value it supplies.
    APP_PREFIXES.some((prefix) => key.startsWith(prefix));

  // I am saving `unknown` here so the nearby steps can reuse the same value without rebuilding it each time.
  const unknown = Object.keys(process.env)
    // I am filtering the collection here so only items that pass the nearby check continue to the next step.
    .filter((key) => /^[A-Z0-9_]+$/.test(key))
    // I am filtering the collection here so only items that pass the nearby check continue to the next step.
    .filter(isAppKey)
    // I am filtering the collection here so only items that pass the nearby check continue to the next step.
    .filter((key) => !KNOWN_ENV.has(key));

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (unknown.length) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    console.warn(
      // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
      `[config] Unknown app/infra env keys present (ignored): ${unknown
        // I am continuing the existing call chain here so this option stays attached to the same operation started above.
        .sort()
        // I am continuing the existing call chain here so this option stays attached to the same operation started above.
        .join(', ')}`
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    );
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am saving `ENABLE_ENV_AUDIT` here so the nearby steps can reuse the same value without rebuilding it each time.
const ENABLE_ENV_AUDIT = process.env.CONFIG_ENV_AUDIT === '1';

// This check helps me choose or stop the next path before any work that depends on this condition runs.
if (ENABLE_ENV_AUDIT) {
  // I am calling this helper here so the current workflow performs this step before it moves on.
  warnUnknownEnv();
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────
function int(value, defaultValue) {
  // Central parsing keeps numeric defaults consistent across the typed config object.
  const parsed = Number.parseInt(value, 10);
  // This return sends the completed value or response back to the code that called this function.
  return Number.isFinite(parsed) ? parsed : defaultValue;
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `bool` as a named helper so the surrounding workflow can call this step when it needs it.
function bool(value, defaultValue = false) {
  // Accept common deployment spellings while returning the caller's safe default for typos.
  if (value === undefined || value === null) {
    // This return sends the completed value or response back to the code that called this function.
    return defaultValue;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am saving `normalized` here so the nearby steps can reuse the same value without rebuilding it each time.
  const normalized = String(value).trim().toLowerCase();

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (['1', 'true', 'yes', 'on', 'y'].includes(normalized)) {
    // This return sends the completed value or response back to the code that called this function.
    return true;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (['0', 'false', 'no', 'off', 'n'].includes(normalized)) {
    // This return sends the completed value or response back to the code that called this function.
    return false;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // This return sends the completed value or response back to the code that called this function.
  return defaultValue;
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `csv` as a named helper so the surrounding workflow can call this step when it needs it.
function csv(value) {
  // Allow comma-separated environment lists without leaving whitespace or empty entries.
  return value
    // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
    ? String(value)
        // I am continuing the existing call chain here so this option stays attached to the same operation started above.
        .split(',')
        // I am mapping the collection here so each input item becomes the output shape expected by the next step.
        .map((item) => item.trim())
        // I am filtering the collection here so only items that pass the nearby check continue to the next step.
        .filter(Boolean)
    // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
    : [];
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// JWKS verification currently supports the asymmetric algorithms used by
// Supabase signing keys.
const SUPPORTED_JWKS_ALGORITHMS = Object.freeze(['RS256', 'ES256']);

// I am keeping `parseJwtAlgorithms` as a named helper so the surrounding workflow can call this step when it needs it.
function parseJwtAlgorithms(value) {
  // Return requested, accepted, and invalid sets so validation can explain unsupported values.
  const requested = value
    // I am mapping the collection here so each input item becomes the output shape expected by the next step.
    ? csv(value).map((algorithm) => algorithm.toUpperCase())
    // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
    : [...SUPPORTED_JWKS_ALGORITHMS];

  // I am saving `uniqueRequested` here so the nearby steps can reuse the same value without rebuilding it each time.
  const uniqueRequested = [...new Set(requested)];

  // This return sends the completed value or response back to the code that called this function.
  return {
    // I am keeping the `requested` field in this object so the receiving code can read that value by its expected name.
    requested: uniqueRequested,
    // I am filtering the collection here so only items that pass the nearby check continue to the next step.
    allowed: uniqueRequested.filter((algorithm) =>
      // I am calling this helper here so the current workflow performs this step before it moves on.
      SUPPORTED_JWKS_ALGORITHMS.includes(algorithm)
    // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
    ),
    // I am filtering the collection here so only items that pass the nearby check continue to the next step.
    invalid: uniqueRequested.filter(
      // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
      (algorithm) => !SUPPORTED_JWKS_ALGORITHMS.includes(algorithm)
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    )
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  };
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// ──────────────────────────────────────────────────────────────────────────────
// Database display metadata
// ──────────────────────────────────────────────────────────────────────────────
function deriveDbParts(provider, env) {
  // Build non-secret connection metadata used only by the boot configuration summary.
  try {
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (provider === 'supabase-http') {
      // I am saving `url` here so the nearby steps can reuse the same value without rebuilding it each time.
      const url = new URL(env.SUPABASE_URL);
      // I am saving `host` here so the nearby steps can reuse the same value without rebuilding it each time.
      const host = url.host;
      // I am saving `port` here so the nearby steps can reuse the same value without rebuilding it each time.
      const port = url.port
        // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
        ? int(url.port, 443)
        // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
        : url.protocol === 'https:'
          // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
          ? 443
          // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
          : 80;
      // I am saving `name` here so the nearby steps can reuse the same value without rebuilding it each time.
      const name = host.split('.')[0] || 'supabase';

      // This return sends the completed value or response back to the code that called this function.
      return { host, port, name };
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (provider === 'postgres') {
      // I am saving `databaseUrl` here so the nearby steps can reuse the same value without rebuilding it each time.
      const databaseUrl = env.SUPABASE_DB_URL;

      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (databaseUrl) {
        // I am saving `url` here so the nearby steps can reuse the same value without rebuilding it each time.
        const url = new URL(databaseUrl);
        // I am saving `host` here so the nearby steps can reuse the same value without rebuilding it each time.
        const host = url.hostname;
        // I am saving `port` here so the nearby steps can reuse the same value without rebuilding it each time.
        const port = url.port ? int(url.port, 5432) : 5432;
        // I am saving `name` here so the nearby steps can reuse the same value without rebuilding it each time.
        const name =
          // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
          (url.pathname || '/').replace(/^\//, '') || 'postgres';

        // This return sends the completed value or response back to the code that called this function.
        return { host, port, name };
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // This return sends the completed value or response back to the code that called this function.
    return { host: 'unknown', port: 0, name: 'unknown' };
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch {
    // This return sends the completed value or response back to the code that called this function.
    return { host: 'unknown', port: 0, name: 'unknown' };
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// ──────────────────────────────────────────────────────────────────────────────
// Provider and typed values
// ──────────────────────────────────────────────────────────────────────────────
const DB_PROVIDER = (
  // Default to the HTTP client used by the repository unless deployment chooses Postgres.
  process.env.DB_PROVIDER || 'supabase-http'
// I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
).toLowerCase();

// I am saving `derivedDb` here so the nearby steps can reuse the same value without rebuilding it each time.
const derivedDb = deriveDbParts(DB_PROVIDER, process.env);

// I am saving `nodeEnv` here so the nearby steps can reuse the same value without rebuilding it each time.
const nodeEnv = process.env.NODE_ENV || 'development';
// I am saving `isDev` here so the nearby steps can reuse the same value without rebuilding it each time.
const isDev = nodeEnv === 'development';
// I am saving `isTest` here so the nearby steps can reuse the same value without rebuilding it each time.
const isTest = nodeEnv === 'test';

// I am saving `jwtAlgorithmConfig` here so the nearby steps can reuse the same value without rebuilding it each time.
const jwtAlgorithmConfig = parseJwtAlgorithms(
  // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
  process.env.JWT_ALLOWED_ALGS
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
);

// I am saving `turnstileSiteKey` here so the nearby steps can reuse the same value without rebuilding it each time.
const turnstileSiteKey = (
  // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
  process.env.TURNSTILE_SITE_KEY || ''
// I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
).trim();

// I am saving `turnstileSecretKey` here so the nearby steps can reuse the same value without rebuilding it each time.
const turnstileSecretKey = (
  // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
  process.env.TURNSTILE_SECRET_KEY || ''
// I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
).trim();

// I am saving `turnstileEnabled` here so the nearby steps can reuse the same value without rebuilding it each time.
const turnstileEnabled = Boolean(
  // A single missing key disables the pair; validateConfig catches required enforcement mismatches.
  turnstileSiteKey && turnstileSecretKey
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
);

// I am saving `rateLimitEnabled` here so the nearby steps can reuse the same value without rebuilding it each time.
const rateLimitEnabled = bool(
  // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
  process.env.RATE_LIMIT_ENABLED,
  // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
  true
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
);

// I am saving `localLimitersEnabled` here so the nearby steps can reuse the same value without rebuilding it each time.
const localLimitersEnabled = bool(
  // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
  process.env.LOCAL_LIMITERS_ENABLED,
  // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
  true
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
);

// I am saving `appLimitersEnabled` here so the nearby steps can reuse the same value without rebuilding it each time.
const appLimitersEnabled = bool(
  // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
  process.env.APP_LIMITERS_ENABLED,
  // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
  true
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
);

// I am saving `skipRateLimitInDev` here so the nearby steps can reuse the same value without rebuilding it each time.
const skipRateLimitInDev = bool(
  // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
  process.env.SKIP_RATE_LIMIT_IN_DEV,
  // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
  false
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
);

// I am saving `skipRateLimitInTest` here so the nearby steps can reuse the same value without rebuilding it each time.
const skipRateLimitInTest = bool(
  // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
  process.env.SKIP_RATE_LIMIT_IN_TEST,
  // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
  false
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
);

// I am saving `rateLimitActiveThisBoot` here so the nearby steps can reuse the same value without rebuilding it each time.
const rateLimitActiveThisBoot =
  // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
  rateLimitEnabled &&
  // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
  !(isDev && skipRateLimitInDev) &&
  // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
  !(isTest && skipRateLimitInTest);

// Ops / health posture
const DEFAULT_LOCAL_ALLOWLIST = [
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  '127.0.0.1',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  '::1',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  '192.168.65.1'
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
];

// I am saving `derivedOpsToken` here so the nearby steps can reuse the same value without rebuilding it each time.
const derivedOpsToken = (
  // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
  process.env.OPS_HEALTH_TOKEN || ''
// I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
).trim();

// I am saving `derivedOpsIps` here so the nearby steps can reuse the same value without rebuilding it each time.
const derivedOpsIps = csv(process.env.OPS_HEALTH_IPS);

// I am saving `effectiveAllowlist` here so the nearby steps can reuse the same value without rebuilding it each time.
const effectiveAllowlist = derivedOpsIps.length
  // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
  ? derivedOpsIps
  // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
  : DEFAULT_LOCAL_ALLOWLIST;

// I am saving `devPublicHealth` here so the nearby steps can reuse the same value without rebuilding it each time.
const devPublicHealth = isDev && !derivedOpsToken;

// I am saving `derivedPublicOrigin` here so the nearby steps can reuse the same value without rebuilding it each time.
const derivedPublicOrigin =
  // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
  process.env.PUBLIC_ORIGIN ||
  // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
  (isDev
    // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
    ? `http://localhost:${int(process.env.PORT, 3000)}`
    // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
    : '');

// ──────────────────────────────────────────────────────────────────────────────
// Stripe configuration
// ──────────────────────────────────────────────────────────────────────────────
const stripeLive = {
  // I am keeping the `secretKey` field in this object so the receiving code can read that value by its expected name.
  secretKey: (
    // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
    process.env.STRIPE_SECRET_KEY_LIVE || ''
  // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
  ).trim(),

  // I am keeping the `publishableKey` field in this object so the receiving code can read that value by its expected name.
  publishableKey: (
    // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
    process.env.STRIPE_PUBLISHABLE_KEY_LIVE || ''
  // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
  ).trim(),

  // I am keeping the `webhookSecret` field in this object so the receiving code can read that value by its expected name.
  webhookSecret: (
    // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
    process.env.STRIPE_WEBHOOK_SECRET_LIVE || ''
  // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
  ).trim(),

  // I am keeping the `priceResumeOneTime` field in this object so the receiving code can read that value by its expected name.
  priceResumeOneTime: (
    // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
    process.env.STRIPE_PRICE_RESUME_ONE_TIME_LIVE || ''
  // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
  ).trim(),

  // I am keeping the `priceResumeExpert` field in this object so the receiving code can read that value by its expected name.
  priceResumeExpert: (
    // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
    process.env.STRIPE_PRICE_RESUME_EXPERT_LIVE || ''
  // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
  ).trim()
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
};

// I am saving `stripeTest` here so the nearby steps can reuse the same value without rebuilding it each time.
const stripeTest = {
  // I am keeping the `secretKey` field in this object so the receiving code can read that value by its expected name.
  secretKey: (
    // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
    process.env.STRIPE_SECRET_KEY_TEST || ''
  // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
  ).trim(),

  // I am keeping the `publishableKey` field in this object so the receiving code can read that value by its expected name.
  publishableKey: (
    // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
    process.env.STRIPE_PUBLISHABLE_KEY_TEST || ''
  // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
  ).trim(),

  // I am keeping the `webhookSecret` field in this object so the receiving code can read that value by its expected name.
  webhookSecret: (
    // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
    process.env.STRIPE_WEBHOOK_SECRET_TEST || ''
  // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
  ).trim(),

  // I am keeping the `priceResumeOneTime` field in this object so the receiving code can read that value by its expected name.
  priceResumeOneTime: (
    // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
    process.env.STRIPE_PRICE_RESUME_ONE_TIME_TEST || ''
  // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
  ).trim(),

  // I am keeping the `priceResumeExpert` field in this object so the receiving code can read that value by its expected name.
  priceResumeExpert: (
    // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
    process.env.STRIPE_PRICE_RESUME_EXPERT_TEST || ''
  // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
  ).trim()
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
};

// ──────────────────────────────────────────────────────────────────────────────
// Storage configuration
// ──────────────────────────────────────────────────────────────────────────────
const storageConfig = {
  // I am keeping the `provider` field in this object so the receiving code can read that value by its expected name.
  provider: (
    // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
    process.env.STORAGE_PROVIDER || 'local'
  // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
  ).toLowerCase(),

  // I am keeping the `s3` field in this object so the receiving code can read that value by its expected name.
  s3: {
    // I am keeping the `bucket` field in this object so the receiving code can read that value by its expected name.
    bucket: (
      // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
      process.env.STORAGE_S3_BUCKET || ''
    // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
    ).trim(),

    // I am keeping the `region` field in this object so the receiving code can read that value by its expected name.
    region: (
      // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
      process.env.STORAGE_S3_REGION ||
      // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
      process.env.AWS_REGION ||
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      'us-west-2'
    // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
    ).trim(),

    // I am keeping the `basePath` field in this object so the receiving code can read that value by its expected name.
    basePath: (
      // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
      process.env.STORAGE_S3_BASE_PATH || 'binders'
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    )
      // I am continuing the existing call chain here so this option stays attached to the same operation started above.
      .replace(/^\/+/, '')
      // I am continuing the existing call chain here so this option stays attached to the same operation started above.
      .replace(/\/+$/, ''),

    // I am keeping the `publicBaseUrl` field in this object so the receiving code can read that value by its expected name.
    publicBaseUrl: (
      // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
      process.env.STORAGE_S3_PUBLIC_BASE_URL || ''
    // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
    ).trim()
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
};

// I am saving `stripeMode` here so the nearby steps can reuse the same value without rebuilding it each time.
const stripeMode =
  // Development uses test credentials; every other deployed environment selects live.
  nodeEnv === 'development' ? 'test' : 'live';

// I am saving `stripeActive` here so the nearby steps can reuse the same value without rebuilding it each time.
const stripeActive =
  // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
  stripeMode === 'live' ? stripeLive : stripeTest;

// I am saving `stripeApiVersion` here so the nearby steps can reuse the same value without rebuilding it each time.
const stripeApiVersion = (
  // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
  process.env.STRIPE_API_VERSION || ''
// I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
).trim() || undefined;

// ──────────────────────────────────────────────────────────────────────────────
// Typed configuration
// ──────────────────────────────────────────────────────────────────────────────
const config = {
  // Group typed values by their consuming module so callers do not read process.env directly.
  server: {
    // I am keeping the `port` field in this object so the receiving code can read that value by its expected name.
    port: int(process.env.PORT, 3000),
    // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
    nodeEnv,
    // I am keeping the `host` field in this object so the receiving code can read that value by its expected name.
    host: process.env.HOST || '0.0.0.0',
    // I am keeping the `trustProxy` field in this object so the receiving code can read that value by its expected name.
    trustProxy: true,
    // I am keeping the `trustProxyHops` field in this object so the receiving code can read that value by its expected name.
    trustProxyHops: int(
      // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
      process.env.TRUST_PROXY_HOPS,
      // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
      2
    // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
    ),
    // I am keeping the `canonicalHost` field in this object so the receiving code can read that value by its expected name.
    canonicalHost:
      // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
      process.env.CANONICAL_HOST || undefined,
    // I am keeping the `requestIdHeader` field in this object so the receiving code can read that value by its expected name.
    requestIdHeader: 'x-request-id'
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  },

  // I am keeping the `database` field in this object so the receiving code can read that value by its expected name.
  database: {
    // These fields are safe connection metadata; service credentials live in supabase below.
    provider: DB_PROVIDER,
    // I am keeping the `url` field in this object so the receiving code can read that value by its expected name.
    url:
      // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
      DB_PROVIDER === 'supabase-http'
        // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
        ? process.env.SUPABASE_URL
        // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
        : process.env.SUPABASE_DB_URL,
    // I am keeping the `host` field in this object so the receiving code can read that value by its expected name.
    host: derivedDb.host,
    // I am keeping the `port` field in this object so the receiving code can read that value by its expected name.
    port: derivedDb.port,
    // I am keeping the `name` field in this object so the receiving code can read that value by its expected name.
    name: derivedDb.name
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  },

  // Supabase Auth JWT verification.
  jwt: {
    // I am keeping the `jwksUrl` field in this object so the receiving code can read that value by its expected name.
    jwksUrl: (
      // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
      process.env.SUPABASE_JWKS_URL || ''
    // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
    ).trim(),

    // I am keeping the `issuer` field in this object so the receiving code can read that value by its expected name.
    issuer: (
      // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
      process.env.SUPABASE_ISSUER || ''
    // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
    ).trim(),

    // I am keeping the `expectedAud` field in this object so the receiving code can read that value by its expected name.
    expectedAud: (
      // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
      process.env.SUPABASE_EXPECTED_AUD ||
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      'authenticated'
    // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
    ).trim(),

    // I am keeping the `allowedAlgorithms` field in this object so the receiving code can read that value by its expected name.
    allowedAlgorithms: jwtAlgorithmConfig.allowed,

    // I am keeping the `clockSkewSec` field in this object so the receiving code can read that value by its expected name.
    clockSkewSec: int(
      // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
      process.env.JWT_CLOCK_SKEW_SEC,
      // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
      60
    // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
    ),

    // Retained for legacy code paths that may still verify HS256 tokens.
    // The JWKS verifier does not use this value.
    secret: (
      // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
      process.env.SUPABASE_JWT_SECRET || ''
    // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
    ).trim()
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  },

  // I am keeping the `security` field in this object so the receiving code can read that value by its expected name.
  security: {
    // coreMiddleware/security middleware consume these shared transport/browser policy values.
    sessionSecret: process.env.SESSION_SECRET,
    // I am keeping the `enforceHttps` field in this object so the receiving code can read that value by its expected name.
    enforceHttps: bool(
      // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
      process.env.ENFORCE_HTTPS,
      // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
      true
    // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
    ),
    // I am keeping the `hstsEnabled` field in this object so the receiving code can read that value by its expected name.
    hstsEnabled: true,
    // I am keeping the `cspNonce` field in this object so the receiving code can read that value by its expected name.
    cspNonce: true,
    // I am keeping the `referrerPolicy` field in this object so the receiving code can read that value by its expected name.
    referrerPolicy: 'no-referrer',
    // I am keeping the `allowedOrigins` field in this object so the receiving code can read that value by its expected name.
    allowedOrigins: csv(
      // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
      process.env.ALLOWED_ORIGINS
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    )
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  },

  // I am keeping the `csrf` field in this object so the receiving code can read that value by its expected name.
  csrf: {
    // I am keeping the `cookieName` field in this object so the receiving code can read that value by its expected name.
    cookieName:
      // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
      process.env.CSRF_COOKIE_NAME ||
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      'csrf_token',

    // I am keeping the `headerName` field in this object so the receiving code can read that value by its expected name.
    headerName: (
      // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
      process.env.CSRF_HEADER_NAME ||
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      'x-csrf-token'
    // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
    ).toLowerCase(),

    // I am keeping the `secret` field in this object so the receiving code can read that value by its expected name.
    secret: process.env.CSRF_SECRET
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  },

  // I am keeping the `redis` field in this object so the receiving code can read that value by its expected name.
  redis: {
    // I am keeping the `url` field in this object so the receiving code can read that value by its expected name.
    url: process.env.REDIS_URL,
    // I am keeping the `host` field in this object so the receiving code can read that value by its expected name.
    host:
      // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
      process.env.REDIS_HOST ||
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      'localhost',
    // I am keeping the `port` field in this object so the receiving code can read that value by its expected name.
    port: int(
      // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
      process.env.REDIS_PORT,
      // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
      6379
    // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
    ),
    // I am keeping the `password` field in this object so the receiving code can read that value by its expected name.
    password: process.env.REDIS_PASSWORD
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  },

  // I am keeping the `limits` field in this object so the receiving code can read that value by its expected name.
  limits: {
    // I am keeping the `textMaxLength` field in this object so the receiving code can read that value by its expected name.
    textMaxLength: int(
      // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
      process.env.TEXT_MAX_LENGTH,
      // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
      5000
    // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
    ),
    // I am keeping the `textMinLength` field in this object so the receiving code can read that value by its expected name.
    textMinLength: int(
      // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
      process.env.TEXT_MIN_LENGTH,
      // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
      20
    // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
    ),
    // I am keeping the `maxSubmissions` field in this object so the receiving code can read that value by its expected name.
    maxSubmissions: int(
      // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
      process.env.MAX_SUBMISSIONS,
      // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
      10
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    )
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  },

  // I am keeping the `maintenance` field in this object so the receiving code can read that value by its expected name.
  maintenance: {
    // maintenanceGuard reads this block for Redis state, bypass, retry, and allowed health paths.
    key:
      // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
      process.env.MAINTENANCE_KEY ||
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      'maintenance:mode',

    // This case marks the path for the matching value in the switch that started above.
    default:
      // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
      process.env.MAINTENANCE_DEFAULT ||
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      'off',

    // I am keeping the `allowlist` field in this object so the receiving code can read that value by its expected name.
    allowlist:
      // I am calling this helper here so the current workflow performs this step before it moves on.
      csv(process.env.MAINTENANCE_ALLOWLIST) ||
      // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
      ['127.0.0.1', '::1'],

    // I am keeping the `retryAfter` field in this object so the receiving code can read that value by its expected name.
    retryAfter: int(
      // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
      process.env.MAINTENANCE_RETRY_AFTER,
      // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
      120
    // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
    ),

    // I am keeping the `pagePath` field in this object so the receiving code can read that value by its expected name.
    pagePath:
      // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
      process.env.MAINTENANCE_PAGE ||
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      '/app/server/public/maintenance.html',

    // I am keeping the `message` field in this object so the receiving code can read that value by its expected name.
    message:
      // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
      process.env.MAINTENANCE_MESSAGE ||
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      'We will be back soon.',

    // I am keeping the `bypassToken` field in this object so the receiving code can read that value by its expected name.
    bypassToken:
      // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
      process.env.MAINTENANCE_BYPASS_TOKEN ||
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      '',

    // I am keeping the `allowedPaths` field in this object so the receiving code can read that value by its expected name.
    allowedPaths: [
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      '/health/liveness',
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      '/health/readiness',
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      '/health',
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      '/.well-known/acme-challenge/',
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      '/api/stripe/webhook',
      // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
      ...csv(
        // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
        process.env.MAINTENANCE_ALLOWED_PATHS
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      )
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    ]
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  },

  // I am keeping the `ops` field in this object so the receiving code can read that value by its expected name.
  ops: {
    // Health middleware accepts the derived token/IP allowlist under these known header names.
    token: derivedOpsToken,
    // I am keeping the `ips` field in this object so the receiving code can read that value by its expected name.
    ips: effectiveAllowlist,
    // I am keeping the `headerNames` field in this object so the receiving code can read that value by its expected name.
    headerNames: [
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      'X-Ops-Health-Token',
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      'X-Ops-Token',
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      'X-Health-Token'
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    ]
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  },

  // I am keeping the `health` field in this object so the receiving code can read that value by its expected name.
  health: {
    // I am keeping the `public` field in this object so the receiving code can read that value by its expected name.
    public: devPublicHealth,
    // I am keeping the `token` field in this object so the receiving code can read that value by its expected name.
    token: derivedOpsToken,
    // I am keeping the `allowlist` field in this object so the receiving code can read that value by its expected name.
    allowlist: effectiveAllowlist
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  },

  // I am keeping the `branding` field in this object so the receiving code can read that value by its expected name.
  branding: {
    // I am keeping the `appName` field in this object so the receiving code can read that value by its expected name.
    appName:
      // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
      process.env.APP_NAME ||
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      'Application',

    // I am keeping the `appDescription` field in this object so the receiving code can read that value by its expected name.
    appDescription:
      // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
      process.env.APP_DESCRIPTION ||
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      'A secure modern web application',

    // I am keeping the `appVersion` field in this object so the receiving code can read that value by its expected name.
    appVersion:
      // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
      process.env.APP_VERSION ||
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      '1.0.0',

    // I am keeping the `baseDomain` field in this object so the receiving code can read that value by its expected name.
    baseDomain:
      // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
      process.env.BASE_DOMAIN ||
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      '',

    // I am keeping the `appSubdomain` field in this object so the receiving code can read that value by its expected name.
    appSubdomain:
      // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
      process.env.APP_SUBDOMAIN ||
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      'app',

    // I am keeping the `legacyCookieDomain` field in this object so the receiving code can read that value by its expected name.
    legacyCookieDomain:
      // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
      process.env.LEGACY_COOKIE_DOMAIN ||
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      '',

    // I am keeping the `xClientInfo` field in this object so the receiving code can read that value by its expected name.
    xClientInfo:
      // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
      process.env.X_CLIENT_INFO ||
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      'app-server/1.0.0'
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  },

  // I am keeping the `supabase` field in this object so the receiving code can read that value by its expected name.
  supabase: {
    // I am keeping the `url` field in this object so the receiving code can read that value by its expected name.
    url: process.env.SUPABASE_URL,
    // I am keeping the `anonKey` field in this object so the receiving code can read that value by its expected name.
    anonKey:
      // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
      process.env.SUPABASE_ANON_KEY,
    // I am keeping the `serviceRoleKey` field in this object so the receiving code can read that value by its expected name.
    serviceRoleKey:
      // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
      process.env.SUPABASE_SERVICE_ROLE_KEY
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  },

  // I am keeping the `stripe` field in this object so the receiving code can read that value by its expected name.
  stripe: {
    // billingService selects active while stripeWebhook can still verify both live and test modes.
    mode: stripeMode,
    // I am keeping the `live` field in this object so the receiving code can read that value by its expected name.
    live: stripeLive,
    // I am keeping the `test` field in this object so the receiving code can read that value by its expected name.
    test: stripeTest,
    // I am keeping the `active` field in this object so the receiving code can read that value by its expected name.
    active: stripeActive,
    // I am keeping the `apiVersion` field in this object so the receiving code can read that value by its expected name.
    apiVersion: stripeApiVersion,

    // I am keeping the `successPath` field in this object so the receiving code can read that value by its expected name.
    successPath:
      // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
      process.env.STRIPE_SUCCESS_PATH ||
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      '/dashboard/purchase/confirmation',

    // I am keeping the `cancelPath` field in this object so the receiving code can read that value by its expected name.
    cancelPath:
      // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
      process.env.STRIPE_CANCEL_PATH ||
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      '/dashboard/billing'
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  },

  // I am keeping the `storage` field in this object so the receiving code can read that value by its expected name.
  storage: storageConfig,

  // Checkout redirect construction and password recovery both need one canonical public origin.
  publicOrigin: derivedPublicOrigin,

  // I am keeping the `auth` field in this object so the receiving code can read that value by its expected name.
  auth: {
    // authCookie adds the __Host- prefix where appropriate; config keeps the portable basename.
    cookieName: (
      // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
      process.env.AUTH_COOKIE_BASENAME ||
      // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
      process.env.AUTH_COOKIE_NAME ||
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      'sb_session'
    // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
    ).replace(/^__Host-/, ''),

    // I am keeping the `cookieAliases` field in this object so the receiving code can read that value by its expected name.
    cookieAliases: csv(
      // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
      process.env.AUTH_COOKIE_ALIASES
    // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
    ),

    // I am keeping the `cookieDomain` field in this object so the receiving code can read that value by its expected name.
    cookieDomain:
      // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
      process.env.AUTH_COOKIE_DOMAIN ||
      // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
      undefined,

    // I am keeping the `cookieSameSite` field in this object so the receiving code can read that value by its expected name.
    cookieSameSite:
      // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
      (
        // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
        process.env.COOKIE_SAMESITE ||
        // I am listing this entry here because the surrounding collection processes each allowed value in order.
        'Lax'
      // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
      ).toLowerCase() === 'strict'
        // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
        ? 'Strict'
        // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
        : 'Lax',

    // I am keeping the `cookieSecure` field in this object so the receiving code can read that value by its expected name.
    cookieSecure:
      // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
      process.env.COOKIE_SECURE
        // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
        ? process.env.COOKIE_SECURE === 'true'
        // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
        : undefined,

    // I am keeping the `allowLegacyLogin` field in this object so the receiving code can read that value by its expected name.
    allowLegacyLogin: bool(
      // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
      process.env.ALLOW_LEGACY_LOGIN,
      // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
      false
    // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
    ),

    // I am keeping the `debug` field in this object so the receiving code can read that value by its expected name.
    debug: bool(
      // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
      process.env.AUTH_DEBUG,
      // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
      false
    // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
    ),

    // I am keeping the `passwordResetRedirect` field in this object so the receiving code can read that value by its expected name.
    passwordResetRedirect:
      // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
      process.env.PASSWORD_RESET_REDIRECT_URL ||
      // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
      (derivedPublicOrigin
        // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
        ? `${derivedPublicOrigin}/auth/forgot-password`
        // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
        : '/auth/forgot-password'),

    // I am keeping the `sentinelMs` field in this object so the receiving code can read that value by its expected name.
    sentinelMs: int(
      // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
      process.env.AUTH_SENTINEL_MS,
      // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
      0
    // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
    ),

    // I am keeping the `freshLoginGraceSec` field in this object so the receiving code can read that value by its expected name.
    freshLoginGraceSec: int(
      // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
      process.env.AUTH_FRESH_GRACE_SEC,
      // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
      20
    // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
    ),

    // I am keeping the `setCookie` field in this object so the receiving code can read that value by its expected name.
    setCookie: {
      // These optional gates are evaluated inside the public /auth/set-cookie boundary.
      enforceLockout: bool(
        // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
        process.env.AUTH_SET_COOKIE_ENFORCE_LOCKOUT,
        // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
        nodeEnv === 'production'
      // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
      ),

      // I am keeping the `enforceTurnstile` field in this object so the receiving code can read that value by its expected name.
      enforceTurnstile: bool(
        // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
        process.env.AUTH_SET_COOKIE_ENFORCE_TURNSTILE,
        // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
        false
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      )
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  },

  // I am keeping the `opsHealth` field in this object so the receiving code can read that value by its expected name.
  opsHealth: {
    // I am keeping the `dbProbeTable` field in this object so the receiving code can read that value by its expected name.
    dbProbeTable:
      // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
      process.env.OPS_DB_PROBE_TABLE ||
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      'profiles',

    // I am keeping the `dbProbeRpc` field in this object so the receiving code can read that value by its expected name.
    dbProbeRpc:
      // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
      process.env.OPS_DB_PROBE_RPC ||
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      ''
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  },

  // I am keeping the `features` field in this object so the receiving code can read that value by its expected name.
  features: {
    // Receipt archiving remains opt-in so existing payment schemas do not change implicitly.
    archiveReceipts: bool(
      // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
      process.env.FEATURE_ARCHIVE_RECEIPTS,
      // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
      false
    // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
    ),

    // I am keeping the `archiveReceiptsTable` field in this object so the receiving code can read that value by its expected name.
    archiveReceiptsTable:
      // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
      process.env.FEATURE_ARCHIVE_RECEIPTS_TABLE ||
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      'receipt_archives'
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  },

  // I am keeping the `shutdown` field in this object so the receiving code can read that value by its expected name.
  shutdown: {
    // I am keeping the `graceMs` field in this object so the receiving code can read that value by its expected name.
    graceMs: int(
      // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
      process.env.SHUTDOWN_GRACE_MS,
      // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
      15000
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    )
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  },

  // I am keeping the `rateLimit` field in this object so the receiving code can read that value by its expected name.
  rateLimit: {
    // rateLimiter reads both global enablement and per-operation window/max values here.
    enabled: rateLimitEnabled,
    // I am keeping the `skipInDev` field in this object so the receiving code can read that value by its expected name.
    skipInDev: skipRateLimitInDev,
    // I am keeping the `skipInTest` field in this object so the receiving code can read that value by its expected name.
    skipInTest: skipRateLimitInTest,

    // I am keeping the `windows` field in this object so the receiving code can read that value by its expected name.
    windows: {
      // I am keeping the `general` field in this object so the receiving code can read that value by its expected name.
      general: {
        // I am keeping the `windowMs` field in this object so the receiving code can read that value by its expected name.
        windowMs: int(
          // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
          process.env.RATE_LIMIT_WINDOW_MS,
          // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
          60_000
        // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
        ),
        // I am keeping the `max` field in this object so the receiving code can read that value by its expected name.
        max: int(
          // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
          process.env.RATE_LIMIT_MAX,
          // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
          300
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        )
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      },

      // I am keeping the `login` field in this object so the receiving code can read that value by its expected name.
      login: {
        // I am keeping the `windowMs` field in this object so the receiving code can read that value by its expected name.
        windowMs: int(
          // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
          process.env.LOGIN_WINDOW_MS,
          // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
          15 * 60_000
        // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
        ),
        // I am keeping the `max` field in this object so the receiving code can read that value by its expected name.
        max: int(
          // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
          process.env.LOGIN_MAX,
          // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
          10
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        )
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      },

      // I am keeping the `signup` field in this object so the receiving code can read that value by its expected name.
      signup: {
        // I am keeping the `windowMs` field in this object so the receiving code can read that value by its expected name.
        windowMs: int(
          // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
          process.env.SIGNUP_WINDOW_MS,
          // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
          60 * 60_000
        // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
        ),
        // I am keeping the `max` field in this object so the receiving code can read that value by its expected name.
        max: int(
          // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
          process.env.SIGNUP_MAX,
          // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
          5
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        )
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      },

      // I am keeping the `logout` field in this object so the receiving code can read that value by its expected name.
      logout: {
        // I am keeping the `windowMs` field in this object so the receiving code can read that value by its expected name.
        windowMs: int(
          // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
          process.env.LOGOUT_WINDOW_MS,
          // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
          10 * 60_000
        // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
        ),
        // I am keeping the `max` field in this object so the receiving code can read that value by its expected name.
        max: int(
          // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
          process.env.LOGOUT_MAX,
          // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
          120
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        )
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      },

      // I am keeping the `cookieSet` field in this object so the receiving code can read that value by its expected name.
      cookieSet: {
        // I am keeping the `windowMs` field in this object so the receiving code can read that value by its expected name.
        windowMs: int(
          // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
          process.env.COOKIE_SET_WINDOW_MS,
          // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
          60_000
        // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
        ),
        // I am keeping the `max` field in this object so the receiving code can read that value by its expected name.
        max: int(
          // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
          process.env.COOKIE_SET_MAX,
          // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
          300
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        )
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    },

    // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
    ...(rateLimitActiveThisBoot
      // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
      ? {
          // I am keeping the `primary` field in this object so the receiving code can read that value by its expected name.
          primary: 'cloudflare',
          // I am keeping the `secondary` field in this object so the receiving code can read that value by its expected name.
          secondary:
            // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
            localLimitersEnabled &&
            // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
            appLimitersEnabled
              // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
              ? 'redis-origin'
              // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
              : undefined
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }
      // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
      : {})
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  },

  // I am keeping the `firewall` field in this object so the receiving code can read that value by its expected name.
  firewall: {
    // ipFirewall decides fail-closed behavior and merges this static deployment blocklist.
    failClosed: bool(
      // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
      process.env.FIREWALL_FAIL_CLOSED,
      // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
      true
    // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
    ),

    // I am keeping the `staticBlocklist` field in this object so the receiving code can read that value by its expected name.
    staticBlocklist: csv(
      // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
      process.env.IP_BLOCKLIST
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    )
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  },

  // I am keeping the `turnstile` field in this object so the receiving code can read that value by its expected name.
  turnstile: {
    // I am keeping the `enabled` field in this object so the receiving code can read that value by its expected name.
    enabled: turnstileEnabled,
    // I am keeping the `siteKey` field in this object so the receiving code can read that value by its expected name.
    siteKey: turnstileSiteKey,
    // I am keeping the `secretKey` field in this object so the receiving code can read that value by its expected name.
    secretKey: turnstileSecretKey
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  },

  // I am keeping the `logging` field in this object so the receiving code can read that value by its expected name.
  logging: {
    // I am keeping the `logLevel` field in this object so the receiving code can read that value by its expected name.
    logLevel: (
      // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
      process.env.LOG_LEVEL ||
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      'info'
    // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
    ).toLowerCase()
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
};

// ──────────────────────────────────────────────────────────────────────────────
// Alignment shims
// ──────────────────────────────────────────────────────────────────────────────
if (config.database?.provider === 'supabase-http') {
  // Fill historical aliases so older modules see the same values as the typed database block.
  const dbUrl =
    // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
    config.database.url ||
    // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
    process.env.SUPABASE_URL ||
    // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
    '';

  // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
  config.supabase =
    // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
    config.supabase || {};

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!config.supabase.url) {
    // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
    config.supabase.url = dbUrl;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!config.supabase.anonKey) {
    // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
    config.supabase.anonKey =
      // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
      process.env.SUPABASE_ANON_KEY || '';
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!config.supabase.serviceRoleKey) {
    // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
    config.supabase.serviceRoleKey =
      // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
      process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// This check helps me choose or stop the next path before any work that depends on this condition runs.
if (!('publicOrigin' in config) || !config.publicOrigin) {
  // Development can safely derive localhost; non-development remains empty for validation.
  config.publicOrigin =
    // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
    process.env.PUBLIC_ORIGIN ||
    // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
    (isDev
      // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
      ? `http://localhost:${int(
          // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
          process.env.PORT,
          // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
          3000
        // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
        )}`
      // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
      : '');
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// This check helps me choose or stop the next path before any work that depends on this condition runs.
if (typeof config.health?.public !== 'boolean') {
  // Retain compatibility if an older config assembly path produced a non-boolean value.
  const on = (value) =>
    // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
    ['1', 'true', 'yes', 'on', 'y'].includes(
      // I am calling this helper here so the current workflow performs this step before it moves on.
      String(value || '')
        // I am continuing the existing call chain here so this option stays attached to the same operation started above.
        .trim()
        // I am continuing the existing call chain here so this option stays attached to the same operation started above.
        .toLowerCase()
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    );

  // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
  config.health.public = on(
    // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
    process.env.HEALTH_PUBLIC
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  );
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// ──────────────────────────────────────────────────────────────────────────────
// Deep-freeze config
// ──────────────────────────────────────────────────────────────────────────────
(function deepFreeze(object) {
  // Freeze recursively so runtime modules cannot accidentally change shared deployment policy.
  Object.freeze(object);

  // I am calling this helper here so the current workflow performs this step before it moves on.
  Object.getOwnPropertyNames(object).forEach(
    // I am defining this small callback here so the surrounding API can run it with the value it supplies.
    (property) => {
      // I am saving `value` here so the nearby steps can reuse the same value without rebuilding it each time.
      const value = object[property];

      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (
        // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
        value &&
        // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
        typeof value === 'object' &&
        // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
        !Object.isFrozen(value)
      // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
      ) {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        deepFreeze(value);
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  );
// I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
})(config);

// ──────────────────────────────────────────────────────────────────────────────
// Validation
// ──────────────────────────────────────────────────────────────────────────────
function validateConfig() {
  // 1. Check unconditional environment requirements and provider-specific database settings.
  // 2. Validate auth URLs/algorithms plus optional Stripe, storage, and Turnstile combinations.
  // 3. Return every startup error together so deployment fixes do not require repeated boots.
  const errors = [];

  // I am saving `required` here so the nearby steps can reuse the same value without rebuilding it each time.
  const required = [
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    'PORT',
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    'NODE_ENV',
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    'HOST',
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    'TEXT_MIN_LENGTH',
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    'TEXT_MAX_LENGTH',
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    'MAX_SUBMISSIONS',
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    'SUPABASE_JWKS_URL',
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    'SUPABASE_ISSUER',
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    'SUPABASE_EXPECTED_AUD'
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  ];

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (DB_PROVIDER === 'supabase-http') {
    // Each provider has one distinct required connection value.
    if (!process.env.SUPABASE_URL) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      errors.push(
        // I am listing this entry here because the surrounding collection processes each allowed value in order.
        'SUPABASE_URL is required for DB_PROVIDER=supabase-http'
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      );
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // I am checking this next possibility only because the earlier condition did not choose its path.
  } else if (DB_PROVIDER === 'postgres') {
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!process.env.SUPABASE_DB_URL) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      errors.push(
        // I am listing this entry here because the surrounding collection processes each allowed value in order.
        'SUPABASE_DB_URL is required for DB_PROVIDER=postgres'
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      );
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // This alternative runs only when the condition above did not use its first path.
  } else {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    errors.push(
      // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
      `Unsupported DB_PROVIDER "${DB_PROVIDER}" ` +
        // I am listing this entry here because the surrounding collection processes each allowed value in order.
        '(use "supabase-http" or "postgres")'
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    );
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am repeating the next block one item at a time so every value in the existing collection receives the same handling.
  for (const variableName of required) {
    // Read raw presence here because typed defaults must not hide a missing required deployment key.
    if (!process.env[variableName]) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      errors.push(
        // I am listing this entry here because the surrounding collection processes each allowed value in order.
        `${variableName} environment variable is required`
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      );
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (jwtAlgorithmConfig.invalid.length) {
    // supabaseJwt can verify only the asymmetric JWKS algorithms accepted above.
    errors.push(
      // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
      'JWT_ALLOWED_ALGS contains unsupported algorithms: ' +
        // I am calling this helper here so the current workflow performs this step before it moves on.
        jwtAlgorithmConfig.invalid.join(', ') +
        // I am listing this entry here because the surrounding collection processes each allowed value in order.
        `. Supported values: ${SUPPORTED_JWKS_ALGORITHMS.join(', ')}`
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    );
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!config.jwt.allowedAlgorithms.length) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    errors.push(
      // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
      'JWT_ALLOWED_ALGS must contain at least one supported ' +
        // I am listing this entry here because the surrounding collection processes each allowed value in order.
        `algorithm: ${SUPPORTED_JWKS_ALGORITHMS.join(', ')}`
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    );
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (
    // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
    config.jwt.allowedAlgorithms.length &&
    // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
    !config.jwt.jwksUrl
  // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
  ) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    errors.push(
      // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
      'SUPABASE_JWKS_URL is required when JWT_ALLOWED_ALGS ' +
        // I am listing this entry here because the surrounding collection processes each allowed value in order.
        'contains RS256 or ES256'
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    );
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // Parse URLs during boot instead of letting the first authentication request fail later.
    if (config.jwt.jwksUrl) {
      // I am saving `jwksUrl` here so the nearby steps can reuse the same value without rebuilding it each time.
      const jwksUrl = new URL(config.jwt.jwksUrl);

      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (
        // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
        !['https:', 'http:'].includes(
          // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
          jwksUrl.protocol
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        )
      // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
      ) {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        errors.push(
          // I am listing this entry here because the surrounding collection processes each allowed value in order.
          'SUPABASE_JWKS_URL must use http or https'
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        );
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    errors.push(
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      'SUPABASE_JWKS_URL must be a valid URL'
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    );
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (config.jwt.issuer) {
      // I am saving `issuerUrl` here so the nearby steps can reuse the same value without rebuilding it each time.
      const issuerUrl = new URL(config.jwt.issuer);

      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (
        // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
        !['https:', 'http:'].includes(
          // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
          issuerUrl.protocol
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        )
      // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
      ) {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        errors.push(
          // I am listing this entry here because the surrounding collection processes each allowed value in order.
          'SUPABASE_ISSUER must use http or https'
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        );
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    errors.push(
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      'SUPABASE_ISSUER must be a valid URL'
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    );
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am saving `hasStripe` here so the nearby steps can reuse the same value without rebuilding it each time.
  const hasStripe =
    // Stripe secrets become required only when at least one active product price is configured.
    config.stripe &&
    // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
    config.stripe.active &&
    // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
    (
      // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
      config.stripe.active.priceResumeOneTime ||
      // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
      config.stripe.active.priceResumeExpert
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    );

  // I am saving `usingStripePrices` here so the nearby steps can reuse the same value without rebuilding it each time.
  const usingStripePrices = Boolean(hasStripe);

  // I am saving `isProd` here so the nearby steps can reuse the same value without rebuilding it each time.
  const isProd =
    // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
    (
      // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
      config.server.nodeEnv || ''
    // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
    ).toLowerCase() === 'production';

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (usingStripePrices && isProd) {
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!config.stripe.active.secretKey) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      errors.push(
        // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
        'STRIPE_SECRET_KEY_LIVE is required in production ' +
          // I am listing this entry here because the surrounding collection processes each allowed value in order.
          'when Stripe prices are configured'
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      );
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!config.stripe.live.webhookSecret) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      errors.push(
        // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
        'STRIPE_WEBHOOK_SECRET_LIVE is required in production ' +
          // I am listing this entry here because the surrounding collection processes each allowed value in order.
          'when Stripe prices are configured'
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      );
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!config.stripe.test.webhookSecret) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      errors.push(
        // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
        'STRIPE_WEBHOOK_SECRET_TEST should also be set for ' +
          // I am listing this entry here because the surrounding collection processes each allowed value in order.
          'test endpoint verification'
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      );
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (storageConfig.provider === 's3') {
    // storageProvider can construct its client only with a bucket and region.
    if (!storageConfig.s3.bucket) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      errors.push(
        // I am listing this entry here because the surrounding collection processes each allowed value in order.
        'STORAGE_S3_BUCKET is required when STORAGE_PROVIDER=s3'
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      );
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!storageConfig.s3.region) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      errors.push(
        // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
        'STORAGE_S3_REGION (or AWS_REGION) is required ' +
          // I am listing this entry here because the surrounding collection processes each allowed value in order.
          'when STORAGE_PROVIDER=s3'
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      );
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (usingStripePrices) {
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (
      // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
      !config.publicOrigin ||
      // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
      !config.publicOrigin.trim()
    // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
    ) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      errors.push(
        // I am listing this entry here because the surrounding collection processes each allowed value in order.
        'PUBLIC_ORIGIN is required when Stripe prices are configured'
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      );
    // This alternative runs only when the condition above did not use its first path.
    } else {
      // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
      try {
        // I am saving `testUrl` here so the nearby steps can reuse the same value without rebuilding it each time.
        const testUrl =
          // I am calling this helper here so the current workflow performs this step before it moves on.
          config.publicOrigin.replace(/\/+$/, '') +
          // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
          '/test';

        // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
        new URL(testUrl);
      // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
      } catch {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        errors.push(
          // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
          'PUBLIC_ORIGIN must be a valid URL. ' +
            // I am listing this entry here because the surrounding collection processes each allowed value in order.
            `Current value: "${config.publicOrigin}"`
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        );
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (
    // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
    config.server.port < 1 ||
    // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
    config.server.port > 65535
  // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
  ) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    errors.push(
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      'PORT must be between 1 and 65535'
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    );
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am saving `validEnvironments` here so the nearby steps can reuse the same value without rebuilding it each time.
  const validEnvironments = [
    // Keep deployment behavior predictable because several defaults branch on NODE_ENV.
    'development',
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    'production',
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    'test'
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  ];

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (
    // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
    !validEnvironments.includes(
      // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
      config.server.nodeEnv
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    )
  // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
  ) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    errors.push(
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      `NODE_ENV must be one of: ${validEnvironments.join(', ')}`
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    );
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (
    // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
    config.limits.textMaxLength <
    // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
    config.limits.textMinLength
  // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
  ) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    errors.push(
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      'TEXT_MAX_LENGTH must be greater than TEXT_MIN_LENGTH'
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    );
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (config.limits.textMinLength < 1) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    errors.push(
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      'TEXT_MIN_LENGTH must be at least 1'
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    );
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (config.limits.maxSubmissions < 1) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    errors.push(
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      'MAX_SUBMISSIONS must be at least 1'
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    );
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am saving `hasTurnstileSiteKey` here so the nearby steps can reuse the same value without rebuilding it each time.
  const hasTurnstileSiteKey =
    // I am calling this helper here so the current workflow performs this step before it moves on.
    Boolean(turnstileSiteKey);

  // I am saving `hasTurnstileSecretKey` here so the nearby steps can reuse the same value without rebuilding it each time.
  const hasTurnstileSecretKey =
    // I am calling this helper here so the current workflow performs this step before it moves on.
    Boolean(turnstileSecretKey);

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (
    // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
    hasTurnstileSiteKey !==
    // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
    hasTurnstileSecretKey
  // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
  ) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    errors.push(
      // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
      'TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY ' +
        // I am listing this entry here because the surrounding collection processes each allowed value in order.
        'must both be set or both be empty'
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    );
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am saving `enforceSetCookieTurnstile` here so the nearby steps can reuse the same value without rebuilding it each time.
  const enforceSetCookieTurnstile = bool(
    // An enforced cookie challenge cannot work with the otherwise optional key pair missing.
    process.env.AUTH_SET_COOKIE_ENFORCE_TURNSTILE,
    // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
    false
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  );

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (
    // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
    enforceSetCookieTurnstile &&
    // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
    !turnstileEnabled
  // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
  ) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    errors.push(
      // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
      'AUTH_SET_COOKIE_ENFORCE_TURNSTILE=true requires ' +
        // I am listing this entry here because the surrounding collection processes each allowed value in order.
        'TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY'
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    );
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // This return sends the completed value or response back to the code that called this function.
  return errors;
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am saving `validationErrors` here so the nearby steps can reuse the same value without rebuilding it each time.
const validationErrors = validateConfig();

// This check helps me choose or stop the next path before any work that depends on this condition runs.
if (validationErrors.length > 0) {
  // Fail before Express starts listening so the process never serves with partial security config.
  console.error(
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    'Configuration validation failed:'
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  );

  // I am defining this small callback here so the surrounding API can run it with the value it supplies.
  validationErrors.forEach((error) =>
    // I am calling this helper here so the current workflow performs this step before it moves on.
    console.error(`  - ${error}`)
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  );

  // I am saving `isTestEnvironment` here so the nearby steps can reuse the same value without rebuilding it each time.
  const isTestEnvironment =
    // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
    process.env.NODE_ENV === 'test';

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (isTestEnvironment) {
    // I am stopping this path with the existing error here because the caller should not continue with an invalid result.
    throw new Error(
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      `Configuration validation failed: ${validationErrors.join('; ')}`
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    );
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am calling this helper here so the current workflow performs this step before it moves on.
  process.exit(1);
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// ──────────────────────────────────────────────────────────────────────────────
// Boot summary
// ──────────────────────────────────────────────────────────────────────────────
function logConfigSummary() {
  // Prefer the shared formatted logger, then fall back to a short secret-free console summary.
  try {
    // I am loading this module into `consoleLogger` so this file can reuse that dependency below.
    const consoleLogger = require(
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      '../utils/consoleLogger'
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    );

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (
      // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
      consoleLogger &&
      // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
      typeof consoleLogger.formatConfigSummary ===
        // I am listing this entry here because the surrounding collection processes each allowed value in order.
        'function'
    // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
    ) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      consoleLogger.formatConfigSummary(config);
      // This return sends the completed value or response back to the code that called this function.
      return;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch {
    // Fall through to plain console summary.
  }

  // I am saving `dbSummary` here so the nearby steps can reuse the same value without rebuilding it each time.
  const dbSummary = config.database?.name
    // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
    ? `${config.database.host}:${config.database.port}/${config.database.name}`
    // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
    : 'unknown';

  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log('\nCONFIGURATION LOADED');
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(
    // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
    `   Server: ${config.server?.host}:${config.server?.port} ` +
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      `(${config.server?.nodeEnv})`
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  );
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    `   Database: ${dbSummary}`
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  );
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(
    // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
    '   Auth: Stateless ' +
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      `(Supabase JWT + JWKS; algorithms: ${config.jwt.allowedAlgorithms.join(', ')})`
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  );
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(
    // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
    '   Rate Limiting: handled at Cloudflare edge (PRIMARY) ' +
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      '+ Redis app limiters (SECONDARY)'
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  );
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(
    // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
    `   Text Limits: ${config.limits?.textMinLength || 'unknown'}-` +
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      `${config.limits?.textMaxLength || 'unknown'} chars`
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  );
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    `   Max Submissions: ${config.limits?.maxSubmissions || 'unknown'}`
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  );
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// ──────────────────────────────────────────────────────────────────────────────
// Asset version
// ──────────────────────────────────────────────────────────────────────────────
const rawAssetVersion = (
  // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
  process.env.ASSET_VERSION || ''
// I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
).trim();

// I am saving `rawImageTag` here so the nearby steps can reuse the same value without rebuilding it each time.
const rawImageTag = (
  // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
  process.env.IMAGE_TAG || ''
// I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
).trim();

// I am saving `ASSET_VERSION` here so the nearby steps can reuse the same value without rebuilding it each time.
const ASSET_VERSION =
  // Deployment-provided versions stay stable; local fallback changes with each process start.
  rawAssetVersion ||
  // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
  rawImageTag ||
  // I am calling this helper here so the current workflow performs this step before it moves on.
  String(Date.now());

// I am exporting this value here so another module can deliberately reuse the completed piece from index.js.
module.exports = {
  // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
  config,
  // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
  validateConfig,
  // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
  logConfigSummary,
  // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
  ASSET_VERSION
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
};