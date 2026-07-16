// File: server/bootstrap/routes.js
// Description: Central place to register all Express routes for the app
// Purpose: Separates route registration from main server boot file
// Notes: All routes are registered here with appropriate middleware and error handling

const logger = require('../utils/logger');

// I am keeping `registerRoutes` as a named helper so the surrounding workflow can call this step when it needs it.
function registerRoutes({ app, config, toggles, requireAuth }) {
  // 1. Load page presenters with safe fallbacks so a presentation import cannot stop boot.
  // 2. Mount specific API and dashboard routers before broader catch-all routers.
  // 3. Register public pages and late root-level helpers after protected application routes.
  // ------------------------------------------------------------
  // Presenters (used by page routes)
  // Load early so page handlers have stable dependencies.
  // ------------------------------------------------------------
  let buildHomePageModel;
  // I am saving `buildLoginPageModel` here so the nearby steps can reuse the same value without rebuilding it each time.
  let buildLoginPageModel;
  // I am saving `buildRegisterPageModel` here so the nearby steps can reuse the same value without rebuilding it each time.
  let buildRegisterPageModel;

  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // These builders shape EJS data for the public home, login, and register pages below.
    const presentersModule = require('../ui_contract/presenters');
    // I am keeping this line here because the surrounding routes.js workflow expects this value or operation before it continues.
    buildHomePageModel = presentersModule.buildHomePageModel;
    // I am keeping this line here because the surrounding routes.js workflow expects this value or operation before it continues.
    buildLoginPageModel = presentersModule.buildLoginPageModel;
    // I am keeping this line here because the surrounding routes.js workflow expects this value or operation before it continues.
    buildRegisterPageModel = presentersModule.buildRegisterPageModel;

    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.info({ event: 'boot.module_loaded', module: 'presenters' }, 'Presenters module loaded successfully');
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (error) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.error(
      // I am keeping this line here because the surrounding routes.js workflow expects this value or operation before it continues.
      { event: 'boot.module_load_failed', module: 'presenters', error: error.message },
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      'Failed to load presenters module'
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    );

    // Safe fallbacks so boot never crashes due to presenters.
    // Keep nonce/CSRF-shaped fields present so the error pages still satisfy their templates.
    buildHomePageModel = () => ({
      // I am keeping the `page` field in this object so the receiving code can read that value by its expected name.
      page: { title: 'Error', description: 'Service unavailable', nonce: '' },
      // I am keeping the `ui` field in this object so the receiving code can read that value by its expected name.
      ui: { csrfToken: '', turnstile: { enabled: false } }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
    // I am keeping this line here because the surrounding routes.js workflow expects this value or operation before it continues.
    buildLoginPageModel = () => ({
      // I am keeping the `page` field in this object so the receiving code can read that value by its expected name.
      page: { title: 'Login', nonce: '' },
      // I am keeping the `ui` field in this object so the receiving code can read that value by its expected name.
      ui: { csrfToken: '', turnstile: { enabled: false } }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
    // I am keeping this line here because the surrounding routes.js workflow expects this value or operation before it continues.
    buildRegisterPageModel = () => ({
      // I am keeping the `page` field in this object so the receiving code can read that value by its expected name.
      page: { title: 'Register', nonce: '' },
      // I am keeping the `ui` field in this object so the receiving code can read that value by its expected name.
      ui: { csrfToken: '', turnstile: { enabled: false } }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // ------------------------------------------------------------
  // API routes (generally: mount /api/* before any /api catch-all)
  // ------------------------------------------------------------

  try {
    // I am loading `../routes/profile` into `profileRouter` so this file can reuse that dependency below.
    const profileRouter = require('../routes/profile');
    // requireAuth verifies identity before profile.js reaches profileSyncService.
    app.use('/api/profile', requireAuth, profileRouter);
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.info({ event: 'boot.route_loaded', route: 'profile' }, 'Profile API routes loaded successfully');
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (error) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.error(
      // I am keeping this line here because the surrounding routes.js workflow expects this value or operation before it continues.
      { event: 'boot.route_load_failed', route: 'profile', error: error.message },
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      'Failed to load profile API routes'
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    );
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // HttpOnly cookie management (set/clear)
    // authCookie performs its own public login/logout checks because callers begin unauthenticated.
    app.use('/auth', require('../routes/authCookie'));
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.info({ event: 'boot.route_loaded', route: 'authCookie' }, 'Auth cookie routes loaded successfully');
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (error) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.error(
      // I am keeping this line here because the surrounding routes.js workflow expects this value or operation before it continues.
      { event: 'boot.route_load_failed', route: 'authCookie', error: error.message },
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      'Failed to load auth cookie routes'
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    );
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // I am attaching this middleware or router here so matching requests pass through it in the existing Express order.
    app.use('/api/auth', require('../routes/auth'));
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.info({ event: 'boot.route_loaded', route: 'auth' }, 'Auth API routes loaded successfully');
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (error) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.error(
      // I am keeping this line here because the surrounding routes.js workflow expects this value or operation before it continues.
      { event: 'boot.route_load_failed', route: 'auth', error: error.message },
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      'Failed to load auth API routes'
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    );
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // Debug route (enabled via config; treat as dangerous in production)
  if (config?.auth?.debug) {
    // Central config is the only gate that makes these diagnostic endpoints reachable.
    try {
      // I am attaching this middleware or router here so matching requests pass through it in the existing Express order.
      app.use('/api/auth', require('../routes/authDebug'));
      // I am calling this helper here so the current workflow performs this step before it moves on.
      logger.info({ event: 'boot.route_loaded', route: 'authDebug' }, 'Auth debug routes loaded (auth.debug=true)');
    // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
    } catch (error) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      logger.error(
        // I am keeping this line here because the surrounding routes.js workflow expects this value or operation before it continues.
        { event: 'boot.route_load_failed', route: 'authDebug', error: error.message },
        // I am listing this entry here because the surrounding collection processes each allowed value in order.
        'Failed to load auth debug routes'
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      );
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // I am attaching this middleware or router here so matching requests pass through it in the existing Express order.
    app.use('/api/admin', requireAuth, require('../routes/admin'));
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.info({ event: 'boot.route_loaded', route: 'admin' }, 'Admin API routes loaded successfully');
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (error) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.error(
      // I am keeping this line here because the surrounding routes.js workflow expects this value or operation before it continues.
      { event: 'boot.route_load_failed', route: 'admin', error: error.message },
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      'Failed to load admin API routes'
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    );
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // I am attaching this middleware or router here so matching requests pass through it in the existing Express order.
    app.use('/api/users', requireAuth, require('../routes/users'));
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.info({ event: 'boot.route_loaded', route: 'users' }, 'Users API routes loaded successfully');
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (error) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.error(
      // I am keeping this line here because the surrounding routes.js workflow expects this value or operation before it continues.
      { event: 'boot.route_load_failed', route: 'users', error: error.message },
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      'Failed to load users API routes'
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    );
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // I am attaching this middleware or router here so matching requests pass through it in the existing Express order.
    app.use('/api/page', requireAuth, require('../routes/pageApi'));
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.info({ event: 'boot.route_loaded', route: 'pageApi' }, 'Page API routes loaded successfully');
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (error) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.error(
      // I am keeping this line here because the surrounding routes.js workflow expects this value or operation before it continues.
      { event: 'boot.route_load_failed', route: 'pageApi', error: error.message },
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      'Failed to load page API routes'
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    );
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am saving `submissionsRouter` here so the nearby steps can reuse the same value without rebuilding it each time.
  let submissionsRouter = null;
  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // Keep the module reference so its storage initializer can run after all mounts finish.
    submissionsRouter = require('../routes/submissions');
    // I am attaching this middleware or router here so matching requests pass through it in the existing Express order.
    app.use('/api/submit', submissionsRouter);
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.info({ event: 'boot.route_loaded', route: 'submissions' }, 'Submissions API routes loaded successfully');
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (error) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.error(
      // I am keeping this line here because the surrounding routes.js workflow expects this value or operation before it continues.
      { event: 'boot.route_load_failed', route: 'submissions', error: error.message },
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      'Failed to load submissions API routes'
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    );
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // I am attaching this middleware or router here so matching requests pass through it in the existing Express order.
    app.use('/api/pay', requireAuth, require('../routes/payments'));
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.info({ event: 'boot.route_loaded', route: 'payments' }, 'Payments API routes loaded successfully');
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (error) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.error(
      // I am keeping this line here because the surrounding routes.js workflow expects this value or operation before it continues.
      { event: 'boot.route_load_failed', route: 'payments', error: error.message },
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      'Failed to load payments API routes'
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    );
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // Catch-all API router should come after specific /api/* mounts
  try {
    // Express checks mounts in order, so this general router must not shadow a specific API.
    app.use('/api', require('../routes/api'));
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.info({ event: 'boot.route_loaded', route: 'api' }, 'General API routes loaded successfully');
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (error) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.error(
      // I am keeping this line here because the surrounding routes.js workflow expects this value or operation before it continues.
      { event: 'boot.route_load_failed', route: 'api', error: error.message },
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      'Failed to load general API routes'
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    );
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // ------------------------------------------------------------
  // Non-API / page routers (specific first, general later)
  // ------------------------------------------------------------

  try {
    // I am attaching this middleware or router here so matching requests pass through it in the existing Express order.
    app.use('/account', requireAuth, require('../routes/account'));
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.info({ event: 'boot.route_loaded', route: 'account' }, 'Account routes loaded successfully');
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (error) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.error(
      // I am keeping this line here because the surrounding routes.js workflow expects this value or operation before it continues.
      { event: 'boot.route_load_failed', route: 'account', error: error.message },
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      'Failed to load account routes'
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    );
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // Toggle-based debug routes
  if (toggles?.exposeDebugRoutes) {
    // This separate feature toggle protects non-auth debug pages outside the auth router.
    try {
      // I am attaching this middleware or router here so matching requests pass through it in the existing Express order.
      app.use('/_debug', require('../routes/debug'));
      // I am calling this helper here so the current workflow performs this step before it moves on.
      logger.info({ event: 'boot.route_loaded', route: 'debug' }, 'Toggle: Debug routes enabled (/_debug)');
    // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
    } catch (error) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      logger.error(
        // I am keeping this line here because the surrounding routes.js workflow expects this value or operation before it continues.
        { event: 'boot.route_load_failed', route: 'debug', error: error.message },
        // I am listing this entry here because the surrounding collection processes each allowed value in order.
        'Failed to load debug routes'
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      );
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // Mount billing before /dashboard (avoid /dashboard swallowing it)
  try {
    // Billing routes call billingService and require a verified user at this mount boundary.
    app.use('/dashboard/billing', requireAuth, require('../routes/dashboard-billing'));
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.info({ event: 'boot.route_loaded', route: 'dashboard-billing' }, 'Billing dashboard route loaded');
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (e) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.error(
      // I am keeping this line here because the surrounding routes.js workflow expects this value or operation before it continues.
      { event: 'boot.route_load_failed', route: 'dashboard-billing', error: e.message },
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      'Failed to load /dashboard/billing'
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    );
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // Mount binder before /dashboard (avoid /dashboard swallowing it)
  try {
    // I am loading `../routes/binderRoutes` into `binderRouter` so this file can reuse that dependency below.
    const binderRouter = require('../routes/binderRoutes');
    // binderRoutes relies on this shared guard and does not attach another auth middleware.
    app.use('/dashboard/binder', requireAuth, binderRouter);
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.info({ event: 'boot.route_loaded', route: 'binder' }, 'Binder routes loaded successfully');
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (error) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.error(
      // I am keeping this line here because the surrounding routes.js workflow expects this value or operation before it continues.
      { event: 'boot.route_load_failed', route: 'binder', error: error.message },
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      'Failed to load binder routes'
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    );
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // General dashboard router last among /dashboard*
  try {
    // This router now receives only dashboard paths not already handled by billing/binder.
    app.use('/dashboard', requireAuth, require('../routes/dashboard'));
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.info({ event: 'boot.route_loaded', route: 'dashboard' }, 'Dashboard routes loaded successfully');
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (error) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.error(
      // I am keeping this line here because the surrounding routes.js workflow expects this value or operation before it continues.
      { event: 'boot.route_load_failed', route: 'dashboard', error: error.message },
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      'Failed to load dashboard routes'
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    );
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // ------------------------------------------------------------
  // Page routes (public)
  // ------------------------------------------------------------

  app.get('/login', (req, res) => {
    // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
    try {
      // A browser with an existing verified user has no reason to render the login form again.
      if (req.user?.id) return res.redirect('/dashboard');

      // Merge request-local CSP/CSRF values into the presenter model used by login.ejs.
      const pageModel = buildLoginPageModel(req, res);
      // I am keeping this line here because the surrounding routes.js workflow expects this value or operation before it continues.
      pageModel.page = pageModel.page || {};
      // I am keeping this line here because the surrounding routes.js workflow expects this value or operation before it continues.
      pageModel.ui = pageModel.ui || {};

      // I am keeping this line here because the surrounding routes.js workflow expects this value or operation before it continues.
      pageModel.page.nonce = res.locals.nonce || pageModel.page.nonce || '';
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (typeof pageModel.ui.csrfToken !== 'string' || !pageModel.ui.csrfToken) {
        // I am keeping this line here because the surrounding routes.js workflow expects this value or operation before it continues.
        pageModel.ui.csrfToken = res.locals.csrfToken || '';
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }

      // I am building or sending the Express response here with the status, data, or page already chosen by this route.
      res.render('login', pageModel);
    // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
    } catch (error) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      logger.error({ event: 'boot.page_error', page: 'login', error: error.message }, 'Login page error');
      // I am building or sending the Express response here with the status, data, or page already chosen by this route.
      res.status(500).render('error', {
        // I am keeping the `title` field in this object so the receiving code can read that value by its expected name.
        title: 'Login Error',
        // I am keeping the `message` field in this object so the receiving code can read that value by its expected name.
        message: 'Unable to load login page',
        // I am keeping the `page` field in this object so the receiving code can read that value by its expected name.
        page: { nonce: res.locals.nonce || '' }
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      });
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });

  // This registers the GET `/register` route so Express can send matching requests through the handlers listed here.
  app.get('/register', (req, res) => {
    // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
    try {
      // Match login behavior so authenticated users stay inside the dashboard flow.
      if (req.user?.id) return res.redirect('/dashboard');

      // The presenter supplies content while middleware locals supply this request's tokens.
      const pageModel = buildRegisterPageModel(req, res);
      // I am keeping this line here because the surrounding routes.js workflow expects this value or operation before it continues.
      pageModel.page = pageModel.page || {};
      // I am keeping this line here because the surrounding routes.js workflow expects this value or operation before it continues.
      pageModel.ui = pageModel.ui || {};

      // I am keeping this line here because the surrounding routes.js workflow expects this value or operation before it continues.
      pageModel.page.nonce = res.locals.nonce || pageModel.page.nonce || '';
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (typeof pageModel.ui.csrfToken !== 'string' || !pageModel.ui.csrfToken) {
        // I am keeping this line here because the surrounding routes.js workflow expects this value or operation before it continues.
        pageModel.ui.csrfToken = res.locals.csrfToken || '';
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }

      // I am building or sending the Express response here with the status, data, or page already chosen by this route.
      res.render('register', pageModel);
    // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
    } catch (error) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      logger.error({ event: 'boot.page_error', page: 'register', error: error.message }, 'Register page error');
      // I am building or sending the Express response here with the status, data, or page already chosen by this route.
      res.status(500).render('error', {
        // I am keeping the `title` field in this object so the receiving code can read that value by its expected name.
        title: 'Register Error',
        // I am keeping the `message` field in this object so the receiving code can read that value by its expected name.
        message: 'Unable to load register page',
        // I am keeping the `page` field in this object so the receiving code can read that value by its expected name.
        page: { nonce: res.locals.nonce || '' }
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      });
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });

  // This registers the GET `/` route so Express can send matching requests through the handlers listed here.
  app.get('/', (req, res) => {
    // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
    try {
      // The public home page still receives CSP, Supabase browser config, and CSRF state.
      const pageModel = buildHomePageModel(req, res);
      // I am keeping this line here because the surrounding routes.js workflow expects this value or operation before it continues.
      pageModel.page = pageModel.page || {};
      // I am keeping this line here because the surrounding routes.js workflow expects this value or operation before it continues.
      pageModel.ui = pageModel.ui || {};

      // I am keeping this line here because the surrounding routes.js workflow expects this value or operation before it continues.
      pageModel.page.nonce = res.locals.nonce || pageModel.page.nonce || '';

      // Merge, don’t overwrite presenter-provided UI fields
      // Browser clients read these public values; server-only service credentials never enter the model.
      pageModel.ui = {
        // I am keeping this line here because the surrounding routes.js workflow expects this value or operation before it continues.
        ...pageModel.ui,
        // I am keeping the `supabaseUrl` field in this object so the receiving code can read that value by its expected name.
        supabaseUrl: config?.supabase?.url,
        // I am keeping the `supabaseAnonKey` field in this object so the receiving code can read that value by its expected name.
        supabaseAnonKey: config?.supabase?.anonKey,
        // I am keeping the `csrfToken` field in this object so the receiving code can read that value by its expected name.
        csrfToken: res.locals.csrfToken || pageModel.ui.csrfToken || ''
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      };

      // I am building or sending the Express response here with the status, data, or page already chosen by this route.
      res.render('index', pageModel);
    // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
    } catch (error) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      logger.error({ event: 'boot.page_error', page: 'home', error: error.message }, 'Home page error');
      // I am building or sending the Express response here with the status, data, or page already chosen by this route.
      res.status(500).render('error', {
        // I am keeping the `title` field in this object so the receiving code can read that value by its expected name.
        title: 'Home Error',
        // I am keeping the `message` field in this object so the receiving code can read that value by its expected name.
        message: 'Unable to load home page',
        // I am keeping the `page` field in this object so the receiving code can read that value by its expected name.
        page: { nonce: res.locals.nonce || '' },
        // I am keeping the `requestId` field in this object so the receiving code can read that value by its expected name.
        requestId: req.requestId,
        // I am keeping the `timestamp` field in this object so the receiving code can read that value by its expected name.
        timestamp: new Date().toISOString()
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      });
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });

  // ------------------------------------------------------------
  // Late mounts / initializers
  // ------------------------------------------------------------

  // Password recovery mounted late because it’s mounted at '/'
  // and should not interfere with other routers.
  try {
    // Its broad mount can now handle only paths left unmatched by the routes registered above.
    app.use('/', require('../routes/passwordRecovery'));
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.info({ event: 'boot.route_loaded', route: 'passwordRecovery' }, 'Password recovery routes loaded successfully');
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (error) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.error(
      // I am keeping this line here because the surrounding routes.js workflow expects this value or operation before it continues.
      { event: 'boot.route_load_failed', route: 'passwordRecovery', error: error.message },
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      'Failed to load password recovery routes'
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    );
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // Initialize submissions storage (now using database)
  try {
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (submissionsRouter && typeof submissionsRouter.initSubmissionsStorage === 'function') {
      // Support synchronous or async initialization without delaying the route-registration return.
      const maybe = submissionsRouter.initSubmissionsStorage();
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (maybe && typeof maybe.then === 'function') {
        // Detached initialization still logs its own rejection instead of becoming unhandled.
        maybe.catch((err) => {
          // I am calling this helper here so the current workflow performs this step before it moves on.
          logger.error(
            // I am keeping this line here because the surrounding routes.js workflow expects this value or operation before it continues.
            { event: 'boot.storage_init_failed', storage: 'submissions', error: err?.message || String(err) },
            // I am listing this entry here because the surrounding collection processes each allowed value in order.
            'Failed to initialize submissions storage'
          // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
          );
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        });
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
      // I am calling this helper here so the current workflow performs this step before it moves on.
      logger.info(
        // I am keeping this line here because the surrounding routes.js workflow expects this value or operation before it continues.
        { event: 'boot.storage_initialized', storage: 'submissions' },
        // I am listing this entry here because the surrounding collection processes each allowed value in order.
        'Submissions storage initialized successfully (Supabase database)'
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      );
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (error) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.error(
      // I am keeping this line here because the surrounding routes.js workflow expects this value or operation before it continues.
      { event: 'boot.storage_init_failed', storage: 'submissions', error: error.message },
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      'Failed to initialize submissions storage'
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    );
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am exporting this value here so another module can deliberately reuse the completed piece from routes.js.
module.exports = { registerRoutes };