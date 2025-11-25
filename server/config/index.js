// File: server/config/index.js
// Description: Centralized configuration management with validation
// Notes: Loads env once, derives a typed config object, validates it, and exposes a pretty boot summary.
// Security: Never logs secrets. Keep this module free of logger.js to avoid circular requires.

'use strict';

const path = require('path');

// ──────────────────────────────────────────────────────────────────────────────
// Env file loading (dotenv)
// ──────────────────────────────────────────────────────────────────────────────
// Goal:
//   - In development: read .env.development.local at repo root
//   - In production (EC2/SSS/Docker): read .env.production.full at repo root
//   - Never read the legacy .env file anymore.
//
// Note:
//   - Values already present in process.env (from Docker / systemd / shell)
//     always win; dotenv only fills in missing keys.
const NODE_ENV = process.env.NODE_ENV || 'development';
const ROOT_DIR = path.join(__dirname, '..', '..'); // repo root

if (NODE_ENV === 'development') {
  const devEnvPath = path.join(ROOT_DIR, '.env.development.local');
  require('dotenv').config({ path: devEnvPath });
  console.log(`[config] Loaded development env from ${devEnvPath}`);
} else if (NODE_ENV === 'production') {
  const prodEnvPath = path.join(ROOT_DIR, '.env.production.full');
  require('dotenv').config({ path: prodEnvPath });
  console.log(`[config] Loaded production env from ${prodEnvPath}`);
} else {
  // For test/other NODE_ENV values we rely entirely on the existing process.env.
  console.log(`[config] NODE_ENV=${NODE_ENV} – no dotenv file loaded (process.env only).`);
}

// Note: consoleLogger is loaded lazily in logConfigSummary() to avoid circular requires

// ──────────────────────────────────────────────────────────────────────────────
// Env audit (optional, off by default)
// ──────────────────────────────────────────────────────────────────────────────

