// File: server/config/index.js
// Description: Centralized configuration management with validation
// Notes: Loads env once, derives a typed config object, validates it, and exposes a pretty boot summary.
// Security: Never logs secrets. Keep this module free of logger.js to avoid circular requires.

'use strict';

/**
 * WHAT:
 * A single source of truth for runtime configuration.
 *
 * WHY:
 * Scattered `process.env.*` reads lead to brittle logic, noisy logs, and boot surprises.
 * A typed, validated config + one boot summary keeps the server predictable.
 *
 * HOW:
 * - Load .env early (dev/compose). On prod, systemd/container env takes precedence.
 * - Parse primitives (int/bool/csv) with safe defaults.
 * - Derive DB “pretty” fields for stable logs.
 * - Validate required keys per provider and fail fast on bad boots.
 * - Print a compact, human-readable boot summary (via consoleLogger).
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') }); // load early
// Note: consoleLogger is loaded lazily in logConfigSummary() to avoid circular dependencies

// ──────────────────────────────────────────────────────────────────────────────
// Env audit (optional, off by default)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * WHAT:
 * Optional guardrail that warns when unknown app env keys are present.
 *
 * WHY:
 * Drift between .env and the codebase causes “it worked on my machine” bugs.
 * This audit helps you spot leftover or misspelled env vars.
 *
 * HOW:
 * Keep KNOWN_ENV aligned to your real .env files. Only warn if explicitly enabled.
 * (No auto-enable in dev to avoid noise.)
 */
const KNOWN_ENV = new Set([
  'ALLOWED_ORIGINS','APP_DESCRIPTION','APP_LIMITERS_ENABLED','APP_NAME','APP_VERSION',
  'AUTH_COOKIE_NAME','AUTH_COOKIE_ALIASES','AUTH_COOKIE_BASENAME','AUTH_COOKIE_DOMAIN','AUTH_DEBUG','BASE_DOMAIN','APP_SUBDOMAIN','LEGACY_COOKIE_DOMAIN','X_CLIENT_INFO',
  'COOKIE_SAMESITE','COOKIE_SECURE','COOKIE_SET_ATTEMPTS','COOKIE_SET_MAX','COOKIE_SET_WINDOW_MS',
  'COOKIE_SET_WINDOW_SEC','CORS_ORIGINS','CSRF_COOKIE_NAME','CSRF_HEADER_NAME','CSRF_SECRET','DB_PROVIDER',
  'ENFORCE_HTTPS','HOST','IMAGE_TAG','IP_BLOCKLIST','JWT_CLOCK_SKEW_SEC','JWT_ALLOWED_ALGS','LOCAL_LIMITERS_ENABLED','LOGIN_ATTEMPTS',
  'LOGIN_MAX','LOGIN_WINDOW_MS','LOGIN_WINDOW_MIN','LOGOUT_MAX','LOGOUT_WINDOW_MS','MAX_SUBMISSIONS','NODE_ENV','PORT','PUBLIC_ORIGIN',
  'RATE_LIMIT_ENABLED','RATE_LIMIT_MAX','RATE_LIMIT_WINDOW_MS','REDIS_HOST','REDIS_PASSWORD','REDIS_PORT','REDIS_URL','REPAIR_QUEUE_CONCURRENCY',
  'REPAIR_QUEUE_ENABLED','REPAIR_QUEUE_NAME','SELF_HOST_SUPABASE_JS','SESSION_SECRET','SIGNUP_ATTEMPTS',
  'SIGNUP_MAX','SIGNUP_WINDOW_MS','SIGNUP_WINDOW_MIN','SKIP_RATE_LIMIT_IN_DEV','SKIP_RATE_LIMIT_IN_TEST','SUPABASE_ANON_KEY','SUPABASE_DB_URL',
  'SUPABASE_EXPECTED_AUD','SUPABASE_ISSUER','SUPABASE_JWKS_URL','SUPABASE_JWT_SECRET',
  'SUPABASE_SERVICE_ROLE_KEY','SUPABASE_URL','TEXT_MAX_LENGTH','TEXT_MIN_LENGTH','MAINTENANCE_DEFAULT',
  'MAINTENANCE_ALLOWLIST','MAINTENANCE_RETRY_AFTER','MAINTENANCE_PAGE','MAINTENANCE_MESSAGE',
  'MAINTENANCE_KEY','MAINTENANCE_BYPASS_TOKEN','OPS_HEALTH_TOKEN','OPS_HEALTH_IPS','OPS_DB_PROBE_TABLE','OPS_DB_PROBE_RPC','HEALTH_PUBLIC',
  'FIREWALL_FAIL_CLOSED','STRIPE_SECRET_KEY','STRIPE_PUBLISHABLE_KEY','STRIPE_WEBHOOK_SECRET',
  'STRIPE_PRICE_RESUME_ONE_TIME','STRIPE_PRICE_RESUME_EXPERT','STRIPE_SUCCESS_PATH','STRIPE_CANCEL_PATH',
  'FEATURE_ARCHIVE_RECEIPTS','FEATURE_ARCHIVE_RECEIPTS_TABLE','NGINX_USE_SSL','SHUTDOWN_GRACE_MS',
  'TRUST_PROXY_HOPS','CANONICAL_HOST','ALLOW_LEGACY_LOGIN','ASSET_VERSION',
  // audit toggle
  'CONFIG_ENV_AUDIT'
]);

