// File: server/middleware/requireAuth.js
// Description: Centralized authentication middleware for protected routes
// Purpose: Single security gate that handles both API and page authentication
// Notes: Uses req.user from authBridge middleware (Supabase token verification)

const { respondError } = require('../utils/errorResponder');
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
    if (!nextUrl || typeof nextUrl !== 'string') {
        return null;
    }
    
    // Remove leading slash for easier checking
    const cleanUrl = nextUrl.startsWith('/') ? nextUrl.slice(1) : nextUrl;
    
    // Allow only same-site paths (no protocol, no host, no external domains)
    if (cleanUrl.includes('://') || cleanUrl.includes('//') || cleanUrl.includes('@')) {
        return null;
    }
    
    // Allow only safe characters (alphanumeric, slash, dash, underscore, dot, question mark, equals, ampersand)
    if (!/^[a-zA-Z0-9\/\-_.?=&]*$/.test(cleanUrl)) {
        return null;
    }
    
    // Prevent directory traversal attempts
    if (cleanUrl.includes('..') || cleanUrl.includes('~')) {
        return null;
    }
    
    // Return with leading slash
    return '/' + cleanUrl;
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
        return next();
    }
    
    // Determine if this is an API call or page request
    // Use originalUrl for API detection since path gets stripped by Express route matching
    const isApiCall = req.originalUrl.startsWith('/api/') || req.originalUrl.startsWith('/auth/');
    
    if (isApiCall) {
        // API calls get JSON response via centralized error responder
        return respondError(req, res, {
            status: 401,
            message: 'Authentication required',
            code: 'auth_required'
        });
    } else {
        // Page requests: check if this is an expired session vs never-authenticated
        const expired = isLikelyExpiredSession(req);
        const nextUrl = safeNext(req.originalUrl);
        
        if (expired) {
            // Expired session: redirect to login with reason=expired and next param
            const loginUrl = nextUrl 
                ? `/login?reason=expired&next=${encodeURIComponent(nextUrl)}`
                : '/login?reason=expired';
            return res.redirect(302, loginUrl);
        } else {
            // Never authenticated or manual logout: show 401 page (or redirect without reason)
            // For consistency, we redirect to login but without the "expired" reason
            const loginUrl = nextUrl
                ? `/login?next=${encodeURIComponent(nextUrl)}`
                : '/login';
            return res.redirect(302, loginUrl);
        }
    }
}

module.exports = {
    requireAuth,
    safeNext
};
