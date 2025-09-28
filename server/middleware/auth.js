// File: server/middleware/auth.js
// Description: Authentication middleware for user login verification
// Purpose: Provides functions to verify user credentials against database
// Notes: Uses existing password and validation middleware for consistency

const { db, safeQuery } = require('../db/connection');
const { verifyPassword } = require('./password');
const { validateEmail } = require('./validation');

/**
 * WHAT:
 * We provide secure user authentication with comprehensive error handling and validation.
 *
 * WHY:
 * Authentication is critical for user security and data protection.
 * We need detailed error handling to prevent information leakage while providing useful feedback.
 *
 * HOW:
 * We validate input, check database connectivity, verify credentials, and return structured responses.
 * All errors are logged with context for security monitoring and debugging.
 */

/**
 * Verify user login credentials with enhanced error handling
 * @param {string} email - User's email address
 * @param {string} password - User's plain text password
 * @returns {Promise<{success: boolean, user?: object, message?: string, errorType?: string}>}
 */
async function verifyLogin(email, password) {
    try {
        // Input validation with detailed error messages
        if (!email || typeof email !== 'string') {
            return { 
                success: false, 
                message: 'Email is required', 
                errorType: 'VALIDATION_ERROR' 
            };
        }

        if (!password || typeof password !== 'string') {
            return { 
                success: false, 
                message: 'Password is required', 
                errorType: 'VALIDATION_ERROR' 
            };
        }

        // Sanitize and validate email format
        const sanitizedEmail = email.trim().toLowerCase();
        if (!validateEmail(sanitizedEmail)) {
            return { 
                success: false, 
                message: 'Invalid email format', 
                errorType: 'VALIDATION_ERROR' 
            };
        }

        // Password length validation
        if (password.length < 8 || password.length > 128) {
            return { 
                success: false, 
                message: 'Invalid email or password', 
                errorType: 'AUTHENTICATION_ERROR' 
            };
        }

        // Database query with error handling
        const userQuery = db('users')
            .select('id', 'email', 'password', 'first_name', 'last_name', 'created_at', 'updated_at', 'user_role')
            .where('email', sanitizedEmail)
            .first();

        const userResult = await safeQuery(userQuery, 'user_lookup');

        if (!userResult.success) {
            console.error('Database error during user lookup:', userResult.error);
            return { 
                success: false, 
                message: 'Authentication service temporarily unavailable', 
                errorType: 'SERVICE_ERROR' 
            };
        }

        const user = userResult.data;
        if (!user) {
            return { 
                success: false, 
                message: 'Invalid email or password', 
                errorType: 'AUTHENTICATION_ERROR' 
            };
        }

        // Verify password with error handling
        let passwordMatch = false;
        try {
            passwordMatch = await verifyPassword(password, user.password);
        } catch (error) {
            console.error('Password verification error:', {
                userId: user.id,
                email: sanitizedEmail,
                error: error.message,
                timestamp: new Date().toISOString()
            });
            return { 
                success: false, 
                message: 'Authentication service temporarily unavailable', 
                errorType: 'SERVICE_ERROR' 
            };
        }

        if (!passwordMatch) {
            return { 
                success: false, 
                message: 'Invalid email or password', 
                errorType: 'AUTHENTICATION_ERROR' 
            };
        }

        // Return user data (without password) with success
        const { password: _, ...userWithoutPassword } = user;
        return { 
            success: true, 
            user: userWithoutPassword,
            message: 'Authentication successful'
        };

    } catch (error) {
        console.error('Login verification error:', {
            message: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString(),
            email: email ? email.substring(0, 3) + '***' : 'unknown'
        });
        
        return { 
            success: false, 
            message: 'Authentication service temporarily unavailable', 
            errorType: 'SYSTEM_ERROR' 
        };
    }
}

/**
 * Validate session and return user information
 * @param {object} session - Express session object
 * @returns {Promise<{success: boolean, user?: object, message?: string}>}
 */
async function validateSession(session) {
    try {
        if (!session || !session.isAuthenticated || !session.userId) {
            return { 
                success: false, 
                message: 'Session not authenticated' 
            };
        }

        const userQuery = db('users')
            .select('id', 'email', 'first_name', 'last_name', 'created_at', 'updated_at', 'user_role')
            .where('id', session.userId)
            .first();

        const userResult = await safeQuery(userQuery, 'session_validation');

        if (!userResult.success) {
            console.error('Database error during session validation:', userResult.error);
            return { 
                success: false, 
                message: 'Session validation failed' 
            };
        }

        const user = userResult.data;
        if (!user) {
            return { 
                success: false, 
                message: 'User not found' 
            };
        }

        return { 
            success: true, 
            user: user 
        };

    } catch (error) {
        console.error('Session validation error:', {
            message: error.message,
            userId: session?.userId,
            timestamp: new Date().toISOString()
        });
        
        return { 
            success: false, 
            message: 'Session validation failed' 
        };
    }
}

module.exports = {
    verifyLogin,
    validateSession
};
