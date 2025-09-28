// File: server/middleware/auth-guard.js
// Description: Authentication guard middleware for protected routes
// Purpose: Ensures only authenticated users can access protected pages and endpoints
// Notes: Redirects unauthenticated users to login or returns 401 for API routes

/**
 * Middleware to protect routes requiring authentication
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 * @param {function} next - Next middleware function
 */
function requireAuth(req, res, next) {
  if (req.session && req.session.isAuthenticated) {
    // User is authenticated, proceed to route
    next();
  } else {
    // User is not authenticated
    if (req.path.startsWith('/api/')) {
      // API route - return 401 JSON response
      res.status(401).json({
        success: false,
        message: 'Authentication required',
        authenticated: false
      });
    } else {
      // Web route - redirect to login page
      res.redirect('/');
    }
  }
}

/**
 * Middleware to check if user is authenticated (for optional auth)
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 * @param {function} next - Next middleware function
 */
function optionalAuth(req, res, next) {
  req.isAuthenticated = req.session && req.session.isAuthenticated;
  next();
}

module.exports = {
  requireAuth,
  optionalAuth
};

