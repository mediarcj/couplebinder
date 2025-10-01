// File: server/middleware/requireAuth.js
// Description: Blocks access if user is not authenticated. Stateless authentication only.
// Purpose: Ensures users are authenticated before accessing protected pages
// Notes: Uses req.user from authBridge middleware (Supabase token verification)

/**
 * WHAT:
 * We check if user is authenticated via stateless Supabase tokens.
 * 
 * WHY:
 * We need to protect routes that require authentication using stateless tokens.
 * 
 * HOW:
 * We check req.user.id from authBridge middleware which verifies Supabase tokens.
 */
function requireAuth(req, res, next) {
    // Check stateless authentication (req.user from authBridge)
    if (req.user?.id) {
        return next();
    }
    
    // No valid authentication found
    return res.status(401).json({
        success: false,
        message: 'Authentication required'
    });
}

module.exports = {
    requireAuth
};
