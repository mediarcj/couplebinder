// File: server/bootstrap/routes.js
// Description: Central place to register all Express routes for the app
// Purpose: Separates route registration from main server boot file
// Notes: All routes are registered here with appropriate middleware and error handling

const logger = require('../utils/logger');

/**
 * WHAT:
 * Register all application routes with appropriate middleware.
 *
 * WHY:
 * Routes define the API endpoints and page handlers for the application.
 * Centralizing route registration makes the codebase easier to maintain.
 *
 * HOW:
 * CSRF protection for state-changing requests is applied globally
 * in the core middleware stack. Here we only register routers and
 * organize them by functional areas (auth, API, dashboard, health).
 *
 * @param {Object} params - Route registration parameters
 * @param {Object} params.app - Express application instance
 * @param {Object} params.config - Application configuration object
 * @param {Object} params.toggles - Feature flags/toggles object
 * @param {Function} params.requireAuth - Authentication middleware function
 */
function registerRoutes({
  app,
  config,
  toggles,
  requireAuth
}) {
  // Import modular routes (CSRF protection is handled globally in core middleware)
  // CRITICAL SECTION: Safe route loading to prevent crashes

  try {
    const profileRouter = require('../routes/profile');
    app.use('/api/profile', requireAuth, profileRouter);
    logger.info({ event: 'boot.route_loaded', route: 'profile' }, 'Profile API routes loaded successfully');
  } catch (error) {
    logger.error({ event: 'boot.route_load_failed', route: 'profile', error: error.message }, 'Failed to load profile API routes');
  }

  try {
    app.use('/auth', require('../routes/authCookie'));  // HttpOnly cookie management (set/clear)
    logger.info({ event: 'boot.route_loaded', route: 'authCookie' }, 'Auth cookie routes loaded successfully');
  } catch (error) {
    logger.error({ event: 'boot.route_load_failed', route: 'authCookie', error: error.message }, 'Failed to load auth cookie routes');
  }

  try {
    app.use('/api/auth', require('../routes/auth'));
    logger.info({ event: 'boot.route_loaded', route: 'auth' }, 'Auth API routes loaded successfully');
  } catch (error) {
    logger.error({ event: 'boot.route_load_failed', route: 'auth', error: error.message }, 'Failed to load auth API routes');
  }

  // Debug route (enabled via AUTH_DEBUG=true env var)
  if (config.auth.debug) {
    try {
      app.use('/api/auth', require('../routes/authDebug'));
      logger.info({ event: 'boot.route_loaded', route: 'authDebug' }, 'Auth debug routes loaded (AUTH_DEBUG=true)');
    } catch (error) {
      logger.error({ event: 'boot.route_load_failed', route: 'authDebug', error: error.message }, 'Failed to load auth debug routes');
    }
  }

  try {
    // Admin routes (require admin role)
    app.use('/api/admin', requireAuth, require('../routes/admin'));
    logger.info({ event: 'boot.route_loaded', route: 'admin' }, 'Admin API routes loaded successfully');
  } catch (error) {
    logger.error({ event: 'boot.route_load_failed', route: 'admin', error: error.message }, 'Failed to load admin API routes');
  }

  try {
    // User routes (require ownership)
    app.use('/api/users', requireAuth, require('../routes/users'));
    logger.info({ event: 'boot.route_loaded', route: 'users' }, 'Users API routes loaded successfully');
  } catch (error) {
    logger.error({ event: 'boot.route_load_failed', route: 'users', error: error.message }, 'Failed to load users API routes');
  }

  try {
    app.use('/api/page', requireAuth, require('../routes/pageApi'));
    logger.info({ event: 'boot.route_loaded', route: 'pageApi' }, 'Page API routes loaded successfully');
  } catch (error) {
    logger.error({ event: 'boot.route_load_failed', route: 'pageApi', error: error.message }, 'Failed to load page API routes');
  }

  let submissionsRouter = null;
  try {
    submissionsRouter = require('../routes/submissions');
    app.use('/api/submit', submissionsRouter);
    logger.info({ event: 'boot.route_loaded', route: 'submissions' }, 'Submissions API routes loaded successfully');
  } catch (error) {
    logger.error({ event: 'boot.route_load_failed', route: 'submissions', error: error.message }, 'Failed to load submissions API routes');
  }

  try {
    app.use('/api/pay', requireAuth, require('../routes/payments'));
    logger.info({ event: 'boot.route_loaded', route: 'payments' }, 'Payments API routes loaded successfully');
  } catch (error) {
    logger.error({ event: 'boot.route_load_failed', route: 'payments', error: error.message }, 'Failed to load payments API routes');
  }

  try {
    app.use('/api', require('../routes/api'));
    logger.info({ event: 'boot.route_loaded', route: 'api' }, 'General API routes loaded successfully');
  } catch (error) {
    logger.error({ event: 'boot.route_load_failed', route: 'api', error: error.message }, 'Failed to load general API routes');
  }

  try {
    app.use('/account', requireAuth, require('../routes/account'));
    logger.info({ event: 'boot.route_loaded', route: 'account' }, 'Account routes loaded successfully');
  } catch (error) {
    logger.error({ event: 'boot.route_load_failed', route: 'account', error: error.message }, 'Failed to load account routes');
  }

  try {
    app.use('/', require('../routes/passwordRecovery'));
    logger.info({ event: 'boot.route_loaded', route: 'passwordRecovery' }, 'Password recovery routes loaded successfully');
  } catch (error) {
    logger.error({ event: 'boot.route_load_failed', route: 'passwordRecovery', error: error.message }, 'Failed to load password recovery routes');
  }

  // Debug routes (toggle-based, off by default)
  /**
   * WHAT:
   * Debug routes for operational visibility (/_debug).
   * 
   * WHY:
   * Ops/devops need visibility into feature flags and basic health
   * without exposing sensitive data or creating security risks.
   * 
   * HOW:
   * Only mount /_debug when EXPOSE_DEBUG_ROUTES=true.
   * You can guard it further (e.g., IP allowlist) if needed.
   */
  if (toggles.exposeDebugRoutes) {
    try {
      app.use('/_debug', require('../routes/debug'));
      logger.info({ event: 'boot.route_loaded', route: 'debug' }, 'Toggle: Debug routes enabled (/_debug)');
    } catch (error) {
      logger.error({ event: 'boot.route_load_failed', route: 'debug', error: error.message }, 'Failed to load debug routes');
    }
  }

  try {
    app.use('/dashboard', requireAuth, require('../routes/dashboard'));
    logger.info({ event: 'boot.route_loaded', route: 'dashboard' }, 'Dashboard routes loaded successfully');
  } catch (error) {
    logger.error({ event: 'boot.route_load_failed', route: 'dashboard', error: error.message }, 'Failed to load dashboard routes');
  }

  try {
    app.use('/dashboard/billing', requireAuth, require('../routes/dashboard-billing'));
    logger.info({ event: 'boot.route_loaded', route: 'dashboard-billing' }, 'Billing dashboard route loaded');
  } catch (e) {
    logger.error({ event: 'boot.route_load_failed', route: 'dashboard-billing', error: e.message }, 'Failed to load /dashboard/billing');
  }

  // Binder routes (proof-of-relationship document builder)
  try {
    const binderRouter = require('../routes/binderRoutes');
    app.use('/dashboard/binder', requireAuth, binderRouter);
    logger.info(
      { event: 'boot.route_loaded', route: 'binder' },
      'Binder routes loaded successfully'
    );
  } catch (error) {
    logger.error(
      { event: 'boot.route_load_failed', route: 'binder', error: error.message },
      'Failed to load binder routes'
    );
  }
    
  // Login page route (public)
  app.get('/login', (req, res) => {
    try {
      if (req.user?.id) {
        return res.redirect('/dashboard');
      }
      const pageModel = buildLoginPageModel(req, res);
      pageModel.page.nonce = res.locals.nonce || pageModel.page.nonce;
      res.render('login', pageModel);
    } catch (error) {
      logger.error({ event: 'boot.page_error', page: 'login', error: error.message }, 'Login page error');
      res.status(500).render('error', {
        title: 'Login Error',
        message: 'Unable to load login page',
        page: { nonce: res.locals.nonce }
      });
    }
  });

  // Register page route (public)
  app.get('/register', (req, res) => {
    try {
      if (req.user?.id) {
        return res.redirect('/dashboard');
      }

      const pageModel = buildRegisterPageModel(req, res);
      pageModel.page.nonce = res.locals.nonce || pageModel.page.nonce;
      res.render('register', pageModel);
    } catch (error) {
      logger.error({ event: 'boot.page_error', page: 'register', error: error.message }, 'Register page error');
      res.status(500).render('error', {
        title: 'Register Error',
        message: 'Unable to load register page',
        page: { nonce: res.locals.nonce }
      });
    }
  });

  // Initialize submissions storage (now using database)
  try {
    if (submissionsRouter && submissionsRouter.initSubmissionsStorage) {
      submissionsRouter.initSubmissionsStorage();
      logger.info({ event: 'boot.storage_initialized', storage: 'submissions' }, 'Submissions storage initialized successfully (Supabase database)');
    }
  } catch (error) {
    logger.error({ event: 'boot.storage_init_failed', storage: 'submissions', error: error.message }, 'Failed to initialize submissions storage');
  }

  // Import presenters (home, login, register)
  let buildHomePageModel;
  let buildLoginPageModel;
  let buildRegisterPageModel;
  try {
    const presentersModule = require('../ui_contract/presenters');
    buildHomePageModel = presentersModule.buildHomePageModel;
    buildLoginPageModel = presentersModule.buildLoginPageModel;
    buildRegisterPageModel = presentersModule.buildRegisterPageModel;
    logger.info({ event: 'boot.module_loaded', module: 'presenters' }, 'Presenters module loaded successfully');
  } catch (error) {
    logger.error({ event: 'boot.module_load_failed', module: 'presenters', error: error.message }, 'Failed to load presenters module');
    // Fallbacks so routes still render something instead of crashing
    buildHomePageModel = () => ({
      page: { title: 'Error', description: 'Service unavailable', nonce: '' },
      ui: { csrfToken: '', turnstile: { enabled: false } }
    });
    buildLoginPageModel = () => ({
      page: { title: 'Login', nonce: '' },
      ui: { csrfToken: '', turnstile: { enabled: false } }
    });
    buildRegisterPageModel = () => ({
      page: { title: 'Register', nonce: '' },
      ui: { csrfToken: '', turnstile: { enabled: false } }
    });
  }

  // Home page route
  app.get('/', (req, res) => {
    try {
      // Build page model using presenter
      const pageModel = buildHomePageModel(req, res);
      
      // Add nonce to page model for EJS template
      pageModel.page.nonce = res.locals.nonce;
      
      // Add Supabase credentials for client initialization
      pageModel.ui = {
        supabaseUrl: config.supabase.url,
        supabaseAnonKey: config.supabase.anonKey,
        csrfToken: res.locals.csrfToken || ''
      };
      
      // Render EJS template with page model
      res.render('index', pageModel);
    } catch (error) {
      logger.error({ event: 'boot.page_error', page: 'home', error: error.message }, 'Home page error');
      res.status(500).render('error', {
        title: 'Home Error',
        message: 'Unable to load home page',
        page: { nonce: res.locals.nonce },
        requestId: req.requestId,
        timestamp: new Date().toISOString()
      });
    }
  });
}

module.exports = { registerRoutes };
