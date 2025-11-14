// File: server/config/index.js
// Description: Centralized configuration management with validation
// Notes: Validates required environment variables and provides defaults

const path = require('path');
const { formatConfigSummary } = require('../utils/consoleLogger');

// Load .env from project root (works in dev; in prod systemd injects EnvironmentFile too)
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

/**
 * WHAT:
 * Parse/validate all environment-driven configuration for the app.
 *
 * WHY:
 * Consistent, typed config with helpful validation stops bad boots and
 * keeps logs clean (no "undefined:NaN/undefined").
 *
 * HOW:
 * - Small helpers for numbers, booleans, CSV.
 * - DB provider–aware derivation (Supabase HTTP vs Postgres).
 * - Validation that adapts to provider.
 * - A human-readable DB summary for startup logs.
 */

// ──────────────────────────────────────────────────────────────────────────────
// Small helpers
// ──────────────────────────────────────────────────────────────────────────────
function int(v, def) {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
}
function bool(v, def = false) {
  if (v === undefined || v === null) return def;
  const s = String(v).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on', 'y'].includes(s)) return true;
  if (['0', 'false', 'no', 'off', 'n'].includes(s)) return false;
  return def;
}
function csv(v) {
  return v ? String(v).split(',').map(s => s.trim()).filter(Boolean) : [];
}

/**
 * Derive DB host/port/name "pretty" fields so startup logs are always sane.
 * - supabase-http: from SUPABASE_URL (e.g., "<ref>.supabase.co")
 * - postgres: from DATABASE_URL or DB_* trio
 */

