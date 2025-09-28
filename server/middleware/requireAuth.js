// File: server/middleware/requireAuth.js
// Description: Authentication middleware for protected routes
// Purpose: Ensures users are authenticated before accessing protected pages
// Notes: Redirects unauthenticated users to home page with login modal

/**
 * Middleware to require authentication for protected routes
 * If user is not authenticated, redirect to home page
 */
function requireAuth(req, res, next) {
    if (req.session && req.session.isAuthenticated) {
        // User is authenticated, proceed to next middleware/route
        next();
    } else {
        // User is not authenticated, redirect to home page
        // The frontend will handle showing login modal
        res.redirect('/?login=true');
    }
}

module.exports = {
    requireAuth
};
