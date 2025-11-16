# Environment Configuration Compliance Audit Report

**Date:** 2025-01-27  
**Scope:** Complete codebase audit to verify `server/config/index.js` is the single source of truth for environment variables  
**Objective:** Identify all direct `process.env` access and ensure compliance with centralized config pattern

---

## Executive Summary

### Current State
- **Config file status:** `server/config/index.js` is well-structured and intended as the source of truth
- **Compliance rate:** Approximately **60-70%** of the codebase uses config correctly
- **Violations found:** **15+ files** directly access `process.env` instead of using config
- **Critical gaps:** Several middleware, services, and routes bypass config entirely

### Key Findings
1. **Config file loads dotenv once** - Good foundation, but many files still read env directly
2. **Middleware violations** - 5 middleware files read env directly (authBridge, csrfLite, rateLimiter, ipFirewall, authCookie)
3. **Service violations** - 4 service files read env directly (receiptService, pricingCatalog, profileService, receiptArchive)
4. **Route violations** - 2 route files read env directly (auth.js, submissions.js)
5. **UI contract violations** - 2 presenter files read env directly
6. **Main entry point** - zorvalon.js has several direct env reads

### Impact
- **Performance:** Multiple files re-reading env vars (though Node caches, still inefficient)
- **Maintainability:** Changes require updating multiple files instead of one config
- **Type safety:** No validation/transformation for env values outside config
- **Security risk:** Potential for inconsistent env handling across modules

---

## Config File Analysis

### Current Config Structure (`server/config/index.js`)

**Strengths:**
- Loads dotenv once at module load (line 25)
- Comprehensive validation (lines 380-451)
- Typed configuration object with safe defaults
- Freezes config to prevent mutation (lines 358-364)
- Well-documented with WHAT/WHY/HOW comments

**Exported Config Sections:**
- `server` - port, nodeEnv, host, trustProxy
- `database` - provider, url, host, port, name
- `jwt` - jwksUrl, issuer, expectedAud, clockSkewSec
- `security` - sessionSecret, enforceHttps, hstsEnabled, cspNonce, referrerPolicy, allowedOrigins
- `redis` - url, host, port, password
- `limits` - textMaxLength, textMinLength, maxSubmissions
- `maintenance` - key, default, allowlist, retryAfter, pagePath, message, bypassToken
- `ops` - token, ips, headerNames
- `health` - public, token, allowlist
- `branding` - appName, appDescription, appVersion, baseDomain, appSubdomain, legacyCookieDomain, xClientInfo
- `supabase` - url, anonKey, serviceRoleKey
- `stripe` - secretKey, webhookSecret, priceResumeOneTime, priceResumeExpert, successPath, cancelPath
- `publicOrigin` - string
- `auth` - cookieName, debug
- `opsHealth` - dbProbeTable, dbProbeRpc
- `features` - archiveReceipts, archiveReceiptsTable
- `shutdown` - graceMs
- `rateLimit` - primary, secondary

---

## Violations by Category

### 1. Middleware Violations

#### `server/middleware/authBridge.js`
**Lines:** 59, 112, 136, 196, 202  
**Direct env reads:**
- `process.env.AUTH_DEBUG` (3 occurrences)
- `process.env.SUPABASE_JWT_SECRET` (2 occurrences)

**Should use:**
- `config.auth.debug` (already exists in config)
- `config.jwt.secret` (MISSING - needs to be added to config)

**Evidence:**
```59:59:server/middleware/authBridge.js
  if (process.env.AUTH_DEBUG === 'true') {
```

```196:202:server/middleware/authBridge.js
      if (!process.env.SUPABASE_JWT_SECRET) {
        // Missing secret - silently reject
        req.user = null;
        return next();
      }
      
      const secret = new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET);
```

---

#### `server/lib/authCookie.js`
**Lines:** 11-12, 20, 26, 82, 88-89, 112-113, 117, 128, 138, 167, 227  
**Direct env reads:**
- `process.env.AUTH_COOKIE_BASENAME`
- `process.env.AUTH_COOKIE_NAME` (used as fallback)
- `process.env.AUTH_COOKIE_ALIASES`
- `process.env.LEGACY_COOKIE_DOMAIN`
- `process.env.AUTH_COOKIE_DOMAIN` (used as fallback)
- `process.env.COOKIE_SAMESITE`
- `process.env.COOKIE_SECURE` (multiple occurrences)
- `process.env.AUTH_DEBUG` (multiple occurrences)

