// Description: Centralized configuration management with validation
// Notes: Loads env once, derives a typed config object, validates it, and exposes a pretty boot summary.
// Security: Never logs secrets. Keep this module free of logger.js to avoid circular requires.

'use strict';

const path = require('path');

// Env file loading (dotenv)
// Goal:
//   - In development: read .env.development.local at repo root
//   - In production (EC2/SSM/Docker): read .env.production.full at repo root
//   - Never read the legacy .env file anymore.
//
// Note:
//   - Values already present in process.env (from Docker / systemd / shell)
//     always win; dotenv only fills in missing keys.
const NODE_ENV = process.env.NODE_ENV || 'development';
const ROOT_DIR = path.join(__dirname, '..', '..');

if (NODE_ENV === 'development') {
  // Local development reads the checked-out developer file without overriding shell values.
  const devEnvPath = path.join(ROOT_DIR, '.env.development.local');
  require('dotenv').config({ path: devEnvPath });
  console.log(`[config] Loaded development env from ${devEnvPath}`);
} else if (NODE_ENV === 'production') {
  // Production uses the explicit full environment file expected by the deployment scripts.
  const prodEnvPath = path.join(ROOT_DIR, '.env.production.full');
  require('dotenv').config({ path: prodEnvPath });
  console.log(`[config] Loaded production env from ${prodEnvPath}`);
} else {
  console.log(
    `[config] NODE_ENV=${NODE_ENV} – no dotenv file loaded (process.env only).`
  );
}

// consoleLogger is loaded lazily in logConfigSummary() to avoid circular requires.

// Env audit (optional, off by default)
const KNOWN_ENV = new Set([
  // This declarative list feeds only the optional typo/unknown-key audit below.
  'ALLOWED_ORIGINS',
  'ALLOW_LEGACY_LOGIN',
  'APP_DESCRIPTION',
  'APP_LIMITERS_ENABLED',
  'APP_NAME',
  'APP_SUBDOMAIN',
  'APP_VERSION',
  'ASSET_VERSION',
  'AUTH_COOKIE_ALIASES',
  'AUTH_COOKIE_BASENAME',
  'AUTH_COOKIE_DOMAIN',
  'AUTH_COOKIE_NAME',
  'AUTH_DEBUG',
  'AUTH_FRESH_GRACE_SEC',
  'AUTH_ROLE_LEGACY_APP_METADATA_ROLE',
  'AUTH_ROLE_LEGACY_TOP_LEVEL_USER_ROLE',
  'AUTH_ROLE_SUPER_USER_AS_ADMIN',
  'AUTH_SENTINEL_MS',
  'AUTH_SET_COOKIE_ENFORCE_LOCKOUT',
  'AUTH_SET_COOKIE_ENFORCE_TURNSTILE',
  'AWS_REGION',
  'BASE_DOMAIN',
  'CANONICAL_HOST',
  'CONFIG_ENV_AUDIT',
  'COOKIE_SAMESITE',
  'COOKIE_SECURE',
  'COOKIE_SET_MAX',
  'COOKIE_SET_WINDOW_MS',
  'COOKIE_SET_WINDOW_SEC',
  'CORS_ORIGINS',
  'CSRF_COOKIE_NAME',
  'CSRF_HEADER_NAME',
  'CSRF_SECRET',
  'DB_PROVIDER',
  'ENFORCE_HTTPS',
  'FEATURE_ARCHIVE_RECEIPTS',
  'FEATURE_ARCHIVE_RECEIPTS_TABLE',
  'FIREWALL_FAIL_CLOSED',
  'HEALTH_PUBLIC',
  'HOST',
  'IMAGE_TAG',
  'IP_BLOCKLIST',
  'JWT_ALLOWED_ALGS',
  'JWT_CLOCK_SKEW_SEC',
  'LOCAL_LIMITERS_ENABLED',
  'LOG_LEVEL',
  'LOGIN_ATTEMPTS',
  'LOGIN_MAX',
  'LOGIN_WINDOW_MIN',
  'LOGIN_WINDOW_MS',
  'LOGOUT_MAX',
  'LOGOUT_WINDOW_MS',
  'MAINTENANCE_ALLOWLIST',
  'MAINTENANCE_ALLOWED_PATHS',
  'MAINTENANCE_BYPASS_TOKEN',
  'MAINTENANCE_DEFAULT',
  'MAINTENANCE_KEY',
  'MAINTENANCE_MESSAGE',
  'MAINTENANCE_PAGE',
  'MAINTENANCE_RETRY_AFTER',
  'MAX_SUBMISSIONS',

  // Infra: nginx proxy toggle.
  'NGINX_USE_SSL',

  'NODE_ENV',
  'OPS_DB_PROBE_RPC',
  'OPS_DB_PROBE_TABLE',
  'OPS_HEALTH_IPS',
  'OPS_HEALTH_TOKEN',
  'PASSWORD_RESET_REDIRECT_URL',
  'PORT',
  'PUBLIC_ORIGIN',
  'RATE_LIMIT_ENABLED',
  'RATE_LIMIT_MAX',
  'RATE_LIMIT_WINDOW_MS',
  'REDIS_HOST',
  'REDIS_PASSWORD',
  'REDIS_PORT',
  'REDIS_URL',
  'SELF_HOST_SUPABASE_JS',
  'SESSION_SECRET',
  'SHUTDOWN_GRACE_MS',
  'SIGNUP_ATTEMPTS',
  'SIGNUP_MAX',
  'SIGNUP_WINDOW_MIN',
  'SIGNUP_WINDOW_MS',
  'SKIP_RATE_LIMIT_IN_DEV',
  'SKIP_RATE_LIMIT_IN_TEST',
  'STORAGE_PROVIDER',
  'STORAGE_S3_BASE_PATH',
  'STORAGE_S3_BUCKET',
  'STORAGE_S3_PUBLIC_BASE_URL',
  'STORAGE_S3_REGION',
  'STRIPE_API_VERSION',
  'STRIPE_CANCEL_PATH',
  'STRIPE_PRICE_RESUME_EXPERT_LIVE',
  'STRIPE_PRICE_RESUME_EXPERT_TEST',
  'STRIPE_PRICE_RESUME_ONE_TIME_LIVE',
  'STRIPE_PRICE_RESUME_ONE_TIME_TEST',
  'STRIPE_PUBLISHABLE_KEY_LIVE',
  'STRIPE_PUBLISHABLE_KEY_TEST',
  'STRIPE_SECRET_KEY_LIVE',
  'STRIPE_SECRET_KEY_TEST',
  'STRIPE_SUCCESS_PATH',
  'STRIPE_WEBHOOK_SECRET_LIVE',
  'STRIPE_WEBHOOK_SECRET_TEST',
  'SUPABASE_ANON_KEY',
  'SUPABASE_DB_URL',
  'SUPABASE_EXPECTED_AUD',
  'SUPABASE_ISSUER',
  'SUPABASE_JWKS_URL',
  'SUPABASE_JWT_SECRET',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_URL',
  'TEXT_MAX_LENGTH',
  'TEXT_MIN_LENGTH',
  'TRUST_PROXY_HOPS',
  'TURNSTILE_SECRET_KEY',
  'TURNSTILE_SITE_KEY',
  'X_CLIENT_INFO'
]);

