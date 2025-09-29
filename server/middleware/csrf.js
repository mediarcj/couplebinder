// File: server/middleware/csrf.js
// Description: CSRF protection middleware
// Purpose: Prevents cross-site request forgery attacks by validating tokens
// Notes: Implements double-submit cookie pattern for stateless CSRF protection

const crypto = require('crypto');
const logger = require('../utils/logger');

/**
 * WHAT:
 * We implement CSRF protection using the double-submit cookie pattern.
 * This prevents attackers from making unauthorized requests on behalf of users.
 *
 * WHY:
 * CSRF attacks can perform actions on behalf of authenticated users without their knowledge.
 * We need to ensure requests originate from our legitimate frontend application.
 *
 * HOW:
 * We generate secure tokens and validate them on state-changing requests.
 * Tokens are bound to user sessions and expire after a configurable time.
 */

// Store for CSRF tokens (in production, use Redis)
const csrfTokens = new Map();
const CSRF_TOKEN_EXPIRY = 60 * 60 * 1000; // 1 hour

/**
 * Generate a secure CSRF token
 * @param {string} sessionId - User session ID
 * @returns {string} CSRF token
 */
function generateCSRFToken(sessionId) {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + CSRF_TOKEN_EXPIRY;
    
    csrfTokens.set(token, {
        sessionId,
        expiresAt,
        createdAt: Date.now()
    });
    
    // Auto-cleanup expired tokens
    setTimeout(() => {
        csrfTokens.delete(token);
    }, CSRF_TOKEN_EXPIRY);
    
    logger.info('CSRF token generated', {
      requestId: 'system'
    });
    return token;
}

/**
 * Validate CSRF token
 * @param {string} token - Token to validate
 * @param {string} sessionId - Expected session ID
 * @returns {object} Validation result
 */
function validateCSRFToken(token, sessionId) {
    if (!token || !sessionId) {
        return {
            valid: false,
            message: 'CSRF token and session ID required'
        };
    }
    
    const tokenData = csrfTokens.get(token);
    
    if (!tokenData) {
        return {
            valid: false,
            message: 'Invalid CSRF token'
        };
    }
    
    // Check expiration
    if (Date.now() > tokenData.expiresAt) {
        csrfTokens.delete(token);
        return {
            valid: false,
            message: 'CSRF token has expired'
        };
    }
    
    // Check session binding
    if (tokenData.sessionId !== sessionId) {
        return {
            valid: false,
            message: 'CSRF token not valid for this session'
        };
    }
    
    return {
        valid: true,
        message: 'CSRF token valid'
    };
}

/**
 * Middleware to add CSRF token to response
 * Adds token to both cookie and response body for double-submit pattern
 */
function addCSRFToken(req, res, next) {
    if (req.session && req.session.isAuthenticated) {
        const token = generateCSRFToken(req.sessionID);
        
        // Set cookie (HttpOnly for security)
        res.cookie('csrf-token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: CSRF_TOKEN_EXPIRY
        });
        
        // Add to response body for JavaScript access
        res.locals.csrfToken = token;
    }
    
    next();
}

/**
 * Middleware to validate CSRF token on state-changing requests
 */
function validateCSRF(req, res, next) {
    // Skip CSRF validation for GET requests
    if (req.method === 'GET') {
        return next();
    }
    
    // Skip if no session (unauthenticated requests)
    if (!req.session || !req.session.isAuthenticated) {
        return next();
    }
    
    // Get token from header or body
    const token = req.headers['x-csrf-token'] || req.body._csrf;
    
    // Validate token
    const validation = validateCSRFToken(token, req.sessionID);
    
    if (!validation.valid) {
        logger.security('csrf_invalid_token', {
            requestId: req.requestId,
            ip: req.ip
        });
        return res.status(403).json({
            success: false,
            message: 'CSRF token validation failed',
            errorType: 'CSRF_ERROR'
        });
    }
    
    logger.info('CSRF token validated', {
        requestId: req.requestId
    });
    next();
}

/**
 * Clean up expired CSRF tokens
 * Should be called periodically in production
 */
function cleanupExpiredTokens() {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [token, data] of csrfTokens.entries()) {
        if (now > data.expiresAt) {
            csrfTokens.delete(token);
            cleaned++;
        }
    }
    
    if (cleaned > 0) {
        logger.info('CSRF tokens cleaned up', {
            requestId: 'system',
            cleanedCount: cleaned
        });
    }
}

// Clean up expired tokens every hour
setInterval(cleanupExpiredTokens, 60 * 60 * 1000);

module.exports = {
    generateCSRFToken,
    validateCSRFToken,
    addCSRFToken,
    validateCSRF
};