function deriveDbParts(provider, env) {
  try {
    if (provider === 'supabase-http') {
      const u = new URL(env.SUPABASE_URL);
      const host = u.host;
      const port = u.port ? int(u.port) : (u.protocol === 'https:' ? 443 : 80);
      // Try to surface the <project-ref> as the "name"
      const firstLabel = host.split('.')[0] || 'supabase';
      const name = firstLabel;
      return { host, port, name };
    }

    // provider === 'postgres'
    const url = env.SUPABASE_DB_URL || env.DATABASE_URL;
    if (url) {
      const u = new URL(url);
      const host = u.hostname;
      const port = u.port ? int(u.port) : 5432;
      const name = (u.pathname || '/').replace(/^\//, '') || env.DB_NAME || 'postgres';
      return { host, port, name };
    }
    // fallback to discrete vars
    return {
      host: env.DB_HOST || 'localhost',
      port: int(env.DB_PORT, 5432),
      name: env.DB_NAME || 'postgres'
    };
  } catch {
    // Never crash from pretty-printing
    return {
      host: env.DB_HOST || 'unknown',
      port: int(env.DB_PORT, 0),
      name: env.DB_NAME || 'unknown'
    };
  }
}

// ──────────────────────────────────────────────────────────────────────────────
const DB_PROVIDER = (process.env.DB_PROVIDER || 'supabase-http').toLowerCase();

const derivedDb = deriveDbParts(DB_PROVIDER, process.env);

// Configuration schema (non-secret only; secrets come from .env / systemd env)
const config = {
  // Server configuration
  server: {
    port: int(process.env.PORT, 3000),
    nodeEnv: process.env.NODE_ENV || 'production',
    host: process.env.HOST || '0.0.0.0',
    // Behind Cloudflare or reverse proxy
    trustProxy: bool(process.env.TRUST_PROXY, true),
    // Which header your request-id middleware prefers (kept generic)
    requestIdHeader: process.env.REQUEST_ID_HEADER || 'x-request-id'
  },

  // Database (Supabase HTTP by default; Postgres supported if you switch provider)
  database: {
    provider: DB_PROVIDER, // 'supabase-http' | 'postgres'
    // Connection-ish things used by the app:
    url:
      DB_PROVIDER === 'supabase-http'
        ? process.env.SUPABASE_URL
        : (process.env.SUPABASE_DB_URL || process.env.DATABASE_URL),
    // Pretty fields for logging/ops only (no secrets)
    host: derivedDb.host,
    port: derivedDb.port,
    name: derivedDb.name
  },

  // Auth / JWT Verification (stateless, RS256 via Supabase)
  jwt: {
    jwksUrl: process.env.SUPABASE_JWKS_URL,
    issuer: process.env.SUPABASE_ISSUER,
    expectedAud: process.env.SUPABASE_EXPECTED_AUD,
    clockSkewSec: int(process.env.JWT_CLOCK_SKEW_SEC, 30)
  },

  // Security configuration (non-PII)
  security: {
    // These are app-level; Cloudflare does heavy lifting at edge.
    jwtSecret: process.env.JWT_SECRET, // optional legacy fallback (avoid if possible)
    sessionSecret: process.env.SESSION_SECRET, // avoid storing sessions; you’re stateless
    bcryptRounds: int(process.env.BCRYPT_ROUNDS, 12),

    // Headers / transport
    enforceHttps: bool(process.env.ENFORCE_HTTPS, true), // flip off only in dev behind proxy
    hstsEnabled: bool(process.env.HSTS_ENABLED, true),
    cspNonce: bool(process.env.CSP_NONCE_ENABLED, true),
    referrerPolicy: process.env.REFERRER_POLICY || 'no-referrer',
    // Allow-list CORS for dashboards/APIs
    allowedOrigins: csv(process.env.ALLOWED_ORIGINS)
  },

  // Redis configuration (for sessions and caching)
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: int(process.env.REDIS_PORT, 6379),
    password: process.env.REDIS_PASSWORD,
    url: process.env.REDIS_URL
  },

  // Input validation limits
  limits: {
    textMaxLength: int(process.env.TEXT_MAX_LENGTH, 5000),
    textMinLength: int(process.env.TEXT_MIN_LENGTH, 20),
    maxSubmissions: int(process.env.MAX_SUBMISSIONS, 10)
  },

  // Maintenance mode configuration (kept in sync with middleware)
  maintenance: {
    key: process.env.MAINTENANCE_KEY || 'maintenance:mode',
    default: process.env.MAINTENANCE_DEFAULT || 'off',
    allowlist: csv(process.env.MAINTENANCE_ALLOWLIST) || ['127.0.0.1', '::1'],
    retryAfter: int(process.env.MAINTENANCE_RETRY_AFTER, 120),
    // Default to the path that actually exists inside your container
    pagePath: process.env.MAINTENANCE_PAGE || '/app/server/public/maintenance.html',
    message: process.env.MAINTENANCE_MESSAGE || 'We will be back soon.',
    // Optional owner bypass token (header: x-maintenance-bypass). If unset, bypass is disabled.
    bypassToken: process.env.MAINTENANCE_BYPASS_TOKEN || ''
  },

  // Ops health access control
  ops: {
    // Canonical token is OPS_HEALTH_TOKEN; HEALTH_TOKEN allowed for backward compatibility
    token: process.env.OPS_HEALTH_TOKEN || process.env.HEALTH_TOKEN,
    // Prefer OPS_HEALTH_IPS; fallback to HEALTH_ALLOWLIST; final default
    ips: csv(process.env.OPS_HEALTH_IPS || process.env.HEALTH_ALLOWLIST) || ['127.0.0.1', '::1']
  },
  health: {
    public: bool(process.env.HEALTH_PUBLIC, false),
    // Deprecated: use ops.token (OPS_HEALTH_TOKEN) instead; keep mirrored to avoid breaking readers
    token: process.env.OPS_HEALTH_TOKEN || process.env.HEALTH_TOKEN,
    // Mirror union logic too so old readers behave
    allowlist: csv(process.env.OPS_HEALTH_IPS || process.env.HEALTH_ALLOWLIST) || ['127.0.0.1', '::1']
  },

  // Branding and domain configuration (env-driven for project reuse)
  branding: {
    appName: process.env.APP_NAME || 'Application',
    appDescription: process.env.APP_DESCRIPTION || 'A secure modern web application',
    baseDomain: process.env.BASE_DOMAIN || '',
    appSubdomain: process.env.APP_SUBDOMAIN || 'app',
    legacyCookieDomain: process.env.LEGACY_COOKIE_DOMAIN || '',
    xClientInfo: process.env.X_CLIENT_INFO || 'app-server/1.0.0'
  }
};