const APP_PREFIXES = [
  'ALLOWED_','APP_','AUTH_','BASE_','COOKIE_','CORS_','CSRF_','DB_',
  'ENFORCE_','FEATURE_','FIREWALL_','IMAGE_','JWT_','LEGACY_','LOGIN_','LOGOUT_',
  'MAINTENANCE_','NGINX_','OPS_','PUBLIC_','RATE_','REDIS_','REPAIR_',
  'SELF_HOST_','SESSION_','SHUTDOWN_','SIGNUP_','SKIP_','STRIPE_','SUPABASE_','TEXT_','X_'
];

function warnUnknownEnv() {
  const knownSize = KNOWN_ENV.size;
  if (!knownSize) console.warn('[config] KNOWN_ENV is empty inside the container');

  const isAppKey = (k) =>
    k === 'NODE_ENV' || k === 'PORT' || APP_PREFIXES.some((p) => k.startsWith(p));

  const unknown = Object.keys(process.env)
    .filter((k) => /^[A-Z0-9_]+$/.test(k))
    .filter(isAppKey)
    .filter((k) => !KNOWN_ENV.has(k));

  if (unknown.length) {
    console.warn(`[config] Unknown app env keys present (ignored): ${unknown.sort().join(', ')}`);
  }
}

// Turn audit on only when you explicitly opt in.
const ENABLE_ENV_AUDIT = process.env.CONFIG_ENV_AUDIT === '1';
if (ENABLE_ENV_AUDIT) warnUnknownEnv();

// ──────────────────────────────────────────────────────────────────────────────
// Helpers: small and predictable
// ──────────────────────────────────────────────────────────────────────────────
function int(v, def) {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
}
function bool(v, def = false) {
  if (v === undefined || v === null) return def;
  const s = String(v).trim().toLowerCase();
  if (['1','true','yes','on','y'].includes(s)) return true;
  if (['0','false','no','off','n'].includes(s)) return false;
  return def;
}
function csv(v) {
  return v ? String(v).split(',').map((s) => s.trim()).filter(Boolean) : [];
}

// ──────────────────────────────────────────────────────────────────────────────
/**
 * WHAT:
 * Derive DB host/port/name so boot logs are always sane.
 *
 * WHY:
 * When envs are half-set, we still want a clear, non-crashing “Database:” line.
 *
 * HOW:
 * - For Supabase HTTP: parse SUPABASE_URL and pull the project ref as “name”.
 * - For Postgres: parse SUPABASE_DB_URL. If missing, use safe “unknown” fallbacks.
 */
