// File: server/bootstrap/routes.js
// Description: Central place to register all Express routes for the app
// Purpose: Separates route registration from main server boot file
// Notes: All routes are registered here with appropriate middleware and error handling

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
    console.log('Profile API routes loaded successfully');
  } catch (error) {
    console.error('Failed to load profile API routes:', error.message);
  }

  try {
    app.use('/auth', require('../routes/authCookie'));  // HttpOnly cookie management (set/clear)
    console.log('Auth cookie routes loaded successfully');
  } catch (error) {
    console.error('Failed to load auth cookie routes:', error.message);
  }

  try {
    app.use('/api/auth', require('../routes/auth'));
    console.log('Auth API routes loaded successfully');
  } catch (error) {
    console.error('Failed to load auth API routes:', error.message);
  }

  // Debug route (enabled via AUTH_DEBUG=true env var)
  if (config.auth.debug) {
    try {
      app.use('/api/auth', require('../routes/authDebug'));
      console.log('Auth debug routes loaded (AUTH_DEBUG=true)');
    } catch (error) {
      console.error('Failed to load auth debug routes:', error.message);
    }
  }

  try {
    // Admin routes (require admin role)
    app.use('/api/admin', requireAuth, require('../routes/admin'));
    console.log('Admin API routes loaded successfully');
  } catch (error) {
    console.error('Failed to load admin API routes:', error.message);
  }

  try {
    // User routes (require ownership)
    app.use('/api/users', requireAuth, require('../routes/users'));
    console.log('Users API routes loaded successfully');
  } catch (error) {
    console.error('Failed to load users API routes:', error.message);
  }

  try {
    app.use('/api/page', requireAuth, require('../routes/pageApi'));
    console.log('Page API routes loaded successfully');
  } catch (error) {
    console.error('Failed to load page API routes:', error.message);
  }

  let submissionsRouter = null;
  try {
    submissionsRouter = require('../routes/submissions');
    app.use('/api/submit', submissionsRouter);
    console.log('Submissions API routes loaded successfully');
  } catch (error) {
    console.error('Failed to load submissions API routes:', error.message);
  }

  try {
    app.use('/api/pay', requireAuth, require('../routes/payments'));
    console.log('Payments API routes loaded successfully');
  } catch (error) {
    console.error('Failed to load payments API routes:', error.message);
  }

  try {
    app.use('/api', require('../routes/api'));
    console.log('General API routes loaded successfully');
  } catch (error) {
    console.error('Failed to load general API routes:', error.message);
  }

  try {
    app.use('/account', requireAuth, require('../routes/account'));
    console.log('Account routes loaded successfully');
  } catch (error) {
    console.error('Failed to load account routes:', error.message);
  }

  try {
    app.use('/', require('../routes/passwordRecovery'));
    console.log('Password recovery routes loaded successfully');
  } catch (error) {
    console.error('Failed to load password recovery routes:', error.message);
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
      console.log('Toggle: Debug routes enabled (/_debug)');
    } catch (error) {
      console.error('Failed to load debug routes:', error.message);
    }
  }

  try {
    app.use('/dashboard', requireAuth, require('../routes/dashboard'));
    console.log('Dashboard routes loaded successfully');
  } catch (error) {
    console.error('Failed to load dashboard routes:', error.message);
  }

  try {
    app.use('/dashboard/billing', requireAuth, require('../routes/dashboard-billing'));
    console.log('Billing dashboard route loaded');
  } catch (e) {
    console.error('Failed to load /dashboard/billing:', e.message);
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
      console.error('Login page error:', error);
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
      console.error('Register page error:', error);
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
      console.log('Submissions storage initialized successfully (Supabase database)');
    }
  } catch (error) {
    console.error('Failed to initialize submissions storage:', error.message);
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
    console.log('Presenters module loaded successfully');
  } catch (error) {
    console.error('Failed to load presenters module:', error.message);
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
      console.error('Home page error:', error);
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
