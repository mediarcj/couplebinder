// File: server/bootstrap/coreMiddleware.js
// Description: Central place to register all core middleware for the app
// Purpose: Separates middleware registration from main server boot file
// Notes: All middleware is registered here in the correct boot order with appropriate logging

const express = require('express');
const logger = require('../utils/logger');

/**
 * WHAT:
 * Register all core middleware in the correct boot order for enterprise-grade protection.
 *
 * WHY:
 * Middleware order matters. Guards must run before parsers, headers before CORS,
 * and trust proxy before any IP-based logic. Centralizing this makes the boot order
 * explicit and easier to maintain.
 *
 * HOW:
 * We register middleware in the documented order:
 * CSP Nonce → Method Guard → Credential Guard → Security Headers → Cache Control →
 * Trust Proxy → Request ID → Health Routes → Degrade Guard → IP Firewall →
 * HTTPS Enforce → Permissions-Policy → CORS → Stripe Webhook → Body Parsers →
 * Cookies → App Config → Auth Bridge → Request Timing → CSRF → Rate Limiters
 *
 * @param {Object} params - Middleware registration parameters
 * @param {Object} params.app - Express application instance
 * @param {Object} params.config - Application configuration object
 * @param {Object} params.toggles - Feature flags/toggles object
 * @param {Object} params.logger - Structured logger instance
 * @param {Object} params.consoleLogger - Console logger with formatting
 * @param {Function} params.csrfLite - CSRF middleware
 * @param {Function} params.corsAllowlist - CORS allowlist middleware
 * @param {Function} params.trustProxyIp - Trust proxy IP middleware factory
 * @param {Function} params.cacheControl - Cache control middleware factory
 * @param {Function} params.methodGuard - Method guard middleware factory
 * @param {Function} params.credentialGuard - Credential guard middleware
 * @param {Function} params.generateCspNonce - CSP nonce generator middleware factory
 * @param {Function} params.securityHeaders - Security headers middleware factory
 * @param {Function} params.enforceHttps - HTTPS enforcement middleware
 * @param {Function} params.corsDebugMiddleware - CORS debug middleware factory (optional)
 * @param {Object} params.rateLimiters - Rate limiter functions object
 * @param {Function} params.authBridge - Authentication bridge middleware
 * @param {Function} params.requireAuth - Authentication requirement middleware
 * @param {Function} params.cookieGuardian - Cookie parsing middleware
 * @param {Function} params.appConfig - App config injection middleware
 * @param {Function} params.mountStripeWebhook - Stripe webhook mount function
 * @param {Function} params.degradeGuard - Redis degrade guard middleware
 * @param {Function} params.ipFirewall - IP firewall middleware factory
 * @param {Function} params.createMaintenanceGuard - Maintenance guard factory
 * @param {Object} params.healthRouter - Health routes router
 * @param {Function} params.requestIdMiddleware - Request ID middleware
 * @param {Object} params.redisClient - Redis client instance for maintenance guard
 */