function deriveDbParts(provider, env) {
  try {
    if (provider === 'supabase-http') {
      const u = new URL(env.SUPABASE_URL);
      const host = u.host;
      const port = u.port ? int(u.port, 443) : (u.protocol === 'https:' ? 443 : 80);
      const name = (host.split('.')[0] || 'supabase');
      return { host, port, name };
    }

    // provider === 'postgres' (supported via SUPABASE_DB_URL)
    const url = env.SUPABASE_DB_URL;
    if (url) {
      const u = new URL(url);
      const host = u.hostname;
      const port = u.port ? int(u.port, 5432) : 5432;
      const name = (u.pathname || '/').replace(/^\//, '') || 'postgres';
      return { host, port, name };
    }

    return { host: 'unknown', port: 0, name: 'unknown' };
  } catch {
    return { host: 'unknown', port: 0, name: 'unknown' };
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Provider selection and DB pretty parts (computed once, no races)
// ──────────────────────────────────────────────────────────────────────────────
const DB_PROVIDER = (process.env.DB_PROVIDER || 'supabase-http').toLowerCase();
const derivedDb = deriveDbParts(DB_PROVIDER, process.env);

// ──────────────────────────────────────────────────────────────────────────────
/**
 * WHAT:
 * Typed configuration object (non-secret values only).
 *
 * WHY:
 * Centralized, typed config avoids “undefined/NaN” cascades and accidental PII logs.
 *
 * HOW:
 * Read from env once, cast to primitives, and export. Modules import from here
 * instead of reading process.env directly. Secrets stay in env; we don’t echo them.
 */
const isDev = (process.env.NODE_ENV || 'development') === 'development';
const isTest = (process.env.NODE_ENV || 'development') === 'test';

const rateLimitEnabled        = bool(process.env.RATE_LIMIT_ENABLED, true);
const localLimitersEnabled    = bool(process.env.LOCAL_LIMITERS_ENABLED, true);
const appLimitersEnabled      = bool(process.env.APP_LIMITERS_ENABLED, true);
const skipRateLimitInDev      = bool(process.env.SKIP_RATE_LIMIT_IN_DEV, false);
const skipRateLimitInTest     = bool(process.env.SKIP_RATE_LIMIT_IN_TEST, false);
const rateLimitActiveThisBoot = rateLimitEnabled && !(isDev && skipRateLimitInDev) && !(isTest && skipRateLimitInTest);

// Derive ops/health posture once so routes are simple and predictable.
const DEFAULT_LOCAL_ALLOWLIST = ['127.0.0.1', '::1', '192.168.65.1']; // Docker Desktop host
const derivedOpsToken = (process.env.OPS_HEALTH_TOKEN || '').trim();
const derivedOpsIps = csv(process.env.OPS_HEALTH_IPS);
const effectiveAllowlist = derivedOpsIps.length ? derivedOpsIps : DEFAULT_LOCAL_ALLOWLIST;
const devPublicHealth = isDev && !derivedOpsToken; // public only in dev when no token is set

const derivedPublicOrigin = process.env.PUBLIC_ORIGIN || (isDev ? `http://localhost:${int(process.env.PORT, 3000)}` : '');

const config = {
  // Server
  server: {
    port: int(process.env.PORT, 3000),
    nodeEnv: process.env.NODE_ENV || 'development',
    host: process.env.HOST || '0.0.0.0',
    trustProxy: true,                  // we're behind a proxy in prod
    trustProxyHops: int(process.env.TRUST_PROXY_HOPS, 2),
    canonicalHost: process.env.CANONICAL_HOST || undefined,
    requestIdHeader: 'x-request-id'
  },

  // Database (Supabase HTTP by default; Postgres if you switch provider)
  database: {
    provider: DB_PROVIDER,             // 'supabase-http' | 'postgres'
    url: DB_PROVIDER === 'supabase-http'
      ? process.env.SUPABASE_URL
      : process.env.SUPABASE_DB_URL,
    host: derivedDb.host,
    port: derivedDb.port,
    name: derivedDb.name
  },

  // Auth / JWT verification (RS256 via Supabase, HS256 fallback)
  jwt: {
    jwksUrl: process.env.SUPABASE_JWKS_URL,
    issuer: process.env.SUPABASE_ISSUER,
    expectedAud: process.env.SUPABASE_EXPECTED_AUD,
    clockSkewSec: int(process.env.JWT_CLOCK_SKEW_SEC, 30),
    secret: process.env.SUPABASE_JWT_SECRET
  },

  // Security (non-PII)
  security: {
    sessionSecret: process.env.SESSION_SECRET,
    enforceHttps: bool(process.env.ENFORCE_HTTPS, true),
    hstsEnabled: true,
    cspNonce: true,
    referrerPolicy: 'no-referrer',
    allowedOrigins: csv(process.env.ALLOWED_ORIGINS)
  },

  // CSRF protection configuration
  csrf: {
    cookieName: process.env.CSRF_COOKIE_NAME || 'csrf_token',
    headerName: (process.env.CSRF_HEADER_NAME || 'x-csrf-token').toLowerCase(),
    secret: process.env.CSRF_SECRET
  },

  // Redis (sessions, lockouts, banlists, secondary rate-limiters)
  redis: {
    // Only these are read by redisClient.js via config.redis
    url: process.env.REDIS_URL,
    host: process.env.REDIS_HOST || 'localhost',
    port: int(process.env.REDIS_PORT, 6379),
    password: process.env.REDIS_PASSWORD
  },

  // User input limits (defense-in-depth)
  limits: {
    textMaxLength: int(process.env.TEXT_MAX_LENGTH, 5000),
    textMinLength: int(process.env.TEXT_MIN_LENGTH, 20),
    maxSubmissions: int(process.env.MAX_SUBMISSIONS, 10)
  },

  // Maintenance mode (kept in sync with middleware)
  maintenance: {
    key: process.env.MAINTENANCE_KEY || 'maintenance:mode',
    default: process.env.MAINTENANCE_DEFAULT || 'off',
    allowlist: csv(process.env.MAINTENANCE_ALLOWLIST) || ['127.0.0.1', '::1'],
    retryAfter: int(process.env.MAINTENANCE_RETRY_AFTER, 120),
    pagePath: process.env.MAINTENANCE_PAGE || '/app/server/public/maintenance.html',
    message: process.env.MAINTENANCE_MESSAGE || 'We will be back soon.',
    bypassToken: process.env.MAINTENANCE_BYPASS_TOKEN || ''
  },

  // Ops access to private health endpoints
  ops: {
    token: derivedOpsToken,
    ips: effectiveAllowlist,
    // optional: expose canonical header names so routes can accept any of these
    headerNames: ['X-Ops-Health-Token','X-Ops-Token','X-Health-Token']
  },
  health: {
    public: devPublicHealth,                 // public only in dev if no token is set
    token: derivedOpsToken,                  // same token as ops
    allowlist: effectiveAllowlist
  },

  // Branding
  branding: {
    appName: process.env.APP_NAME || 'Application',
    appDescription: process.env.APP_DESCRIPTION || 'A secure modern web application',
    appVersion: process.env.APP_VERSION || '1.0.0',
    baseDomain: process.env.BASE_DOMAIN || '',
    appSubdomain: process.env.APP_SUBDOMAIN || 'app',
    legacyCookieDomain: process.env.LEGACY_COOKIE_DOMAIN || '',
    xClientInfo: process.env.X_CLIENT_INFO || 'app-server/1.0.0'
  },

  // Supabase client keys (for client-side initialization only; secrets stay in env)
  supabase: {
    url: process.env.SUPABASE_URL,
    anonKey: process.env.SUPABASE_ANON_KEY,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY
  },

  // Stripe configuration
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    priceResumeOneTime: process.env.STRIPE_PRICE_RESUME_ONE_TIME || '',
    priceResumeExpert: process.env.STRIPE_PRICE_RESUME_EXPERT || '',
    successPath: process.env.STRIPE_SUCCESS_PATH || '/dashboard/purchase/confirmation',
    cancelPath: process.env.STRIPE_CANCEL_PATH || '/dashboard/billing'
  },

  // Public origin (for redirects and client-side URLs)
  // Default to localhost in development if not set (required for Stripe checkout URLs)
  publicOrigin: derivedPublicOrigin,

  // Auth cookie configuration
  auth: {
    cookieName: (process.env.AUTH_COOKIE_BASENAME || process.env.AUTH_COOKIE_NAME || 'sb_session').replace(/^__Host-/, ''),
    cookieAliases: csv(process.env.AUTH_COOKIE_ALIASES),
    cookieDomain: process.env.AUTH_COOKIE_DOMAIN || undefined,
    cookieSameSite: (process.env.COOKIE_SAMESITE || 'Lax').toLowerCase() === 'strict' ? 'Strict' : 'Lax',
    cookieSecure: process.env.COOKIE_SECURE ? (process.env.COOKIE_SECURE === 'true') : undefined,
    allowLegacyLogin: bool(process.env.ALLOW_LEGACY_LOGIN, false),
    debug: bool(process.env.AUTH_DEBUG, false),
    passwordResetRedirect: process.env.PASSWORD_RESET_REDIRECT_URL ||
      (derivedPublicOrigin ? `${derivedPublicOrigin}/auth/forgot-password` : '/auth/forgot-password')
  },

  // Ops health DB probe configuration
  opsHealth: {
    dbProbeTable: process.env.OPS_DB_PROBE_TABLE || 'profiles',
    dbProbeRpc: process.env.OPS_DB_PROBE_RPC || ''
  },

  // Feature flags
  features: {
    archiveReceipts: bool(process.env.FEATURE_ARCHIVE_RECEIPTS, false),
    archiveReceiptsTable: process.env.FEATURE_ARCHIVE_RECEIPTS_TABLE || 'receipt_archives'
  },

  // Graceful shutdown
  shutdown: {
    graceMs: int(process.env.SHUTDOWN_GRACE_MS, 15000)
  },

  // Rate-limit posture (used by boot summary; business logic can also read this)
  rateLimit: {
    enabled: rateLimitEnabled,
    skipInDev: skipRateLimitInDev,
    skipInTest: skipRateLimitInTest,
    windows: {
      general: {
        windowMs: int(process.env.RATE_LIMIT_WINDOW_MS, 60_000),
        max: int(process.env.RATE_LIMIT_MAX, 300)
      },
      login: {
        windowMs: int(process.env.LOGIN_WINDOW_MS, 15 * 60_000),
        max: int(process.env.LOGIN_MAX, 10)
      },
      signup: {
        windowMs: int(process.env.SIGNUP_WINDOW_MS, 60 * 60_000),
        max: int(process.env.SIGNUP_MAX, 5)
      },
      logout: {
        windowMs: int(process.env.LOGOUT_WINDOW_MS, 10 * 60_000),
        max: int(process.env.LOGOUT_MAX, 120)
      },
      cookieSet: {
        windowMs: int(process.env.COOKIE_SET_WINDOW_MS, 60_000),
        max: int(process.env.COOKIE_SET_MAX, 300)
      }
    },
    ...(rateLimitActiveThisBoot ? {
      primary: 'cloudflare',
      secondary: (localLimitersEnabled && appLimitersEnabled) ? 'redis-origin' : undefined
    } : {})
  },

  // Firewall configuration
  firewall: {
    failClosed: bool(process.env.FIREWALL_FAIL_CLOSED, true),
    staticBlocklist: csv(process.env.IP_BLOCKLIST)
  }
};

// ──────────────────────────────────────────────────────────────────────────────
// Alignment shims: ensure single source of truth (idempotent, safe to re-run)
// ──────────────────────────────────────────────────────────────────────────────
/**
 * WHAT:
 * Align config.supabase and config.database for supabase-http provider.
 * Ensure publicOrigin and health.public are always present.
 *
 * WHY:
 * When DB_PROVIDER === 'supabase-http', database.url and supabase.url should
 * be the same value. This shim ensures consistency.
 *
 * HOW:
 * - If provider is supabase-http, mirror database.url to supabase.url if missing
 * - Ensure publicOrigin exists as a string
 * - Map HEALTH_PUBLIC env to config.health.public if not already set
 */
// Supabase <-> Database alignment (provider aware)
if (config.database?.provider === 'supabase-http') {
  const dbUrl = config.database.url || process.env.SUPABASE_URL || '';
  config.supabase = config.supabase || {};
  if (!config.supabase.url)            config.supabase.url = dbUrl;
  if (!config.supabase.anonKey)        config.supabase.anonKey = process.env.SUPABASE_ANON_KEY || '';
  if (!config.supabase.serviceRoleKey) config.supabase.serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
}

// publicOrigin always present (string)
// Default to localhost in development if not set (required for Stripe checkout URLs)
if (!('publicOrigin' in config) || !config.publicOrigin) {
  config.publicOrigin = process.env.PUBLIC_ORIGIN || (isDev ? `http://localhost:${int(process.env.PORT, 3000)}` : '');
}

// Optional HEALTH_PUBLIC -> config.health.public
if (typeof config.health?.public !== 'boolean') {
  const on = (v) => ['1','true','yes','on','y'].includes(String(v||'').trim().toLowerCase());
  config.health.public = on(process.env.HEALTH_PUBLIC);
}

// Optional: freeze to prevent accidental runtime mutation (shallow + nested)
(function deepFreeze(o) {
  Object.freeze(o);
  Object.getOwnPropertyNames(o).forEach((p) => {
    const v = o[p];
    if (v && typeof v === 'object' && !Object.isFrozen(v)) deepFreeze(v);
  });
})(config);

// ──────────────────────────────────────────────────────────────────────────────
// Validation (provider-aware, fast-fail on fatal misconfig)
// ──────────────────────────────────────────────────────────────────────────────
/**
 * WHAT:
 * Validate required env and basic numeric ranges.
 *
 * WHY:
 * Failing fast at boot is better than mysterious 500s later.
 *
 * HOW:
 * - Common required set (ports, lengths, Supabase JWT verification inputs).
 * - Provider-specific connection requirements.
 */
function validateConfig() {
  const errors = [];

  const required = [
    'PORT', 'NODE_ENV', 'HOST',
    'TEXT_MIN_LENGTH', 'TEXT_MAX_LENGTH', 'MAX_SUBMISSIONS',
    'SUPABASE_JWKS_URL', 'SUPABASE_ISSUER', 'SUPABASE_EXPECTED_AUD'
  ];

  if (DB_PROVIDER === 'supabase-http') {
    if (!process.env.SUPABASE_URL) {
      errors.push('SUPABASE_URL is required for DB_PROVIDER=supabase-http');
    }
  } else if (DB_PROVIDER === 'postgres') {
    if (!process.env.SUPABASE_DB_URL) {
      errors.push('SUPABASE_DB_URL is required for DB_PROVIDER=postgres');
    }
  } else {
    errors.push(`Unsupported DB_PROVIDER "${DB_PROVIDER}" (use "supabase-http" or "postgres")`);
  }

  for (const varName of required) {
    if (!process.env[varName]) errors.push(`${varName} environment variable is required`);
  }

  // Conditional Stripe validation (only in production when prices are configured)
  const usingStripePrices = !!(config.stripe.priceResumeOneTime || config.stripe.priceResumeExpert);
  const isProd = (config.server.nodeEnv || '').toLowerCase() === 'production';
  if (usingStripePrices && isProd) {
    if (!config.stripe.secretKey) {
      errors.push('STRIPE_SECRET_KEY is required in production when Stripe prices are configured');
    }
    if (!config.stripe.webhookSecret) {
      errors.push('STRIPE_WEBHOOK_SECRET is required in production when Stripe prices are configured');
    }
  }
  
  // Validate publicOrigin when Stripe is configured (required for checkout URLs)
  if (usingStripePrices) {
    if (!config.publicOrigin || !config.publicOrigin.trim()) {
      errors.push('PUBLIC_ORIGIN is required when Stripe prices are configured (needed for checkout redirect URLs)');
    } else {
      // Validate it's a valid URL format
      try {
        const testUrl = config.publicOrigin.replace(/\/+$/, '') + '/test';
        new URL(testUrl);
      } catch (urlError) {
        errors.push(`PUBLIC_ORIGIN must be a valid URL (e.g., http://localhost:3000 or https://example.com). Current value: "${config.publicOrigin}"`);
      }
    }
  }

  // opsHealth probe selectors remain optional by design (no validation needed)

  if (config.server.port < 1 || config.server.port > 65535) {
    errors.push('PORT must be between 1 and 65535');
  }
  const validEnvs = ['development', 'production', 'test'];
  if (!validEnvs.includes(config.server.nodeEnv)) {
    errors.push(`NODE_ENV must be one of: ${validEnvs.join(', ')}`);
  }

  if (config.limits.textMaxLength < config.limits.textMinLength) {
    errors.push('TEXT_MAX_LENGTH must be greater than TEXT_MIN_LENGTH');
  }
  if (config.limits.textMinLength < 1) {
    errors.push('TEXT_MIN_LENGTH must be at least 1');
  }
  if (config.limits.maxSubmissions < 1) {
    errors.push('MAX_SUBMISSIONS must be at least 1');
  }

  return errors;
}

// Run validation immediately on load to fail fast in bad boots
const validationErrors = validateConfig();
if (validationErrors.length > 0) {
  console.error('Configuration validation failed:');
  validationErrors.forEach((error) => console.error(`  - ${error}`));
  const isTest = process.env.NODE_ENV === 'test';
  if (isTest) {
    throw new Error(`Configuration validation failed: ${validationErrors.join('; ')}`);
  } else {
    process.exit(1);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Pretty boot summary (kept small and stable; no secrets)
// ──────────────────────────────────────────────────────────────────────────────
/**
 * WHAT:
 * Print concise, stable boot info once per start.
 *
 * WHY:
 * Operators need a quick read on posture without digging through code.
 *
 * HOW:
 * Lazy-load consoleLogger to avoid circular dependencies, with fallback for safety.
 */
function logConfigSummary() {
  try {
    // Lazy require to avoid circular dependency issues
    const consoleLogger = require('../utils/consoleLogger');
    if (consoleLogger && typeof consoleLogger.formatConfigSummary === 'function') {
      consoleLogger.formatConfigSummary(config);
      return;
    }
  } catch (err) {
    // Fall through to simple summary if consoleLogger fails to load
  }
  
  // Fallback: simple console summary so we never crash
  const dbSummary = config.database?.name 
    ? `${config.database.host}:${config.database.port}/${config.database.name}`
    : 'unknown';
  console.log('\nCONFIGURATION LOADED');
  console.log(`   Server: ${config.server?.host}:${config.server?.port} (${config.server?.nodeEnv})`);
  console.log(`   Database: ${dbSummary}`);
  console.log(`   Auth: Stateless (Supabase RS256 + JWKS)`);
  console.log(`   Rate Limiting: handled at Cloudflare edge (PRIMARY) + Redis app limiters (SECONDARY)`);
  console.log(`   Text Limits: ${config.limits?.textMinLength || 'unknown'}-${config.limits?.textMaxLength || 'unknown'} chars`);
  console.log(`   Max Submissions: ${config.limits?.maxSubmissions || 'unknown'}`);
}

// ──────────────────────────────────────────────────────────────────────────────
// Static asset cache-buster
// ──────────────────────────────────────────────────────────────────────────────
/**
 * WHAT:
 * Cache-busting version for static assets (JS/CSS).
 *
 * WHY:
 * Browsers cache aggressively; this forces a fresh fetch post-deploy.
 *
 * HOW:
 * - If ASSET_VERSION is set in env, use it (for CI/advanced control).
 * - Else if IMAGE_TAG exists (from Docker/CI), use that.
 * - Else fall back to a timestamp at boot.
 *
 * NOTE:
 * APP_VERSION is kept for UI/branding only; it no longer affects asset URLs.
 */
const rawAssetVersion = (process.env.ASSET_VERSION || '').trim();
const rawImageTag = (process.env.IMAGE_TAG || '').trim();

const ASSET_VERSION = rawAssetVersion || rawImageTag || String(Date.now());

// ──────────────────────────────────────────────────────────────────────────────
// Exports
// ──────────────────────────────────────────────────────────────────────────────
module.exports = {
  config,
  validateConfig,
  logConfigSummary,
  ASSET_VERSION
};