const APP_PREFIXES = [
  // Limit warnings to names that look owned by this application or its infrastructure.
  'ALLOWED_',
  'APP_',
  'AUTH_',
  'AWS_',
  'BASE_',
  'COOKIE_',
  'CORS_',
  'CSRF_',
  'DB_',
  'ENFORCE_',
  'FEATURE_',
  'FIREWALL_',
  'IMAGE_',
  'JWT_',
  'LEGACY_',
  'LOGIN_',
  'LOGOUT_',
  'MAINTENANCE_',
  'NGINX_',
  'OPS_',
  'PUBLIC_',
  'RATE_',
  'REDIS_',
  'SELF_HOST_',
  'SESSION_',
  'SHUTDOWN_',
  'SIGNUP_',
  'SKIP_',
  'STRIPE_',
  'SUPABASE_',
  'TEXT_',
  'TRUST_',
  'X_',
  'STORAGE_',
  'LOG_'
];

function warnUnknownEnv() {
  // Compare app-shaped process keys against KNOWN_ENV without printing any secret values.
  const knownSize = KNOWN_ENV.size;

  if (!knownSize) {
    console.warn('[config] KNOWN_ENV is empty inside the container');
  }

  const isAppKey = (key) =>
    key === 'NODE_ENV' ||
    key === 'PORT' ||
    APP_PREFIXES.some((prefix) => key.startsWith(prefix));

  const unknown = Object.keys(process.env)
    .filter((key) => /^[A-Z0-9_]+$/.test(key))
    .filter(isAppKey)
    .filter((key) => !KNOWN_ENV.has(key));

  if (unknown.length) {
    console.warn(
      `[config] Unknown app/infra env keys present (ignored): ${unknown
        .sort()
        .join(', ')}`
    );
  }
}

const ENABLE_ENV_AUDIT = process.env.CONFIG_ENV_AUDIT === '1';

if (ENABLE_ENV_AUDIT) {
  warnUnknownEnv();
}

