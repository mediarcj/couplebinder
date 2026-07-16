// Description: Central place to register all Express routes for the app
// Purpose: Separates route registration from main server boot file
// Notes: All routes are registered here with appropriate middleware and error handling

const logger = require('../utils/logger');

function registerRoutes({ app, config, toggles, requireAuth }) {
  // 1. Load page presenters with safe fallbacks so a presentation import cannot stop boot.
  // 2. Mount specific API and dashboard routers before broader catch-all routers.
  // 3. Register public pages and late root-level helpers after protected application routes.
  // Presenters (used by page routes)
  // Load early so page handlers have stable dependencies.
  let buildHomePageModel;
  let buildLoginPageModel;
  let buildRegisterPageModel;

  try {
    // These builders shape EJS data for the public home, login, and register pages below.
    const presentersModule = require('../ui_contract/presenters');
    buildHomePageModel = presentersModule.buildHomePageModel;
    buildLoginPageModel = presentersModule.buildLoginPageModel;
    buildRegisterPageModel = presentersModule.buildRegisterPageModel;

    logger.info({ event: 'boot.module_loaded', module: 'presenters' }, 'Presenters module loaded successfully');
  } catch (error) {
    logger.error(
      { event: 'boot.module_load_failed', module: 'presenters', error: error.message },
      'Failed to load presenters module'
    );

    // Safe fallbacks so boot never crashes due to presenters.
    // Keep nonce/CSRF-shaped fields present so the error pages still satisfy their templates.
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

  // API routes (generally: mount /api/* before any /api catch-all)

  try {
    const profileRouter = require('../routes/profile');
    // requireAuth verifies identity before profile.js reaches profileSyncService.
    app.use('/api/profile', requireAuth, profileRouter);
    logger.info({ event: 'boot.route_loaded', route: 'profile' }, 'Profile API routes loaded successfully');
  } catch (error) {
    logger.error(
      { event: 'boot.route_load_failed', route: 'profile', error: error.message },
      'Failed to load profile API routes'
    );
  }

  try {
    // HttpOnly cookie management (set/clear)
    // authCookie performs its own public login/logout checks because callers begin unauthenticated.
    app.use('/auth', require('../routes/authCookie'));
    logger.info({ event: 'boot.route_loaded', route: 'authCookie' }, 'Auth cookie routes loaded successfully');
  } catch (error) {
    logger.error(
      { event: 'boot.route_load_failed', route: 'authCookie', error: error.message },
      'Failed to load auth cookie routes'
    );
  }

  try {
    app.use('/api/auth', require('../routes/auth'));
    logger.info({ event: 'boot.route_loaded', route: 'auth' }, 'Auth API routes loaded successfully');
  } catch (error) {
    logger.error(
      { event: 'boot.route_load_failed', route: 'auth', error: error.message },
      'Failed to load auth API routes'
    );
  }

  // Debug route (enabled via config; treat as dangerous in production)
  if (config?.auth?.debug) {
    // Central config is the only gate that makes these diagnostic endpoints reachable.
    try {
      app.use('/api/auth', require('../routes/authDebug'));
      logger.info({ event: 'boot.route_loaded', route: 'authDebug' }, 'Auth debug routes loaded (auth.debug=true)');
    } catch (error) {
      logger.error(
        { event: 'boot.route_load_failed', route: 'authDebug', error: error.message },
        'Failed to load auth debug routes'
      );
    }
  }

  try {
    app.use('/api/admin', requireAuth, require('../routes/admin'));
    logger.info({ event: 'boot.route_loaded', route: 'admin' }, 'Admin API routes loaded successfully');
  } catch (error) {
    logger.error(
      { event: 'boot.route_load_failed', route: 'admin', error: error.message },
      'Failed to load admin API routes'
    );
  }

  try {
    app.use('/api/users', requireAuth, require('../routes/users'));
    logger.info({ event: 'boot.route_loaded', route: 'users' }, 'Users API routes loaded successfully');
  } catch (error) {
    logger.error(
      { event: 'boot.route_load_failed', route: 'users', error: error.message },
      'Failed to load users API routes'
    );
  }

  try {
    app.use('/api/page', requireAuth, require('../routes/pageApi'));
    logger.info({ event: 'boot.route_loaded', route: 'pageApi' }, 'Page API routes loaded successfully');
  } catch (error) {
    logger.error(
      { event: 'boot.route_load_failed', route: 'pageApi', error: error.message },
      'Failed to load page API routes'
    );
  }

  let submissionsRouter = null;
  try {
    // Keep the module reference so its storage initializer can run after all mounts finish.
    submissionsRouter = require('../routes/submissions');
    app.use('/api/submit', submissionsRouter);
    logger.info({ event: 'boot.route_loaded', route: 'submissions' }, 'Submissions API routes loaded successfully');
  } catch (error) {
    logger.error(
      { event: 'boot.route_load_failed', route: 'submissions', error: error.message },
      'Failed to load submissions API routes'
    );
  }

  try {
    app.use('/api/pay', requireAuth, require('../routes/payments'));
    logger.info({ event: 'boot.route_loaded', route: 'payments' }, 'Payments API routes loaded successfully');
  } catch (error) {
    logger.error(
      { event: 'boot.route_load_failed', route: 'payments', error: error.message },
      'Failed to load payments API routes'
    );
  }

  // Catch-all API router should come after specific /api/* mounts
  try {
    // Express checks mounts in order, so this general router must not shadow a specific API.
    app.use('/api', require('../routes/api'));
    logger.info({ event: 'boot.route_loaded', route: 'api' }, 'General API routes loaded successfully');
  } catch (error) {
    logger.error(
      { event: 'boot.route_load_failed', route: 'api', error: error.message },
      'Failed to load general API routes'
    );
  }

  // Non-API / page routers (specific first, general later)

  try {
    app.use('/account', requireAuth, require('../routes/account'));
    logger.info({ event: 'boot.route_loaded', route: 'account' }, 'Account routes loaded successfully');
  } catch (error) {
    logger.error(
      { event: 'boot.route_load_failed', route: 'account', error: error.message },
      'Failed to load account routes'
    );
  }

  // Toggle-based debug routes
  if (toggles?.exposeDebugRoutes) {
    // This separate feature toggle protects non-auth debug pages outside the auth router.
    try {
      app.use('/_debug', require('../routes/debug'));
      logger.info({ event: 'boot.route_loaded', route: 'debug' }, 'Toggle: Debug routes enabled (/_debug)');
    } catch (error) {
      logger.error(
        { event: 'boot.route_load_failed', route: 'debug', error: error.message },
        'Failed to load debug routes'
      );
    }
  }

  // Mount billing before /dashboard (avoid /dashboard swallowing it)
  try {
    // Billing routes call billingService and require a verified user at this mount boundary.
    app.use('/dashboard/billing', requireAuth, require('../routes/dashboard-billing'));
    logger.info({ event: 'boot.route_loaded', route: 'dashboard-billing' }, 'Billing dashboard route loaded');
  } catch (e) {
    logger.error(
      { event: 'boot.route_load_failed', route: 'dashboard-billing', error: e.message },
      'Failed to load /dashboard/billing'
    );
  }

  // Mount binder before /dashboard (avoid /dashboard swallowing it)
  try {
    const binderRouter = require('../routes/binderRoutes');
    // binderRoutes relies on this shared guard and does not attach another auth middleware.
    app.use('/dashboard/binder', requireAuth, binderRouter);
    logger.info({ event: 'boot.route_loaded', route: 'binder' }, 'Binder routes loaded successfully');
  } catch (error) {
    logger.error(
      { event: 'boot.route_load_failed', route: 'binder', error: error.message },
      'Failed to load binder routes'
    );
  }

  // General dashboard router last among /dashboard*
  try {
    // This router now receives only dashboard paths not already handled by billing/binder.
    app.use('/dashboard', requireAuth, require('../routes/dashboard'));
    logger.info({ event: 'boot.route_loaded', route: 'dashboard' }, 'Dashboard routes loaded successfully');
  } catch (error) {
    logger.error(
      { event: 'boot.route_load_failed', route: 'dashboard', error: error.message },
      'Failed to load dashboard routes'
    );
  }

  // Page routes (public)

  app.get('/login', (req, res) => {
    try {
      // A browser with an existing verified user has no reason to render the login form again.
      if (req.user?.id) return res.redirect('/dashboard');

      // Merge request-local CSP/CSRF values into the presenter model used by login.ejs.
      const pageModel = buildLoginPageModel(req, res);
      pageModel.page = pageModel.page || {};
      pageModel.ui = pageModel.ui || {};

      pageModel.page.nonce = res.locals.nonce || pageModel.page.nonce || '';
      if (typeof pageModel.ui.csrfToken !== 'string' || !pageModel.ui.csrfToken) {
        pageModel.ui.csrfToken = res.locals.csrfToken || '';
      }

      res.render('login', pageModel);
    } catch (error) {
      logger.error({ event: 'boot.page_error', page: 'login', error: error.message }, 'Login page error');
      res.status(500).render('error', {
        title: 'Login Error',
        message: 'Unable to load login page',
        page: { nonce: res.locals.nonce || '' }
      });
    }
  });

  app.get('/register', (req, res) => {
    try {
      // Match login behavior so authenticated users stay inside the dashboard flow.
      if (req.user?.id) return res.redirect('/dashboard');

      // The presenter supplies content while middleware locals supply this request's tokens.
      const pageModel = buildRegisterPageModel(req, res);
      pageModel.page = pageModel.page || {};
      pageModel.ui = pageModel.ui || {};

      pageModel.page.nonce = res.locals.nonce || pageModel.page.nonce || '';
      if (typeof pageModel.ui.csrfToken !== 'string' || !pageModel.ui.csrfToken) {
        pageModel.ui.csrfToken = res.locals.csrfToken || '';
      }

      res.render('register', pageModel);
    } catch (error) {
      logger.error({ event: 'boot.page_error', page: 'register', error: error.message }, 'Register page error');
      res.status(500).render('error', {
        title: 'Register Error',
        message: 'Unable to load register page',
        page: { nonce: res.locals.nonce || '' }
      });
    }
  });

  app.get('/', (req, res) => {
    try {
      // The public home page still receives CSP, Supabase browser config, and CSRF state.
      const pageModel = buildHomePageModel(req, res);
      pageModel.page = pageModel.page || {};
      pageModel.ui = pageModel.ui || {};

      pageModel.page.nonce = res.locals.nonce || pageModel.page.nonce || '';

      // Merge, don’t overwrite presenter-provided UI fields
      // Browser clients read these public values; server-only service credentials never enter the model.
      pageModel.ui = {
        ...pageModel.ui,
        supabaseUrl: config?.supabase?.url,
        supabaseAnonKey: config?.supabase?.anonKey,
        csrfToken: res.locals.csrfToken || pageModel.ui.csrfToken || ''
      };

      res.render('index', pageModel);
    } catch (error) {
      logger.error({ event: 'boot.page_error', page: 'home', error: error.message }, 'Home page error');
      res.status(500).render('error', {
        title: 'Home Error',
        message: 'Unable to load home page',
        page: { nonce: res.locals.nonce || '' },
        requestId: req.requestId,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Late mounts / initializers

  // Password recovery mounted late because it’s mounted at '/'
  // and should not interfere with other routers.
  try {
    // Its broad mount can now handle only paths left unmatched by the routes registered above.
    app.use('/', require('../routes/passwordRecovery'));
    logger.info({ event: 'boot.route_loaded', route: 'passwordRecovery' }, 'Password recovery routes loaded successfully');
  } catch (error) {
    logger.error(
      { event: 'boot.route_load_failed', route: 'passwordRecovery', error: error.message },
      'Failed to load password recovery routes'
    );
  }

  // Initialize submissions storage (now using database)
  try {
    if (submissionsRouter && typeof submissionsRouter.initSubmissionsStorage === 'function') {
      // Support synchronous or async initialization without delaying the route-registration return.
      const maybe = submissionsRouter.initSubmissionsStorage();
      if (maybe && typeof maybe.then === 'function') {
        // Detached initialization still logs its own rejection instead of becoming unhandled.
        maybe.catch((err) => {
          logger.error(
            { event: 'boot.storage_init_failed', storage: 'submissions', error: err?.message || String(err) },
            'Failed to initialize submissions storage'
          );
        });
      }
      logger.info(
        { event: 'boot.storage_initialized', storage: 'submissions' },
        'Submissions storage initialized successfully (Supabase database)'
      );
    }
  } catch (error) {
    logger.error(
      { event: 'boot.storage_init_failed', storage: 'submissions', error: error.message },
      'Failed to initialize submissions storage'
    );
  }
}

module.exports = { registerRoutes };