**Should use:**
- `config.auth.cookieName` (already exists)
- `config.auth.cookieAliases` (MISSING)
- `config.auth.legacyCookieDomain` (MISSING - but `config.branding.legacyCookieDomain` exists)
- `config.auth.cookieSameSite` (MISSING)
- `config.auth.cookieSecure` (MISSING)
- `config.auth.debug` (already exists)

**Evidence:**
```11:13:server/lib/authCookie.js
let AUTH_COOKIE_BASENAME = process.env.AUTH_COOKIE_BASENAME?.trim() || 
                          process.env.AUTH_COOKIE_NAME?.trim() || 
                          'sb_session';
```

```82:82:server/lib/authCookie.js
    sameSite: (process.env.COOKIE_SAMESITE || 'Lax').toLowerCase() === 'strict' ? 'Strict' : 'Lax',
```

---

#### `server/middleware/csrfLite.js`
**Lines:** 27-29  
**Direct env reads:**
- `process.env.CSRF_COOKIE_NAME`
- `process.env.CSRF_HEADER_NAME`
- `process.env.AUTH_COOKIE_DOMAIN`

**Should use:**
- `config.csrf.cookieName` (MISSING)
- `config.csrf.headerName` (MISSING)
- `config.auth.cookieDomain` (MISSING)

**Evidence:**
```27:29:server/middleware/csrfLite.js
const CSRF_COOKIE_NAME = process.env.CSRF_COOKIE_NAME || 'csrf_token';
const CSRF_HEADER_NAME = (process.env.CSRF_HEADER_NAME || 'x-csrf-token').toLowerCase();
const AUTH_COOKIE_DOMAIN = process.env.AUTH_COOKIE_DOMAIN || undefined; // leave undefined if you ever switch to __Host- cookies
```

---

#### `server/middleware/rateLimiter.js`
**Lines:** 51-76  
**Direct env reads:**
- `process.env.NODE_ENV` (2 occurrences)
- `process.env.RATE_LIMIT_ENABLED`
- `process.env.SKIP_RATE_LIMIT_IN_DEV`
- `process.env.SKIP_RATE_LIMIT_IN_TEST`
- `process.env.RATE_LIMIT_WINDOW_MS`
- `process.env.RATE_LIMIT_MAX`
- `process.env.LOGIN_WINDOW_MS`
- `process.env.LOGIN_MAX`
- `process.env.SIGNUP_WINDOW_MS`
- `process.env.SIGNUP_MAX`
- `process.env.LOGOUT_WINDOW_MS`
- `process.env.LOGOUT_MAX`
- `process.env.COOKIE_SET_WINDOW_MS`
- `process.env.COOKIE_SET_MAX`

**Should use:**
- `config.server.nodeEnv` (already exists)
- `config.rateLimit.enabled` (MISSING - but config has rateLimit object)
- `config.rateLimit.skipInDev` (MISSING)
- `config.rateLimit.skipInTest` (MISSING)
- `config.rateLimit.windows` (MISSING - needs structure for all window/max pairs)

**Evidence:**
```51:76:server/middleware/rateLimiter.js
const isProd = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';
const enabled = process.env.RATE_LIMIT_ENABLED !== 'false';         // default ON
const skipInDev = process.env.SKIP_RATE_LIMIT_IN_DEV === 'true';    // optional skip
// Test skip flag: only honored in test mode, ignored in prod
const skipInTest = isTest && process.env.SKIP_RATE_LIMIT_IN_TEST === 'true';

// ============================================================
// Per-Route Configurations (Application-Specific Limits)
// ============================================================
// These limits are applied AFTER Cloudflare edge filtering
// They provide granular control for different endpoint types
const GENERAL_WINDOW_S   = Number(process.env.RATE_LIMIT_WINDOW_MS  || 60_000) / 1000;         // 60s
const GENERAL_MAX        = Number(process.env.RATE_LIMIT_MAX        || 300);

const LOGIN_WINDOW_S     = Number(process.env.LOGIN_WINDOW_MS       || 15 * 60_000) / 1000;    // 15m
const LOGIN_MAX          = Number(process.env.LOGIN_MAX             || 10);

const SIGNUP_WINDOW_S    = Number(process.env.SIGNUP_WINDOW_MS      || 60 * 60_000) / 1000;    // 1h
const SIGNUP_MAX         = Number(process.env.SIGNUP_MAX            || 5);

const LOGOUT_WINDOW_S    = Number(process.env.LOGOUT_WINDOW_MS      || 10 * 60_000) / 1000;    // 10m
const LOGOUT_MAX         = Number(process.env.LOGOUT_MAX            || 120);

const COOKIE_SET_WINDOW_S= Number(process.env.COOKIE_SET_WINDOW_MS  || 60_000) / 1000;         // 60s
const COOKIE_SET_MAX     = Number(process.env.COOKIE_SET_MAX        || 300);
```

