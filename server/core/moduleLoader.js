// File: server/core/moduleLoader.js
// Description: Safe module loading with error isolation
// Purpose: Prevents one module failure from crashing the entire application
// Notes: Each module is loaded in isolation with proper error handling

const logger = require('../utils/logger');

/**
 * WHAT:
 * We provide safe module loading that isolates failures and prevents
 * one broken module from crashing the entire application.
 *
 * WHY:
 * If one module fails to load, the rest of the application should
 * continue to work. This makes the system more resilient.
 *
 * HOW:
 * We wrap each module load in try-catch blocks and provide fallback
 * behavior when modules fail to load.
 */

/**
 * Safe module loader with error isolation
 * @param {string} modulePath - Path to the module to load
 * @param {string} moduleName - Human-readable name for logging
 * @param {*} fallback - Fallback value if module fails to load
 * @returns {Object} Result with success status and module or fallback
 */
function safeLoadModule(modulePath, moduleName, fallback = null) {
  try {
    const module = require(modulePath);
    logger.info({
      event: 'module.loaded',
      moduleName
    }, `Module loaded: ${moduleName}`);
    return {
      success: true,
      module: module,
      error: null
    };
  } catch (error) {
    logger.error({
      event: 'module.load_failed',
      moduleName,
      modulePath,
      error: error.message
    }, `Module failed to load: ${moduleName}`);
    
    return {
      success: false,
      module: fallback,
      error: error.message
    };
  }
}

/**
 * Load multiple modules safely
 * @param {Array} modules - Array of {path, name, fallback} objects
 * @returns {Object} Results for each module
 */
function safeLoadModules(modules) {
  const results = {};
  
  modules.forEach(({ path, name, fallback, key }) => {
    const result = safeLoadModule(path, name, fallback);
    results[key] = result;
  });
  
  return results;
}

/**
 * Load core modules with error isolation
 * @returns {Object} Loaded modules with error status
 */
function loadCoreModules() {
  console.log('Loading core modules with error isolation...');
  
  const modules = [
    {
      path: '../config',
      name: 'Configuration',
      fallback: { config: {}, logConfigSummary: () => {} },
      key: 'config'
    },
    {
      path: '../db/connection',
      name: 'Database Connection',
      fallback: { testConnection: () => Promise.resolve(false) },
      key: 'database'
    },
    {
      path: '../middleware/csrf',
      name: 'CSRF Middleware',
      fallback: { addCSRFToken: () => {}, validateCSRF: () => (req, res, next) => next() },
      key: 'csrf'
    },
    {
      path: '../middleware/requestId',
      name: 'Request ID Middleware',
      fallback: () => (req, res, next) => next(),
      key: 'requestId'
    },
    {
      path: '../utils/logger',
      name: 'Logger',
      fallback: { info: () => {}, error: () => {}, warn: () => {} },
      key: 'logger'
    },
    {
      path: '../utils/consoleLogger',
      name: 'Console Logger',
      fallback: { formatConfigSummary: () => {}, formatMiddlewareRegistration: () => {} },
      key: 'consoleLogger'
    }
  ];
  
  return safeLoadModules(modules);
}

/**
 * Load route modules with error isolation
 * @returns {Object} Loaded route modules
 */
function loadRouteModules() {
  console.log('Loading route modules with error isolation...');
  
  const modules = [
    {
      path: './routes/health',
      name: 'Health Routes',
      fallback: null,
      key: 'health'
    },
    {
      path: './routes/auth',
      name: 'Auth Routes',
      fallback: null,
      key: 'auth'
    },
    {
      path: './routes/submissions',
      name: 'Submissions Routes',
      fallback: null,
      key: 'submissions'
    },
    {
      path: './routes/dashboard',
      name: 'Dashboard Routes',
      fallback: null,
      key: 'dashboard'
    },
    {
      path: './routes/users',
      name: 'Users Routes',
      fallback: null,
      key: 'users'
    },
    {
      path: './routes/pageApi',
      name: 'Page API Routes',
      fallback: null,
      key: 'pageApi'
    }
  ];
  
  return safeLoadModules(modules);
}

/**
 * Load middleware modules with error isolation
 * @returns {Object} Loaded middleware modules
 */
function loadMiddlewareModules() {
  console.log('Loading middleware modules with error isolation...');
  
  const modules = [
    {
      path: './middleware/security',
      name: 'Security Middleware',
      fallback: { getClientIP: () => 'unknown' },
      key: 'security'
    },
    {
      path: './middleware/requireAuth',
      name: 'Auth Middleware',
      fallback: () => (req, res, next) => next(),
      key: 'requireAuth'
    }
  ];
  
  return safeLoadModules(modules);
}

/**
 * Check if critical modules loaded successfully
 * @param {Object} moduleResults - Results from module loading
 * @returns {boolean} True if all critical modules loaded
 */
function checkCriticalModules(moduleResults) {
  const criticalModules = ['config', 'database', 'csrf', 'requestId'];
  const failedModules = criticalModules.filter(key => !moduleResults[key]?.success);
  
  if (failedModules.length > 0) {
    console.error('Critical modules failed to load:', failedModules);
    return false;
  }
  
  return true;
}

/**
 * Report module loading status
 * @param {Object} moduleResults - Results from module loading
 */
function reportModuleStatus(moduleResults) {
  const total = Object.keys(moduleResults).length;
  const successful = Object.values(moduleResults).filter(r => r.success).length;
  const failed = total - successful;
  
  console.log(`Module loading complete: ${successful}/${total} successful, ${failed} failed`);
  
  if (failed > 0) {
    console.log('Failed modules:');
    Object.entries(moduleResults).forEach(([key, result]) => {
      if (!result.success) {
        console.log(`  - ${key}: ${result.error}`);
      }
    });
  }
}

module.exports = {
  safeLoadModule,
  safeLoadModules,
  loadCoreModules,
  loadRouteModules,
  loadMiddlewareModules,
  checkCriticalModules,
  reportModuleStatus
};
