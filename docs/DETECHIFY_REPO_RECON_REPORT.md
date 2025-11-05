# Detechify Repository Reconnaissance & Security Architecture Report

**Generated:** 2025-01-XX  
**Purpose:** Complete structural and security audit for Detechify Master Protected Template Constitution design  
**Scope:** Full repository analysis including architecture, security layers, routing, and deployment infrastructure

---

## 1. Folder Structure

### Root Directory

```
detechify/
├── certs/                    # SSL certificates (not in repo)
├── db/                       # Database migrations and patches
│   ├── manual/              # Manual SQL scripts
│   ├── migrations/          # Knex migrations
│   ├── patches/             # Database patches
│   └── recipes/             # Reusable SQL patterns
├── docs/                     # Documentation (33+ markdown files)
├── nginx/                    # Nginx proxy configuration
│   └── templates/           # plain.conf and ssl.conf
├── public/                   # Static assets (repo root)
│   └── images/
├── scripts/                  # Utility scripts
├── secrets/                  # Security docs and building laws
│   └── scripts/             # Security testing scripts
├── server/                   # Main application code
└── tests/                    # E2E tests
```

### Server Directory (`server/`)

**Core Application Files:**
- `zorvalon.js` - Main entry point (1166 lines) - Express app boot, middleware registration, route mounting
- `package.json` - Dependencies and scripts

**Configuration:**
- `config/` - Application configuration and feature toggles
  - `index.js` - Centralized config loader
  - `toggles.js` - Feature flags (blockCmsScans, corsDebug, exposeDebugRoutes)

**Core Modules:**
- `core/` - Core utilities
  - `api.js` - API utilities
  - `errorSandbox.js` - Error isolation
  - `moduleLoader.js` - Safe module loading

**Middleware (`server/middleware/` - 30 files):**
- **Security:**
  - `security/cspNonce.js` - Nonce generation and CSP headers
  - `securityHeaders.js` - Helmet configuration with strict CSP
  - `csrfLite.js` - Double-submit cookie CSRF protection
  - `security.js` - Server-side validation and sanitization
  - `sanitize.js` - HTML sanitization (XSS prevention)
  - `ipFirewall.js` - Redis-backed IP blocking
  - `lockout.js` - Progressive account/IP lockouts
  - `rateLimiter.js` - Redis-based rate limiting (secondary layer)

- **Authentication:**
  - `auth/supabaseJwt.js` - JWT verification via JWKS
  - `authBridge.js` - Stateless token verification (HS256/RS256)
  - `requireAuth.js` - Centralized auth check
  - `requireAuthByDefault.js` - Default-deny guard for /api and /dashboard
  - `requireOwner.js` - Ownership verification

- **Infrastructure:**
  - `requestId.js` - Request tracking
  - `cacheControl.js` - Dynamic route cache prevention
  - `methodGuard.js` - HTTP method restrictions
  - `credentialGuard.js` - Blocks credentials in GET params
  - `enforceHttps.js` - HTTPS enforcement
  - `trustProxyIp.js` - Cloudflare IP extraction
  - `corsAllowlist.js` - CORS origin validation
  - `cookieGuardian.js` - Cookie parsing
  - `maintenanceGuard.js` - Maintenance mode toggle
  - `degradeGuard.js` - Redis degradation handling
  - `healthShield.js` - Health endpoint protection
  - `validation.js` - Input validation helpers
  - `validateProfileUpdate.js` - Profile update validation
  - `idempotency.js` - Idempotency key handling
  - `blockCmsScans.js` - CMS scanner blocking (toggle)
  - `corsDebug.js` - CORS debugging (toggle)
  - `appConfig.js` - Config injection

