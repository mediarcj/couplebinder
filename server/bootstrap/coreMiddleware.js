// File: server/bootstrap/coreMiddleware.js
// Description: Central place to register all core middleware for the app
// Purpose: Separates middleware registration from main server boot file
// Notes: Middleware order matters; keep security and invariants here.

'use strict';

// I am loading `express` into `express` so this file can reuse that dependency below.
const express = require('express');

/**
 * WHAT:
 * Register all core middleware in the correct boot order for enterprise-grade protection.
 *
 * WHY:
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
  // I am keeping this line here because the surrounding coreMiddleware.js workflow expects this value or operation before it continues.
  app,
  config, // unused here (kept for signature consistency)
  // I am keeping this line here because the surrounding coreMiddleware.js workflow expects this value or operation before it continues.
  toggles,
  // I am keeping this line here because the surrounding coreMiddleware.js workflow expects this value or operation before it continues.
  logger,
  // I am keeping this line here because the surrounding coreMiddleware.js workflow expects this value or operation before it continues.
  consoleLogger,
  // I am keeping this line here because the surrounding coreMiddleware.js workflow expects this value or operation before it continues.
  csrfLite,
  // I am keeping this line here because the surrounding coreMiddleware.js workflow expects this value or operation before it continues.
  corsAllowlist,
  // I am keeping this line here because the surrounding coreMiddleware.js workflow expects this value or operation before it continues.
  trustProxyIp,
  // I am keeping this line here because the surrounding coreMiddleware.js workflow expects this value or operation before it continues.
  cacheControl,
  // I am keeping this line here because the surrounding coreMiddleware.js workflow expects this value or operation before it continues.
  methodGuard,
  // I am keeping this line here because the surrounding coreMiddleware.js workflow expects this value or operation before it continues.
  credentialGuard,
  // I am keeping this line here because the surrounding coreMiddleware.js workflow expects this value or operation before it continues.
  generateCspNonce,
  // I am keeping this line here because the surrounding coreMiddleware.js workflow expects this value or operation before it continues.
  securityHeaders,
  // I am keeping this line here because the surrounding coreMiddleware.js workflow expects this value or operation before it continues.
  enforceHttps,
  // I am keeping this line here because the surrounding coreMiddleware.js workflow expects this value or operation before it continues.
  corsDebugMiddleware,
  // I am keeping this line here because the surrounding coreMiddleware.js workflow expects this value or operation before it continues.
  rateLimiters,
  // I am keeping this line here because the surrounding coreMiddleware.js workflow expects this value or operation before it continues.
  authBridge,
  requireAuth, // unused here (kept for signature consistency)
  // I am keeping this line here because the surrounding coreMiddleware.js workflow expects this value or operation before it continues.
  cookieGuardian,
  // I am keeping this line here because the surrounding coreMiddleware.js workflow expects this value or operation before it continues.
  appConfig,
  // I am keeping this line here because the surrounding coreMiddleware.js workflow expects this value or operation before it continues.
  mountStripeWebhook,
  // I am keeping this line here because the surrounding coreMiddleware.js workflow expects this value or operation before it continues.
  degradeGuard,
  // I am keeping this line here because the surrounding coreMiddleware.js workflow expects this value or operation before it continues.
  ipFirewall,
  // I am keeping this line here because the surrounding coreMiddleware.js workflow expects this value or operation before it continues.
  createMaintenanceGuard,
  // I am keeping this line here because the surrounding coreMiddleware.js workflow expects this value or operation before it continues.
  healthRouter,
  // I am keeping this line here because the surrounding coreMiddleware.js workflow expects this value or operation before it continues.
  requestIdMiddleware,
  // I am keeping this line here because the surrounding coreMiddleware.js workflow expects this value or operation before it continues.
  redisClient,
// I am keeping this line here because the surrounding coreMiddleware.js workflow expects this value or operation before it continues.
}) {
  // I am loading `../utils/logger` into `log` so this file can reuse that dependency below.
  const log = logger || require('../utils/logger');

  // ----------------------------
  // Mandatory middleware checks
  // ----------------------------
  // We keep these checks light: fail-fast only for things that must exist
  // for the app’s security model (nonce + CSP headers + request id + CSRF).
  function must(name, v) {
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!v) throw new Error(`coreMiddleware: missing required dependency: ${name}`);
    // This return sends the completed value or response back to the code that called this function.
    return v;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am calling this helper here so the current workflow performs this step before it moves on.
  must('app', app);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  must('generateCspNonce', generateCspNonce);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  must('securityHeaders', securityHeaders);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  must('requestIdMiddleware', requestIdMiddleware);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  must('csrfLite', csrfLite);

  // ============================================================
  // 1) Early security / invariants
  // ============================================================

  // 0) CSP nonce (MUST be first so CSP header can include it)
  app.use(generateCspNonce());
  // I am calling this helper here so the current workflow performs this step before it moves on.
  log.info({ event: 'boot.middleware_registered', middleware: 'cspNonce' }, 'Security: CSP nonce generation enabled');

  // 1) Method guard (blocks TRACE/PROPFIND/etc.)
  if (typeof methodGuard === 'function') {
    // I am attaching this middleware or router here so matching requests pass through it in the existing Express order.
    app.use(methodGuard());
    // I am calling this helper here so the current workflow performs this step before it moves on.
    log.info({ event: 'boot.middleware_registered', middleware: 'methodGuard' }, 'Security: Method guard enabled');
  // This alternative runs only when the condition above did not use its first path.
  } else {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    log.warn({ event: 'boot.middleware_skipped', middleware: 'methodGuard' }, 'Method guard unavailable (skipped)');
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // 2) Credential guard (blocks credentials in query params)
  if (typeof credentialGuard === 'function') {
    // I am attaching this middleware or router here so matching requests pass through it in the existing Express order.
    app.use(credentialGuard);
    // I am calling this helper here so the current workflow performs this step before it moves on.
    log.info(
      // I am keeping this line here because the surrounding coreMiddleware.js workflow expects this value or operation before it continues.
      { event: 'boot.middleware_registered', middleware: 'credentialGuard' },
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      'Security: Credential guard enabled (blocks credentials in GET)'
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    );
  // This alternative runs only when the condition above did not use its first path.
  } else {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    log.warn({ event: 'boot.middleware_skipped', middleware: 'credentialGuard' }, 'Credential guard unavailable (skipped)');
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // 3) Security headers (Helmet + CSP using nonce)
  app.use(securityHeaders());
  // I am calling this helper here so the current workflow performs this step before it moves on.
  log.info({ event: 'boot.middleware_registered', middleware: 'securityHeaders' }, 'Security: Strict CSP and security headers enabled');

  // 4) Cache control (no-store for dynamic routes)
  if (typeof cacheControl === 'function') {
    // I am attaching this middleware or router here so matching requests pass through it in the existing Express order.
    app.use(cacheControl());
    // I am calling this helper here so the current workflow performs this step before it moves on.
    log.info({ event: 'boot.middleware_registered', middleware: 'cacheControl' }, 'Security: Cache control enabled');
  // This alternative runs only when the condition above did not use its first path.
  } else {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    log.warn({ event: 'boot.middleware_skipped', middleware: 'cacheControl' }, 'Cache control middleware unavailable (skipped)');
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // 5) Trust proxy IP extraction (must be before IP-based logic)
  if (typeof trustProxyIp === 'function') {
    // I am attaching this middleware or router here so matching requests pass through it in the existing Express order.
    app.use(trustProxyIp(app));
    // I am calling this helper here so the current workflow performs this step before it moves on.
    log.info(
      // I am keeping this line here because the surrounding coreMiddleware.js workflow expects this value or operation before it continues.
      { event: 'boot.middleware_registered', middleware: 'trustProxyIp' },
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      'Security: Trust proxy and clientIp extraction enabled'
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    );
  // This alternative runs only when the condition above did not use its first path.
  } else {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    log.warn({ event: 'boot.middleware_skipped', middleware: 'trustProxyIp' }, 'Trust proxy middleware unavailable (skipped)');
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // 6) Request ID (must be early so logs can include reqId)
  app.use(requestIdMiddleware);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  log.info({ event: 'boot.middleware_registered', middleware: 'requestId' }, 'Security: Request ID tracking enabled');

  // 7) Health routes (fast, Redis-free) mounted early.
  // Mounting them here means later middleware won’t run if health responds immediately.
  if (healthRouter) {
    // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
    try {
      // I am attaching this middleware or router here so matching requests pass through it in the existing Express order.
      app.use('/health', healthRouter);
      // I am calling this helper here so the current workflow performs this step before it moves on.
      log.info({ event: 'boot.route_loaded', route: 'health' }, 'Health routes mounted early');
    // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
    } catch (error) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      log.error(
        // I am keeping this line here because the surrounding coreMiddleware.js workflow expects this value or operation before it continues.
        { event: 'boot.route_load_failed', route: 'health', error: error.message },
        // I am listing this entry here because the surrounding collection processes each allowed value in order.
        'Failed to mount health routes'
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      );
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // This alternative runs only when the condition above did not use its first path.
  } else {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    log.warn({ event: 'boot.route_skipped', route: 'health' }, 'Health router not provided (skipped)');
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // 8) Redis degrade guard (should run before firewall/rate limits)
  if (typeof degradeGuard === 'function') {
    // I am attaching this middleware or router here so matching requests pass through it in the existing Express order.
    app.use(degradeGuard);
    // I am calling this helper here so the current workflow performs this step before it moves on.
    log.info(
      // I am keeping this line here because the surrounding coreMiddleware.js workflow expects this value or operation before it continues.
      { event: 'boot.middleware_registered', middleware: 'degradeGuard' },
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      'Security: Redis degrade guard enabled (early)'
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    );
  // This alternative runs only when the condition above did not use its first path.
  } else {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    log.warn({ event: 'boot.middleware_skipped', middleware: 'degradeGuard' }, 'Degrade guard unavailable (skipped)');
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // 9) IP firewall
  if (ipFirewall && typeof ipFirewall === 'function') {
    // I am attaching this middleware or router here so matching requests pass through it in the existing Express order.
    app.use(ipFirewall());
    // I am calling this helper here so the current workflow performs this step before it moves on.
    log.info({ event: 'boot.middleware_registered', middleware: 'ipFirewall' }, 'Security: IP firewall enabled');
  // This alternative runs only when the condition above did not use its first path.
  } else {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    log.warn({ event: 'boot.middleware_skipped', middleware: 'ipFirewall' }, 'IP firewall unavailable (skipped)');
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // 10) Maintenance guard (best-effort; must not crash boot)
  if (typeof createMaintenanceGuard === 'function') {
    // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
    try {
      // I am saving `mg` here so the nearby steps can reuse the same value without rebuilding it each time.
      const mg = createMaintenanceGuard(redisClient);
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (typeof mg === 'function') {
        // I am attaching this middleware or router here so matching requests pass through it in the existing Express order.
        app.use(mg);
        // I am calling this helper here so the current workflow performs this step before it moves on.
        log.info(
          // I am keeping this line here because the surrounding coreMiddleware.js workflow expects this value or operation before it continues.
          { event: 'boot.middleware_registered', middleware: 'maintenanceGuard' },
          // I am listing this entry here because the surrounding collection processes each allowed value in order.
          'Security: Maintenance guard enabled'
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        );
      // This alternative runs only when the condition above did not use its first path.
      } else {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        log.warn(
          // I am keeping this line here because the surrounding coreMiddleware.js workflow expects this value or operation before it continues.
          { event: 'boot.middleware_skipped', middleware: 'maintenanceGuard' },
          // I am listing this entry here because the surrounding collection processes each allowed value in order.
          'Maintenance guard factory did not return middleware (skipped)'
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        );
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
    } catch (err) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      log.warn(
        // I am keeping this line here because the surrounding coreMiddleware.js workflow expects this value or operation before it continues.
        { event: 'boot.middleware_load_failed', middleware: 'maintenanceGuard', error: err.message },
        // I am listing this entry here because the surrounding collection processes each allowed value in order.
        'Failed to initialize maintenance guard (skipped)'
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      );
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // ============================================================
  // 2) Network/security policy middleware
  // ============================================================

  // HTTPS enforcement (preflight OPTIONS is already short-circuited in zorvalon.js)
  if (typeof enforceHttps === 'function') {
    // I am attaching this middleware or router here so matching requests pass through it in the existing Express order.
    app.use(enforceHttps);
    // I am calling this helper here so the current workflow performs this step before it moves on.
    log.info({ event: 'boot.middleware_registered', middleware: 'enforceHttps' }, 'Security: HTTPS enforcement enabled');
  // This alternative runs only when the condition above did not use its first path.
  } else {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    log.warn({ event: 'boot.middleware_skipped', middleware: 'enforceHttps' }, 'HTTPS enforcement unavailable (skipped)');
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // Permissions-Policy (kept here; if you later move it into securityHeaders, delete this block)
  app.use((req, res, next) => {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    res.setHeader(
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      'Permissions-Policy',
      // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
      [
        // I am listing this entry here because the surrounding collection processes each allowed value in order.
        'camera=()',
        // I am listing this entry here because the surrounding collection processes each allowed value in order.
        'microphone=()',
        // I am listing this entry here because the surrounding collection processes each allowed value in order.
        'geolocation=()',
        // I am listing this entry here because the surrounding collection processes each allowed value in order.
        'payment=()',
        // I am listing this entry here because the surrounding collection processes each allowed value in order.
        'usb=()',
        // I am listing this entry here because the surrounding collection processes each allowed value in order.
        'serial=()',
        // I am listing this entry here because the surrounding collection processes each allowed value in order.
        'bluetooth=()',
      // I am keeping this line here because the surrounding coreMiddleware.js workflow expects this value or operation before it continues.
      ].join(', ')
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    );
    // I am calling this helper here so the current workflow performs this step before it moves on.
    next();
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });

  // CORS allowlist validation for non-OPTIONS requests
  if (typeof corsAllowlist === 'function') {
    // I am attaching this middleware or router here so matching requests pass through it in the existing Express order.
    app.use(corsAllowlist);
    // I am calling this helper here so the current workflow performs this step before it moves on.
    log.info({ event: 'boot.middleware_registered', middleware: 'corsAllowlist' }, 'Security: CORS allowlist enabled');
  // This alternative runs only when the condition above did not use its first path.
  } else {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    log.warn({ event: 'boot.middleware_skipped', middleware: 'corsAllowlist' }, 'CORS allowlist unavailable (skipped)');
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // Optional CORS debug
  if (toggles && toggles.corsDebug && typeof corsDebugMiddleware === 'function') {
    // I am attaching this middleware or router here so matching requests pass through it in the existing Express order.
    app.use(corsDebugMiddleware());
    // I am calling this helper here so the current workflow performs this step before it moves on.
    log.info({ event: 'boot.toggle_enabled', toggle: 'corsDebug' }, 'Toggle: CORS debug logging enabled');
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // ============================================================
  // 3) Stripe webhook + parsers + cookies + auth bridge
  // ============================================================

  // Stripe webhook must mount BEFORE json/urlencoded parsers, and BEFORE CSRF.
  if (typeof mountStripeWebhook === 'function') {
    // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
    try {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      mountStripeWebhook(app);
      // I am calling this helper here so the current workflow performs this step before it moves on.
      log.info({ event: 'boot.webhook_mounted', webhook: 'stripe' }, 'Stripe webhook mounted (raw body)');
    // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
    } catch (e) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      log.error(
        // I am keeping this line here because the surrounding coreMiddleware.js workflow expects this value or operation before it continues.
        { event: 'boot.webhook_mount_failed', webhook: 'stripe', error: e.message },
        // I am listing this entry here because the surrounding collection processes each allowed value in order.
        'Failed to mount Stripe webhook'
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      );
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // Body parsers (small limits to reduce abuse)
  app.use(express.json({ limit: '32kb' }));
  // I am attaching this middleware or router here so matching requests pass through it in the existing Express order.
  app.use(express.urlencoded({ extended: false, limit: '32kb' }));

  // Cookies (must be before CSRF)
  if (typeof cookieGuardian === 'function') {
    // I am attaching this middleware or router here so matching requests pass through it in the existing Express order.
    app.use(cookieGuardian);
    // I am calling this helper here so the current workflow performs this step before it moves on.
    log.info({ event: 'boot.middleware_registered', middleware: 'cookieGuardian' }, 'Cookies: parsing/guard enabled');
  // This alternative runs only when the condition above did not use its first path.
  } else {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    log.warn({ event: 'boot.middleware_skipped', middleware: 'cookieGuardian' }, 'Cookie guardian unavailable (skipped)');
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // App config injection
  if (typeof appConfig === 'function') {
    // I am attaching this middleware or router here so matching requests pass through it in the existing Express order.
    app.use(appConfig);
    // I am calling this helper here so the current workflow performs this step before it moves on.
    log.info({ event: 'boot.middleware_registered', middleware: 'appConfig' }, 'App config middleware enabled');
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // Auth bridge (stateless)
  if (typeof authBridge === 'function') {
    // I am attaching this middleware or router here so matching requests pass through it in the existing Express order.
    app.use(authBridge);
    // I am calling this helper here so the current workflow performs this step before it moves on.
    log.info({ event: 'boot.auth_mode', mode: 'stateless' }, 'Authentication: Stateless only (Supabase JWT tokens)');
  // This alternative runs only when the condition above did not use its first path.
  } else {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    log.warn({ event: 'boot.middleware_skipped', middleware: 'authBridge' }, 'Auth bridge unavailable (skipped)');
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // Request timing → pretty terminal logging (must not crash if consoleLogger is missing)
  app.use((req, res, next) => {
    // I am saving `startTime` here so the nearby steps can reuse the same value without rebuilding it each time.
    const startTime = Date.now();

    // I am defining this small callback here so the surrounding API can run it with the value it supplies.
    res.on('finish', () => {
      // I am saving `duration` here so the nearby steps can reuse the same value without rebuilding it each time.
      const duration = Date.now() - startTime;
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (consoleLogger && typeof consoleLogger.formatRequest === 'function') {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        consoleLogger.formatRequest(req, res, duration);
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am calling this helper here so the current workflow performs this step before it moves on.
    next();
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (consoleLogger && typeof consoleLogger.formatMiddlewareRegistration === 'function') {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    consoleLogger.formatMiddlewareRegistration('Core middleware');
    // I am calling this helper here so the current workflow performs this step before it moves on.
    consoleLogger.formatMiddlewareRegistration('Supabase Auth (token verification)');
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // ============================================================
  // 4) CSRF (must be after cookies) + rate limiters (secondary layer)
  // ============================================================

  app.use(csrfLite);

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (consoleLogger && typeof consoleLogger.formatMiddlewareRegistration === 'function') {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    consoleLogger.formatMiddlewareRegistration('Security middleware');
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // Secondary layer rate limiting (Cloudflare is primary edge layer)
  if (rateLimiters) {
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (typeof rateLimiters.generalLimiter === 'function') {
      // I am attaching this middleware or router here so matching requests pass through it in the existing Express order.
      app.use(['/api'], rateLimiters.generalLimiter());
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (typeof rateLimiters.cookieSetLimiter === 'function') {
      // I am attaching this middleware or router here so matching requests pass through it in the existing Express order.
      app.use('/auth/set-cookie', rateLimiters.cookieSetLimiter());
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (typeof rateLimiters.logoutLimiter === 'function') {
      // I am attaching this middleware or router here so matching requests pass through it in the existing Express order.
      app.use('/auth/clear-cookie', rateLimiters.logoutLimiter());
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (typeof rateLimiters.loginLimiter === 'function') {
      // I am attaching this middleware or router here so matching requests pass through it in the existing Express order.
      app.use(['/auth/login', '/api/auth/login'], rateLimiters.loginLimiter());
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (typeof rateLimiters.registerLimiter === 'function') {
      // I am attaching this middleware or router here so matching requests pass through it in the existing Express order.
      app.use(['/auth/register', '/api/auth/register'], rateLimiters.registerLimiter());
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // I am calling this helper here so the current workflow performs this step before it moves on.
    log.info(
      // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
      {
        // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
        event: 'boot.rate_limit_stack',
        // I am keeping the `rateLimit` field in this object so the receiving code can read that value by its expected name.
        rateLimit: { primary: 'cloudflare', secondary: 'redis' },
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      },
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      'Rate limiting: Edge (primary) → Origin/Redis (secondary)'
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    );
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am exporting this value here so another module can deliberately reuse the completed piece from coreMiddleware.js.
module.exports = { registerCoreMiddleware };