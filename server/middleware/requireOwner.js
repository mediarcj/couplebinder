// File: server/middleware/requireOwner.js
// Description: Ownership verification middleware for user-specific routes
// Purpose: Ensures users can only access their own resources
// Notes: Works with :userId or :id route parameters

/**
 * WHAT:
 * Middleware that verifies the authenticated user owns the resource they are accessing.
 * 
 * WHY:
 * Prevents horizontal privilege escalation where User A tries to access User B's data.
 * Critical for protecting user privacy and data isolation.
 * 
 * HOW:
 * Compares req.user.id (from auth token) with req.params.userId or req.params.id.
 * Blocks request if they don't match unless user is admin.
 */

/**
 * Require ownership middleware
 * Verifies that the authenticated user owns the resource
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 * 
 * Usage:
 *   router.get('/users/:id', requireAuth, requireOwner, handler);
 *   router.get('/profile/:userId', requireAuth, requireOwner, handler);
 */
function requireOwner(req, res, next) {
    // CRITICAL SECTION: Ownership verification
    // Ensures users can only access their own resources
    
    // Get authenticated user ID from token (set by requireAuth middleware)
    const authenticatedUserId = req.user?.id;
    
    // Get requested resource owner ID from route params
    // Support both :userId and :id conventions
    const requestedUserId = req.params.userId || req.params.id;
    
    // Validate both IDs are present
    if (!authenticatedUserId) {
        return res.status(401).json({
            success: false,
            message: 'Authentication required',
            requestId: req.requestId,
            timestamp: new Date().toISOString()
        });
    }
    
    if (!requestedUserId) {
        return res.status(400).json({
            success: false,
            message: 'User ID parameter missing',
            requestId: req.requestId,
            timestamp: new Date().toISOString()
        });
    }
    
    // Check if user is trying to access their own resource
    if (authenticatedUserId === requestedUserId) {
        // User owns this resource - allow access
        return next();
    }
    
    // OPTIONAL: Allow admins to access any user's resources
    // Uncomment if admin access is needed
    // if (req.user?.user_role === 'admin' || req.user?.user_role === 'ceo') {
    //     return next();
    // }
    
    // Ownership verification failed - deny access
    return res.status(403).json({
        success: false,
        message: 'Access denied: You can only access your own resources',
        requestId: req.requestId,
        timestamp: new Date().toISOString()
    });
}

module.exports = {
    requireOwner
};