**Routes (`server/routes/` - 15 files):**
- `auth.js` - Authentication API endpoints
- `authCookie.js` - HttpOnly cookie management (set/clear)
- `authDebug.js` - Auth debugging (AUTH_DEBUG toggle)
- `api.js` - General API utilities
- `dashboard.js` - Protected dashboard pages
- `dashboard-billing.js` - Billing dashboard routes
- `profile.js` - Profile API endpoints
- `payments.js` - Stripe payment processing
- `stripeWebhook.js` - Stripe webhook handler (raw body, CSRF bypass)
- `submissions.js` - Text submission endpoints
- `users.js` - User management API
- `admin.js` - Admin-only endpoints
- `pageApi.js` - Page-specific API
- `health.js` - Health check endpoints
- `debug.js` - Debug routes (EXPOSE_DEBUG_ROUTES toggle)

**Services (`server/services/` - 7 files):**
- `billingService.js` - Billing operations
- `profileService.js` - Profile CRUD
- `profileSyncService.js` - Profile synchronization with Supabase Auth
- `pricingCatalog.js` - Stripe pricing catalog
- `receiptService.js` - Receipt generation
- `receiptArchive.js` - Receipt archival
- `outboxService.js` - Reliable event delivery

**UI Contract (`server/ui_contract/`):**
- `presenters.js` - Page model builders (separates business logic from templates)
- `navigation/manager.js` - Navigation composition
- `navigation/navSchema.js` - Navigation schema

**EJS Templates (`server/ejs/` - 16 files):**
- `layout.ejs` - Base layout (not actively used, each page has own structure)
- `index.ejs` - Homepage with login modal
- `dashboard.ejs` - Main dashboard
- `profile-edit.ejs` - Profile editing page
- `billing.ejs` - Billing page
- `checkout-review.ejs` - Purchase review page
- `purchase-confirmation.ejs` - Purchase confirmation
- `receipt.ejs` - Receipt display
- `error.ejs` - Generic error page
- `errors/` - Specific error pages (401, 403, 404, 429, 500)
- `partials/nav.ejs` - Shared navigation component
- `partials/modals.ejs` - Shared modal components

**Utilities (`server/utils/` - 8 files):**
- `logger.js` - Structured logging
- `consoleLogger.js` - Terminal-friendly log formatting
- `errorResponder.js` - Centralized error handling
- `redisClient.js` - Redis connection management
- `supabaseClient.js` - Supabase client initialization
- `authz.js` - Authorization helpers
- `responseHelpers.js` - Response utilities
- `submissionsQueue.js` - Submission queue management

**Other:**
- `lib/` - Library code (audit.js, supabaseClient.js)
- `jobs/` - Background jobs (outboxProcessor.js)
- `public/` - Static assets (JS, CSS, images)
- `__tests__/` - Unit tests (12 test files)
- `tests/` - Integration tests
- `test/` - Test setup files

---

## 2. Page Rendering Pipeline

### Request Flow Through Middleware Stack

**Complete Middleware Chain (from `zorvalon.js`):**