---

#### `server/middleware/ipFirewall.js`
**Lines:** 46, 274  
**Direct env reads:**
- `process.env.FIREWALL_FAIL_CLOSED`
- `process.env.IP_BLOCKLIST`

**Should use:**
- `config.firewall.failClosed` (MISSING)
- `config.firewall.staticBlocklist` (MISSING)

**Evidence:**
```46:46:server/middleware/ipFirewall.js
const FAIL_CLOSED = String(process.env.FIREWALL_FAIL_CLOSED || 'true').toLowerCase() !== 'false';
```

```274:277:server/middleware/ipFirewall.js
// Static blocklist for tests and emergency ops (env-driven)
const STATIC_BLOCKLIST = (process.env.IP_BLOCKLIST || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);
```

---

### 2. Service Violations

#### `server/services/receiptService.js`
**Lines:** 23, 34  
**Direct env reads:**
- `process.env.STRIPE_SECRET_KEY` (2 occurrences)

**Should use:**
- `config.stripe.secretKey` (already exists in config)

**Evidence:**
```23:23:server/services/receiptService.js
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });
```

```34:34:server/services/receiptService.js
  if (!process.env.STRIPE_SECRET_KEY) {
```

---

#### `server/services/pricingCatalog.js`
**Lines:** 24, 55-56  
**Direct env reads:**
- `process.env.STRIPE_SECRET_KEY`
- `process.env.STRIPE_PRICE_RESUME_ONE_TIME`
- `process.env.STRIPE_PRICE_RESUME_EXPERT`

**Should use:**
- `config.stripe.secretKey` (already exists)
- `config.stripe.priceResumeOneTime` (already exists)
- `config.stripe.priceResumeExpert` (already exists)

**Evidence:**
```24:26:server/services/pricingCatalog.js
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2025-09-30.clover'
});
```

```55:56:server/services/pricingCatalog.js
    process.env.STRIPE_PRICE_RESUME_ONE_TIME,
    process.env.STRIPE_PRICE_RESUME_EXPERT
```

---

#### `server/services/profileService.js`
**Lines:** 33-34  
**Direct env reads:**
- `process.env.SUPABASE_URL`
- `process.env.SUPABASE_ANON_KEY`

**Should use:**
- `config.supabase.url` (already exists)
- `config.supabase.anonKey` (already exists)

**Evidence:**
```33:34:server/services/profileService.js
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY,
```

---

#### `server/services/receiptArchive.js`
**Lines:** 90  
**Direct env reads:**
- `process.env.FEATURE_ARCHIVE_RECEIPTS_TABLE`

**Should use:**
- `config.features.archiveReceiptsTable` (already exists)

**Evidence:**
```90:90:server/services/receiptArchive.js
    const table = process.env.FEATURE_ARCHIVE_RECEIPTS_TABLE || 'payments';
```

---

### 3. Route Violations

#### `server/routes/auth.js`
**Lines:** 41-42  
**Direct env reads:**
- `process.env.NODE_ENV`
- `process.env.ALLOW_LEGACY_LOGIN`

**Should use:**
- `config.server.nodeEnv` (already exists)
- `config.auth.allowLegacyLogin` (MISSING)

**Evidence:**
```41:42:server/routes/auth.js
        const isProd = process.env.NODE_ENV === 'production';
        const allowLegacy = process.env.ALLOW_LEGACY_LOGIN === 'true';
```

---

#### `server/routes/submissions.js`
**Lines:** 173-174  
**Direct env reads:**
- `process.env.SUPABASE_URL`
- `process.env.SUPABASE_ANON_KEY`

**Should use:**
- `config.supabase.url` (already exists)
- `config.supabase.anonKey` (already exists)

**Evidence:**
```173:174:server/routes/submissions.js
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY,
```

---

### 4. UI Contract Violations

#### `server/ui_contract/presenters/_templatePresenter.js`
**Lines:** 42-43  
**Direct env reads:**
- `process.env.SUPABASE_URL`
- `process.env.SUPABASE_ANON_KEY`

**Should use:**
- `config.supabase.url` (already exists)
- `config.supabase.anonKey` (already exists)

