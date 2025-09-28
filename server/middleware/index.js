// File: server/middleware/index.js
// Description: Centralized middleware exports and configuration
// Purpose: Provides a single entry point for all middleware modules following big tech best practices
// Notes: Exports all middleware with consistent naming and configuration

/**
 * WHAT:
 * We centralize all middleware exports and configurations in a single index file.
 * This follows big tech company patterns for modular, maintainable architecture.
 *
 * WHY:
 * Big tech companies use centralized middleware management for better organization,
 * easier testing, consistent configuration, and simplified imports.
 * This pattern improves code maintainability and reduces coupling.
 *
 * HOW:
 * We export all middleware modules with consistent naming and provide
 * configuration functions that can be reused across the application.
 */

// Authentication and Authorization Middleware
const { verifyLogin } = require('./auth');
const { verifyPassword, createPasswordHash } = require('./password');
const { requireAuth } = require('./requireAuth');
const { authGuard } = require('./auth-guard');

// Security Middleware
const { 
    validateEmailServerSide, 
    validatePasswordServerSide,
    validateTextServerSide,
    createAuthRateLimit,
    checkAccountLockout,
    recordFailedAttempt,
    clearFailedAttempts,
    generateSecureCode,
    verifySecureCode,
    getClientIP
} = require('./security');

const { 
    generateCSRFToken,
    validateCSRFToken,
    addCSRFToken,
    validateCSRF
} = require('./csrf');

// Validation Middleware
const {
    validateEmail,
    validatePhone,
    validateDate,
    validateGender,
    validateState,
    validateCountry,
    validateZipCode,
    validateProfile
} = require('./validation');

// Rate Limiting Middleware
const {
    createRateLimit,
    getRateLimitStats,
    clearRateLimitForIP,
    clearAllRateLimits
} = require('./rateLimiting');

/**
 * Configure and return all security middleware
 * @param {object} config - Application configuration
 * @returns {object} Configured security middleware
 */
function configureSecurityMiddleware(config) {
    return {
        authRateLimit: createAuthRateLimit(),
        csrf: {
            addToken: addCSRFToken,
            validate: validateCSRF
        },
        validation: {
            email: validateEmailServerSide,
            password: validatePasswordServerSide,
            text: validateTextServerSide
        },
        clientIP: getClientIP
    };
}

/**
 * Configure and return all authentication middleware
 * @param {object} db - Database connection (optional)
 * @returns {object} Configured authentication middleware
 */
function configureAuthMiddleware(db) {
    return {
        verifyLogin: (email, password, clientIP) => verifyLogin(email, password, clientIP),
        verifyPassword,
        createPasswordHash,
        requireAuth: db ? requireAuth(db) : requireAuth,
        authGuard: db ? authGuard(db) : authGuard
    };
}

/**
 * Configure and return all validation middleware
 * @returns {object} Validation middleware functions
 */
function configureValidationMiddleware() {
    return {
        profile: validateProfile,
        email: validateEmail,
        phone: validatePhone,
        date: validateDate,
        gender: validateGender,
        state: validateState,
        country: validateCountry,
        zipCode: validateZipCode
    };
}

// Export all middleware modules
module.exports = {
    // Individual middleware exports (for direct use)
    auth: {
        verifyLogin,
        verifyPassword,
        createPasswordHash,
        requireAuth,
        authGuard
    },
    
    security: {
        validateEmailServerSide,
        validatePasswordServerSide,
        validateTextServerSide,
        createAuthRateLimit,
        checkAccountLockout,
        recordFailedAttempt,
        clearFailedAttempts,
        generateSecureCode,
        verifySecureCode,
        getClientIP
    },
    
    csrf: {
        generateCSRFToken,
        validateCSRFToken,
        addCSRFToken,
        validateCSRF
    },
    
    validation: {
        validateEmail,
        validatePhone,
        validateDate,
        validateGender,
        validateState,
        validateCountry,
        validateZipCode,
        validateProfile
    },
    
    rateLimiting: {
        createRateLimit,
        getRateLimitStats,
        clearRateLimitForIP,
        clearAllRateLimits
    },
    
    // Configuration functions (big tech pattern)
    configureSecurityMiddleware,
    configureAuthMiddleware,
    configureValidationMiddleware
};