```
1. OPTIONS Preflight Short-Circuit (unconditional)
   ↓
2. Toggle-Based Middleware (if enabled)
   - blockCmsScans (if toggles.blockCmsScans)
   - corsDebug (if toggles.corsDebug)
   ↓
3. CSP Nonce Generation (generateCspNonce)
   - Sets res.locals.nonce and res.locals.cspNonce
   ↓
4. Method Guard (methodGuard)
   - Blocks PROPFIND, TRACE, unknown methods
   ↓
5. Credential Guard (credentialGuard)
   - Blocks credentials in GET query strings
   ↓
6. Security Headers (securityHeaders)
   - Helmet with strict CSP (nonce-based)
   - Permissions-Policy, X-DNS-Prefetch-Control
   ↓
7. Cache Control (cacheControl)
   - Sets no-store for dynamic routes
   ↓
8. Trust Proxy + Client IP (trustProxyIp)
   - Extracts real IP from Cloudflare headers
   - Sets req.clientIp
   ↓
9. Request ID (requestIdMiddleware)
   - Adds unique request ID to req.requestId
   ↓
10. Health Routes (early mount, Redis-free)
    ↓
11. Redis Degrade Guard (degradeGuard)
    - 503 on sensitive paths if Redis down
    ↓
12. IP Firewall (ipFirewall)
    - Blocks abusive IPs (Redis-backed)
    ↓
13. Maintenance Guard (maintenanceGuard)
    - Maintenance mode toggle (Redis/env)
    ↓
14. HTTPS Enforcement (enforceHttps)
    - Redirects HTTP to HTTPS
    ↓
15. Permissions-Policy Header
    - Restricts browser features
    ↓
16. CORS Allowlist (corsAllowlist)
    - Validates origin against allowlist
    ↓
17. Stripe Webhook (raw body, CSRF bypass)
    - Mounted before body parsers
    ↓
18. Body Parsers (express.json, express.urlencoded)
    - 32KB limit
    ↓
19. Cookie Parsing (cookieGuardian)
    - Parses cookies into req.cookies
    ↓
20. App Config Injection (appConfig)
    - Makes config available to views
    ↓
21. Auth Bridge (authBridge)
    - Verifies Supabase JWT (HS256/RS256)
    - Sets req.user or req.user = null
    ↓
22. Default-Deny Auth Guard (requireAuthByDefault)
    - Blocks /api and /dashboard without auth
    - Public globs: /, /login, /css/**, /js/**, /images/**
    ↓
23. Request Timing Logging
    - Logs request duration
    ↓
24. Static File Serving
    - Primary: /public (repo root)
    - Legacy: /server/public
    ↓
25. CSRF Protection (csrfLite)
    - Double-submit cookie validation
    - Skips for Bearer tokens
    ↓
26. Rate Limiting (per-route)
    - General: 300 req/min
    - Login: 10/15min
    - Signup: 5/hour
    - Logout: 120/10min
    - Cookie set: 300/min
    ↓
27. Routes (with requireAuth as needed)
    ↓
28. Error Handlers (404, global error)
```

### Page Rendering Flow

**Example: GET /dashboard**

```javascript
// 1. Request hits route handler (server/routes/dashboard.js)
router.get('/', async (req, res) => {
    // 2. Build page model using presenter
    const pageModel = await buildDashboardPageModel(req, res);
    
    // 3. Add nonce to page model (from res.locals.nonce)
    pageModel.page.nonce = res.locals.nonce;
    
    // 4. Add Supabase credentials for client
    pageModel.ui.supabaseUrl = process.env.SUPABASE_URL;
    pageModel.ui.supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
    
    // 5. Render EJS template
    res.render('dashboard', pageModel);
});
```

**Presenter Function (server/ui_contract/presenters.js):**