**Evidence:**
```42:43:server/ui_contract/presenters/_templatePresenter.js
    supabaseUrl: process.env.SUPABASE_URL || '',
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
```

---

#### `server/ui_contract/presenters/helpers/buildPageMetadata.js`
**Lines:** 12  
**Direct env reads:**
- `process.env.ASSET_VERSION`

**Should use:**
- `ASSET_VERSION` (already exported from config module)

**Evidence:**
```12:13:server/ui_contract/presenters/helpers/buildPageMetadata.js
    process.env.ASSET_VERSION ||
    new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
```

---

### 5. Main Entry Point Violations

#### `server/zorvalon.js`
**Lines:** 11, 18, 48, 59, 70, 149, 154, 899-900, 939  
**Direct env reads:**
- `process.env.NODE_ENV` (multiple occurrences in error handlers - ACCEPTABLE)
- `process.env.TRUST_PROXY_HOPS`
- `process.env.CANONICAL_HOST`
- `process.env.SUPABASE_URL`
- `process.env.SUPABASE_ANON_KEY`

**Should use:**
- `config.server.trustProxyHops` (MISSING)
- `config.server.canonicalHost` (MISSING)
- `config.supabase.url` (already exists)
- `config.supabase.anonKey` (already exists)

**Evidence:**
```149:149:server/zorvalon.js
const TRUST_PROXY_HOPS = Number(process.env.TRUST_PROXY_HOPS || 2);
```

```154:157:server/zorvalon.js
if (process.env.CANONICAL_HOST) {
  const { isHttps } = require('./lib/authCookie');
  app.use((req, res, next) => {
    const targetHost = process.env.CANONICAL_HOST.trim().toLowerCase();
```

```899:900:server/zorvalon.js
      supabaseUrl: process.env.SUPABASE_URL,
      supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
```

---

### 6. Utility Violations

#### `server/utils/supabaseClient.js`
**Lines:** 10, 39-41, 45  
**Direct env reads:**
- `process.env.NODE_ENV` (for test mode - ACCEPTABLE)
- `process.env.SUPABASE_URL` (fallback)
- `process.env.SUPABASE_ANON_KEY` (fallback)
- `process.env.SUPABASE_SERVICE_ROLE_KEY` (fallback)
- `process.env.APP_VERSION` (fallback)

**Status:** This file **correctly tries config first** then falls back to env. This is acceptable defensive programming, but could be improved to only use config.

**Evidence:**
```39:41:server/utils/supabaseClient.js
  const url =  cfg?.supabase?.url              || process.env.SUPABASE_URL || '';
  const anon = cfg?.supabase?.anonKey          || process.env.SUPABASE_ANON_KEY || '';
  const svc =  cfg?.supabase?.serviceRoleKey   || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
```

---

## Missing Config Entries

The following environment variables are used directly but are **NOT** present in `server/config/index.js`:

### Critical Missing Entries

1. **JWT Secret** (used in authBridge.js)
   - `SUPABASE_JWT_SECRET` → Should be `config.jwt.secret`

2. **CSRF Configuration** (used in csrfLite.js)
   - `CSRF_COOKIE_NAME` → Should be `config.csrf.cookieName`
   - `CSRF_HEADER_NAME` → Should be `config.csrf.headerName`

3. **Cookie Configuration** (used in authCookie.js)
   - `AUTH_COOKIE_BASENAME` → Should use `config.auth.cookieName` (already exists)
   - `AUTH_COOKIE_ALIASES` → Should be `config.auth.cookieAliases`
   - `COOKIE_SAMESITE` → Should be `config.auth.cookieSameSite`
   - `COOKIE_SECURE` → Should be `config.auth.cookieSecure`
   - `AUTH_COOKIE_DOMAIN` → Should be `config.auth.cookieDomain`

4. **Rate Limiting Windows** (used in rateLimiter.js)
   - `RATE_LIMIT_WINDOW_MS` → Should be `config.rateLimit.windows.general.windowMs`
   - `RATE_LIMIT_MAX` → Should be `config.rateLimit.windows.general.max`
   - `LOGIN_WINDOW_MS` → Should be `config.rateLimit.windows.login.windowMs`
   - `LOGIN_MAX` → Should be `config.rateLimit.windows.login.max`
   - `SIGNUP_WINDOW_MS` → Should be `config.rateLimit.windows.signup.windowMs`
   - `SIGNUP_MAX` → Should be `config.rateLimit.windows.signup.max`
   - `LOGOUT_WINDOW_MS` → Should be `config.rateLimit.windows.logout.windowMs`
   - `LOGOUT_MAX` → Should be `config.rateLimit.windows.logout.max`
   - `COOKIE_SET_WINDOW_MS` → Should be `config.rateLimit.windows.cookieSet.windowMs`
   - `COOKIE_SET_MAX` → Should be `config.rateLimit.windows.cookieSet.max`
   - `SKIP_RATE_LIMIT_IN_DEV` → Should be `config.rateLimit.skipInDev`
   - `SKIP_RATE_LIMIT_IN_TEST` → Should be `config.rateLimit.skipInTest`