function registerCoreMiddleware({
  app,
  config,
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
  requireAuth,
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
  // ============================================================
  // Security Middleware (Early Protection)
  // ============================================================

  /**
   * WHAT:
   * Apply new security middleware in the correct order for enterprise-grade protection.
   * 
   * WHY:
   * Middleware order matters. Guards must run before parsers, headers before CORS,
   * and trust proxy before any IP-based logic.
   * 
   * HOW:
   * 1. Method guard blocks dangerous HTTP verbs
   * 2. Security headers (Helmet with strict CSP)
   * 3. Cache control (no-store for dynamic routes)
   * 4. Trust proxy and extract real client IP
   */

  // 0. Generate CSP nonce for each request (MUST come first for security headers)
  app.use(generateCspNonce());
  logger.info({ event: 'boot.middleware_registered', middleware: 'cspNonce' }, 'Security: CSP nonce generation enabled');

  // 1. Method guard: reject PROPFIND, TRACE, and unknown methods
  app.use(methodGuard());
  logger.info({ event: 'boot.middleware_registered', middleware: 'methodGuard' }, 'Security: Method guard enabled');

  // Credential guard (block credentials in GET params - CRITICAL)
  app.use(credentialGuard);
  logger.info({ event: 'boot.middleware_registered', middleware: 'credentialGuard' }, 'Security: Credential guard enabled (blocks credentials in GET)');

  // 2. Strict security headers with nonce-based CSP
  app.use(securityHeaders());
  logger.info({ event: 'boot.middleware_registered', middleware: 'securityHeaders' }, 'Security: Strict CSP and security headers enabled');

  // 3. Cache control: no-store for dynamic routes
  app.use(cacheControl());
  logger.info({ event: 'boot.middleware_registered', middleware: 'cacheControl' }, 'Security: Cache control enabled');

  // 4. Trust proxy and expose real client IP
  app.use(trustProxyIp(app));
  logger.info({ event: 'boot.middleware_registered', middleware: 'trustProxyIp' }, 'Security: Trust proxy and clientIp extraction enabled');

  // 5. Request ID middleware - add unique ID to every request (must be early for logging)
  app.use(requestIdMiddleware);
  logger.info({ event: 'boot.middleware_registered', middleware: 'requestId' }, 'Security: Request ID tracking enabled');

  // Health routes (fast, Redis-free) mounted early
  try {
    app.use('/health', healthRouter);
    logger.info({ event: 'boot.route_loaded', route: 'health' }, 'Health routes mounted early');
  } catch (error) {
    logger.error({ event: 'boot.route_load_failed', route: 'health', error: error.message }, 'Failed to load health routes');
  }

  // Redis Degrade Guard - must run before IP firewall and rate limiters
  app.use(degradeGuard);
  logger.info({ event: 'boot.middleware_registered', middleware: 'degradeGuard' }, 'Security: Redis degrade guard enabled (early; 503 on sensitive paths if Redis down)');

  // 6. IP Firewall - block abusive IPs before they reach route logic
  app.use(ipFirewall());
  logger.info({ event: 'boot.middleware_registered', middleware: 'ipFirewall' }, 'Security: IP firewall enabled (Redis-backed auto-ban)');

  // 7. Maintenance Guard - instant maintenance mode toggle (after Redis client is available)
  app.use(createMaintenanceGuard(redisClient));
  logger.info({ event: 'boot.middleware_registered', middleware: 'maintenanceGuard' }, 'Security: Maintenance guard enabled (Redis/env toggle)');

  // ============================================================
  // Security and Core Middleware Registration
  // ============================================================

  /**
   * WHAT:
   * We register all security middleware, parsers, and core functionality.
   *
   * WHY:
   * Security middleware must be registered early in the middleware stack
   * to protect all subsequent routes and handlers.
   *
   * HOW:
   * We register middleware in the correct order: security headers, CORS,
   * rate limiting, body parsing, sessions, and custom middleware.
   */

  // HTTPS enforcement (respects Cloudflare proxy headers, uses canonical PUBLIC_ORIGIN)
  // NOTE: OPTIONS requests are handled by the preflight short-circuit at the top
  app.use(enforceHttps);

  // Note: CSP with nonce is now handled by securityHeaders() middleware above
  // No additional Helmet configuration needed here

  // Permissions-Policy header - Enterprise-grade browser feature restrictions
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
        'bluetooth=()'
      ].join(', ')
    );
    next();
  });

  // CORS configuration using dedicated middleware
  /**
   * WHAT:
   * CORS origin validation using centralized corsAllowlist middleware.
   * 
   * WHY:
   * OPTIONS preflight is handled at the absolute top unconditionally.
   * This validates actual requests (GET, POST, etc.) against allowed origins.
   * 
   * HOW:
   * Uses corsAllowlist.js which supports:
   * 1. Explicit CORS_ORIGINS env var
   * 2. Any subdomain of BASE_DOMAIN (if set) or fallback to *.couplebinder.com (legacy)
   * 3. Localhost in development
   * 4. Blocks and logs all others
   */
  app.use(corsAllowlist);

  // CORS debug logging (noisy, keep off unless actively debugging)
  if (toggles.corsDebug && corsDebugMiddleware) {
    app.use(corsDebugMiddleware());
    logger.info({ event: 'boot.toggle_enabled', toggle: 'corsDebug' }, 'Toggle: CORS debug logging enabled');
  }

  // Rate limiting will be applied after static files

  // Body parsers with size limits
  // Stripe webhook (raw body, CSRF bypass) - must be before body parsers
  try {
    mountStripeWebhook(app);
    logger.info({ event: 'boot.webhook_mounted', webhook: 'stripe' }, 'Stripe webhook mounted (raw body, CSRF bypass).');
  } catch (e) {
    logger.error({ event: 'boot.webhook_mount_failed', webhook: 'stripe', error: e.message }, 'Failed to mount Stripe webhook');
  }

  // Body size limits (32KB to match text input limits and prevent abuse)
  app.use(express.json({ limit: '32kb' }));
  app.use(express.urlencoded({ extended: false, limit: '32kb' }));

  // Cookie parsing middleware - must be before sessions and CSRF
  app.use(cookieGuardian);

  // App config injection (makes config available to all views)
  app.use(appConfig);

  // Stateless authentication bridge - reads Supabase tokens
  app.use(authBridge);

  /**
   * WHAT:
   * Session middleware is disabled - using stateless authentication only.
   * 
   * WHY:
   * No routes use req.session, so sessions are not needed.
   * Stateless Supabase JWT authentication is sufficient.
   * 
   * HOW:
   * Sessions are completely disabled to reduce attack surface.
   * All authentication is handled via Supabase JWT tokens.
   */

  logger.info({ event: 'boot.auth_mode', mode: 'stateless' }, 'Authentication: Stateless only (Supabase JWT tokens)');

  // Request timing middleware for formatted logging
  app.use((req, res, next) => {
    const startTime = Date.now();
    
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      // Use formatted logger for terminal display
      consoleLogger.formatRequest(req, res, duration);
    });
    
    next();
  });

  consoleLogger.formatMiddlewareRegistration('Core middleware');

  // Supabase Auth middleware (stateless token verification)
  consoleLogger.formatMiddlewareRegistration('Supabase Auth (token verification)');

  // Rate limiting configuration logged via structured logger
  // EVIDENCE: Both Cloudflare edge AND Redis-based application limiters are active
  logger.info({
    event: 'boot.rate_limit_stack',
    rateLimit: {
      primary: 'cloudflare',    // Handles volumetric DDoS attacks
      secondary: 'redis'        // Handles application-specific limits
    }
  }, 'Rate limiting: Edge (primary) → Origin/Redis (secondary)');

  // ============================================================
  // Security Middleware Configuration
  // ============================================================

  /**
   * WHAT:
   * We register security middleware for CSRF protection.
   *
   * WHY:
   * CSRF protection prevents cross-site request forgery attacks
   * by validating tokens on state-changing requests.
   *
   * HOW:
   * We add CSRF token generation middleware and configure
   * validation for protected routes.
   */
  // Add CSRF protection middleware (stateless double-submit)
  app.use(csrfLite);

  consoleLogger.formatMiddlewareRegistration('Security middleware');

  // ============================================================
  // Application-Layer Rate Limiting (Defense-in-Depth)
  // ============================================================

  /**
   * WHAT:
   * Per-route rate limiting at the application layer (SECONDARY layer).
   *
   * WHY:
   * Defense-in-depth behind Cloudflare edge protection (PRIMARY layer).
   * Different routes need different limits (login strict, logout lenient).
   *
   * HOW:
   * DUAL-LAYER RATE LIMITING ARCHITECTURE:
   * 
   * LAYER 1 (PRIMARY): Cloudflare Edge
   * - Handles volumetric DDoS attacks and massive traffic floods
   * - Provides geographic filtering and bot protection
   * - Blocks traffic before it reaches this origin server
   * - Configured at Cloudflare dashboard level
   *
   * LAYER 2 (SECONDARY): Application-specific limiters (this section)
   * - Five tiers of rate limiting for different endpoint types:
   *   1. General API limiter (300 req/min) - generous for normal use
   *   2. Cookie set limiter (300 req/min) - lenient for post-login flow
   *   3. Logout limiter (120 req/10min) - very lenient, users click around
   *   4. Login limiter (10 attempts/15min) - strict to prevent brute force
   *   5. Register limiter (5 attempts/hour) - very strict to prevent abuse
   * - Escalates repeated violations to IP firewall blocking
   * - Uses Redis for shared state across multiple server instances
   *
   * EVIDENCE: Both layers are active:
   * - Line 522: "Rate limiting: Edge (primary) → Origin/Redis (secondary)"
   * - Line 898: "rateLimit: 'handled at Cloudflare edge'"
   */
  // Apply general rate limiting to API endpoints (SECONDARY layer)
  // This works IN ADDITION to Cloudflare edge protection (PRIMARY layer)
  app.use(['/api'], rateLimiters.generalLimiter());
  // General limiter enabled (300 req/min) - logged via structured logger above

  // Apply per-route rate limiting to auth endpoints (SECONDARY layer)
  // These are application-specific limits after Cloudflare edge filtering
  app.use('/auth/set-cookie', rateLimiters.cookieSetLimiter());
  // Cookie set limiter enabled (300 req/min) - logged via structured logger above

  app.use('/auth/clear-cookie', rateLimiters.logoutLimiter());
  // Logout limiter enabled (120 req/10min) - logged via structured logger above
  // NOTE: This is SECONDARY layer - Cloudflare edge handles volumetric attacks first

  app.use(['/auth/login', '/api/auth/login'], rateLimiters.loginLimiter());
  // Login limiter enabled (10 attempts per 15 min) - logged via structured logger above
  // NOTE: This is SECONDARY layer - Cloudflare edge handles volumetric attacks first

  app.use(['/auth/register', '/api/auth/register'], rateLimiters.registerLimiter());
  // Register limiter enabled (5 attempts per hour) - logged via structured logger above
  // NOTE: This is SECONDARY layer - Cloudflare edge handles volumetric attacks first
}

module.exports = { registerCoreMiddleware };

