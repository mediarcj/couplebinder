// File: server/core/errorSandbox.js
// Description: Sandboxed error handling to prevent crashes
// Purpose: Isolates errors and provides graceful degradation
// Notes: Each error is contained and logged without crashing the app

/**
 * WHAT:
 * We provide sandboxed error handling that prevents individual
 * errors from crashing the entire application.
 *
 * WHY:
 * One bad request or module error should not bring down the
 * entire server. We need graceful degradation.
 *
 * HOW:
 * We wrap risky operations in try-catch blocks and provide
 * fallback behavior when things go wrong.
 */

/**
 * Sandbox a function call to prevent crashes
 * @param {Function} fn - Function to execute safely
 * @param {string} context - Context description for logging
 * @param {*} fallback - Fallback value if function fails
 * @returns {*} Function result or fallback
 */
function sandbox(fn, context, fallback = null) {
  try {
    return fn();
  } catch (error) {
    console.error(`Sandbox error in ${context}:`, error.message);
    return fallback;
  }
}

/**
 * Sandbox an async function call
 * @param {Function} fn - Async function to execute safely
 * @param {string} context - Context description for logging
 * @param {*} fallback - Fallback value if function fails
 * @returns {Promise} Function result or fallback
 */
async function sandboxAsync(fn, context, fallback = null) {
  try {
    return await fn();
  } catch (error) {
    console.error(`Sandbox async error in ${context}:`, error.message);
    return fallback;
  }
}

/**
 * Safe route handler wrapper
 * @param {Function} handler - Route handler function
 * @param {string} routeName - Name of the route for logging
 * @returns {Function} Wrapped route handler
 */
function safeRouteHandler(handler, routeName) {
  return async (req, res, next) => {
    try {
      await handler(req, res, next);
    } catch (error) {
      console.error(`Route error in ${routeName}:`, error.message);
      
      // Send error response without crashing
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: 'Internal server error',
          requestId: req.requestId || 'unknown',
          timestamp: new Date().toISOString()
        });
      }
    }
  };
}

/**
 * Safe middleware wrapper
 * @param {Function} middleware - Middleware function
 * @param {string} middlewareName - Name of the middleware for logging
 * @returns {Function} Wrapped middleware
 */
function safeMiddleware(middleware, middlewareName) {
  return (req, res, next) => {
    try {
      middleware(req, res, next);
    } catch (error) {
      console.error(`Middleware error in ${middlewareName}:`, error.message);
      // Continue to next middleware even if this one fails
      next();
    }
  };
}

/**
 * Safe database operation wrapper
 * @param {Function} operation - Database operation function
 * @param {string} operationName - Name of the operation for logging
 * @param {*} fallback - Fallback value if operation fails
 * @returns {Promise} Operation result or fallback
 */
async function safeDatabaseOperation(operation, operationName, fallback = null) {
  try {
    return await operation();
  } catch (error) {
    console.error(`Database error in ${operationName}:`, error.message);
    return fallback;
  }
}

/**
 * Safe external service call wrapper
 * @param {Function} serviceCall - Service call function
 * @param {string} serviceName - Name of the service for logging
 * @param {*} fallback - Fallback value if service call fails
 * @returns {Promise} Service call result or fallback
 */
async function safeServiceCall(serviceCall, serviceName, fallback = null) {
  try {
    return await serviceCall();
  } catch (error) {
    console.error(`Service error in ${serviceName}:`, error.message);
    return fallback;
  }
}

/**
 * Global error handler for uncaught exceptions
 */
function setupGlobalErrorHandlers() {
  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error.message);
    console.error('Stack:', error.stack);
    
    // Don't exit immediately - let the server try to handle it
    console.log('Application will continue running...');
  });
  
  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise);
    console.error('Reason:', reason);
    
    // Don't exit immediately
    console.log('Application will continue running...');
  });
}

/**
 * Create a safe Express app with error handling
 * @param {Object} app - Express app instance
 * @returns {Object} App with safe error handling
 */
function createSafeApp(app) {
  // Global error handler
  app.use((error, req, res, next) => {
    console.error('Express error:', error.message);
    console.error('Stack:', error.stack);
    
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        requestId: req.requestId || 'unknown',
        timestamp: new Date().toISOString()
      });
    }
  });
  
  // 404 handler
  app.use((req, res) => {
    res.status(404).json({
      success: false,
      error: 'Not found',
      requestId: req.requestId || 'unknown',
      timestamp: new Date().toISOString()
    });
  });
  
  return app;
}

module.exports = {
  sandbox,
  sandboxAsync,
  safeRouteHandler,
  safeMiddleware,
  safeDatabaseOperation,
  safeServiceCall,
  setupGlobalErrorHandlers,
  createSafeApp
};