// Helpers
function int(value, defaultValue) {
  // Central parsing keeps numeric defaults consistent across the typed config object.
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function bool(value, defaultValue = false) {
  // Accept common deployment spellings while returning the caller's safe default for typos.
  if (value === undefined || value === null) {
    return defaultValue;
  }

  const normalized = String(value).trim().toLowerCase();

  if (['1', 'true', 'yes', 'on', 'y'].includes(normalized)) {
    return true;
  }

  if (['0', 'false', 'no', 'off', 'n'].includes(normalized)) {
    return false;
  }

  return defaultValue;
}

function csv(value) {
  // Allow comma-separated environment lists without leaving whitespace or empty entries.
  return value
    ? String(value)
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}

// JWKS verification currently supports the asymmetric algorithms used by
// Supabase signing keys.
const SUPPORTED_JWKS_ALGORITHMS = Object.freeze(['RS256', 'ES256']);

function parseJwtAlgorithms(value) {
  // Return requested, accepted, and invalid sets so validation can explain unsupported values.
  const requested = value
    ? csv(value).map((algorithm) => algorithm.toUpperCase())
    : [...SUPPORTED_JWKS_ALGORITHMS];

  const uniqueRequested = [...new Set(requested)];

  return {
    requested: uniqueRequested,
    allowed: uniqueRequested.filter((algorithm) =>
      SUPPORTED_JWKS_ALGORITHMS.includes(algorithm)
    ),
    invalid: uniqueRequested.filter(
      (algorithm) => !SUPPORTED_JWKS_ALGORITHMS.includes(algorithm)
    )
  };
}

// Database display metadata
function deriveDbParts(provider, env) {
  // Build non-secret connection metadata used only by the boot configuration summary.
  try {
    if (provider === 'supabase-http') {
      const url = new URL(env.SUPABASE_URL);
      const host = url.host;
      const port = url.port
        ? int(url.port, 443)
        : url.protocol === 'https:'
          ? 443
          : 80;
      const name = host.split('.')[0] || 'supabase';

      return { host, port, name };
    }

    if (provider === 'postgres') {
      const databaseUrl = env.SUPABASE_DB_URL;

      if (databaseUrl) {
        const url = new URL(databaseUrl);
        const host = url.hostname;
        const port = url.port ? int(url.port, 5432) : 5432;
        const name =
          (url.pathname || '/').replace(/^\//, '') || 'postgres';

        return { host, port, name };
      }
    }

    return { host: 'unknown', port: 0, name: 'unknown' };
  } catch {
    return { host: 'unknown', port: 0, name: 'unknown' };
  }
}

// Provider and typed values
const DB_PROVIDER = (
  // Default to the HTTP client used by the repository unless deployment chooses Postgres.
  process.env.DB_PROVIDER || 'supabase-http'
).toLowerCase();

const derivedDb = deriveDbParts(DB_PROVIDER, process.env);

const nodeEnv = process.env.NODE_ENV || 'development';
const isDev = nodeEnv === 'development';
const isTest = nodeEnv === 'test';

const jwtAlgorithmConfig = parseJwtAlgorithms(
  process.env.JWT_ALLOWED_ALGS
);

const turnstileSiteKey = (
  process.env.TURNSTILE_SITE_KEY || ''
).trim();

const turnstileSecretKey = (
  process.env.TURNSTILE_SECRET_KEY || ''
).trim();

const turnstileEnabled = Boolean(
  // A single missing key disables the pair; validateConfig catches required enforcement mismatches.
  turnstileSiteKey && turnstileSecretKey
);

const rateLimitEnabled = bool(
  process.env.RATE_LIMIT_ENABLED,
  true
);

const localLimitersEnabled = bool(
  process.env.LOCAL_LIMITERS_ENABLED,
  true
);

const appLimitersEnabled = bool(
  process.env.APP_LIMITERS_ENABLED,
  true
);

const skipRateLimitInDev = bool(
  process.env.SKIP_RATE_LIMIT_IN_DEV,
  false
);

const skipRateLimitInTest = bool(
  process.env.SKIP_RATE_LIMIT_IN_TEST,
  false
);

const rateLimitActiveThisBoot =
  rateLimitEnabled &&
  !(isDev && skipRateLimitInDev) &&
  !(isTest && skipRateLimitInTest);

// Ops / health posture
const DEFAULT_LOCAL_ALLOWLIST = [
  '127.0.0.1',
  '::1',
  '192.168.65.1'
];

const derivedOpsToken = (
  process.env.OPS_HEALTH_TOKEN || ''
).trim();

const derivedOpsIps = csv(process.env.OPS_HEALTH_IPS);

const effectiveAllowlist = derivedOpsIps.length
  ? derivedOpsIps
  : DEFAULT_LOCAL_ALLOWLIST;

const devPublicHealth = isDev && !derivedOpsToken;

const derivedPublicOrigin =
  process.env.PUBLIC_ORIGIN ||
  (isDev
    ? `http://localhost:${int(process.env.PORT, 3000)}`
    : '');

// Stripe configuration
const stripeLive = {
  secretKey: (
    process.env.STRIPE_SECRET_KEY_LIVE || ''
  ).trim(),

  publishableKey: (
    process.env.STRIPE_PUBLISHABLE_KEY_LIVE || ''
  ).trim(),

  webhookSecret: (
    process.env.STRIPE_WEBHOOK_SECRET_LIVE || ''
  ).trim(),

  priceResumeOneTime: (
    process.env.STRIPE_PRICE_RESUME_ONE_TIME_LIVE || ''
  ).trim(),

  priceResumeExpert: (
    process.env.STRIPE_PRICE_RESUME_EXPERT_LIVE || ''
  ).trim()
};

const stripeTest = {
  secretKey: (
    process.env.STRIPE_SECRET_KEY_TEST || ''
  ).trim(),

  publishableKey: (
    process.env.STRIPE_PUBLISHABLE_KEY_TEST || ''
  ).trim(),

  webhookSecret: (
    process.env.STRIPE_WEBHOOK_SECRET_TEST || ''
  ).trim(),

  priceResumeOneTime: (
    process.env.STRIPE_PRICE_RESUME_ONE_TIME_TEST || ''
  ).trim(),

  priceResumeExpert: (
    process.env.STRIPE_PRICE_RESUME_EXPERT_TEST || ''
  ).trim()
};

// Storage configuration
const storageConfig = {
  provider: (
    process.env.STORAGE_PROVIDER || 'local'
  ).toLowerCase(),

  s3: {
    bucket: (
      process.env.STORAGE_S3_BUCKET || ''
    ).trim(),

    region: (
      process.env.STORAGE_S3_REGION ||
      process.env.AWS_REGION ||
      'us-west-2'
    ).trim(),

    basePath: (
      process.env.STORAGE_S3_BASE_PATH || 'binders'
    )
      .replace(/^\/+/, '')
      .replace(/\/+$/, ''),

    publicBaseUrl: (
      process.env.STORAGE_S3_PUBLIC_BASE_URL || ''
    ).trim()
  }
};

const stripeMode =
  // Development uses test credentials; every other deployed environment selects live.
  nodeEnv === 'development' ? 'test' : 'live';

const stripeActive =
  stripeMode === 'live' ? stripeLive : stripeTest;

const stripeApiVersion = (
  process.env.STRIPE_API_VERSION || ''
).trim() || undefined;

// Typed configuration
const config = {
  // Group typed values by their consuming module so callers do not read process.env directly.
  server: {
    port: int(process.env.PORT, 3000),
    nodeEnv,
    host: process.env.HOST || '0.0.0.0',
    trustProxy: true,
    trustProxyHops: int(
      process.env.TRUST_PROXY_HOPS,
      2
    ),
    canonicalHost:
      process.env.CANONICAL_HOST || undefined,
    requestIdHeader: 'x-request-id'
  },

  database: {
    // These fields are safe connection metadata; service credentials live in supabase below.
    provider: DB_PROVIDER,
    url:
      DB_PROVIDER === 'supabase-http'
        ? process.env.SUPABASE_URL
        : process.env.SUPABASE_DB_URL,
    host: derivedDb.host,
    port: derivedDb.port,
    name: derivedDb.name
  },

  // Supabase Auth JWT verification.
  jwt: {
    jwksUrl: (
      process.env.SUPABASE_JWKS_URL || ''
    ).trim(),

    issuer: (
      process.env.SUPABASE_ISSUER || ''
    ).trim(),

    expectedAud: (
      process.env.SUPABASE_EXPECTED_AUD ||
      'authenticated'
    ).trim(),

    allowedAlgorithms: jwtAlgorithmConfig.allowed,

    clockSkewSec: int(
      process.env.JWT_CLOCK_SKEW_SEC,
      60
    ),

    // Retained for legacy code paths that may still verify HS256 tokens.
    // The JWKS verifier does not use this value.
    secret: (
      process.env.SUPABASE_JWT_SECRET || ''
    ).trim()
  },

  security: {
    // coreMiddleware/security middleware consume these shared transport/browser policy values.
    sessionSecret: process.env.SESSION_SECRET,
    enforceHttps: bool(
      process.env.ENFORCE_HTTPS,
      true
    ),
    hstsEnabled: true,
    cspNonce: true,
    referrerPolicy: 'no-referrer',
    allowedOrigins: csv(
      process.env.ALLOWED_ORIGINS
    )
  },

  csrf: {
    cookieName:
      process.env.CSRF_COOKIE_NAME ||
      'csrf_token',

    headerName: (
      process.env.CSRF_HEADER_NAME ||
      'x-csrf-token'
    ).toLowerCase(),

    secret: process.env.CSRF_SECRET
  },

  redis: {
    url: process.env.REDIS_URL,
    host:
      process.env.REDIS_HOST ||
      'localhost',
    port: int(
      process.env.REDIS_PORT,
      6379
    ),
    password: process.env.REDIS_PASSWORD
  },

  limits: {
    textMaxLength: int(
      process.env.TEXT_MAX_LENGTH,
      5000
    ),
    textMinLength: int(
      process.env.TEXT_MIN_LENGTH,
      20
    ),
    maxSubmissions: int(
      process.env.MAX_SUBMISSIONS,
      10
    )
  },

  maintenance: {
    // maintenanceGuard reads this block for Redis state, bypass, retry, and allowed health paths.
    key:
      process.env.MAINTENANCE_KEY ||
      'maintenance:mode',

    default:
      process.env.MAINTENANCE_DEFAULT ||
      'off',

    allowlist:
      csv(process.env.MAINTENANCE_ALLOWLIST) ||
      ['127.0.0.1', '::1'],

    retryAfter: int(
      process.env.MAINTENANCE_RETRY_AFTER,
      120
    ),

    pagePath:
      process.env.MAINTENANCE_PAGE ||
      '/app/server/public/maintenance.html',

    message:
      process.env.MAINTENANCE_MESSAGE ||
      'We will be back soon.',

    bypassToken:
      process.env.MAINTENANCE_BYPASS_TOKEN ||
      '',

    allowedPaths: [
      '/health/liveness',
      '/health/readiness',
      '/health',
      '/.well-known/acme-challenge/',
      '/api/stripe/webhook',
      ...csv(
        process.env.MAINTENANCE_ALLOWED_PATHS
      )
    ]
  },

  ops: {
    // Health middleware accepts the derived token/IP allowlist under these known header names.
    token: derivedOpsToken,
    ips: effectiveAllowlist,
    headerNames: [
      'X-Ops-Health-Token',
      'X-Ops-Token',
      'X-Health-Token'
    ]
  },

  health: {
    public: devPublicHealth,
    token: derivedOpsToken,
    allowlist: effectiveAllowlist
  },

  branding: {
    appName:
      process.env.APP_NAME ||
      'Application',

    appDescription:
      process.env.APP_DESCRIPTION ||
      'A secure modern web application',

    appVersion:
      process.env.APP_VERSION ||
      '1.0.0',

    baseDomain:
      process.env.BASE_DOMAIN ||
      '',

    appSubdomain:
      process.env.APP_SUBDOMAIN ||
      'app',

    legacyCookieDomain:
      process.env.LEGACY_COOKIE_DOMAIN ||
      '',

    xClientInfo:
      process.env.X_CLIENT_INFO ||
      'app-server/1.0.0'
  },

  supabase: {
    url: process.env.SUPABASE_URL,
    anonKey:
      process.env.SUPABASE_ANON_KEY,
    serviceRoleKey:
      process.env.SUPABASE_SERVICE_ROLE_KEY
  },

  stripe: {
    // billingService selects active while stripeWebhook can still verify both live and test modes.
    mode: stripeMode,
    live: stripeLive,
    test: stripeTest,
    active: stripeActive,
    apiVersion: stripeApiVersion,

    successPath:
      process.env.STRIPE_SUCCESS_PATH ||
      '/dashboard/purchase/confirmation',

    cancelPath:
      process.env.STRIPE_CANCEL_PATH ||
      '/dashboard/billing'
  },

  storage: storageConfig,

  // Checkout redirect construction and password recovery both need one canonical public origin.
  publicOrigin: derivedPublicOrigin,

  auth: {
    // authCookie adds the __Host- prefix where appropriate; config keeps the portable basename.
    cookieName: (
      process.env.AUTH_COOKIE_BASENAME ||
      process.env.AUTH_COOKIE_NAME ||
      'sb_session'
    ).replace(/^__Host-/, ''),

    cookieAliases: csv(
      process.env.AUTH_COOKIE_ALIASES
    ),

    cookieDomain:
      process.env.AUTH_COOKIE_DOMAIN ||
      undefined,

    cookieSameSite:
      (
        process.env.COOKIE_SAMESITE ||
        'Lax'
      ).toLowerCase() === 'strict'
        ? 'Strict'
        : 'Lax',

    cookieSecure:
      process.env.COOKIE_SECURE
        ? process.env.COOKIE_SECURE === 'true'
        : undefined,

    allowLegacyLogin: bool(
      process.env.ALLOW_LEGACY_LOGIN,
      false
    ),

    debug: bool(
      process.env.AUTH_DEBUG,
      false
    ),

    passwordResetRedirect:
      process.env.PASSWORD_RESET_REDIRECT_URL ||
      (derivedPublicOrigin
        ? `${derivedPublicOrigin}/auth/forgot-password`
        : '/auth/forgot-password'),

    sentinelMs: int(
      process.env.AUTH_SENTINEL_MS,
      0
    ),

    freshLoginGraceSec: int(
      process.env.AUTH_FRESH_GRACE_SEC,
      20
    ),

    roleCompatibility: {
      // Compatibility is opt-in so missing or misspelled configuration cannot elevate a user.
      legacyAppMetadataRole: bool(
        process.env.AUTH_ROLE_LEGACY_APP_METADATA_ROLE,
        false
      ),

      legacyTopLevelUserRole: bool(
        process.env.AUTH_ROLE_LEGACY_TOP_LEVEL_USER_ROLE,
        false
      ),

      superUserAsAdmin: bool(
        process.env.AUTH_ROLE_SUPER_USER_AS_ADMIN,
        false
      )
    },

    setCookie: {
      // These optional gates are evaluated inside the public /auth/set-cookie boundary.
      enforceLockout: bool(
        process.env.AUTH_SET_COOKIE_ENFORCE_LOCKOUT,
        nodeEnv === 'production'
      ),

      enforceTurnstile: bool(
        process.env.AUTH_SET_COOKIE_ENFORCE_TURNSTILE,
        false
      )
    }
  },

  opsHealth: {
    dbProbeTable:
      process.env.OPS_DB_PROBE_TABLE ||
      'profiles',

    dbProbeRpc:
      process.env.OPS_DB_PROBE_RPC ||
      ''
  },

  features: {
    // Receipt archiving remains opt-in so existing payment schemas do not change implicitly.
    archiveReceipts: bool(
      process.env.FEATURE_ARCHIVE_RECEIPTS,
      false
    ),

    archiveReceiptsTable:
      process.env.FEATURE_ARCHIVE_RECEIPTS_TABLE ||
      'receipt_archives'
  },

  shutdown: {
    graceMs: int(
      process.env.SHUTDOWN_GRACE_MS,
      15000
    )
  },

  rateLimit: {
    // rateLimiter reads both global enablement and per-operation window/max values here.
    enabled: rateLimitEnabled,
    skipInDev: skipRateLimitInDev,
    skipInTest: skipRateLimitInTest,

    windows: {
      general: {
        windowMs: int(
          process.env.RATE_LIMIT_WINDOW_MS,
          60_000
        ),
        max: int(
          process.env.RATE_LIMIT_MAX,
          300
        )
      },

      login: {
        windowMs: int(
          process.env.LOGIN_WINDOW_MS,
          15 * 60_000
        ),
        max: int(
          process.env.LOGIN_MAX,
          10
        )
      },

      signup: {
        windowMs: int(
          process.env.SIGNUP_WINDOW_MS,
          60 * 60_000
        ),
        max: int(
          process.env.SIGNUP_MAX,
          5
        )
      },

      logout: {
        windowMs: int(
          process.env.LOGOUT_WINDOW_MS,
          10 * 60_000
        ),
        max: int(
          process.env.LOGOUT_MAX,
          120
        )
      },

      cookieSet: {
        windowMs: int(
          process.env.COOKIE_SET_WINDOW_MS,
          60_000
        ),
        max: int(
          process.env.COOKIE_SET_MAX,
          300
        )
      }
    },

    ...(rateLimitActiveThisBoot
      ? {
          primary: 'cloudflare',
          secondary:
            localLimitersEnabled &&
            appLimitersEnabled
              ? 'redis-origin'
              : undefined
        }
      : {})
  },

  firewall: {
    // ipFirewall decides fail-closed behavior and merges this static deployment blocklist.
    failClosed: bool(
      process.env.FIREWALL_FAIL_CLOSED,
      true
    ),

    staticBlocklist: csv(
      process.env.IP_BLOCKLIST
    )
  },

  turnstile: {
    enabled: turnstileEnabled,
    siteKey: turnstileSiteKey,
    secretKey: turnstileSecretKey
  },

  logging: {
    logLevel: (
      process.env.LOG_LEVEL ||
      'info'
    ).toLowerCase()
  }
};

// Alignment shims
if (config.database?.provider === 'supabase-http') {
  // Fill historical aliases so older modules see the same values as the typed database block.
  const dbUrl =
    config.database.url ||
    process.env.SUPABASE_URL ||
    '';

  config.supabase =
    config.supabase || {};

  if (!config.supabase.url) {
    config.supabase.url = dbUrl;
  }

  if (!config.supabase.anonKey) {
    config.supabase.anonKey =
      process.env.SUPABASE_ANON_KEY || '';
  }

  if (!config.supabase.serviceRoleKey) {
    config.supabase.serviceRoleKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  }
}

if (!('publicOrigin' in config) || !config.publicOrigin) {
  // Development can safely derive localhost; non-development remains empty for validation.
  config.publicOrigin =
    process.env.PUBLIC_ORIGIN ||
    (isDev
      ? `http://localhost:${int(
          process.env.PORT,
          3000
        )}`
      : '');
}

if (typeof config.health?.public !== 'boolean') {
  // Retain compatibility if an older config assembly path produced a non-boolean value.
  const on = (value) =>
    ['1', 'true', 'yes', 'on', 'y'].includes(
      String(value || '')
        .trim()
        .toLowerCase()
    );

  config.health.public = on(
    process.env.HEALTH_PUBLIC
  );
}

// Deep-freeze config
(function deepFreeze(object) {
  // Freeze recursively so runtime modules cannot accidentally change shared deployment policy.
  Object.freeze(object);

  Object.getOwnPropertyNames(object).forEach(
    (property) => {
      const value = object[property];

      if (
        value &&
        typeof value === 'object' &&
        !Object.isFrozen(value)
      ) {
        deepFreeze(value);
      }
    }
  );
})(config);

// Validation
function validateConfig() {
  // 1. Check unconditional environment requirements and provider-specific database settings.
  // 2. Validate auth URLs/algorithms plus optional Stripe, storage, and Turnstile combinations.
  // 3. Return every startup error together so deployment fixes do not require repeated boots.
  const errors = [];

  const required = [
    'PORT',
    'NODE_ENV',
    'HOST',
    'TEXT_MIN_LENGTH',
    'TEXT_MAX_LENGTH',
    'MAX_SUBMISSIONS',
    'SUPABASE_JWKS_URL',
    'SUPABASE_ISSUER',
    'SUPABASE_EXPECTED_AUD'
  ];

  if (DB_PROVIDER === 'supabase-http') {
    // Each provider has one distinct required connection value.
    if (!process.env.SUPABASE_URL) {
      errors.push(
        'SUPABASE_URL is required for DB_PROVIDER=supabase-http'
      );
    }
  } else if (DB_PROVIDER === 'postgres') {
    if (!process.env.SUPABASE_DB_URL) {
      errors.push(
        'SUPABASE_DB_URL is required for DB_PROVIDER=postgres'
      );
    }
  } else {
    errors.push(
      `Unsupported DB_PROVIDER "${DB_PROVIDER}" ` +
        '(use "supabase-http" or "postgres")'
    );
  }

  for (const variableName of required) {
    // Read raw presence here because typed defaults must not hide a missing required deployment key.
    if (!process.env[variableName]) {
      errors.push(
        `${variableName} environment variable is required`
      );
    }
  }

  if (jwtAlgorithmConfig.invalid.length) {
    // supabaseJwt can verify only the asymmetric JWKS algorithms accepted above.
    errors.push(
      'JWT_ALLOWED_ALGS contains unsupported algorithms: ' +
        jwtAlgorithmConfig.invalid.join(', ') +
        `. Supported values: ${SUPPORTED_JWKS_ALGORITHMS.join(', ')}`
    );
  }

  if (!config.jwt.allowedAlgorithms.length) {
    errors.push(
      'JWT_ALLOWED_ALGS must contain at least one supported ' +
        `algorithm: ${SUPPORTED_JWKS_ALGORITHMS.join(', ')}`
    );
  }

  if (
    config.jwt.allowedAlgorithms.length &&
    !config.jwt.jwksUrl
  ) {
    errors.push(
      'SUPABASE_JWKS_URL is required when JWT_ALLOWED_ALGS ' +
        'contains RS256 or ES256'
    );
  }

  try {
    // Parse URLs during boot instead of letting the first authentication request fail later.
    if (config.jwt.jwksUrl) {
      const jwksUrl = new URL(config.jwt.jwksUrl);

      if (
        !['https:', 'http:'].includes(
          jwksUrl.protocol
        )
      ) {
        errors.push(
          'SUPABASE_JWKS_URL must use http or https'
        );
      }
    }
  } catch {
    errors.push(
      'SUPABASE_JWKS_URL must be a valid URL'
    );
  }

  try {
    if (config.jwt.issuer) {
      const issuerUrl = new URL(config.jwt.issuer);

      if (
        !['https:', 'http:'].includes(
          issuerUrl.protocol
        )
      ) {
        errors.push(
          'SUPABASE_ISSUER must use http or https'
        );
      }
    }
  } catch {
    errors.push(
      'SUPABASE_ISSUER must be a valid URL'
    );
  }

  const hasStripe =
    // Stripe secrets become required only when at least one active product price is configured.
    config.stripe &&
    config.stripe.active &&
    (
      config.stripe.active.priceResumeOneTime ||
      config.stripe.active.priceResumeExpert
    );

  const usingStripePrices = Boolean(hasStripe);

  const isProd =
    (
      config.server.nodeEnv || ''
    ).toLowerCase() === 'production';

  if (usingStripePrices && isProd) {
    if (!config.stripe.active.secretKey) {
      errors.push(
        'STRIPE_SECRET_KEY_LIVE is required in production ' +
          'when Stripe prices are configured'
      );
    }

    if (!config.stripe.live.webhookSecret) {
      errors.push(
        'STRIPE_WEBHOOK_SECRET_LIVE is required in production ' +
          'when Stripe prices are configured'
      );
    }

    if (!config.stripe.test.webhookSecret) {
      errors.push(
        'STRIPE_WEBHOOK_SECRET_TEST should also be set for ' +
          'test endpoint verification'
      );
    }
  }

  if (storageConfig.provider === 's3') {
    // storageProvider can construct its client only with a bucket and region.
    if (!storageConfig.s3.bucket) {
      errors.push(
        'STORAGE_S3_BUCKET is required when STORAGE_PROVIDER=s3'
      );
    }

    if (!storageConfig.s3.region) {
      errors.push(
        'STORAGE_S3_REGION (or AWS_REGION) is required ' +
          'when STORAGE_PROVIDER=s3'
      );
    }
  }

  if (usingStripePrices) {
    if (
      !config.publicOrigin ||
      !config.publicOrigin.trim()
    ) {
      errors.push(
        'PUBLIC_ORIGIN is required when Stripe prices are configured'
      );
    } else {
      try {
        const testUrl =
          config.publicOrigin.replace(/\/+$/, '') +
          '/test';

        new URL(testUrl);
      } catch {
        errors.push(
          'PUBLIC_ORIGIN must be a valid URL. ' +
            `Current value: "${config.publicOrigin}"`
        );
      }
    }
  }

  if (
    config.server.port < 1 ||
    config.server.port > 65535
  ) {
    errors.push(
      'PORT must be between 1 and 65535'
    );
  }

  const validEnvironments = [
    // Keep deployment behavior predictable because several defaults branch on NODE_ENV.
    'development',
    'production',
    'test'
  ];

  if (
    !validEnvironments.includes(
      config.server.nodeEnv
    )
  ) {
    errors.push(
      `NODE_ENV must be one of: ${validEnvironments.join(', ')}`
    );
  }

  if (
    config.limits.textMaxLength <
    config.limits.textMinLength
  ) {
    errors.push(
      'TEXT_MAX_LENGTH must be greater than TEXT_MIN_LENGTH'
    );
  }

  if (config.limits.textMinLength < 1) {
    errors.push(
      'TEXT_MIN_LENGTH must be at least 1'
    );
  }

  if (config.limits.maxSubmissions < 1) {
    errors.push(
      'MAX_SUBMISSIONS must be at least 1'
    );
  }

  const hasTurnstileSiteKey =
    Boolean(turnstileSiteKey);

  const hasTurnstileSecretKey =
    Boolean(turnstileSecretKey);

  if (
    hasTurnstileSiteKey !==
    hasTurnstileSecretKey
  ) {
    errors.push(
      'TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY ' +
        'must both be set or both be empty'
    );
  }

  const enforceSetCookieTurnstile = bool(
    // An enforced cookie challenge cannot work with the otherwise optional key pair missing.
    process.env.AUTH_SET_COOKIE_ENFORCE_TURNSTILE,
    false
  );

  if (
    enforceSetCookieTurnstile &&
    !turnstileEnabled
  ) {
    errors.push(
      'AUTH_SET_COOKIE_ENFORCE_TURNSTILE=true requires ' +
        'TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY'
    );
  }

  return errors;
}

const validationErrors = validateConfig();

if (validationErrors.length > 0) {
  // Fail before Express starts listening so the process never serves with partial security config.
  console.error(
    'Configuration validation failed:'
  );

  validationErrors.forEach((error) =>
    console.error(`  - ${error}`)
  );

  const isTestEnvironment =
    process.env.NODE_ENV === 'test';

  if (isTestEnvironment) {
    throw new Error(
      `Configuration validation failed: ${validationErrors.join('; ')}`
    );
  }

  process.exit(1);
}

// Boot summary
function logConfigSummary() {
  // Prefer the shared formatted logger, then fall back to a short secret-free console summary.
  try {
    const consoleLogger = require(
      '../utils/consoleLogger'
    );

    if (
      consoleLogger &&
      typeof consoleLogger.formatConfigSummary ===
        'function'
    ) {
      consoleLogger.formatConfigSummary(config);
      return;
    }
  } catch {
    // Fall through to plain console summary.
  }

  const dbSummary = config.database?.name
    ? `${config.database.host}:${config.database.port}/${config.database.name}`
    : 'unknown';

  console.log('\nCONFIGURATION LOADED');
  console.log(
    `   Server: ${config.server?.host}:${config.server?.port} ` +
      `(${config.server?.nodeEnv})`
  );
  console.log(
    `   Database: ${dbSummary}`
  );
  console.log(
    '   Auth: Stateless ' +
      `(Supabase JWT + JWKS; algorithms: ${config.jwt.allowedAlgorithms.join(', ')})`
  );
  console.log(
    '   Rate Limiting: handled at Cloudflare edge (PRIMARY) ' +
      '+ Redis app limiters (SECONDARY)'
  );
  console.log(
    `   Text Limits: ${config.limits?.textMinLength || 'unknown'}-` +
      `${config.limits?.textMaxLength || 'unknown'} chars`
  );
  console.log(
    `   Max Submissions: ${config.limits?.maxSubmissions || 'unknown'}`
  );
}

// Asset version
const rawAssetVersion = (
  process.env.ASSET_VERSION || ''
).trim();

const rawImageTag = (
  process.env.IMAGE_TAG || ''
).trim();

const ASSET_VERSION =
  // Deployment-provided versions stay stable; local fallback changes with each process start.
  rawAssetVersion ||
  rawImageTag ||
  String(Date.now());

module.exports = {
  config,
  validateConfig,
  logConfigSummary,
  ASSET_VERSION
};
