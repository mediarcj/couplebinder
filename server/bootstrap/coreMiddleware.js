// Description: Central place to register all core middleware for the app
// Purpose: Separates middleware registration from main server boot file
// Notes: Middleware order matters; keep security and invariants here.

'use strict';

const express = require('express');
const { timedMiddleware } = require('../middleware/requestTiming');

/**
 * Register all core middleware in the correct boot order for enterprise-grade protection.
 *
 * Middleware order matters. Guards must run before parsers, nonce must run before CSP headers,
 * trust proxy must run before IP-based logic, webhook must mount before JSON body parsing,
 * and cookie parsing must run before CSRF.
 *
 * HOW (actual order below):
 * CSP Nonce → Method Guard → Credential Guard → Security Headers → Cache Control →
 * Trust Proxy IP → Request ID → Health Routes (early) → Degrade Guard → IP Firewall →
 * Maintenance Guard → HTTPS Enforce → Permissions-Policy → CORS (+ optional debug) →
 * Stripe Webhook (raw body) → Body Parsers → Cookies → App Config → Auth Bridge →
 * Request Timing → CSRF → Rate Limiters
 */
function registerCoreMiddleware({
  app,
  config: _config, // unused here (kept for signature consistency)
  toggles,
  logger,
  consoleLogger,
  csrfLite,
  corsAllowlist,
  trustProxyIp,
  cacheControl,
  methodGuard,
  credentialGuard,
  generateCspNonce,
  securityHeaders,
  enforceHttps,
  corsDebugMiddleware,
  rateLimiters,
  authBridge,
  requireAuth: _requireAuth, // unused here (kept for signature consistency)
  cookieGuardian,
  appConfig,
  mountStripeWebhook,
  degradeGuard,
  ipFirewall,
  createMaintenanceGuard,
  healthRouter,
  requestIdMiddleware,
  redisClient,
}) {
  const log = logger || require('../utils/logger');

  // Mandatory middleware checks
  // We keep these checks light: fail-fast only for things that must exist
  // for the app’s security model (nonce + CSP headers + request id + CSRF).
  function must(name, v) {
    if (!v) throw new Error(`coreMiddleware: missing required dependency: ${name}`);
    return v;
  }

  must('app', app);
  must('generateCspNonce', generateCspNonce);
  must('securityHeaders', securityHeaders);
  must('requestIdMiddleware', requestIdMiddleware);
  must('csrfLite', csrfLite);

  // 1) Early security / invariants

  // 0) CSP nonce (MUST be first so CSP header can include it)
  app.use(generateCspNonce());
  log.info({ event: 'boot.middleware_registered', middleware: 'cspNonce' }, 'Security: CSP nonce generation enabled');

  // 1) Method guard (blocks TRACE/PROPFIND/etc.)
  if (typeof methodGuard === 'function') {
    app.use(methodGuard());
    log.info({ event: 'boot.middleware_registered', middleware: 'methodGuard' }, 'Security: Method guard enabled');
  } else {
    log.warn({ event: 'boot.middleware_skipped', middleware: 'methodGuard' }, 'Method guard unavailable (skipped)');
  }

  // 2) Credential guard (blocks credentials in query params)
  if (typeof credentialGuard === 'function') {
    app.use(credentialGuard);
    log.info(
      { event: 'boot.middleware_registered', middleware: 'credentialGuard' },
      'Security: Credential guard enabled (blocks credentials in GET)'
    );
  } else {
    log.warn({ event: 'boot.middleware_skipped', middleware: 'credentialGuard' }, 'Credential guard unavailable (skipped)');
  }

  // 3) Security headers (Helmet + CSP using nonce)
  app.use(securityHeaders());
  log.info({ event: 'boot.middleware_registered', middleware: 'securityHeaders' }, 'Security: Strict CSP and security headers enabled');

  // 4) Cache control (no-store for dynamic routes)
  if (typeof cacheControl === 'function') {
    app.use(cacheControl());
    log.info({ event: 'boot.middleware_registered', middleware: 'cacheControl' }, 'Security: Cache control enabled');
  } else {
    log.warn({ event: 'boot.middleware_skipped', middleware: 'cacheControl' }, 'Cache control middleware unavailable (skipped)');
  }

  // 5) Trust proxy IP extraction (must be before IP-based logic)
  if (typeof trustProxyIp === 'function') {
    app.use(trustProxyIp(app));
    log.info(
      { event: 'boot.middleware_registered', middleware: 'trustProxyIp' },
      'Security: Trust proxy and clientIp extraction enabled'
    );
  } else {
    log.warn({ event: 'boot.middleware_skipped', middleware: 'trustProxyIp' }, 'Trust proxy middleware unavailable (skipped)');
  }

  // 6) Request ID (must be early so logs can include reqId)
  app.use(requestIdMiddleware);
  log.info({ event: 'boot.middleware_registered', middleware: 'requestId' }, 'Security: Request ID tracking enabled');

  // 7) Health routes (fast, Redis-free) mounted early.
  // Mounting them here means later middleware won’t run if health responds immediately.
  if (healthRouter) {
    try {
      app.use('/health', healthRouter);
      log.info({ event: 'boot.route_loaded', route: 'health' }, 'Health routes mounted early');
    } catch (error) {
      log.error(
        { event: 'boot.route_load_failed', route: 'health', error: error.message },
        'Failed to mount health routes'
      );
    }
  } else {
    log.warn({ event: 'boot.route_skipped', route: 'health' }, 'Health router not provided (skipped)');
  }

  // 8) Redis degrade guard (should run before firewall/rate limits)
  if (typeof degradeGuard === 'function') {
    app.use(degradeGuard);
    log.info(
      { event: 'boot.middleware_registered', middleware: 'degradeGuard' },
      'Security: Redis degrade guard enabled (early)'
    );
  } else {
    log.warn({ event: 'boot.middleware_skipped', middleware: 'degradeGuard' }, 'Degrade guard unavailable (skipped)');
  }

  // 9) IP firewall
  if (ipFirewall && typeof ipFirewall === 'function') {
    app.use(timedMiddleware('redis_firewall', ipFirewall()));
    log.info({ event: 'boot.middleware_registered', middleware: 'ipFirewall' }, 'Security: IP firewall enabled');
  } else {
    log.warn({ event: 'boot.middleware_skipped', middleware: 'ipFirewall' }, 'IP firewall unavailable (skipped)');
  }

  // 10) Maintenance guard (best-effort; must not crash boot)
  if (typeof createMaintenanceGuard === 'function') {
    try {
      const mg = createMaintenanceGuard(redisClient);
      if (typeof mg === 'function') {
        app.use(timedMiddleware('redis_maintenance', mg));
        log.info(
          { event: 'boot.middleware_registered', middleware: 'maintenanceGuard' },
          'Security: Maintenance guard enabled'
        );
      } else {
        log.warn(
          { event: 'boot.middleware_skipped', middleware: 'maintenanceGuard' },
          'Maintenance guard factory did not return middleware (skipped)'
        );
      }
    } catch (err) {
      log.warn(
        { event: 'boot.middleware_load_failed', middleware: 'maintenanceGuard', error: err.message },
        'Failed to initialize maintenance guard (skipped)'
      );
    }
  }

  // 2) Network/security policy middleware

  // HTTPS enforcement (preflight OPTIONS is already short-circuited in zorvalon.js)
  if (typeof enforceHttps === 'function') {
    app.use(enforceHttps);
    log.info({ event: 'boot.middleware_registered', middleware: 'enforceHttps' }, 'Security: HTTPS enforcement enabled');
  } else {
    log.warn({ event: 'boot.middleware_skipped', middleware: 'enforceHttps' }, 'HTTPS enforcement unavailable (skipped)');
  }

  // Permissions-Policy (kept here; if you later move it into securityHeaders, delete this block)
  app.use((req, res, next) => {
    res.setHeader(
      'Permissions-Policy',
      [
        'camera=()',
        'microphone=()',
        'geolocation=()',
        'payment=()',
        'usb=()',
        'serial=()',
        'bluetooth=()',
      ].join(', ')
    );
    next();
  });

  // CORS allowlist validation for non-OPTIONS requests
  if (typeof corsAllowlist === 'function') {
    app.use(corsAllowlist);
    log.info({ event: 'boot.middleware_registered', middleware: 'corsAllowlist' }, 'Security: CORS allowlist enabled');
  } else {
    log.warn({ event: 'boot.middleware_skipped', middleware: 'corsAllowlist' }, 'CORS allowlist unavailable (skipped)');
  }

  // Optional CORS debug
  if (toggles && toggles.corsDebug && typeof corsDebugMiddleware === 'function') {
    app.use(corsDebugMiddleware());
    log.info({ event: 'boot.toggle_enabled', toggle: 'corsDebug' }, 'Toggle: CORS debug logging enabled');
  }

  // 3) Stripe webhook + parsers + cookies + auth bridge

  // Stripe webhook must mount BEFORE json/urlencoded parsers, and BEFORE CSRF.
  if (typeof mountStripeWebhook === 'function') {
    try {
      mountStripeWebhook(app);
      log.info({ event: 'boot.webhook_mounted', webhook: 'stripe' }, 'Stripe webhook mounted (raw body)');
    } catch (e) {
      log.error(
        { event: 'boot.webhook_mount_failed', webhook: 'stripe', error: e.message },
        'Failed to mount Stripe webhook'
      );
    }
  }

  // Body parsers (small limits to reduce abuse)
  app.use(express.json({ limit: '32kb' }));
  app.use(express.urlencoded({ extended: false, limit: '32kb' }));

  // Cookies (must be before CSRF)
  if (typeof cookieGuardian === 'function') {
    app.use(timedMiddleware('cookie', cookieGuardian));
    log.info({ event: 'boot.middleware_registered', middleware: 'cookieGuardian' }, 'Cookies: parsing/guard enabled');
  } else {
    log.warn({ event: 'boot.middleware_skipped', middleware: 'cookieGuardian' }, 'Cookie guardian unavailable (skipped)');
  }

  // App config injection
  if (typeof appConfig === 'function') {
    app.use(appConfig);
    log.info({ event: 'boot.middleware_registered', middleware: 'appConfig' }, 'App config middleware enabled');
  }

  // Auth bridge (stateless)
  if (typeof authBridge === 'function') {
    app.use(timedMiddleware('auth', authBridge));
    log.info({ event: 'boot.auth_mode', mode: 'stateless' }, 'Authentication: Stateless only (Supabase JWT tokens)');
  } else {
    log.warn({ event: 'boot.middleware_skipped', middleware: 'authBridge' }, 'Auth bridge unavailable (skipped)');
  }

  if (consoleLogger && typeof consoleLogger.formatMiddlewareRegistration === 'function') {
    consoleLogger.formatMiddlewareRegistration('Core middleware');
    consoleLogger.formatMiddlewareRegistration('Supabase Auth (token verification)');
  }

  // 4) CSRF (must be after cookies) + rate limiters (secondary layer)

  app.use(csrfLite);

  if (consoleLogger && typeof consoleLogger.formatMiddlewareRegistration === 'function') {
    consoleLogger.formatMiddlewareRegistration('Security middleware');
  }

  // Secondary layer rate limiting (Cloudflare is primary edge layer)
  if (rateLimiters) {
    if (typeof rateLimiters.generalLimiter === 'function') {
      app.use(['/api'], rateLimiters.generalLimiter());
    }
    if (typeof rateLimiters.cookieSetLimiter === 'function') {
      app.use('/auth/set-cookie', rateLimiters.cookieSetLimiter());
    }
    if (typeof rateLimiters.logoutLimiter === 'function') {
      app.use('/auth/clear-cookie', rateLimiters.logoutLimiter());
    }
    if (typeof rateLimiters.loginLimiter === 'function') {
      app.use(['/auth/login', '/api/auth/login'], rateLimiters.loginLimiter());
    }
    if (typeof rateLimiters.registerLimiter === 'function') {
      app.use(['/auth/register', '/api/auth/register'], rateLimiters.registerLimiter());
    }

    log.info(
      {
        event: 'boot.rate_limit_stack',
        rateLimit: { primary: 'cloudflare', secondary: 'redis' },
      },
      'Rate limiting: Edge (primary) → Origin/Redis (secondary)'
    );
  }
}

module.exports = { registerCoreMiddleware };