const KNOWN_ENV = new Set([
  'ALLOWED_ORIGINS','APP_DESCRIPTION','APP_LIMITERS_ENABLED','APP_NAME','APP_VERSION',
  'AUTH_COOKIE_NAME','AUTH_COOKIE_ALIASES','AUTH_COOKIE_BASENAME','AUTH_COOKIE_DOMAIN','AUTH_DEBUG','BASE_DOMAIN','APP_SUBDOMAIN','LEGACY_COOKIE_DOMAIN','X_CLIENT_INFO',
  'COOKIE_SAMESITE','COOKIE_SECURE','COOKIE_SET_ATTEMPTS','COOKIE_SET_MAX','COOKIE_SET_WINDOW_MS',
  'COOKIE_SET_WINDOW_SEC','CORS_ORIGINS','CSRF_COOKIE_NAME','CSRF_HEADER_NAME','CSRF_SECRET','DB_PROVIDER',
  'ENFORCE_HTTPS','HOST','IMAGE_TAG','IP_BLOCKLIST','JWT_CLOCK_SKEW_SEC','JWT_ALLOWED_ALGS','LOCAL_LIMITERS_ENABLED','LOGIN_ATTEMPTS',
  'LOGIN_MAX','LOGIN_WINDOW_MS','LOGIN_WINDOW_MIN','LOGOUT_MAX','LOGOUT_WINDOW_MS','MAX_SUBMISSIONS','NODE_ENV','PORT','PUBLIC_ORIGIN',
  'RATE_LIMIT_ENABLED','RATE_LIMIT_MAX','RATE_LIMIT_WINDOW_MS','REDIS_HOST','REDIS_PASSWORD','REDIS_PORT','REDIS_URL','REPAIR_QUEUE_CONCURRENCY',
  'REPAIR_QUEUE_ENABLED','REPAIR_QUEUE_NAME','SELF_HOST_SUPABASE_JS','SESSION_SECRET','SIGNUP_ATTEMPTS',
  'SIGNUP_MAX','SIGNUP_WINDOW_MS','SIGNUP_WINDOW_MIN','SUPABASE_ANON_KEY','SUPABASE_DB_URL',
  'SUPABASE_EXPECTED_AUD','SUPABASE_ISSUER','SUPABASE_JWKS_URL','SUPABASE_JWT_SECRET',
  'SUPABASE_SERVICE_ROLE_KEY','SUPABASE_URL','TEXT_MAX_LENGTH','TEXT_MIN_LENGTH','MAINTENANCE_DEFAULT',
  'MAINTENANCE_ALLOWLIST','MAINTENANCE_RETRY_AFTER','MAINTENANCE_PAGE','MAINTENANCE_MESSAGE',
  'MAINTENANCE_KEY','MAINTENANCE_BYPASS_TOKEN','MAINTENANCE_ALLOWED_PATHS','OPS_HEALTH_TOKEN','OPS_HEALTH_IPS','OPS_DB_PROBE_TABLE','OPS_DB_PROBE_RPC','HEALTH_PUBLIC',
  'FIREWALL_FAIL_CLOSED',
  'TURNSTILE_SITE_KEY','TURNSTILE_SECRET_KEY',
  // Shared success/cancel paths
  'STRIPE_SUCCESS_PATH','STRIPE_CANCEL_PATH',
  // Dual-set Stripe (LIVE/TEST)
  'STRIPE_SECRET_KEY_LIVE','STRIPE_PUBLISHABLE_KEY_LIVE','STRIPE_WEBHOOK_SECRET_LIVE',
  'STRIPE_SECRET_KEY_TEST','STRIPE_PUBLISHABLE_KEY_TEST','STRIPE_WEBHOOK_SECRET_TEST',
  'STRIPE_PRICE_RESUME_ONE_TIME_LIVE','STRIPE_PRICE_RESUME_EXPERT_LIVE',
  'STRIPE_PRICE_RESUME_ONE_TIME_TEST','STRIPE_PRICE_RESUME_EXPERT_TEST',
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
function deriveDbParts(provider, env) {
  try {
    if (provider === 'supabase-http') {
      const u = new URL(env.SUPABASE_URL);
      const host = u.host;
      const port = u.port ? int(u.port, 443) : (u.protocol === 'https:' ? 443 : 80);
      const name = (host.split('.')[0] || 'supabase');
      return { host, port, name };
    }

    // provider === 'postgres'
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
// Typed configuration object
// ──────────────────────────────────────────────────────────────────────────────
const nodeEnv = (process.env.NODE_ENV || 'development');
const isDev = nodeEnv === 'development';
const isTest = nodeEnv === 'test';
const turnstileSiteKey = (process.env.TURNSTILE_SITE_KEY || '').trim();
const turnstileSecretKey = (process.env.TURNSTILE_SECRET_KEY || '').trim();
const turnstileEnabled = Boolean(turnstileSiteKey && turnstileSecretKey);

const rateLimitEnabled        = bool(process.env.RATE_LIMIT_ENABLED, true);
const localLimitersEnabled    = bool(process.env.LOCAL_LIMITERS_ENABLED, true);
const appLimitersEnabled      = bool(process.env.APP_LIMITERS_ENABLED, true);
const skipRateLimitInDev      = bool(process.env.SKIP_RATE_LIMIT_IN_DEV, false);
const skipRateLimitInTest     = bool(process.env.SKIP_RATE_LIMIT_IN_TEST, false);
const rateLimitActiveThisBoot = rateLimitEnabled && !(isDev && skipRateLimitInDev) && !(isTest && skipRateLimitInTest);

// Ops / health posture
const DEFAULT_LOCAL_ALLOWLIST = ['127.0.0.1', '::1', '192.168.65.1']; // Docker Desktop host
const derivedOpsToken = (process.env.OPS_HEALTH_TOKEN || '').trim();
const derivedOpsIps = csv(process.env.OPS_HEALTH_IPS);
const effectiveAllowlist = derivedOpsIps.length ? derivedOpsIps : DEFAULT_LOCAL_ALLOWLIST;
const devPublicHealth = isDev && !derivedOpsToken; // public only in dev when no token is set

const derivedPublicOrigin = process.env.PUBLIC_ORIGIN || (isDev ? `http://localhost:${int(process.env.PORT, 3000)}` : '');

// ──────────────────────────────────────────────────────────────────────────────
// Stripe configuration (dual-set) — active mode is derived from NODE_ENV
// ──────────────────────────────────────────────────────────────────────────────
const stripeLive = {
  secretKey:          (process.env.STRIPE_SECRET_KEY_LIVE || '').trim(),
  publishableKey:     (process.env.STRIPE_PUBLISHABLE_KEY_LIVE || '').trim(),
  webhookSecret:      (process.env.STRIPE_WEBHOOK_SECRET_LIVE || '').trim(),
  priceResumeOneTime: (process.env.STRIPE_PRICE_RESUME_ONE_TIME_LIVE || '').trim(),
  priceResumeExpert:  (process.env.STRIPE_PRICE_RESUME_EXPERT_LIVE || '').trim()
};

const stripeTest = {
  secretKey:          (process.env.STRIPE_SECRET_KEY_TEST || '').trim(),
  publishableKey:     (process.env.STRIPE_PUBLISHABLE_KEY_TEST || '').trim(),
  webhookSecret:      (process.env.STRIPE_WEBHOOK_SECRET_TEST || '').trim(),
  priceResumeOneTime: (process.env.STRIPE_PRICE_RESUME_ONE_TIME_TEST || '').trim(),
  priceResumeExpert:  (process.env.STRIPE_PRICE_RESUME_EXPERT_TEST || '').trim()
};

// Clean, intuitive logic:
// - development  → test mode (test keys + STRIPE_WEBHOOK_SECRET_TEST; pairs with `stripe listen`)
// - production   → live mode (live keys + STRIPE_WEBHOOK_SECRET_LIVE; Stripe hits detechify.com directly)
const stripeMode = (nodeEnv === 'development') ? 'test' : 'live';
const stripeActive = stripeMode === 'live' ? stripeLive : stripeTest;

// ──────────────────────────────────────────────────────────────────────────────

const config = {
  // Server
  server: {
    port: int(process.env.PORT, 3000),
    nodeEnv,
    host: process.env.HOST || '0.0.0.0',
    trustProxy: true,                  // we're behind a proxy in prod
    trustProxyHops: int(process.env.TRUST_PROXY_HOPS, 2),
    canonicalHost: process.env.CANONICAL_HOST || undefined,
    requestIdHeader: 'x-request-id'
  },

  // Database
  database: {
    provider: DB_PROVIDER,             // 'supabase-http' | 'postgres'
    url: DB_PROVIDER === 'supabase-http'
      ? process.env.SUPABASE_URL
      : process.env.SUPABASE_DB_URL,
    host: derivedDb.host,
    port: derivedDb.port,
    name: derivedDb.name
  },

  // Auth / JWT verification
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

  // CSRF protection
  csrf: {
    cookieName: process.env.CSRF_COOKIE_NAME || 'csrf_token',
    headerName: (process.env.CSRF_HEADER_NAME || 'x-csrf-token').toLowerCase(),
    secret: process.env.CSRF_SECRET
  },

  // Redis
  redis: {
    url: process.env.REDIS_URL,
    host: process.env.REDIS_HOST || 'localhost',
    port: int(process.env.REDIS_PORT, 6379),
    password: process.env.REDIS_PASSWORD
  },

  // User input limits
  limits: {
    textMaxLength: int(process.env.TEXT_MAX_LENGTH, 5000),
    textMinLength: int(process.env.TEXT_MIN_LENGTH, 20),
    maxSubmissions: int(process.env.MAX_SUBMISSIONS, 10)
  },

  // Maintenance mode
  maintenance: {
    key: process.env.MAINTENANCE_KEY || 'maintenance:mode',
    default: process.env.MAINTENANCE_DEFAULT || 'off',
    allowlist: csv(process.env.MAINTENANCE_ALLOWLIST) || ['127.0.0.1', '::1'],
    retryAfter: int(process.env.MAINTENANCE_RETRY_AFTER, 120),
    pagePath: process.env.MAINTENANCE_PAGE || '/app/server/public/maintenance.html',
    message: process.env.MAINTENANCE_MESSAGE || 'We will be back soon.',
    bypassToken: process.env.MAINTENANCE_BYPASS_TOKEN || '',
    allowedPaths: [
      '/health/liveness',
      '/health/readiness',
      '/health',
      '/.well-known/acme-challenge/',
      '/api/stripe/webhook',
      ...csv(process.env.MAINTENANCE_ALLOWED_PATHS)
    ]
  },

  // Ops access to private health endpoints
  ops: {
    token: derivedOpsToken,
    ips: effectiveAllowlist,
    headerNames: ['X-Ops-Health-Token','X-Ops-Token','X-Health-Token']
  },
  health: {
    public: devPublicHealth,
    token: derivedOpsToken,
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

  // Supabase client keys (for client-side init only)
  supabase: {
    url: process.env.SUPABASE_URL,
    anonKey: process.env.SUPABASE_ANON_KEY,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY
  },

  // Stripe configuration
  stripe: {
    mode: stripeMode, // 'live' | 'test', derived from NODE_ENV
    live: stripeLive,
    test: stripeTest,
    active: stripeActive
  },

  // Public origin (for redirects and client-side URLs)
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

  // Rate-limit posture
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
      // Note: signup config kept for backward compatibility with env vars
      // Internal code uses 'register' but env vars remain SIGNUP_* for compatibility
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
  },

  // Turnstile challenge configuration
  turnstile: {
    enabled: turnstileEnabled,
    siteKey: turnstileSiteKey,
    secretKey: turnstileSecretKey
  }
};

// ──────────────────────────────────────────────────────────────────────────────
// Alignment shims
// ──────────────────────────────────────────────────────────────────────────────
if (config.database?.provider === 'supabase-http') {
  const dbUrl = config.database.url || process.env.SUPABASE_URL || '';
  config.supabase = config.supabase || {};
  if (!config.supabase.url)            config.supabase.url = dbUrl;
  if (!config.supabase.anonKey)        config.supabase.anonKey = process.env.SUPABASE_ANON_KEY || '';
  if (!config.supabase.serviceRoleKey) config.supabase.serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
}

// publicOrigin always present
if (!('publicOrigin' in config) || !config.publicOrigin) {
  config.publicOrigin = process.env.PUBLIC_ORIGIN || (isDev ? `http://localhost:${int(process.env.PORT, 3000)}` : '');
}

// Optional HEALTH_PUBLIC -> config.health.public
if (typeof config.health?.public !== 'boolean') {
  const on = (v) => ['1','true','yes','on','y'].includes(String(v||'').trim().toLowerCase());
  config.health.public = on(process.env.HEALTH_PUBLIC);
}

// Deep-freeze config
(function deepFreeze(o) {
  Object.freeze(o);
  Object.getOwnPropertyNames(o).forEach((p) => {
    const v = o[p];
    if (v && typeof v === 'object' && !Object.isFrozen(v)) deepFreeze(v);
  });
})(config);

// ──────────────────────────────────────────────────────────────────────────────
// Validation (provider-aware, fast-fail)
// ──────────────────────────────────────────────────────────────────────────────
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

  // Only consider Stripe validation when prices are configured
  const hasStripe =
    config.stripe &&
    config.stripe.active &&
    (config.stripe.active.priceResumeOneTime || config.stripe.active.priceResumeExpert);

  const usingStripePrices = !!hasStripe;
  const isProd = (config.server.nodeEnv || '').toLowerCase() === 'production';

  if (usingStripePrices && isProd) {
    if (!config.stripe.active.secretKey) {
      errors.push('STRIPE_SECRET_KEY_LIVE is required in production when Stripe prices are configured');
    }
    if (!config.stripe.live.webhookSecret) {
      errors.push('STRIPE_WEBHOOK_SECRET_LIVE (or legacy STRIPE_WEBHOOK_SECRET) is required in production when Stripe prices are configured');
    }
    if (!config.stripe.test.webhookSecret) {
      errors.push('STRIPE_WEBHOOK_SECRET_TEST should also be set for test endpoint verification');
    }
  }

  // Validate publicOrigin when Stripe is configured
  if (usingStripePrices) {
    if (!config.publicOrigin || !config.publicOrigin.trim()) {
      errors.push('PUBLIC_ORIGIN is required when Stripe prices are configured (needed for checkout redirect URLs)');
    } else {
      try {
        const testUrl = config.publicOrigin.replace(/\/+$/, '') + '/test';
        new URL(testUrl);
      } catch (urlError) {
        errors.push(`PUBLIC_ORIGIN must be a valid URL (e.g., http://localhost:3000 or https://example.com). Current value: "${config.publicOrigin}"`);
      }
    }
  }

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

  const hasTurnstileSiteKey = !!turnstileSiteKey;
  const hasTurnstileSecretKey = !!turnstileSecretKey;
  if (hasTurnstileSiteKey !== hasTurnstileSecretKey) {
    errors.push('TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY must both be set or both be empty');
  }

  return errors;
}

// Run validation immediately
const validationErrors = validateConfig();
if (validationErrors.length > 0) {
  console.error('Configuration validation failed:');
  validationErrors.forEach((error) => console.error(`  - ${error}`));
  const isTestEnv = process.env.NODE_ENV === 'test';
  if (isTestEnv) {
    throw new Error(`Configuration validation failed: ${validationErrors.join('; ')}`);
  } else {
    process.exit(1);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Boot summary
// ──────────────────────────────────────────────────────────────────────────────
function logConfigSummary() {
  try {
    const consoleLogger = require('../utils/consoleLogger');
    if (consoleLogger && typeof consoleLogger.formatConfigSummary === 'function') {
      consoleLogger.formatConfigSummary(config);
      return;
    }
  } catch {
    // ignore and fall back
  }

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
const rawAssetVersion = (process.env.ASSET_VERSION || '').trim();
const rawImageTag = (process.env.IMAGE_TAG || '').trim();
const ASSET_VERSION = rawAssetVersion || rawImageTag || String(Date.now());

// ──────────────────────────────────────────────────────────────────────────────
module.exports = {
  config,
  validateConfig,
  logConfigSummary,
  ASSET_VERSION
};