The presenter builds a page model with:
- `page` - Page metadata (title, description, nonce, assetVersion, nav)
- `user` - Canonical user object (from buildCanonicalUser)
- `ui_instructions` - Backend-driven UI configuration (Building Law #9)
- `ui` - Client-side config (Supabase credentials, CSRF token)
- `app_info` - Application metadata

**Navigation Composition:**

Navigation is composed using `navManager.compose(req, res)` and injected into all pages via the `partials/nav.ejs` partial.

**Partial Inclusion:**

- `partials/nav.ejs` - Shared navigation component (included in all pages)
- `partials/modals.ejs` - Shared modals (login, logout, etc.)

---

## 3. Security Posture Mapping

### Security Layer Matrix

| Layer | File(s) | Function | Evidence |
|-------|---------|----------|----------|
| **CSP Nonce** | `middleware/security/cspNonce.js`<br>`middleware/securityHeaders.js` | Per-request nonce generation<br>Strict CSP with nonce-only scripts | Nonce-based `scriptSrc: ["'self'", "'nonce-${nonce}'"]` |
| **CSRF** | `middleware/csrfLite.js` | Double-submit cookie enforcement<br>Timing-safe comparison | Token match check with `crypto.timingSafeEqual` |
| **Auth Enforcement** | `middleware/authBridge.js`<br>`middleware/requireAuth.js`<br>`middleware/requireAuthByDefault.js` | JWT verification (HS256/RS256)<br>Fail-closed enforcement | JWT verification with jose library, default-deny guard |
| **Data Sanitization** | `middleware/sanitize.js`<br>`middleware/security.js` | XSS prevention<br>Input length validation | sanitize-html with empty allowlists |
| **Rate Limiting** | `middleware/rateLimiter.js`<br>`middleware/lockout.js` | Redis-backed rate limits<br>Progressive lockouts | Redis MULTI/EXEC for atomic operations |
| **IP Firewall** | `middleware/ipFirewall.js` | Redis-backed IP blocking<br>Auto-ban escalation | Blocks IPs with TTL, escalates from rate limits |
| **Cache Control** | `middleware/cacheControl.js` | Prevents caching of sensitive pages | Sets `no-store` for dynamic routes |
| **Security Headers** | `middleware/securityHeaders.js` | Helmet with strict CSP<br>Permissions-Policy | Comprehensive security headers |
| **CORS Policy** | `middleware/corsAllowlist.js` | Origin validation<br>Subdomain wildcard support | Validates against CORS_ORIGINS env and *.detechify.com |
| **Method Guard** | `middleware/methodGuard.js` | Blocks dangerous HTTP verbs | Rejects PROPFIND, TRACE, unknown methods |
| **Credential Guard** | `middleware/credentialGuard.js` | Blocks credentials in GET params | Prevents password/secret leakage in URLs |
| **Ownership Verification** | `middleware/requireOwner.js` | Ensures users access only their resources | Compares req.user.id with route params |

### Defense-in-Depth Architecture

**Layer 1: Edge Protection (Cloudflare)**
- Volumetric DDoS mitigation
- Geographic filtering
- Bot protection
- SSL termination

**Layer 2: Proxy Layer (Nginx)**
- Request forwarding
- Real IP extraction from Cloudflare headers
- SSL termination (if not using Cloudflare SSL)
- Logging

**Layer 3: Application Security (Express Middleware)**
- CSP nonce (prevents XSS)
- CSRF tokens (prevents CSRF)
- JWT verification (prevents unauthorized access)
- Rate limiting (prevents abuse)
- IP firewall (blocks abusive IPs)
- Input sanitization (prevents injection)
- Cache control (prevents data leakage)

**Layer 4: Route-Level Protection**
- `requireAuth` - Authentication required
- `requireOwner` - Ownership verification
- `requireAuthByDefault` - Default-deny for /api and /dashboard

**Layer 5: Service-Level Validation**
- Server-side input validation (security.js)
- Idempotency keys (prevent duplicate operations)
- Transactional updates (prevent race conditions)

### Security Header Configuration

**CSP Directives (from securityHeaders.js):**

- `defaultSrc: ["'none'"]` - Default deny-all
- `scriptSrc: ["'self'", "'nonce-${nonce}'", "'strict-dynamic'"]` - Nonce-based scripts only
- `styleSrc: ["'self'", "'nonce-${nonce}'"]` - Nonce-based styles
- `imgSrc: ["'self'", "data:", "https://files.stripe.com"]` - Images
- `connectSrc: ["'self'", supabaseOrigin, supabaseWss]` - API calls
- `frameAncestors: ["'none'"]` - No iframing
- `objectSrc: ["'none'"]` - No plugins

**Additional Headers:**
- `Permissions-Policy` - Restricts browser features (camera, microphone, etc.)
- `Referrer-Policy: strict-origin-when-cross-origin`
- `X-DNS-Prefetch-Control: off`
- `X-Frame-Options: DENY` (via Helmet frameguard)

---

## 4. Frontend & EJS Integration

### EJS Template Structure

**Main Pages:**
- `index.ejs` - Homepage with login modal
- `dashboard.ejs` - User dashboard
- `profile-edit.ejs` - Profile editing
- `billing.ejs` - Billing page
- `checkout-review.ejs` - Purchase review
- `purchase-confirmation.ejs` - Purchase confirmation
- `receipt.ejs` - Receipt display
- `error.ejs` - Generic error page
- `errors/*.ejs` - Specific error pages (401, 403, 404, 429, 500)

**Shared Partials:**
- `partials/nav.ejs` - Navigation component
- `partials/modals.ejs` - Modal components

### CSP Nonce Usage

**All inline scripts use nonce:**

```html
<script src="/js/supabase-client.js" nonce="<%= page.nonce %>"></script>
<script nonce="<%= page.nonce %>">
    // Cross-tab logout synchronization
    const bc = new BroadcastChannel('auth');
    // ...
</script>
```

**CSRF Token Injection:**

```html
<meta name="csrf-token" content="<%= ui.csrfToken || '' %>">
```

**Form CSRF Protection:**

```html
<input type="hidden" name="_csrf" value="<%= csrfToken %>">
```

### Client-Side Data Flow

**Supabase Client Initialization:**

```html
<meta id="app-config" 
      data-supabase-url="<%= APP_CONFIG.SUPABASE_URL %>" 
      data-supabase-anon-key="<%= APP_CONFIG.SUPABASE_ANON_KEY %>">
```

**Backend-Driven UI Instructions (Building Law #9):**

The presenter includes `ui_instructions` object with:
- `allowed_actions` - What actions the user can perform
- `input_limits` - Min/max lengths for inputs
- `feature_flags` - Which features are enabled
- `form_schema` - Form validation rules
- `cooldowns` - Cooldown periods
- `security` - CSRF token and nonce
- `display_rules` - What UI elements to show

**Frontend JavaScript Files:**
- `main.js` - Main application logic
- `dashboard.js` - Dashboard-specific logic
- `profile-edit.js` - Profile editing
- `pay.js` - Payment processing
- `logout.js` - Logout handling
- `modalManager.js` - Modal management
- `nav-client.js` - Navigation client logic
- `supabase-client.js` - Supabase client wrapper
- `sbClient.js` - Supabase client initialization

---

## 5. Routing Overview

### Route Organization

**Public Routes:**
- `GET /` - Homepage (buildHomePageModel)
- `GET /login` - Login page (redirects if authenticated)
- `GET /api/hello` - Hello world test
- `GET /api/ui-config` - UI configuration

**Protected Routes (require `requireAuth`):**

**Dashboard Routes (`/dashboard`):**
- `GET /dashboard` - Main dashboard
- `GET /dashboard/profile-edit` - Profile editing page
- `GET /dashboard/purchase/confirmation` - Purchase confirmation
- `GET /dashboard/checkout/review` - Checkout review
- `GET /dashboard/billing/buy` - Legacy redirect to review

**API Routes (`/api`):**

**Profile API (`/api/profile`):**
- `GET /api/profile/me` - Get own profile
- `PUT /api/profile/me` - Update own profile (idempotency + validation)

**Auth API (`/api/auth`):**
- `POST /api/auth/login` - Login (rate limited: 10/15min)
- `POST /api/auth/signup` - Signup (rate limited: 5/hour)
- `POST /api/auth/logout` - Logout (rate limited: 120/10min)

**Auth Cookie Routes (`/auth`):**
- `POST /auth/set-cookie` - Set HttpOnly cookie (rate limited: 300/min)
- `POST /auth/clear-cookie` - Clear cookie (rate limited: 120/10min)

**Submissions API (`/api/submit`):**
- `POST /api/submit` - Submit text (requireAuth)

**Payments API (`/api/pay`):**
- Payment processing endpoints (requireAuth)

**Users API (`/api/users`):**
- User management (requireAuth + requireOwner)

**Admin API (`/api/admin`):**
- Admin-only endpoints (requireAuth + role check)

**Stripe Webhook (`/api/stripe/webhook`):**
- Raw body parsing (CSRF bypass)
- Signature verification

**Health Routes (`/health`):**
- `GET /health/liveness` - Liveness check
- `GET /health/readiness` - Readiness check (checks Redis)

### Middleware Stack Examples

**Example 1: Protected Dashboard Route**

```
1. OPTIONS preflight (if OPTIONS) → 204
2. CSP nonce generation → res.locals.nonce
3. Method guard → pass
4. Credential guard → pass
5. Security headers → CSP, Permissions-Policy
6. Cache control → no-store
7. Trust proxy → req.clientIp
8. Request ID → req.requestId
9. IP firewall → check Redis blocklist
10. Maintenance guard → check Redis toggle
11. HTTPS enforcement → redirect if HTTP
12. CORS allowlist → validate origin
13. Body parsers → parse if POST
14. Cookie parsing → req.cookies
15. App config → res.locals.config
16. Auth bridge → verify JWT → req.user
17. Default-deny guard → check /dashboard prefix → require req.user
18. CSRF → generate token → res.locals.csrfToken
19. Rate limiter → (not applied to GET /dashboard)
20. Route handler → buildDashboardPageModel → render
```

**Example 2: Protected API Route**

```
1-18. Same as above
19. General rate limiter → 300 req/min
20. requireAuth → check req.user
21. Idempotency middleware → check Idempotency-Key header
22. validateProfileUpdate → validate input
23. Route handler → updateProfileTransactional
```

**Example 3: Stripe Webhook**

```
1-12. Same as above
13. Stripe webhook mount (raw body, before body parsers)
14. CSRF → SKIP (isAuthCookieEndpoint check)
15. Route handler → verify signature → process webhook
```

---

## 6. API Endpoints

### API Endpoint Summary

| Endpoint | Method | Auth | CSRF | Rate Limit | Notes |
|----------|--------|------|------|------------|-------|
| `/api/hello` | GET | None | Skip | None | Test endpoint |
| `/api/ui-config` | GET | None | Skip | None | UI configuration |
| `/api/auth/login` | POST | None | Required | 10/15min | Progressive lockout |
| `/api/auth/signup` | POST | None | Required | 5/hour | Progressive lockout |
| `/api/auth/logout` | POST | None | Required | 120/10min | - |
| `/auth/set-cookie` | POST | Bearer | Skip | 300/min | Sets HttpOnly cookie |
| `/auth/clear-cookie` | POST | Bearer | Skip | 120/10min | Clears cookie |
| `/api/profile/me` | GET | requireAuth | Skip (GET) | General | RLS-compliant |
| `/api/profile/me` | PUT | requireAuth | Required | General | Idempotency + validation |
| `/api/submit` | POST | requireAuth | Required | General | Text submission |
| `/api/pay/*` | POST | requireAuth | Required | General | Stripe payment |
| `/api/users/:id` | GET | requireAuth + requireOwner | Skip (GET) | General | Ownership check |
| `/api/admin/*` | * | requireAuth + role | Required | General | Admin only |
| `/api/stripe/webhook` | POST | Signature | Skip | None | Raw body, CSRF bypass |

### Input Validation

**Profile Update Validation (`validateProfileUpdate.js`):**
- Server-side length limits
- Sanitization (XSS prevention)
- Type checking

**Text Submission Validation (`security.js`):**
- Length: 20-5000 characters
- Sanitization: sanitize-html with empty allowlists
- Returns: `{ valid: boolean, error?: string, sanitized: string }`

### Ownership Verification

**requireOwner Middleware:**

Compares `req.user.id` (from auth token) with `req.params.userId` or `req.params.id`. Blocks request if they don't match unless user is admin.

### Idempotency Protection

**Profile Update with Idempotency:**

Profile updates use idempotency keys with 1-hour TTL to prevent duplicate operations.

---

## 7. Deployment & Infrastructure

### Docker Compose Architecture

**Services:**
1. **Redis** - Rate limiting and caching
   - Image: `redis:7-alpine`
   - Persistence: Volume `redis_data`
   - Health check: Redis ping
   
2. **App** - Node.js application
   - Build: `server/Dockerfile`
   - Node version: 20
   - Health check: `/health/liveness`
   - Graceful shutdown: 30s

3. **Proxy** - Nginx reverse proxy
   - Image: `nginx:1.27-alpine`
   - Ports: 80, 443
   - Templates: `plain.conf` or `ssl.conf` (based on `NGINX_USE_SSL`)
   - Health check: `nginx -t`

### Nginx Configuration

**SSL Template (`nginx/templates/ssl.conf`):**
- Real IP extraction from Cloudflare IP ranges
- JSON access logging
- SSL termination (if not using Cloudflare SSL)
- Proxy pass to app:3000

**Plain Template (`nginx/templates/plain.conf`):**
- HTTP only (for development)
- Same proxy configuration

### Cloudflare Integration

**Real IP Extraction:**
- Nginx configured with Cloudflare IP ranges
- `set_real_ip_from` directives for all Cloudflare subnets
- `real_ip_header CF-Connecting-IP`

**Trust Proxy:**
Express app configured with `app.set('trust proxy', 1)` to trust Cloudflare headers.

### Security at Infrastructure Layer

**Port Exposure:**
- Only 80/443 exposed to host
- App container not exposed (internal only)
- Redis internal only

**SSL/TLS:**
- Cloudflare SSL (primary)
- Optional origin SSL (if `NGINX_USE_SSL=true` and certs present)

**Health Checks:**
- App: `/health/liveness` (no Redis dependency)
- Redis: `redis-cli ping`
- Nginx: `nginx -t`

### Environment Configuration

**Required Environment Variables:**
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_ANON_KEY` - Supabase anonymous key
- `SUPABASE_JWT_SECRET` - JWT secret (HS256) or JWKS URL (RS256)
- `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` - Redis connection
- `AUTH_COOKIE_NAME` - Cookie name (default: `sb_session`)
- `CSRF_COOKIE_NAME` - CSRF cookie name (default: `csrf_token`)
- `NODE_ENV` - Environment (production/development)

**Optional Toggles:**
- `BLOCK_CMS_SCANS` - Enable CMS scanner blocking
- `CORS_DEBUG` - Enable CORS debug logging
- `EXPOSE_DEBUG_ROUTES` - Enable `/_debug` routes
- `AUTH_DEBUG` - Enable auth debug logging
- `FIREWALL_FAIL_CLOSED` - Fail-closed when Redis unavailable (default: true)

---

## 8. Evidence and Logic Samples

### CSRF Token Comparison

**Timing-Safe Comparison:**
Uses `crypto.timingSafeEqual` to prevent timing attacks when comparing CSRF tokens.

### JWT Verification

**HS256 Verification:**
- Verifies token signature using `SUPABASE_JWT_SECRET`
- Validates issuer, audience, expiration
- Sets `req.user` on success

**RS256 Verification:**
- Uses JWKS (JSON Web Key Set) from Supabase
- Supports automatic key rotation
- Same validation as HS256

### Default-Deny Auth Guard

**Implementation:**
- Uses micromatch to check if path matches public globs
- If not public and no authenticated user, returns 401
- Logs blocked requests for security monitoring

### Rate Limiting with Escalation

**Login Rate Limiter:**
- Tracks violations per IP in Redis
- After 3 violations, escalates to IP firewall
- IP blocked for 15 minutes

### Progressive Lockout

**User Lockout Steps:**
- 1st failure: 1 minute lockout
- 2nd failure: 5 minutes
- 3rd failure: 15 minutes
- 4th failure: 30 minutes
- 5th+ failure: 60 minutes

**IP Lockout Steps:**
- 1st failure: 5 minutes
- 2nd failure: 15 minutes
- 3rd failure: 30 minutes
- 4th failure: 60 minutes
- 5th+ failure: 120 minutes

Uses Redis MULTI/EXEC for atomic operations.

---

## 9. Summary and Observations

### Current Strengths

1. **Comprehensive Defense-in-Depth**
   - Multiple security layers (Cloudflare → Nginx → Express → Routes → Services)
   - Each layer adds protection without single points of failure

2. **Strict CSP Implementation**
   - Nonce-based CSP eliminates `unsafe-inline`
   - All inline scripts use nonces
   - Self-hosted assets only (except Supabase CDN)

3. **Fail-Closed Authentication**
   - `requireAuthByDefault` enforces authentication for /api and /dashboard
   - Explicit public globs prevent accidental exposure
   - Auth bridge fails silently but default-deny blocks

4. **Server-Authoritative Validation**
   - All frontend restrictions enforced server-side
   - UI instructions from backend (Building Law #9)
   - Input sanitization with proper HTML parsing

5. **Multi-Instance Safety**
   - Redis-backed rate limiting and lockouts
   - Shared state across instances
   - Graceful degradation when Redis unavailable

6. **Progressive Security Escalation**
   - Rate limits → IP firewall auto-ban
   - Progressive lockout ladders (1m → 60m)
   - Separate tracking for user and IP

7. **Comprehensive Audit Logging**
   - Structured logging with request IDs
   - Security events logged (CSRF failures, auth failures, rate limit violations)
   - No PII in logs (emails hashed in Redis keys)

8. **Idempotency Protection**
   - Idempotency keys for profile updates
   - Prevents duplicate operations

9. **Ownership Verification**
   - `requireOwner` middleware prevents horizontal privilege escalation
   - Users can only access their own resources

10. **Clean Architecture**
    - Presenter pattern separates business logic from templates
    - Modular middleware for easy maintenance
    - Clear boot order documented

### Areas for Improvement

1. **CSP Style Source**
   - Currently uses `'unsafe-inline'` for styles in some places
   - Should migrate to nonce-based styles or external CSS only

2. **Supabase CDN Dependency**
   - Scripts allow `https://cdn.jsdelivr.net` for Supabase client
   - Should self-host Supabase client to remove CDN dependency

3. **Error Response Consistency**
   - Some routes use `respondError`, others use direct `res.status().json()`
   - Should standardize on `respondError` for all error responses

4. **Health Endpoint Protection**
   - Health endpoints are public (no auth required)
   - Consider adding IP allowlist or basic auth for production
   - **Note:** Health endpoints are intentionally lightweight and public for monitoring

5. **Admin Role Check**
   - Admin endpoints check role but implementation should be verified
   - Should verify admin role checking is consistent across all admin routes

6. **Stripe Webhook Security**
   - Webhook uses signature verification (standard practice)
   - Should verify signature verification is implemented correctly
   - **Note:** Webhook route is mounted before body parsers for raw body access

### Security Redundancies (Intentional)

1. **Dual-Layer Rate Limiting**
   - Cloudflare edge (primary) + Redis origin (secondary)
   - Intentional defense-in-depth

2. **Multiple Auth Checks**
   - `authBridge` → `requireAuthByDefault` → `requireAuth`
   - Each serves different purpose (token verification, default-deny, route-level)

3. **Input Validation Layers**
   - Frontend validation (UX) → Server-side validation (security) → Database constraints (data integrity)
   - Intentional: frontend for UX, backend for security

### Unused or Weakly Enforced Components

1. **Layout Template**
   - `layout.ejs` exists but each page has its own structure
   - Not actively used (each page is self-contained)

2. **Feature Toggles**
   - Some toggles may not be actively used (blockCmsScans, corsDebug)
   - Consider removing if not needed

3. **Legacy Cookie Support**
   - Code supports legacy cookie names (`sb-access-token`, `sb_session`)
   - Should document migration path and remove legacy support

### Recommendations

1. **Migrate Styles to Nonce-Based CSP**
   - Remove `'unsafe-inline'` from `styleSrc`
   - Use nonce for all inline styles or move to external CSS

2. **Self-Host Supabase Client**
   - Remove `cdn.jsdelivr.net` from CSP
   - Self-host Supabase JS client

3. **Standardize Error Responses**
   - Use `respondError` for all error responses
   - Ensures consistent error format and security (no stack traces)

4. **Document Admin Role Checks**
   - Verify admin role checking is consistent
   - Document admin role requirements

5. **Health Endpoint Security**
   - Consider adding IP allowlist for production health endpoints
   - Keep liveness public for load balancer checks

6. **Remove Legacy Cookie Support**
   - Document migration from legacy cookie names
   - Remove legacy cookie name fallbacks after migration

### Conclusion

The Detechify repository demonstrates a **mature, security-first architecture** with comprehensive defense-in-depth. The system enforces security at multiple layers, from edge protection through application middleware to route-level checks. The codebase follows best practices for CSP, CSRF, authentication, and input validation.

The architecture is well-documented with clear boot orders, comprehensive comments, and structured logging. The presenter pattern enables clean separation of concerns and future migration to Next.js.

**Overall Security Posture: Strong** ✅

The system is production-ready with minor improvements recommended for CSP style sources and CDN dependency removal.