// ──────────────────────────────────────────────────────────────────────────────
// Validation that adapts to the DB provider and your deployment model
// ──────────────────────────────────────────────────────────────────────────────
function validateConfig() {
  const errors = [];

  // Always-required
  const required = [
    'PORT', 'NODE_ENV', 'HOST',
    'TEXT_MIN_LENGTH', 'TEXT_MAX_LENGTH', 'MAX_SUBMISSIONS',
    'SUPABASE_JWKS_URL', 'SUPABASE_ISSUER', 'SUPABASE_EXPECTED_AUD'
  ];

  // Provider-specific requirements
  if (DB_PROVIDER === 'supabase-http') {
    if (!process.env.SUPABASE_URL) errors.push('SUPABASE_URL is required for DB_PROVIDER=supabase-http');
  } else if (DB_PROVIDER === 'postgres') {
    const hasUrl = !!(process.env.SUPABASE_DB_URL || process.env.DATABASE_URL);
    const hasDiscrete =
      process.env.DB_HOST && process.env.DB_PORT && process.env.DB_NAME &&
      process.env.DB_USER && process.env.DB_PASSWORD;
    if (!hasUrl && !hasDiscrete) {
      errors.push('Use SUPABASE_DB_URL/DATABASE_URL or provide DB_HOST,DB_PORT,DB_NAME,DB_USER,DB_PASSWORD for DB_PROVIDER=postgres');
    }
  } else {
    errors.push(`Unsupported DB_PROVIDER "${DB_PROVIDER}" (use "supabase-http" or "postgres")`);
  }

  // Simple presence checks
  for (const varName of required) {
    if (!process.env[varName]) errors.push(`${varName} environment variable is required`);
  }

  // Ports/env
  if (config.server.port < 1 || config.server.port > 65535) {
    errors.push('PORT must be between 1 and 65535');
  }
  const validEnvs = ['development', 'production', 'test'];
  if (!validEnvs.includes(config.server.nodeEnv)) {
    errors.push(`NODE_ENV must be one of: ${validEnvs.join(', ')}`);
  }

  // Limits
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

// Validate configuration on startup
const validationErrors = validateConfig();
if (validationErrors.length > 0) {
  console.error('Configuration validation failed:');
  validationErrors.forEach(error => console.error(`  - ${error}`));
  const isTest = process.env.NODE_ENV === 'test';
  if (isTest) {
    throw new Error(`Configuration validation failed: ${validationErrors.join('; ')}`);
  } else {
    process.exit(1);
  }
}

// Log configuration summary (without secrets)
// Delegates to consoleLogger so there's only one accurate "Database:" line
function logConfigSummary() {
  formatConfigSummary(config);
}

/**
 * WHAT:
 * Cache-busting version for static assets (JS/CSS).
 * 
 * WHY:
 * Browsers cache JavaScript and CSS files aggressively.
 * When we deploy new code, users see old cached files.
 * 
 * HOW:
 * Use current timestamp as version query string.
 * Example: /js/profile-edit.js?v=1697234567890
 * Forces browser to fetch fresh files after deployment.
 */
const ASSET_VERSION = process.env.ASSET_VERSION || Date.now().toString();

module.exports = {
  config,
  validateConfig,
  logConfigSummary,
  ASSET_VERSION
};