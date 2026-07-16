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
        // This return sends the completed value or response back to the code that called this function.
        return res.status(401).json({
            // I am keeping the `success` field in this object so the receiving code can read that value by its expected name.
            success: false,
            // I am keeping the `message` field in this object so the receiving code can read that value by its expected name.
            message: 'Authentication required',
            // I am keeping the `requestId` field in this object so the receiving code can read that value by its expected name.
            requestId: req.requestId,
            // I am keeping the `timestamp` field in this object so the receiving code can read that value by its expected name.
            timestamp: new Date().toISOString()
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        });
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!requestedUserId) {
        // This return sends the completed value or response back to the code that called this function.
        return res.status(400).json({
            // I am keeping the `success` field in this object so the receiving code can read that value by its expected name.
            success: false,
            // I am keeping the `message` field in this object so the receiving code can read that value by its expected name.
            message: 'User ID parameter missing',
            // I am keeping the `requestId` field in this object so the receiving code can read that value by its expected name.
            requestId: req.requestId,
            // I am keeping the `timestamp` field in this object so the receiving code can read that value by its expected name.
            timestamp: new Date().toISOString()
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        });
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    
    // Check if user is trying to access their own resource
    if (authenticatedUserId === requestedUserId) {
        // User owns this resource - allow access
        return next();
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    
    // OPTIONAL: Allow admins to access any user's resources
    // Uncomment if admin access is needed
    // if (req.user?.user_role === 'admin' || req.user?.user_role === 'ceo') {
    //     return next();
    // }
    
    // Ownership verification failed - deny access
    return res.status(403).json({
        // I am keeping the `success` field in this object so the receiving code can read that value by its expected name.
        success: false,
        // I am keeping the `message` field in this object so the receiving code can read that value by its expected name.
        message: 'Access denied: You can only access your own resources',
        // I am keeping the `requestId` field in this object so the receiving code can read that value by its expected name.
        requestId: req.requestId,
        // I am keeping the `timestamp` field in this object so the receiving code can read that value by its expected name.
        timestamp: new Date().toISOString()
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am exporting this value here so another module can deliberately reuse the completed piece from requireOwner.js.
module.exports = {
    // I am keeping this line here because the surrounding requireOwner.js workflow expects this value or operation before it continues.
    requireOwner
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
};