5. **Firewall Configuration** (used in ipFirewall.js)
   - `FIREWALL_FAIL_CLOSED` → Should be `config.firewall.failClosed`
   - `IP_BLOCKLIST` → Should be `config.firewall.staticBlocklist`

6. **Server Configuration** (used in zorvalon.js)
   - `TRUST_PROXY_HOPS` → Should be `config.server.trustProxyHops`
   - `CANONICAL_HOST` → Should be `config.server.canonicalHost`

7. **Auth Configuration** (used in routes/auth.js)
   - `ALLOW_LEGACY_LOGIN` → Should be `config.auth.allowLegacyLogin`

8. **Asset Version** (used in buildPageMetadata.js)
   - `ASSET_VERSION` → Already exported from config, but should be imported instead of reading env

---

## Legitimate Exceptions

### Test Files
**Files:** `server/test/setupEnv.mjs`, `server/__tests__/*.test.js`

**Reason:** Test files legitimately need to manipulate `process.env` to set up test scenarios. This is standard practice and acceptable.

**Evidence:**
```10:10:server/test/setupEnv.mjs
process.env.NODE_ENV = 'test';
```

---

### Scripts
**Files:** `server/scripts/maintenance-toggle.js`

**Reason:** CLI scripts that run independently need to load dotenv themselves since they don't go through the main app boot process. This is acceptable.

**Evidence:**
```27:27:server/scripts/maintenance-toggle.js
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
```

---

### Global Error Handlers
**Files:** `server/zorvalon.js` (lines 7-19)

**Reason:** Global error handlers run before config module loads. Direct `NODE_ENV` checks are necessary to prevent exit in test mode. This is acceptable.

**Evidence:**
```11:11:server/zorvalon.js
  if ((process.env.NODE_ENV || 'development') !== 'test') process.exit(1);
```

---

### Config File Itself
**File:** `server/config/index.js`

**Reason:** The config file must read `process.env` directly to build the config object. This is the intended pattern.

---

## Recommendations

### Priority 1: Add Missing Config Entries

1. **Add JWT secret to config:**
```javascript
jwt: {
  jwksUrl: process.env.SUPABASE_JWKS_URL,
  issuer: process.env.SUPABASE_ISSUER,
  expectedAud: process.env.SUPABASE_EXPECTED_AUD,
  clockSkewSec: int(process.env.JWT_CLOCK_SKEW_SEC, 30),
  secret: process.env.SUPABASE_JWT_SECRET  // ADD THIS
}
```

2. **Add CSRF section to config:**
```javascript
csrf: {
  cookieName: process.env.CSRF_COOKIE_NAME || 'csrf_token',
  headerName: (process.env.CSRF_HEADER_NAME || 'x-csrf-token').toLowerCase(),
  secret: process.env.CSRF_SECRET  // Already exists but not in structured section
}
```

3. **Expand auth section:**
```javascript
auth: {
  cookieName: process.env.AUTH_COOKIE_NAME || 'sb_session',
  cookieAliases: csv(process.env.AUTH_COOKIE_ALIASES),
  cookieDomain: process.env.AUTH_COOKIE_DOMAIN || undefined,
  cookieSameSite: (process.env.COOKIE_SAMESITE || 'Lax').toLowerCase() === 'strict' ? 'Strict' : 'Lax',
  cookieSecure: bool(process.env.COOKIE_SECURE, undefined),  // undefined = auto-detect
  allowLegacyLogin: bool(process.env.ALLOW_LEGACY_LOGIN, false),
  debug: bool(process.env.AUTH_DEBUG, false)
}
```

4. **Expand rateLimit section:**
```javascript
rateLimit: {
  enabled: rateLimitEnabled,
  skipInDev: skipRateLimitInDev,
  skipInTest: bool(process.env.SKIP_RATE_LIMIT_IN_TEST, false),
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
  primary: 'cloudflare',
  secondary: (localLimitersEnabled && appLimitersEnabled) ? 'redis-origin' : undefined
}
```

