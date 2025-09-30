// File: server/middleware/requireAuth.js
// Description: Blocks access if user is not authenticated. Supports both stateless and session-based auth.
// Purpose: Ensures users are authenticated before accessing protected pages
// Notes: Checks both req.user (stateless) and req.session (backward compatibility)

/**
 * WHAT:
 * We check if user is authenticated via either stateless tokens or session.
 * 
 * WHY:
 * We need to protect routes that require authentication while supporting
 * both new stateless auth and existing session-based auth.
 * 
 * HOW:
 * We check both req.user.id (stateless) and req.session.isAuthenticated (session).
 */
function requireAuth(req, res, next) {
    // Check stateless authentication first (req.user from authBridge)
    if (req.user?.id) {
        return next();
    }
    
    // Fallback to session-based authentication for backward compatibility
    if (req.session?.isAuthenticated) {
        return next();
    }
    
    // No valid authentication found
    return res.status(401).send('Unauthorized');
}

module.exports = {
    requireAuth
};
