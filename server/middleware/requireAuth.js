// File: server/middleware/requireAuth.js
// Description: Centralized authentication middleware for protected routes
// Purpose: Single security gate that handles both API and page authentication
// Notes: Uses req.user from authBridge middleware (Supabase token verification)

const { respondError } = require('../utils/errorResponder');
// I am loading `../lib/authState` into `isLikelyExpiredSession` so this file can reuse that dependency below.
const { isLikelyExpiredSession } = require('../lib/authState');

/**
 * WHAT:
 * We check if user is authenticated via stateless Supabase tokens.
 * 
 * WHY:
 * We need a single source of truth for authentication across all protected routes.
 * 
 * HOW:
 * We check req.user.id from authBridge middleware and handle API vs page requests differently.
 */

/**
 * Safe next URL helper - only allows same-site paths
 * @param {string} nextUrl - The next URL to validate
 * @returns {string|null} - Safe next URL or null if invalid
 */
function safeNext(nextUrl) {
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!nextUrl || typeof nextUrl !== 'string') {
        // This return sends the completed value or response back to the code that called this function.
        return null;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    
    // Remove leading slash for easier checking
    const cleanUrl = nextUrl.startsWith('/') ? nextUrl.slice(1) : nextUrl;
    
    // Allow only same-site paths (no protocol, no host, no external domains)
    if (cleanUrl.includes('://') || cleanUrl.includes('//') || cleanUrl.includes('@')) {
        // This return sends the completed value or response back to the code that called this function.
        return null;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    
    // Allow only safe characters (alphanumeric, slash, dash, underscore, dot, question mark, equals, ampersand)
    if (!/^[a-zA-Z0-9\/\-_.?=&]*$/.test(cleanUrl)) {
        // This return sends the completed value or response back to the code that called this function.
        return null;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    
    // Prevent directory traversal attempts
    if (cleanUrl.includes('..') || cleanUrl.includes('~')) {
        // This return sends the completed value or response back to the code that called this function.
        return null;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    
    // Return with leading slash
    return '/' + cleanUrl;
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * Centralized authentication middleware
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
function requireAuth(req, res, next) {
    // NOTE: OPTIONS requests are handled by the preflight short-circuit in zorvalon.js
    // so they never reach this middleware
    
    // Check stateless authentication (req.user from authBridge)
    if (req.user?.id) {
        // This return sends the completed value or response back to the code that called this function.
        return next();
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    
    // Determine if this is an API call or page request
    // Use originalUrl for API detection since path gets stripped by Express route matching
    const isApiCall = req.originalUrl.startsWith('/api/') || req.originalUrl.startsWith('/auth/');
    
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (isApiCall) {
        // API calls get JSON response via centralized error responder
        return respondError(req, res, {
            // I am keeping the `status` field in this object so the receiving code can read that value by its expected name.
            status: 401,
            // I am keeping the `message` field in this object so the receiving code can read that value by its expected name.
            message: 'Authentication required',
            // I am keeping the `code` field in this object so the receiving code can read that value by its expected name.
            code: 'auth_required'
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        });
    // This alternative runs only when the condition above did not use its first path.
    } else {
        // Page requests: check if this is an expired session vs never-authenticated
        const expired = isLikelyExpiredSession(req);
        // I am saving `nextUrl` here so the nearby steps can reuse the same value without rebuilding it each time.
        const nextUrl = safeNext(req.originalUrl);
        
        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (expired) {
            // Expired session: redirect to login with reason=expired and next param
            const loginUrl = nextUrl 
                // I am keeping this line here because the surrounding requireAuth.js workflow expects this value or operation before it continues.
                ? `/login?reason=expired&next=${encodeURIComponent(nextUrl)}`
                // I am keeping this line here because the surrounding requireAuth.js workflow expects this value or operation before it continues.
                : '/login?reason=expired';
            // This return sends the completed value or response back to the code that called this function.
            return res.redirect(302, loginUrl);
        // This alternative runs only when the condition above did not use its first path.
        } else {
            // Never authenticated or manual logout: show 401 page (or redirect without reason)
            // For consistency, we redirect to login but without the "expired" reason
            const loginUrl = nextUrl
                // I am keeping this line here because the surrounding requireAuth.js workflow expects this value or operation before it continues.
                ? `/login?next=${encodeURIComponent(nextUrl)}`
                // I am keeping this line here because the surrounding requireAuth.js workflow expects this value or operation before it continues.
                : '/login';
            // This return sends the completed value or response back to the code that called this function.
            return res.redirect(302, loginUrl);
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am exporting this value here so another module can deliberately reuse the completed piece from requireAuth.js.
module.exports = {
    // I am keeping this line here because the surrounding requireAuth.js workflow expects this value or operation before it continues.
    requireAuth,
    // I am keeping this line here because the surrounding requireAuth.js workflow expects this value or operation before it continues.
    safeNext
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
};