5. **Add firewall section:**
```javascript
firewall: {
  failClosed: bool(process.env.FIREWALL_FAIL_CLOSED, true),
  staticBlocklist: csv(process.env.IP_BLOCKLIST)
}
```

6. **Expand server section:**
```javascript
server: {
  port: int(process.env.PORT, 3000),
  nodeEnv: process.env.NODE_ENV || 'development',
  host: process.env.HOST || '0.0.0.0',
  trustProxy: true,
  trustProxyHops: int(process.env.TRUST_PROXY_HOPS, 2),  // ADD THIS
  canonicalHost: process.env.CANONICAL_HOST || undefined,  // ADD THIS
  requestIdHeader: 'x-request-id'
}
```

### Priority 2: Refactor Files to Use Config

1. **Middleware files** - Replace all `process.env` reads with `config.*` references
2. **Service files** - Replace all `process.env` reads with `config.*` references
3. **Route files** - Replace all `process.env` reads with `config.*` references
4. **UI contract files** - Replace all `process.env` reads with `config.*` references
5. **Main entry point** - Replace all `process.env` reads (except error handlers) with `config.*` references

### Priority 3: Remove Fallback Patterns

Files like `server/utils/supabaseClient.js` have defensive fallbacks to `process.env`. Once config is complete, these fallbacks should be removed to enforce single source of truth.

---

## Action Items

### Immediate (High Priority)

1. ✅ **Add missing config entries** to `server/config/index.js`:
   - JWT secret
   - CSRF configuration
   - Expanded auth configuration
   - Rate limit windows structure
   - Firewall configuration
   - Server trust proxy and canonical host

2. ✅ **Update middleware files** to use config:
   - `server/middleware/authBridge.js`
   - `server/lib/authCookie.js`
   - `server/middleware/csrfLite.js`
   - `server/middleware/rateLimiter.js`
   - `server/middleware/ipFirewall.js`

3. ✅ **Update service files** to use config:
   - `server/services/receiptService.js`
   - `server/services/pricingCatalog.js`
   - `server/services/profileService.js`
   - `server/services/receiptArchive.js`

4. ✅ **Update route files** to use config:
   - `server/routes/auth.js`
   - `server/routes/submissions.js`

5. ✅ **Update UI contract files** to use config:
   - `server/ui_contract/presenters/_templatePresenter.js`
   - `server/ui_contract/presenters/helpers/buildPageMetadata.js`

6. ✅ **Update main entry point** to use config:
   - `server/zorvalon.js` (except error handlers)

### Medium Priority

7. **Remove defensive fallbacks** from `server/utils/supabaseClient.js` once config is complete

8. **Add validation** for new config entries in `validateConfig()` function

9. **Update KNOWN_ENV set** in config file to include all new env vars

### Low Priority

10. **Add JSDoc types** for config object to improve IDE autocomplete

11. **Create migration guide** for developers on how to add new env vars (always add to config first)

---

## Compliance Checklist

After implementing the above changes, verify:

- [ ] All middleware files import and use `config` instead of `process.env`
- [ ] All service files import and use `config` instead of `process.env`
- [ ] All route files import and use `config` instead of `process.env`
- [ ] All UI contract files import and use `config` instead of `process.env`
- [ ] Main entry point uses `config` (except error handlers)
- [ ] Config file includes all environment variables used by the app
- [ ] No direct `process.env` reads in application code (only in config file, tests, and scripts)
- [ ] All new config entries are validated in `validateConfig()`
- [ ] KNOWN_ENV set includes all env vars
- [ ] Tests still pass after refactoring

---

## Conclusion

The codebase has a solid foundation with `server/config/index.js` as the intended source of truth, but **significant work is needed** to achieve full compliance. Approximately **30-40% of files** still directly access `process.env`, which undermines the centralized config pattern.

**Key Benefits of Full Compliance:**
1. **Single source of truth** - All env vars defined in one place
2. **Type safety** - Validation and transformation in config
3. **Performance** - No redundant env reads
4. **Maintainability** - Changes only require updating config file
5. **Security** - Consistent handling of sensitive values

**Estimated Effort:**
- Adding missing config entries: **2-3 hours**
- Refactoring files to use config: **4-6 hours**
- Testing and validation: **2-3 hours**
- **Total: 8-12 hours**

This refactoring should be done incrementally, one module at a time, with thorough testing after each change.

